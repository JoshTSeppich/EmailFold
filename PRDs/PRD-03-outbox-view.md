# PRD-03 — Outbox View: Daily Send Command Center
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM)
**Priority:** P1 — Depends on PRD-02
**Depends on:** PRD-02 (email_status on Interaction)

---

## Problem

Today there is no way to see "which emails do I need to send today?" in one place. The SDR has to navigate to each company individually, check if they have a draft, and remember what they were doing. At 20 active companies, this is a ~10-minute navigation exercise before a single email leaves the inbox.

---

## Proposed Solution

A new `/outbox` route in EventFold CRM — a global view of all email Interactions across all companies, filterable by status (Draft / Sent / Replied / Bounced). This becomes the SDR's daily entry point: open EventFold, open Outbox, work down the Draft list.

---

## User Stories

- As a SDR, I open Outbox each morning and see exactly which emails I still need to send
- As a SDR, I click "Copy Body" on a draft and paste it into Gmail — one action
- As a SDR, I click "Mark Sent" after sending — status updates, follow-up task is created
- As a SDR, I can filter to "Replied" to see threads that need a response
- As a manager, I see the Outbox as a real-time pipeline of outbound email activity

---

## Flow Diagram

```
Daily workflow:
  Open EventFold → Outbox (default view for SDR)
    ↓
  See all DRAFTs sorted by oldest first (most overdue at top)
    ↓
  For each draft:
    1. Click "Copy Subject" → paste into Gmail subject
    2. Click "Copy Body"   → paste into Gmail body
    3. Send in Gmail
    4. Click "Mark Sent"   → Interaction: Draft → Sent
                           → Task auto-created: "Follow up in 7 days"
    ↓
  Next morning: check "Replied" tab for responses to log
```

---

## New IPC Command

```rust
/// List all email Interactions across all companies, filterable by status.
/// Used by the Outbox view.
#[tauri::command]
pub async fn list_email_interactions(
    status_filter: Option<EmailStatus>,   // None = all
    limit: u32,
    offset: u32,
    state: State<'_, AppState>,
) -> Result<PaginatedResult<EmailInteractionRow>, AppError>

pub struct EmailInteractionRow {
    pub interaction_id: String,
    pub company_id: String,
    pub company_name: String,             // resolved from Company aggregate
    pub contact_id: Option<String>,
    pub contact_name: Option<String>,     // resolved from Contact aggregate
    pub contact_role: Option<String>,
    pub email_subject: Option<String>,
    pub email_status: EmailStatus,
    pub angle_name: Option<String>,
    pub occurred_at: String,              // generation timestamp (for Drafts)
    pub sent_at: Option<String>,          // populated after Mark Sent
    pub reply_count: u32,                 // count of linked inbound Interactions
}
```

This requires a **projection** that maintains an index of all email Interactions — otherwise listing across all companies requires scanning every JSONL stream.

```rust
// New projection: EmailInteractionIndex
// Subscribes to "interaction" aggregate events
// Maintains in-memory Vec<EmailInteractionRow> or on-disk index
pub struct EmailInteractionIndex {
    pub rows: Vec<EmailInteractionRow>,   // or BTreeMap<interaction_id, row>
}

impl Projection for EmailInteractionIndex {
    fn subscriptions(&self) -> &[&str] { &["interaction", "company", "contact"] }

    fn apply(&mut self, agg_type: &str, stream_id: &str, event: &eventfold::Event) {
        match event.event_type.as_str() {
            "Created" if agg_type == "interaction" => { /* insert row */ }
            "EmailSent" => { /* update sent_at, status */ }
            "ReplyLogged" => { /* increment reply_count */ }
            "EmailStatusUpdated" => { /* update status */ }
            "Created" if agg_type == "company" => { /* cache company name */ }
            "Created" if agg_type == "contact" => { /* cache contact name */ }
            _ => {}
        }
    }
}
```

---

## New UI: `/outbox` Route

**Component:** `src-frontend/src/components/outbox/EmailOutbox.tsx`

**Add to router:** `src-frontend/src/App.tsx`

**Add to sidebar navigation** with a badge showing Draft count.

### Layout

```
+──────────────────────────────────────────────────────────────+
│  Email Outbox                         [Paste from EmailFold]  │
├──────────────────────────────────────────────────────────────┤
│  [Draft  (8)] [Sent  (24)] [Replied  (3)] [All]              │
├──────────────────────────────────────────────────────────────┤
│                                                               │
│  ┌─ DRAFT ──────────────────────────────────────────────┐    │
│  │  Acme Corp  ·  Jane Smith (VP Engineering)            │    │
│  │  Technical Debt Automation                            │    │
│  │  Subject: "Your AI roadmap and where we fit in"       │    │
│  │  Generated: Mar 10, 2026  (3 days ago)                │    │
│  │  [Copy Subject] [Copy Body] [Mark Sent] [Log Reply]   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─ DRAFT ──────────────────────────────────────────────┐    │
│  │  Widget Co  ·  Bob Jones (CTO)                        │    │
│  │  Onboarding Speed                                     │    │
│  │  Subject: "One question about your dev velocity"      │    │
│  │  Generated: Mar 9, 2026                               │    │
│  │  [Copy Subject] [Copy Body] [Mark Sent] [Log Reply]   │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─ SENT ───────────────────────────────────────────────┐    │
│  │  DataFlow Inc  ·  Sarah Park (Head of Data)           │    │
│  │  AI Readiness                                         │    │
│  │  Subject: "Your Airflow → something faster?"          │    │
│  │  Sent: Mar 8, 2026                                    │    │
│  │  [Log Reply]  [View Company]                          │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌─ REPLIED ────────────────────────────────────────────┐    │
│  │  FooBar SaaS  ·  Mike Chen (CTO)                      │    │
│  │  Technical Debt Automation  ·  1 reply                │    │
│  │  Replied: Mar 7, 2026                                  │    │
│  │  [View Thread]  [Convert to Deal]                     │    │
│  └──────────────────────────────────────────────────────┘    │
└──────────────────────────────────────────────────────────────┘
```

### Card Actions by Status

| Status | Actions |
|---|---|
| Draft | Copy Subject, Copy Body, Mark Sent, Log Reply, Delete |
| Sent | Log Reply, View Company |
| Replied | View Thread, Convert to Deal, View Company |
| Bounced | View Company, Re-draft (opens EmailFold with this company pre-filled) |

### Sidebar Badge

The "Outbox" nav item shows a red badge with the count of Draft emails:

```
◉  Outbox  [8]    ← 8 unsent drafts
```

### Dashboard Widget

On the main dashboard, add a small "Outreach Summary" widget:

```
┌─────────────────────────────┐
│  Email Outreach             │
│  8 drafts to send           │
│  3 replies to address       │
│  24 sent this month         │
│  [Open Outbox]              │
└─────────────────────────────┘
```

---

## Sorting Logic

**Draft tab:** Oldest first (most overdue at top). SDRs should send stale drafts before they go cold.
**Sent tab:** Most recent first (newest send at top).
**Replied tab:** Most recent reply first (hottest leads at top).
**All tab:** Most recent activity first.

---

## "Convert to Deal" Flow

When a prospect replies, show "Convert to Deal" on the Replied card. On click:

```
Modal:
  Company: Acme Corp (already in CRM)
  Contact: Jane Smith (already in CRM)
  Deal name: [pre-fill: "Acme Corp — Discovery"]
  Deal stage: Prospect (default)
  [Create Deal]
```

Calls existing `create_deal` command with prefilled `company_id` and `contact_id`.

---

## Out of Scope

- Sending emails directly from EventFold (user still uses Gmail/Outlook)
- Bulk sending
- Email threading / conversation view (show the actual email chain)
- Read receipts / open tracking

---

## Success Metrics

- Time from opening EventFold to starting the first email send: **< 30 seconds**
- SDR visits Outbox as first action in > 80% of sessions
- Draft emails older than 3 days: < 20% of draft backlog (Outbox nudges urgency)

---

## Open Questions for Senior Dev

1. Should the `EmailInteractionIndex` projection be persisted to disk (like a snapshot file) or rebuilt from events on startup? At 500 interactions, rebuild-from-events is fast. At 5000, you want a snapshot.
2. Is there a global search projection already that indexes all aggregates by a common field? If so, the `EmailInteractionIndex` might be expressible as a filter on that.
3. The "Convert to Deal" action requires knowing `company_id` and `contact_id` — these are on the Interaction record. Is that data already returned by `list_email_interactions`, or does the frontend need a second call?
