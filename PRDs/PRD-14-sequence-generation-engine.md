# PRD-14 — Sequence Generation Engine
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** EmailFold owner
**Priority:** P0
**Part of:** Sequence Builder (PRD-14 through PRD-18)
**Depends on:** PRD-10 (contact research), PRD-09 (local API)

---

## Scope

This PRD covers **EmailFold's role** in sequence generation: the Phase 2b model call that produces a complete 4-step sequence, the prompt design, output schema, and the EmailFold UI tab that lets the user review and send the sequence to EventFold.

EventFold storage, Outbox view, automation, and analytics are covered in PRD-15 through PRD-18.

---

## Problem

EmailFold generates one cold email. It has all the context needed to generate all 4 touchpoints simultaneously: the research, the angle, the contact, the company intel. Generating only step 1 and making the SDR draft steps 2–4 manually wastes the research investment and guarantees inconsistent follow-through.

---

## Phase 2b: Sequence Generation

Phase 2 generates the cold email (step 1). Phase 2b immediately follows — one additional Sonnet call, runs concurrently with other companies in the parallel queue (PRD-08), no net latency impact.

### Trigger

Phase 2b runs automatically after Phase 2 completes for every company. No toggle — sequences are always generated. The SDR can choose not to use them, but they're always there.

### Model

`claude-sonnet-4-5` — same as Phase 2. Sequence steps require contextual continuity (each step must feel like it follows from the prior) and creative variation (different format each time). Haiku produces formulaic follow-ups. Opus is unnecessary for reformatting within a known strategy.

### Prompt

```javascript
const sequencePrompt = (coldEmail, company, contact, research, tone) => `
You are writing a follow-up sequence to support a cold email campaign for Foxworks Studios.
${TONE_PROMPTS[tone]}

COLD EMAIL ALREADY GENERATED (Step 1):
Angle: ${coldEmail.angle}
Subject: ${coldEmail.subject}
Body: ${coldEmail.body}
Hook used: ${coldEmail.hook_used}

CONTACT: ${contact.name}, ${contact.title} at ${company.name}
${contact.personalization_hooks?.length
  ? `Personal hooks: ${contact.personalization_hooks.join('; ')}`
  : ''}

COMPANY INTEL:
- What they do: ${research.what_they_do}
- Pain points: ${research.pain_points?.join(', ')}
- Tech stack: ${research.tech_stack?.join(', ')}
- Recent news: ${research.recent_news}
- ICP fit: ${research.icp_fit}

Generate 3 follow-up steps. Rules:
- Each step must feel DISTINCT — not a re-pitch of step 1
- Step 2: offer something useful (insight, observation, relevant question) — NO hard ask
- Step 3: ultra-short pattern interrupt — under 60 words, acknowledge they're busy
- Step 4: genuine break-up — honest, no guilt, leave the door open for the future
- Every step references the prior naturally ("Following up on my note last week...")
- Step 4 must NEVER re-pitch, guilt-trip, or ask why they didn't respond
- Match the tone of ${tone} throughout

Return JSON:
{
  "sequence": [
    {
      "step": 2,
      "day_offset": 3,
      "subject": "subject line under 8 words",
      "body": "email body",
      "format": "value_add",
      "angle_note": "brief note on what hook/angle you used and why"
    },
    {
      "step": 3,
      "day_offset": 7,
      "subject": "subject line",
      "body": "email body (MAXIMUM 60 words)",
      "format": "pattern_interrupt",
      "angle_note": "..."
    },
    {
      "step": 4,
      "day_offset": 14,
      "subject": "subject line",
      "body": "break-up email (60-90 words, respectful close)",
      "format": "breakup",
      "angle_note": "..."
    }
  ]
}
`;
```

### Step Format Guidelines

| Step | Day | Format | Max words | Core rule |
|---|---|---|---|---|
| 1 | 0 | Cold (existing Phase 2) | 120 | Hook + angle + CTA |
| 2 | 3 | Value-add | 150 | Give before asking. No meeting ask. |
| 3 | 7 | Pattern interrupt | 60 | Short, human, soft ask |
| 4 | 14 | Break-up | 90 | Honest close, never re-pitch |

### Step 2 Value-Add Options

The model selects the most appropriate based on research context:
- Share a relevant observation from their Phase 1 research ("I noticed your team just hit 200 engineers — onboarding at that scale is where the cracks usually appear")
- Reference something topical from `recent_news`
- Ask a genuine question about their situation ("Curious — are you running migrations in-place or planning a parallel rebuild?")
- Offer a specific insight from working with similar companies

### Cost & Timing

| | Phase 2 (existing) | Phase 2b (sequence) |
|---|---|---|
| Model | Sonnet | Sonnet |
| Max tokens | 1500 | 2000 |
| Cost per company | ~$0.005 | ~$0.007 |
| Latency | ~4s | ~5s (concurrent) |

Phase 2b runs in parallel with Phase 2 of other companies in the queue — no serial wait.

---

## EmailFold UI: Sequence Tab

On each company result, add a "Sequence" tab alongside the existing email variant cards.

### Tab Layout

```
Acme Corp — Jane Smith (VP Engineering)
─────────────────────────────────────────────────────────────────
[Email Variants (3)]   [Full Sequence ●]   [LinkedIn]
─────────────────────────────────────────────────────────────────

Full Sequence:

  ┌─ Step 1 · Day 0 · Cold Email ───────────────────────────┐
  │  Subject: "Your AI roadmap and where we fit in"          │
  │  Angle: Technical Debt Automation                        │
  │  [89w ✓] [View] [Edit]                                   │
  └──────────────────────────────────────────────────────────┘

  ┌─ Step 2 · Day 3 · Value-Add ────────────────────────────┐
  │  Subject: "One thing about Postgres at scale"            │
  │  [72w ✓] [View] [Edit]                                   │
  │                                                          │
  │  Hi Jane, Following up on my note last week. One thing   │
  │  I forgot to mention — we've seen teams your size...     │
  └──────────────────────────────────────────────────────────┘

  ┌─ Step 3 · Day 7 · Pattern Interrupt ───────────────────┐
  │  Subject: "Still on your radar?"                         │
  │  [44w ✓] [View] [Edit]                                   │
  └──────────────────────────────────────────────────────────┘

  ┌─ Step 4 · Day 14 · Break-up ────────────────────────────┐
  │  Subject: "Closing the loop"                             │
  │  [67w ✓] [View] [Edit]                                   │
  └──────────────────────────────────────────────────────────┘

  [→ Send Sequence to EventFold CRM]
```

### Inline Step Preview

Clicking "View" on any step expands it inline:

```
  ┌─ Step 2 · Day 3 · Value-Add (expanded) ────────────────┐
  │  Subject: "One thing about Postgres at scale"            │
  │                                                          │
  │  Hi Jane,                                                │
  │                                                          │
  │  Following up on my note last week. One thing I          │
  │  forgot to mention — we've seen teams your size hit a    │
  │  wall specifically when Postgres connection pooling      │
  │  hasn't scaled ahead of the engineering headcount.      │
  │                                                          │
  │  Worth a quick conversation if that resonates?          │
  │                                                          │
  │  [Name]                                                  │
  │                                                          │
  │  [Copy]  [Regenerate Step]  [Edit]     72w ✓            │
  └──────────────────────────────────────────────────────────┘
```

### "Regenerate Step"

Reruns Phase 2b for a single step only. Useful if step 3 is too long or step 2's hook missed. One Sonnet call, ~$0.002.

### Edit Mode

Clicking "Edit" turns the step body into a textarea (same inline edit UX as the existing EmailCard edit from v0.5). Changes persist in state and are included in the EventFold payload.

---

## Payload to EventFold

On "Send Sequence to EventFold CRM," EmailFold POSTs to `/api/email-sequence` (PRD-15):

```typescript
interface EmailSequencePayload {
  __emailfold_sequence_v1: true;
  sequence_id: string;                // UUID generated by EmailFold: crypto.randomUUID()
  company_name: string;
  company_url: string;
  contact_name: string;
  contact_role: string;
  email_goal: string;
  ts: number;
  research: EmailFoldResearch;        // full Phase 1 research object
  steps: Array<{
    step: number;                     // 1-4
    day_offset: number;               // days after step 1 is sent
    subject: string;
    body: string;
    format: "cold" | "value_add" | "pattern_interrupt" | "breakup";
    angle: string;
    angle_note: string;
  }>;
  linkedin?: {                        // optional, from PRD-13
    connection_note: string;
    first_message: string;
  };
}
```

---

## localStorage: Sequence History

Sequences are stored in EmailFold's `LS_KEY_HISTORY` alongside single-email runs, with a `sequence` field:

```javascript
// History entry shape (extension of existing format):
{
  companyName: "Acme Corp",
  companyUrl: "https://acme.com",
  contactName: "Jane Smith",
  contactRole: "VP Engineering",
  ts: 1710000000000,
  emails: [...],                   // existing — Phase 2 cold email variants
  sequence: {                      // NEW — Phase 2b output
    sequence_id: "uuid-...",
    generated_at: 1710000050000,
    steps: [
      { step: 2, day_offset: 3, subject: "...", body: "...", format: "value_add" },
      { step: 3, day_offset: 7, subject: "...", body: "...", format: "pattern_interrupt" },
      { step: 4, day_offset: 14, subject: "...", body: "...", format: "breakup" },
    ]
  }
}
```

---

## Out of Scope (handled in other PRDs)

- EventFold storage of sequences → PRD-15
- Outbox sequence view → PRD-16
- Auto-stop on reply / auto-advance → PRD-17
- Sequence metrics → PRD-18

---

## Success Metrics

- % of EmailFold runs that include a generated sequence: **100%** (always runs Phase 2b)
- Phase 2b generation time: **< 6 seconds** (hidden behind concurrent Phase 2 for other companies)
- Step 2 word count compliance (< 150 words): **> 95%** of generations
- Step 3 word count compliance (< 60 words): **> 95%** of generations
- SDR edit rate per step: **< 20%** (sequence is good enough to send as-is most of the time)
