# PRD-22 — Person Signal Scoring: The Composite Fit Model
**Version:** 1.0
**Date:** 2026-03-11
**Author:** Foxworks / Claude Architecture Session
**For:** ProspectFold owner + EmailFold owner
**Priority:** P1 — The intelligent targeting layer
**Depends on:** PRD-10 (contact discovery), PRD-19 (trigger events), PRD-20 (job postings intel)

---

## Problem

The current pipeline picks one person per company by matching their Apollo title against the ICP target persona and choosing the highest seniority result. That is title matching — a blunt instrument.

The failure modes are predictable:

- The VP of Engineering you email joined the company 8 weeks ago. They have no budget authority yet and are still learning the codebase.
- The VP you email has been in the seat for 4 years, loves their current stack, and has zero urgency to evaluate anything new.
- A different VP at the same company posted on LinkedIn three weeks ago about the exact pain your product solves — but she was ranked second by seniority so you emailed the wrong person.
- The company just closed a Series B. The CTO is actively building out their infrastructure. Your email arrived at the best possible moment — but you had no way to know that.

Title matching says: "this person has the right job." Composite signal scoring says: "this person is in the right situation, at the right moment, and has publicly signaled that they care about this problem."

**The result of title-only matching:** 20 emails sent, 20 generic openers. 2–5% reply rate.

**The goal of this PRD:** Score every candidate contact across three independent signal dimensions. Route the email's opening hook to the dimension with the strongest evidence. Target the person most likely to reply, not the person with the most impressive title.

---

## Proposed Solution: Three-Signal Composite Scoring

For every contact candidate returned by Apollo (PRD-10), compute three sub-scores and combine them into a single composite score. Use that score to:

1. Rank candidates when multiple people match the ICP title filter
2. Determine which lead signal drives the email opener in EmailFold Phase 2
3. Give the SDR a one-sentence rationale they can read and trust

---

## User Stories

- As a SDR, I see why ProspectFold recommended Jane over Bob, not just that it did
- As a SDR, when I open an email draft in EmailFold it opens with a hook that matches why this person was chosen, not a generic pain-point opener
- As a SDR, I can see the signal breakdown (structural, situational, psychological) for any contact so I can override the AI's recommendation with confidence
- As a manager, I can identify which signal type correlates with the highest reply rates over time

---

## The Three Signals

### Signal 1 — Structural Fit (0–100)

Structural fit measures whether the person's formal role suggests they own the problem. This is the foundation, but not the deciding factor.

| Component | Max Points | Description |
|---|---|---|
| Title match to ICP persona | 40 | How closely the title aligns to the target persona |
| Seniority alignment | 30 | Not too junior to own budget; not too senior to care |
| Department match | 20 | Engineering vs. Product vs. Operations etc. |
| Tenure at company | 10 | Proxy for change-readiness (see table below) |

**Title scoring table:**

| Title (example: `engineering_leader` ICP) | Points |
|---|---|
| Exact match — "VP Engineering" | 40 |
| Strong match — "Director of Engineering" | 30 |
| Adjacent match — "CTO" at mid-size company (< 500 employees) | 25 |
| Adjacent match — "Head of Engineering" | 25 |
| Weak match — "Engineering Manager" at large company (> 500 employees) | 10 |
| Weak match — "Senior Staff Engineer" | 5 |
| Mismatch — unrelated function | 0 |

**Seniority scoring:**

| Seniority (Apollo field) | Points |
|---|---|
| `c_suite` | 25 |
| `vp` | 30 |
| `director` | 25 |
| `head` | 20 |
| `manager` | 10 |
| `senior` or `individual_contributor` | 5 |

**Tenure scoring (at current company):**

| Tenure | Points | Rationale |
|---|---|---|
| < 6 months | 8 | New — may lack authority, but high change-readiness |
| 6–18 months | 10 | Prime window: established enough, still open |
| 18 months – 3 years | 7 | Solid fit; moderate urgency |
| 3–5 years | 4 | Comfortable; lower urgency |
| > 5 years | 2 | Entrenched; hardest to move |
| Unknown | 5 | Neutral default |

---

### Signal 2 — Situational Fit (0–100)

Situational fit measures whether something is happening RIGHT NOW that creates urgency or decision-readiness. This is the most reliable predictor of near-term response.

| Factor | Points | Notes |
|---|---|---|
| New in role (< 90 days) | +40 | Highest-value window. New leaders establish priorities, review tools, build credibility |
| New in role (90–180 days) | +20 | Still evaluating, slower velocity |
| New in role (180–365 days) | +10 | Some evaluation still possible |
| Company raised funding (< 90 days) | +20 | New capital = new vendor evaluations |
| Team headcount growth > 20% (from PRD-20) | +15 | Scaling pain is imminent or active |
| Relevant trigger event detected (from PRD-19) | +10 to +20 | Passes through `trigger_events_contribution` directly |
| Stable in role > 2 years, no triggers | -10 | Comfort zone penalty — lower urgency to change |

Situational score = sum of applicable factors, capped at 100. The -10 penalty applies only when NO positive situational factors are present — it does not stack with other penalties.

**Computing `new_role_days`:** Cross-reference Apollo's `employment_history` start date for the current position against today's date. If Apollo doesn't expose this, attempt to derive it from the Phase 3e psychological search (Haiku may find a "Jane Smith joined Acme as VP Engineering" LinkedIn update).

---

### Signal 3 — Psychological Fit (0–100)

Psychological fit measures whether this specific person has publicly signaled that they care about the exact problem the ICP addresses. This is the most valuable signal and the rarest — when present, it almost always yields the best email opener.

| Signal Type | Points | Notes |
|---|---|---|
| LinkedIn post about the exact pain (< 90 days) | +40 | Highest signal. Use it as the email hook directly |
| Company blog post authored by them about the problem | +30 | Nearly as strong; shows sustained interest |
| Conference talk or podcast about the relevant topic | +25 | Persistent public record; highly quotable |
| LinkedIn post about a related topic (< 90 days) | +20 | Adjacent but relevant |
| GitHub repos relevant to the problem space | +15 | Strong for technical ICPs |
| Comment or reaction on a relevant post (< 90 days) | +10 | Softer signal but still directional |
| Older post (90–180 days) about the exact pain | +10 | Fading but still relevant |
| No public signals found | 0 | Not negative — just unknown |

Psychological score = sum of applicable signals, capped at 100. Multiple signals compound: a person who posted AND gave a conference talk might score 65 before the cap.

---

## Composite Score Formula

```javascript
const compositeScore = (
  0.25 * structural.score +
  0.40 * situational.score +
  0.35 * psychological.score
);
```

**Weighting rationale:**

- Situational (40%) outweighs the others because timing is the number-one predictor of response. A mediocre title match in a high-urgency moment beats a perfect title match with no signals.
- Psychological (35%) outweighs Structural because a person who has publicly stated they have the exact pain you solve is a higher-quality lead than someone who merely holds the right title.
- Structural (25%) remains because it is a necessary baseline — a VP of Marketing is not the right person regardless of their situational or psychological signals for an engineering ICP.

**Confidence tiers:**

| Composite Score | Tier | SDR Guidance |
|---|---|---|
| 75–100 | `high` | Strong multi-signal confidence. Prioritize this contact |
| 55–74 | `medium` | Solid single-signal or moderate multi-signal. Good candidate |
| 35–54 | `low` | Structural fit only, no situational or psychological evidence |
| 0–34 | `cold` | Weak match on all dimensions — consider alternatives |

---

## Lead Signal Routing

The dimension with the highest raw sub-score (before weighting) determines the `lead_signal` — which signal should drive the email opener.

| Highest Sub-Score | `lead_signal` | Lead Approach | Example Opener |
|---|---|---|---|
| Psychological > 60 (post type) | `psychological_post` | "You said it yourself" | "I saw your post about Postgres migration pain last month — we solve exactly that." |
| Psychological > 60 (talk type) | `psychological_talk` | "I heard your talk" | "Caught your PgConf talk on pipeline reliability — you described the exact problem we built for." |
| Situational, new hire | `situational_new_hire` | "New leader opportunity" | "Congrats on joining Acme as VP Engineering — new roles are often when teams revisit their tooling." |
| Situational, funding | `situational_funding` | "Seize the moment" | "Congrats on the Series A — great timing to get your data infrastructure right before you scale." |
| Situational, growth | `situational_growth` | "Scaling pain" | "Saw you're adding 4 data engineers — that's usually when pipeline complexity becomes a real problem." |
| Only structural (all others weak) | `structural_only` | Pain-point angle | Use the Phase 2 `best_angle` from ProspectFold directly — still targeted by company, just not person-specific |

**Tiebreak rule:** If Psychological and Situational are equal (within 5 points), prefer Psychological — it produces the highest-converting openers and is harder to source.

---

## Data Model

```typescript
interface PersonSignalScore {
  contact_id: string;           // links to RecommendedContact from PRD-10

  // --- Sub-scores ---

  structural: {
    score: number;              // 0-100
    title_match_score: number;  // 0-40
    seniority_score: number;    // 0-30
    department_score: number;   // 0-20
    tenure_score: number;       // 0-10
    tenure_months: number | null;
  };

  situational: {
    score: number;              // 0-100
    new_role_days: number | null;
    funding_days_ago: number | null;
    headcount_growth_pct: number | null;
    trigger_events_contribution: number; // pts carried in from PRD-19
    factors: string[];          // human-readable list of what contributed
    // e.g. ["New in role 47 days (+40)", "Series B 61 days ago (+20)"]
  };

  psychological: {
    score: number;              // 0-100
    signals_found: PsychologicalSignal[];
    search_performed: boolean;
    factors: string[];          // human-readable
    // e.g. ["LinkedIn post about Postgres pain Jan 2026 (+40)"]
  };

  // --- Composite ---

  composite_score: number;      // 0-100, formula above
  confidence_tier: "high" | "medium" | "low" | "cold";
  lead_signal: LeadSignal;      // which dimension drives the email opener
  lead_rationale: string;       // 1-sentence explanation for the SDR
  // e.g. "Jane posted about Postgres scaling pain 3 weeks ago — lead with that."

  // --- Action guidance ---

  recommended_angle: string;    // echoes or overrides Phase 2 angle based on signals
  email_modifier_prompt: string; // injected verbatim into EmailFold Phase 2 system prompt
}

interface PsychologicalSignal {
  type: "linkedin_post" | "conference_talk" | "blog_post" | "github" | "comment";
  description: string;          // e.g. "Posted about Postgres migration pain (Jan 2026)"
  source_url: string | null;
  relevance_score: number;      // 0-100 — how directly relevant to ICP pain
  age_days: number;             // days since published/posted
}

type LeadSignal =
  | "psychological_post"
  | "psychological_talk"
  | "situational_new_hire"
  | "situational_funding"
  | "situational_growth"
  | "structural_only";
```

**Relationship to `RecommendedContact` (PRD-10):** `PersonSignalScore` is a sibling object attached to each entry in `recommended_contact` and `fallback_contacts[]`. The `contact_id` field links them. The `RecommendedContact` interface from PRD-10 gains a `signal_score: PersonSignalScore | null` field — null if scoring hasn't run yet for that contact.

---

## Phase Architecture

This PRD introduces two sub-phases to ProspectFold's existing Phase 3 pipeline:

```
ProspectFold — Phase 3 (contact enrichment)
─────────────────────────────────────────────────────────────────
Phase 3a: Apollo People Search        [existing — PRD-10]
  → returns: name, title, seniority, email, linkedin_url
  → picks up to 5 candidates per company

Phase 3b: Trigger Event Detection     [existing — PRD-19]
  → funding events, leadership changes, headcount signals
  → produces: timing_score, trigger_events[]

Phase 3c: Job Postings Analysis       [existing — PRD-20]
  → reads active job postings
  → produces: organizational_pain, tech_stack_signals, headcount_growth_pct

Phase 3d: Signal Score Synthesis      [NEW — this PRD]
  → pure computation, no AI call
  → combines structural (from 3a) + situational (from 3a/3b/3c) + psychological (from 3e)
  → produces: PersonSignalScore for each candidate
  → ranks candidates by composite_score
  → selects recommended_contact (highest score)

Phase 3e: Psychological Signal Search [NEW — this PRD]
  → 1 Haiku call per candidate (capped at top 3 candidates from 3a)
  → uses web_search to find LinkedIn posts, GitHub, conference talks, blogs
  → produces: PsychologicalSignal[] per candidate
  → feeds into Phase 3d

Execution order: 3a → (3b, 3c, 3e in parallel) → 3d
```

Phase 3d runs last because it synthesizes all upstream outputs. Phase 3e runs in parallel with 3b and 3c because it has no dependency on trigger events or job postings — it only needs the contact candidates from 3a.

---

## Phase 3e — Psychological Search Prompt

One Haiku call per contact candidate. Cap at the top 3 candidates by seniority/title match from Phase 3a to control cost.

```javascript
const runPsychologicalSearch = async (contact, company, icpPainDescription) => {
  const result = await anthropic.messages.create({
    model: "claude-haiku-3-5",
    max_tokens: 800,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    system: `You are a B2B sales intelligence researcher. Your job is to find public signals
that indicate whether a specific person cares about a specific business problem.
You are NOT looking for general information about the person. You are ONLY looking
for evidence that they have publicly engaged with the following problem:

${icpPainDescription}

Be precise and concise. Only report signals that are directly relevant to that problem.
If you find nothing relevant, return an empty signals array — do not fabricate signals.`,
    messages: [{
      role: "user",
      content: `Search for public signals from ${contact.name}, ${contact.title} at ${company.name}.

Find any evidence they have publicly engaged with this specific problem:
"${icpPainDescription}"

Look for:
1. LinkedIn posts or articles (search: "${contact.name}" "${company.name}" site:linkedin.com)
2. Conference talks or podcast appearances (search: "${contact.name}" "${company.name}" talk OR podcast OR keynote)
3. Company blog posts authored by them (search: "${contact.name}" site:${company.domain} blog OR engineering)
4. GitHub repos or open source projects related to the problem space
5. Comments or interactions on relevant posts

For each signal found, assess how directly it relates to the specific problem above.

Return a JSON object with this exact structure:
{
  "signals": [
    {
      "type": "linkedin_post" | "conference_talk" | "blog_post" | "github" | "comment",
      "description": "brief description of what you found",
      "source_url": "url or null",
      "relevance_score": 0-100,
      "age_days": approximate days since published (use 999 if unknown)
    }
  ],
  "search_performed": true,
  "summary": "one sentence about what you found or did not find"
}`
    }]
  });

  return JSON.parse(extractJSON(result.content));
};
```

**Relevance score guidance for Haiku:** The `relevance_score` within each signal should reflect direct alignment with the ICP pain description. A post titled "We're migrating from Postgres to Cassandra" scores 95 for a database reliability ICP. A post about "scaling our engineering team" scores 20 for the same ICP — adjacent but not directly relevant.

---

## Phase 3d — Scoring Computation

Pure JavaScript — no AI call. Runs after 3a, 3b, 3c, and 3e have returned their outputs.

```javascript
const computeStructuralScore = (contact, icpPersona) => {
  const TITLE_SCORES = {
    engineering_leader: {
      "VP Engineering": 40, "VP of Engineering": 40,
      "Director of Engineering": 30,
      "CTO": 25, "Head of Engineering": 25,
      "Engineering Manager": 10,
      "Senior Staff Engineer": 5,
    },
    data_leader: {
      "VP Data": 40, "VP of Data": 40, "Chief Data Officer": 40,
      "Director of Data Engineering": 30, "Head of Data": 30,
      "Head of Analytics": 25, "Director of Analytics": 25,
      "Data Engineering Manager": 10,
    },
    product_leader: {
      "VP Product": 40, "VP of Product": 40, "CPO": 40,
      "Director of Product": 30, "Head of Product": 30,
      "Product Manager": 10,
    },
  };

  const SENIORITY_SCORES = {
    c_suite: 25, vp: 30, director: 25, head: 20, manager: 10,
    senior: 5, individual_contributor: 5,
  };

  const TENURE_SCORES = (months) => {
    if (months === null) return 5;
    if (months < 6)   return 8;
    if (months < 18)  return 10;
    if (months < 36)  return 7;
    if (months < 60)  return 4;
    return 2;
  };

  const titleTable = TITLE_SCORES[icpPersona] || {};
  const titleScore = titleTable[contact.title] ?? 0;

  const seniorityScore = SENIORITY_SCORES[contact.seniority] ?? 5;

  // Department score: 20 if dept matches ICP target function, 10 if adjacent, 0 if unrelated
  const deptScore = matchDepartment(contact.department, icpPersona);

  const tenureMonths = contact.tenure_months ?? null;
  const tenureScore = TENURE_SCORES(tenureMonths);

  return {
    score: Math.min(100, titleScore + seniorityScore + deptScore + tenureScore),
    title_match_score: titleScore,
    seniority_score: seniorityScore,
    department_score: deptScore,
    tenure_score: tenureScore,
    tenure_months: tenureMonths,
  };
};

const computeSituationalScore = (contact, companyIntel, triggerEventsContribution) => {
  let score = 0;
  const factors = [];

  const newRoleDays = contact.days_in_current_role ?? null;
  if (newRoleDays !== null) {
    if (newRoleDays < 90) {
      score += 40;
      factors.push(`New in role ${newRoleDays} days (+40)`);
    } else if (newRoleDays < 180) {
      score += 20;
      factors.push(`New in role ${newRoleDays} days (+20)`);
    } else if (newRoleDays < 365) {
      score += 10;
      factors.push(`New in role ${newRoleDays} days (+10)`);
    }
  }

  const fundingDaysAgo = companyIntel.funding_days_ago ?? null;
  if (fundingDaysAgo !== null && fundingDaysAgo < 90) {
    score += 20;
    factors.push(`Funding ${fundingDaysAgo} days ago (+20)`);
  }

  const growthPct = companyIntel.headcount_growth_pct ?? null;
  if (growthPct !== null && growthPct > 20) {
    score += 15;
    factors.push(`Team growing ${Math.round(growthPct)}% (+15)`);
  }

  if (triggerEventsContribution > 0) {
    score += triggerEventsContribution;
    factors.push(`Trigger events (+${triggerEventsContribution})`);
  }

  // Stability penalty — only applies when no positive signals exist
  if (score === 0 && newRoleDays !== null && newRoleDays > 730) {
    score -= 10;
    factors.push(`Stable > 2 years, no triggers (-10)`);
  }

  return {
    score: Math.max(0, Math.min(100, score)),
    new_role_days: newRoleDays,
    funding_days_ago: fundingDaysAgo,
    headcount_growth_pct: growthPct,
    trigger_events_contribution: triggerEventsContribution,
    factors,
  };
};

const PSYCHOLOGICAL_SIGNAL_POINTS = {
  linkedin_post:    { fresh: 40, aging: 10 },  // fresh = < 90 days
  blog_post:        { fresh: 30, aging: 15 },
  conference_talk:  { fresh: 25, aging: 15 },
  comment:          { fresh: 10, aging: 5  },
  github:           { fresh: 15, aging: 10 },
};

const computePsychologicalScore = (psychSearchResult) => {
  if (!psychSearchResult || !psychSearchResult.search_performed) {
    return { score: 0, signals_found: [], search_performed: false, factors: [] };
  }

  let score = 0;
  const factors = [];

  for (const signal of (psychSearchResult.signals || [])) {
    if (signal.relevance_score < 50) continue; // filter noise

    const pts = PSYCHOLOGICAL_SIGNAL_POINTS[signal.type];
    if (!pts) continue;

    const isFresh = signal.age_days < 90;
    const rawPoints = isFresh ? pts.fresh : pts.aging;
    // Scale by relevance: 100-relevance = full points, 50-relevance = half points
    const scaled = Math.round(rawPoints * (signal.relevance_score / 100));

    score += scaled;
    factors.push(`${signal.type}: ${signal.description} (+${scaled})`);
  }

  return {
    score: Math.min(100, score),
    signals_found: psychSearchResult.signals || [],
    search_performed: true,
    factors,
  };
};

const computeCompositeScore = (structural, situational, psychological) => {
  return Math.round(
    0.25 * structural.score +
    0.40 * situational.score +
    0.35 * psychological.score
  );
};

const computeConfidenceTier = (composite) => {
  if (composite >= 75) return "high";
  if (composite >= 55) return "medium";
  if (composite >= 35) return "low";
  return "cold";
};

const determineLeadSignal = (structural, situational, psychological, psychSignals) => {
  // Psychological wins if its score is highest and > 60
  if (psychological.score >= 60 && psychological.score >= situational.score) {
    const topSignal = (psychSignals || []).find(s => s.relevance_score >= 60);
    if (topSignal?.type === "conference_talk") return "psychological_talk";
    return "psychological_post";
  }

  // Situational: determine the dominant factor
  if (situational.score > structural.score) {
    const newRoleDays = situational.new_role_days;
    if (newRoleDays !== null && newRoleDays < 180) return "situational_new_hire";
    if (situational.funding_days_ago !== null) return "situational_funding";
    if (situational.headcount_growth_pct !== null && situational.headcount_growth_pct > 20) {
      return "situational_growth";
    }
  }

  return "structural_only";
};

const buildEmailModifierPrompt = (contact, company, leadSignal, structural, situational, psychological) => {
  switch (leadSignal) {
    case "psychological_post": {
      const topSignal = psychological.signals_found.find(s => s.relevance_score >= 60);
      return `IMPORTANT: ${contact.name} posted publicly about ${topSignal?.description || 'a relevant problem'}. ` +
        `Reference this specifically in your opening line — "I saw your post about [topic]." ` +
        `This is the hook. Do not use a generic opener about the company.`;
    }
    case "psychological_talk": {
      const topSignal = psychological.signals_found.find(s => s.type === "conference_talk");
      return `IMPORTANT: ${contact.name} gave a talk on ${topSignal?.description || 'a relevant topic'}. ` +
        `Open by referencing that talk directly. Show that you know their public position on this problem. ` +
        `Do not use a generic company-based opener.`;
    }
    case "situational_new_hire": {
      const days = situational.new_role_days;
      const weeks = Math.round(days / 7);
      return `${contact.name} joined ${company.name} as ${contact.title} approximately ${weeks} weeks ago. ` +
        `Open with acknowledgment of their new role — this is the moment when new leaders evaluate their toolstack ` +
        `and establish their technical vision. Connect the pitch to the opportunity a new role provides to make foundational decisions.`;
    }
    case "situational_funding": {
      const days = situational.funding_days_ago;
      return `${company.name} recently raised funding (${days} days ago). ` +
        `Open by congratulating ${contact.name} on the round and connecting the timing to infrastructure decisions ` +
        `that are best made before scaling. Frame the pitch as the right tool for a company at this stage.`;
    }
    case "situational_growth": {
      const growthPct = Math.round(situational.headcount_growth_pct);
      return `${company.name}'s team is growing (approximately ${growthPct}% headcount growth detected). ` +
        `Open by acknowledging the growth signal — scaling teams face predictable infrastructure challenges. ` +
        `Frame the pitch around what happens when the team doubles and complexity compounds.`;
    }
    case "structural_only":
    default:
      return `No specific personal or situational hook found for ${contact.name}. ` +
        `Use the best company-level angle from the research. Keep the opener pain-focused and specific to the company.`;
  }
};

const scoreContact = (contact, company, icpPersona, icpPainDescription,
                       triggerEventsContribution, psychSearchResult) => {
  const structural   = computeStructuralScore(contact, icpPersona);
  const situational  = computeSituationalScore(contact, company, triggerEventsContribution);
  const psychological = computePsychologicalScore(psychSearchResult);

  const compositeScore   = computeCompositeScore(structural, situational, psychological);
  const confidenceTier   = computeConfidenceTier(compositeScore);
  const leadSignal       = determineLeadSignal(structural, situational, psychological,
                                               psychological.signals_found);
  const emailModifier    = buildEmailModifierPrompt(contact, company, leadSignal,
                                                    structural, situational, psychological);

  const leadRationale = buildLeadRationale(contact, leadSignal, situational, psychological);
  const recommendedAngle = deriveRecommendedAngle(leadSignal, company, psychological);

  return {
    contact_id: contact.apollo_person_id,
    structural,
    situational,
    psychological,
    composite_score: compositeScore,
    confidence_tier: confidenceTier,
    lead_signal: leadSignal,
    lead_rationale: leadRationale,
    recommended_angle: recommendedAngle,
    email_modifier_prompt: emailModifier,
  };
};
```

---

## Ranking Multiple Candidates

Apollo Phase 3a returns up to 5 candidates. Previously the pipeline took the top result by seniority. Now:

1. Run Phase 3e (psychological search) on the top 3 candidates in parallel
2. Run Phase 3d (scoring) on all candidates
3. Sort candidates by `composite_score` descending
4. Set `recommended_contact` = candidates[0]
5. Set `fallback_contacts` = candidates[1..] with their scores attached

**Updated `RecommendedContact` shape (addition to PRD-10):**

```typescript
interface RecommendedContact {
  // ... all existing PRD-10 fields ...

  // NEW in PRD-22:
  signal_score: PersonSignalScore;
  selection_rationale: string; // e.g. "Chosen over 2 alternatives because composite score 84 vs next-best 41"
}

interface FallbackContact {
  name: string;
  title: string;
  linkedin_url: string | null;

  // NEW in PRD-22:
  signal_score: PersonSignalScore;
}
```

The SDR sees: "We recommend Jane Smith (score: 84) over Bob Lee (score: 41) because Jane posted about exactly this problem last month." — see UI section below.

---

## UI — Score Breakdown Panel

In ProspectFold, clicking on a contact name in the company card opens the score breakdown panel. This replaces the current "personalization hooks list" view.

```
Jane Smith — VP Engineering                               Score: 84/100  [high]
──────────────────────────────────────────────────────────────────────────────
  Structural    72  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░  VP title (+40) · vp seniority (+30) · 36mo tenure (+4)
  Situational   68  ▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░  Promoted Jan 2026 (+40) · team growing 28% (+15)
  Psychological 94  ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  LinkedIn post (+40) · PgConf talk (+25) — both fresh

  Composite: (0.25 × 72) + (0.40 × 68) + (0.35 × 94) = 18 + 27.2 + 32.9 = 84

Lead signal: PSYCHOLOGICAL
"Jane posted about Postgres scaling pain 3 weeks ago — lead with that."

Recommended opener:
  "I saw your post about pipeline reliability at scale last month. We built exactly
  for that problem — here's what that looks like for a team at your stage."

[Override contact]   [View Bob Lee (41)]   [View Carlos Ruiz (29)]
```

**Progress bar rendering:** Each sub-score bar fills proportionally from 0 to 100. Use the `▓` character for filled segments and `░` for empty. At 80px wide, 1 char ≈ 6 points. Render 17 segments total.

**Color coding by tier:**
- `high` (75+): green score badge
- `medium` (55–74): blue score badge
- `low` (35–54): amber score badge
- `cold` (0–34): gray score badge

**Fallback contact comparison:** "View Bob Lee (41)" links to the same breakdown panel for Bob, pre-populated with his scores. The SDR can override the recommendation by clicking "Use Bob Lee instead."

---

## Company Queue Card Update

The existing company card in ProspectFold gains the composite score inline:

```
┌─ Acme Corp ────────────────────────────────────────────────────┐
│  acme.com  |  320 employees  |  ICP Score: 85                  │
│                                                                  │
│  Jane Smith — VP Engineering                     Score: 84  [+] │
│  Lead: PSYCHOLOGICAL · "Posted about Postgres pain 3w ago"      │
│  Email: jane@acme.com  [Override]                                │
│                                                                  │
│  Best angle: Technical Debt Automation                           │
│  [Generate Email]                                                │
└──────────────────────────────────────────────────────────────────┘
```

The `[+]` expands to the full score breakdown panel. The lead signal type is shown inline so the SDR can understand at a glance why this person was chosen.

---

## EmailFold Integration

### `email_modifier_prompt` Injection

The `email_modifier_prompt` field from `PersonSignalScore` is injected verbatim into EmailFold's Phase 2 system prompt, immediately after the `RECIPIENT` block. This is the mechanism by which signal scoring changes outreach strategy downstream.

```javascript
// EmailFold Phase 2 system prompt construction
const buildPhase2Prompt = (company, contact, researchAngles) => {
  const recipientBlock = `
RECIPIENT:
Name: ${contact.name}
Title: ${contact.title}
Company: ${company.name}
`;

  // email_modifier_prompt is the full PersonSignalScore field — inject directly
  const signalModifier = contact.signal_score?.email_modifier_prompt
    ? `\n${contact.signal_score.email_modifier_prompt}\n`
    : '';

  const anglesBlock = researchAngles.map((a, i) =>
    `ANGLE ${i + 1} — ${a.name}:\n${a.hook}`
  ).join('\n\n');

  return `${recipientBlock}${signalModifier}\n${anglesBlock}`;
};
```

**Example injected modifier — high psychological score:**
```
IMPORTANT: Jane Smith posted on LinkedIn 3 weeks ago about Postgres migration challenges at scale. Reference this specifically in your opening line — "I saw your post about [topic]." This is the hook. Do not use a generic opener about the company.
```

**Example injected modifier — situational new hire:**
```
Jane Smith joined Acme as VP Engineering approximately 6 weeks ago. Open with acknowledgment of her new role — this is the moment when new leaders evaluate their toolstack and establish their technical vision. Connect the pitch to the opportunity a new role provides to make foundational decisions.
```

The result: EmailFold Phase 2 (Sonnet) receives a clear, imperative instruction about how to open the email, derived from real evidence about the recipient — not a generic prompt about "personalization."

### `lead_signal` Feeds EmailFold Subject Line Guidance

Beyond the opener, `lead_signal` can also steer subject line construction. Pass it as a separate hint:

```javascript
const SUBJECT_HINTS = {
  psychological_post:    "reference or allude to the topic they posted about",
  psychological_talk:    "reference their expertise or the conference topic",
  situational_new_hire:  "keep it forward-looking — new role, new chapter",
  situational_funding:   "can reference momentum or growth",
  situational_growth:    "can reference scale or team size",
  structural_only:       "pain-point or curiosity driven — no personal reference",
};
```

---

## Phase 3 Loading State Update

The company card progress indicator gains entries for the new sub-phases:

```
Acme Corp:
  ✓ Phase 1: Company scan complete
  ✓ Phase 2: ICP analysis complete
  ✓ Phase 3a: Apollo — Jane Smith (VP Eng), Bob Lee (Dir Eng) found
  ⟳ Phase 3b: Trigger events...
  ⟳ Phase 3c: Job postings...
  ⟳ Phase 3e: Searching for Jane's public signals...
    (parallel with 3b and 3c)
  ✓ Phase 3b: Series B 61 days ago detected
  ✓ Phase 3c: 4 open data roles found
  ✓ Phase 3e: 2 psychological signals found (LinkedIn post, PgConf talk)
  ⟳ Phase 3d: Scoring candidates...
  ✓ Phase 3d: Jane Smith scores 84 (vs Bob Lee: 41)
  ✓ Phase 3: Jane Smith recommended (high confidence)
```

---

## Cost Impact

Phase 3e adds 1 Haiku call per candidate, capped at 3 candidates. Average is approximately 2 candidates per company.

| Sub-Phase | Model | Cost per Company |
|---|---|---|
| Phase 3a: Apollo People Search | API call | $0 (plan credit) |
| Phase 3b: Trigger event detection | Haiku | $0.0005 (PRD-19) |
| Phase 3c: Job postings analysis | Haiku | $0.001 (PRD-20) |
| Phase 3e: Psychological search (×2 avg) | Haiku | $0.001 |
| Phase 3d: Signal score synthesis | Computation | $0 |
| **Phase 3 total** | | **~$0.0025** |

**Full pipeline cost including all phases:**

| Phase | Model | Cost per Company |
|---|---|---|
| Phase 0: Pre-qualification | Haiku | $0.0002 |
| Phase 1: Company web scan | Haiku | $0.007 |
| Phase 2: ICP synthesis + angles | Opus | $0.10 |
| Phase 3 (all sub-phases) | Mixed | $0.008 |
| EmailFold Phase 1 | Haiku | $0.003 |
| EmailFold Phase 2 | Sonnet | $0.005 |
| **Total per company** | | **~$0.123** |

Full 20-company session: **~$2.46**

**ROI framing:** The Phase 3 additions cost $0.008 per company — an 8% cost increase over the Phase 3a-only baseline. Expected reply rate improvement with psychological and situational lead signals: 8–15% vs. 2–5% with generic openers. The incremental cost of Phase 3d/3e is approximately $0.00 amortized against even a single reply generating a deal.

---

## What This Unlocks

**Before this PRD:**

20 emails sent. All addressed to "Dear VP Engineering." Each opened with a generic pain-point hook about the company. 2–5% reply rate. The SDR has no way to know which 1 of the 20 contacts is the one who publicly said they have this exact problem.

**After this PRD:**

20 emails sent. 12 have specific personalization hooks. Of those 12:
- 5 reference something the person posted, said, or wrote publicly
- 4 open with a new-hire or funding congratulation that matches a real event
- 3 use growth/scaling signals from job postings

Projected reply rate: **8–15%**. The 5 emails with psychological lead signals ("I saw your post about X") are the highest-performing cohort — those specific openers typically see 3–5× the reply rate of generic pain-point openers because the recipient sees that you did real research, not just title matching.

---

## Out of Scope

- Real-time LinkedIn scraping (ToS violation — use Apollo data + web search results only)
- Building or maintaining a proprietary public-signal database
- Scoring signals outside the ICP pain area (general career achievements, personal interests)
- Automated A/B testing of lead signals (metric tracking is out of scope — measure manually via EventFold reply logging)
- Psychological scoring for contacts at companies with < 20 employees (Apollo coverage is sparse; skip Phase 3e for these and return `search_performed: false`)

---

## Open Questions

1. **Apollo employment history availability:** Does the current Apollo API response include `employment_history` with a start date for the current role? If yes, `new_role_days` can be computed directly. If no, Phase 3e's psychological search is the fallback (Haiku often surfaces "Jane Smith joined Acme as VP Engineering" LinkedIn updates as a side effect of the web search). Confirm before implementing `computeSituationalScore`.

2. **Psychological search capping:** This PRD caps Phase 3e at the top 3 candidates by seniority. Should this cap be configurable in ProspectFold settings? The default of 3 balances cost and coverage but some users running expensive segments may want to restrict it to 1.

3. **`lead_rationale` generation:** The current spec generates `lead_rationale` in `buildLeadRationale()` (not shown in full above) using simple string interpolation. Should this be a small Haiku call to generate a more natural sentence? Cost is negligible but adds latency. Recommendation: use string interpolation for MVP, upgrade to Haiku generation in a follow-up if SDR feedback indicates the rationale sentences feel mechanical.

4. **Trigger events contribution normalization:** PRD-19 produces a `timing_score` on its own scale. This PRD treats its output as a direct point contribution (10–20 pts) to `situational.trigger_events_contribution`. Confirm with the PRD-19 implementer that the output is normalized to this range before wiring Phase 3d.

5. **Score persistence:** Should `PersonSignalScore` be stored on the EventFold `Contact` aggregate (via `/api/contact`) or remain ephemeral in the ProspectFold run payload? Recommendation: include it in the `POST /api/contact` payload so EventFold can display the breakdown in the Contact detail view without re-running the pipeline.
