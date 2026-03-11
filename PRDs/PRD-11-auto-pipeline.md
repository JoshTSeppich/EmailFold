# PRD-11 — The Auto Pipeline: Zero-Click Prospecting
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** All three apps
**Priority:** P1 — The product vision; depends on PRD-09 + PRD-10
**Depends on:** PRD-09 (local API), PRD-10 (contact research)

---

## Problem

Even after PRDs 09 and 10, the user still has to:
1. Open ProspectFold, enter a NAICS code, click run
2. Wait
3. Open EmailFold (or it auto-receives the queue via API)
4. EmailFold generates emails per company
5. Open EventFold Outbox, work through the draft list

Three apps, three sessions, still sequential. The SDR is still the orchestrator.

**The vision:** The SDR enters a NAICS code and ICP criteria on Monday morning. By the time they finish their coffee, EventFold's Outbox has 15 personalized, angle-targeted email drafts ready to send — one per qualified company, addressed to the specific decision maker, referencing something they personally said last week.

One input. Zero waiting. Maximum throughput.

---

## Proposed Solution: EventFold as Pipeline Orchestrator

EventFold CRM becomes the control plane. It can:

1. **Trigger ProspectFold runs** — send a research job via the local API
2. **Receive intel** — auto-import companies from ProspectFold (PRD-09)
3. **Trigger EmailFold generation** — for each imported company, fire an email generation job
4. **Receive drafts** — auto-import to Outbox (PRD-02 + PRD-09)
5. **Notify the user** — "Pipeline complete: 12 drafts ready in Outbox"

The user's role: configure the pipeline once, trigger it, come back to a full Outbox.

---

## Architecture: Bidirectional Local API

PRD-09 describes EventFold as the server. For the auto-pipeline, the Electron apps also need to accept incoming requests — they become servers too (or use a shared queue mechanism).

**Option A: Electron apps as HTTP servers** (cleanest)

Each Electron app runs its own local HTTP server on startup:
- ProspectFold: `127.0.0.1:7778`
- EmailFold: `127.0.0.1:7779`

Discovery: each app writes to `~/.foxworks/[appname].json` on startup.

EventFold reads these files to know which apps are running and their ports.

```
EventFold (7777) ←→ ProspectFold (7778)
EventFold (7777) ←→ EmailFold (7779)
```

**Option B: Shared job queue file** (simpler, no extra HTTP server in Electron)

EventFold writes job files to `~/.foxworks/jobs/[timestamp]-[type].json`. Electron apps watch this directory via `fs.watch()` and process jobs when they appear.

```
EventFold writes: ~/.foxworks/jobs/1710000000-prospect.json
ProspectFold watches, picks it up, runs, POSTs result back to EventFold (PRD-09)
```

**Recommendation:** Option B for Phase 1 (simpler, no Node.js HTTP server in Electron). Option A for Phase 2 (more reliable, real bidirectional RPC).

---

## Pipeline Modes

### Mode 1: Full Auto (NAICS → Outbox, no user steps)

```
EventFold: "Pipeline Studio" view
  User inputs:
    - NAICS code: 541511
    - ICP criteria: 50-500 employees, US only, Series B+
    - Target persona: VP Engineering
    - Email goal: Book discovery call
    - Max companies: 20
    - Min ICP score: 75

  [▶ Run Pipeline]
    ↓
  EventFold writes job to ~/.foxworks/jobs/prospect.json
    ↓
  ProspectFold picks up job, runs Phase 0-3:
    - Pre-qualification
    - Company research
    - ICP synthesis + angles
    - Contact discovery + enrichment
  POSTs result to EventFold /api/intel
    ↓
  EventFold auto-imports companies + contacts + ProspectIntel snapshot
  For each company with ICP score ≥ 75:
    EventFold writes job to ~/.foxworks/jobs/emailfold-[company].json
    ↓
  EmailFold picks up jobs (parallel, concurrency 3):
    - Phase 1: web scan (Haiku)
    - Phase 2: email generation (Sonnet)
    POSTs result to EventFold /api/email-draft
    ↓
  EventFold creates Interaction (Draft) per company
  Shows system notification: "Pipeline complete: 14 drafts ready"
  Outbox updates in real time as drafts arrive
```

### Mode 2: Selective (user reviews intel before EmailFold runs)

Same as Mode 1, but EventFold pauses after ProspectFold completes and shows the imported companies to the user. User can:
- Exclude companies (wrong fit, already in conversation)
- Override contact selection
- Adjust angle priority

Then clicks "Generate Emails for 12 selected companies" — fires EmailFold jobs.

### Mode 3: EmailFold Only (companies already in CRM)

User selects existing companies from EventFold's company list (checkboxes), clicks "Generate emails." EventFold fires EmailFold jobs for selected companies. Useful for follow-ups, re-engagement campaigns, or when intel is already fresh.

---

## Job File Format

### ProspectFold Job

```json
{
  "job_id": "job_1710000000_prospect",
  "type": "prospect",
  "created_at": "2026-03-10T09:00:00Z",
  "created_by": "eventfold",
  "payload": {
    "naics_code": "541511",
    "naics_label": "Custom Computer Programming Services",
    "icp_criteria": {
      "employee_range": [50, 500],
      "countries": ["US"],
      "funding_stages": ["series_b", "series_c", "bootstrapped_profitable"],
      "min_icp_score": 75
    },
    "target_persona": "engineering_leader",
    "email_goal": "Book a 20-minute discovery call",
    "max_companies": 20,
    "run_contact_research": true,
    "callback_url": "http://127.0.0.1:7777/api/intel"
  }
}
```

### EmailFold Job

```json
{
  "job_id": "job_1710000100_email_acmecorp",
  "type": "email_draft",
  "created_at": "2026-03-10T09:05:00Z",
  "created_by": "eventfold",
  "payload": {
    "company_name": "Acme Corp",
    "company_url": "https://acme.com",
    "intel": { ... },               // ProspectIntel fields for this company
    "contact": {                    // from Phase 3 contact research
      "name": "Jane Smith",
      "title": "VP Engineering",
      "personalization_hooks": ["Posted about Postgres scaling 3w ago", "New VP since Jan"],
      "best_angle": "Technical Debt Automation"
    },
    "email_goal": "Book a 20-minute discovery call",
    "tone": "balanced",
    "callback_url": "http://127.0.0.1:7777/api/email-draft"
  }
}
```

---

## EventFold UI: Pipeline Studio

A new `/pipeline` route. The SDR's control panel for running full prospecting sessions.

```
+──────────────────────────────────────────────────────────────────+
│  Pipeline Studio                                                  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Configure Run ──────────────────────────────────────────┐    │
│  │  NAICS Code:     [541511 — Custom Software Dev      ▼]   │    │
│  │  Target persona: [VP Engineering                    ▼]   │    │
│  │  Email goal:     [Book a discovery call             ]    │    │
│  │  Companies:      [20 max] [ICP score ≥ 75]               │    │
│  │  Tone:           [● Balanced  ○ Direct  ○ Formal]         │    │
│  │  Mode:           [● Full Auto  ○ Review Intel First]      │    │
│  │                                             [▶ Run]       │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─ Live Progress ──────────────────────────────────────────┐    │
│  │  ProspectFold ● Running                                   │    │
│  │    Phase 1: Company research... (12/20)                   │    │
│  │    Phase 2: ICP synthesis... (8/20)                       │    │
│  │    Phase 3: Contact research... (5/20)                    │    │
│  │                                                           │    │
│  │  EmailFold ● Queued (waiting for intel)                   │    │
│  │    0/14 drafts generated                                  │    │
│  └──────────────────────────────────────────────────────────┘    │
│                                                                   │
│  ┌─ Results ────────────────────────────────────────────────┐    │
│  │  ✓ Acme Corp      Jane Smith (VP Eng)   Draft ready       │    │
│  │  ✓ Widget Co      Bob Jones (CTO)       Draft ready       │    │
│  │  ⟳ DataFlow Inc   Sarah Park...         Generating...     │    │
│  │  ✗ FooBar Ltd     —                     Skipped (ICP 62)  │    │
│  │                                   [Open Outbox (2 ready)] │    │
│  └──────────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────────┘
```

Real-time updates via Tauri events as each company completes. The SDR can start reading/sending the first drafts while the rest are still generating.

---

## EventFold Polling for App Status

EventFold checks `~/.foxworks/prospectfold.json` and `~/.foxworks/emailfold.json` every 5 seconds to show app availability:

```
Pipeline Apps:
  ProspectFold: ● Running (v0.5)
  EmailFold:    ● Running (v0.5)
  EventFold:    ● This app
```

If an app is not running, the Pipeline Studio shows "ProspectFold: ○ Offline — open it to run pipeline" with a button to launch it via `open -a ProspectFold` (macOS shell).

---

## Progress Streaming

ProspectFold + EmailFold report progress by writing to a progress file:

`~/.foxworks/progress/[job_id].json`

```json
{
  "job_id": "job_1710000000_prospect",
  "total": 20,
  "completed": 8,
  "in_progress": 3,
  "failed": 1,
  "items": [
    { "company": "Acme Corp", "status": "done", "icp_score": 85 },
    { "company": "Widget Co", "status": "in_progress", "phase": 2 },
    { "company": "FooBar Ltd", "status": "skipped", "reason": "ICP score 62 < 75" }
  ]
}
```

EventFold reads this file every 1 second during an active pipeline run and updates the Pipeline Studio UI.

---

## History: Past Pipeline Runs

Each pipeline run is stored as a `PipelineRun` aggregate in EventFold:

```rust
pub struct PipelineRun {
    pub id: String,
    pub started_at: String,
    pub completed_at: Option<String>,
    pub naics_code: String,
    pub naics_label: String,
    pub target_persona: String,
    pub companies_researched: u32,
    pub companies_qualified: u32,
    pub drafts_generated: u32,
    pub status: PipelineStatus,        // Running | Completed | Failed | Partial
    pub intel_id: Option<String>,      // ProspectIntel aggregate ID
    pub interaction_ids: Vec<String>,  // EmailFold draft Interaction IDs
}
```

Shows in EventFold as a "Run History" log so the SDR can see: "Last ran 541511 on March 3. 8 companies researched, 6 drafts, 2 replies."

---

## Follow-up Pipeline Mode

After initial outreach is complete and the SDR has the reply data from the Outbox, they can run a **Follow-up Pipeline**:

- Input: companies where `email_status = Sent` and no reply in > 7 days
- EmailFold generates follow-up email #1 (shorter, references original email)
- Or: companies where email_status = Replied — generate a meeting confirmation / response draft

This closes the full outreach loop: first touch → follow-up → reply → deal.

---

## Out of Scope

- Sending emails directly (user still sends via Gmail/Outlook)
- Scheduling pipeline runs (cron-style, "run this every Monday at 9am")
- Multi-user pipeline sharing
- Pipeline templates (save a NAICS + persona config for reuse) — Phase 2

---

## Success Metrics

- Time from "Run Pipeline" → first draft in Outbox: **< 3 minutes** (for first company)
- Time from "Run Pipeline" → all 20 drafts in Outbox: **< 10 minutes**
- SDR actions required to go from NAICS code → 20 personalized drafts: **1 click**
- Pipeline completion rate (started but not failed): **> 95%**

---

## Open Questions

1. Should ProspectFold and EmailFold be modified to run "headlessly" (no window, just background processing) when triggered by EventFold, or should they open their window so the user can see progress?
2. If the user has ProspectFold open and manually running something, can it also accept a background pipeline job simultaneously? Or should pipeline jobs queue behind the current manual session?
3. Is there a macOS App Sandbox restriction that prevents Tauri apps from launching Electron apps via shell commands? If so, the "open app if not running" feature needs a different approach.
