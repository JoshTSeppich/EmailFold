# PRD-12 — Reply Assist: Drafting the Conversation Continuation
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** EmailFold owner + EventFold senior dev
**Priority:** P0 — Every sent email creates this need
**Depends on:** PRD-02 (email status), PRD-03 (Outbox)

---

## Problem

A prospect replies. This is the moment the entire pipeline has been building toward. The SDR is now on their own.

They have to:
- Read the reply carefully
- Understand the objection, question, or interest being expressed
- Write a response that advances toward a meeting without being pushy
- Match the tone and seniority of the person they're talking to
- Do this for 5–10 replies simultaneously across different companies

This is harder than cold outreach because the stakes are higher, the context is richer, and the failure mode (a bad response killing a warm lead) is real. There's no tooling in the pipeline for this at all. The SDR is staring at a blank Gmail compose window.

---

## Proposed Solution

A **Reply Assist** mode in EmailFold. The SDR pastes the prospect's reply, and EmailFold generates a suggested response that:
- Acknowledges what the prospect said specifically (not generic)
- Advances toward the next step (meeting, demo, technical call)
- Matches tone (if they were brief, be brief; if they were detailed, match that)
- Handles common reply types: positive interest, soft objection, question, timing issue, wrong person

---

## Reply Typology

The system needs to recognize and handle 6 distinct reply types:

| Type | Example signal | Goal of response |
|---|---|---|
| **Positive / interested** | "Tell me more" / "Can we set up a call?" | Book the meeting immediately, offer Calendly link |
| **Soft objection** | "We're not looking at this right now" | Acknowledge timing, ask when better, leave door open |
| **Question / challenge** | "How is this different from [competitor]?" | Answer directly and specifically, move to call |
| **Wrong person** | "You should talk to Sarah in data engineering" | Thank them, ask for a warm intro to Sarah |
| **Not interested** | "We're all set, thanks" | Graceful exit, plant a seed for the future |
| **Ghosted after positive** | Replied positively, then went silent | Gentle re-engagement, lower ask |

---

## Flow

```
User is in EventFold Outbox, sees a "REPLIED" interaction
  ↓
Clicks "Draft Reply"
  ↓
Option A: Quick (stay in EventFold)
  - Small inline panel expands under the interaction card
  - User pastes the prospect's reply text
  - Clicks "Generate"
  - Sees suggested response with [Copy] button
  - Clicks "Log Reply" to record the inbound + mark draft as replied

Option B: Full (open in EmailFold)
  - EventFold writes a reply job to ~/.foxworks/jobs/
  - EmailFold opens to "Reply Assist" tab with context pre-loaded:
    - Original email we sent (body, angle, subject)
    - Prospect name, title, company
    - ProspectIntel for this company (signals, angles)
  - User pastes the prospect's reply
  - Full generation with tone control, multiple response variants
```

---

## EmailFold: Reply Assist Tab

New tab alongside the existing email generation flow. Activated when a reply job arrives from EventFold or the user manually enters "Reply" mode.

### Context Panel (pre-loaded from EventFold job)

```
┌─ Reply Context ─────────────────────────────────────────────┐
│  Company:   Acme Corp
│  Contact:   Jane Smith, VP Engineering
│  We sent:   "Your AI roadmap and where we fit in"
│             Angle: Technical Debt Automation
│             Sent: Mar 8, 2026
│
│  Their reply:
│  ┌─────────────────────────────────────────────────────┐
│  │  [paste or type their reply here]                   │
│  │                                                     │
│  │  "Hey, interesting timing. We actually just started │
│  │   evaluating some tooling for this. Can you send    │
│  │   some more info on how you work with teams like    │
│  │   ours? Maybe a case study?"                        │
│  └─────────────────────────────────────────────────────┘
│
│  Reply type detected: Positive / Interested ✓
│  [Generate Reply]
└──────────────────────────────────────────────────────────────┘
```

### Generation

```javascript
const replyPrompt = `
You are drafting a reply to a cold email response on behalf of ${senderName} at Foxworks Studios.

ORIGINAL EMAIL WE SENT:
Subject: ${originalSubject}
Body: ${originalBody}
Angle used: ${angleName}

PROSPECT:
Name: ${contactName}
Title: ${contactRole}
Company: ${companyName}

WHAT WE KNOW ABOUT THEM:
${intelSummary}

THEIR REPLY:
${prospectReply}

REPLY TYPE: ${detectedReplyType}

INSTRUCTIONS:
- Acknowledge what they said specifically — never generic "Thanks for getting back to me"
- ${replyTypeInstructions[detectedReplyType]}
- Match their email length and tone
- If they asked a question, answer it directly before asking for anything
- End with ONE clear next step, not multiple options
- No more than 100 words unless they wrote more than 150

Return JSON:
{
  "reply_type": "positive|soft_objection|question|wrong_person|not_interested|re_engagement",
  "response": "email body text",
  "subject": "Re: [original subject]",
  "next_step": "what this response is trying to achieve",
  "tone_notes": "why you wrote it this way",
  "alternatives": ["shorter version", "version with more social proof"]
}
`;
```

**Model:** `claude-sonnet-4-5` — same as email drafting. Reply generation needs contextual understanding and tone-matching. Not Haiku (too blunt for nuanced reply handling), not Opus (not worth the cost for a ~100-word response).

**Cost:** ~$0.004 per reply. Negligible.

### Reply Type Instructions

```javascript
const replyTypeInstructions = {
  positive: `
    - Don't send "more info" — get the meeting booked
    - Offer 2-3 specific time slots OR include a Calendly link
    - Keep it short: they're already interested
    - Don't re-pitch — they said yes
  `,
  soft_objection: `
    - Acknowledge the timing without being dismissive
    - Ask a specific question about when/what would change things
    - Plant a seed: mention one relevant result or stat
    - Don't push for a meeting yet — lower the ask to "keep in touch?"
  `,
  question: `
    - Answer the question directly in the first sentence
    - If competitive: acknowledge competitor, differentiate on 1 dimension specifically
    - If "how does it work": 2-3 bullet explanation, then offer a call to see it live
    - Transition: "Does that help? Happy to walk through your specific situation"
  `,
  wrong_person: `
    - Thank them for the redirect
    - Ask if they can introduce you to [Sarah] rather than cold-reaching her
    - Keep it one sentence — they're doing you a favor
  `,
  not_interested: `
    - Respect it immediately
    - One sentence: "Understood — I'll leave you alone. If anything changes with [specific thing], feel free to reach back out."
    - Do NOT re-pitch or ask why
  `,
  re_engagement: `
    - Reference the prior conversation naturally
    - Lower the ask significantly (not a call — just a quick question)
    - New hook: something that changed since their last reply (news, new capability, social proof)
  `,
};
```

### Output Cards

Similar to email generation — shows the response with:
- Reply type badge (green = Positive, yellow = Objection, blue = Question)
- Word count badge
- "Copy Response" button
- Alternative variants (shorter / more social proof)
- "Log & Mark Replied" button → sends to EventFold via local API, updates Interaction status

---

## EventFold: Outbox Reply Panel

The quick inline version for SDRs who want to stay in EventFold:

```
┌─ REPLIED ──────────────────────────────────────────────────────┐
│  Acme Corp · Jane Smith (VP Engineering)                        │
│  "Interesting timing. Can you send more info + case study?"     │
│  Replied: Mar 10, 2026                                          │
│                                                                 │
│  [Draft Reply ▼]   [Log Reply]   [Convert to Deal]             │
│                                                                 │
│  ▼ Draft Reply (expanded):                                      │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Their message: "Interesting timing. Can you send..."    │  │
│  │  [Paste full reply text here              ]              │  │
│  │                                              [Generate]  │  │
│  └──────────────────────────────────────────────────────────┘  │
│  ┌──────────────────────────────────────────────────────────┐  │
│  │  Suggested reply (Positive / Interested):                 │  │
│  │  "Jane — great timing on your end too. Rather than       │  │
│  │   send a deck, would a 20-min call make more sense?      │  │
│  │   I can walk through exactly how we've worked with       │  │
│  │   teams at [similar company]. Available Tue 2pm or       │  │
│  │   Thu morning?"                                          │  │
│  │  56 words                          [Copy] [Regenerate]   │  │
│  └──────────────────────────────────────────────────────────┘  │
└────────────────────────────────────────────────────────────────┘
```

---

## New EventFold API Endpoint (PRD-09 extension)

```
POST /api/reply-job
```

Triggers EmailFold to open in Reply Assist mode with context pre-loaded:

```typescript
interface ReplyJobPayload {
  type: "reply_assist";
  interaction_id: string;
  company_name: string;
  company_url: string;
  contact_name: string;
  contact_role: string;
  original_subject: string;
  original_body: string;
  angle_name: string;
  intel_summary: string;          // brief intel context for generation
  sent_at: string;
}
```

EventFold writes this as a job file. EmailFold picks it up and switches to Reply Assist tab.

---

## New IPC Command (EventFold)

```rust
/// Store a drafted reply as a new Interaction (Outbound Email, Draft status)
/// linked to the original interaction thread.
#[tauri::command]
pub async fn save_reply_draft(
    original_interaction_id: String,
    reply_body: String,
    reply_subject: String,
    state: State<'_, AppState>,
) -> Result<String, AppError>   // returns new Interaction ID
```

---

## Out of Scope

- Auto-detecting when a reply arrives (requires Gmail/Outlook integration)
- Sentiment analysis beyond the 6 reply types
- Multi-turn conversation threading (reply to a reply to a reply)
- Scheduling the reply send time

---

## Success Metrics

- Time from reply received → drafted response: **< 60 seconds**
- SDR sends a response to **> 90%** of replies within 24 hours (vs current ~60%)
- Meeting conversion rate from positive replies: **> 80%**
