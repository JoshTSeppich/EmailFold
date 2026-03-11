# PRD-19 — Trigger Event Engine: The Right Moment Layer
**Version:** 1.0
**Date:** 2026-03-11
**Author:** Foxworks / Claude Architecture Session
**For:** ProspectFold owner + EmailFold owner
**Priority:** P1 — The Right Moment layer
**Depends on:** PRD-10 (contact person research), PRD-09 (local HTTP API)

---

## Problem

PRD-10 finds the right *person* at the right *company*. That is necessary but not sufficient.

Cold outreach fails not because the prospect is the wrong person, but because the message arrived at the wrong moment. A message about database scaling lands in the inbox of a VP Engineering who just started using a new DB vendor. A message about hiring process automation arrives three days before the company announces a hiring freeze. The right person at the wrong moment is a deleted email.

Timing transforms cold outreach into warm outreach. Industry benchmarks consistently show that trigger-based outreach — messages sent within a defined window after an organizational change — yields **2–5× higher reply rates** than untriggered outreach. The mechanism is well-understood: organizational change creates decision windows. New hires re-evaluate vendor relationships. Post-funding teams have budget and a growth mandate. Rapid headcount growth creates acute operational pain. Tech migrations open evaluation cycles.

**The gap:** The current pipeline has no awareness of *when* a company is in a buying window. It finds 20 ICP-matching companies and reaches out to all of them with equal urgency. In practice, two of those 20 are in a hot trigger window right now — they need to be treated radically differently than the remaining 18.

This PRD defines the **Trigger Event Engine**: a Phase 3b step in ProspectFold that detects organizational signals, scores their recency and relevance, and surfaces them as actionable intelligence — both for prioritizing company outreach and for writing email openers that reference real events the prospect will recognize.

---

## The Psychological Mechanism

Understanding *why* trigger events work determines which signals to look for and how to use them. Three dynamics are at play:

**1. The First-90-Days Phenomenon**

New leaders — especially VP-and-above hires — have a mandate to make decisions in their first 90 days. They are actively evaluating what exists, what should change, and which vendors they trust. An email referencing their recent appointment arrives when they are *actively looking* for solutions, not when they are in maintenance mode. After 90 days, they have formed their initial opinions and are harder to reach.

**2. Event-Driven Budget Activation**

Funding rounds do not just mean a company has money. They mean the company is under obligation to *spend* that money toward a growth target. Series A through Series C companies have just made commitments to investors about what they will build. They are in acceleration mode: hiring, buying tooling, expanding infrastructure. A message sent within 60 days of a funding announcement lands during peak receptivity.

**3. Pain Acuteness**

Operational pain is not constant — it has peaks. Rapid headcount growth creates acute coordination pain. Tech migrations create acute transition pain. Product launches create acute infrastructure strain. The right product message during an acute pain moment reads as a solution, not a pitch.

---

## Trigger Types: Sources, Signals, and Score Impact

### Trigger 1: Funding Round

**What it signals:** Budget activation. Growth mandate is live. Infrastructure spend is about to increase.

**Target relevance window:** 0–90 days post-announcement. Maximum relevance within 30 days.

**Sources:**
- Crunchbase News API: `GET /v4/searches/funding_rounds` filtered by `organization_identifier`, sorted by `announced_on` descending
- Perplexity web search: `"[company name]" raised funding 2025 OR 2026`
- Apollo organization object: `latest_funding_stage`, `last_funding_amount`, `last_funding_at`

**Minimum threshold for positive signal:** Series A or higher (pre-seed and seed rounds indicate early-stage, pre-infrastructure spend)

**Score impact:** +35 points (Series A or B), +25 points (Series C+, may already have locked vendors)

**Haiku signal extraction:**
- Round size in USD
- Round stage (Series A, B, C, etc.)
- Lead investor (context for prestige/validation)
- Announced date (for recency calculation)

---

### Trigger 2: New Key Hire

**What it signals:** A new decision maker has arrived. Existing vendor relationships are being re-evaluated. The first 90 days are the highest receptivity window in a leader's tenure.

**Target relevance window:** 0–90 days post-join date. Maximum relevance within 45 days.

**Target roles (in priority order):**
- CTO
- VP Engineering / Head of Engineering / Director of Engineering
- VP Data / Head of Data / Chief Data Officer
- Head of Platform / VP Infrastructure
- VP Product (for product-angle outreach)
- VP Operations (for ops-angle outreach)

**Sources:**
- Apollo organization object: `news` field often includes hire announcements
- Perplexity web search: `"[company name]" "VP Engineering" OR "CTO" hired OR joins 2025 OR 2026`
- LinkedIn company page "People" changes (surfaced through Haiku web search)

**Score impact:** +40 points. New leaders make decisions. This is the single highest-value trigger.

**Haiku signal extraction:**
- Person's name
- Exact title
- Prior company (valuable for personalization: "after your time at Stripe...")
- Join date or announcement date

---

### Trigger 3: Headcount Growth Signal

**What it signals:** Scaling pain is acute. The company is adding people faster than processes and tooling can handle. Onboarding, coordination, infrastructure, and hiring ops are all under strain.

**Target relevance window:** Ongoing signal — weight by current rate, not by event date.

**Threshold:** >20% headcount growth vs. last known state, or >10 open engineering/ops roles posted simultaneously.

**Sources:**
- Apollo organization object: `num_employees` — compare to previously cached value in EventFold's ProspectIntel aggregate (if re-run of same company)
- Apollo job posting count: `job_listings_count` on the organization object
- Perplexity web search: `"[company name]" hiring site:linkedin.com/jobs` — count open roles

**Score impact:** +20 points. Indicates scaling pain but not a discrete event with a time window.

**Haiku signal extraction:**
- Current headcount (from Apollo)
- Number of open job postings
- Dominant department being hired (Engineering? Sales? Operations?)
- Rate of growth (if historical data available)

---

### Trigger 4: Tech Stack Migration Signal

**What it signals:** The company is in an active migration. Migration windows are evaluation windows — when moving from one system to another, teams assess adjacent tools. New infrastructure decisions are being made.

**Target relevance window:** Active signal — migrations can last 3–18 months. Any detectable migration is in-window.

**Migration patterns to detect:**

| From | To | What it means |
|---|---|---|
| AWS → GCP or Azure | Cloud diversification | Infrastructure team is making platform decisions |
| Monolith → Microservices | Architecture modernization | DevOps/platform tooling decisions open |
| Postgres → Distributed DB | Data scaling event | Data infrastructure is being re-evaluated |
| On-prem → Cloud | Lift-and-shift | Entire vendor stack is under review |
| Legacy CI/CD → Modern | Build/deploy modernization | DevEx tooling being re-selected |
| Custom analytics → SaaS | Data stack evaluation | BI/analytics vendors being assessed |

**Sources:**
- BuiltWith API: `GET https://api.builtwith.com/v21/api.json?KEY=[key]&LOOKUP=[domain]` — returns current and historical technology usage, including technologies "no longer detected" (= recently removed)
- Perplexity web search: `"[company name]" migration OR migrating OR "moved from" 2025 OR 2026`
- Apollo organization: `technologies` array — cross-reference with Foxworks ICP's target stack

**Score impact:** +25 points if detected migration aligns with Foxworks ICP target context. +10 points for any detected migration (generic signal).

**Haiku signal extraction:**
- Technologies being abandoned (from BuiltWith "no longer detected" list)
- Technologies recently adopted
- Whether migration is publicly discussed or only inferred from BuiltWith delta

---

### Trigger 5: Relevant News / Announcement

**What it signals:** The company is in the news for something — product launches, partnerships, analyst coverage, awards, acquisitions, regulatory changes. The specific relevance depends on what Foxworks sells.

**Target relevance window:** 0–60 days. News older than 60 days is stale.

**Sources:**
- Perplexity web search: `"[company name]" news 2026` (or current year/month)
- Apollo organization: `news` field (returned on organization objects)

**Haiku determines relevance:** Not all news is a trigger. A company winning an award is noise. A company announcing a new product that will require infrastructure support is signal. Haiku receives the raw news and rates it: 0 (irrelevant) to 100 (directly relevant to ICP fit angle).

**Score impact:** +15 to +30 points based on Haiku relevance rating:
- 80–100 relevance: +30 points (news is directly about a pain we solve)
- 50–79 relevance: +20 points (news implies growth/change that creates our pain)
- 20–49 relevance: +10 points (tangentially related news)
- 0–19 relevance: +0 points (irrelevant, do not add to trigger list)

**Haiku signal extraction:**
- Headline and one-line summary
- Relevance rating (0–100)
- Why it is relevant (or why it is not)

---

## Data Shape

### `TriggerEvent`

```typescript
interface TriggerEvent {
  type: "funding" | "new_hire" | "headcount_growth" | "tech_migration" | "news";
  description: string;       // human-readable: "Raised $12M Series A in January 2026"
  source_url: string | null; // URL where this was found, if available
  detected_at: string;       // ISO date of detection (today)
  event_date: string | null; // ISO date of the actual event (if known)
  relevance_score: number;   // 0–100: how relevant to ICP fit + what Foxworks sells
  age_days: number;          // days since event_date (null event_date → 0)
  recency_weight: number;    // exponential decay factor applied to score
                             // 1.0 at 0 days, ~0.5 at 45 days, ~0.0 at 90 days
                             // formula: Math.max(0, 1 - (age_days / 90))
  raw_data: Record<string, unknown>; // trigger-type-specific structured data
}
```

**`raw_data` shape by trigger type:**

```typescript
// type: "funding"
{
  round_stage: string;          // "Series A", "Series B", etc.
  amount_usd: number | null;
  lead_investor: string | null;
  announced_date: string;       // ISO date
}

// type: "new_hire"
{
  person_name: string;
  title: string;
  prior_company: string | null;
  join_date: string | null;     // ISO date — null if only month known
}

// type: "headcount_growth"
{
  current_headcount: number | null;
  open_job_count: number | null;
  dominant_hiring_dept: string | null; // "Engineering", "Sales", etc.
  growth_pct: number | null;          // vs cached value, null if no prior data
}

// type: "tech_migration"
{
  from_tech: string | null;
  to_tech: string | null;
  migration_description: string;
  confidence: "inferred" | "stated"; // "stated" if company publicly announced it
}

// type: "news"
{
  headline: string;
  source: string | null;        // publication name
  published_date: string | null;
  relevance_rating: number;     // 0–100 from Haiku
  relevance_reason: string;     // Haiku explanation
}
```

---

### `TriggerEventSummary`

```typescript
interface TriggerEventSummary {
  events: TriggerEvent[];
  timing_score: number;      // 0–100 composite — how good is NOW to reach out
  timing_label: "hot" | "warm" | "cool" | "cold";
  recommended_opener: string; // "Congrats on the Series A — saw you're scaling engineering fast"
  timing_rationale: string;  // one sentence: why this score was given
}
```

**Timing score computation:**

```typescript
const computeTimingScore = (events: TriggerEvent[]): number => {
  if (events.length === 0) return 0;

  // Apply recency weighting to each event's base score
  const weightedScores = events.map(e => {
    const ageWeight = Math.max(0, 1 - (e.age_days / 90));
    return e.relevance_score * ageWeight;
  });

  // Sum with diminishing returns for multiple signals
  // First signal counts 100%, second 60%, third 30%, additional 10% each
  const WEIGHTS = [1.0, 0.6, 0.3, 0.1];
  const sorted = weightedScores.sort((a, b) => b - a);
  const composite = sorted.reduce((acc, score, i) => {
    const w = WEIGHTS[Math.min(i, WEIGHTS.length - 1)];
    return acc + score * w;
  }, 0);

  return Math.min(100, Math.round(composite));
};

const toLabel = (score: number): "hot" | "warm" | "cool" | "cold" => {
  if (score >= 75) return "hot";
  if (score >= 50) return "warm";
  if (score >= 25) return "cool";
  return "cold";
};
```

**Timing label thresholds:**

| Score | Label | Meaning |
|---|---|---|
| 75–100 | hot | Multiple strong, recent signals. Reach out now. |
| 50–74 | warm | At least one meaningful signal in window. Good time. |
| 25–49 | cool | Weak or aging signals. Outreach will work but not urgent. |
| 0–24 | cold | No meaningful triggers. Generic outreach. Deprioritize. |

---

### Updated `ProspectIntelV2Payload`

Phase 3b adds `trigger_summary` to each company's existing `ApolloCompanyWithContact` shape (defined in PRD-10):

```typescript
// Extension of ApolloCompanyWithContact from PRD-10
interface ApolloCompanyWithContactAndTriggers extends ApolloCompanyWithContact {
  trigger_summary: TriggerEventSummary | null; // null if Phase 3b did not run or found nothing
}

// The top-level payload field (added to existing ProspectIntelV2Payload):
// companies: ApolloCompanyWithContactAndTriggers[]
// (replaces the existing companies: ApolloCompanyWithContact[])
```

The full payload shape (combining PRD-10 and PRD-19 additions):

```typescript
interface ProspectIntelV2Payload {
  __prospect_intel_v2: true;
  naicsCode: string;
  naicsLabel: string;
  summary: string;
  icp_criteria: IcpCriteria;
  apollo_searches: IntelApolloSearch[];
  companies: ApolloCompanyWithContactAndTriggers[]; // upgraded from PRD-10
  generated_at: string;  // ISO datetime
}
```

---

## Implementation: Phase 3b in ProspectFold

### Placement in the Pipeline

Phase 3b runs **concurrently with Phase 3a** (Apollo People Search + person enrichment from PRD-10) at the company level. For each company in the result set:

```
Phase 2 (Opus): ICP synthesis + angles
    │
    ▼
Phase 3a (Apollo + Haiku):          Phase 3b (Haiku + web_search):
Find recommended contact             Detect trigger events
    │                                    │
    └─────────────── Promise.all() ──────┘
                          │
                          ▼
                  Merge results on company record
                  Compute timing_score
                  Generate recommended_opener
```

Both Phase 3a and Phase 3b are Haiku calls — they are cheap and fast. Running them concurrently adds no net latency vs. running Phase 3a serially.

---

### The Haiku Prompt for Trigger Detection

```javascript
const detectTriggers = async (company, icpCriteria, angles) => {
  const today = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
  const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000)
    .toISOString().split('T')[0];

  const result = await anthropic.messages.create({
    model: "claude-haiku-3-5",
    max_tokens: 800,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{
      role: "user",
      content: `You are a B2B sales intelligence analyst. Detect recent trigger events for the company below that indicate NOW is a good time to reach out.

COMPANY:
Name: ${company.name}
Domain: ${company.primary_domain}
Industry: ${company.industry}
Employees: ${company.num_employees ?? 'unknown'}
Apollo funding stage: ${company.latest_funding_stage ?? 'unknown'}
Apollo funding amount: ${company.total_funding ?? 'unknown'}
Apollo technologies: ${(company.technologies ?? []).map(t => t.name).join(', ') || 'unknown'}

WHY WE'RE REACHING OUT (ICP angles):
${angles.map(a => `- ${a.name}: ${a.hook}`).join('\n')}

TODAY: ${today}
LOOKBACK WINDOW: ${ninetyDaysAgo} to ${today} (last 90 days only)

SEARCH INSTRUCTIONS:
1. Search for: "${company.name}" funding raised 2025 OR 2026
2. Search for: "${company.name}" new CTO OR "VP Engineering" OR "Head of" hired 2025 OR 2026
3. Search for: "${company.name}" news announcement 2026

For each search, extract any trigger events from the results. Only include events that occurred in the last 90 days. Ignore anything older.

Return a JSON object with this exact structure:
{
  "events": [
    {
      "type": "funding" | "new_hire" | "headcount_growth" | "tech_migration" | "news",
      "description": "human-readable description of the event",
      "source_url": "URL where found, or null",
      "event_date": "YYYY-MM-DD or null if unknown",
      "relevance_score": 0-100 (how relevant is this event to the ICP angles above?),
      "age_days": number (days since event_date; use 0 if event_date is null),
      "raw_data": { ... type-specific fields ... }
    }
  ],
  "recommended_opener": "one sentence opener referencing the most compelling trigger (max 20 words)",
  "timing_rationale": "one sentence explaining why now is or is not a good time"
}

If no trigger events are found, return: { "events": [], "recommended_opener": "", "timing_rationale": "No recent trigger events detected." }

Only include events you actually found evidence for. Do not hallucinate events.`
    }]
  });

  return JSON.parse(extractJSON(result.content));
};
```

---

### Integration in `prospect-crafter.jsx`

Phase 3b runs alongside Phase 3a inside the existing per-company enrichment loop:

```javascript
const enrichCompany = async (company, icpCriteria, angles) => {
  // Phase 3a (PRD-10) + Phase 3b (PRD-19) run concurrently
  const [contactResult, triggerResult] = await Promise.all([
    enrichContact(company, icpCriteria, angles),   // PRD-10 — existing
    detectTriggers(company, icpCriteria, angles),  // PRD-19 — new
  ]);

  // Compute timing score from trigger events
  const triggerEvents = triggerResult?.events ?? [];
  const timingScore = computeTimingScore(triggerEvents);
  const timingLabel = toLabel(timingScore);

  const triggerSummary = triggerEvents.length > 0 ? {
    events: triggerEvents.map(e => ({
      ...e,
      detected_at: new Date().toISOString().split('T')[0],
      recency_weight: Math.max(0, 1 - (e.age_days / 90)),
    })),
    timing_score: timingScore,
    timing_label: timingLabel,
    recommended_opener: triggerResult.recommended_opener || '',
    timing_rationale: triggerResult.timing_rationale || '',
  } : null;

  return {
    ...company,
    recommended_contact: contactResult,    // PRD-10
    trigger_summary: triggerSummary,       // PRD-19 — new
  };
};
```

---

### Error Handling

Phase 3b failure must not block Phase 3a or the overall result. If Haiku's trigger detection call throws or returns invalid JSON:

```javascript
const detectTriggersWithFallback = async (company, icpCriteria, angles) => {
  try {
    return await detectTriggers(company, icpCriteria, angles);
  } catch (err) {
    console.warn(`[Phase3b] Trigger detection failed for ${company.name}:`, err.message);
    return { events: [], recommended_opener: '', timing_rationale: 'Trigger detection unavailable.' };
  }
};
```

A missing `trigger_summary: null` on the company record is a valid state — the UI handles it gracefully (no badge, no timing score shown).

---

## How Triggers Affect EmailFold

Trigger data flows from ProspectFold → EventFold (via `/api/intel`) → EmailFold (via the company queue). When EmailFold generates a sequence for a company that has a `trigger_summary`, it uses the trigger data in three ways.

### 1. Subject Line Selection

The trigger context shifts the subject line strategy:

```javascript
// In EmailFold Phase 2 prompt — SUBJECT LINE block:

const triggerSubjectContext = company.trigger_summary?.events?.length > 0
  ? `TRIGGER EVENTS DETECTED — use these to write a more relevant subject line:
${company.trigger_summary.events
  .filter(e => e.relevance_score >= 50)
  .map(e => `- ${e.description}`)
  .join('\n')}

Preferred subject line approach: reference the trigger, not the product.
Example patterns:
- Funding trigger: "After your Series A" / "Scaling post-[round]" / "Growth plans after [round]"
- New hire trigger: "Welcome to [Company], [FirstName]" / "New chapter at [Company]"
- Headcount trigger: "Scaling your [function] team" / "[N] open roles and..."
- News trigger: Reference the specific announcement directly`
  : ''; // No trigger — use standard subject line guidance
```

### 2. Email Opener

The `recommended_opener` field from `TriggerEventSummary` is injected directly as the preferred first sentence:

```javascript
// In EmailFold Phase 2 prompt — PERSONALIZATION block:

const triggerOpenerContext = company.trigger_summary?.recommended_opener
  ? `RECOMMENDED OPENER (use this as your first sentence, adapting to natural flow):
"${company.trigger_summary.recommended_opener}"

Why: ${company.trigger_summary.timing_rationale}`
  : '';
```

### 3. Sequence Step Timing

For hot companies (timing_score >= 75), compress the follow-up cadence — they are moving fast:

```typescript
// In EmailFold Phase 2b (sequence generation, PRD-14):

const getStepDayOffsets = (timingLabel: string): [number, number, number, number] => {
  switch (timingLabel) {
    case "hot":  return [0, 2, 5, 10];  // compressed: they're moving fast
    case "warm": return [0, 3, 7, 14];  // standard cadence
    case "cool": return [0, 4, 10, 21]; // extended: lower urgency
    case "cold":
    default:     return [0, 5, 12, 21]; // slowest: low signal
  }
};
```

The `EmailSequenceStep.day_offset` values in the payload to EventFold (`/api/email-sequence`) use these computed offsets instead of the PRD-14 defaults when a trigger summary is present.

### 4. Angle Selection Reinforcement

Each trigger type has a natural angle alignment. When a trigger is detected, the angle selection in Phase 2 is biased toward the matching angle:

```javascript
// In EmailFold Phase 2 prompt — ANGLE SELECTION block:

const triggerAngleBias = {
  funding:          "growth/scale angle — budget is active, growth mandate is on",
  new_hire:         "new-leader angle — they're establishing their roadmap right now",
  headcount_growth: "operational scale angle — coordination pain is acute",
  tech_migration:   "migration/modernization angle — they are already in evaluation mode",
  news:             "tie-in to their announced direction",
};

const dominantTriggerType = company.trigger_summary?.events
  ?.sort((a, b) => b.relevance_score - a.relevance_score)[0]?.type;

const angleBiasNote = dominantTriggerType
  ? `ANGLE BIAS: Given the "${dominantTriggerType}" trigger, prefer the ${triggerAngleBias[dominantTriggerType]}.`
  : '';
```

---

## ProspectFold UI

### Company Card: Trigger Badges

Each company card in the results panel shows its trigger status prominently:

```
┌─ Acme Corp ────────────────────────────────────────────────────┐
│  acme.com  |  340 employees  |  ICP Score: 87                  │
│                                                                 │
│  🔥 HOT  Series A · New VP Eng · 18 open roles                 │
│  Timing score: 94/100                                          │
│  "Congrats on the Series A — saw you're scaling eng fast"       │
│                                                                 │
│  👤 Jane Smith — VP Engineering (joined Jan 2026)              │
│     "Posted about Postgres migration pain 3w ago"              │
│                                                                 │
│  [Generate Sequence ▶]                                         │
└────────────────────────────────────────────────────────────────┘
```

```
┌─ Beta Systems ─────────────────────────────────────────────────┐
│  betasystems.io  |  80 employees  |  ICP Score: 72             │
│                                                                 │
│  🟡 WARM  Product launch · Hiring surge                        │
│  Timing score: 61/100                                          │
│  "Saw your new data platform launch — congrats"                │
│                                                                 │
│  👤 Marcus Reyes — Head of Data (2 years)                      │
│     "Spoke at DataConf 2025 about pipeline reliability"        │
│                                                                 │
│  [Generate Sequence ▶]                                         │
└────────────────────────────────────────────────────────────────┘
```

```
┌─ Gamma Corp ───────────────────────────────────────────────────┐
│  gammacorp.com  |  210 employees  |  ICP Score: 68             │
│                                                                 │
│  (no recent trigger events)                                    │
│                                                                 │
│  👤 Sarah Kim — VP Engineering                                 │
│     "Contributed to OSS logging project"                       │
│                                                                 │
│  [Generate Sequence ▶]                                         │
└────────────────────────────────────────────────────────────────┘
```

**Badge rendering rules:**

```javascript
const TriggerBadge = ({ summary }) => {
  if (!summary || summary.timing_label === 'cold') return null;

  const config = {
    hot:  { emoji: '🔥', label: 'HOT',  color: '#dc2626', bg: '#fef2f2' },
    warm: { emoji: '🟡', label: 'WARM', color: '#d97706', bg: '#fffbeb' },
    cool: { emoji: '🔵', label: 'COOL', color: '#2563eb', bg: '#eff6ff' },
  };

  const { emoji, label, color, bg } = config[summary.timing_label];
  const topEventDescriptions = summary.events
    .sort((a, b) => b.relevance_score - a.relevance_score)
    .slice(0, 3)
    .map(e => e.description)
    .join(' · ');

  return (
    <div style={{ background: bg, border: `1px solid ${color}`, borderRadius: 4, padding: '4px 8px' }}>
      <span style={{ color, fontWeight: 700 }}>{emoji} {label}</span>
      <span style={{ color: '#374151', marginLeft: 8, fontSize: 13 }}>{topEventDescriptions}</span>
    </div>
  );
};
```

### Company Sort Order

The results panel defaults to sorting by a composite score: ICP score (existing) + timing bonus:

```javascript
const sortedCompanies = companies.sort((a, b) => {
  const scoreA = (a.icp_score ?? 0) + (a.trigger_summary?.timing_score ?? 0) * 0.3;
  const scoreB = (b.icp_score ?? 0) + (b.trigger_summary?.timing_score ?? 0) * 0.3;
  return scoreB - scoreA;
});
```

Hot companies bubble to the top. A company with ICP score 70 and timing score 90 outranks a company with ICP score 80 and no triggers (70 + 27 = 97 vs 80 + 0 = 80).

### Trigger Detail Drawer

Clicking the trigger badge opens a drawer showing the full trigger timeline:

```
┌─ Trigger Events — Acme Corp ───────────────────────────────────┐
│  Timing Score: 94/100  🔥 HOT                                  │
│  "Congrats on the Series A — saw you're scaling eng fast"       │
│                                                                 │
│  ● Funding Round                           Jan 14, 2026 (56d)  │
│    Raised $12M Series A led by Sequoia.                        │
│    Relevance: 89/100 · Recency weight: 0.38                    │
│    Source: techcrunch.com/acme-series-a                        │
│                                                                 │
│  ● New Key Hire                            Feb 3, 2026 (36d)   │
│    Rachel Torres joined as VP Engineering (from Stripe).       │
│    Relevance: 95/100 · Recency weight: 0.60                    │
│    Source: linkedin.com/in/racheltor                           │
│                                                                 │
│  ● Headcount Growth                        Ongoing signal       │
│    18 open engineering roles. 340 → est. 400 employees.        │
│    Relevance: 72/100 · Recency weight: 1.0 (ongoing)           │
│    Source: linkedin.com/company/acme-corp/jobs                 │
│                                                                 │
│                                              [Close]            │
└────────────────────────────────────────────────────────────────┘
```

### Phase 3b Loading State

During trigger detection, the company card shows a phase indicator alongside the Phase 3a indicator from PRD-10:

```
Acme Corp:
  ✓ Phase 1: Company scan complete
  ✓ Phase 2: ICP analysis complete
  ⟳ Phase 3a: Finding decision maker...
  ⟳ Phase 3b: Scanning for trigger events...
  ✓ Phase 3a: Rachel Torres (VP Engineering) found
  ✓ Phase 3b: 3 triggers detected — 🔥 HOT (94/100)
```

---

## EventFold Storage

### ProspectIntel Aggregate

The `trigger_summary` is stored on each company entry within the `ProspectIntel` aggregate JSONL stream. No new aggregate is required. The event type is an extension of the existing `IntelCompanyRecorded` event (or equivalent) that already captures per-company data from the intel payload.

**New event fields on `IntelCompanyRecorded`:**

```rust
// src/domain/prospect_intel.rs — extension of existing company event
pub struct IntelCompanyRecorded {
    // ... existing fields (name, domain, icp_score, recommended_contact) ...

    // PRD-19 additions:
    pub trigger_events: Vec<TriggerEventRecord>,  // empty vec if none
    pub timing_score: Option<u8>,                // 0-100
    pub timing_label: Option<String>,            // "hot" | "warm" | "cool" | "cold"
    pub recommended_opener: Option<String>,
}

pub struct TriggerEventRecord {
    pub event_type: String,           // "funding" | "new_hire" | "headcount_growth" | "tech_migration" | "news"
    pub description: String,
    pub source_url: Option<String>,
    pub event_date: Option<String>,   // ISO date
    pub detected_at: String,          // ISO date
    pub relevance_score: u8,          // 0-100
    pub age_days: u32,
    pub recency_weight: f32,          // 0.0-1.0
    pub raw_data: serde_json::Value,  // type-specific JSON
}
```

### Company Detail: Signals Timeline

In EventFold's Company Detail view, add a "Signals" section below the existing Interactions list. This surfaces the trigger events from the most recent ProspectIntel run for that company:

```
COMPANY: Acme Corp
─────────────────────────────────────────────────────────────
[Summary]  [Contacts]  [Interactions]  [Intel]  [Signals]
─────────────────────────────────────────────────────────────

Signals (from Intel run: March 5, 2026)
  Timing: 94/100 🔥 HOT

  ● Feb 3, 2026  NEW HIRE
    Rachel Torres joined as VP Engineering (from Stripe)
    Relevance: 95/100

  ● Jan 14, 2026  FUNDING
    Raised $12M Series A led by Sequoia
    Relevance: 89/100

  ● Ongoing  HEADCOUNT GROWTH
    18 open engineering roles
    Relevance: 72/100

  Opener: "Congrats on the Series A — saw you're scaling eng fast"
```

**New Tauri IPC command required:**

```rust
// PRD-19 addition to src/commands.rs
#[tauri::command]
pub fn get_trigger_signals_for_company(
    company_id: String,
    state: State<AppState>,
) -> Option<TriggerSignalsOutput>
```

```typescript
interface TriggerSignalsOutput {
  timing_score: number;
  timing_label: string;
  recommended_opener: string;
  intel_run_date: string;   // ISO date of the ProspectIntel session
  events: TriggerEventRecord[];
}
```

This command reads from the most recent `ProspectIntel` session for the given `company_id` and returns the trigger data. It is called by the Company Detail "Signals" tab.

---

## `/api/intel` Payload Extension

The existing `/api/intel` endpoint (PRD-09) accepts the full `ProspectIntelV2Payload`. Since `companies[]` now contains `trigger_summary`, the EventFold handler already receives trigger data when it processes the intel import — no new endpoint is needed.

The EventFold `import_prospect_intel` command must be updated to read the new `trigger_summary` field from each company entry and store it as `TriggerEventRecord[]` on the `IntelCompanyRecorded` event.

**Backward compatibility:** `trigger_summary` is `null`-safe. Companies processed before PRD-19 was deployed will have `trigger_summary: null` in their stored events. The "Signals" tab shows "No trigger data for this intel session" when `trigger_events` is empty.

---

## Cost Analysis

| Phase | Model | Tool | Cost per company | Notes |
|---|---|---|---|---|
| Phase 0: Pre-qual | Haiku | — | $0.0002 | Existing |
| Phase 1: Company scan | Haiku | web_search | $0.007 | Existing |
| Phase 2: ICP synthesis | Opus | — | $0.10 | Existing |
| Phase 3a: People search | Apollo API | — | $0.000 | Plan credit, no per-call cost |
| Phase 3a: Person enrichment | Haiku | web_search | $0.0005 | Existing (PRD-10) |
| **Phase 3b: Trigger detection** | **Haiku** | **web_search** | **$0.002** | **NEW — this PRD** |
| EmailFold Phase 1 | Haiku | — | $0.003 | Existing |
| EmailFold Phase 2 | Sonnet | — | $0.005 | Existing |
| EmailFold Phase 2b | Sonnet | — | $0.007 | Existing (PRD-14) |
| **Total per company** | | | **~$0.125** | Up from ~$0.123 (PRD-10 baseline) |

**Phase 3b adds $0.002 per company.** On a 20-company session, this is $0.04. The cost is negligible relative to the ROI: industry benchmarks for trigger-based outreach show 2–5× reply rate improvement. If one sequence converts a deal worth $5,000, the $0.04 trigger detection cost has an effective ROI of ~125,000×.

**Phase 3b cost breakdown:**

Phase 3b makes 3 web searches in a single Haiku call (the prompt instructs 3 targeted searches). Each Haiku call with web_search tool use costs approximately:
- Input tokens: ~600 (prompt) + ~800 (search results) = ~1,400 tokens = $0.00035
- Output tokens: ~300 (JSON response) = $0.00015
- Web search tool: ~3 searches × $0.005 each (Anthropic web search pricing) ≈ $0.015 per call

Wait — web search pricing is $0.005 per search. 3 searches = $0.015. Adjusted total per company for Phase 3b: **~$0.016**. This raises the full session cost by $0.32 on 20 companies. Still negligible for the value delivered.

**Revised total per company including web search cost:** ~$0.138

**Full 20-company session cost:** ~$2.76

---

## Implementation Notes for Senior Developer

### Files Changed in ProspectFold

| File | Change |
|---|---|
| `prospect-crafter.jsx` | Add `detectTriggersWithFallback()`, `computeTimingScore()`, `toLabel()` functions; update `enrichCompany()` to run Phase 3b concurrently with Phase 3a; add trigger-related state to company result objects |
| `prospect-crafter.jsx` (UI) | Add `TriggerBadge` component; update company card JSX to render badge + timing score + recommended opener; add trigger drawer component |
| `prospect-crafter.jsx` (sort) | Update company sort logic to apply timing score bonus |
| `prospect-crafter.jsx` (phase loading) | Add Phase 3b loading state to per-company progress indicator |
| `src/lib/anthropic.js` (or equivalent) | Add `detectTriggers()` function with full prompt template; add `computeTimingScore()` and `toLabel()` utilities (or move to shared utils) |

### Files Changed in EventFold

| File | Change |
|---|---|
| `src/domain/prospect_intel.rs` | Add `TriggerEventRecord` struct; add `trigger_events`, `timing_score`, `timing_label`, `recommended_opener` fields to `IntelCompanyRecorded` event |
| `src/commands.rs` | Add `get_trigger_signals_for_company` command |
| `src/lib.rs` | Register `get_trigger_signals_for_company` in `invoke_handler!` |
| `src-frontend/src/api/types.ts` | Add `TriggerEventRecord`, `TriggerSignalsOutput` types |
| `src-frontend/src/api/queries.ts` | Add `useGetTriggerSignals(companyId)` query hook |
| `src-frontend/src/components/company/CompanyDetail.tsx` | Add "Signals" tab; render `TriggerSignalsOutput` as timeline |

### Files Changed in EmailFold

| File | Change |
|---|---|
| `email-crafter.jsx` | Update Phase 2 prompt builder to inject trigger context (subject line guidance, recommended opener, angle bias); update Phase 2b sequence prompt to use trigger-adjusted `day_offset` values |
| `src/lib/foxworks-api-client.js` | No change — trigger data arrives embedded in the existing company payload |

---

## PRD-00 Updates

### New Tauri IPC Command

Add to the PRD-00 command inventory (PRD-10 section):

| Command | Signature | Notes |
|---|---|---|
| `get_trigger_signals_for_company` | `(company_id: String) → Option<TriggerSignalsOutput>` | Returns trigger events from most recent ProspectIntel session |

**Updated total: 30 new IPC commands** (was 29 in PRD-00)

### No New Tauri Events

Trigger data is query-pull (via `get_trigger_signals_for_company`), not push. The existing `intel-imported` event already triggers query cache invalidation for the Signals tab.

### No New API Endpoints

Trigger data flows through the existing `/api/intel` endpoint embedded in the `ProspectIntelV2Payload`. No new axum routes required.

---

## Sorting and Prioritization in the ProspectFold Queue

The ProspectFold → EventFold queue (the company list the SDR works through in EmailFold) should surface hot companies first. When EventFold receives the intel payload and creates company records, it stores the `timing_score` on the company record. The EmailFold queue query sorts by:

```
ORDER BY timing_score DESC, icp_score DESC, created_at DESC
```

This means the SDR opens EmailFold and immediately sees the highest-ROI companies at the top — the ones where a trigger event has just occurred and the window is open.

---

## Handling Apollo Data as a Trigger Supplement

Apollo's organization object (already fetched in Phase 3a / PRD-10) contains several fields that provide trigger signal directly without a web search:

```javascript
// Fields to inspect on the Apollo org object (already in memory from Phase 3a):
const apolloTriggerSignals = {
  latest_funding_stage: company.latest_funding_stage,   // "Series A", etc.
  last_funding_at: company.last_funding_at,              // ISO date
  last_funding_amount: company.last_funding_amount,      // USD
  num_employees: company.num_employees,
  job_listings_count: company.job_listings_count,
  technologies: company.technologies,                   // array of { name, category }
  news: company.news,                                   // array of recent news items
};
```

Pass these Apollo-derived signals into the Phase 3b Haiku prompt as a **pre-enrichment context block**. This reduces the number of web searches Haiku needs to perform (and thus cost), because Apollo has already given us baseline funding and headcount data.

Updated prompt structure:

```
APOLLO DATA (already available — no need to search for these):
Funding stage: ${apolloTriggerSignals.latest_funding_stage ?? 'unknown'}
Last funding date: ${apolloTriggerSignals.last_funding_at ?? 'unknown'}
Last funding amount: $${apolloTriggerSignals.last_funding_amount ?? 'unknown'}
Employees: ${apolloTriggerSignals.num_employees ?? 'unknown'}
Open jobs: ${apolloTriggerSignals.job_listings_count ?? 'unknown'}
Technologies: ${apolloTriggerSignals.technologies?.map(t => t.name).join(', ') || 'none listed'}
Apollo news: ${apolloTriggerSignals.news?.slice(0, 3).map(n => n.title).join(' | ') || 'none'}

WEB SEARCH INSTRUCTIONS (only search for what Apollo does not already tell you):
1. If funding data above is present and within 90 days, skip the funding search.
2. Search for new executive hires not visible in the Apollo data.
3. Search for tech migration signals not visible in the technologies list.
```

When Apollo's `last_funding_at` is within 90 days and the round is Series A+, create the funding trigger event directly from Apollo data — no web search needed. This reduces Phase 3b to 1–2 web searches in many cases, cutting cost by ~33%.

---

## Recency Weight Decay: Technical Specification

The recency weight is applied at render time and at timing score computation time. It is stored as-computed at detection time (`detected_at`) but should be **recomputed on read** to ensure that a trigger event stored 30 days ago is displayed with its current (decayed) weight, not its weight at detection time.

```typescript
// Recompute on read — do not trust stored recency_weight
const recomputeRecencyWeight = (event: TriggerEvent, today: Date): number => {
  if (!event.event_date) return 1.0; // no date = treat as current
  const eventDate = new Date(event.event_date);
  const ageDays = Math.floor((today.getTime() - eventDate.getTime()) / (1000 * 60 * 60 * 24));
  return Math.max(0, 1 - (ageDays / 90));
};

// Applied in EventFold when reading signals for display:
const signalsWithCurrentWeights = signals.events.map(e => ({
  ...e,
  recency_weight: recomputeRecencyWeight(e, new Date()),
  age_days: computeCurrentAgeDays(e.event_date),
}));

// And recompute timing_score from current weights:
const currentTimingScore = computeTimingScore(signalsWithCurrentWeights);
```

This means a company that was "hot" when intel was generated 30 days ago will show a lower timing score today — correctly reflecting that the window has aged. The SDR working through a stale batch will see aging trigger scores and understand that these companies need to be re-run.

**Stale intel warning:** If the intel session is more than 45 days old and the company's original timing_label was "hot" or "warm," display a warning in the Signals tab:

```
⚠ Intel is 52 days old. Trigger events may have aged out.
  Original timing score: 94 → Current recomputed score: 41
  [Re-run ProspectFold for this company]
```

---

## Out of Scope (v1)

- **Real-time monitoring:** This is a point-in-time scan run at Phase 3 time. No background polling or webhook-based trigger updates.
- **BuiltWith API integration:** BuiltWith requires a paid API key. v1 uses web search to detect tech migrations. Add BuiltWith as an optional enrichment provider in v2 when budget allows.
- **Crunchbase API direct integration:** v1 uses Perplexity web search to surface Crunchbase data. Direct Crunchbase API access (requires paid subscription) is a v2 enhancement.
- **LinkedIn scraping:** All LinkedIn signals are inferred from public search results only. No scraping, no LinkedIn API.
- **Trigger alerts / push notifications:** EventFold does not push "this company just raised funding" alerts. All trigger data is batch-detected at scan time.
- **Custom trigger type definitions:** v1 supports the five trigger types defined above. User-configurable trigger types are a future enhancement.
- **Historical trigger tracking across multiple intel runs:** v1 shows triggers from the most recent run only. Multi-run signal history is a v2 enhancement (requires ProspectIntel aggregate versioning from PRD-05).

---

## Success Metrics

| Metric | Target | Measurement |
|---|---|---|
| % of companies with at least one trigger detected | > 50% (ICP-matching companies in ProspectFold usually have signal) | Count from intel sessions |
| % of "hot" companies that are in an actual buying window (validation) | > 60% (measured by reply rate for hot vs cold) | A/B analysis at 30 days |
| Reply rate improvement: hot trigger vs no trigger | > 2× | EventFold sequence analytics (PRD-18) |
| Phase 3b generation time per company | < 5 seconds (concurrent with Phase 3a — net zero impact) | Client-side timing |
| Phase 3b failure rate (Haiku errors) | < 2% | Error logging in ProspectFold |
| SDR override rate (changes recommended opener) | < 30% (opener is good enough to use as-is) | Track in EmailFold history |

---

## Open Questions

1. **BuiltWith API:** Do we have a BuiltWith API key? If yes, integrate in v1 for tech migration signals. If no, web search fallback is sufficient.

2. **Apollo `news` field reliability:** Apollo's organization `news` array is often sparse or empty for smaller companies. Should Phase 3b always run web search regardless of Apollo news availability, or only if Apollo news is empty? Recommendation: always run web search — Apollo news is supplementary context, not a replacement for real-time search.

3. **Timing score effect on sequence automation:** Should `timing_label = "hot"` trigger automatic sequence sending (skip the Draft status and go directly to Scheduled) in EventFold's automation layer (PRD-17)? This would require a new flag on the email sequence payload. Recommend: no for v1. Automation without human review is high-risk. Surface the hot label prominently, let the SDR act.

4. **Trigger expiry in EventFold:** When a company's most recent intel is > 90 days old, all trigger events have aged out (recency_weight → 0). Should EventFold hide the Signals tab, show it as fully decayed, or show a "re-run required" state? Recommendation: show decayed scores with the stale intel warning (defined above).

5. **Multiple intel runs for the same company:** If ProspectFold runs the same company twice, EventFold creates a new `ProspectIntel` session. The Signals tab should show triggers from the most recent session. The `get_trigger_signals_for_company` command should always return the most recent session's data, ordered by `recorded_at` descending.
