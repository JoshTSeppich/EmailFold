# PRD-09 — Local HTTP API: Direct App-to-App Connectivity
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM) + ProspectFold + EmailFold owners
**Priority:** P0 — Replaces clipboard bridge in all prior PRDs
**Supersedes:** Clipboard transport in PRD-01, PRD-02

---

## Problem

PRDs 01 and 02 use the system clipboard as the data transport between apps. This means:
- User must manually switch apps
- User must click "Paste from ProspectFold" or "Paste from EmailFold"
- If the user forgets, data is lost when they copy something else
- No background sync — everything is user-initiated

This is a workaround, not a product. The clipboard was chosen because it's "already proven" — but it caps the experience at "manual + fragile."

**The right model:** ProspectFold and EmailFold should not know or care whether EventFold is open. They finish their work and POST the result to a local endpoint. EventFold receives it, processes it, and notifies the user. Zero user choreography.

---

## Proposed Solution: EventFold as a Local API Server

EventFold (Tauri/Rust) runs a **local-only HTTP server** bound to `127.0.0.1:7777` (loopback only — not accessible from the network or other machines). ProspectFold and EmailFold call this API directly from their Electron renderer process using `fetch()`.

```
ProspectFold → POST http://127.0.0.1:7777/api/intel       → EventFold
EmailFold    → POST http://127.0.0.1:7777/api/email-draft  → EventFold
EventFold    → GET  http://127.0.0.1:7777/api/status       → any app (health check)
```

The user never touches a clipboard. EventFold shows a notification badge when new items arrive.

---

## Architecture

### EventFold: axum HTTP Server in Tauri

Tauri's Rust backend runs an `axum` (or `warp`) HTTP server on a background `tokio` task alongside the main Tauri event loop. Both share `AppState` via `Arc<Mutex<AppState>>`.

```rust
// src/api_server.rs (NEW FILE)

use axum::{Router, routing::post, routing::get, Json, State, extract::Extension};
use std::sync::Arc;
use tokio::sync::RwLock;

pub async fn start_api_server(state: Arc<RwLock<AppState>>) {
    let app = Router::new()
        .route("/api/health", get(health_handler))
        .route("/api/intel", post(import_intel_handler))
        .route("/api/email-draft", post(import_email_draft_handler))
        .route("/api/contact", post(import_contact_handler))
        .layer(Extension(state))
        .layer(
            // Security: reject non-loopback requests + validate token
            axum::middleware::from_fn(auth_middleware)
        );

    let listener = tokio::net::TcpListener::bind("127.0.0.1:7777").await.unwrap();
    axum::serve(listener, app).await.unwrap();
}

// Called from lib.rs, spawned as a Tauri background task:
// tauri::async_runtime::spawn(api_server::start_api_server(app_state.clone()));
```

### Security: Shared Local Token

On EventFold first launch, generate a random 32-byte token and store it in the OS keychain (macOS: Keychain, Windows: Credential Manager) under `foxworks.api_token`. Write the token to a discovery file: `~/.foxworks/api.json`:

```json
{
  "port": 7777,
  "token": "fox_abc123...",
  "version": "1.0"
}
```

ProspectFold and EmailFold read `~/.foxworks/api.json` on startup to get the port + token. All API requests include: `Authorization: Bearer fox_abc123...`. Requests without the token are rejected with 401.

This prevents any other local process from injecting data into EventFold.

### Discovery Protocol

```javascript
// shared utility used by ProspectFold + EmailFold (foxworks-api-client.js)

const fs = require('fs');
const path = require('path');
const os = require('os');

const getEventFoldApi = () => {
  const configPath = path.join(os.homedir(), '.foxworks', 'api.json');
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    return {
      baseUrl: `http://127.0.0.1:${config.port}`,
      token: config.token,
    };
  } catch {
    return null; // EventFold not running or never launched
  }
};

const postToEventFold = async (endpoint, data) => {
  const api = getEventFoldApi();
  if (!api) return { ok: false, reason: 'EventFold not running' };

  try {
    const res = await fetch(`${api.baseUrl}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${api.token}`,
      },
      body: JSON.stringify(data),
    });
    return { ok: res.ok, data: await res.json() };
  } catch (err) {
    return { ok: false, reason: err.message };
  }
};
```

---

## API Endpoints

### `POST /api/intel` — ProspectFold intel import

**Request body:** Full `ProspectIntelV2Payload` (same schema as PRD-01, no change)

```typescript
interface IntelImportRequest {
  source: "prospectfold";
  version: "2";
  payload: ProspectIntelV2Payload;
}
```

**Response:**
```typescript
interface IntelImportResponse {
  ok: true;
  intel_id: string;
  companies_created: number;
  companies_merged: number;
  companies_skipped: number;
  company_ids: string[];
}
```

**EventFold behavior:**
1. Validate token
2. Run `import_prospect_intel` logic (same as PRD-01 — create ProspectIntel aggregate, batch companies, create Notes)
3. For conflicts: **auto-merge if > 95% name match**, create new otherwise (no user prompt for background import)
4. Show Tauri system notification: "ProspectFold: 12 companies imported" with badge count
5. Invalidate frontend query cache via Tauri event: `emit('intel-imported', { intel_id, count })`

---

### `POST /api/email-draft` — EmailFold draft import

**Request body:**
```typescript
interface EmailDraftImportRequest {
  source: "emailfold";
  version: "1";
  company_name: string;
  company_url: string;
  contact_name: string;
  contact_role: string;
  email_goal: string;
  ts: number;
  chosen_angle_index: number;
  research: EmailFoldResearch;
  emails: EmailFoldEmail[];
}
```

**Response:**
```typescript
interface EmailDraftImportResponse {
  ok: true;
  interaction_id: string;
  contact_id: string;
  company_id: string;
  note_id: string;
  task_id: string | null;
  company_created: boolean;
  contact_created: boolean;
}
```

**EventFold behavior:**
1. Validate token
2. Find or create Company (fuzzy match on name/url)
3. Find or create Contact (match on name + company)
4. Create Interaction (type=Email, status=Draft, ai_generated=true)
5. Create Note (research snapshot)
6. Create follow-up Task (T+7) automatically — no user toggle needed in background mode
7. Show Tauri notification: "EmailFold: Draft saved for Acme Corp"
8. Emit Tauri event: `emit('email-draft-imported', { interaction_id, company_name })`

---

### `GET /api/health` — Health check

**Response:**
```json
{ "ok": true, "version": "1.0.0", "uptime_seconds": 3600 }
```

Used by ProspectFold/EmailFold to check if EventFold is running before attempting a push. Shown as a status indicator in both apps.

---

### `GET /api/status` — Rich status for Electron app sidebars

**Response:**
```typescript
interface EventFoldStatus {
  ok: true;
  pending_drafts: number;        // email interactions with status=Draft
  stale_companies: number;       // companies with intel > 30 days old
  open_deals: number;
  recent_imports: Array<{
    type: "intel" | "email_draft";
    company_name: string;
    imported_at: string;
  }>;
}
```

ProspectFold and EmailFold poll this every 30 seconds and show a live EventFold status panel in their sidebars:

```
EventFold CRM  ● Connected
  8 drafts pending
  3 stale companies
  Last import: Acme Corp (2 min ago)
  [Open EventFold]
```

---

## Auto-import Triggers

### ProspectFold: auto-POST on Phase 2 completion

```javascript
// In prospect-crafter.jsx — after Phase 2 completes:

const importToEventFold = async (result) => {
  setEventFoldStatus("syncing");
  const response = await postToEventFold('/api/intel', {
    source: "prospectfold",
    version: "2",
    payload: buildProspectIntelPayload(result),
  });

  if (response.ok) {
    setEventFoldStatus(`✓ ${response.data.companies_created} companies saved to EventFold`);
  } else {
    setEventFoldStatus(
      response.reason === 'EventFold not running'
        ? "EventFold offline — queued locally"
        : `Sync failed: ${response.reason}`
    );
  }
};

// Show in UI: small status line below the results
// "✓ 12 companies saved to EventFold CRM"
// "EventFold offline — will sync on next launch"
```

### EmailFold: auto-POST on Phase 2 completion (per company)

```javascript
// In email-crafter.jsx — after Phase 2 completes for a company:

const importDraftToEventFold = async (companyResult) => {
  const response = await postToEventFold('/api/email-draft', {
    source: "emailfold",
    version: "1",
    ...buildEmailDraftPayload(companyResult),
  });

  // Show inline on the company card:
  if (response.ok) {
    setCardSyncStatus(companyResult.companyName, "✓ Saved to CRM");
  } else {
    setCardSyncStatus(companyResult.companyName,
      response.reason === 'EventFold not running' ? "⚠ CRM offline" : "⚠ Sync failed"
    );
  }
};
```

---

## Offline Queue

If EventFold isn't running when ProspectFold/EmailFold complete a run:

1. Write the payload to a local queue file: `~/.foxworks/queue/[timestamp]-[type].json`
2. Show status: "EventFold offline — queued locally (3 items pending)"
3. On next POST attempt (30s health check polling): if EventFold comes online, drain the queue automatically
4. On EventFold startup: check `~/.foxworks/queue/` for pending items, import them, clear the files

```javascript
// foxworks-api-client.js — queue management

const QUEUE_DIR = path.join(os.homedir(), '.foxworks', 'queue');

const queueLocally = (endpoint, data) => {
  fs.mkdirSync(QUEUE_DIR, { recursive: true });
  const filename = `${Date.now()}-${endpoint.replace(/\//g, '-')}.json`;
  fs.writeFileSync(
    path.join(QUEUE_DIR, filename),
    JSON.stringify({ endpoint, data, queued_at: new Date().toISOString() })
  );
};

const drainQueue = async () => {
  const files = fs.readdirSync(QUEUE_DIR).sort(); // oldest first
  for (const file of files) {
    const item = JSON.parse(fs.readFileSync(path.join(QUEUE_DIR, file), 'utf8'));
    const result = await postToEventFold(item.endpoint, item.data);
    if (result.ok) fs.unlinkSync(path.join(QUEUE_DIR, file));
  }
};
```

---

## EventFold Frontend: Real-time Updates

When the Rust backend receives a successful import, it emits a Tauri event to the frontend:

```rust
// In the axum handler, after successful import:
app_handle.emit_all("intel-imported", json!({
    "intel_id": intel_id,
    "companies_created": result.companies_created,
    "naics_label": payload.naics_label,
})).ok();
```

The React frontend subscribes:

```typescript
// In a top-level component or App.tsx:
import { listen } from '@tauri-apps/api/event';

useEffect(() => {
  const unlisten = listen('intel-imported', (event) => {
    queryClient.invalidateQueries(['companies']);
    queryClient.invalidateQueries(['prospect-intel']);
    toast.success(`ProspectFold: ${event.payload.companies_created} companies imported`);
  });
  return () => { unlisten.then(f => f()); };
}, []);
```

The frontend **live-updates** without the user doing anything. Companies appear in the list, the Outbox populates, the Intel feed updates — all automatically.

---

## UI Changes in ProspectFold + EmailFold

### Status strip (both apps)

Add a persistent 1-line status strip at the bottom of each app showing EventFold connectivity:

```
EventFold: ● Connected  |  Last sync: 2 min ago  |  8 drafts pending
```

or

```
EventFold: ○ Offline  |  3 items queued — will sync on reconnect
```

### Remove all clipboard UI

Once the HTTP API is live:
- Remove "Copy to Clipboard" buttons that were for the old bridge
- Remove "Paste from ProspectFold" / "Paste from EmailFold" buttons from EventFold
- The only clipboard use remaining: "Copy email body to paste into Gmail" (intentional user action)

---

## Implementation Notes for Senior Dev

**Axum in Tauri:** Tauri's `setup` hook gives you access to `AppHandle`. Pass it + a clone of `AppState` to the axum server. The server and Tauri's main loop both run on the same `tokio` runtime — no threading issues.

```rust
// In src/lib.rs setup():
tauri::Builder::default()
    .setup(|app| {
        let app_state = app.state::<AppState>().inner().clone();
        let app_handle = app.handle().clone();
        tauri::async_runtime::spawn(async move {
            api_server::start_api_server(app_state, app_handle).await;
        });
        Ok(())
    })
```

**Port conflict handling:** If port 7777 is taken, try 7778, 7779, etc. Write the actual bound port to `~/.foxworks/api.json`. Electron apps always read the file — don't hardcode the port.

**CORS:** The axum server should allow requests from `null` origin (Electron's renderer sends null origin). Add: `Access-Control-Allow-Origin: *` on all responses (safe since this is loopback-only).

**macOS Gatekeeper:** Binding a TCP port from a Tauri app requires no special entitlements on macOS. Loopback is always permitted.

---

## Out of Scope

- Syncing EventFold → ProspectFold or EmailFold (one-directional for now)
- Remote/cloud sync (this is all local)
- Websocket real-time streaming of generation results into EventFold
- Multi-machine sync

---

## Success Metrics

- User action required to sync ProspectFold intel to EventFold: **0 clicks** (fully automatic)
- User action required to sync EmailFold draft to EventFold: **0 clicks** (fully automatic)
- Sync latency (completion → available in EventFold): **< 2 seconds**
- Behavior when EventFold is offline: **silent queue, auto-drain on reconnect** (zero data loss)
