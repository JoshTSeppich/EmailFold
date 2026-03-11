# PRD-14 — Sequence Builder: Follow-ups Where Deals Actually Close
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** EmailFold owner + EventFold senior dev
**Priority:** P0 — Follow-ups are where deals close
**Depends on:** PRD-02 (Interaction status), PRD-09 (local API), PRD-13 (LinkedIn variant optional)

---

## Problem

Cold email reply rates for follow-up #2 and #3 are often higher than the original cold email. The prospect didn't reply to email #1 because of timing, inbox volume, or they skimmed it. Follow-up #2 hits them at a different moment with a different angle. Follow-up #3 (the break-up email) gets a response precisely because it creates finality.

The current pipeline: generate one cold email, send it, create a T+7 task. When the task fires, the SDR is staring at a blank screen again. There's no "generate my follow-up" action. No angle variation for follow-ups. No break-up email. The most important part of the cadence is entirely unbuilt.

**What the data says:**
- 44% of reps give up after one follow-up
- 80% of deals require 5+ touchpoints
- The #2 email gets 40% of all replies in a 5-email sequence

The pipeline does step 1. Steps 2–5 don't exist.

---

## Proposed Solution

A **Sequence** is a pre-generated set of 3–5 touchpoints for a company. Generated at the same time as the original cold email, stored in EventFold alongside the Interaction. The Outbox knows what step each company is on and surfaces the next touchpoint at the right time.

Each touchpoint is a different format and angle — not the same email re-sent. The sequence is designed as a coherent arc:

```
Email #1 — Cold outreach (existing Phase 2, the "hook")
Email #2 — Day 3, different angle, adds value (resource or insight)
Email #3 — Day 7, shorter, assumes they're busy (pattern interrupt)
Email #4 — Day 14, break-up email (creates finality, often gets a response)
LinkedIn  — Woven in at Day 0 and Day 8 (PRD-13)
```

---

## Sequence Design Philosophy

Each step is a **separate creative brief**, not a variation of step 1. The SDR is building a mini-conversation arc even before the prospect replies:

| Step | Day | Format | Goal | Tone |
|---|---|---|---|---|
| Email 1 | 0 | Full cold email (existing) | First impression, hook with angle | Confident, peer-to-peer |
| Email 2 | 3 | Value-add (share something useful) | Stay relevant, different entry point | Helpful, no ask |
| Email 3 | 7 | Ultra-short (3 sentences) | Pattern interrupt, lower the ask | Direct, human |
| Email 4 | 14 | Break-up email | Create finality, get a definitive answer | Respectful, honest |

---

## Generation: All at Once

Sequences are generated as a **batch job** during EmailFold's Phase 2. Same research, one additional model call, full sequence produced before the SDR starts sending.

```javascript
const generateSequence = async (company, contact, research, angles, tone) => {
  // Phase 2 already runs — generates email #1 (existing behavior unchanged)
  const coldEmail = await runPhase2(company, contact, research, angles, tone);

  // NEW: Phase 2b — generate sequence steps 2-4
  const sequence = await anthropic.messages.create({
    model: "claude-sonnet-4-5",
    max_tokens: 2000,
    system: `You are a world-class B2B outreach sequencer for Foxworks Studios.
             ${TONE_PROMPTS[tone]}
             You are writing a follow-up sequence to support a cold email campaign.
             Each step must feel like a natural continuation, not a copy-paste.`,
    messages: [{
      role: "user",
      content: `
The following cold email was already sent (Email #1):

COMPANY: ${company.name} (${company.website_url})
CONTACT: ${contact.name}, ${contact.title}
COLD EMAIL SUBJECT: ${coldEmail.emails[0].subject}
COLD EMAIL BODY: ${coldEmail.emails[0].body}
ANGLE USED: ${coldEmail.emails[0].angle}
HOOK: ${coldEmail.emails[0].hook_used}

ADDITIONAL COMPANY INTEL:
${JSON.stringify(research, null, 2)}

Generate a 3-step follow-up sequence. Each step must:
- Feel like a distinct communication, not a re-pitch
- Reference the prior email naturally ("Following up on my note last week...")
- Get progressively shorter
- Step 4 must be a genuine break-up email — honest, no tricks

Return JSON:
{
  "sequence": [
    {
      "step": 2,
      "day": 3,
      "subject": "subject line",
      "body": "email body",
      "format": "value_add",
      "angle": "angle name or description",
      "value_offered": "what useful thing are you sharing or saying?"
    },
    {
      "step": 3,
      "day": 7,
      "subject": "subject line",
      "body": "email body (max 60 words)",
      "format": "pattern_interrupt",
      "angle": "description"
    },
    {
      "step": 4,
      "day": 14,
      "subject": "subject line",
      "body": "email body (the break-up — max 80 words)",
      "format": "breakup",
      "angle": "closing"
    }
  ]
}
`
    }]
  });

  return {
    cold_email: coldEmail,
    sequence: JSON.parse(extractJSON(sequence.content[0].text)).sequence,
  };
};
```

**Cost:** One additional Sonnet call per company, ~$0.005. Total per company including all steps: ~$0.011. Still under $0.02 for the full sequence + cold email.

**Time:** Runs in parallel with Phase 2 for other companies. Net latency impact: ~0 (hidden by concurrent queue).

---

## Sequence Step Formats

### Step 2: Value-Add (Day 3)

Not a follow-up. Offers something useful — a relevant insight, a case study reference, a specific question. Doesn't re-pitch.

```
Subject: One thing about Postgres at scale

Hi Jane,

I forgot to mention something in my last note — we published a breakdown
of how teams your size typically approach migration sequencing without
downtime. Happy to share it if useful.

Either way, would a 15-minute conversation make sense this week?

[Name]
```

The "value" can be:
- A case study from a similar company
- A relevant stat or observation from their Phase 1 research
- A question about something specific they're working on
- A tool or resource genuinely useful to them

### Step 3: Pattern Interrupt (Day 7)

Ultra-short. Different energy. Acknowledges they're busy.

```
Subject: Still relevant?

Jane — still think there's something here for Acme or should I leave
you alone?

[Name]
```

The goal isn't to re-pitch. It's to get any response — even "not now" is useful data.

### Step 4: Break-up Email (Day 14)

Honest. Creates finality. Paradoxically, break-up emails have some of the highest reply rates in a sequence because humans respond to closure.

```
Subject: Closing the loop

Jane,

I've reached out a few times without hearing back, so I'll assume
the timing isn't right.

I'll stop following up. If anything changes on your end — hiring
pressure, a failed migration, new leadership focus — feel free to
reach out.

Good luck with Q2.

[Name]
```

What NOT to do in a break-up email:
- Guilt trips ("I know you've been busy...")
- Re-pitching
- Asking why they didn't reply
- Being passive-aggressive

---

## EventFold: Sequence Storage

Each sequence step is a separate `Interaction` record linked by a `sequence_id` field:

```rust
// New optional fields on Interaction aggregate (backward-compatible):
sequence_id: Option<String>,         // groups all steps for a company together
sequence_step: Option<u8>,           // 1 = cold, 2 = follow-up 1, etc.
sequence_send_date: Option<String>,  // ISO date when this step should be sent
sequence_status: Option<SequenceStatus>,

pub enum SequenceStatus {
    Scheduled,    // not yet at send date
    Due,          // send date reached, awaiting send
    Sent,
    Skipped,      // company replied — skip remaining steps
    Cancelled,    // company not interested / manually stopped
}
```

When EmailFold generates a sequence and POSTs to EventFold via PRD-09 `/api/email-draft`:

- Creates **4 Interaction records** (one per step)
- Step 1: `sequence_status = Due` (ready to send)
- Steps 2–4: `sequence_status = Scheduled` with future `sequence_send_date`
- All share the same `sequence_id`

---

## EventFold: Sequence View in Outbox

The Outbox gains a "Sequences" tab showing all active sequences with their current step:

```
+──────────────────────────────────────────────────────────────────+
│  Email Outbox                                                     │
├──────────────────────────────────────────────────────────────────┤
│  [Single Drafts] [Sequences (12 active)] [Sent] [Replied]        │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  ┌─ Acme Corp · Jane Smith ──────────────────────────────────┐  │
│  │  Step 1/4 ●●○○  Sent Mar 10   Technical Debt Automation   │  │
│  │                                                            │  │
│  │  Step 2  DUE TODAY  "One thing about Postgres at scale"   │  │
│  │          [Copy Body] [Mark Sent] [Edit] [Skip Step]        │  │
│  │                                                            │  │
│  │  Step 3  Mar 17  "Still relevant?"                        │  │
│  │  Step 4  Mar 24  Break-up                                 │  │
│  │                                           [Stop Sequence] │  │
│  └──────────────────────────────────────────────────────────┘  │
│                                                                   │
│  ┌─ Widget Co · Bob Jones ───────────────────────────────────┐  │
│  │  Step 1/4 ●○○○  Sent Mar 9   Onboarding Speed             │  │
│  │  Step 2  Due Mar 12  "What slows down new engineers?"     │  │
│  │  Step 3  Due Mar 16                                        │  │
│  │  Step 4  Due Mar 23                                        │  │
│  └──────────────────────────────────────────────────────────┘  │
└──────────────────────────────────────────────────────────────────┘
```

**Progress indicator:** `●●○○` shows 2 of 4 steps complete at a glance.

**"Due today"** steps are highlighted in amber — the SDR's primary action items for the day.

**"Stop Sequence"** immediately transitions all remaining steps to `Cancelled`. Used when the company replies (auto-triggered) or the SDR decides to stop pursuing.

---

## Auto-Stop on Reply

When a prospect replies and the SDR logs it via PRD-12 (Reply Assist) or the Outbox "Log Reply" button:

EventFold automatically:
1. Finds all `Interaction` records sharing the same `sequence_id`
2. Transitions all `Scheduled` steps to `SequenceStatus::Skipped`
3. Shows a notification: "Sequence paused — Acme Corp replied"

The SDR should never accidentally send step 3 to someone who's already in a meeting conversation.

---

## Auto-advance on Mark Sent

When the SDR clicks "Mark Sent" on Step 2:
1. Step 2 transitions to `Sent`
2. Step 3's `sequence_send_date` activates (already computed as Step 2's sent_at + 4 days)
3. Outbox re-sorts — Step 3 now shows as a future due item
4. Task auto-created: "Send Step 3 to Jane Smith at Acme Corp" due on `sequence_send_date`

No manual scheduling required. The calendar populates itself.

---

## New Tauri IPC Commands

```rust
/// Import a full sequence (4 Interaction records with shared sequence_id).
/// Called by EmailFold via local API on Phase 2 completion.
#[tauri::command]
pub async fn import_email_sequence(
    company_id: String,
    contact_id: String,
    sequence_id: String,           // UUID generated by EmailFold
    steps: Vec<SequenceStepInput>,
    state: State<'_, AppState>,
) -> Result<ImportSequenceResult, AppError>

pub struct SequenceStepInput {
    pub step: u8,
    pub day_offset: u8,            // days after step 1 send
    pub subject: String,
    pub body: String,
    pub format: String,            // "cold" | "value_add" | "pattern_interrupt" | "breakup"
    pub angle: String,
}

pub struct ImportSequenceResult {
    pub sequence_id: String,
    pub interaction_ids: Vec<String>,  // one per step
    pub task_ids: Vec<String>,         // one task per future step
}

/// Stop all remaining steps in a sequence.
#[tauri::command]
pub async fn cancel_sequence(
    sequence_id: String,
    reason: String,                // "replied" | "not_interested" | "manual"
    state: State<'_, AppState>,
) -> Result<(), AppError>

/// List active sequences with current step status.
#[tauri::command]
pub async fn list_active_sequences(
    state: State<'_, AppState>,
) -> Result<Vec<SequenceSummary>, AppError>

pub struct SequenceSummary {
    pub sequence_id: String,
    pub company_id: String,
    pub company_name: String,
    pub contact_name: String,
    pub total_steps: u8,
    pub current_step: u8,          // highest step with status=Sent
    pub next_step: Option<SequenceStepSummary>,
    pub status: String,            // "active" | "replied" | "completed" | "cancelled"
}

pub struct SequenceStepSummary {
    pub step: u8,
    pub interaction_id: String,
    pub subject: String,
    pub due_date: String,
    pub sequence_status: SequenceStatus,
}
```

---

## EmailFold UI Changes

### Phase 2 output: Sequence tab alongside email cards

```
Company: Acme Corp — Jane Smith (VP Engineering)

[Email Variants] [Full Sequence ●]         ← new tab

Full Sequence tab:
──────────────────────────────────────────────────────
Step 1 (Day 0)  — Technical Debt Automation [Cold]
  Subject: "Your AI roadmap and where we fit in"
  [View] [Edit]

Step 2 (Day 3)  — Value Add
  Subject: "One thing about Postgres at scale"
  [View] [Edit]

Step 3 (Day 7)  — Pattern Interrupt
  Subject: "Still relevant?"
  [View] [Edit]

Step 4 (Day 14) — Break-up
  Subject: "Closing the loop"
  [View] [Edit]

[→ Send Sequence to CRM]   ← POSTs all 4 steps via PRD-09
```

"Send Sequence to CRM" replaces "Send to CRM" from PRD-02. Instead of posting one draft, it posts all 4 steps as a batch.

---

## Sequence Dashboard Widget (EventFold)

On the main Dashboard, alongside the existing Outreach widget:

```
┌─────────────────────────────────┐
│  Active Sequences (12)          │
│  3 steps due today              │
│  2 completed this week          │
│  4 cancelled (got replies ✓)    │
│  [Open Sequences View]          │
└─────────────────────────────────┘
```

---

## Out of Scope

- Automated sending (user still sends via Gmail/Outlook)
- A/B testing sequence variants
- Variable delay logic (e.g., skip weekends)
- Sequences longer than 4 steps (can be extended later)
- SMS or call steps in the sequence

---

## Success Metrics

- % of EmailFold runs that generate a full sequence: **> 85%** (should be default behavior)
- Average steps sent per company before response: increases from 1.3 → target 2.8
- Reply rate across full sequence: target **> 20%** (vs current ~10% for single email)
- Sequence completion rate (all 4 steps sent without reply): **< 40%** (meaning 60% get a response before break-up — this is the goal)
- Time to generate sequence (steps 2–4) after cold email: **< 5 seconds** (runs in parallel)
