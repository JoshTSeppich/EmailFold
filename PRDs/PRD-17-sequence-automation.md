# PRD-17 — Sequence Automation
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM)
**Priority:** P0
**Part of:** Sequence Builder (PRD-14 through PRD-18)
**Depends on:** PRD-15 (data model), PRD-12 (reply logging)

---

## Scope

This PRD covers the **automated behaviors** that make sequences self-managing: auto-stop when a prospect replies, auto-advance (recalculate due dates) when a step is marked sent, auto-task creation for each upcoming step, and the background scheduler that transitions steps from Scheduled → Due when their date arrives.

These behaviors are what separate a "tracked email list" from an actual sequence engine. Without this automation, the SDR has to manually manage timing and cancellation — which defeats the purpose.

---

## Behavior 1: Auto-Stop on Reply

When a prospect's reply is logged (via PRD-12 Reply Assist or the Outbox "Log Reply" button), all remaining sequence steps for that company must be immediately cancelled. Sending step 3 to someone already in a meeting conversation is a critical failure mode.

### Trigger

Any call to `log_email_reply(original_interaction_id, ...)` where the original interaction has a `sequence_id`.

### Implementation

`log_email_reply` (PRD-02) is extended to detect a `sequence_id` on the source interaction and call `cancel_sequence` automatically:

```rust
// In the log_email_reply command handler:

pub async fn log_email_reply(
    original_interaction_id: String,
    reply_summary: String,
    reply_body: Option<String>,
    replied_at: String,
    state: State<'_, AppState>,
) -> Result<String, AppError> {

    // 1. Create the inbound reply Interaction (existing logic)
    let reply_id = create_inbound_interaction(...).await?;

    // 2. Check if original interaction is part of a sequence
    let original = state.get_interaction(&original_interaction_id).await?;
    if let Some(sequence_id) = &original.sequence_id {
        // 3. Cancel all remaining steps in the sequence
        cancel_sequence_internal(
            sequence_id.clone(),
            CancelReason::ReplyReceived,
            Some(reply_id.clone()),
            &state,
        ).await?;

        // 4. Emit Tauri event for frontend to update UI
        state.app_handle.emit_all("sequence-auto-cancelled", json!({
            "sequence_id": sequence_id,
            "reason": "reply_received",
            "company_name": original.company_name,
        })).ok();
    }

    Ok(reply_id)
}
```

### `cancel_sequence_internal` logic

For every step in the sequence with `sequence_status IN (Pending, Scheduled, Due)`:
1. Emit `SequenceCancelledOnReply { trigger_interaction_id }` event on that Interaction's stream
2. Update `sequence_status → Skipped`
3. Cancel the associated Task (if one exists for this step)
4. Update `SequenceIndex` projection to reflect `overall_status = Replied`

### Frontend response

The frontend listens for `sequence-auto-cancelled` event and immediately re-renders the affected SequenceCard with the Replied state (●●⊘⊘ indicator + Draft Reply / Convert to Deal CTAs). No page refresh required.

---

## Behavior 2: Auto-Activate on Step 1 Mark Sent

When the SDR clicks "Mark Sent" on Step 1, the sequence is activated: due dates are computed for all future steps based on step 1's send timestamp + each step's day offset.

### Trigger

`mark_email_sent(id, sent_at)` where the interaction has `sequence_step = 1` and a `sequence_id`.

### Implementation

`mark_email_sent` is extended to call `activate_sequence` when the step is step 1:

```rust
pub async fn mark_email_sent(
    id: String,
    sent_at: String,
    state: State<'_, AppState>,
) -> Result<(), AppError> {

    // 1. Existing: emit EmailSent event, update email_status → Sent
    let interaction = emit_email_sent(&id, &sent_at, &state).await?;

    // 2. Create follow-up Task (existing T+7 behavior from PRD-02)
    create_followup_task(&interaction, &state).await?;

    // 3. NEW: if this is a sequence step 1, activate the sequence
    if interaction.sequence_step == Some(1) {
        if let Some(sequence_id) = &interaction.sequence_id {
            activate_sequence_internal(sequence_id, &sent_at, &state).await?;
        }
    }

    // 4. NEW: if this is step 2/3, update next step's status to Scheduled
    //    (the due dates were already set by activate_sequence; this advances
    //     the sequence_step counter in the projection)

    Ok(())
}

async fn activate_sequence_internal(
    sequence_id: &str,
    step1_sent_at: &str,
    state: &AppState,
) -> Result<(), AppError> {
    let anchor_date = parse_date(step1_sent_at)?;
    let steps = state.sequence_index.get_steps(sequence_id)?;

    for step in steps.iter().filter(|s| s.step > 1) {
        let send_date = anchor_date + Duration::days(step.day_offset as i64);
        let status = if send_date <= today() {
            SequenceStatus::Due
        } else {
            SequenceStatus::Scheduled
        };

        // Emit SequenceSendDateSet on each step's Interaction stream
        emit_event(&step.interaction_id, InteractionEvent::SequenceSendDateSet {
            send_date: send_date.to_iso_string(),
        }).await?;

        // Create a Task for each future step
        create_sequence_task(&step, &send_date, state).await?;
    }

    Ok(())
}
```

### Task creation per step

Each future step gets a Task created in EventFold:

```rust
async fn create_sequence_task(step: &SequenceStepRecord, due_date: &Date, state: &AppState) {
    create_task(TaskInput {
        title: format!(
            "Send Step {} to {} at {}",
            step.step,
            step.contact_name.as_deref().unwrap_or("contact"),
            step.company_name
        ),
        description: Some(format!(
            "Sequence step {} ({}) — Subject: {}",
            step.step, step.format, step.subject
        )),
        due_at: due_date.to_iso_string(),
        company_id: Some(step.company_id.clone()),
        contact_id: step.contact_id.clone(),
        deal_id: None,
        metadata: Some(json!({
            "type": "sequence_step",
            "sequence_id": step.sequence_id,
            "interaction_id": step.interaction_id,
            "step": step.step,
        })),
    }, state).await;
}
```

The task description includes the subject line so the SDR knows exactly what to send when the task fires — no navigation required.

---

## Behavior 3: Background Scheduler — Scheduled → Due

Steps transition from `Scheduled` to `Due` when `sequence_send_date <= today`. This needs to happen automatically so the Outbox's "Due Today" list stays accurate without requiring a user action.

### Options

**Option A: Query-time computation (simplest)**
The `list_active_sequences` command computes `Due` status on-the-fly: if `sequence_send_date <= today()`, treat it as Due regardless of stored status. No background task needed.

**Option B: Background tokio interval (more accurate)**
A background task runs every hour and emits `SequenceStepDue` events for steps that have crossed their date. The frontend receives real-time updates via Tauri events.

**Recommendation: Option A for MVP.** The "Due Today" determination at query time is accurate and requires no background infrastructure. If real-time notifications ("Step 2 for Acme Corp just became due") are needed, add Option B in Phase 2.

```rust
// In list_active_sequences / SequenceIndex — compute effective status:
fn effective_status(step: &SequenceStepRecord) -> SequenceStatus {
    if step.sequence_status == SequenceStatus::Scheduled {
        if let Some(send_date) = &step.sequence_send_date {
            if parse_date(send_date) <= today() {
                return SequenceStatus::Due;
            }
        }
    }
    step.sequence_status.clone()
}
```

---

## Behavior 4: Sequence Completion Detection

When the last step (step 4) is marked sent, the sequence transitions to `Completed`. The SequenceIndex projection handles this:

```rust
// In SequenceIndex.apply() on EmailSent event:
if step.step == 4 {
    record.overall_status = SequenceOverallStatus::Completed;
}
```

On Completed, the Outbox card transitions to the Completed state (●●●● green, Re-engage / Not Interested CTAs). No backend command needed — derived from projection state.

---

## Behavior 5: Task Tap → Sequence Context

When the SDR taps a sequence-related Task in the Task list, EventFold should route them directly to the right Outbox card — not just show the task detail.

Tasks created by `create_sequence_task` have `metadata.type = "sequence_step"` and `metadata.interaction_id`. The Task detail view checks for this metadata and shows a contextual link:

```
Task: "Send Step 2 to Jane Smith at Acme Corp"
Due: Mar 13, 2026
────────────────────────────────────────────
This is a sequence step.
[Go to Outbox → Acme Corp Sequence]
────────────────────────────────────────────
Step 2 Subject: "One thing about Postgres at scale"
[Copy Subject] [Copy Body]
```

---

## Process Manager: SequenceReplyWatcher

For a cleaner architecture, the auto-stop logic can be extracted into a process manager that reacts to `ReplyLogged` events instead of being embedded in the command handler:

```rust
pub struct SequenceReplyWatcher {
    // Tracks which sequences have already been cancelled (idempotency)
    cancelled: HashSet<String>,
}

impl ProcessManager for SequenceReplyWatcher {
    const NAME: &'static str = "sequence-reply-watcher";
    fn subscriptions(&self) -> &[&str] { &["interaction"] }

    fn react(&mut self, _: &str, stream_id: &str, event: &eventfold::Event) -> Vec<CommandEnvelope> {
        if event.event_type != "ReplyLogged" { return vec![]; }

        // Lookup sequence_id for this interaction from SequenceIndex
        // For each remaining step: emit CancelSequence command
        // ...
    }
}
```

**Tradeoff:** The process manager approach is cleaner but requires the PM to have read access to `SequenceIndex` to look up sibling steps. If the architecture supports this, use the PM. If not, the embedded approach in `log_email_reply` is acceptable for MVP.

---

## Out of Scope

- Sending emails automatically (user always sends manually via Gmail/Outlook)
- Scheduling sequence activation for a future time
- Pausing a sequence without cancelling (pause = delay all future send dates by N days)
- Re-activating a cancelled sequence

---

## Open Questions for Senior Dev

1. Can a Process Manager access other projections (like `SequenceIndex`) to look up sibling step IDs? Or does it only receive the raw event data?
2. When `activate_sequence_internal` creates Tasks for future steps, what task `owner_id` should be used? The interaction's `owner_id` if set, or `null`?
3. If step 1 is marked sent on a weekend, should the day offsets skip weekends? (e.g., step 2 at day+3 should be Monday not Saturday). This is a configurable preference — default to calendar days, not business days, for simplicity.
