# PRD-07 — Prospecting Metrics Dashboard
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM)
**Priority:** P2 — Strategic visibility, depends on PRD-02 + PRD-03
**Depends on:** PRD-02 (email_status on Interaction), PRD-03 (Outbox + EmailInteractionIndex)

---

## Problem

Today there's no way to answer:
- How many cold emails did we send this week?
- What's our reply rate?
- Which EmailFold angle converts best?
- Which NAICS codes are responding?
- How long does it take from first email to a Deal?

Without these numbers, the pipeline is a black box. You can't improve what you can't measure.

---

## Proposed Solution

A **Prospecting Metrics** tab on the EventFold CRM Dashboard (or a dedicated `/metrics` route) that shows the email outreach funnel, angle performance, and pipeline velocity — updated in real time as events are logged.

---

## User Stories

- As a SDR, I see my weekly send/reply stats so I know if I'm hitting activity targets
- As a manager, I see which EmailFold angles are generating replies so I can optimize prompts
- As a manager, I see which NAICS codes respond best so I can focus ProspectFold runs
- As a SDR, I see average days from first email to Deal so I can calibrate my follow-up schedule
- As a manager, I see total pipeline value by source (ProspectFold-imported vs manually entered)

---

## Metrics: The Full Outreach Funnel

```
Researched (ProspectIntel sessions)    This week: 45
      ↓ 89%
Drafted (Email Interactions created)   This week: 40
      ↓ 78%
Sent (email_status = Sent)             This week: 31
      ↓ 16%
Replied                                This week: 5
      ↓ 80%
Converted to Deal                      This week: 4
      ↓
  Revenue Pipeline: $80k
```

Each step shows:
- Absolute count (this week / this month / all time)
- Conversion rate % (step N → step N+1)
- Trend arrow vs prior period

---

## Metrics: Angle Performance

Which EmailFold angle name drives the most replies?

```
Angle Performance (last 90 days)
──────────────────────────────────────────────────────────
Angle                   Sent  Replied  Reply Rate  Deals
──────────────────────────────────────────────────────────
Technical Debt Autom.    42     8       19%          6
Onboarding Speed         28     3       11%          2
AI Readiness             15     4       27%          3  ← 🏆
Migration Cost           18     2       11%          1
──────────────────────────────────────────────────────────
```

Sorted by Reply Rate descending. This tells the team: use "AI Readiness" more, deprioritize "Migration Cost."

**Data source:** `angle_name` field on Interaction records (added in PRD-02).

---

## Metrics: NAICS Performance

Which NAICS codes reply best?

```
NAICS Performance (last 90 days)
──────────────────────────────────────────────────────────
NAICS                        Sent  Replied  Reply Rate
──────────────────────────────────────────────────────────
541511 Custom Software Dev    35     7       20%
541512 Computer Sys Design    18     3       17%
518210 Data Processing        12     0        0%   ← skip
519290 Web Search Portals      8     2       25%  ← test more
──────────────────────────────────────────────────────────
```

**Data source:** `ProspectIntel.naics_code` joined to `company_ids` → matched to Interactions.

---

## Metrics: Pipeline Velocity

```
Average Time from First Email → Deal Created:  14 days
Average Time from Reply → Deal Created:          2 days
Oldest open Draft (unset):                      8 days ago ← needs action
Stale Deals (no activity > 14 days):             3
```

---

## New Projection: `EmailOutreachMetrics`

Subscribes to `interaction` + `prospect_intel` + `deal` events.

```rust
// src/projections.rs (new projection alongside existing DealMetrics)

pub struct EmailOutreachMetrics {
    // Weekly buckets (ISO week key: "2026-W10")
    pub sent_by_week: HashMap<String, u32>,
    pub replied_by_week: HashMap<String, u32>,
    pub deals_by_week: HashMap<String, u32>,

    // Angle performance
    pub by_angle: HashMap<String, AngleStats>,

    // NAICS performance (requires join with ProspectIntelIndex)
    pub by_naics: HashMap<String, NaicsStats>,

    // Totals
    pub total_drafted: u64,
    pub total_sent: u64,
    pub total_replied: u64,
    pub total_deals: u64,
}

pub struct AngleStats {
    pub angle_name: String,
    pub sent: u32,
    pub replied: u32,
    pub deals: u32,
}

pub struct NaicsStats {
    pub naics_code: String,
    pub naics_label: String,
    pub sent: u32,
    pub replied: u32,
}

impl Projection for EmailOutreachMetrics {
    fn subscriptions(&self) -> &[&str] {
        &["interaction", "prospect_intel", "deal"]
    }

    fn apply(&mut self, agg_type: &str, _stream_id: &str, event: &eventfold::Event) {
        match (agg_type, event.event_type.as_str()) {
            ("interaction", "Created") => { /* if ai_generated: increment drafted */ }
            ("interaction", "EmailSent") => { /* increment sent by week + by angle */ }
            ("interaction", "ReplyLogged") => { /* increment replied */ }
            ("deal", "Created") => { /* increment deals by week */ }
            ("prospect_intel", "Imported") => { /* index naics_code for company_ids */ }
            _ => {}
        }
    }
}
```

---

## New IPC Commands

```rust
/// Get full outreach metrics for a date range.
#[tauri::command]
pub async fn get_email_outreach_metrics(
    start_date: Option<String>,        // ISO date, default 90 days ago
    end_date: Option<String>,          // ISO date, default today
    state: State<'_, AppState>,
) -> Result<EmailOutreachMetrics, AppError>

/// Get angle performance stats for a date range.
#[tauri::command]
pub async fn get_angle_performance(
    start_date: Option<String>,
    end_date: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<AngleStats>, AppError>

/// Get NAICS performance stats for a date range.
#[tauri::command]
pub async fn get_naics_performance(
    start_date: Option<String>,
    end_date: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<NaicsStats>, AppError>
```

---

## Dashboard UI Layout

```
+──────────────────────────────────────────────────────────────────+
│  Prospecting Metrics                          [This week ▼] [30d] │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Funnel ──────────────────────────────────────────────────┐   │
│  │  Researched: 45   Drafted: 40   Sent: 31   Replied: 5     │   │
│  │  ────────→ 89%  ────────→ 78%  ────────→ 16%             │   │
│  │  Deals: 4  ←80%  Pipeline: $80k                           │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                   │
│  ┌─ Angle Performance ──────┐  ┌─ NAICS Performance ─────────┐  │
│  │  AI Readiness       27% 🏆│  │  519290 Web Search    25%   │  │
│  │  Tech Debt Autom.   19%  │  │  541511 Custom Dev    20%   │  │
│  │  Onboarding Speed   11%  │  │  541512 Comp. Design  17%   │  │
│  │  Migration Cost     11%  │  │  518210 Data Proc.     0%  ❌│  │
│  └──────────────────────────┘  └────────────────────────────┘   │
│                                                                   │
│  ┌─ Velocity ────────────────────────────────────────────────┐   │
│  │  First email → Deal: avg 14 days                          │   │
│  │  Reply → Deal: avg 2 days                                 │   │
│  │  Oldest unsent draft: 8 days ago   [View Outbox]          │   │
│  │  Stale deals (> 14d inactive): 3  [View Deals]            │   │
│  └──────────────────────────────────────────────────────────┘   │
└──────────────────────────────────────────────────────────────────┘
```

---

## Out of Scope

- Revenue forecasting / pipeline weighting by probability
- Individual SDR performance (not a multi-user system yet)
- A/B testing framework for subject lines
- Real-time streaming metrics (polling on page load is fine)

---

## Success Metrics

- Angle performance data available within 1 week of deploying PRD-02
- "AI Readiness" angle identified as top performer and adopted as default in EmailFold within 1 month
- NAICS 518210 (Data Processing) dropped from ProspectFold queue after 0% reply rate confirmed
- SDRs check metrics view at least weekly

---

## Open Questions for Senior Dev

1. Is the existing `DealMetrics` projection in `projections.rs` implemented as a standalone struct, or is it mixed into the `AppState`? The `EmailOutreachMetrics` should follow the same pattern.
2. The NAICS performance join requires knowing "which companies came from which ProspectIntel session with which NAICS code." Is a cross-projection join supported, or does `EmailOutreachMetrics` need to maintain its own NAICS → company_id mapping built from `ProspectIntelEvent::Imported`?
3. Does the existing Dashboard use a charting library? If so, which one? The funnel chart and angle table need it.
