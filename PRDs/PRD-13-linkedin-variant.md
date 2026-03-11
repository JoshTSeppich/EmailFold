# PRD-13 — LinkedIn Variant: Second Channel, Same Research
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** EmailFold owner
**Priority:** P1 — One Haiku call, 2× outreach channels
**Depends on:** PRD-10 (contact research provides LinkedIn URL)

---

## Problem

EmailFold generates a cold email. That email might go to spam, get buried in a full inbox, or land on a day the person isn't checking. LinkedIn DMs have a fundamentally different arrival mechanism — they appear in the LinkedIn notifications tab, which most professionals check daily, and they feel personal in a way that email doesn't.

The research is already done. The angle is already chosen. The contact's LinkedIn URL is already in the payload (from PRD-10's Apollo enrichment). Generating a LinkedIn message variant costs one Haiku call and 2 seconds. Not doing it is leaving a full channel unused.

**LinkedIn reply rates:** 20–35% on connection request acceptance, 15–25% DM open rate among accepted connections vs 5–15% cold email open rate. The formats are different enough that it's not perceived as spam to message someone on both channels with the same theme.

---

## Proposed Solution

A "LinkedIn" chip on every generated EmailCard in EmailFold. On click, generates a LinkedIn-optimized version of the same email: shorter, no subject line, conversational opener, no signature block, references the connection request context.

Three LinkedIn formats:
1. **Connection request note** (300 char limit) — what you say when you send the connection request
2. **DM after connection accepted** (first message, ~150 words)
3. **InMail** (for premium LinkedIn, ~2000 chars — similar length to email but LinkedIn formatting)

---

## Flow

```
EmailFold generates 3 email angle variants
User selects best angle card

On each EmailCard:
  [Copy Subject] [Copy Body] [LinkedIn ▼] [→ Send to CRM]

User clicks "LinkedIn ▼" dropdown:
  → Connection Request Note (300 chars)
  → First Message (after connecting)
  → InMail

Click any option:
  → Haiku call generates the LinkedIn variant
  → Shows inline below the email card
  → [Copy Message] button
```

---

## Generation

```javascript
const generateLinkedInVariant = async (email, contact, format) => {
  const formatInstructions = {
    connection_request: `
      Write a LinkedIn connection request note.
      HARD LIMIT: 300 characters total (including spaces).
      - No "I hope this finds you well"
      - Reference one specific, real thing about them or their work
      - One clear reason to connect — no ask yet
      - First name only, no title
      Example length/style: "Jane — saw your post on Postgres scaling. We've been solving that exact problem for teams at your scale. Would love to connect."
    `,
    first_message: `
      Write a LinkedIn DM to send AFTER they accept a connection request.
      - 100-150 words max
      - Acknowledge the connection, don't pretend it's a coincidence
      - One specific hook from their activity or situation
      - Soft ask: a question, not a meeting request
      - No links, no attachments, no "I'll send you a deck"
      - Conversational — this is LinkedIn, not email
    `,
    inmail: `
      Write a LinkedIn InMail message.
      - 200-300 words (InMail gets more space but still respect their time)
      - Has a subject line (short, < 8 words, curiosity-based)
      - More context than a DM but still conversational
      - Clear single ask at the end (15-minute call, not a "demo")
      - No corporate language
    `,
  };

  const result = await anthropic.messages.create({
    model: "claude-haiku-3-5",      // Haiku — reformatting, not new strategy
    max_tokens: 400,
    messages: [{
      role: "user",
      content: `
Convert this cold email into a LinkedIn ${format} message.

ORIGINAL EMAIL:
Angle: ${email.angle}
Hook used: ${email.hook_used}
Body: ${email.body}

CONTACT:
Name: ${contact.name} (first name: ${contact.name.split(' ')[0]})
Title: ${contact.title}
Company: ${contact.company}
Personalization hooks: ${contact.personalization_hooks?.join(', ') || 'none'}

${formatInstructions[format]}

Return JSON:
{
  "message": "the LinkedIn message text",
  "subject": "subject line (InMail only, null for others)",
  "char_count": 123,
  "format": "${format}",
  "notes": "one sentence on why you wrote it this way"
}`
    }]
  });

  return JSON.parse(extractJSON(result.content[0].text));
};
```

**Cost:** ~$0.0002 per variant. Three variants per company = $0.0006. Negligible.
**Time:** ~1 second per variant (Haiku).

---

## UI: LinkedIn Panel on EmailCard

```
┌─ EmailCard: Technical Debt Automation ─────────────────────────┐
│  Subject A: "Your AI roadmap and where we fit in"               │
│  [word count: 89w ✓]  [Edit]                                    │
│                                                                  │
│  Hi Jane — I noticed your team recently...                       │
│  [full email body]                                               │
│                                                                  │
│  [Copy Subject] [Copy Body] [→ CRM] [LinkedIn ▼]               │
│                                                                  │
│  ▼ LinkedIn (expanded after click)                               │
│  ──────────────────────────────────────────────────────────    │
│  [Connection Request] [First Message] [InMail]                   │
│                                                                  │
│  ┌── Connection Request Note (247/300 chars) ──────────────┐   │
│  │  Jane — saw your post about Postgres migration pain.    │   │
│  │  We've been solving that exact problem for engineering   │   │
│  │  teams at your scale. Working on something similar?     │   │
│  └──────────────────────────────────────────────────────────┘  │
│  [Copy]  [Regenerate]                                            │
│                                                                  │
│  LinkedIn profile: linkedin.com/in/janesmith  [Open ↗]         │
└──────────────────────────────────────────────────────────────────┘
```

**"Open ↗"** uses Electron's `shell.openExternal()` to open the LinkedIn profile in the default browser — one click to go directly to their profile and send the connection request.

---

## Character Count Enforcement

The connection request note has a hard 300-character limit. If Haiku generates over 300 characters:
1. Show the count in red: `312/300 chars ⚠`
2. Show a "Trim" button that fires a second Haiku call: "Trim this to under 300 characters without losing the key hook"
3. Or: allow inline editing directly in the text area

---

## Sequence Integration (ties into PRD-14)

The LinkedIn variant naturally extends the sequence:

```
Day 0:  Send cold email (EmailFold Phase 2)
Day 0:  Send LinkedIn connection request (PRD-13 Connection Request Note)
Day 2:  If connected on LinkedIn: send First Message (PRD-13)
Day 3:  Email Follow-up #1 (PRD-14 Sequence)
Day 7:  Email Follow-up #2 (PRD-14 Sequence)
Day 8:  LinkedIn DM follow-up if connected (PRD-13 First Message variant)
Day 14: Break-up email (PRD-14 Sequence)
```

Multi-channel increases overall reply rate significantly without increasing the number of companies researched.

---

## EventFold Integration

LinkedIn variants are stored as metadata on the Interaction aggregate:

```typescript
// Extension to Interaction (optional field, null on non-email interactions)
linkedin_connection_note: string | null;
linkedin_first_message: string | null;
linkedin_inmail_subject: string | null;
linkedin_inmail_body: string | null;
linkedin_url: string | null;                // from contact enrichment
```

In the Outbox, the Interaction card shows:
```
[Copy Email Body] [Copy LinkedIn Note] [Open LinkedIn ↗]
```

No new EventFold commands needed — stored as metadata fields on the existing Interaction aggregate at import time (added to the `import_emailfold_draft` payload).

---

## Out of Scope

- Sending LinkedIn messages automatically (requires LinkedIn API/automation — ToS risk)
- LinkedIn connection request automation
- Tracking LinkedIn message opens or replies
- LinkedIn Sales Navigator integration (future — SSI scoring, lead lists)

---

## Success Metrics

- % of EmailFold-generated emails that also have a LinkedIn variant generated: **> 80%**
- Multi-channel outreach (email + LinkedIn) vs email-only reply rate: **measure A/B over 60 days**
- Time to generate LinkedIn variant after email: **< 2 seconds**
