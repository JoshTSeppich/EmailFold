# PRD-20 — Job Posting Intelligence: The Organizational X-Ray
**Version:** 1.0
**Date:** 2026-03-11
**Author:** Foxworks / Claude Architecture Session
**For:** ProspectFold owner + EmailFold owner
**Priority:** P1 — Organizational Intelligence layer
**Depends on:** PRD-10 (contact confidence scoring), PRD-19 (trigger event timing score)

---

## The Thesis

Job postings are the most honest thing a company publishes.

Marketing copy is polished. Press releases are spin. The "About Us" page was written by the communications team. But a job posting is written by the people who actually own the problem — they describe the pain in their own words, list the technologies they need help with, and reveal exactly which organizational gaps they're trying to fill.

A company posting 5 "Senior Data Engineer" roles with requirements for "building real-time data pipelines at scale" is not being cagey about their pain. They're announcing it publicly to anyone who looks.

Most outbound teams never look.

This PRD defines **Phase 3c: Job Posting Scan** — a new sub-phase that runs in parallel with Phase 3a (Apollo People Search from PRD-10) and Phase 3b (Trigger Events from PRD-19), turning every company's public job board into a structured organizational intelligence report.

---

## Problem

The current pipeline produces company-level signals (Phase 2: ICP synthesis, tech stack guesses from web scans) and person-level signals (Phase 3a: contact discovery). What it does not produce is **organizational-level signals** — the kind that tell you:

- Which internal department owns the budget problem you solve
- Whether the company is in a build, scale, or fix phase right now
- What technologies they actually use (not what their marketing site mentions)
- How urgent the pain is (a 60-day-old open role means they're struggling to fill it)
- Who specifically reports to whom, disambiguating organizational ownership without an org chart

Without this layer, EmailFold generates emails that say things like "I noticed Acme Corp is a fast-growing engineering team and thought you might be interested in..." — technically accurate, but not demonstrably informed.

With this layer, EmailFold generates emails that say "Saw Acme is hiring 4 Senior Data Engineers with Kafka/Spark requirements. That usually means pipeline reliability at scale — exactly the problem we solve."

The difference is not a template change. The content is derived from what actually appears in their job postings.

---

## Analytical Framework: What Job Postings Reveal

### Organizational Priorities

Which departments are growing tells you where budget is flowing. The composition of open roles is a real-time org chart signal that predates any press release about strategic priorities.

**Mapping patterns to priorities:**

| Posting Pattern | Organizational Signal |
|---|---|
| Engineering-heavy, no sales roles | Product-led growth; budget owners are in Engineering |
| Platform engineering + SRE cluster | Scaling infrastructure; pain is reliability or deployment velocity |
| Multiple "Head of" roles in one dept | Leadership maturity phase; new leaders establishing priorities |
| Data Engineering + Analytics cluster | Moving from ad hoc reporting to data infrastructure |
| DevOps + Security cluster | Compliance or reliability initiative underway |
| Sales + Solutions Engineering cluster | Top-of-funnel scaling; looking to close more deals faster |
| Customer Success + Support cluster | Post-sale retention problem; churn or onboarding pain |

### Tech Stack (From Requirements)

Job requirements are an honest technology inventory. BuiltWith detects what's on a marketing page. Job postings reveal what engineers actually work with every day.

"Must know Kafka, Spark, and dbt" = their actual data stack.
"Experience with k8s and Terraform" = their infrastructure stack.
"Familiar with Snowflake or BigQuery" = their warehouse.
"GraphQL and React preferred" = their product stack.

This is often more accurate than any enrichment tool because it reflects technologies actively in use — the posting only asks for experience with what the team needs help maintaining or extending.

### Organizational Pain (From Role Description Body)

The pain is embedded in the job description body, not the requirements list. Common language patterns and what they signal:

| Language Pattern | Pain Signal |
|---|---|
| "building from scratch" / "greenfield" | Pre-architecture phase; they have a blank slate |
| "improving reliability of existing systems" | Tech debt is causing incidents; reliability pain |
| "scaling our infrastructure to [N]× traffic" | Growth-induced capacity problems |
| "unifying data across [N] legacy systems" | Integration or migration pain |
| "our current tools can't keep up" | Existing vendor is failing them |
| "work cross-functionally with 5+ teams" | Siloed tooling; coordination overhead |
| "be the first [role] at the company" | Category-defining hire; high budget authority but undefined scope |
| "mentor junior engineers" | The senior talent gap is the problem they can't solve by hiring |
| "partner with the business to define requirements" | Engineering and business are misaligned; translation layer missing |

### Who Owns the Problem

Reporting structure in job postings is a free org chart lookup. If a posting says the role "reports to the VP of Engineering," the VP of Engineering owns the problem. If it says "work closely with the Head of Data," the Head of Data is the internal champion.

This data:
1. Confirms or corrects the Apollo-found contact from Phase 3a
2. Identifies the champion (who uses the solution) vs. the decision maker (who approves budget)
3. Surfaces contacts that never appear in Apollo because they were hired recently or have non-standard titles

### Timing Signal

Posting age is a proxy for pain urgency.

- **Fresh post (< 14 days):** They just recognized the problem. Pain is acknowledged but not yet critical. Good time to introduce a solution.
- **Active post (14–60 days):** Actively trying to hire. Pain is real and budgeted. Good time to offer the solution.
- **Old post (> 60 days):** Struggling to fill the role. The pain is compounding. The hire they need doesn't exist or won't join. This is the highest-intent signal in the dataset — they need an alternative to hiring.

A company that has posted the same senior data engineering role for 90 days with no hire is not a cold prospect. They are a buyer who hasn't found the right solution yet.

---

## Implementation: Phase 3c — Job Posting Scan

### Where This Fits in the Phase 3 Architecture

Phase 3 runs after Phase 2 (Opus ICP synthesis). All three sub-phases run in parallel:

```
Phase 2: ICP synthesis + angles (Opus) — COMPLETE
  |
  ├─→ Phase 3a: Apollo People Search           ─┐
  ├─→ Phase 3b: Trigger Events (PRD-19)         ├─→ Phase 3 synthesis → final intel payload
  └─→ Phase 3c: Job Posting Scan (THIS PRD)    ─┘
```

Phase 3c does not depend on Phase 3a or 3b. All three can be dispatched simultaneously for each company via `Promise.allSettled()`. Phase 3 synthesis runs only after all three complete (or time out at 12 seconds).

### Data Sources (In Priority Order)

**Source 1: LinkedIn Jobs API**

If the company has a LinkedIn organization ID (available from Apollo's `linkedin_uid` field), query the LinkedIn Jobs API filtered by company ID. This returns structured job data including posting date, department, description, and seniority level.

```
GET https://api.linkedin.com/v2/jobSearch?companyIds={linkedin_org_id}&count=25
```

Note: LinkedIn Jobs API access requires LinkedIn's Partner Program. See Open Questions section for access path discussion.

**Source 2: Greenhouse / Lever / Ashby Public APIs**

Many companies expose their job listings via public ATS APIs. These require no authentication and return structured job data.

```
# Greenhouse
GET https://boards-api.greenhouse.io/v1/boards/{company_token}/jobs?content=true

# Lever
GET https://api.lever.co/v0/postings/{company_identifier}?mode=json

# Ashby
GET https://api.ashbyhq.com/posting-api/job-board/{company_identifier}
```

The company token/identifier is typically the subdomain used for their careers page (e.g., `greenhouse.io/acme` → token is `acme`). This can be guessed from the company domain or discovered via web search.

**Source 3: Web Search Fallback (Haiku + web_search)**

For companies without a known ATS, use Haiku's `web_search` tool with targeted queries:

```
site:greenhouse.io "[company name]"
site:lever.co "[company name]"
site:ashbyhq.com "[company name]"
"[company name]" careers jobs (site:greenhouse.io OR site:lever.co OR site:ashbyhq.com)
"careers.[domain]"
"jobs.[domain]"
```

Haiku reads the returned pages and extracts job listing data from whatever format the careers page uses.

**Source Priority Logic:**

```typescript
const getJobPostings = async (company: CompanyContext): Promise<RawJobPosting[]> => {
  // Try sources in order, fall through on empty results or error

  // Source 1: LinkedIn Jobs API (if org ID available)
  if (company.linkedin_uid && LINKEDIN_API_KEY) {
    const jobs = await fetchLinkedInJobs(company.linkedin_uid);
    if (jobs.length > 0) return jobs;
  }

  // Source 2: ATS public APIs (try Greenhouse, Lever, Ashby in sequence)
  const atsResult = await tryAtsApis(company.domain, company.name);
  if (atsResult.length > 0) return atsResult;

  // Source 3: Web search fallback (always available via Haiku web_search)
  return await webSearchJobFallback(company.name, company.domain);
};
```

### The Phase 3c Haiku Prompt

Haiku receives up to 10 job posting summaries per company. Each summary is: title + department + posting_date + key requirements (up to 5) + description excerpt (first 200 chars).

The full prompt:

```
You are analyzing job postings from {{company_name}} ({{company_domain}}) to identify organizational signals relevant to a B2B sales qualification.

WHAT WE SELL:
{{icp_product_description}}

WHO WE TARGET:
{{icp_target_description}}

SALES ANGLES ALREADY IDENTIFIED (from web scan):
{{#each phase2_angles}}
- {{name}}: {{hook}}
{{/each}}

JOB POSTINGS ({{total_postings_found}} total; showing {{shown_count}} most relevant):
{{#each job_postings}}
---
TITLE: {{title}}
DEPARTMENT: {{department}}
POSTED: {{posting_age_days}} days ago
REQUIREMENTS: {{requirements_excerpt}}
DESCRIPTION: {{description_excerpt}}
{{/each}}

Analyze these postings and return ONLY valid JSON with this exact structure:

{
  "total_open_roles": <integer — total across all departments>,
  "relevant_role_count": <integer — roles in departments matching our ICP target>,
  "fastest_growing_dept": "<department with the most open roles>",
  "tech_stack_signals": [
    "<technology explicitly mentioned in job requirements — e.g. 'Kafka', 'dbt', 'Terraform'>",
    ...
  ],
  "pain_indicators": [
    "<specific language from a job description revealing organizational pain — quote or close paraphrase — e.g. 'scaling real-time pipeline to 10× traffic'>",
    ...
  ],
  "organizational_priorities": [
    "<what this cluster of postings reveals they are building or solving — e.g. 'Building data infrastructure from scratch', 'Migrating off legacy monolith'>",
    ...
  ],
  "right_contact_clues": [
    "<reporting structure or ownership signal from job descriptions — e.g. 'Senior Data Engineer reports to VP of Data', 'Work closely with Head of Platform'>",
    ...
  ],
  "timing_signal": "<one of: urgent | active | passive>",
  "timing_signal_rationale": "<1 sentence explaining the timing classification>",
  "timing_score_contribution": <integer 0–30>,
  "recommended_angle_reinforcement": "<name of a Phase 2 angle that job postings confirm or strengthen, or null if no match>",
  "angle_reinforcement_evidence": "<1 sentence from job postings that supports the reinforced angle, or null>",
  "key_roles": [
    {
      "title": "<job title>",
      "department": "<department>",
      "posting_age_days": <integer>,
      "pain_excerpt": "<1 sentence from the description that reveals the specific pain this role is meant to solve>"
    }
  ]
}

CLASSIFICATION RULES for timing_signal:
- "urgent": oldest relevant post is > 60 days old (struggling to hire → pain is compounding)
- "active": most relevant posts are 14–60 days old (actively hiring, pain is budgeted)
- "passive": all relevant posts are < 14 days old (just starting to hire, pain newly recognized)
- If no relevant posts found: "passive" with timing_score_contribution of 0

CLASSIFICATION RULES for timing_score_contribution (0–30 points added to PRD-19 timing score):
- urgent: 20–30 points (scale with number of relevant open roles: more roles = more points)
- active: 10–20 points
- passive: 0–10 points
- 0 points if no relevant roles found

For tech_stack_signals: only include technologies explicitly named in requirements. Do not infer.
For pain_indicators: quote or closely paraphrase actual language from job descriptions. Do not summarize abstractly.
For right_contact_clues: only include if a specific reporting relationship or person is named in the postings.

Return ONLY the JSON object. No preamble, no markdown fences, no explanation.
```

### TypeScript Interface: Full Output Shape

```typescript
interface JobPostingIntelligence {
  // Aggregate counts
  total_open_roles: number;
  relevant_role_count: number;           // roles in departments matching ICP target
  fastest_growing_dept: string;          // department with most open roles

  // Technology signals extracted from requirements
  tech_stack_signals: string[];          // e.g. ["Kafka", "dbt", "Spark", "Postgres"]

  // Pain language extracted from job description bodies
  pain_indicators: string[];             // e.g. ["scaling real-time pipeline to 10× traffic"]

  // Organizational interpretation
  organizational_priorities: string[];   // e.g. ["Building data platform from scratch"]

  // Contact intelligence from reporting structure
  right_contact_clues: string[];         // e.g. ["Reports to VP of Data", "Head of Platform owns this"]

  // Timing classification
  timing_signal: "urgent" | "active" | "passive";
  timing_signal_rationale: string;       // 1-sentence explanation
  timing_score_contribution: number;     // 0–30 points, added to PRD-19 timing score

  // Angle reinforcement
  recommended_angle_reinforcement: string | null;  // name of a Phase 2 angle
  angle_reinforcement_evidence: string | null;     // quote from postings

  // Individual role breakdowns (top 5 most relevant)
  key_roles: Array<{
    title: string;
    department: string;
    posting_age_days: number;
    pain_excerpt: string;               // 1 sentence revealing the specific pain
  }>;

  // Metadata
  source: "linkedin" | "greenhouse" | "lever" | "ashby" | "web_search";
  postings_analyzed: number;
  fetched_at: string;                   // ISO timestamp
}
```

### Raw Job Posting Shape (Pre-Haiku)

```typescript
interface RawJobPosting {
  title: string;
  department: string | null;
  description: string;                   // full text, will be truncated in prompt
  requirements: string | null;           // extracted requirements section if parseable
  posting_date: string | null;           // ISO date string or null if unknown
  posting_age_days: number | null;       // computed from posting_date; null if unknown
  url: string;
  source: "linkedin" | "greenhouse" | "lever" | "ashby" | "web_search";
}
```

### Haiku Call Implementation

```typescript
const scanJobPostings = async (
  company: CompanyContext,
  phase2Angles: SalesAngle[],
  icpContext: IcpContext
): Promise<JobPostingIntelligence | null> => {
  const rawPostings = await getJobPostings(company);

  if (rawPostings.length === 0) {
    return null; // No postings found — handled gracefully downstream
  }

  // Sort by relevance: ICP-matching departments first, then by posting age (oldest first)
  const sortedPostings = sortPostingsByRelevance(rawPostings, icpContext.target_departments);

  // Take top 10 for the prompt, truncate descriptions to 200 chars each
  const promptPostings = sortedPostings.slice(0, 10).map(p => ({
    title: p.title,
    department: p.department || "Unknown",
    posting_age_days: p.posting_age_days ?? "Unknown",
    requirements_excerpt: p.requirements
      ? p.requirements.slice(0, 300)
      : extractRequirementsSection(p.description).slice(0, 300),
    description_excerpt: p.description.slice(0, 200),
  }));

  const prompt = buildJobScanPrompt({
    company_name: company.name,
    company_domain: company.domain,
    icp_product_description: icpContext.product_description,
    icp_target_description: icpContext.target_description,
    phase2_angles: phase2Angles,
    job_postings: promptPostings,
    total_postings_found: rawPostings.length,
    shown_count: promptPostings.length,
  });

  const response = await anthropic.messages.create({
    model: "claude-haiku-3-5",
    max_tokens: 1200,
    tools: [{ type: "web_search_20250305", name: "web_search" }],
    messages: [{ role: "user", content: prompt }],
  });

  const textContent = response.content
    .filter(b => b.type === "text")
    .map(b => b.text)
    .join("");

  const intel: JobPostingIntelligence = JSON.parse(extractJSON(textContent));

  return {
    ...intel,
    source: rawPostings[0]?.source ?? "web_search",
    postings_analyzed: promptPostings.length,
    fetched_at: new Date().toISOString(),
  };
};
```

### Graceful Degradation on No Results

If `getJobPostings()` returns an empty array (company has no public job board or all sources fail):

```typescript
const NULL_JOB_INTEL: JobPostingIntelligence = {
  total_open_roles: 0,
  relevant_role_count: 0,
  fastest_growing_dept: "unknown",
  tech_stack_signals: [],
  pain_indicators: [],
  organizational_priorities: [],
  right_contact_clues: [],
  timing_signal: "passive",
  timing_signal_rationale: "No public job postings found.",
  timing_score_contribution: 0,
  recommended_angle_reinforcement: null,
  angle_reinforcement_evidence: null,
  key_roles: [],
  source: "web_search",
  postings_analyzed: 0,
  fetched_at: new Date().toISOString(),
};
```

This shape is valid and safe to pass downstream — downstream consumers check `relevant_role_count > 0` before using job signals.

---

## Updated ProspectIntelPayload Shape

Phase 3c adds `job_posting_intel` to the existing intel payload. This is an additive change — no existing fields are modified.

```typescript
// Added to the existing company-level intel object
// (the object that already contains recommended_contact from PRD-10)

interface CompanyIntelV3 extends CompanyIntelV2 {
  // From PRD-10
  recommended_contact: RecommendedContact | null;

  // NEW — from this PRD
  job_posting_intel: JobPostingIntelligence | null;

  // Updated from PRD-19: timing_score now includes job posting contribution
  timing_score: number;                  // 0–100, now sum of PRD-19 + job posting contribution
  timing_score_breakdown: {
    trigger_events: number;              // 0–70 (PRD-19)
    job_posting: number;                 // 0–30 (this PRD)
  };
}
```

The `timing_score` field existing in PRD-19 is extended: it now incorporates `job_posting_intel.timing_score_contribution` as an additive component. The max score remains 100 (70 from trigger events + 30 from job postings).

---

## Integration 1: Contact Confidence Scoring (PRD-10 Feedback Loop)

PRD-10 produces a `RecommendedContact` with a `confidence` field (0–1). Phase 3c can update this confidence score based on what job postings reveal about the contact.

### Contact Confirmation Paths

**Path A — Confirmation (confidence boost):**

If a job posting says "reports to VP of Engineering" and the Apollo-found contact is the VP of Engineering, confidence increases.

```typescript
const applyJobIntelToContactConfidence = (
  contact: RecommendedContact,
  jobIntel: JobPostingIntelligence
): RecommendedContact => {
  if (!jobIntel || jobIntel.right_contact_clues.length === 0) return contact;

  let confidenceDelta = 0;
  const clues = jobIntel.right_contact_clues;

  for (const clue of clues) {
    const clueNormalized = clue.toLowerCase();
    const titleNormalized = contact.title.toLowerCase();

    // Exact title match in a reporting clue → strong confirmation
    if (clueNormalized.includes(titleNormalized)) {
      confidenceDelta += 0.15;
    }

    // Partial match (e.g., "VP" present in both) → weak confirmation
    const titleWords = titleNormalized.split(/\s+/);
    const matchCount = titleWords.filter(w => w.length > 3 && clueNormalized.includes(w)).length;
    if (matchCount >= 2) {
      confidenceDelta += 0.08;
    }
  }

  return {
    ...contact,
    confidence: Math.min(1.0, contact.confidence + confidenceDelta),
    confidence_signals: [
      ...(contact.confidence_signals || []),
      ...clues.map(c => `Job posting: ${c}`),
    ],
  };
};
```

**Path B — Correction (contact override):**

If a job posting says "this role reports to the Head of Platform Engineering" but the Apollo-found contact is the VP of Engineering, the job posting is flagging a better contact. Surface this as a warning in the UI.

```typescript
// Detect potential contact mismatch
const detectContactMismatch = (
  contact: RecommendedContact,
  jobIntel: JobPostingIntelligence
): string | null => {
  for (const clue of jobIntel.right_contact_clues) {
    // If the clue mentions a title that is NOT our contact's title
    // and the mentioned title sounds more directly relevant
    const mentionedTitle = extractTitleFromClue(clue); // e.g. "Head of Platform Engineering"
    if (mentionedTitle && !titlesMatch(mentionedTitle, contact.title)) {
      return `Job posting suggests "${mentionedTitle}" may own this problem (clue: "${clue}")`;
    }
  }
  return null;
};
```

**Path C — Contact Discovery (Apollo miss):**

Occasionally a job posting is written or signed by a hiring manager not in Apollo's database. The `right_contact_clues` array may contain a specific name. Surface this as an additional fallback contact option.

```typescript
// If a clue contains a person's name (proper noun + title pattern)
// add it as a fallback_contact suggestion
const extractContactFromClue = (clue: string): Partial<FallbackContact> | null => {
  // Pattern: "Posted by Jane Smith, Head of Platform"
  // Pattern: "Direct manager: Sarah Chen, VP of Data Engineering"
  const namePattern = /([A-Z][a-z]+ [A-Z][a-z]+),?\s+((?:VP|Head|Director|Manager|Lead) of [\w\s]+)/;
  const match = clue.match(namePattern);
  if (!match) return null;
  return { name: match[1], title: match[2], source: "job_posting_clue" };
};
```

The full updated `RecommendedContact` interface from PRD-10:

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
  confidence: number;                   // 0–1, now updated by Phase 3c
  confidence_signals: string[];         // NEW: what contributed to confidence score
  contact_mismatch_warning: string | null; // NEW: from Phase 3c path B
  fallback_contacts: Array<{
    name: string;
    title: string;
    linkedin_url: string | null;
    source: "apollo" | "job_posting_clue"; // NEW: source field
  }>;
  enrichment_source: "apollo" | "web_only" | "manual";
}
```

---

## Integration 2: EmailFold Phase 2 Prompt Injection

The key outputs from `JobPostingIntelligence` that flow into EmailFold's Phase 2 prompt are:
- `pain_indicators` — specific language from job descriptions
- `tech_stack_signals` — technologies they explicitly need
- `organizational_priorities` — what they're building or solving
- `recommended_angle_reinforcement` + `angle_reinforcement_evidence` — which Phase 2 angle has job posting confirmation

### EmailFold Phase 2 Prompt Addition

The existing Phase 2 prompt already receives company intel and person hooks (from PRD-10). This PRD adds a `JOB POSTING INTELLIGENCE` block:

```typescript
// In EmailFold Phase 2 prompt construction
// (added after the PERSON-SPECIFIC HOOKS block from PRD-10)

const jobPostingBlock = (jobIntel: JobPostingIntelligence | null): string => {
  if (!jobIntel || jobIntel.relevant_role_count === 0) return '';

  const lines: string[] = [
    '',
    'JOB POSTING INTELLIGENCE (derived from their public job board — use this to make the email feel informed):',
  ];

  if (jobIntel.pain_indicators.length > 0) {
    lines.push(`PAIN SIGNALS (their own words from job descriptions):`);
    jobIntel.pain_indicators.slice(0, 3).forEach(p => lines.push(`  - "${p}"`));
  }

  if (jobIntel.tech_stack_signals.length > 0) {
    lines.push(`TECH STACK (from job requirements): ${jobIntel.tech_stack_signals.join(', ')}`);
  }

  if (jobIntel.organizational_priorities.length > 0) {
    lines.push(`ORGANIZATIONAL PRIORITIES (what they're building):`);
    jobIntel.organizational_priorities.slice(0, 2).forEach(p => lines.push(`  - ${p}`));
  }

  if (jobIntel.recommended_angle_reinforcement) {
    lines.push(`CONFIRMED ANGLE: "${jobIntel.recommended_angle_reinforcement}" is confirmed by job posting evidence.`);
    if (jobIntel.angle_reinforcement_evidence) {
      lines.push(`  Evidence: "${jobIntel.angle_reinforcement_evidence}"`);
    }
  }

  if (jobIntel.relevant_role_count > 0) {
    lines.push(`OPEN RELEVANT ROLES: ${jobIntel.relevant_role_count} roles in target department`);
    lines.push(`HIRING TIMING: ${jobIntel.timing_signal.toUpperCase()} — ${jobIntel.timing_signal_rationale}`);
  }

  lines.push('');
  lines.push('INSTRUCTION: Reference the job posting evidence naturally in the email. Do not say "I saw your job posting." Instead, interpret what the postings reveal — e.g. "looks like you\'re scaling your data pipeline right now" or "seems like you\'re in the middle of a major platform migration."');

  return lines.join('\n');
};
```

### Before vs. After: Email Output Quality

**Before job posting intelligence:**

> "Hi Jane — we help engineering teams at companies like yours streamline their data infrastructure. Would love to show you what we've built for similar teams."

**After job posting intelligence:**

> "Hi Jane — saw Acme is hiring 4 Senior Data Engineers with Kafka and Spark requirements. That pattern usually means pipeline reliability at scale — specifically the gap between what your current infrastructure handles and what the business is asking it to handle. That's the exact problem we solve, and we typically close it in 6–8 weeks without expanding headcount."

The second email is not a template with fields filled in. Every specific claim is derived from what Haiku found in their actual job postings. The SDR did not research this manually.

---

## Integration 3: Timing Score Composition (PRD-19 Coordination)

PRD-19 defines a `timing_score` (0–70) built from trigger events (funding rounds, leadership changes, press coverage). This PRD adds the job posting component (0–30).

The final timing score is the sum, capped at 100:

```typescript
const computeCompanyTimingScore = (
  triggerEventScore: number,           // 0–70, from PRD-19
  jobPostingContribution: number       // 0–30, from this PRD
): TimingScoreResult => {
  const total = Math.min(100, triggerEventScore + jobPostingContribution);

  return {
    score: total,
    label: total >= 75 ? "Hot" : total >= 50 ? "Warm" : "Cold",
    breakdown: {
      trigger_events: triggerEventScore,
      job_posting: jobPostingContribution,
    },
  };
};
```

**Timing score contribution logic:**

| Condition | Points |
|---|---|
| 1+ relevant roles posted > 60 days ago (urgent) | 20 base |
| 3+ relevant roles posted > 60 days ago | 25 |
| 5+ relevant roles posted > 60 days ago | 30 |
| 1+ relevant roles posted 14–60 days ago (active) | 12 |
| 3+ relevant roles posted 14–60 days ago | 18 |
| 1+ relevant roles posted < 14 days (passive) | 5 |
| No relevant roles found | 0 |

The `timing_score_contribution` value is set by Haiku directly in the JSON response (Haiku applies this rubric). The implementation can override with the formula above if Haiku's value is outside the expected range.

---

## UI: ProspectFold Company Cards

### Collapsed Card View

Each company card in the Phase 3 results shows a Job Posting Signal block below the existing ICP score and contact preview:

```
┌─ Acme Corp ────────────────────────────────────────────────────┐
│  acme.com  |  150 employees  |  ICP Score: 85  |  Timing: HOT │
│                                                                 │
│  Jane Smith — VP Engineering                                    │
│    "Posted about Postgres scaling 3w ago" · Promoted Jan 2026  │
│    jane@acme.com  [Override contact]                            │
│                                                                 │
│  JOB SIGNALS                                                    │
│  18 open roles  |  5 Data Engineering  |  3 Platform           │
│  "scaling real-time pipeline to 10× traffic"                    │
│  Stack: Kafka · Spark · dbt · Postgres                          │
│  Timing: URGENT (oldest relevant post: 47 days)                 │
│                                                                 │
│  Best angle: Technical Debt Automation  [confirmed by jobs]     │
│  [Generate Email]                                               │
└────────────────────────────────────────────────────────────────┘
```

The "confirmed by jobs" badge next to the angle indicates `recommended_angle_reinforcement` matches the best angle from Phase 3a.

### Expanded Job Roles View

Clicking the "JOB SIGNALS" section expands to show the 3 most relevant role entries:

```
┌─ Acme Corp — Job Posting Detail ───────────────────────────────┐
│                                                                 │
│  RELEVANT ROLES (5 of 18 total)                                 │
│  ──────────────────────────────────────────────────────────    │
│  Senior Data Engineer  |  Data Engineering  |  47 days ago     │
│    "We're scaling our real-time event pipeline from 50K to     │
│     500K events/second and need to rebuild the ingestion       │
│     layer — currently on Kafka 2.x, migrating to Kafka 3."    │
│                                                                 │
│  Staff Platform Engineer  |  Platform  |  31 days ago          │
│    "Own the reliability of our data infrastructure; current    │
│     SLA is 99.5% and the business requires 99.9%."             │
│                                                                 │
│  Data Engineering Manager  |  Data Engineering  |  22 days ago │
│    "Be the first engineering manager on the data team;         │
│     currently 4 ICs reporting directly to the VP of Data."    │
│                                                                 │
│  [Show all 5 relevant roles]  [Close]                          │
└────────────────────────────────────────────────────────────────┘
```

### Phase 3c Loading State

Phase 3c's progress is shown on the company card alongside Phase 3a and 3b:

```
Acme Corp:
  ✓ Phase 1: Company scan complete
  ✓ Phase 2: ICP analysis complete
  ⟳ Phase 3: Running in parallel...
    ✓ Phase 3a: Jane Smith (VP Engineering) found
    ✓ Phase 3b: Trigger events — 2 signals found
    ⟳ Phase 3c: Scanning job postings...
      → Found 18 open roles (Greenhouse)
      → Analyzing with Haiku...
    ✓ Phase 3c: 5 relevant roles · Stack: Kafka, Spark, dbt
  ✓ Phase 3 complete — Timing: HOT (82/100)
```

### Timing Score Display

The card header shows the combined timing score with a color indicator:

| Score Range | Label | Color |
|---|---|---|
| 75–100 | HOT | Red |
| 50–74 | WARM | Orange |
| 0–49 | COLD | Gray |

The breakdown tooltip (on hover over the timing label) shows:
```
Timing Score: 82 / 100
  Trigger Events: 52 pts (Series B announced, new CTO)
  Job Postings: 30 pts (5 relevant roles, oldest 47 days)
```

---

## Phase 3 Synthesis: Final Payload Assembly

After all three Phase 3 sub-phases complete (or time out), a synthesis step merges the results:

```typescript
const synthesizePhase3 = (
  phase3aResult: RecommendedContact | null,
  phase3bResult: TriggerEventIntelligence | null,   // from PRD-19
  phase3cResult: JobPostingIntelligence | null
): Phase3SynthesisOutput => {

  // Apply job posting intel to contact confidence
  let contact = phase3aResult;
  if (contact && phase3cResult) {
    contact = applyJobIntelToContactConfidence(contact, phase3cResult);
    const mismatchWarning = detectContactMismatch(contact, phase3cResult);
    contact = { ...contact, contact_mismatch_warning: mismatchWarning };
  }

  // Compose timing score
  const triggerScore = phase3bResult?.timing_score ?? 0;
  const jobScore = phase3cResult?.timing_score_contribution ?? 0;
  const timingScore = computeCompanyTimingScore(triggerScore, jobScore);

  // Determine best angle (job intel can override Phase 2's recommendation)
  const bestAngle = resolveAngle(
    phase3aResult?.best_angle,              // from person activity (3a)
    phase3cResult?.recommended_angle_reinforcement  // job intel confirmation (3c)
  );

  return {
    recommended_contact: contact,
    job_posting_intel: phase3cResult,
    trigger_event_intel: phase3bResult,
    timing_score: timingScore,
    best_angle: bestAngle,
    best_angle_is_confirmed: !!phase3cResult?.recommended_angle_reinforcement,
  };
};

// Angle resolution: job-confirmed angle takes priority, falls back to person-activity angle
const resolveAngle = (
  personActivityAngle: string | undefined,
  jobConfirmedAngle: string | null | undefined
): string => {
  if (jobConfirmedAngle) return jobConfirmedAngle;
  if (personActivityAngle) return personActivityAngle;
  return "general";
};
```

### Angle Override Rule

The job posting angle reinforcement can override the Phase 2 best angle selection when the evidence is strong. The rule is: if `recommended_angle_reinforcement` is non-null and it matches one of Phase 2's named angles, that angle is used as `best_angle` in the final payload, regardless of what Phase 3a's person activity scan recommended.

Rationale: job postings are forward-looking (the company is actively hiring to solve this problem now). Person activity (Phase 3a) may reflect past interests. When both signals exist, the active hiring signal is more predictive of current buying intent.

---

## EventFold Storage

`job_posting_intel` is stored on the `ProspectIntel` aggregate (the same aggregate that stores `recommended_contact` from PRD-10). No new aggregate type is needed.

```rust
// In src/aggregates/prospect_intel.rs — extend the ProspectIntel aggregate
// (additive change, existing fields unchanged)

pub struct ProspectIntelV3 {
    // ... existing fields from PRD-10 ...

    // NEW from this PRD:
    pub job_posting_intel: Option<JobPostingIntelligence>,
    pub timing_score: u8,                     // 0-100, composed timing score
    pub timing_score_breakdown: Option<TimingScoreBreakdown>,
}

pub struct JobPostingIntelligence {
    pub total_open_roles: u32,
    pub relevant_role_count: u32,
    pub fastest_growing_dept: String,
    pub tech_stack_signals: Vec<String>,
    pub pain_indicators: Vec<String>,
    pub organizational_priorities: Vec<String>,
    pub right_contact_clues: Vec<String>,
    pub timing_signal: String,               // "urgent" | "active" | "passive"
    pub timing_signal_rationale: String,
    pub timing_score_contribution: u8,       // 0–30
    pub recommended_angle_reinforcement: Option<String>,
    pub angle_reinforcement_evidence: Option<String>,
    pub key_roles: Vec<KeyRole>,
    pub source: String,
    pub postings_analyzed: u32,
    pub fetched_at: String,
}

pub struct KeyRole {
    pub title: String,
    pub department: String,
    pub posting_age_days: Option<u32>,
    pub pain_excerpt: String,
}

pub struct TimingScoreBreakdown {
    pub trigger_events: u8,
    pub job_posting: u8,
}
```

The EventFold Company Detail view (under the Intel tab) shows a "Job Signals" subsection alongside the existing "Trigger Events" subsection from PRD-19.

---

## Cost Model

Phase 3c adds one Haiku call per company. It runs in parallel with Phase 3a and 3b, so it does not increase wall-clock time for the Phase 3 step.

| Step | Model | Cost (per company) | Notes |
|---|---|---|---|
| Phase 0: Pre-qual | Haiku | $0.0002 | Existing |
| Phase 1: Company scan | Haiku | $0.0007 | Existing |
| Phase 2: ICP synthesis | Opus | $0.100 | Existing |
| Phase 3a: Apollo People Search | API | $0 (plan credit) | PRD-10 |
| Phase 3b: Person activity scan | Haiku | $0.0005 | PRD-10 |
| Phase 3b: Trigger Events | Haiku | $0.0020 | PRD-19 |
| **Phase 3c: Job Posting Scan** | **Haiku** | **$0.0020** | **This PRD** |
| Phase 3 total | — | $0.0045 | Under $0.006 budget |
| EmailFold Phase 1 | Haiku | $0.003 | Existing |
| EmailFold Phase 2 | Sonnet | $0.005 | Existing |
| **Total per company** | | **~$0.121** | |

**20-company session cost:** ~$2.42

The $0.002 estimate for Phase 3c assumes:
- 1 Haiku call with web_search tool, ~600 input tokens (job summaries) + ~300 output tokens (structured JSON)
- 1–2 web_search tool uses per company when falling back to Source 3
- Greenhouse/Lever/Ashby API calls: $0 (public, no auth required)
- LinkedIn Jobs API calls: $0 (included in partner plan) or bypassed in favor of web search

The $0.006 Phase 3 budget is maintained. All three Phase 3 sub-phases total $0.0045 per company.

---

## Files Changed

### ProspectFold (Electron + React 18)

| File | Change |
|---|---|
| `prospect-crafter.jsx` | Add Phase 3c dispatch in parallel with 3a/3b; add job intel to per-company state |
| `lib/job-posting-scanner.ts` | NEW: `getJobPostings()`, `tryAtsApis()`, `webSearchJobFallback()`, `scanJobPostings()` |
| `lib/job-posting-sources.ts` | NEW: LinkedIn Jobs, Greenhouse, Lever, Ashby API clients |
| `lib/phase3-synthesis.ts` | NEW: `synthesizePhase3()`, `applyJobIntelToContactConfidence()`, `detectContactMismatch()`, `computeCompanyTimingScore()`, `resolveAngle()` |
| `lib/types.ts` | Add `JobPostingIntelligence`, `RawJobPosting`, `KeyRole`, `TimingScoreBreakdown`, `Phase3SynthesisOutput`; extend `CompanyIntelV3` |
| `components/CompanyCard.jsx` | Add Job Signals block to collapsed card; add expanded roles view; add timing score badge |
| `components/Phase3Progress.jsx` | Add Phase 3c step to loading state display |

### EmailFold (Electron + React 18)

| File | Change |
|---|---|
| `email-crafter.jsx` | Call `jobPostingBlock()` when building Phase 2 prompt |
| `lib/prompt-builders.ts` | Add `jobPostingBlock()` function |
| `lib/types.ts` | Import `JobPostingIntelligence` (shared from a common types package or duplicated) |

### EventFold (Tauri + Rust)

| File | Change |
|---|---|
| `src/aggregates/prospect_intel.rs` | Add `JobPostingIntelligence`, `KeyRole`, `TimingScoreBreakdown` structs; extend `ProspectIntel` aggregate |
| `src/projections.rs` | Update `ProspectIntelView` projection to include job posting intel fields |
| `src/commands.rs` | Update `get_company_intel` command to return job_posting_intel |
| `src-frontend/src/api/types.ts` | Add `JobPostingIntelligence`, `KeyRole`, `TimingScoreBreakdown` interfaces |
| `src-frontend/src/components/company/CompanyDetail.tsx` | Add "Job Signals" subsection in Intel tab |

---

## Acceptance Criteria

- [ ] Phase 3c dispatches in parallel with Phase 3a and Phase 3b for every company in the results set
- [ ] Phase 3c attempts all three data sources in priority order: LinkedIn → ATS APIs → web search
- [ ] Haiku prompt includes company context, ICP description, Phase 2 angles, and up to 10 job posting summaries
- [ ] Haiku returns a valid `JobPostingIntelligence` JSON object; malformed responses log an error and return null
- [ ] `timing_score_contribution` is bounded 0–30; values outside this range are clamped
- [ ] Timing score shown on company card is the sum of PRD-19 trigger event score and Phase 3c job score, capped at 100
- [ ] Company card collapsed view shows: total open roles, relevant role count by department, top pain indicator, tech stack signals, timing label
- [ ] Clicking the Job Signals section expands to show up to 3 key roles with pain excerpts
- [ ] `right_contact_clues` from job intel are applied to update `RecommendedContact.confidence`
- [ ] Contact mismatch warning is surfaced in the UI when job intel suggests a different contact than Apollo found
- [ ] `job_posting_intel.pain_indicators`, `tech_stack_signals`, and `organizational_priorities` are injected into EmailFold Phase 2 prompt when non-empty
- [ ] EmailFold Phase 2 prompt injection includes the instruction to interpret postings naturally (not to say "I saw your job posting")
- [ ] Companies with no public job postings receive a null `job_posting_intel` and zero timing_score_contribution; downstream behavior is unaffected
- [ ] Phase 3c adds no more than $0.002 to per-company cost
- [ ] Phase 3c adds no latency to the user-visible Phase 3 duration (fully parallel)
- [ ] `job_posting_intel` is stored on the `ProspectIntel` aggregate in EventFold and visible in Company Detail

---

## Out of Scope

- Scraping LinkedIn's Jobs page directly without the LinkedIn Jobs API (ToS violation)
- Storing full job description text in EventFold (only structured intel, not raw content)
- Alerting the user when a company posts a new relevant job after the initial scan (real-time monitoring)
- Tracking whether the job was filled (no way to detect this reliably without ongoing polling)
- Verifying whether a job posting is still active vs. expired
- Parsing salary or compensation data from job postings
- Job posting volume as a standalone product feature (this is always Phase 3 pipeline enrichment, not a separate search)

---

## Open Questions for Senior Dev

**1. LinkedIn Jobs API access tier**

The LinkedIn Jobs API is available through LinkedIn's Marketing Developer Platform and Talent Solutions partner programs — it is not available on a standard API key. What is the current status of our LinkedIn API access? If we are not in the partner program, Source 1 is unavailable and we fall through to Source 2 immediately. The implementation should be designed so Source 1 is a clean optional path gated on `LINKEDIN_API_KEY` being present in the environment.

Alternative: LinkedIn job listings can be accessed through a search on `linkedin.com/jobs/search?company={id}` — but this is web scraping and subject to ToS enforcement. Do not implement this. If we don't have API access, skip LinkedIn entirely and rely on Greenhouse/Lever/Ashby + web search.

**2. ATS company token discovery**

Greenhouse, Lever, and Ashby tokens are usually the company's slug (e.g., `acme` for `greenhouse.io/acme`). This can be guessed from the company name, but guessing wrong returns a 404. The current approach (try the domain slug, then try common variations) will fail silently for companies whose ATS slug doesn't match their domain. Is there a better discovery mechanism — for example, checking `careers.[domain].com` for a redirect to a known ATS host? The `webSearchJobFallback()` path covers this case, but it adds ~2 seconds of latency. Recommendation: maintain a small lookup table of known company-to-ATS-slug mappings that gets populated over time as we successfully resolve companies.

**3. Rate limiting on career page scraping (web search fallback)**

The Haiku `web_search` tool makes external requests that can trigger rate limiting on Greenhouse's public job board endpoints. At concurrency 3 (PRD-08), we could be hitting `boards.greenhouse.io` 3 times per second across companies running in parallel. Greenhouse's public boards are intentionally public (no auth), but aggressive scraping may trigger 429 responses. Recommendation: add a 500ms jitter to Phase 3c dispatch when the source resolves to `web_search`, and add retry logic with exponential backoff (max 2 retries) for 429 responses.

**4. Companies with no public job postings**

Some companies — particularly bootstrapped, fully-staffed, or enterprise companies with internal hiring processes — have no public job board at all. These are not disqualified by the absence of postings (they may still be great prospects). The null-result handling described above returns a zero-contribution `JobPostingIntelligence` object. The question is: should absence of public postings be a signal in itself? A company with no open roles could mean: (a) fully staffed and stable, (b) hiring freeze, (c) using a private ATS. For now, treat it as neutral (no contribution to timing score). Revisit if pattern analysis reveals correlation between "no public postings" and low conversion rate.

**5. Job posting recency accuracy**

Greenhouse and Lever return `created_at` timestamps for postings. The LinkedIn Jobs API returns `listAt`. Web search fallback has no structured date — Haiku infers posting age from the page content ("posted 3 weeks ago" text if present, or null). How should we handle null `posting_age_days` in the prompt and in `timing_signal` classification? Recommendation: treat null age as "unknown" and exclude those postings from timing calculations, but still include them in tech stack and pain signal extraction.

**6. Department normalization**

Different companies name departments inconsistently: "Platform Engineering" vs. "Infrastructure" vs. "SRE" vs. "DevOps" all refer to overlapping domains. The ICP context includes `target_departments` — a list of department names the user cares about. Should Haiku normalize department names before counting relevant roles? Or should we provide a normalization map (e.g., "SRE → Platform", "DevOps → Platform") and apply it server-side before passing to Haiku? Recommendation: provide Haiku with both the raw department name and the ICP target departments list, and let Haiku classify each role as "relevant" or "not relevant" based on semantic similarity. This is more robust than a static normalization map.

**7. `recommended_angle_reinforcement` conflict with Phase 3a best angle**

The `resolveAngle()` function gives priority to the job-posting-confirmed angle over the person-activity angle. This is the right default (active hiring is a stronger current signal than past LinkedIn posts). But there may be cases where the person-activity angle is more compelling for this specific person even if the job posting confirms a different angle. Should the SDR be able to see both angles and choose? Consider adding a `angle_alternatives` field to the Phase 3 synthesis output that shows all candidate angles with their evidence sources, letting EmailFold display a "Choose angle" picker before Phase 2 generation.

---

## Success Metrics

- % of EmailFold-generated emails that reference a job posting signal: **> 60%** (companies with any public job board)
- Contact confidence improvement from Phase 3c: **+10–15 points average** for companies with clear reporting structure in job postings
- Timing score accuracy: validated against closed deals — companies scored HOT should close at 2× the rate of companies scored COLD (measure at 90 days)
- SDR time spent researching org structure per company: **0 minutes** (job posting intel replaces this entirely)
- Cost per company impact: **< $0.002 incremental** (Haiku call within budget)
- Phase 3 wall-clock time impact: **< 1 second** (parallel execution means no user-visible slowdown)
