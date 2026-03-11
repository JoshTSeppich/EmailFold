# PRD-05 — Intel History & Snapshot Versioning
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM)
**Priority:** P1 — Depends on PRD-01
**Depends on:** PRD-01 (ProspectIntel aggregate)

---

## Problem

A company evolves. A startup that was "too early" in January might be Series B-funded and hiring 30 engineers in March. Without versioned intel history, there's no way to know:
- When was this company last researched?
- How has the ICP score changed?
- Which angle did we try before and why did we change it?
- Is the re-research result meaningfully different from the last run?

Today, each ProspectFold run overwrites what you previously knew. History is lost.

---

## Proposed Solution

The `ProspectIntel` aggregate (introduced in PRD-01) is **immutable per import session**. Each ProspectFold run creates a new snapshot. This naturally gives us versioned intel history.

This PRD covers the **EventFold CRM surfaces** that make this history valuable:

1. Company Detail — "Intel" tab showing all snapshots for this company, with ICP score over time
2. Stale Intel indicator — flag companies that haven't been researched in > 30 days
3. Intel diff view — side-by-side compare of two snapshots for the same company
4. Re-research trigger — "Research again in ProspectFold" button that pre-fills ProspectFold's target

---

## User Stories

- As a SDR, I see a "Last researched 45 days ago" warning on a company so I know to re-run ProspectFold before reaching out
- As a SDR, I open the Intel tab on a company and see ICP score went from 65 → 85 since last run so I know to prioritize it
- As a manager, I see which companies were researched this week vs 3 months ago so I can identify a stale pipeline
- As a SDR, I compare two intel snapshots to see what changed about a company between January and March

---

## Intel Tab on Company Detail

Add an "Intel" tab to the existing Company Detail tabbed view (alongside Interactions, Notes, Deals, Tasks).

### Intel Tab Layout

```
Interactions | Notes | Deals | Tasks | Intel ← new tab
──────────────────────────────────────────────────────
Intel History for Acme Corp

  ICP Score Timeline:
  Jan 3: ██████░░░░ 65
  Mar 10: ████████░░ 85   ← most recent

──────────────────────────────────────────────────────
  ┌─ Mar 10, 2026 (current) ─────────────────────────┐
  │  NAICS: 541511 — Custom Software Dev               │
  │  ICP Score: 85/100                                 │
  │  Signals: Hiring fast, Postgres, AWS               │
  │  Red Flags: Series A only                          │
  │  Angles: Technical Debt, Onboarding Speed          │
  │  [View Full Intel]  [Compare with Jan 3]           │
  └──────────────────────────────────────────────────┘
  ┌─ Jan 3, 2026 ────────────────────────────────────┐
  │  NAICS: 541511 — Custom Software Dev               │
  │  ICP Score: 65/100                                 │
  │  Signals: Postgres                                 │
  │  Red Flags: Series A, no engineering blog          │
  │  Angles: Technical Debt only                       │
  │  [View Full Intel]                                 │
  └──────────────────────────────────────────────────┘
```

---

## Stale Intel Indicator

On the Company Detail page and in Company list views, show a stale intel badge when:
- The company has at least one ProspectIntel snapshot AND
- The most recent snapshot is older than a configurable threshold (default: 30 days)

```
Company List:
  Acme Corp          ICP 85  [STALE INTEL: 45 days]  [Researched: Jan 25]
  Widget Co          ICP 72  [Research again]          [Researched: Mar 8]
  DataFlow Inc              [No intel yet]
```

The "Research again" / "Stale Intel" badge is a link that opens a "Re-research" modal (see below).

---

## Re-Research Trigger

When a user wants to re-research a company, they shouldn't have to manually copy company name + URL to ProspectFold. The CRM knows this data.

**"Research again" button behavior:**

1. Write a pre-fill payload to clipboard:
```typescript
interface ProspectFoldPrefillPayload {
  __prospectfold_prefill_v1: true;
  companyName: string;
  websiteUrl: string;
  previousIcpScore: number;
  previousAngles: string[];     // angle names from most recent snapshot
}
```

2. Show toast: "ProspectFold pre-filled — switch to ProspectFold and paste"

3. ProspectFold reads this on a new "Paste from EventFold" button and pre-fills the target company URL + company name.

**Note:** ProspectFold doesn't exist yet in EventFold terms — this is a future clipboard bridge. The senior dev only needs to implement the "write to clipboard" side in EventFold. The ProspectFold read side is a separate change to `prospect-crafter.jsx`.

---

## Intel Diff View

Side-by-side comparison of two ProspectIntel snapshots for the same company.

```
Compare Intel for Acme Corp
Jan 3, 2026          vs          Mar 10, 2026
──────────────────────    ──────────────────────
ICP Score:  65                ICP Score:  85    ↑ +20
Signals:    1                 Signals:    3     ↑ +2
Red Flags:  2                 Red Flags:  1     ↓ -1
Angles:     1                 Angles:     2     ↑ +1

WHAT CHANGED:
+ NEW signal: "Hiring rapidly for engineering roles"
+ NEW signal: "Using AWS stack"
+ NEW angle: "Onboarding Speed"
- REMOVED red flag: "No engineering blog" (they launched one)
```

**Diff computation:** Client-side. Load both `ProspectIntelDetail` objects, compute field-level diffs in React. No new backend commands.

---

## New IPC Commands

These extend PRD-01's command set:

```rust
/// Get all ProspectIntel sessions that reference a specific company.
/// (Already in PRD-01, referenced here for completeness.)
#[tauri::command]
pub async fn get_intel_for_company(
    company_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ProspectIntelSummary>, AppError>

/// Get the most recent intel snapshot for a company.
/// Used for stale intel badge logic.
#[tauri::command]
pub async fn get_latest_intel_for_company(
    company_id: String,
    state: State<'_, AppState>,
) -> Result<Option<ProspectIntelSummary>, AppError>

/// List companies with stale intel (last snapshot older than threshold_days).
/// Used by the "Stale Prospects" view.
#[tauri::command]
pub async fn list_stale_intel_companies(
    threshold_days: u32,              // default 30
    state: State<'_, AppState>,
) -> Result<Vec<StaleIntelCompany>, AppError>

pub struct StaleIntelCompany {
    pub company_id: String,
    pub company_name: String,
    pub last_intel_at: Option<String>,   // None = never researched
    pub last_icp_score: Option<u8>,
    pub days_since_research: Option<u32>,
}
```

---

## New View: Stale Prospects

A filterable view showing all companies whose intel is stale or missing. Entry point for re-research sessions.

```
+──────────────────────────────────────────────────────+
│  Stale Prospects              [Re-research all with ProspectFold]
├──────────────────────────────────────────────────────┤
│  Filter: [30+ days] [60+ days] [Never researched]    │
├──────────────────────────────────────────────────────┤
│  Acme Corp       ICP 65   Last: Jan 3  (67 days ago)  │
│                           [Research again]            │
│  Widget Co       ICP 72   Last: Jan 25 (45 days ago)  │
│                           [Research again]            │
│  DataFlow Inc    —        Never researched            │
│                           [Research in ProspectFold]  │
└──────────────────────────────────────────────────────┘
```

"Research again" writes the `ProspectFoldPrefillPayload` for that company to clipboard. For "Research all": could write an array of prefill objects (batch ProspectFold run pre-load).

---

## Out of Scope

- Auto-triggering ProspectFold from within EventFold (two separate apps, no IPC channel)
- Automatically detecting that a company's intel is outdated (no webhook to Apollo for change events)
- Merging intel fields across snapshots (each snapshot is immutable)

---

## Success Metrics

- SDRs can identify stale leads in < 30 seconds (previously required manual memory)
- Re-research cycle (identify stale → run ProspectFold → import updated intel) < 5 minutes
- % of active pipeline companies with intel < 30 days old: **> 90%**

---

## Open Questions for Senior Dev

1. The `list_stale_intel_companies` command needs to know both the company list and the most recent intel date per company. Should this be a join in the `CompanyIntelIndex` projection, or two separate command calls composed on the frontend?
2. Is there a canonical "last updated" timestamp on the Company aggregate that we can compare to, or does the stale check need to query the ProspectIntel projection directly?
3. For the ICP score timeline chart — what chart library is already in the EventFold frontend? (Recharts, Tremor, or raw SVG?)
