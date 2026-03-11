# PRD-00 — Integration Guide & Technical Design Specification
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM) — read this first before any other PRD
**Priority:** Foundation — everything else references this

---

## What This Document Is

This is the **Technical Design Specification (TDS)** for the Foxworks Suite integration layer. Where individual PRDs define *what* to build, this document defines *how all the pieces connect* — shared contracts, canonical types, the complete command inventory, event catalog, file system layout, and the integration checklist the senior dev can use to validate completeness.

Think of it as the system's constitution: if a PRD contradicts this document, this document wins. If a PRD is silent on a cross-cutting concern (auth, error handling, event naming), the answer is here.

---

## The Three-App Architecture

```
┌──────────────────────┐         ┌──────────────────────┐
│   ProspectFold       │         │     EmailFold         │
│   (Electron/Node)    │         │   (Electron/Node)     │
│   Port: self         │         │   Port: self          │
│                      │         │                       │
│  Reads: ~/.foxworks/ │         │  Reads: ~/.foxworks/  │
│          api.json    │         │          api.json     │
│                      │         │                       │
│  Writes to:          │         │  Writes to:           │
│   POST /api/intel    │         │   POST /api/email-    │
│                      │         │         draft         │
│                      │         │   POST /api/email-    │
│                      │         │         sequence      │
└──────────┬───────────┘         └──────────┬────────────┘
           │                                │
           │         HTTP (loopback)        │
           └──────────────┬─────────────────┘
                          │
              ┌───────────▼────────────┐
              │     EventFold CRM      │
              │    (Tauri v2 / Rust)   │
              │    127.0.0.1:7777      │
              │                        │
              │  axum HTTP server      │
              │  + Tauri IPC           │
              │  + JSONL event store   │
              └────────────────────────┘
```

**Direction:** ProspectFold → EventFold and EmailFold → EventFold only. EventFold does not push to either Electron app (exception: job files for PRD-11 Auto Pipeline, which use the filesystem).

---

## File System Layout

All shared state lives under `~/.foxworks/`. EventFold owns the directory; Electron apps read from it.

```
~/.foxworks/
├── api.json                    # Discovery file — port + bearer token
├── queue/                      # Offline send queue (Electron writes, EventFold drains)
│   └── [timestamp]-[slug].json # e.g., 1741600000000-api-intel.json
├── jobs/                       # Auto pipeline orchestration (PRD-11)
│   └── [job_id].json           # Job definition written by EventFold
└── progress/                   # Pipeline progress polling (PRD-11)
    └── [job_id].json           # Written by ProspectFold/EmailFold, read by EventFold
```

### `api.json` Schema (canonical)

```typescript
interface FoxworksApiConfig {
  port: number;          // actual bound port (starts at 7777, increments on conflict)
  token: string;         // "fox_" + 32-byte hex — regenerated only on explicit reset
  version: "1.0";        // schema version for forward compat
  eventfold_version: string;  // e.g., "0.8.1" — Electron apps can warn on mismatch
}
```

EventFold writes this file on first launch and whenever the port changes. Electron apps **read it on every request** (stat the file, re-read if mtime changed) — no caching, so port changes take effect immediately.

### Queue File Schema

```typescript
interface QueuedRequest {
  endpoint: string;           // e.g., "/api/intel"
  data: unknown;              // the full request body
  queued_at: string;          // ISO datetime
  attempt_count: number;      // incremented on failed drain attempts
  source_app: "prospectfold" | "emailfold";
}
```

EventFold drains the queue on startup and on each health-check reconnect. Files are deleted after successful import. After 5 failed attempts, move to `~/.foxworks/queue/failed/` and alert the user.

---

## HTTP API Specification (EventFold server)

All endpoints:
- Bound to `127.0.0.1:[port]` — loopback only, never network-accessible
- Require `Authorization: Bearer [token]` header — 401 if missing or invalid
- Accept and return `Content-Type: application/json`
- Return `Access-Control-Allow-Origin: *` (safe for loopback; required for Electron null-origin)
- Return errors as `{ "ok": false, "error": "human-readable message", "code": "ERROR_CODE" }`

### Error Codes

| Code | HTTP Status | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid bearer token |
| `VALIDATION_ERROR` | 400 | Payload failed schema validation |
| `COMPANY_CONFLICT` | 409 | Fuzzy match below threshold, manual resolution needed |
| `INTERNAL_ERROR` | 500 | EventFold internal error (check Tauri logs) |
| `QUEUE_FULL` | 503 | Queue dir write failed (disk space) |

---

### `GET /api/health`

No auth required. Used for connectivity check before attempting a push.

**Response:**
```typescript
interface HealthResponse {
  ok: true;
  version: string;          // EventFold app version
  uptime_seconds: number;
  api_version: "1.0";
}
```

---

### `GET /api/status`

Auth required. Rich status for Electron sidebar panels.

**Response:**
```typescript
interface StatusResponse {
  ok: true;
  pending_drafts: number;          // Interaction records with email_status = Draft
  sequences_due_today: number;     // sequence steps with effective_status = Due
  stale_companies: number;         // companies with most recent intel > 30 days old
  open_deals: number;
  queue_pending: number;           // items still in ~/.foxworks/queue/ unprocessed
  recent_imports: Array<{
    type: "intel" | "email_draft" | "email_sequence";
    company_name: string;
    imported_at: string;           // ISO datetime
  }>;
}
```

---

### `POST /api/intel`

Receives a completed ProspectFold research run. Creates ProspectIntel aggregate + batch Company records.

**Discriminator header (optional, for logging):** `X-Foxworks-Source: prospectfold`

**Request:**
```typescript
interface IntelImportRequest {
  source: "prospectfold";
  version: "2";
  payload: ProspectIntelV2Payload;  // full schema in PRD-01
}
```

**Response:**
```typescript
interface IntelImportResponse {
  ok: true;
  intel_id: string;              // ProspectIntel aggregate ID — use to correlate email-draft calls
  companies_created: number;
  companies_merged: number;      // matched by fuzzy name/URL
  companies_skipped: number;     // duplicates within this batch
  company_ids: string[];         // EventFold company IDs in same order as payload.companies
}
```

**Merge threshold:** ≥ 95% string similarity on normalized company name, OR matching domain from URL. Below threshold → create new record (no user prompt in background mode).

**Tauri events emitted after success:**
```
intel-imported  →  { intel_id, companies_created, naics_label }
```

---

### `POST /api/email-draft`

Receives a single chosen email draft from EmailFold. Creates Interaction + Note + Task.

**Request:**
```typescript
interface EmailDraftImportRequest {
  source: "emailfold";
  version: "1";
  intel_id?: string;             // optional — links back to the ProspectIntel session
  company_name: string;
  company_url?: string;
  contact_name: string;
  contact_role?: string;
  contact_email?: string;        // if known from Apollo enrichment (PRD-10)
  contact_linkedin_url?: string; // if known from Apollo enrichment (PRD-10)
  email_goal: string;
  ts: number;                    // Unix ms — generation timestamp
  chosen_angle_index: number;    // 0-2, which angle the user selected
  research: EmailFoldResearch;   // full schema in PRD-02
  emails: EmailFoldEmail[];      // all generated variants (3 angles)
}

interface EmailFoldResearch {
  company_summary: string;
  icp_score: number;             // 0-100
  pain_points: string[];
  signals: string[];
  personalization_hooks: string[];
}

interface EmailFoldEmail {
  angle_name: string;
  subject: string;
  body: string;
  word_count: number;
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
  task_id: string | null;        // null if T+7 task creation is disabled
  company_created: boolean;
  contact_created: boolean;
}
```

**Tauri events emitted after success:**
```
email-draft-imported  →  { interaction_id, company_name, contact_name }
```

---

### `POST /api/email-sequence`

Receives a complete 4-step email sequence from EmailFold. Creates 4 Interaction records + Note.

**Request:**
```typescript
interface EmailSequenceImportRequest {
  source: "emailfold";
  version: "1";
  discriminator: "__emailfold_sequence_v1";  // for forward compat validation
  intel_id?: string;             // optional — links back to ProspectIntel session
  sequence_id: string;           // UUID generated by EmailFold — stable across retries
  company_name: string;
  company_url?: string;
  contact_name: string;
  contact_role?: string;
  contact_email?: string;
  contact_linkedin_url?: string;
  email_goal: string;
  occurred_at: string;           // ISO datetime
  research_note_body: string;    // full research snapshot markdown
  steps: EmailSequenceStep[];    // exactly 4 steps
}

interface EmailSequenceStep {
  step: number;                  // 1, 2, 3, or 4
  day_offset: number;            // 0, 3, 7, 14
  format: "cold" | "value_add" | "pattern_interrupt" | "breakup";
  angle: string;                 // step 1 angle for steps 2-4: describe the callback
  subject: string;
  body: string;
  word_count: number;
}
```

**Response:**
```typescript
interface EmailSequenceImportResponse {
  ok: true;
  sequence_id: string;           // echoed back — same as request.sequence_id
  interaction_ids: string[];     // [step1_id, step2_id, step3_id, step4_id]
  company_id: string;
  contact_id: string;
  note_id: string;
  company_created: boolean;
  contact_created: boolean;
}
```

**Idempotency:** If `sequence_id` already exists in EventFold, return the existing IDs with a `200 OK` (no duplicate records). EmailFold should use the same UUID on retry after network failure.

**Tauri events emitted after success:**
```
sequence-imported  →  { sequence_id, company_name, contact_name, step_count: 4 }
```

---

### `POST /api/contact` *(optional — for PRD-10 direct enrichment)*

Creates or updates a Contact record directly from Apollo/Haiku enrichment results.

**Request:**
```typescript
interface ContactImportRequest {
  source: "prospectfold";
  version: "1";
  company_id?: string;           // if already known from prior /api/intel call
  company_name: string;
  company_url?: string;
  contact: {
    full_name: string;
    title: string;
    seniority: string;           // "vp" | "director" | "c_suite" | "manager"
    email?: string;              // may be null if Apollo doesn't expose
    linkedin_url?: string;
    apollo_person_id?: string;
    personalization_hooks: string[];  // from Haiku enrichment
    best_angle: string;
    timing_notes?: string;
    enrichment_source: "apollo_haiku";
  };
}
```

**Response:**
```typescript
interface ContactImportResponse {
  ok: true;
  contact_id: string;
  company_id: string;
  contact_created: boolean;      // false if matched existing contact
}
```

---

## Shared `foxworks-api-client.js`

Both Electron apps include this file verbatim. Canonical location: `src/lib/foxworks-api-client.js` in each app.

```javascript
const fs = require('fs');
const path = require('path');
const os = require('os');

const FOXWORKS_DIR = path.join(os.homedir(), '.foxworks');
const API_CONFIG_PATH = path.join(FOXWORKS_DIR, 'api.json');
const QUEUE_DIR = path.join(FOXWORKS_DIR, 'queue');

// --- Config ---

let _configCache = null;
let _configMtime = 0;

const getConfig = () => {
  try {
    const stat = fs.statSync(API_CONFIG_PATH);
    if (stat.mtimeMs !== _configMtime) {
      _configCache = JSON.parse(fs.readFileSync(API_CONFIG_PATH, 'utf8'));
      _configMtime = stat.mtimeMs;
    }
    return _configCache;
  } catch {
    return null;
  }
};

// --- Health check ---

const checkHealth = async () => {
  const config = getConfig();
  if (!config) return { connected: false, reason: 'api.json not found' };
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}/api/health`, { signal: AbortSignal.timeout(2000) });
    return { connected: res.ok, version: (await res.json()).version };
  } catch {
    return { connected: false, reason: 'connection refused' };
  }
};

// --- POST helper ---

const postToEventFold = async (endpoint, data) => {
  const config = getConfig();
  if (!config) {
    queueLocally(endpoint, data);
    return { ok: false, queued: true, reason: 'EventFold not running' };
  }
  try {
    const res = await fetch(`http://127.0.0.1:${config.port}${endpoint}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.token}`,
      },
      body: JSON.stringify(data),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      return { ok: false, status: res.status, error: err.error, code: err.code };
    }
    return { ok: true, data: await res.json() };
  } catch (err) {
    if (err.name === 'TimeoutError') {
      queueLocally(endpoint, data);
      return { ok: false, queued: true, reason: 'timeout — queued locally' };
    }
    queueLocally(endpoint, data);
    return { ok: false, queued: true, reason: err.message };
  }
};

// --- Offline queue ---

const queueLocally = (endpoint, data) => {
  try {
    fs.mkdirSync(QUEUE_DIR, { recursive: true });
    const slug = endpoint.replace(/\//g, '-').replace(/^-/, '');
    const filename = `${Date.now()}-${slug}.json`;
    fs.writeFileSync(
      path.join(QUEUE_DIR, filename),
      JSON.stringify({
        endpoint,
        data,
        queued_at: new Date().toISOString(),
        attempt_count: 0,
        source_app: process.env.FOXWORKS_APP || 'unknown',
      })
    );
  } catch (e) {
    console.error('[foxworks] queue write failed:', e.message);
  }
};

const drainQueue = async () => {
  let files;
  try { files = fs.readdirSync(QUEUE_DIR).filter(f => f.endsWith('.json')).sort(); }
  catch { return; }
  for (const file of files) {
    const filePath = path.join(QUEUE_DIR, file);
    try {
      const item = JSON.parse(fs.readFileSync(filePath, 'utf8'));
      const result = await postToEventFold(item.endpoint, item.data);
      if (result.ok) {
        fs.unlinkSync(filePath);
      } else if (!result.queued) {
        // Permanent failure (4xx) — move to failed/
        fs.mkdirSync(path.join(QUEUE_DIR, 'failed'), { recursive: true });
        fs.renameSync(filePath, path.join(QUEUE_DIR, 'failed', file));
      }
    } catch (e) {
      console.error('[foxworks] queue drain error:', file, e.message);
    }
  }
};

module.exports = { getConfig, checkHealth, postToEventFold, queueLocally, drainQueue };
```

---

## Complete Tauri IPC Command Inventory

All commands the senior dev needs to implement, grouped by PRD. This is the definitive list — use it to build the `invoke_handler!` macro registration.

### PRD-01 — ProspectIntel Aggregate

| Command | Signature | Notes |
|---|---|---|
| `import_prospect_intel` | `(payload: ProspectIntelPayload) → ImportIntelResult` | Creates ProspectIntel aggregate + batch companies |
| `find_company_by_name_or_url` | `(name: String, url: Option<String>) → Option<CompanyMatch>` | Fuzzy dedup helper |
| `list_prospect_intel_sessions` | `(company_id: Option<String>) → Vec<IntelSessionSummary>` | All intel sessions, optionally filtered |

### PRD-02 — Interaction Extensions

| Command | Signature | Notes |
|---|---|---|
| `import_emailfold_draft` | `(payload: EmailDraftPayload) → ImportDraftResult` | Also callable from HTTP API handler |
| `mark_email_sent` | `(id: String, sent_at: String) → ()` | Emits EmailSent; if sequence step 1, calls activate_sequence |
| `log_email_reply` | `(original_id: String, summary: String, body: Option<String>, replied_at: String) → String` | Returns reply Interaction ID; if sequence_id present, calls cancel_sequence |

### PRD-03 — Outbox View

| Command | Signature | Notes |
|---|---|---|
| `list_email_interactions` | `(status: Option<EmailStatus>, company_id: Option<String>) → Vec<EmailInteractionRow>` | Powers outbox list |
| `update_email_status` | `(id: String, status: EmailStatus) → ()` | Direct status override |

### PRD-05 — Intel History

| Command | Signature | Notes |
|---|---|---|
| `list_stale_intel_companies` | `(days_threshold: u32) → Vec<StaleCompanySummary>` | Default threshold: 30 days |
| `get_latest_intel_for_company` | `(company_id: String) → Option<IntelSessionSummary>` | Most recent snapshot |
| `get_intel_history_for_company` | `(company_id: String) → Vec<IntelSessionSummary>` | All snapshots ordered by date |

### PRD-07 — Metrics

| Command | Signature | Notes |
|---|---|---|
| `get_email_outreach_metrics` | `(start_date: Option<String>, end_date: Option<String>) → EmailOutreachMetricsOutput` | Funnel: Drafted → Sent → Replied → Deal |
| `get_angle_performance` | `(start_date: Option<String>, end_date: Option<String>) → Vec<AnglePerformance>` | Reply rate per angle name |
| `get_naics_performance` | `() → Vec<NaicsPerformance>` | Reply rate per NAICS code |

### PRD-09 — API Setup

| Command | Signature | Notes |
|---|---|---|
| `generate_api_token` | `() → String` | Generates new token, writes api.json, restarts server |
| `get_api_status` | `() → ApiStatusOutput` | Port, token prefix, uptime, queue count |

### PRD-10 — Contact Research

| Command | Signature | Notes |
|---|---|---|
| `import_contact_from_enrichment` | `(payload: ContactImportPayload) → ImportContactResult` | From HTTP /api/contact or inline from ProspectFold |
| `get_enriched_contacts_for_company` | `(company_id: String) → Vec<EnrichedContact>` | All Apollo-sourced contacts |

### PRD-11 — Auto Pipeline

| Command | Signature | Notes |
|---|---|---|
| `create_pipeline_run` | `(naics_code: String, icp_criteria: IcpCriteria, mode: PipelineMode) → PipelineRunId` | Creates job file, emits to ProspectFold |
| `get_pipeline_run_status` | `(run_id: String) → PipelineRunStatus` | Reads progress file |
| `cancel_pipeline_run` | `(run_id: String) → ()` | Writes cancel signal to job file |
| `list_pipeline_runs` | `() → Vec<PipelineRunSummary>` | Recent runs with status |

### PRD-12 — Reply Assist

| Command | Signature | Notes |
|---|---|---|
| `get_reply_context` | `(original_interaction_id: String) → ReplyContext` | Returns thread + company + intel context |
| `save_reply_draft` | `(original_interaction_id: String, body: String, subject: String) → String` | Returns new Interaction ID |

### PRD-15 — Sequence Data Model

| Command | Signature | Notes |
|---|---|---|
| `import_email_sequence` | `(payload: SequenceImportPayload) → ImportSequenceResult` | Creates 4 Interaction records + Note |
| `cancel_sequence` | `(sequence_id: String, reason: CancelReason, trigger_id: Option<String>) → CancelSequenceResult` | Cancels all remaining steps |
| `activate_sequence` | `(sequence_id: String, step1_sent_at: String) → ()` | Computes + sets send dates for steps 2-4 |
| `get_sequence_steps` | `(sequence_id: String) → Vec<SequenceStepRow>` | All 4 steps with current status |
| `list_active_sequences` | `() → Vec<SequenceSummary>` | All non-completed sequences |
| `skip_sequence_step` | `(interaction_id: String, reason: Option<String>) → ()` | Skip single step, keep sequence alive |

### PRD-18 — Sequence Analytics

| Command | Signature | Notes |
|---|---|---|
| `get_sequence_metrics` | `(start_date: Option<String>, end_date: Option<String>) → SequenceMetricsOutput` | Funnel, step rates, Lazarus rate |

**Total: 29 new IPC commands** (plus existing 113 — new total ~142)

---

## Complete Tauri Event Catalog

Events emitted from Rust → React frontend. All events are JSON payloads via `app_handle.emit_all()`.

| Event Name | Emitted By | Payload | Listener Usage |
|---|---|---|---|
| `intel-imported` | `/api/intel` handler | `{ intel_id, companies_created, naics_label }` | Invalidate companies + prospect-intel queries |
| `email-draft-imported` | `/api/email-draft` handler | `{ interaction_id, company_name, contact_name }` | Invalidate email-interactions query |
| `sequence-imported` | `/api/email-sequence` handler | `{ sequence_id, company_name, contact_name, step_count: 4 }` | Invalidate active-sequences query |
| `sequence-auto-cancelled` | `log_email_reply` (when sequence) | `{ sequence_id, company_name, reason: "reply_received" }` | Re-render affected SequenceCard |
| `pipeline-progress` | EventFold on progress file change (PRD-11) | `{ run_id, phase, companies_processed, companies_total }` | Update Pipeline Studio view |
| `api-token-regenerated` | `generate_api_token` command | `{ new_port }` | Show "token changed — reconnect Electron apps" notice |

**Frontend subscription pattern:**
```typescript
// In App.tsx or a top-level hook:
useEffect(() => {
  const unlisteners = [
    listen('intel-imported', (e) => {
      queryClient.invalidateQueries(['companies']);
      queryClient.invalidateQueries(['prospect-intel']);
      toast.success(`ProspectFold: ${e.payload.companies_created} companies imported`);
    }),
    listen('email-draft-imported', (e) => {
      queryClient.invalidateQueries(['email-interactions']);
      toast.success(`EmailFold: Draft saved for ${e.payload.company_name}`);
    }),
    listen('sequence-imported', (e) => {
      queryClient.invalidateQueries(['active-sequences']);
      toast.success(`EmailFold: 4-step sequence ready for ${e.payload.company_name}`);
    }),
    listen('sequence-auto-cancelled', (e) => {
      queryClient.invalidateQueries(['active-sequences']);
    }),
  ];
  return () => { Promise.all(unlisteners).then(fns => fns.forEach(f => f())); };
}, []);
```

---

## New Projections

| Projection | Subscribes To | Purpose | PRD |
|---|---|---|---|
| `EmailInteractionIndex` | `interaction` | Fast list/filter of email Interactions for Outbox view | PRD-03 |
| `SequenceIndex` | `interaction` | Cross-stream join: sequence_id → steps; interaction_id → sequence_id | PRD-15 |
| `EmailOutreachMetrics` | `interaction`, `deal` | Funnel counters by date bucket, angle, NAICS | PRD-07 |
| `SequenceMetrics` | `interaction` | Step reply rates, format performance, Lazarus rate | PRD-18 |

**Registration in `src/lib.rs`:**
```rust
.manage(EmailInteractionIndex::new())   // PRD-03
.manage(SequenceIndex::new())           // PRD-15
.manage(EmailOutreachMetrics::new())    // PRD-07
.manage(SequenceMetrics::new())         // PRD-18
```

**Projection persistence:** All 4 projections are in-memory and rebuilt from JSONL on startup. No SQLite migration needed. If rebuild time becomes > 2s on large datasets, add a snapshot file at `~/.foxworks/projections/[name].bin` (bincode-serialized) — restore from snapshot, replay only events since snapshot timestamp. Not required for MVP.

---

## New Aggregates

| Aggregate | File | Streams | PRD |
|---|---|---|---|
| `ProspectIntel` | `src/domain/prospect_intel.rs` | `prospect_intel/[id].jsonl` | PRD-01 |
| `PipelineRun` | `src/domain/pipeline_run.rs` | `pipeline_run/[id].jsonl` | PRD-11 (optional for MVP) |

`ProspectIntel` is required for PRD-01/05. `PipelineRun` can be deferred — PRD-11 Option B (file-based job system) doesn't require a new aggregate.

---

## New Event Types (on existing `Interaction` aggregate)

All new event variants are added to `InteractionEvent` in `src/domain/interaction.rs`. All fields use `Option<T>` where backward compat requires it.

| Event | Fields | Emitted By |
|---|---|---|
| `EmailSent` | `sent_at: String` | `mark_email_sent` command |
| `ReplyLogged` | `reply_id: String, summary: String, replied_at: String` | `log_email_reply` command |
| `EmailStatusUpdated` | `status: EmailStatus` | `update_email_status` command |
| `SequenceSendDateSet` | `send_date: String` | `activate_sequence` (internally) |
| `SequenceStepDue` | *(empty)* | Optional background task (PRD-17) |
| `SequenceCancelledOnReply` | `trigger_interaction_id: String` | `cancel_sequence` (reason=ReplyReceived) |
| `SequenceManuallyCancelled` | `cancelled_at: String` | `cancel_sequence` (reason=ManualStop) |
| `SequenceStepSkipped` | `reason: Option<String>` | `skip_sequence_step` |

---

## Interaction Aggregate — All New Fields at a Glance

```rust
// All additions to src/domain/interaction.rs Interaction struct
// --- from PRD-02 ---
pub email_subject: Option<String>,
pub email_status: Option<EmailStatus>,     // Draft | Sent | Replied | Bounced
pub ai_generated: bool,                    // default false
pub angle_name: Option<String>,

// --- from PRD-15 (sequences) ---
pub sequence_id: Option<String>,           // UUID linking 4 steps
pub sequence_step: Option<u8>,             // 1, 2, 3, 4
pub sequence_day_offset: Option<u8>,       // 0, 3, 7, 14
pub sequence_format: Option<String>,       // cold|value_add|pattern_interrupt|breakup
pub sequence_status: Option<SequenceStatus>,
pub sequence_send_date: Option<String>,    // ISO date

// --- from PRD-10 (contact enrichment metadata — on Interaction? No.) ---
// NOTE: enrichment data lives on the Contact aggregate, not Interaction.
// Use contact_id to join.

// --- from PRD-12 (reply assist) ---
// NOTE: reply drafts are new Interaction records (direction=Outbound),
// linked to the original via parent_interaction_id (if this field exists)
// or via company_id + contact_id + occurred_at ordering.
// Add parent_interaction_id: Option<String> if the aggregate doesn't have it.
pub parent_interaction_id: Option<String>,
```

---

## Integration Decision Log

Decisions made across PRDs that affect the senior dev's implementation choices. Record of *why*, not just *what*.

| Decision | Choice | Rationale |
|---|---|---|
| Inter-app transport | Local HTTP API (axum, port 7777) | Clipboard is fragile and user-choreographed; HTTP is invisible and queued |
| ProspectIntel storage | New `ProspectIntel` aggregate | Intel is a versioned snapshot with its own lifecycle — not a property of Company |
| Email sequence storage | 4 `Interaction` records linked by `sequence_id` | Reuses existing aggregate; all email lifecycle events already defined there |
| Research snapshot | `Note` companion record | Keeps Interaction.body clean; research is a separate artifact |
| Sequence status on send | Task auto-creates in `mark_email_sent` | `EmailSent` event lacks contact/company context; Tauri command has full AppState |
| Scheduled→Due transition | Query-time computation | No background task needed; accurate and zero infrastructure overhead for MVP |
| Parallel queue | Sliding window, concurrency 3 | Balances Anthropic rate limits vs. throughput; configurable per user plan |
| Phase 1 model | `claude-haiku-3-5` | Web scan + format = no reasoning required; identical quality at 11× lower cost |
| Company fuzzy match | ≥ 95% similarity OR matching domain | Below threshold creates new record; no user prompt during background import |
| Sequence idempotency | `sequence_id` dedup on `/api/email-sequence` | Allows EmailFold to retry on network failure without creating duplicate records |

---

## API Payload Discriminators

Every inter-app payload includes a discriminator for forward compat and logging. The senior dev can use these to version the handlers.

| Source | Endpoint | Discriminator Field | Current Version |
|---|---|---|---|
| ProspectFold | `POST /api/intel` | `source: "prospectfold"` + `version: "2"` | v2 |
| EmailFold | `POST /api/email-draft` | `source: "emailfold"` + `version: "1"` | v1 |
| EmailFold | `POST /api/email-sequence` | `discriminator: "__emailfold_sequence_v1"` | v1 |
| ProspectFold | `POST /api/contact` | `source: "prospectfold"` + `version: "1"` | v1 |

---

## Build Sequence & Dependencies

### What Must Exist Before Each PRD Can Be Built

```
PRD-09 (HTTP API server)
  └── PRD-01 (ProspectIntel) ── requires POST /api/intel
       └── PRD-05 (Intel history) ── requires ProspectIntel aggregate
  └── PRD-02 (Interaction extensions) ── requires POST /api/email-draft
       └── PRD-03 (Outbox view) ── requires email_status field
       └── PRD-06 (Convert to Deal) ── requires Replied status
  └── PRD-15 (Sequence data model) ── requires POST /api/email-sequence
       └── PRD-16 (Sequence Outbox UI) ── requires SequenceIndex
       └── PRD-17 (Automation) ── requires mark_email_sent + cancel_sequence
       └── PRD-18 (Analytics) ── requires SequenceMetrics projection

PRD-10 (Contact research) ── requires POST /api/contact
  └── PRD-13 (LinkedIn variant) ── requires contact.linkedin_url

PRD-07 (Metrics dashboard) ── requires EmailOutreachMetrics projection
  └── PRD-18 (Sequence analytics) ── extends EmailOutreachMetrics

PRD-11 (Auto pipeline) ── requires all of the above (Phase 3+)
PRD-12 (Reply Assist) ── requires log_email_reply + save_reply_draft
```

### Minimum Viable MVP (first working integration)

1. `PRD-09` — axum server + auth + discovery file
2. `PRD-01` — ProspectIntel aggregate + `/api/intel` handler
3. `PRD-02` — Interaction extensions + `/api/email-draft` handler
3. `PRD-03` — Outbox view (EmailInteractionIndex projection + list command)

Everything else is additive on top of this foundation.

---

## Open Questions Resolved

Cross-PRD questions that were left open and are answered here for consistency.

**Q: Should `mark_email_sent` call `activate_sequence` directly, or use a Process Manager?**
A: Call `activate_sequence_internal` directly from the command handler for MVP. The PM approach is cleaner but requires PM read-access to `SequenceIndex` — check if your eventfold-es framework supports this before investing. If `SequenceIndex` is accessible from a PM, migrate in Phase 2.

**Q: Can a Process Manager access other projections (like SequenceIndex)?**
A: Framework-dependent. If `AppState` is passed to PM `react()` via `Arc`, yes. If PMs only receive raw events, no — use embedded handler logic for MVP.

**Q: What `owner_id` to use for sequence Tasks created by `activate_sequence`?**
A: Use the source Interaction's `owner_id` if set, otherwise `null`. Single-user system for now — null owner means "assigned to the only user."

**Q: Should step day offsets skip weekends?**
A: Default to calendar days (not business days). Add a boolean preference `skip_weekends` to the EventFold settings aggregate — default false. PRD-17 documents the Option A (calendar days) baseline.

**Q: For Sequence Analytics — is the Lazarus Rate detected by `sequence_format = "breakup"` or `sequence_step = 4`?**
A: Use `sequence_step = 4`. The format field is advisory; step number is structural and unambiguous. If the sequence format configuration changes, step 4 is always the last step.

**Q: For "sequence completed" detection in SequenceMetrics — does the projection track steps per sequence, or rely on `SequenceIndex.overall_status`?**
A: `SequenceMetrics` reads from `SequenceIndex` to determine `overall_status`. The projections share state via `AppState` — `SequenceMetrics.apply()` can call `sequence_index.get_record(sequence_id)` when processing `EmailSent` events. This avoids duplicating completion-detection logic.

**Q: For Angle × Sequence Performance — which step's angle is used to attribute the sequence?**
A: Step 1's `angle_name`. All sequences are attributed to their opening angle. Steps 2–4 have format-specific content but the sequence identity comes from step 1's strategic angle choice.

**Q: Where does `foxworks-api-client.js` live?**
A: Vendor it directly into each Electron app at `src/lib/foxworks-api-client.js`. Do not create a shared npm package — too much overhead for a 3-app internal suite. Update manually when the contract changes (both apps are small, this is fine).

**Q: What happens if `/api/email-sequence` is called with a `sequence_id` that already exists?**
A: Return `200 OK` with the existing `interaction_ids` — idempotent. Log a warning in EventFold but don't reject the call. EmailFold generates the `sequence_id` UUID and can safely retry on timeout.

---

## Senior Dev Checklist

Use this to track implementation completeness. Each item maps to a PRD.

### Foundation (Week 1-2)
- [ ] `~/.foxworks/` directory created on first launch
- [ ] `api.json` written on startup (token generation + port binding)
- [ ] axum server on `127.0.0.1:7777` with auth middleware
- [ ] `GET /api/health` — no auth, returns version
- [ ] `GET /api/status` — auth required, includes `sequences_due_today`
- [ ] `POST /api/intel` → `import_prospect_intel` IPC logic
- [ ] `POST /api/email-draft` → `import_emailfold_draft` IPC logic
- [ ] `POST /api/email-sequence` → `import_email_sequence` IPC logic (idempotent)
- [ ] `POST /api/contact` → `import_contact_from_enrichment` IPC logic
- [ ] Tauri events: `intel-imported`, `email-draft-imported`, `sequence-imported`
- [ ] Frontend event listeners + query invalidation

### Interaction Aggregate Extensions
- [ ] `email_subject`, `email_status`, `ai_generated`, `angle_name` fields
- [ ] `sequence_id`, `sequence_step`, `sequence_day_offset`, `sequence_format`, `sequence_status`, `sequence_send_date` fields
- [ ] `parent_interaction_id` field (for reply threading in PRD-12)
- [ ] `EmailSent`, `ReplyLogged`, `EmailStatusUpdated` event variants
- [ ] `SequenceSendDateSet`, `SequenceCancelledOnReply`, `SequenceManuallyCancelled`, `SequenceStepSkipped` event variants

### Projections
- [ ] `EmailInteractionIndex` — for Outbox view
- [ ] `SequenceIndex` — for cross-sequence queries
- [ ] `EmailOutreachMetrics` — for funnel dashboard
- [ ] `SequenceMetrics` — for sequence analytics
- [ ] All 4 registered in `src/lib.rs`

### New Aggregate
- [ ] `ProspectIntel` aggregate in `src/domain/prospect_intel.rs`
- [ ] Registered in `src/lib.rs`

### IPC Commands (29 total — see full table above)
- [ ] PRD-01: 3 commands
- [ ] PRD-02: 3 commands
- [ ] PRD-03: 2 commands
- [ ] PRD-05: 3 commands
- [ ] PRD-07: 3 commands
- [ ] PRD-09: 2 commands
- [ ] PRD-10: 2 commands
- [ ] PRD-11: 4 commands
- [ ] PRD-12: 2 commands
- [ ] PRD-15: 6 commands
- [ ] PRD-18: 1 command
- [ ] All registered in `invoke_handler!` macro

### Automation (PRD-17)
- [ ] `mark_email_sent` extended to call `activate_sequence_internal` when step 1
- [ ] `log_email_reply` extended to call `cancel_sequence` when `sequence_id` present
- [ ] `activate_sequence_internal` creates per-step Tasks
- [ ] `effective_status()` function for query-time Scheduled→Due computation

### Offline Queue (EventFold side)
- [ ] On startup: drain `~/.foxworks/queue/` in timestamp order
- [ ] Failed items (non-200 response) moved to `~/.foxworks/queue/failed/`
- [ ] Alert shown in EventFold UI when items in `failed/`
