# PRD-06 — "Convert to Deal" Fast Flow
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM)
**Priority:** P1 — High daily-use value
**Depends on:** PRD-02 (email Interactions with status)

---

## Problem

When a prospect replies to a cold email, the SDR needs to create a Deal in the CRM immediately — before the conversation goes cold. Today this requires:

1. Navigate to Companies → find the company
2. Navigate to Deals → click "New Deal"
3. Fill in deal name, stage, company link, contact link
4. Navigate back to Contacts → confirm the contact is linked
5. Navigate back to the Interaction → mark it as replied

That's 5 screens and ~5 minutes. By that time, the SDR has moved on and the deal often never gets created.

**The gap:** Conversion from "email replied" to "deal created" has too much friction.

---

## Proposed Solution

A single "Convert to Deal" button that appears:
1. On any email Interaction with status `Replied` (in Company Detail and Outbox view)
2. On the Outbox `/outbox` "Replied" tab — as the primary CTA for hot leads

On click: a single-screen modal pre-populated with all known data. One click creates the Deal linked to the correct Company and Contact.

---

## User Stories

- As a SDR, when I see a reply, I click "Convert to Deal" and a deal is created in < 10 seconds
- As a SDR, I don't have to re-enter the company name or contact name — the CRM already knows them
- As a SDR, I can set the deal stage (Prospect/Qualified) and add a deal name in one modal
- As a manager, I see new deals appear in the pipeline the same day replies come in

---

## Flow Diagram

```
SDR receives email reply in Gmail
  ↓
SDR opens EventFold CRM → Outbox → "Replied" tab
  ↓
SDR sees: "FooBar SaaS · Mike Chen (CTO) · 1 reply"
  ↓
SDR clicks "Convert to Deal"
  ↓
Modal opens (pre-populated):
  - Company: FooBar SaaS (linked)
  - Contact: Mike Chen (linked)
  - Deal name: "FooBar SaaS — Discovery"
  - Stage: Prospect ← user selects
  - Notes: [optional free text]
  ↓
SDR clicks "Create Deal"
  ↓
→ create_deal() called with company_id, contact_id, prefilled name
→ Deal appears in pipeline board immediately
→ Outbox card updates: shows "Deal created" badge
→ Follow-up Task auto-created: "Follow up: Mike Chen at FooBar SaaS"
→ Toast: "Deal created → [View in Pipeline]"
```

---

## Modal Design

```
+─────────────────────────────────────────────────────┐
│  Convert to Deal                                     │
├─────────────────────────────────────────────────────┤
│                                                      │
│  Company:    FooBar SaaS                             │
│              ████████████████████████  (read-only)   │
│                                                      │
│  Contact:    Mike Chen (CTO)                         │
│              ████████████████████████  (read-only)   │
│                                                      │
│  Deal Name:  FooBar SaaS — Discovery                 │
│              ░░░░░░░░░░░░░░░░░░░░░░░░  (editable)    │
│                                                      │
│  Stage:      [Prospect ▼]                            │
│              Prospect | Qualified | Proposal         │
│                                                      │
│  Est. Value: [          ]  (optional)                │
│                                                      │
│  Notes:      [                               ]       │
│              (what made them reply?)                 │
│                                                      │
│  ☑ Create follow-up task (3 days)                    │
│                                                      │
│  [Cancel]                   [Create Deal]            │
└─────────────────────────────────────────────────────┘
```

---

## Pre-population Logic

| Modal field | Source |
|---|---|
| Company | From Interaction's `company_id` (resolved to company name) |
| Contact | From Interaction's `contact_id` (resolved to contact name + role) |
| Deal name | `"{CompanyName} — Discovery"` (editable default) |
| Stage | Always defaults to `Prospect` (user changes if needed) |
| Est. value | Empty (user fills optionally) |
| Notes | Empty (user fills with reply context) |

---

## Backend

**No new commands needed.** Uses existing:
- `create_deal(company_id, contact_id, name, stage, estimated_value, notes)` — already exists
- `create_task(title, due_at, company_id, contact_id, deal_id)` — already exists

The frontend composes these two calls after the user clicks "Create Deal."

Optional enhancement: a single `convert_interaction_to_deal()` command that atomically creates the Deal, links the Interaction to the deal, and creates the follow-up Task. This reduces roundtrips and ensures atomicity (deal + task either both succeed or both fail). Judgment call for the senior dev.

---

## Where the Button Appears

### 1. Outbox `/outbox` — Replied tab

Each "Replied" card shows "Convert to Deal" as its primary CTA (most prominent button):

```
┌─ REPLIED ─────────────────────────────────────────────┐
│  FooBar SaaS  ·  Mike Chen (CTO)  ·  1 reply           │
│  Technical Debt Automation                              │
│  Replied: Mar 7, 2026                                   │
│  [Convert to Deal]  [View Thread]  [View Company]       │
└───────────────────────────────────────────────────────┘
```

### 2. Company Detail — Interactions section

On any Interaction card with `email_status === Replied`:

```
[REPLIED]  Mar 3  Outbound Email  Mike Chen (CTO)
           "Your AI roadmap and where we fit in"  ·  1 reply
           [Convert to Deal]  [View Thread]
```

### 3. Dashboard — "Hot Leads" widget (optional Phase 2)

If a company has a Replied email interaction but no Deal, show it in a "Ready to Convert" dashboard widget:

```
┌─────────────────────────────┐
│  Ready to Convert (3)       │
│  FooBar SaaS — replied 2d   │
│  Acme Corp  — replied 4d    │
│  [Convert to Deal] each     │
└─────────────────────────────┘
```

---

## Out of Scope

- Auto-creating a Deal when a reply is logged (user must click Convert manually)
- Importing email reply content as the deal's notes (too complex for Phase 1)
- Deal scoring or probability calculation
- Moving the deal through stages automatically

---

## Success Metrics

- Time from "Replied" Outbox card → Deal created: **< 20 seconds**
- % of replied emails that convert to a Deal within 24 hours: target **> 75%** (vs current ~20%)
- Deal creation rate increases without manager prompting

---

## Open Questions for Senior Dev

1. Does `create_deal` already accept `contact_id` as a parameter? If not, is there a `link_contact_deal` command?
2. Is "deal linked to an Interaction" a supported concept in the current data model? Or is the link always through company/contact only?
3. Should clicking "Convert to Deal" automatically transition the Interaction's email_status to something like "Converted"? Or leave it as "Replied"?
