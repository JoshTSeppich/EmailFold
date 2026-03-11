# PRD-21 — Champion vs. Buyer Mapping: The Right Organizational Target
**Version:** 1.0
**Date:** 2026-03-11
**Author:** Foxworks / Claude Architecture Session
**For:** ProspectFold owner + EmailFold owner + EventFold owner
**Priority:** P1 — Multi-contact strategy layer
**Depends on:** PRD-10 (contact research), PRD-15 (sequence data model), PRD-17 (sequence automation)

---

## Problem

PRD-10 finds one contact per company — the "right person." But in B2B sales, "the right person" is not a single answer. It depends on what you're trying to accomplish at that moment in the sales motion.

The current pipeline makes an implicit assumption: there is one decision maker, and that person both evaluates your product and authorizes the purchase. This is true at very small companies. It is false everywhere else.

At companies with more than 50 employees, the person who evaluates your product (the **Champion**) and the person who signs the contract (the **Economic Buyer**) are almost always different people. Sequencing to the wrong one first is not a small mistake — it is the most common reason outbound deals die before they start.

If you email the VP of Engineering cold, they have no internal context for your product, no advocate pushing it, and no reason to spend political capital on an unknown vendor. They ignore you. If you email the Director of Data Engineering first, get them excited, and then have them walk into their VP's office saying "I want to evaluate this tool" — that VP is now warm. The same meeting request that got ignored cold gets booked immediately.

**The gap:** PRD-10 finds one person. The pipeline needs to find two — and know which one to contact first, and when to introduce the second.

---

## The Champion vs. Buyer Framework

### The Champion

The Champion is the person experiencing the pain. They live in the problem every day. They understand the technical details of your solution. They can evaluate it, advocate for it internally, and make the business case to their manager. They are unlikely to control budget directly.

**Who they are:**
- Hands-on technical leads and senior ICs who manage a team
- Directors and Senior Managers who write code or run the actual data/engineering work
- "Head of [function]" titles at mid-size companies
- The person whose team owns the job postings describing your exact problem space (per PRD-20 job posting signals)

**How to identify them — signal checklist:**

| Signal | Description |
|---|---|
| Title pattern | Director, Senior Manager, Staff/Principal Engineer, Head of [function] |
| GitHub activity | Active commits in the past 6 months — they still write code |
| LinkedIn posts | Writes about specific technical problems, not strategy or leadership |
| Conference activity | Speaks at technical conferences (KubeCon, dbt Coalesce, PyCon) not business conferences |
| Blog posts | Authors or contributes to technical engineering blog posts |
| Job posting ownership | Their team is posting for roles that match the problem you solve |
| Org depth | Has 2–8 direct reports who do the hands-on work |

**What the Champion's email looks like:**
Technical, specific, peer-to-peer. References their actual work ("I saw your post about Kafka consumer lag"). Offers value before asking for anything. The ask is a technical conversation, not a demo.

### The Economic Buyer

The Economic Buyer signs the contract. They control the budget line. They may never use your product personally — they need to understand ROI, vendor risk, and organizational fit. They respond to business outcomes and social proof, not technical implementation details.

**Who they are:**
- VP and above at mid-size companies (50–500 employees)
- C-suite at any company size
- Anyone with explicit P&L responsibility or cross-functional budget authority

**How to identify them — signal checklist:**

| Signal | Description |
|---|---|
| Title pattern | VP, SVP, EVP, C-suite, Chief [anything] |
| LinkedIn language | "Manages $Xm budget," "P&L responsibility," "built team from X to Y" |
| Post topics | Writes about organizational transformation, team growth, business outcomes |
| Conference talks | Speaks about business strategy, not technical implementation |
| Org breadth | Has direct reports across multiple functional teams |
| Job posting language | Job postings they own reference budget, vendor management, or ROI language |

**What the Buyer's email looks like:**
Brief, business-outcome focused. References company-level signals (fundraise, growth, competitor moves). Mentions ROI and peer social proof. The ask is a short intro call, not a technical deep dive.

### The Gray Zone

Company size and org structure determine role more than title alone. These are the most commonly misidentified cases:

| Person | Context | Actual Role |
|---|---|---|
| "Head of Engineering" | 15-person startup | Economic Buyer — they own budget; CTO is a peer or same person |
| "VP Engineering" | 600-person company | Champion — there's a CTO and CPO above them |
| "Director of Data Science" | Any size | Champion at 95% of companies |
| "CTO" | 30-person startup | Champion + Buyer simultaneously — contact as one |
| "CTO" | 500-person company | Economic Buyer — contact after champion engagement |
| "VP Data" | 80-person company | Ambiguous — apply company_size_bucket rules below |
| "Engineering Manager" | 200-person company | Champion only — too many layers above them to be the buyer |

**The rule:** Seniority alone does not determine role. Company size + org structure does. This PRD defines a classification algorithm below that applies both dimensions.

---

## Identification Algorithm

### New output: `ContactMapping`

ProspectFold Phase 3 (PRD-10) currently returns one `RecommendedContact`. This PRD extends Phase 3 to return a `ContactMapping` — two contacts with roles and a strategy recommendation.

```typescript
interface ContactMapping {
  champion: RecommendedContact | null;
  economic_buyer: RecommendedContact | null;
  champion_confidence: number;          // 0-1: how confident we are in this champion pick
  buyer_confidence: number;             // 0-1: how confident we are in this buyer pick
  company_size_bucket: CompanySizeBucket;
  mapping_rationale: string;            // 1–2 sentence plain-English explanation
  recommended_sequence_strategy: SequenceStrategy;
  strategy_config: SequenceStrategyConfig;
}

type CompanySizeBucket = "small" | "mid" | "enterprise";
// small:      < 50 employees
// mid:        50–200 employees
// enterprise: 200+ employees

type SequenceStrategy =
  | "champion_only"         // small company: champion IS the buyer, one contact
  | "champion_then_buyer"   // standard path: champion first, buyer after step 3 no-reply
  | "champion_parallel"     // multiple valid champions exist, sequence both simultaneously
  | "buyer_only"            // champion not found/inaccessible, buyer is the only option
  | "multi_thread";         // enterprise: 3+ stakeholders, coordinated timing

interface SequenceStrategyConfig {
  strategy: SequenceStrategy;
  primary_contact: RecommendedContact;
  secondary_contact: RecommendedContact | null;
  tertiary_contact: RecommendedContact | null;          // enterprise only
  secondary_trigger: SecondaryTrigger;
  secondary_delay_days: number | null;                  // days after trigger before contacting secondary
  secondary_intro_framing: string | null;               // how to frame the buyer outreach after champion engagement
  multi_thread_offset_hours: number;                    // minimum hours between contacts at same company (default: 72)
}

type SecondaryTrigger =
  | "no_reply_after_step_3"   // standard: wait for champion to ghost before trying buyer
  | "champion_replied"        // champion engaged positively — intro buyer into conversation
  | "immediate";              // champion_parallel or buyer_only: contact right away
```

The `RecommendedContact` interface from PRD-10 is unchanged. The new `ContactMapping` wraps two of them.

### Classification logic

The Haiku synthesis call in Phase 3c is extended to classify each contact as champion or buyer. The prompt addition:

```javascript
const classifyContactsPrompt = (contacts, companySize, icpPersona) => `
You are classifying sales contacts at a B2B company into two roles:
- Champion: the hands-on operator who experiences the pain and will advocate for the solution
- Economic Buyer: the executive who controls budget and signs the contract

COMPANY SIZE: ${companySize} employees
ICP PERSONA: ${icpPersona}

CONTACTS (from Apollo):
${contacts.map((c, i) => `
[${i + 1}] Name: ${c.name}
    Title: ${c.title}
    Seniority: ${c.seniority}
    LinkedIn activity summary: ${c.linkedin_summary || 'not available'}
    GitHub presence: ${c.github_active ? 'active commits' : 'none found'}
`).join('')}

CLASSIFICATION RULES:
1. Small company (<50 employees): Champion and buyer may be the same person. If so, set both champion and economic_buyer to the same contact and set strategy = "champion_only".
2. Mid company (50–200): Standard split. Director/Head level = champion. VP/C-suite = buyer.
3. Enterprise (200+): Multiple contacts possible. Prioritize finding both champion AND buyer.
4. Title is not enough — consider company size + org depth + activity signals.
5. A VP at a 600-person company is often a champion (CTO above them). Classify accordingly.

Return JSON:
{
  "champion_index": <index of champion in contacts array, or null>,
  "economic_buyer_index": <index of economic buyer, or null>,
  "champion_confidence": <0.0-1.0>,
  "buyer_confidence": <0.0-1.0>,
  "strategy": "champion_only|champion_then_buyer|champion_parallel|buyer_only|multi_thread",
  "mapping_rationale": "<1-2 sentence explanation>",
  "secondary_trigger": "no_reply_after_step_3|champion_replied|immediate",
  "secondary_delay_days": <integer or null>,
  "secondary_intro_framing": "<string: how to frame the buyer outreach after champion replies, or null>"
}
`;
```

### `company_size_bucket` derivation

The bucket is derived from Apollo's `estimated_num_employees` field, which ProspectFold already has:

```typescript
function getCompanySizeBucket(employees: number | null): CompanySizeBucket {
  if (!employees) return "mid"; // safe default
  if (employees < 50) return "small";
  if (employees <= 200) return "mid";
  return "enterprise";
}
```

### Apollo People Search changes

Phase 3a (PRD-10) currently fetches the top 1 candidate by seniority + title match. This PRD extends it to fetch the top 5 candidates, which Haiku then classifies into champion/buyer roles.

```javascript
// Phase 3a — extended people search
const peopleSearchParams = {
  organization_ids: [company.apollo_id],
  titles: TARGET_TITLES[icpPersona],
  seniority: ["manager", "director", "vp", "c_suite", "head"],
  per_page: 5,           // was 1 — now fetch top 5 for classification
  sort_by_field: "email_sent_count",
  sort_ascending: false,
};
```

Cost: Apollo people search with per_page=5 uses the same API credit as per_page=1 — no additional cost.

### Cost

| Step | Model | Cost (per company) |
|---|---|---|
| Phase 3a: Apollo People Search (5 results) | API | $0 (plan credit) |
| Phase 3b: Person activity scan (top 2 contacts) | Haiku | ~$0.0006 |
| Phase 3c (extended): Champion/buyer classification | Haiku | ~$0.0003 |
| **Additional cost vs PRD-10 baseline** | | **~$0.0009** |

Total per-company pipeline cost remains approximately $0.117 — effectively negligible. The classification call is a small Haiku prompt with structured output.

---

## How Company Size Changes Everything

### Small companies (< 50 employees)

At small companies, the organizational hierarchy is flat. The CTO and the engineering lead may be the same person. There is no separation between "evaluates the product" and "writes the check."

**Rules:**
- Champion and buyer are often the same person — set `strategy = "champion_only"`
- If they are the same person, generate one sequence that blends technical value AND business ROI framing
- Do not split your messaging — they will notice and find it patronizing
- One sequence, one contact, one voice

**Identifying the one contact:**
At < 50 employees, target the most senior technical person: CTO, VP Engineering, or Head of Engineering. If none exist, target the CEO directly (common at 1–10 employee companies). The CEO is always both champion and buyer.

**Example:**
> 12-person seed-stage startup. CTO is also writing code daily and making all vendor decisions.
> Strategy: `champion_only`. Contact: CTO. Sequence: peer technical tone with ROI framing in step 4.

### Mid-size companies (50–200 employees)

This is the classic champion-then-buyer path. Org structure is defined but not deeply layered. There is usually one clear champion and one clear buyer with a direct reporting relationship between them.

**Rules:**
- Director / Head of [function] = Champion. Contact first.
- VP / C-suite = Economic Buyer. Contact only after champion engagement signal.
- `strategy = "champion_then_buyer"` in most cases
- `secondary_trigger = "no_reply_after_step_3"`: if champion does not reply after 3 steps (approximately 9–14 days), switch to buyer with a different angle
- Buyer outreach framing changes: reference the company context, not the technical pain
- Never contact champion and buyer on the same day

**Org structure check:**
If the only senior person at a 70-person company is a VP Engineering with no Director below them (thin org), they may be both champion and buyer. Haiku's classification call handles this via the `mapping_rationale` field.

**Example:**
> 80-person Series A company. Director of Data Engineering (champion) reports to VP Engineering (buyer).
> Strategy: `champion_then_buyer`. Contact Director on day 0. If no reply after step 3 (day ~14), contact VP with a business-outcome angle. Do not mention the Director in the cold outreach to the VP.

### Enterprise companies (200+ employees)

Enterprise deals require multiple stakeholders. The champion alone cannot get a purchase approved. The buyer alone does not have enough context. A third contact — the champion's manager (typically a Director or Senior Director) — can accelerate internal consensus.

**Rules:**
- `strategy = "multi_thread"`
- Sequence 3 contacts: Champion (IC/manager level), Champion's boss (Director/VP), Economic Buyer (VP+/C-suite)
- Minimum 72-hour offset between contacting any two people at the same company
- Different email content for each contact — never the same sequence to different people
- Champion still goes first
- Champion's boss: contacted 72 hours after champion, framed as "building internal consensus" angle
- Economic Buyer: contacted only after champion OR champion's boss has engaged, or after step 3 of both without reply

**Timing diagram (enterprise multi-thread):**
```
Day 0:   Contact Champion (Step 1 — technical angle)
Day 3:   Contact Champion's Boss (Step 1 — organizational angle, 72hr offset)
         [Do NOT contact Buyer yet]
Day 4:   Champion Step 2 due
Day 6:   Champion's Boss Step 2 due
Day 8:   Champion Step 3 due (pattern interrupt)
Day 9:   Champion's Boss Step 3 due
         [If neither has replied, Buyer Step 1 fires on day 14]
Day 14:  Contact Economic Buyer (Step 1 — business outcome angle, if no reply from above)
```

---

## Multi-Thread Sequencing Rules

### The core coordination problem

The catastrophic scenario: an SDR emails the VP Engineering and the Director of Data at the same company on the same day. The Director replies, "Why are you emailing my boss too?" The VP sees a forwarded thread and feels ambushed. Both conversations die.

This is not a hypothetical — it is one of the top-3 reasons enterprise outbound deals collapse before the first call.

### The seven rules

**Rule 1: Never contact two people at the same company on the same day.**
Minimum 24-hour gap between any two outbound touches at the same domain. Minimum 72 hours for enterprise (200+ employees). This is enforced by EventFold's `MultiThreadCoordination` index (defined below), not by user discipline.

**Rule 2: Champion goes first — always.**
No exceptions. The buyer has no context without the champion. Contact order is fixed: Champion → Champion's Boss (enterprise only) → Economic Buyer.

**Rule 3: If champion replies positively, pause all other sequences.**
When the champion engages, do not independently contact the buyer. Instead, two options:
- Ask the champion for a warm introduction: "Would it make sense to bring [buyer name] into this conversation?"
- Wait for the champion to surface the internal discussion naturally.
Only if the champion explicitly invites a direct buyer conversation should the SDR contact the buyer independently.

**Rule 4: If champion ghosts after step 3, wait 7 days, then try buyer.**
The 7-day buffer after step 3 reduces the chance of both sequences being live simultaneously. It also creates temporal separation — the VP won't connect the two outreach attempts if they're 3+ weeks apart.

**Rule 5: If buyer replies but champion sequence is still active, reference the buyer's interest when reaching back out to champion.**
"Your VP mentioned interest — wanted to reconnect and share context that might be useful on your end." This reframes the champion outreach from cold to warm without being awkward.

**Rule 6: Enterprise only — 72-hour minimum offset between contacts.**
For companies > 200 employees, contacts are senior enough that they likely discuss vendor outreach in staff meetings. A 72-hour offset means the conversations are separated enough not to surface together.

**Rule 7: Never send the same email body to two contacts at the same company.**
Each contact's sequence is generated separately with their role-specific framing. If a buyer and champion are discovered to have received near-identical emails (via Haiku similarity check on generation), flag it for the SDR before sending.

### `MultiThreadCoordination` data model (EventFold)

This projection tracks all outbound contacts per company domain and enforces the timing rules.

```rust
// src/projections/multi_thread_coordination.rs

pub struct MultiThreadCoordination {
    /// domain → list of outbound contact records
    pub by_domain: HashMap<String, Vec<DomainContact>>,
}

pub struct DomainContact {
    pub contact_id: String,
    pub contact_name: String,
    pub contact_role: ContactRole,
    pub sequence_id: Option<String>,
    pub last_contacted_at: Option<String>,   // ISO datetime of last sent step
    pub next_scheduled_at: Option<String>,   // ISO date of next due step
    pub sequence_status: SequenceOverallStatus,
    pub engagement: EngagementSignal,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum ContactRole {
    Champion,
    ChampionBoss,
    EconomicBuyer,
    Unknown,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
pub enum EngagementSignal {
    NoActivity,
    Replied,
    PositiveReply,
    WrongPerson,
    NotInterested,
}

impl MultiThreadCoordination {
    /// Check whether it is safe to contact a new person at this domain right now.
    /// Returns None if safe, or Some(reason) if blocked.
    pub fn check_contact_safe(
        &self,
        domain: &str,
        new_contact_id: &str,
        company_size_bucket: &str,
        now: &str,
    ) -> Option<ContactBlockReason> {
        let contacts = match self.by_domain.get(domain) {
            None => return None, // no prior contacts at this domain — safe
            Some(c) => c,
        };

        let min_offset_hours: i64 = match company_size_bucket {
            "enterprise" => 72,
            _ => 24,
        };

        for contact in contacts {
            if contact.contact_id == new_contact_id {
                continue; // same contact — skip
            }
            if let Some(last_at) = &contact.last_contacted_at {
                let hours_since = hours_between(last_at, now);
                if hours_since < min_offset_hours {
                    return Some(ContactBlockReason::TooSoon {
                        last_contact_name: contact.contact_name.clone(),
                        hours_remaining: min_offset_hours - hours_since,
                    });
                }
            }
            // If any contact at this domain has an active sequence AND positive engagement,
            // block independent buyer outreach until champion flow resolves.
            if contact.engagement == EngagementSignal::PositiveReply
                && contact.sequence_status == SequenceOverallStatus::Active
            {
                return Some(ContactBlockReason::ChampionActiveEngagement {
                    champion_name: contact.contact_name.clone(),
                });
            }
        }

        None
    }
}

pub enum ContactBlockReason {
    TooSoon { last_contact_name: String, hours_remaining: i64 },
    ChampionActiveEngagement { champion_name: String },
}
```

### Enforcement in PRD-17 (Sequence Automation)

The `activate_sequence` command (PRD-17) is extended to call `check_contact_safe` before activating any step 1:

```rust
// In activate_sequence_internal — check before emitting SequenceSendDateSet for step 1:
if step.step == 1 {
    let domain = extract_domain(&company.website);
    if let Some(block) = state.multi_thread_coordination.check_contact_safe(
        &domain,
        &contact.id,
        &company.size_bucket,
        &now(),
    ) {
        match block {
            ContactBlockReason::TooSoon { last_contact_name, hours_remaining } => {
                // Delay step 1's send_date by hours_remaining
                // Show warning in EventFold UI: "Sending too close to [name]. Delayed X hours."
            }
            ContactBlockReason::ChampionActiveEngagement { champion_name } => {
                // Block sequence activation entirely
                // Surface UI warning: "Champion [name] has replied — contact buyer manually
                //   or ask champion for an introduction."
            }
        }
    }
}
```

---

## The "Wrong Person" Reply Handler (Integration with PRD-12)

### Current behavior (PRD-12)

PRD-12 defines 6 reply types. The `wrong_person` type currently triggers a reply draft with the instruction:
> "Thank them for the redirect, ask if they can introduce you to [Sarah] rather than cold-reaching her."

### Extended behavior with PRD-21

When a `wrong_person` reply is received, the system now has the `ContactMapping` available. The handler distinguishes two scenarios:

**Scenario A: The Champion replied "wrong person"**

The champion is telling you they're not the right person to evaluate this. Two sub-cases:
1. They name someone else → look up that person in `fallback_contacts[]` from PRD-10. If found, promote them to Champion in the `ContactMapping`.
2. They redirect to a more senior person → that person may be the Economic Buyer. Update `ContactMapping.economic_buyer` with the redirect target and set `buyer_confidence = 0.95`.

**Scenario B: The Economic Buyer replied "wrong person"**

The buyer is redirecting you to their team — almost certainly to the Champion. If the Buyer names a person, look them up against `fallback_contacts[]`. If found or identifiable, promote them to Champion in the `ContactMapping` and trigger the Champion sequence immediately.

### ContactMapping mutation on "wrong person" reply

```typescript
// In the reply handler (EmailFold Reply Assist + EventFold):

function handleWrongPersonReply(
  mapping: ContactMapping,
  replierRole: "champion" | "economic_buyer",
  redirectedName: string | null,   // extracted from reply text by Haiku
  redirectedTitle: string | null,
): ContactMapping {
  const updated = { ...mapping };

  if (replierRole === "champion") {
    // The champion says wrong person — look for someone in fallback_contacts
    const fallback = mapping.champion?.fallback_contacts.find(
      c => redirectedName && c.name.toLowerCase().includes(redirectedName.toLowerCase())
    );
    if (fallback) {
      // Promote fallback to champion
      updated.champion = promoteToContact(fallback);
      updated.champion_confidence = 0.9;
    } else if (redirectedTitle && isBuyerTitle(redirectedTitle)) {
      // They redirected to a more senior person — that's the buyer
      updated.economic_buyer = { name: redirectedName, title: redirectedTitle, ...defaults };
      updated.buyer_confidence = 0.8;
    }
    // Trigger: start champion sequence for new contact
    updated.recommended_sequence_strategy = "champion_only"; // or recalculate
  }

  if (replierRole === "economic_buyer") {
    // Buyer says wrong person — they're pointing to the champion
    const fallback = mapping.economic_buyer?.fallback_contacts.find(
      c => redirectedName && c.name.toLowerCase().includes(redirectedName.toLowerCase())
    );
    if (fallback) {
      updated.champion = promoteToContact(fallback);
      updated.champion_confidence = 0.95; // buyer-confirmed champion is high confidence
    }
    // Trigger: start champion sequence immediately (buyer already knows about you)
    updated.recommended_sequence_strategy = "champion_then_buyer";
    updated.strategy_config.secondary_trigger = "champion_replied"; // accelerated path
  }

  return updated;
}
```

### The "wrong person" reply draft (updated framing)

PRD-12's `wrong_person` reply instruction is updated to always ask for a warm referral — never just thank and move on:

```javascript
// In replyTypeInstructions (PRD-12), wrong_person updated to:
wrong_person: `
  - Thank them for the redirect immediately
  - Ask for a warm introduction rather than cold-reaching the new person:
    "Would you be able to intro me to [name]? A warm intro would be much more valuable
    than me reaching out cold."
  - If they didn't name someone: "Who on your team owns [specific pain area]? Happy to
    take it from there."
  - One ask only — they're doing you a favor; don't pile on
  - Keep it under 3 sentences
`
```

The warm referral ask is deliberate. A cold redirect ("you should talk to Sarah") is less valuable than a warm introduction ("I'll introduce you to Sarah"). The reply draft should always angle for the introduction.

---

## EventFold UI — Contacts Tab Per Company

### Company Detail view — Contacts tab

The Company Detail view in EventFold now shows the full `ContactMapping` for that company. Previously this view showed a flat list of contacts. Now it is organized by role.

```
Company: Acme Corp
Tabs: [Overview] [Sequences] [Contacts] [Activity] [Notes]
                              ─────────
Contacts
──────────────────────────────────────────────────────────────────────
Strategy: Champion First → Buyer on Step 3 No-Reply          [Edit]

  CHAMPION                                     Confidence: 92%
  ─────────────────────────────────────────────────────────────
  Jane Smith
  Director of Data Engineering
  jane@acme.com  |  linkedin.com/in/janesmith
  [View Sequence] [Draft Email] [Mark as Wrong Person]

  Signals:
  • 3 open data pipeline roles in past 60 days
  • Posted about Kafka consumer lag issues 3 weeks ago
  • Active GitHub commits (last commit: 11 days ago)
  • Promoted to Director in January 2026


  ECONOMIC BUYER                               Confidence: 85%
  ─────────────────────────────────────────────────────────────
  Mike Chen
  VP Engineering
  Not yet contacted
  [Start Buyer Sequence] [Draft Email]

  Status: Waiting — contact after Jane engages or after Step 3 no-reply
  Scheduled outreach: Mar 25, 2026 (if no champion reply)

  Signals:
  • Manages engineering org of 40+
  • Posts about team growth and engineering culture
  • Hired 8 engineers in the past 6 months (LinkedIn)


  SEQUENCE STRATEGY
  ─────────────────────────────────────────────────────────────
  champion_then_buyer

  Day 0   → Jane Smith (Champion)       Step 1 — SENT Mar 11
  Day 3   → Jane Smith (Champion)       Step 2 — SCHEDULED Mar 14
  Day 8   → Jane Smith (Champion)       Step 3 — SCHEDULED Mar 19
  Day 14  → Mike Chen (Buyer trigger)   Step 1 — PENDING (fires if no reply)

  ⚠ Multi-contact rules active: 72-hour offset enforced for this company

──────────────────────────────────────────────────────────────────────
AI-found contacts [🤖]   Last enriched: Mar 11, 2026   [Re-enrich]
```

### Contact role badges

Contact cards throughout EventFold (Outbox, Company list, Activity feed) now display a role badge:
- `[C]` — Champion (blue)
- `[B]` — Economic Buyer (green)
- `[C+B]` — Same person (small company) (purple)
- `[?]` — Role unknown / not yet classified (gray)

### Multi-thread warning banner

When an SDR attempts to manually draft or send to a second company contact too soon, EventFold shows a blocking warning:

```
┌─────────────────────────────────────────────────────────────────┐
│  ⚠  Multi-Thread Rule Violation                                  │
│                                                                  │
│  You contacted Jane Smith at Acme Corp 6 hours ago.             │
│  Sending to Mike Chen before a 72-hour offset risks both        │
│  contacts comparing notes.                                       │
│                                                                  │
│  Recommended: Send on Mar 14, 2026 (72hr offset)               │
│                                                                  │
│  [Delay to Mar 14]   [Override — I understand the risk]         │
└─────────────────────────────────────────────────────────────────┘
```

The SDR can override — this is a warning, not a hard block. The override is logged to the company's activity feed for review.

---

## Integration with Existing PRDs

### PRD-10: Contact Research

`RecommendedContact` is unchanged. The `ContactMapping` is a new wrapper. The existing `recommended_contact` field on the `ProspectIntelV2Payload` remains as the **Champion** by default:

```typescript
// Updated intel payload — additive, backward-compatible:
interface ProspectIntelV2Payload {
  // ... all existing fields ...
  recommended_contact: RecommendedContact | null;     // still present — backward compat
  contact_mapping: ContactMapping | null;             // new — replaces above in all new code
}
```

Any code that reads `recommended_contact` continues to work. New code should read `contact_mapping.champion` instead.

When ProspectFold intel is imported into EventFold (via PRD-09 API), the `contact_mapping` is stored on the Company aggregate and the two contacts are auto-created as separate `Contact` aggregates linked to the company.

### PRD-14/15: Sequence Generation and Data Model

Sequences are now tagged with the contact role they target. New field added to the `Interaction` struct (PRD-15):

```rust
// Added to Interaction — Option<T> for backward compat:
pub contact_role: Option<ContactRole>,   // Champion | ChampionBoss | EconomicBuyer | Unknown
```

New field added to `SequenceRecord` in `SequenceIndex` (PRD-15):

```rust
pub struct SequenceRecord {
    // ... all existing fields ...
    pub contact_role: ContactRole,
    pub is_secondary_sequence: bool,     // true if this sequence was triggered by champion engagement
    pub linked_sequence_id: Option<String>, // the champion sequence that triggered this buyer sequence
}
```

EmailFold's sequence generation prompt (PRD-14) now accepts a `contact_role` parameter and adjusts framing:

```javascript
// Phase 2b sequence prompt — role-aware framing:
const roleFraming = {
  champion: `
    This sequence targets the CHAMPION (hands-on operator experiencing the pain).
    - Technical tone, peer-to-peer
    - References specific technical pain and real implementation details
    - Avoid business/ROI language in steps 1-3; step 4 can mention team impact
    - The ask: a technical conversation or a look at how you've solved this problem
  `,
  economic_buyer: `
    This sequence targets the ECONOMIC BUYER (executive who controls budget).
    - Business outcome focus
    - References team impact, ROI, and peer social proof
    - No deep technical implementation details
    - The ask: a short intro call (20 min) to see if there's a fit
  `,
  champion_only: `
    This sequence targets a single person who is BOTH champion and buyer.
    - Blend technical value in steps 1-2 with business ROI in steps 3-4
    - Peer tone — they are technically sophisticated but also make the decision
  `,
};
```

### PRD-17: Sequence Automation

Behavior 1 (Auto-Stop on Reply) from PRD-17 is extended with a new trigger: when a champion sequence is cancelled due to a reply, PRD-21 evaluates whether to activate the buyer sequence.

New rule added to PRD-17's automation engine:

```rust
// Extended auto-stop handler — after cancelling champion sequence on reply:
if reply_type == ReplyType::Positive || reply_type == ReplyType::Question {
    // Champion engaged positively — put buyer sequence in "hold" state
    // SDR should route through champion introduction, not independent outreach
    emit_event(buyer_sequence_id, InteractionEvent::SequenceHeldPendingIntro {
        reason: "champion_replied_positively",
        champion_name: champion_contact.name,
    });
    notify_sdr("Jane Smith replied — consider asking her to introduce you to Mike Chen rather than contacting him directly.");
}

if no_reply_after_step_3 {
    // Champion ghosted — activate buyer sequence after 7-day delay
    schedule_buyer_sequence_activation(
        buyer_sequence_id,
        activation_date: today() + Duration::days(7),
    );
}
```

New `SequenceStatus` variant for held sequences:

```rust
pub enum SequenceStatus {
    // ... existing variants ...
    HeldPendingIntro,    // champion replied; buyer sequence on hold awaiting intro decision
}
```

### PRD-12: Reply Drafting

The `wrong_person` reply type in PRD-12 now cross-references `ContactMapping`:

1. Before generating the `wrong_person` draft, the system checks if the company has a `ContactMapping`
2. If yes, it injects the correct redirect target name and role into the prompt (rather than asking the SDR to remember who the other contact is)
3. The draft is auto-personalized: "Would you be able to intro me to Mike Chen (VP Engineering)?" rather than "Would you be able to intro me to the right person?"

```javascript
// Extended replyTypeInstructions for wrong_person — with ContactMapping:
wrong_person: (mapping) => `
  - Thank them for the redirect
  ${mapping?.economic_buyer?.name
    ? `- Ask for a warm intro to ${mapping.economic_buyer.name} specifically`
    : `- Ask who on their team owns [pain area] and if they can make an intro`
  }
  - Phrase it as a favor request, not a demand
  - Under 3 sentences
`
```

---

## New Tauri IPC Commands (EventFold)

```rust
/// Store or update the ContactMapping for a company.
/// Called when: ProspectFold intel arrives, SDR overrides a contact role,
///              or wrong_person reply triggers a mapping update.
#[tauri::command]
pub async fn upsert_contact_mapping(
    company_id: String,
    mapping: ContactMappingInput,
    state: State<'_, AppState>,
) -> Result<(), AppError>

pub struct ContactMappingInput {
    pub champion_contact_id: Option<String>,
    pub economic_buyer_contact_id: Option<String>,
    pub champion_confidence: f32,
    pub buyer_confidence: f32,
    pub strategy: String,              // serialized SequenceStrategy
    pub mapping_rationale: String,
    pub company_size_bucket: String,
}

/// Get the ContactMapping for a company (for display in Company Detail view).
#[tauri::command]
pub async fn get_contact_mapping(
    company_id: String,
    state: State<'_, AppState>,
) -> Result<Option<ContactMappingView>, AppError>

pub struct ContactMappingView {
    pub champion: Option<ContactRoleView>,
    pub economic_buyer: Option<ContactRoleView>,
    pub strategy: String,
    pub mapping_rationale: String,
    pub company_size_bucket: String,
    pub champion_sequence_id: Option<String>,
    pub buyer_sequence_id: Option<String>,
    pub buyer_sequence_trigger_date: Option<String>,
    pub multi_thread_status: MultiThreadStatus,
}

pub struct ContactRoleView {
    pub contact_id: String,
    pub name: String,
    pub title: String,
    pub email: Option<String>,
    pub linkedin_url: Option<String>,
    pub confidence: f32,
    pub role: ContactRole,
    pub sequence_id: Option<String>,
    pub sequence_status: Option<SequenceOverallStatus>,
    pub engagement: EngagementSignal,
    pub personalization_hooks: Vec<String>,
}

pub enum MultiThreadStatus {
    Safe,
    CooldownActive { hours_remaining: i64, last_contact_name: String },
    ChampionEngaged { champion_name: String },
}

/// Override a contact's role in the mapping (SDR correction).
#[tauri::command]
pub async fn override_contact_role(
    company_id: String,
    contact_id: String,
    new_role: ContactRole,
    state: State<'_, AppState>,
) -> Result<(), AppError>

/// Handle a wrong_person reply — updates ContactMapping and returns new redirect target.
#[tauri::command]
pub async fn handle_wrong_person_redirect(
    company_id: String,
    replier_contact_id: String,
    redirected_name: Option<String>,
    redirected_title: Option<String>,
    state: State<'_, AppState>,
) -> Result<WrongPersonRedirectResult, AppError>

pub struct WrongPersonRedirectResult {
    pub new_champion: Option<ContactRoleView>,
    pub new_buyer: Option<ContactRoleView>,
    pub suggested_action: String,   // human-readable next step
    pub updated_strategy: String,
}

/// Check whether it is safe to contact a person at a company right now.
/// Used by UI to show warnings before drafting or sending.
#[tauri::command]
pub async fn check_multi_thread_safety(
    company_id: String,
    target_contact_id: String,
    state: State<'_, AppState>,
) -> Result<MultiThreadStatus, AppError>
```

---

## New EventFold Event Types

```rust
pub enum InteractionEvent {
    // ... all existing variants from PRD-15 ...

    /// Contact role was assigned or changed (champion / economic_buyer / etc.)
    ContactRoleAssigned {
        role: ContactRole,
        confidence: f32,
        source: ContactRoleSource,   // "ai_classification" | "sdr_override" | "wrong_person_redirect"
    },

    /// Buyer sequence was put on hold because champion replied positively.
    SequenceHeldPendingIntro {
        reason: String,
        champion_name: String,
    },

    /// Buyer sequence was unblocked — either SDR approved or champion-intro path chosen.
    SequenceIntroHoldReleased {
        release_reason: String,   // "sdr_approved_direct" | "champion_introduced" | "timeout"
    },
}

pub enum ContactRoleSource {
    AiClassification,
    SdrOverride,
    WrongPersonRedirect,
}
```

---

## ProspectFold Phase 3 Output Changes

The `ProspectIntelV2Payload` type (used in the EventFold bridge, PRD-01/02) gains one new top-level field. All existing fields are unchanged.

```typescript
// Additive change — existing consumers are unaffected:
interface ProspectIntelV2Payload {
  // ... all existing fields unchanged ...

  // NEW — present when Phase 3 champion/buyer classification ran:
  contact_mapping: {
    champion: RecommendedContact | null;
    economic_buyer: RecommendedContact | null;
    champion_confidence: number;
    buyer_confidence: number;
    company_size_bucket: "small" | "mid" | "enterprise";
    mapping_rationale: string;
    recommended_sequence_strategy: string;
    strategy_config: {
      primary_contact_name: string;
      secondary_contact_name: string | null;
      secondary_trigger: string;
      secondary_delay_days: number | null;
      secondary_intro_framing: string | null;
      multi_thread_offset_hours: number;
    };
  } | null;
}
```

### Backward compatibility

The existing `recommended_contact` field remains populated. Its value is set to `contact_mapping.champion` when a mapping exists. Legacy code that only reads `recommended_contact` continues to function correctly without modification.

---

## ProspectFold UI Changes

### Company queue card — dual contact display

```
┌─ Acme Corp ──────────────────────────────────────────────────────┐
│  acme.com  |  150 employees (mid)  |  ICP Score: 88              │
│                                                                   │
│  🎯 Jane Smith — Director of Data Engineering                     │
│     Champion  •  Confidence: 92%                                  │
│     "Posted about Kafka consumer lag 3w ago"                      │
│     "Promoted to Director Jan 2026"                               │
│     📧 jane@acme.com                                              │
│                                                                   │
│  💰 Mike Chen — VP Engineering                                    │
│     Economic Buyer  •  Confidence: 85%                            │
│     "Contact after Jane engages or step 3 no-reply"               │
│                                                                   │
│  Strategy: champion_then_buyer                                    │
│  [Override Champion]  [Override Buyer]                            │
│                                                                   │
│  Best angle: Data Pipeline Reliability                            │
│  [Generate Champion Sequence]   [Generate Buyer Sequence]         │
└──────────────────────────────────────────────────────────────────┘
```

### Phase 3 loading state — extended

```
Acme Corp:
  ✓ Phase 1: Company scan complete
  ✓ Phase 2: ICP analysis complete
  ⟳ Phase 3: Finding contacts...
    → Apollo search (top 5 candidates)...
    → Enriching Jane Smith (Director of Data Engineering)...
    → Enriching Mike Chen (VP Engineering)...
    → Classifying champion / buyer roles...
  ✓ Phase 3: Jane Smith (Champion) + Mike Chen (Buyer) found
  Strategy: champion_then_buyer
```

### Small company handling

When `company_size_bucket = "small"`, show a simplified single-contact card:

```
┌─ TinyStartup Inc ────────────────────────────────────────────────┐
│  tinystartup.com  |  12 employees (small)  |  ICP Score: 76      │
│                                                                   │
│  👤 Sarah Park — CTO                                              │
│     Champion + Buyer (small company)                              │
│     "Sole technical decision maker"                               │
│     📧 sarah@tinystartup.com                                      │
│                                                                   │
│  Strategy: champion_only                                          │
│  [Generate Sequence]                                              │
└──────────────────────────────────────────────────────────────────┘
```

---

## Updated Pipeline Cost Table

| Step | Model | Cost (per company) |
|---|---|---|
| Phase 0: Pre-qual | Haiku | $0.0002 |
| Phase 1: Company scan | Haiku | $0.007 |
| Phase 2: ICP synthesis | Opus | $0.10 |
| Phase 3a: Apollo People Search (5 results) | API | $0 (plan credit) |
| Phase 3b: Person activity scan (top 2) | Haiku | $0.0006 |
| Phase 3c: Hook synthesis + champion/buyer classification | Haiku | $0.0003 |
| EmailFold Phase 1 | Haiku | $0.003 |
| EmailFold Phase 2 (champion sequence) | Sonnet | $0.005 |
| EmailFold Phase 2b (buyer sequence, if generated) | Sonnet | $0.005 |
| **Total per company (with buyer sequence)** | | **~$0.121** |

Additional cost vs PRD-10 baseline: ~$0.0009 for classification + ~$0.005 for second sequence = ~$0.006 per company. At 20 companies per session: **~$0.12 additional per session** for a full champion + buyer mapping and dual sequence. Negligible.

---

## Out of Scope

- Automatic email sending (user always sends manually)
- Real-time org chart construction (beyond Apollo data)
- LinkedIn scraping (Apollo data only — scraping violates ToS)
- Detecting when champion and buyer have an internal conversation about your outreach
- Account-based marketing (ABM) multi-contact campaigns beyond 3 people
- Contact role tracking across multiple companies (e.g., a person who moves from champion to buyer at a new company)

---

## Success Metrics

| Metric | Target |
|---|---|
| % of companies with both champion + buyer identified | > 60% (remaining are too small or not in Apollo) |
| % of mid/enterprise company sequences that follow champion-first order | 100% (enforced by system) |
| Multi-thread timing violations (two contacts same day) | < 2% of active sequences |
| Reply rate improvement when champion is sequenced first vs buyer-first | Measure over 60-day A/B with 100+ companies |
| "Wrong person" replies that result in a successful redirect within 7 days | > 40% |
| SDR time to configure champion/buyer mapping per company | 0 minutes (fully automated; SDR only overrides) |

---

## Open Questions for Senior Dev

1. **`ContactMapping` storage**: Should the mapping be stored as a first-class aggregate in EventFold (its own JSONL stream) or as enrichment metadata on the Company aggregate? The case for a separate aggregate: it can be versioned independently (re-enriched, corrected by SDR). The case for inline: simpler, one less stream type.

2. **Phase 3 parallel enrichment**: PRD-10 enriches the top 1 contact. With this PRD, we enrich the top 2 (champion + buyer). Does this run in parallel (two concurrent Haiku calls) or sequential? Parallel is faster but doubles concurrent API calls. At concurrency-3 (PRD-08), this means 6 simultaneous Haiku calls during Phase 3. Is that within rate limits?

3. **Buyer sequence generation trigger**: When does EmailFold generate the buyer sequence? Option A: always generate both sequences upfront (wastes tokens if buyer is never contacted). Option B: generate buyer sequence only when `secondary_trigger` fires (lazy generation, slightly slower when needed). Recommendation: Option A for simplicity — the $0.005 Sonnet cost for the buyer sequence is negligible and it's better to have it ready.

4. **`SequenceHeldPendingIntro` timeout**: If an SDR never acts on the "champion replied, hold buyer sequence" state, how long should the hold last before auto-releasing? Suggestion: 14 days. After 14 days without SDR action, the hold expires and the buyer sequence becomes available again. This should be a configurable setting.

5. **Multi-thread coordination across ProspectFold sessions**: If a company was prospected in one session and a contact is already in an active sequence, what happens when ProspectFold re-discovers the same company in a new session? The `MultiThreadCoordination` projection should surface this as a warning in ProspectFold's queue — "already in sequence with Jane Smith." Confirm this lookup happens via the EventFold local API (PRD-09) before displaying the company card.
