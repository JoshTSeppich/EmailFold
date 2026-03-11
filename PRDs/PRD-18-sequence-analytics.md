# PRD-18 — Sequence Analytics
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM)
**Priority:** P2
**Part of:** Sequence Builder (PRD-14 through PRD-18)
**Depends on:** PRD-15 (data model), PRD-17 (automation), PRD-07 (metrics dashboard)

---

## Scope

This PRD covers **sequence-level analytics**: which step gets the reply, which format works best, sequence completion rates, and the dashboard widgets that surface actionable intelligence. This is built on top of the data captured by PRD-15 and PRD-17 — no new aggregate changes needed.

---

## The Core Questions Sequence Analytics Answers

1. **Which step generates the most replies?** (Are replies coming from step 1, step 2, or the break-up email?)
2. **What's our completion rate?** (How often does the prospect go silent through all 4 steps?)
3. **Which step format converts best?** (Does "value_add" outperform "pattern_interrupt"?)
4. **What's the average steps-to-reply?** (Is 1.4 steps on average, or 2.8?)
5. **Which angles generate sequences that convert?** (Not just cold email reply rate, but full-sequence reply rate)

---

## Metrics Definitions

### Sequence-Level Metrics

| Metric | Definition |
|---|---|
| `sequences_started` | Total sequences with step 1 sent |
| `sequences_replied` | Sequences where status = Replied (prospect replied at any step) |
| `sequences_completed` | Sequences where all 4 steps sent, no reply |
| `sequences_cancelled` | Sequences manually stopped before completion |
| `sequence_reply_rate` | replied / (replied + completed) |
| `avg_steps_to_reply` | mean(step number where reply logged) across all replied sequences |
| `step_N_reply_rate` | % of sequences where reply came after step N specifically |

### Step-Level Metrics

| Metric | Definition |
|---|---|
| `step_N_sent` | Count of step N interactions with email_status = Sent |
| `step_N_reply_rate` | Replies received after step N / step N sent |
| `step_N_open_rate` | N/A (no open tracking — skip) |
| `format_value_add_reply_rate` | Reply rate for all step 2s (value_add format) |
| `format_pattern_interrupt_reply_rate` | Reply rate for all step 3s |
| `format_breakup_reply_rate` | Reply rate for all step 4s — the "Lazarus rate" |

### Lazarus Rate

The break-up email (step 4) reply rate is tracked separately and labeled "Lazarus" — the % of completely silent prospects who respond only to the break-up email. This is a key metric for calibrating whether to extend sequences to 5 steps.

---

## New Projection: SequenceMetrics

Extends the `EmailOutreachMetrics` projection from PRD-07 with sequence-specific counters.

```rust
// In src/projections.rs — extend or add alongside EmailOutreachMetrics

pub struct SequenceMetrics {
    // Sequence-level
    pub started: u64,
    pub replied: u64,
    pub completed: u64,
    pub cancelled: u64,

    // Reply attribution — which step triggered the reply?
    pub reply_at_step: HashMap<u8, u64>,        // step_number → count of replies after that step
    pub steps_to_reply_total: u64,              // sum of all step numbers for avg computation
    pub steps_to_reply_count: u64,              // count of replied sequences

    // Step-level sent/reply counts
    pub step_sent: HashMap<u8, u64>,            // step → total sent
    pub step_replied: HashMap<u8, u64>,         // step → total replies triggered

    // Format performance
    pub format_sent: HashMap<String, u64>,      // format → sent count
    pub format_replied: HashMap<String, u64>,   // format → reply count

    // Angle-level (from angle field on Interaction)
    pub by_angle: HashMap<String, AngleSequenceStats>,

    // Time-bucketed (ISO week)
    pub started_by_week: HashMap<String, u64>,
    pub replied_by_week: HashMap<String, u64>,
}

pub struct AngleSequenceStats {
    pub angle_name: String,
    pub sequences_started: u32,
    pub sequences_replied: u32,
    pub avg_steps_to_reply: f32,
}

impl Projection for SequenceMetrics {
    fn subscriptions(&self) -> &[&str] { &["interaction"] }

    fn apply(&mut self, _: &str, _: &str, event: &eventfold::Event) {
        match event.event_type.as_str() {
            "EmailSent" => {
                // If sequence_step == 1: increment started
                // Increment step_sent[step]
            }
            "ReplyLogged" => {
                // If sequence_id present: increment replied, reply_at_step[step]
                // Increment steps_to_reply_total + count
            }
            "SequenceCancelledOnReply" => {
                // Update sequence status to replied in projection
            }
            "SequenceManuallyCancelled" => {
                // Increment cancelled
            }
            // When all 4 steps sent with no reply → completed
            // (detected when step 4 EmailSent and no ReplyLogged in sequence)
            _ => {}
        }
    }
}
```

---

## New IPC Commands

```rust
/// Get sequence-level metrics for a date range.
#[tauri::command]
pub async fn get_sequence_metrics(
    start_date: Option<String>,
    end_date: Option<String>,
    state: State<'_, AppState>,
) -> Result<SequenceMetricsOutput, AppError>

pub struct SequenceMetricsOutput {
    pub started: u64,
    pub replied: u64,
    pub completed: u64,
    pub cancelled: u64,
    pub reply_rate: f64,             // replied / (replied + completed)
    pub avg_steps_to_reply: f64,
    pub lazarus_rate: f64,           // reply_at_step[4] / step_sent[4]
    pub by_step: Vec<StepStats>,
    pub by_format: Vec<FormatStats>,
    pub by_angle: Vec<AngleSequenceStats>,
}

pub struct StepStats {
    pub step: u8,
    pub format: String,
    pub sent: u64,
    pub replied: u64,
    pub reply_rate: f64,
}

pub struct FormatStats {
    pub format: String,
    pub sent: u64,
    pub replied: u64,
    pub reply_rate: f64,
}
```

---

## Dashboard: Sequence Analytics Panel

Extends the Prospecting Metrics dashboard from PRD-07 with a Sequence section.

### Sequence Funnel

```
Sequence Funnel (last 90 days)
──────────────────────────────────────────────────────────
Started:      45 sequences
  ↓ Step 1 sent:    45   reply rate: 8%   → 4 replies
  ↓ Step 2 sent:    38   reply rate: 13%  → 5 replies  ← most replies
  ↓ Step 3 sent:    28   reply rate: 11%  → 3 replies
  ↓ Step 4 sent:    20   reply rate: 15%  → 3 replies  ← Lazarus
Completed (no reply):    17 (38%)
Total reply rate:         33% (15/45)
──────────────────────────────────────────────────────────
Average steps to reply:   2.4
```

### Step Performance Table

```
Step Performance
──────────────────────────────────────────────────────
Step  Format              Sent  Replies  Rate   Trend
──────────────────────────────────────────────────────
  1   Cold                 45      4     8%     →
  2   Value-Add            38      5     13%    ↑
  3   Pattern Interrupt    28      3     11%    →
  4   Break-up (Lazarus)   20      3     15%    ↑ 🏆
──────────────────────────────────────────────────────
```

Insight callout: "Your break-up email (Step 4) has the highest reply rate at 15%. Consider A/B testing a stronger step 4 subject line."

### Angle × Sequence Performance

```
Angle Performance in Sequences (full-sequence reply rate)
──────────────────────────────────────────────────────────
Angle                    Sequences  Replies  Full Rate
──────────────────────────────────────────────────────────
AI Readiness                 12        5      42%  🏆
Technical Debt Automation    18        6      33%
Onboarding Speed             10        3      30%
Migration Cost                5        1      20%
──────────────────────────────────────────────────────────
```

Note: "Full rate" = replies across all 4 steps of that angle's sequences, not just step 1. This is different from PRD-07's cold email reply rate.

### Lazarus Widget

Dedicated callout for the break-up email metric:

```
┌─────────────────────────────────────────┐
│  ⚡ Lazarus Rate                          │
│  15% of prospects reply ONLY to the     │
│  break-up email (Step 4).               │
│                                          │
│  This month: 3 deals at risk of being   │
│  left on the table without a Step 4.    │
│  [View Sequences Without Step 4]         │
└─────────────────────────────────────────┘
```

---

## Sequence Analytics on Company Detail

On the Company Detail page, the "Intel" tab (PRD-05) gets a Sequence History sub-section:

```
Sequence History — Acme Corp
─────────────────────────────────────────────────────
Mar 10, 2026 — Jane Smith (VP Engineering)
  ●●⊘⊘  Replied after Step 2 — Converted to Deal
  Angle: Technical Debt Automation

Jan 5, 2026 — Mike Chen (CTO) [previous contact]
  ●●●●  Completed — No reply
  Angle: AI Readiness
─────────────────────────────────────────────────────
```

This surfaces: "We've run 2 sequences at this company. One worked with Jane, one didn't with Mike." Invaluable context before starting a new sequence.

---

## Out of Scope

- A/B testing different subject lines or body variants within a sequence
- Predictive "which step will this prospect reply to" scoring
- Competitor benchmarking (we don't have industry reply rate data)
- Per-SDR analytics (single user for now)

---

## Open Questions for Senior Dev

1. The "Lazarus Rate" requires knowing that step 4 is specifically the break-up email. Should this be detected by `sequence_format = "breakup"` on the Interaction, or by `sequence_step = 4` convention?
2. Detecting "sequence completed" in the projection requires knowing when ALL steps of a sequence have been sent. Does the `SequenceMetrics` projection track a set of sent steps per sequence_id to detect this, or does it rely on `SequenceIndex.overall_status`?
3. For the Angle × Sequence Performance table, the "angle" is currently stored on Step 1's `angle_name` field. Steps 2–4 have their own `angle` notes but they're different. Should the sequence be attributed to Step 1's angle (the "opening angle") for simplicity?
