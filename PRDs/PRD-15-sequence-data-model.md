# PRD-15 — Sequence Data Model & Storage
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM)
**Priority:** P0
**Part of:** Sequence Builder (PRD-14 through PRD-18)
**Depends on:** PRD-02 (Interaction aggregate), PRD-09 (local API)

---

## Scope

This PRD covers **how sequences are stored in EventFold**: the extensions to the `Interaction` aggregate, the new event types, the new Rust structs, and the Tauri IPC commands that PRD-16/17/18 build on top of. This is the foundation layer — nothing else in the sequence feature works without this.

---

## Interaction Aggregate Extensions

Each sequence step is a separate `Interaction` record. Steps are linked by a shared `sequence_id` field and ordered by `sequence_step`. All new fields are `Option<T>` — fully backward-compatible with existing JSONL streams.

```rust
// In src/domain/interaction.rs — extend Interaction state struct:
pub struct Interaction {
    // --- All existing fields unchanged ---
    pub id: String,
    pub interaction_type: Option<InteractionType>,
    pub direction: Option<Direction>,
    pub summary: String,
    pub body: Option<String>,
    pub contact_id: Option<String>,
    pub company_id: Option<String>,
    pub deal_id: Option<String>,
    pub occurred_at: String,
    pub duration_minutes: Option<u32>,
    pub owner_id: Option<String>,

    // --- Email fields from PRD-02 ---
    pub email_subject: Option<String>,
    pub email_status: Option<EmailStatus>,
    pub ai_generated: bool,
    pub angle_name: Option<String>,

    // --- New sequence fields ---
    /// Shared UUID linking all steps of one sequence together.
    pub sequence_id: Option<String>,
    /// Step number within the sequence (1=cold, 2=follow-up 1, 3=pattern interrupt, 4=break-up).
    pub sequence_step: Option<u8>,
    /// The day offset from step 1's send date when this step should be sent.
    pub sequence_day_offset: Option<u8>,
    /// Format of this step: cold | value_add | pattern_interrupt | breakup.
    pub sequence_format: Option<String>,
    /// Current lifecycle status of this step.
    pub sequence_status: Option<SequenceStatus>,
    /// ISO date when this step is due to be sent (computed from step 1 sent_at + day_offset).
    pub sequence_send_date: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum SequenceStatus {
    /// Awaiting step 1 to be marked sent before due date can be computed.
    Pending,
    /// Due date is set, not yet reached.
    Scheduled,
    /// Due date has been reached — ready to send.
    Due,
    /// User sent this step.
    Sent,
    /// Prospect replied — this and all later steps were auto-skipped.
    Skipped,
    /// User manually stopped the sequence.
    Cancelled,
}
```

### New Event Variants

```rust
pub enum InteractionEvent {
    // --- All existing variants unchanged ---
    Created { ... },
    Updated { ... },
    EmailSent { sent_at: String },
    ReplyLogged { ... },
    EmailStatusUpdated { status: EmailStatus },

    // --- New sequence variants ---

    /// Step's send date was computed (step 1 marked sent, offsets calculated).
    SequenceSendDateSet {
        send_date: String,                     // ISO date
    },

    /// Step transitioned to Due (send date reached).
    SequenceStepDue {},

    /// Remaining steps were cancelled because the prospect replied.
    SequenceCancelledOnReply {
        trigger_interaction_id: String,        // the inbound reply Interaction ID
    },

    /// Sequence was manually stopped by the user.
    SequenceManuallyCancelled {
        cancelled_at: String,
    },

    /// Step was explicitly skipped by the user (not cancelled — just this step).
    SequenceStepSkipped {
        reason: Option<String>,
    },
}
```

---

## New API Endpoint (PRD-09 extension)

```
POST /api/email-sequence
```

Called by EmailFold after the user clicks "Send Sequence to EventFold."

**Request body:** `EmailSequencePayload` (defined in PRD-14)

**EventFold behavior:**
1. Parse and validate `__emailfold_sequence_v1` discriminator
2. Find or create Company (fuzzy match — same logic as `import_emailfold_draft`)
3. Find or create Contact
4. Create **4 Interaction records** — one per step:
   - Step 1: `email_status = Draft`, `sequence_status = Pending` (no send date yet — set when step 1 is marked sent)
   - Steps 2–4: `email_status = Draft`, `sequence_status = Pending`
   - All share `sequence_id`, have their `sequence_step` and `sequence_day_offset` set
5. Create one companion Note with the research snapshot (same as PRD-02)
6. Emit Tauri event: `emit('sequence-imported', { sequence_id, company_name, step_count: 4 })`
7. Show notification: "EmailFold: 4-step sequence ready for Acme Corp"

---

## New Tauri IPC Commands

```rust
/// Import a full email sequence from EmailFold (4 Interaction records + Note).
#[tauri::command]
pub async fn import_email_sequence(
    sequence_id: String,
    company_name: String,
    company_url: Option<String>,
    contact_name: String,
    contact_role: Option<String>,
    email_goal: String,
    occurred_at: String,
    research_note_body: String,
    steps: Vec<SequenceStepInput>,
    state: State<'_, AppState>,
) -> Result<ImportSequenceResult, AppError>

pub struct SequenceStepInput {
    pub step: u8,
    pub day_offset: u8,
    pub subject: String,
    pub body: String,
    pub format: String,
    pub angle: String,
}

pub struct ImportSequenceResult {
    pub sequence_id: String,
    pub interaction_ids: Vec<String>,    // one per step, in order
    pub company_id: String,
    pub contact_id: String,
    pub note_id: String,
    pub company_created: bool,
    pub contact_created: bool,
}

/// Cancel all remaining (Pending/Scheduled/Due) steps in a sequence.
/// Called when: prospect replies, user clicks "Stop Sequence", deal closed.
#[tauri::command]
pub async fn cancel_sequence(
    sequence_id: String,
    reason: CancelReason,
    trigger_interaction_id: Option<String>,  // set when reason = ReplyReceived
    state: State<'_, AppState>,
) -> Result<CancelSequenceResult, AppError>

pub enum CancelReason {
    ReplyReceived,
    ManualStop,
    DealClosed,
    NotInterested,
}

pub struct CancelSequenceResult {
    pub steps_cancelled: u32,
    pub steps_already_sent: u32,
}

/// After step 1 is marked sent, compute and set send dates for all future steps.
/// Called automatically by mark_email_sent when the interaction has a sequence_id.
#[tauri::command]
pub async fn activate_sequence(
    sequence_id: String,
    step1_sent_at: String,               // ISO datetime — anchor for offset computation
    state: State<'_, AppState>,
) -> Result<(), AppError>
// For each step N (day_offset = D):
//   send_date = date(step1_sent_at) + D days
//   sequence_status = Scheduled (or Due if send_date <= today)

/// Get all steps for a sequence.
#[tauri::command]
pub async fn get_sequence_steps(
    sequence_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<SequenceStepRow>, AppError>

pub struct SequenceStepRow {
    pub interaction_id: String,
    pub step: u8,
    pub day_offset: u8,
    pub subject: String,
    pub body_preview: String,            // first 120 chars
    pub format: String,
    pub angle: String,
    pub sequence_status: SequenceStatus,
    pub sequence_send_date: Option<String>,
    pub sent_at: Option<String>,
}

/// List all active sequences (not completed, not fully cancelled).
#[tauri::command]
pub async fn list_active_sequences(
    state: State<'_, AppState>,
) -> Result<Vec<SequenceSummary>, AppError>

pub struct SequenceSummary {
    pub sequence_id: String,
    pub company_id: String,
    pub company_name: String,
    pub contact_id: Option<String>,
    pub contact_name: Option<String>,
    pub total_steps: u8,
    pub steps_sent: u8,
    pub next_step: Option<SequenceStepRow>,
    pub overall_status: SequenceOverallStatus,
    pub started_at: String,
}

pub enum SequenceOverallStatus {
    Pending,      // step 1 not yet sent
    Active,       // step 1 sent, future steps scheduled
    Replied,      // prospect replied, remaining steps cancelled
    Completed,    // all steps sent, no reply
    Cancelled,    // manually stopped
}

/// Skip a single step without cancelling the whole sequence.
#[tauri::command]
pub async fn skip_sequence_step(
    interaction_id: String,
    reason: Option<String>,
    state: State<'_, AppState>,
) -> Result<(), AppError>
```

---

## Projection: SequenceIndex

The `list_active_sequences` command needs to join data across multiple Interaction streams. A dedicated projection maintains this index in memory.

```rust
// src/projections.rs — new projection

pub struct SequenceIndex {
    /// sequence_id → all steps for that sequence
    pub sequences: HashMap<String, SequenceRecord>,
    /// company_id → vec of sequence_ids
    pub by_company: HashMap<String, Vec<String>>,
    /// interaction_id → sequence_id (for reverse lookup on reply/mark-sent events)
    pub interaction_to_sequence: HashMap<String, String>,
}

pub struct SequenceRecord {
    pub sequence_id: String,
    pub company_id: String,
    pub company_name: String,
    pub contact_id: Option<String>,
    pub contact_name: Option<String>,
    pub steps: Vec<SequenceStepRecord>,
    pub overall_status: SequenceOverallStatus,
    pub created_at: String,
}

impl Projection for SequenceIndex {
    fn subscriptions(&self) -> &[&str] { &["interaction"] }

    fn apply(&mut self, _agg_type: &str, stream_id: &str, event: &eventfold::Event) {
        match event.event_type.as_str() {
            "Created" => {
                // If has sequence_id: add to sequences map, by_company, interaction_to_sequence
            }
            "EmailSent" => {
                // Update step status to Sent
                // If step 1: trigger send_date computation for steps 2-4
                // Recompute overall_status
            }
            "SequenceSendDateSet" => {
                // Update step's send_date and status (Scheduled or Due)
            }
            "SequenceStepDue" => {
                // Update step status to Due
            }
            "SequenceCancelledOnReply" | "SequenceManuallyCancelled" => {
                // Update remaining steps to Skipped/Cancelled
                // Update overall_status
            }
            _ => {}
        }
    }
}
```

---

## Registration

```rust
// src/lib.rs — add to setup:
.manage(SequenceIndex::new())               // register projection

// Add to invoke_handler!:
import_email_sequence,
cancel_sequence,
activate_sequence,
get_sequence_steps,
list_active_sequences,
skip_sequence_step,
```

---

## Out of Scope

- Outbox Sequences tab UI → PRD-16
- Auto-stop on reply / auto-advance on send → PRD-17
- Metrics and analytics → PRD-18

---

## Open Questions for Senior Dev

1. Does the existing `mark_email_sent` command (PRD-02) need to call `activate_sequence` internally when the interaction has a `sequence_id`? Or should this be a process manager that reacts to the `EmailSent` event?
2. The `SequenceIndex` projection joins company/contact names — does it subscribe to `company` and `contact` events to keep names updated, or does it do a one-time lookup on `Created`?
3. Is there a background task (tokio interval) that transitions steps from `Scheduled → Due` when `sequence_send_date <= today`? Or is `Due` status only computed at query time?
