# PRD-10 — Contact & Person Research: Finding THE Person
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** ProspectFold owner + EmailFold owner
**Priority:** P0 — The biggest gap in the entire pipeline
**Depends on:** PRD-09 (local HTTP API)

---

## Problem

The current pipeline finds *companies*. It never finds *people*.

ProspectFold produces a list of 20 companies that match your ICP. EmailFold generates cold emails. But the emails are addressed to `[contactName]` and `[contactRole]` — fields the user fills in manually. The user has to:

1. Google "Acme Corp VP Engineering"
2. Find the right person on LinkedIn
3. Read their profile to find something to reference
4. Copy their name and role into EmailFold
5. Hope the email lands on the right person

That's 5–10 minutes per company, done 20 times per session. It's also the step that determines whether the email gets a reply. A generic "Dear VP Engineering" email gets ignored. An email that references someone's specific LinkedIn post from last week gets a reply.

**The gap:** Person-level research is the highest-value, highest-effort step in the pipeline — and it's entirely manual.

---

## Proposed Solution

Add a **contact discovery + enrichment** step to ProspectFold, powered by:

1. **Apollo People Search API** — find the right decision maker at each company (title-based filtering)
2. **Web search (Haiku)** — find their LinkedIn profile, recent posts, job changes, publications
3. **Claude Haiku synthesis** — extract personalization hooks from their public activity

The output: for each company, ProspectFold returns not just the company intel but **the specific person to email + what to say to them personally**.

This data flows automatically to EmailFold (via PRD-09 API) so EmailFold can pre-fill the contact and inject person-level personalization into Phase 2.

---

## User Stories

- As a SDR, after a ProspectFold run I see the recommended contact for each company so I never have to search LinkedIn manually
- As a SDR, EmailFold automatically personalizes emails with the contact's recent activity so I don't have to research them myself
- As a SDR, I can override the recommended contact if I know a better person to reach
- As a manager, reply rates improve because emails reference real, specific things about the recipient

---

## Flow Diagram

```
ProspectFold
─────────────
Phase 0: Pre-qualification (Haiku — existing from PRD-04)
Phase 1: Company web scan (Haiku — existing)
Phase 2: ICP synthesis + angles (Opus — existing)

NEW Phase 3: Contact Discovery + Enrichment
  For each company in apollo_companies[]:
    ↓
    Step 3a: Apollo People Search
      → search by company_id + title filters (VP/Director/Head of [ICP target role])
      → returns: name, title, email (if available), LinkedIn URL, location
      → pick top candidate by seniority + title match
    ↓
    Step 3b: LinkedIn/Web Activity Scan (Haiku + web_search)
      → search: "[person name] [company] site:linkedin.com OR recent posts"
      → extract: recent posts, job changes, publications, talks, interests
    ↓
    Step 3c: Haiku synthesis
      → input: Phase 2 angles + Phase 3b activity scan
      → output: 2–3 person-specific personalization hooks
        e.g. "Referenced struggling with Postgres migrations in a post 3 weeks ago"
             "Just promoted to VP — likely establishing her tech roadmap"
             "Gave a talk at PgConf about database performance"

Phase 3 output per company (added to existing intel payload):
{
  "recommended_contact": {
    "name": "Jane Smith",
    "title": "VP Engineering",
    "email": "jane@acme.com",           // if Apollo has it
    "linkedin_url": "linkedin.com/in/janesmith",
    "location": "San Francisco, CA",
    "seniority": "VP",
    "personalization_hooks": [
      "Posted about Postgres scaling challenges 3 weeks ago",
      "Just promoted to VP in January — 2 months in",
      "Engineering team grew from 12 → 30 in the past 6 months"
    ],
    "confidence": 0.92,                 // how confident we are this is the right person
    "fallback_contacts": [              // alternatives if this one is wrong
      { "name": "Bob Lee", "title": "Engineering Manager", ... }
    ]
  }
}
```

---

## Apollo People Search API

Apollo's People Search endpoint (`POST /v1/mixed_people/search`) accepts:
- `organization_ids[]` — Apollo company IDs (already in ProspectFold's company objects)
- `titles[]` — title filters
- `seniority[]` — `["vp", "director", "head", "c_suite"]`

This returns people with their name, title, email (if unlocked), LinkedIn URL, and location.

**Title targeting strategy:**

The ICP criteria from Phase 2 define who the decision maker is. Map ICP signals to target titles:

```javascript
const TARGET_TITLES = {
  // Engineering-focused ICP
  "engineering_leader": ["VP Engineering", "CTO", "Head of Engineering",
                          "Director of Engineering", "Engineering Manager"],
  // Data/ML ICP
  "data_leader": ["VP Data", "Head of Data", "Chief Data Officer",
                   "Director of Data Engineering", "Head of Analytics"],
  // Product ICP
  "product_leader": ["VP Product", "CPO", "Head of Product", "Director of Product"],
  // Default fallback
  "default": ["VP Engineering", "CTO", "VP Technology", "Director of Engineering"],
};

// ProspectFold Phase 2 now returns: target_persona: "engineering_leader"
// Phase 3 uses: TARGET_TITLES[target_persona]
```

---

## Person Activity Research (Phase 3b)

For the top contact candidate, run a Haiku web search to find recent activity:

```javascript
const enrichContact = async (contact, company, angles) => {
  const searchQuery = `"${contact.name}" "${company.name}" (linkedin OR blog OR conference OR interview)`;

  const result = await anthropic.messages.create({
    model: "claude-haiku-3-5",
    max_tokens: 600,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{
      role: "user",
      content: `Find recent public activity for ${contact.name}, ${contact.title} at ${company.name}.

Search for: recent LinkedIn posts, blog posts, conference talks, interviews, job changes, or any public statements about their work, challenges, or opinions.

Then, given these sales angles we're using:
${angles.map(a => `- ${a.name}: ${a.hook}`).join('\n')}

Return JSON:
{
  "recent_activity": ["activity 1", "activity 2"],  // what they've done/said recently
  "personalization_hooks": ["hook 1", "hook 2", "hook 3"],  // specific things to reference
  "best_angle": "angle name that fits this person best based on their activity",
  "timing_notes": "anything about their situation that affects timing (new role, recent announcement, etc.)"
}`
    }]
  });

  return JSON.parse(extractJSON(result.content));
};
```

**Cost:** 1 Haiku call per contact = ~$0.0005 per company. Negligible.
**Time:** 2–3 seconds per contact, runs in parallel with other companies.

---

## EmailFold Integration

When EmailFold receives a company from the ProspectFold queue (via the local API), it now also receives the recommended contact. This pre-fills:

- `contactName` — auto-filled from `recommended_contact.name`
- `contactRole` — auto-filled from `recommended_contact.title`

And injects personalization hooks into Phase 2's prompt:

```javascript
// Phase 2 prompt addition (after RECIPIENT block):
const personalizationBlock = contact.personalization_hooks?.length
  ? `\nPERSON-SPECIFIC HOOKS (use 1–2 of these naturally in the email):
${contact.personalization_hooks.map(h => `- ${h}`).join('\n')}

TIMING NOTES: ${contact.timing_notes || 'none'}
BEST ANGLE FOR THIS PERSON: ${contact.best_angle || 'use your judgment'}
`
  : '';
```

The result: EmailFold generates an email that says:

> "Hi Jane — I saw your post about Postgres scaling challenges last month. We've been solving exactly that problem for teams like yours at Acme..."

Instead of:

> "Hi Jane — I noticed Acme Corp is a fast-growing engineering team and thought you might be interested in..."

---

## UI Changes

### ProspectFold — Company Queue Cards

Each card now shows the recommended contact:

```
┌─ Acme Corp ──────────────────────────────────────────────┐
│  acme.com  |  150 employees  |  ICP Score: 85            │
│                                                           │
│  👤 Jane Smith — VP Engineering                           │
│     "Posted about Postgres migration pain 3w ago"         │
│     "Just promoted Jan 2026"                              │
│     📧 jane@acme.com  [Override contact]                  │
│                                                           │
│  Best angle: Technical Debt Automation                    │
│  [Generate Email]                                         │
└──────────────────────────────────────────────────────────┘
```

The "Override contact" link opens a picker showing `fallback_contacts[]` or a manual entry field.

### Phase 3 Loading State

The company card shows a step-by-step progress during Phase 3:

```
Acme Corp:
  ✓ Phase 1: Company scan complete
  ✓ Phase 2: ICP analysis complete
  ⟳ Phase 3: Finding decision maker...
    → Apollo search...
    → Enriching Jane Smith...
    → Extracting personalization hooks...
  ✓ Phase 3: Jane Smith (VP Engineering) found
```

### EmailFold — Contact Pre-fill

When a company card from the queue is selected, `contactName`, `contactRole`, and the personalization hooks are already populated. The user sees:

```
Target Company:  Acme Corp
Contact:         Jane Smith (auto-filled ✓)
Role:            VP Engineering (auto-filled ✓)

Personalization hooks:
  • Posted about Postgres migration challenges 3w ago ✓
  • Promoted to VP in January ✓
  [Edit hooks]
```

---

## Handling No Contact Found

If Apollo returns no results for a company (< 50 employees, private company, not in Apollo's database):

1. Show "No contact found" on the company card
2. Offer a web-only fallback: search for `"[company] VP Engineering" site:linkedin.com`
3. Show the search result URL to the user with a "Visit LinkedIn" button
4. Allow manual entry of name + role
5. If no contact, EmailFold generates a generic but still angle-targeted email addressed to the role ("Hi [VP Engineering]")

---

## Apollo API Access

ProspectFold already uses Apollo for company search. People search uses the same API key.

**Endpoint:** `POST https://api.apollo.io/v1/mixed_people/search`

**Rate limits:** Apollo's API has rate limits per plan tier. At concurrency 3 (PRD-08), 3 simultaneous people searches should be within limits for all paid plans.

**Email reveal:** Apollo's contact search returns emails for "unlocked" contacts based on the plan's monthly credit limit. If email isn't available, the contact still has name, title, LinkedIn, and location — enough for personalization.

**Cost:** Apollo API pricing is based on export credits, not per-search. People searches are typically included in the plan.

---

## New Phase 3 Data Shape

Added to the existing `ProspectIntelV2Payload` and EventFold's `ProspectIntel` aggregate:

```typescript
interface RecommendedContact {
  name: string;
  title: string;
  email: string | null;
  linkedin_url: string | null;
  location: string | null;
  seniority: string;
  personalization_hooks: string[];
  best_angle: string;
  timing_notes: string | null;
  confidence: number;           // 0-1
  fallback_contacts: Array<{
    name: string;
    title: string;
    linkedin_url: string | null;
  }>;
  enrichment_source: "apollo" | "web_only" | "manual";
}

// Added to ApolloCompanyRaw in the intel payload:
interface ApolloCompanyWithContact extends ApolloCompanyRaw {
  recommended_contact: RecommendedContact | null;
}
```

EventFold stores the recommended contact on the Company aggregate (or as a linked Contact aggregate if the user has confirmed this person is correct).

---

## Auto-create Contact in EventFold

When ProspectFold intel is received by EventFold via the local API (PRD-09), and `recommended_contact` is present:
- Auto-create a `Contact` aggregate linked to the Company
- Set `contact.source = "prospectfold_ai"`
- Set `contact.enrichment_data = { personalization_hooks, linkedin_url, timing_notes }`
- Show it in Company Detail under Contacts with a "🤖 AI-found" badge

The SDR can then confirm ("Yes, this is the right person") or reassign ("Use Bob instead"). Confirmation removes the AI badge.

---

## Pipeline Cost Impact

| Step | Model | Cost (per company) |
|---|---|---|
| Phase 0: Pre-qual | Haiku | $0.0002 |
| Phase 1: Company scan | Haiku | $0.007 |
| Phase 2: ICP synthesis | Opus | $0.10 |
| Phase 3a: Apollo People Search | API call | $0 (plan credit) |
| Phase 3b: Person activity scan | Haiku | $0.0005 |
| Phase 3c: Hook synthesis | (included in 3b) | $0 |
| EmailFold Phase 1 | Haiku | $0.003 |
| EmailFold Phase 2 | Sonnet | $0.005 |
| **Total per company** | | **~$0.116** |

Full 20-company session: **~$2.32** (up from $0.30 post-optimization, but includes person research). The ROI: emails with person-level personalization typically 2–3× higher reply rates.

---

## Out of Scope

- Real-time LinkedIn scraping (ToS violation — use Apollo's data only)
- Building a contact database or enrichment pipeline beyond Apollo
- Email verification / bounce checking
- Phone number discovery

---

## Success Metrics

- Manual contact research time per company: **0 minutes** (from 5–10 min)
- % of EmailFold-generated emails with person-specific personalization hook: **> 85%**
- Reply rate improvement from personalized vs generic: **target 2× improvement** (measure after 30-day A/B)
- Contact found by Apollo: **> 70%** of companies (remaining 30% are too small or private)

---

## Open Questions

1. Does the ProspectFold Apollo integration use the `organization_id` from Apollo's company objects? If yes, the People Search can use that directly. If not, we need a company-to-Apollo-ID lookup step first.
2. Should Phase 3 run automatically for all companies, or only for companies above a certain ICP score threshold (e.g., > 70)?
3. What happens to the recommended contact when ProspectFold runs the same NAICS code again 30 days later? Should it re-enrich contacts (they may have changed roles) or use cached data?
