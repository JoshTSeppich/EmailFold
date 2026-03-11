# PRD-10 — Contact & Person Research: Finding THE Right Person at THE Right Moment
**Version:** 2.0
**Date:** 2026-03-11
**Supersedes:** PRD-10 v1.0
**Author:** Foxworks / Claude Architecture Session
**For:** ProspectFold owner + EmailFold owner + Senior Dev (EventFold)
**Priority:** P0 — Phase 3 coordinator. PRDs 19, 20, 21, and 22 are sub-specifications of Phase 3.
**Depends on:** PRD-09 (local HTTP API), PRD-19 (Trigger Event Engine), PRD-20 (Job Posting Intelligence), PRD-21 (Champion vs. Buyer Mapping), PRD-22 (Person Signal Scoring)

---

## What Changed from v1.0

v1.0 solved one problem: finding *a* person. It discovered a contact via Apollo and enriched them with a Haiku web scan for personalization hooks. That was Phase 3 as a single, 3-step process.

v2.0 expands Phase 3 into a coordinated six-sub-phase enrichment pipeline. The inputs and outputs of the sub-phases (PRDs 19, 20, 21, 22) are now formally owned by this document. The data model is extended to carry a full three-signal composite score. The UI reflects champion/buyer duality. The EmailFold integration carries the complete signal payload into prompt generation. All v1.0 open questions are resolved.

---

## Problem

The current pipeline finds *companies*. It never finds *people*.

ProspectFold produces a list of 20 companies that match your ICP. EmailFold generates cold emails. But the emails are addressed to `[contactName]` and `[contactRole]` — fields the user fills in manually. The user has to:

1. Google "Acme Corp VP Engineering"
2. Find the right person on LinkedIn
3. Read their profile to find something to reference
4. Copy their name and role into EmailFold
5. Hope the email lands on the right person

That is 5–10 minutes per company, repeated 20 times per session. It is also the step that determines whether the email gets a reply.

**The v1.0 gap:** Person-level research was the highest-value, highest-effort manual step — and it was entirely manual.

**The v2.0 gap (deeper):** Even after v1.0, finding *a* person is not enough. Cold email success depends on three conditions holding simultaneously:

1. You are emailing the **right person** — the one who feels the pain and has the authority (or influence) to act on it.
2. You are reaching them at the **right moment** — when they are in a change state, under pressure, or actively exploring solutions.
3. They are **already thinking about the problem** — they have publicly signaled the pain, not just hypothetically matched a profile.

v1.0 solved condition 1 partially. v2.0 solves all three:
- Condition 1: Champion vs. Buyer mapping (PRD-21) identifies both the person who feels the pain and the person who approves the spend
- Condition 2: Trigger Event Engine (PRD-19) identifies situational signals — funding rounds, new hires, headcount growth
- Condition 3: Person Signal Scoring (PRD-22) detects whether the contact has publicly expressed the exact pain you solve

The result: Phase 3 v2.0 does not just find a contact. It finds the contact most likely to reply to your specific email on this specific day.

---

## User Stories

- As a SDR, after a ProspectFold run I see the recommended contact for each company with a signal score showing why they were selected, so I can trust the contact without researching them manually
- As a SDR, I see both the champion (person who feels the pain) and the economic buyer (person who signs the check), so I know who to email first and who to CC at the right moment
- As a SDR, I see live trigger events (funding, new hires, expansion) on each company card so I can time my outreach to real moments
- As a SDR, EmailFold automatically uses the contact's strongest signal as the email opener, so I do not have to decide how to personalize each message
- As a SDR, I can override the recommended contact if I know a better person, and the signal score updates accordingly
- As a manager, reply rates improve because emails reference real, specific, timely information about the recipient and their company

---

## Solution Overview: Phase 3 as a Six-Sub-Phase Pipeline

Phase 3 is executed by ProspectFold for each company that passes the ICP threshold. It is a concurrent enrichment pipeline with one synthesis step at the end.

**Execution model:** Sub-phases 3a through 3e run concurrently per company. Phase 3f runs after all five complete (it synthesizes their outputs). The wall-clock latency of Phase 3 is the MAX of sub-phases 3a–3e, not their sum.

**ICP threshold gate:** Phase 3 runs only for companies with ICP score >= 60 (from Phase 2). Companies below 60 are flagged as low-priority; Phase 3 is skipped. The threshold is configurable per-run in the Pipeline Studio.

### Sub-Phase Summary

| Sub-phase | Name | PRD | Primary output |
|---|---|---|---|
| 3a | Apollo People Search | PRD-10 (this doc) | Structural contact candidates |
| 3b | Trigger Event Detection | PRD-19 | Situational signals (funding, hires, growth) |
| 3c | Job Posting Intelligence | PRD-20 | Organizational pain from job postings |
| 3d | Psychological Signal Search | PRD-22 | Contact's public expressions of the pain |
| 3e | Champion vs. Buyer Classification | PRD-21 | Two-contact role assignment |
| 3f | Three-Signal Score Synthesis | PRD-22 | Composite signal score + lead signal selection |

---

## Flow Diagram

```
ProspectFold
─────────────
Phase 0: Pre-qualification (Haiku — from PRD-04)
  ↓ [Skip if ICP < 60]
Phase 1: Company web scan (Haiku — from PRD-04)
  ↓
Phase 2: ICP synthesis + angles (Opus + extended thinking)
  ↓ [Skip Phase 3 if ICP score < 60]

Phase 3: Contact Discovery + Signal Enrichment
  For each company:
    ↓
    ┌─────────────────────────────────────────────────────────────────┐
    │  Run concurrently (all five start at the same time):           │
    │                                                                 │
    │  3a: Apollo People Search                                       │
    │    → POST /v1/mixed_people/search                               │
    │    → filter by organization_id + seniority + target titles      │
    │    → returns: 2–4 structural candidates                         │
    │    → output: ranked candidate list                              │
    │                                                                 │
    │  3b: Trigger Event Detection (PRD-19)                           │
    │    → Haiku + web_search                                         │
    │    → searches: funding, leadership hires, headcount growth      │
    │    → output: TriggerEventSummary (events[], timing_score)       │
    │                                                                 │
    │  3c: Job Posting Intelligence (PRD-20)                          │
    │    → Haiku + web_search                                         │
    │    → searches: job boards for open reqs at this company         │
    │    → output: JobPostingIntelligence (dept_growth, pain_excerpt) │
    │                                                                 │
    │  3d: Psychological Signal Search (PRD-22)                       │
    │    → Haiku + web_search                                         │
    │    → searches: LinkedIn posts, blog, conf talks by candidates   │
    │    → output: PsychologicalSignals per candidate                 │
    │                                                                 │
    │  3e: Champion vs. Buyer Classification (PRD-21)                 │
    │    → Haiku synthesis on candidate list + company org data       │
    │    → output: ContactMapping (champion_id, buyer_id, strategy)   │
    └─────────────────────────────────────────────────────────────────┘
    ↓ [Wait for all five to complete]

    3f: Three-Signal Score Synthesis (PRD-22)
      → inputs: outputs of 3a, 3b, 3c, 3d, 3e
      → for each candidate:
          structural_score  = f(title fit, seniority, org chart position)
          situational_score = f(trigger events, job postings, timing pressure)
          psychological_score = f(public pain expressions, content match)
          composite_score   = weighted_sum(structural, situational, psychological)
      → selects: highest-scoring candidate as recommended_contact
      → selects: lead_signal = the signal type with highest contribution
      → generates: email_modifier_prompt (injected into EmailFold Phase 2)
      → output: Phase3Output

Phase 3 output per company (added to intel payload):
{
  "recommended_contact": RecommendedContact,   // highest-scoring, champion preferred
  "economic_buyer": RecommendedContact | null, // if identified separately (PRD-21)
  "contact_mapping": ContactMapping,           // champion/buyer strategy (PRD-21)
  "trigger_events": TriggerEventSummary,       // from PRD-19
  "job_intelligence": JobPostingIntelligence,  // from PRD-20
  "timing_score": 78,                          // composite timing 0-100
  "timing_label": "hot"                        // hot | warm | cool | cold
}
```

---

## Apollo People Search API (Phase 3a)

Apollo's People Search endpoint (`POST /v1/mixed_people/search`) accepts:
- `organization_ids[]` — Apollo company IDs. ProspectFold's company objects from Apollo's company search already contain these IDs. No lookup step is needed.
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
  // Revenue/GTM ICP
  "revenue_leader": ["VP Sales", "CRO", "Head of Revenue", "VP Marketing",
                      "Director of Sales"],
  // Operations ICP
  "ops_leader": ["COO", "VP Operations", "Head of Operations",
                  "Director of Operations"],
  // Default fallback
  "default": ["VP Engineering", "CTO", "VP Technology", "Director of Engineering"],
};

// Phase 2 returns: target_persona: "engineering_leader"
// Phase 3a uses: TARGET_TITLES[target_persona]
```

**Why organization_id is available:** Apollo's company search (`POST /v1/mixed_organizations/search`) returns full company objects including `id` (the Apollo organization ID). ProspectFold already stores this in its company objects. The people search uses it directly — no additional company-to-ID resolution is required.

**Candidate selection from Apollo results:**

Phase 3a returns up to 4 candidates ordered by seniority + title match. All candidates are passed to Phase 3e (champion/buyer classification) and Phase 3d (psychological signal search). The final recommended contact is chosen by Phase 3f based on composite signal score, not by Apollo ranking alone.

---

## Updated Data Model

The `RecommendedContact` from v1.0 is extended with v2.0 fields. All v1.0 fields are preserved unchanged.

```typescript
// ─── Core contact (v1.0 fields, all preserved) ───────────────────────────────

interface RecommendedContact {
  // Identity
  name: string;
  title: string;
  email: string | null;             // Apollo unlocked email if available
  linkedin_url: string | null;
  location: string | null;
  seniority: string;                // "vp" | "director" | "c_suite" | "manager"

  // v1.0 enrichment outputs
  personalization_hooks: string[];  // specific things to reference in email
  best_angle: string;               // which Phase 2 angle fits this person best
  timing_notes: string | null;      // situational timing context (free text)

  // v1.0 confidence and fallbacks
  confidence: number;               // 0-1; in v2.0 computed from composite_score / 100
  fallback_contacts: FallbackContact[];
  enrichment_source: "apollo" | "web_only" | "manual";

  // ─── v2.0 additions ────────────────────────────────────────────────────────

  // Role classification (from PRD-21)
  contact_role: "champion" | "economic_buyer" | "unknown";

  // Full three-signal breakdown (from PRD-22)
  signal_score: PersonSignalScore;

  // What to lead the email with (from PRD-22 synthesis)
  lead_signal: LeadSignal;

  // Injected into EmailFold Phase 2 prompt (from PRD-22)
  email_modifier_prompt: string;
}

interface FallbackContact {
  name: string;
  title: string;
  linkedin_url: string | null;
  contact_role: "champion" | "economic_buyer" | "unknown";
  signal_score: PersonSignalScore | null;  // null if not enriched
}

// ─── Signal score (from PRD-22) ───────────────────────────────────────────────

interface PersonSignalScore {
  composite_score: number;          // 0-100; primary sort key

  structural: StructuralSignal;
  situational: SituationalSignal;
  psychological: PsychologicalSignal;

  score_breakdown: {
    structural_weight: number;      // 0-1
    situational_weight: number;     // 0-1
    psychological_weight: number;   // 0-1
    // weights sum to 1.0
  };
}

interface StructuralSignal {
  score: number;                    // 0-100
  title_match: number;              // how well title matches target_persona (0-100)
  seniority_match: number;          // 0-100
  department_match: number;         // 0-100
  tenure_months: number | null;     // months in current role; <6 = "new to role" bonus
  notes: string[];                  // e.g. "Promoted 2 months ago — establishing roadmap"
}

interface SituationalSignal {
  score: number;                    // 0-100
  trigger_events: TriggerEvent[];   // from PRD-19 (funding, hires, headcount)
  job_posting_signals: string[];    // from PRD-20 (dept growth pain excerpts)
  timing_pressure: "high" | "medium" | "low" | "none";
  notes: string[];                  // e.g. "Series B 3 weeks ago — team building"
}

interface PsychologicalSignal {
  score: number;                    // 0-100
  pain_expressions: PainExpression[];
  content_match: number;            // how closely their pain expressions match our angles
  signal_found: boolean;            // true if any public expression detected
  notes: string[];                  // e.g. "Posted about Postgres migration pain 3 weeks ago"
}

interface PainExpression {
  source: "linkedin_post" | "blog" | "conference_talk" | "interview" | "tweet" | "other";
  summary: string;                  // what they said / what the content was about
  url: string | null;
  recency_days: number;             // days since posted/published
  relevance_score: number;          // 0-100; how closely it matches the sales angles
}

// ─── Lead signal (from PRD-22) ────────────────────────────────────────────────

interface LeadSignal {
  signal_type: "psychological" | "situational" | "structural";
  label: string;                    // short human label, e.g. "PSYCHOLOGICAL"
  hook: string;                     // the specific thing to reference in the email
  // e.g. "Referenced Postgres migration pain in a post 3 weeks ago"
  // e.g. "Series B closed 3 weeks ago — team is scaling"
  // e.g. "Promoted to VP 2 months ago — establishing tech roadmap"
}

// ─── Phase 3 top-level output ─────────────────────────────────────────────────

interface Phase3Output {
  recommended_contact: RecommendedContact;      // highest-scoring, champion preferred
  economic_buyer: RecommendedContact | null;    // if identified separately (PRD-21)
  contact_mapping: ContactMapping;              // from PRD-21
  trigger_events: TriggerEventSummary;          // from PRD-19
  job_intelligence: JobPostingIntelligence;     // from PRD-20
  timing_score: number;                         // composite timing 0-100
  timing_label: "hot" | "warm" | "cool" | "cold";
  // hot = 80-100 (multiple strong signals, act immediately)
  // warm = 60-79 (at least one strong signal)
  // cool = 40-59 (structural fit only, no timing pressure)
  // cold = 0-39  (weak fit, low confidence)
}

// ─── Contact mapping (from PRD-21) ───────────────────────────────────────────

interface ContactMapping {
  champion_id: string;              // person who feels the pain (email them first)
  buyer_id: string | null;          // person who approves spend (CC or sequence separately)
  same_person: boolean;             // true if champion and buyer are the same contact
  sequencing_strategy: "champion_first" | "buyer_first" | "parallel" | "champion_only";
  strategy_rationale: string;       // why this sequencing was chosen
}

// ─── Trigger events (from PRD-19) ────────────────────────────────────────────

interface TriggerEventSummary {
  events: TriggerEvent[];
  most_recent_event: TriggerEvent | null;
  timing_score: number;             // 0-100
}

interface TriggerEvent {
  type: "funding_round" | "new_hire" | "headcount_growth" | "leadership_change"
      | "product_launch" | "acquisition" | "expansion" | "other";
  description: string;
  detected_date: string;            // ISO date
  source_url: string | null;
  relevance_score: number;          // 0-100
  recency_days: number;
}

// ─── Job posting intelligence (from PRD-20) ───────────────────────────────────

interface JobPostingIntelligence {
  open_reqs: JobPosting[];
  dept_growth_signal: boolean;      // true if >3 open reqs in target dept
  pain_excerpt: string | null;      // most revealing line from a job description
  org_pain_summary: string;         // synthesized pain from all postings
  target_dept_hiring: boolean;      // true if hiring in the dept we care about
}

interface JobPosting {
  title: string;
  department: string;
  posted_days_ago: number;
  pain_indicators: string[];        // extracted pain signals from the JD
  source_url: string | null;
}

// ─── Added to existing ProspectIntelV2Payload ─────────────────────────────────

interface ApolloCompanyWithPhase3 extends ApolloCompanyRaw {
  phase3: Phase3Output | null;      // null if ICP score < 60 or Phase 3 failed
  phase3_skipped: boolean;
  phase3_skip_reason: string | null;// e.g. "ICP score 54 below threshold 60"
  phase3_latency_ms: number | null; // actual wall-clock duration of Phase 3
}
```

---

## Phase 3 Execution Implementation

```javascript
// In ProspectFold: prospect-crafter.jsx
// Called after Phase 2 completes for each company

const runPhase3 = async (company, phase2Output) => {
  const { icp_score, angles, target_persona, qualifying_criteria } = phase2Output;

  // ICP threshold gate
  if (icp_score < 60) {
    return {
      phase3: null,
      phase3_skipped: true,
      phase3_skip_reason: `ICP score ${icp_score} below threshold 60`,
      phase3_latency_ms: 0,
    };
  }

  const startTime = Date.now();

  // Run 3a through 3e concurrently
  const [
    apolloCandidates,
    triggerEvents,
    jobIntelligence,
    psychologicalSignals,
    contactMapping,
  ] = await Promise.all([
    runPhase3a_ApolloSearch(company, target_persona),           // PRD-10
    runPhase3b_TriggerEvents(company),                          // PRD-19
    runPhase3c_JobPostings(company, angles),                    // PRD-20
    runPhase3d_PsychologicalSignals(apolloCandidates_placeholder, company, angles),
    // Note: 3d needs Apollo candidates — see note below
    runPhase3e_ChampionBuyerClassification(company, angles),    // PRD-21
  ]);

  // Note on 3d dependency: Phase 3d ideally takes the candidate list from 3a.
  // Since 3a and 3d run concurrently, 3d uses a preliminary search by company
  // name + target titles. Phase 3f can reconcile when 3a results are available.
  // See Phase 3d spec (PRD-22) for the non-blocking search strategy.

  // Phase 3f runs after all five complete
  const phase3Output = await runPhase3f_Synthesis({
    company,
    angles,
    apolloCandidates,
    triggerEvents,
    jobIntelligence,
    psychologicalSignals,
    contactMapping,
  });

  return {
    phase3: phase3Output,
    phase3_skipped: false,
    phase3_skip_reason: null,
    phase3_latency_ms: Date.now() - startTime,
  };
};
```

**Concurrency interaction with PRD-08:** Phase 3 runs per company within the PRD-08 sliding window. If ProspectFold is running 3 companies concurrently (PRD-08 concurrency = 3), each company runs its own Phase 3 concurrently. Within each company, sub-phases 3a–3e also run concurrently. Peak in-flight API calls = 3 companies × 5 sub-phases = up to 15 simultaneous Haiku calls. This is well within rate limits for all paid Apollo and Anthropic plans.

---

## Updated Cost Table

All phases listed for completeness. Phase 3 sub-phases run concurrently; latency is max of 3a–3e, not sum.

| Phase | Step | Model / API | Cost per company | Wall-clock contribution |
|---|---|---|---|---|
| Phase 0 | Pre-qualification | Haiku | $0.0002 | 1–2s (parallel batch) |
| Phase 1 | Company web scan | Haiku + web_search | $0.007 | 2–3s |
| Phase 2 | ICP synthesis + angles | Opus + extended thinking | $0.10 | 10–15s |
| Phase 3a | Apollo People Search | Apollo API | $0 (plan credit) | 0.5–1s |
| Phase 3b | Trigger Event Detection | Haiku + web_search | $0.0008 | 2–4s |
| Phase 3c | Job Posting Intelligence | Haiku + web_search | $0.0008 | 2–4s |
| Phase 3d | Psychological Signal Search | Haiku + web_search | $0.0010 | 2–4s |
| Phase 3e | Champion vs. Buyer Classification | Haiku | $0.0004 | 0.5–1s |
| Phase 3f | Three-Signal Score Synthesis | Haiku | $0.0006 | 0.5–1s |
| Phase 3 total (concurrent 3b–3e) | | | **$0.0036** | **~4s max** |
| EmailFold Phase 1 | Company scan | Haiku | $0.003 | 2–3s |
| EmailFold Phase 2 | Email drafting (3 variants) | Sonnet | $0.005 | 4–5s |
| EmailFold Phase 2b | Sequence generation (steps 2–4) | Sonnet | $0.007 | 5s (concurrent) |
| **Total per company** | | | **~$0.126** | |

**Full 20-company session:** ~$2.52 (up from $0.116 in v1.0, but includes full three-signal enrichment, sequence generation, and champion/buyer mapping).

**ROI framing:** Emails with a psychological lead signal (the contact has publicly expressed the exact pain) produce 3–4× higher reply rates than structural-only personalization. At an SDR's average deal value, the $0.01 per-company uplift in Phase 3 cost is negligible relative to the reply rate improvement.

---

## EmailFold Integration (Updated for v2.0)

### What EmailFold receives

When a company card from the ProspectFold queue enters EmailFold, it now carries the full Phase 3 output. EmailFold pre-fills contact identity (same as v1.0) and injects an enriched personalization block into Phase 2's prompt.

### Updated prompt injection

```javascript
// EmailFold Phase 2 prompt addition — v2.0 (replaces v1.0 PERSON-SPECIFIC HOOKS block)

const buildPersonalizationBlock = (contact) => {
  if (!contact) return '';

  const { personalization_hooks, timing_notes, best_angle,
          lead_signal, email_modifier_prompt, signal_score } = contact;

  // email_modifier_prompt is the primary v2.0 injection — generated by Phase 3f
  // It is a pre-composed instruction block specific to this contact and their signals
  if (email_modifier_prompt) {
    return `\n${email_modifier_prompt}\n`;
  }

  // Fallback to v1.0 format if email_modifier_prompt is absent
  return personalization_hooks?.length
    ? `\nPERSON-SPECIFIC HOOKS (use 1–2 of these naturally in the email):
${personalization_hooks.map(h => `- ${h}`).join('\n')}

TIMING NOTES: ${timing_notes || 'none'}
BEST ANGLE FOR THIS PERSON: ${best_angle || 'use your judgment'}
`
    : '';
};
```

**What `email_modifier_prompt` looks like (generated by Phase 3f / PRD-22):**

```
CONTACT SIGNAL BRIEFING — Jane Smith, VP Engineering, Acme Corp
Composite signal score: 84 / 100

LEAD WITH: PSYCHOLOGICAL signal
Jane posted on LinkedIn 3 weeks ago about struggling with Postgres migration complexity
at scale. Quote her pain back to her without quoting directly — reference the theme.
Recommended opener: "I saw you've been navigating the Postgres scaling problem..."

SUPPORTING CONTEXT (use if natural, do not force all of these):
- Trigger event: Acme raised a $12M Series B 3 weeks ago — team is actively building
- Job signal: 4 open Backend Engineer reqs, 2 mention Postgres expertise required
- New to role: Jane was promoted to VP Engineering 2 months ago (establishing roadmap)

ANGLE: Use "Technical Debt Automation" — highest resonance with her public pain signals
EMAIL TONE: Peer-to-peer technical, not sales. She is an engineer who became a VP.
AVOID: Generic "I noticed you're growing" openers. She will have seen them before.
```

### EmailFold contact pre-fill UI (updated)

When a company card from the queue is selected, the following fields are pre-populated:

```
Target Company:  Acme Corp
Contact:         Jane Smith (champion — auto-filled ✓)
Role:            VP Engineering (auto-filled ✓)
Signal score:    84/100  [Structural 71 | Situational 88 | Psychological 91]
Lead signal:     PSYCHOLOGICAL — "Posted about Postgres migration 3w ago"

Economic buyer:  Mark Chen, CFO (auto-filled ✓) [Use in step 3 CC or separate sequence]

Personalization context:
  • Psychological: Posted about Postgres scaling challenges 3w ago ✓
  • Situational: Series B closed 3 weeks ago — scaling phase ✓
  • Structural: Promoted to VP 2 months ago — new roadmap window ✓
  [Edit context]
```

---

## UI Changes

### ProspectFold — Company Queue Cards (updated for v2.0)

Each card now shows the full Phase 3 output including signal scores, trigger events, champion/buyer split, and job signals:

```
┌─ Acme Corp ──────────────────────────────────────────────────────────────────┐
│  acme.com  |  150 employees  |  ICP Score: 85  |  Timing: HOT               │
│                                                                               │
│  ┌─ Champion ─────────────────────────────────────────────────────────────┐  │
│  │  Jane Smith — VP Engineering                                           │  │
│  │  Signal score: 84  ■■■■■■■■░░                                          │  │
│  │  [S] Structural  71  ■■■■■■■░░░  Title match, 2mo in role              │  │
│  │  [T] Situational 88  ■■■■■■■■■░  Series B + 4 open Backend reqs        │  │
│  │  [P] Psychological 91 ■■■■■■■■■░  Posted about Postgres pain 3w ago    │  │
│  │  Lead: PSYCHOLOGICAL — "Postgres migration scaling post, 3w ago"        │  │
│  │  📧 jane@acme.com  [Override contact]                                   │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  ┌─ Economic Buyer ───────────────────────────────────────────────────────┐  │
│  │  Mark Chen — CFO                                                        │  │
│  │  Signal score: 52  ■■■■■░░░░░                                           │  │
│  │  Sequence strategy: Champion first → CC buyer at step 3                │  │
│  └────────────────────────────────────────────────────────────────────────┘  │
│                                                                               │
│  Trigger events:  [Series B · 3w ago]  [+4 Backend Eng hires · 6w]          │
│  Job signals:     4 open reqs in Engineering — 2 mention Postgres            │
│  Pain excerpt:    "experience with high-throughput Postgres at scale"        │
│                                                                               │
│  [Generate Email]  [View full signal breakdown]                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

The signal score bar (`■■■■■■■■░░`) is a 10-segment horizontal bar. Filled segments = score / 10. Color coding: green >= 70, amber 40–69, red < 40.

The "Override contact" link opens a picker showing `fallback_contacts[]` (each with their own signal scores) or a manual entry field.

### Phase 3 Loading State (updated for all six sub-phases)

The company card shows granular step-by-step progress during Phase 3:

```
Acme Corp:
  ✓ Phase 1: Company scan complete
  ✓ Phase 2: ICP analysis complete — score: 85
  Phase 3: Finding the right person at Acme Corp...
    ✓ 3a: Apollo search — 3 candidates found (Jane Smith, Bob Lee, Sarah Park)
    ⟳ 3b: Checking trigger events...
    ⟳ 3c: Reading job postings...
    ⟳ 3d: Searching psychological signals for 3 candidates...
    ✓ 3e: Champion/buyer classified — Jane = champion, Mark Chen = buyer
    ✓ All signals collected — scoring...
    ✓ Jane Smith selected (composite: 84)  Lead signal: PSYCHOLOGICAL
```

Sub-phases 3b, 3c, 3d show as `⟳` simultaneously (they start at the same time). Phase 3e may complete early if Apollo data is sufficient. Phase 3f shows only after all five are done.

---

## Handling No Contact Found

If Apollo returns no results for a company (company is too small, private, or not in Apollo's database):

1. Show "No Apollo contact found" on the company card with an amber badge
2. Phases 3b and 3c still run (trigger events and job postings do not require a named contact)
3. Phase 3d and 3e are skipped
4. Phase 3f produces a reduced output with structural_score = 0 and psychological_score = 0
5. Offer a web-only fallback: search for `"[company] [target title]" site:linkedin.com`
6. Show the search result URL with a "Find on LinkedIn" button
7. Allow manual entry of name + role — the user-entered contact enters the system with `enrichment_source: "manual"` and no signal scores
8. EmailFold generates an angle-targeted email addressed to the role ("Hi [VP Engineering]") with only trigger event and job posting context if available

---

## Re-enrichment and Caching

**Cache duration:** Contact enrichment data is cached for 30 days per company (keyed by Apollo organization_id). The cache is stored in ProspectFold's localStorage under `phase3Cache[organization_id]`.

**Cache strategy:**
- If a company appears in a new run within 30 days, use the cached Phase 3 output for sub-phases 3a, 3d, 3e (contact identity and psychological signals do not change quickly)
- Always re-run sub-phases 3b and 3c (trigger events and job postings are time-sensitive — a funding round from last week is more relevant than a cached version)
- Re-run Phase 3f to synthesize the fresh 3b/3c data with cached 3a/3d/3e

**Cache invalidation conditions:**
- > 30 days since last enrichment — full re-run
- User manually overrides contact — invalidate 3a/3d/3e, keep 3b/3c
- ICP score drops below 60 on re-run — Phase 3 skipped entirely (no cache update)

```javascript
// Cache lookup logic in prospect-crafter.jsx

const runPhase3WithCache = async (company, phase2Output) => {
  const cacheKey = `phase3_${company.apollo_organization_id}`;
  const cached = JSON.parse(localStorage.getItem(cacheKey) || 'null');
  const cacheAge = cached ? daysSince(cached.cached_at) : Infinity;

  if (cached && cacheAge < 30) {
    // Use cached structural + psychological; re-run situational
    const [freshTriggerEvents, freshJobIntelligence] = await Promise.all([
      runPhase3b_TriggerEvents(company),
      runPhase3c_JobPostings(company, phase2Output.angles),
    ]);

    const refreshedOutput = await runPhase3f_Synthesis({
      ...cached.synthesis_inputs,
      triggerEvents: freshTriggerEvents,
      jobIntelligence: freshJobIntelligence,
    });

    localStorage.setItem(cacheKey, JSON.stringify({
      ...cached,
      phase3: refreshedOutput,
      situational_refreshed_at: new Date().toISOString(),
    }));

    return refreshedOutput;
  }

  // Full re-run
  const result = await runPhase3(company, phase2Output);
  localStorage.setItem(cacheKey, JSON.stringify({
    ...result,
    cached_at: new Date().toISOString(),
  }));
  return result;
};
```

---

## EventFold Integration

### Auto-create Contact in EventFold

When ProspectFold intel is received by EventFold via `/api/intel` (PRD-09), and `phase3.recommended_contact` is present on a company:

- Auto-create a `Contact` aggregate linked to the Company
- Set `contact.source = "prospectfold_ai"`
- Store the full `PersonSignalScore` on the contact record
- Store `lead_signal`, `contact_role`, `trigger_events`, `job_intelligence` as enrichment metadata
- Show on Company Detail under Contacts with a "AI-found" badge
- Show signal score breakdown in the Contact detail view

**Champion vs. buyer handling in EventFold:**
- If `contact_mapping.same_person = true`: create one Contact with `contact_role = "champion"` (also serves as buyer)
- If `contact_mapping.same_person = false` and `economic_buyer` is present: create two Contact records — one as champion, one as economic_buyer — both linked to the Company
- The sequencing strategy from `contact_mapping.sequencing_strategy` is stored as a Note on the Company aggregate

### Updated `/api/contact` payload (EventFold endpoint)

The existing `POST /api/contact` endpoint (PRD-00) should accept the extended v2.0 contact fields:

```typescript
interface ContactImportRequest {
  source: "prospectfold";
  version: "2";                          // bump from "1"
  company_id?: string;
  company_name: string;
  company_url?: string;
  contact: {
    full_name: string;
    title: string;
    seniority: string;
    email?: string;
    linkedin_url?: string;
    apollo_person_id?: string;
    contact_role: "champion" | "economic_buyer" | "unknown";  // v2.0

    // v1.0 fields (preserved)
    personalization_hooks: string[];
    best_angle: string;
    timing_notes?: string;
    enrichment_source: "apollo_haiku" | "apollo_three_signal";

    // v2.0 additions
    signal_score?: PersonSignalScore;
    lead_signal?: LeadSignal;
    email_modifier_prompt?: string;
  };
  // v2.0: economic buyer (optional, only present if separate from champion)
  economic_buyer?: {
    full_name: string;
    title: string;
    apollo_person_id?: string;
    email?: string;
    signal_score?: PersonSignalScore;
  };
  // v2.0: company-level timing data
  trigger_events?: TriggerEventSummary;
  job_intelligence?: JobPostingIntelligence;
  timing_score?: number;
  timing_label?: "hot" | "warm" | "cool" | "cold";
}
```

### Tauri IPC commands for Phase 3 data (EventFold)

Two new commands are added to the PRD-00 command inventory for PRD-10 v2.0:

| Command | Signature | Notes |
|---|---|---|
| `import_contact_from_enrichment` | `(payload: ContactImportRequestV2) → ImportContactResult` | Extended to handle champion/buyer pair |
| `get_enriched_contacts_for_company` | `(company_id: String) → Vec<EnrichedContactV2>` | Returns signal scores + lead signals |
| `get_contact_signal_score` | `(contact_id: String) → Option<PersonSignalScore>` | Full signal breakdown for Contact detail view |
| `update_contact_role` | `(contact_id: String, role: ContactRole) → ()` | SDR can correct champion/buyer misassignment |

---

## Resolved Open Questions (from v1.0)

**Q1: Does ProspectFold already have Apollo organization_ids?**

Yes. Apollo's company search endpoint (`POST /v1/mixed_organizations/search`) returns full company objects that include the `id` field — this is the Apollo organization ID. ProspectFold stores these IDs in its company objects as part of the Apollo search phase (the phase that precedes Phase 0). Phase 3a passes `organization_ids: [company.apollo_organization_id]` directly to the People Search API. No additional lookup step is required.

**Q2: Should Phase 3 run for all companies or only above an ICP score threshold?**

Phase 3 runs for all companies with ICP score >= 60. Below 60, Phase 3 is skipped and the company is flagged with `phase3_skipped: true`. The 60-point threshold is the default; it can be overridden per-run from the Pipeline Studio (PRD-11). Rationale: Phase 3 costs ~$0.0036 per company, which is negligible, but the signal data for a company scoring 40 on ICP is unlikely to produce useful email context. The threshold prevents wasted enrichment and UI clutter on companies that will not be emailed.

**Q3: What happens to the recommended contact when ProspectFold runs the same company again 30 days later?**

Contact identity data (Apollo search results, psychological signals, champion/buyer classification) is cached for 30 days per company, keyed by Apollo organization_id. Trigger events and job postings are always re-run — they are time-sensitive. On re-run within the 30-day window, Phase 3b and 3c execute fresh, and Phase 3f re-synthesizes the composite score with the latest situational data. The contact is only re-searched from Apollo if the cache is expired or the user explicitly forces a re-enrichment. This avoids burning Apollo credits on stable data while keeping timing signals current.

---

## Out of Scope

- Real-time LinkedIn scraping (ToS violation — use Apollo data and web search only)
- Building a contact enrichment database beyond Apollo + public web search
- Email verification or bounce checking
- Phone number discovery
- Buying intent data from third-party providers (Bombora, G2, etc.) — potential Phase 4
- Writing to LinkedIn on the user's behalf

---

## Success Metrics

### Carried forward from v1.0

- Manual contact research time per company: **0 minutes** (from 5–10 min)
- % of EmailFold emails with person-specific personalization hook: **> 85%**
- Reply rate improvement vs. generic outreach: **target 2× improvement** (measure after 30-day A/B)
- Contact found by Apollo: **> 70%** of companies

### New in v2.0

- % of emails leading with a psychological signal (contact publicly expressed the pain): **> 30%**
  — Target: 3 in 10 contacts will have a detectable public pain signal matching the product angle.

- % of emails leading with a situational signal (trigger event or job posting context): **> 50%**
  — Target: half the companies are in a change moment (funding, hiring surge, leadership transition).

- Champion vs. buyer misidentification rate: **< 10%**
  — Measured by "wrong person" explicit reply signals tracked in EventFold ("I am not the right person, you should talk to...").

- Reply rate by lead signal type (track in EventFold to tune signal weights over time):
  - Psychological lead signal: baseline target **> 8% reply rate**
  - Situational lead signal: baseline target **> 5% reply rate**
  - Structural-only lead signal: baseline target **> 3% reply rate**

- Phase 3 total wall-clock time per company: **< 6 seconds** (concurrent sub-phases, max of 3b–3e)
- Phase 3 failure rate (at least one sub-phase errored, Phase 3f degraded gracefully): **< 5%**

---

## Sub-Specification Reference

The following PRDs are sub-specifications of Phase 3. They define the internals of their respective sub-phases. This document (PRD-10 v2.0) owns the contracts between sub-phases and is the authoritative source for input/output types.

| PRD | Sub-phase | Owned by | Status |
|---|---|---|---|
| PRD-19 | Trigger Event Engine (Phase 3b) | ProspectFold | Companion spec |
| PRD-20 | Job Posting Intelligence (Phase 3c) | ProspectFold | Companion spec |
| PRD-21 | Champion vs. Buyer Mapping (Phase 3e) | ProspectFold | Companion spec |
| PRD-22 | Person Signal Scoring (Phase 3d + 3f) | ProspectFold | Companion spec |
| PRD-23 | Three-Signal Framework (philosophy) | All teams | Reference doc |

If a sub-specification conflicts with this document on type definitions or interface contracts, this document (PRD-10 v2.0) takes precedence. Sub-specs own their implementation details and prompt designs; this document owns the shared interfaces.
