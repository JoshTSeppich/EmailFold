# PRD-16 — Sequence Outbox View
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM)
**Priority:** P1
**Part of:** Sequence Builder (PRD-14 through PRD-18)
**Depends on:** PRD-03 (Outbox), PRD-15 (sequence data model)

---

## Scope

This PRD covers the **Outbox UI for sequences**: the Sequences tab, how individual sequence cards look, the progress indicator, due-today surfacing, and the per-step action buttons. This is what the SDR sees and interacts with daily.

---

## Where It Lives

The existing Outbox (`/outbox`) gets a new tab alongside the existing status filters:

```
Email Outbox
─────────────────────────────────────────────────────
[Single Drafts (8)]  [Sequences (12)]  [Sent]  [Replied]
```

Sequences tab shows all active sequences from `list_active_sequences`. Single Drafts shows Interaction records with no `sequence_id` (PRD-02 single emails).

---

## Sequence Card Design

Each active sequence is one card. The card shows the full arc at a glance.

### State 1: Pending (step 1 not yet sent)

```
┌─ Acme Corp · Jane Smith (VP Engineering) ─────────────────────┐
│  ○○○○  Pending — send Step 1 to activate                       │
│                                                                 │
│  Step 1  DUE NOW  "Your AI roadmap and where we fit in"        │
│  Angle: Technical Debt Automation  |  89 words                  │
│  [Copy Subject] [Copy Body] [Mark Sent] [Edit]                 │
│                                                                 │
│  Step 2  Day +3   "One thing about Postgres at scale"          │
│  Step 3  Day +7   "Still on your radar?"                       │
│  Step 4  Day +14  Break-up                                     │
│                                              [Stop Sequence]   │
└─────────────────────────────────────────────────────────────────┘
```

### State 2: Active — next step due today

```
┌─ Widget Co · Bob Jones (CTO) ──────────────────────────────────┐
│  ●○○○  Step 1 sent Mar 10 · Onboarding Speed                   │
│                                                                 │
│  Step 2  DUE TODAY  "What slows down new engineers?"           │
│  Value-add  |  64 words                                         │
│  [Copy Subject] [Copy Body] [Mark Sent] [Skip] [Edit]          │
│                                                                 │
│  Step 3  Due Mar 17                                             │
│  Step 4  Due Mar 24                                             │
│                                              [Stop Sequence]   │
└─────────────────────────────────────────────────────────────────┘
```

### State 3: Active — next step scheduled (future)

```
┌─ DataFlow Inc · Sarah Park (Head of Data) ─────────────────────┐
│  ●●○○  Step 2 sent Mar 12 · AI Readiness                       │
│                                                                 │
│  Step 3  Due Mar 16 (in 4 days)   "Still relevant?"            │
│  Step 4  Due Mar 23               Break-up                     │
│                                              [Stop Sequence]   │
└─────────────────────────────────────────────────────────────────┘
```

### State 4: Replied (auto-stopped)

```
┌─ FooBar SaaS · Mike Chen (CTO) ────────────────────────────────┐
│  ●●⊘⊘  Replied Mar 13 · Sequence paused                        │
│                                                                 │
│  Step 3  Skipped (prospect replied)                             │
│  Step 4  Skipped (prospect replied)                             │
│                                                                 │
│  [Draft Reply]  [Convert to Deal]  [View Thread]               │
└─────────────────────────────────────────────────────────────────┘
```

### State 5: Completed (all steps sent, no reply)

```
┌─ TechCo Inc · Alex Rivera (VP Eng) ────────────────────────────┐
│  ●●●●  Completed Mar 24 · No response                          │
│                                                                 │
│  All 4 steps sent · No reply received                          │
│  [Re-engage Later]  [Mark Not Interested]  [Archive]           │
└─────────────────────────────────────────────────────────────────┘
```

---

## Progress Indicator

`●●○○` — filled circles = sent steps, empty circles = pending/scheduled steps.

Variants by state:

| State | Indicator | Color |
|---|---|---|
| Pending | `○○○○` | Gray |
| 1 sent | `●○○○` | Blue |
| 2 sent | `●●○○` | Blue |
| 3 sent | `●●●○` | Blue |
| Completed | `●●●●` | Green |
| Replied after step 2 | `●●⊘⊘` | Green (sent) + Gray crossed (skipped) |
| Cancelled | `●⊘⊘⊘` | Blue (sent) + Red crossed (cancelled) |

---

## Sorting Logic

**Sequences tab sort order:**
1. **Due today** — steps with `sequence_status = Due` (amber highlight, sorted oldest first)
2. **Pending** — step 1 never sent (needs action, sorted by creation date)
3. **Scheduled** — next step is in the future (sorted by next due date ascending)
4. **Replied** — prospect replied, awaiting follow-up action (sorted by reply date descending)
5. **Completed** — all steps sent, no reply (collapsed by default, expandable)

---

## Per-Step Action Buttons

| Button | When shown | Action |
|---|---|---|
| **Copy Subject** | Step is Due or Pending | Copies `email_subject` to clipboard |
| **Copy Body** | Step is Due or Pending | Copies `body` to clipboard |
| **Mark Sent** | Step is Due or Pending | Calls `mark_email_sent()` + triggers `activate_sequence()` if step 1 |
| **Edit** | Any unsent step | Inline edit of subject + body |
| **Skip** | Step is Due or Scheduled | Calls `skip_sequence_step()` — skips this step, keeps sequence active |
| **Stop Sequence** | Sequence is Active or Pending | Calls `cancel_sequence(reason: ManualStop)` — cancels all remaining steps |
| **Draft Reply** | State = Replied | Opens Reply Assist (PRD-12) |
| **Convert to Deal** | State = Replied | Opens Convert to Deal modal (PRD-06) |
| **Re-engage Later** | State = Completed | Creates a Task for future outreach (T+30) |
| **Mark Not Interested** | State = Completed | Tags company, removes from active view |

---

## "Due Today" Banner

At the top of the Sequences tab, a summary banner when steps are due:

```
┌──────────────────────────────────────────────────────────────┐
│  3 sequence steps due today                                   │
│  Widget Co (Step 2) · Initech (Step 3) · Globex (Step 2)    │
│  [Copy All Bodies]                                           │
└──────────────────────────────────────────────────────────────┘
```

"Copy All Bodies" — copies all due-today email bodies to clipboard as a numbered list. The SDR can paste them sequentially into Gmail without navigating per-company. Each body is separated by `--- [Company: Step N] ---` delimiter.

---

## Sidebar Navigation Badge

The Outbox sidebar nav item shows two counts:

```
◉  Outbox  [8 drafts · 3 due today]
```

- `8 drafts` = total single drafts pending (existing)
- `3 due today` = sequence steps due today (new)

The number turns amber when there are due-today items.

---

## Compact Mode

When a sequence has no steps due and no action needed (all future steps scheduled), the card renders in compact mode — one line, expandable:

```
▶ Widget Co · Bob Jones  ●○○○  Next: Step 2 due Mar 12
▶ DataFlow Inc · Sarah Park  ●●○○  Next: Step 3 due Mar 16
```

Clicking expands to the full card view.

---

## Empty State

```
┌──────────────────────────────────────────────────────────────┐
│                                                               │
│               No active sequences                             │
│                                                               │
│   Sequences are generated automatically by EmailFold.         │
│   Open EmailFold, run a company through the pipeline,         │
│   and send the sequence to EventFold.                         │
│                                                               │
│              [Open EmailFold]                                 │
│                                                               │
└──────────────────────────────────────────────────────────────┘
```

---

## New TypeScript Types

```typescript
// src-frontend/src/api/types.ts additions

export type SequenceStatus =
  | "Pending"
  | "Scheduled"
  | "Due"
  | "Sent"
  | "Skipped"
  | "Cancelled";

export type SequenceOverallStatus =
  | "Pending"
  | "Active"
  | "Replied"
  | "Completed"
  | "Cancelled";

export interface SequenceSummary {
  sequence_id: string;
  company_id: string;
  company_name: string;
  contact_id: string | null;
  contact_name: string | null;
  total_steps: number;
  steps_sent: number;
  next_step: SequenceStepRow | null;
  overall_status: SequenceOverallStatus;
  started_at: string;
}

export interface SequenceStepRow {
  interaction_id: string;
  step: number;
  day_offset: number;
  subject: string;
  body_preview: string;
  format: "cold" | "value_add" | "pattern_interrupt" | "breakup";
  angle: string;
  sequence_status: SequenceStatus;
  sequence_send_date: string | null;
  sent_at: string | null;
}
```

---

## New React Components

| Component | Location | Purpose |
|---|---|---|
| `SequenceCard` | `components/outbox/SequenceCard.tsx` | Full sequence card with progress indicator + step rows |
| `SequenceStepRow` | `components/outbox/SequenceStepRow.tsx` | Individual step within a card |
| `ProgressDots` | `components/ui/ProgressDots.tsx` | The `●●○○` indicator, reusable |
| `DueTodayBanner` | `components/outbox/DueTodayBanner.tsx` | Banner at top of Sequences tab |
| `SequenceEmptyState` | `components/outbox/SequenceEmptyState.tsx` | Empty state with link to EmailFold |

---

## Out of Scope

- Auto-stop / auto-advance logic → PRD-17
- Sequence metrics / analytics → PRD-18

---

## Open Questions for Senior Dev

1. Should the Sequences tab be the default tab for new users, or should Single Drafts remain the default? Recommendation: make Sequences default once sequences exist.
2. Is inline editing of a step's body/subject feasible within the Sequences tab, or should "Edit" open a modal? Inline is preferred (matches EmailCard edit UX from v0.5).
3. The "Copy All Bodies" feature copies multiple email bodies concatenated. Should this use the clipboard API directly or use a toast + a download-as-txt fallback for longer content?
