# PRD-23 — The Three-Signal Framework: What Makes Foxworks Different
**Version:** 1.0
**Date:** 2026-03-11
**Author:** Foxworks / Claude Architecture Session
**For:** All engineers + founder
**Priority:** Foundation — read before implementing PRD-10, PRD-19, PRD-20, PRD-21, PRD-22
**Depends on:** PRD-10 (implements Signal 1), PRD-19 (Signal 2 triggers), PRD-20 (Signal 2 jobs), PRD-22 (synthesis)

---

## What This Document Is

This is not a feature spec. There are no acceptance criteria at the bottom, no files to change, no API schema to implement. Those documents exist elsewhere.

This document exists to answer a prior question: *why are we building what we're building, in the way we're building it?* The person-identification cluster — PRDs 10 through 22 — collectively defines a system for finding and scoring the right person to email at each company. But taken individually, each PRD reads as a feature request. Taken together, they express a model for outbound prospecting that is genuinely different from anything in the market.

That model needs to be named, explained, and defended — not because the architecture is controversial, but because every engineer who touches this system should understand the intellectual foundation underneath the code they're writing. The model is called the Three-Signal Framework.

If you're reading this before implementing any of PRD-10 through PRD-22: this is the context. Read it once, carefully. It will make every implementation decision downstream feel obvious rather than arbitrary.

---

## 1. The Problem with How Everyone Else Does It

The outbound sales tooling industry has spent fifteen years getting better at the wrong thing.

Apollo, ZoomInfo, Cognism, Lusha — these tools have invested enormous effort in making it easier to find people with the right title at companies that match your criteria. The search interfaces got more powerful. The databases got larger. The enrichment got richer. You can now find "VP Engineering at Series B SaaS companies with 51-200 employees, headquartered in North America, using Kubernetes, that have raised funding in the last 12 months" in under 30 seconds.

The result of all this progress: a global average cold email reply rate of 2-3%.

That number has not moved meaningfully in a decade. And it won't move — because the tools are solving the wrong problem.

The problem that Apollo and ZoomInfo actually solve is: **how do I build a list of people with the right title?** The problem that determines whether a cold email gets a reply is something else entirely. It's three things:

1. **Is this person in the right seat** to make or heavily influence this decision?
2. **Is something happening right now** that makes this person decision-ready — a budget cycle opening, an inflection point in the company's growth, a recent pain point surfacing?
3. **Has this specific person publicly signaled** that they care about the problem you solve?

These are not refinements of the title-matching problem. They are different questions. You can score 100 on structural fit — perfect title, right seniority, right company — and still be emailing someone who is completely locked into their existing vendor, whose company is in a cost-freeze, and who has shown no public indication they're thinking about your problem space. That person will not reply.

The reason outbound tooling is stuck at 2-3% reply rates is not that the databases are too small or the search UI too clunky. It's that the entire category is optimized around a metric — "did I find someone with the right title?" — that only weakly predicts reply rates.

The right metric is: **did I find the right person, at the right moment, who is already thinking about what I'm selling?**

This is what the Three-Signal Framework is built to measure.

---

## 2. The Three Signals

### Signal 1: Structural Fit — "Is this person in the right seat?"

Structural fit is title, seniority, and department. It answers the question: does this person's organizational role make them a plausible decision-maker or strong influencer for the purchase you're trying to initiate?

This signal is table stakes. Every tool does it. A structural fit score of 100 is necessary but nowhere near sufficient.

The limitations of structural fit alone are well understood but systematically ignored by the tooling category:

- A VP Engineering promoted two months ago likely has no budget authority yet and is still building political capital. The same title, six months earlier, is a different conversation.
- A Director of Data Science at a company that was recently acquired is likely in a planning freeze. The same title at a freshly funded Series B company has mandate and resources.
- A CTO who has been in the same role for four years at a company that hasn't changed its stack in three years is probably deeply committed to their existing vendors. The same title at a 3-year-old company that recently crossed 100 engineers is evaluating everything.

The title is the same in each pair. The structural fit score would be identical. The likelihood of a reply is completely different.

Signal 1 is implemented primarily through Apollo People Search (PRD-10). The ICP targeting model from ProspectFold Phase 2 maps to `TARGET_TITLES` and `seniority[]` filter parameters. This gives us the candidate pool. Signals 2 and 3 are what refine that pool into a ranked contact recommendation.

### Signal 2: Situational Fit — "Is something happening right now that makes this person decision-ready?"

Situational fit is the timing layer. It answers the question: does this person's current situation create urgency, openness, or mandate to evaluate new solutions?

The core insight here is that the same person is a fundamentally different prospect at different moments in their career and company trajectory. Situation is not a refinement of identity — it is, in many ways, the dominant variable.

Consider a VP Engineering named Marcus at a 150-person SaaS company. His structural fit for a developer tooling company is constant over time. But his situational fit varies enormously:

| Situation | What it means for prospecting |
|---|---|
| Week 3 of a new job, first VP role | Evaluating everything. Mandate to establish vision. No emotional attachment to existing tools. Probably already thinking "what do I change?" EXTREMELY HOT. |
| 3 months post-Series B, headcount doubling | Budget just opened. Infrastructure straining under growth. Board pressure to move fast. HOT. |
| 12 months post-Series B, stable team, no changes | Has already made his decisions. Locked in. Budget committed. COLD. |
| Company just announced layoffs | Cost freeze. Nobody is approving new vendor spend. COLD — but follow up in 6 months. |
| Just posted a job for 3 senior backend engineers | Growing, hiring, infrastructure pressure increasing. This is a leading indicator. HOT. |
| Company announced acquisition by a strategic buyer | Planning freeze. Decisions on hold. COLD. |

The same structural profile. Wildly different reply probability depending on when you reach him.

Situational signals come from two sources:

**Trigger events** (PRD-19): Job changes (the new-hire scenario is the single highest-conversion situational signal in outbound), funding announcements, acquisitions, leadership changes, product launches, conference announcements. These are detectable through Crunchbase, LinkedIn, and web monitoring.

**Job posting intelligence** (PRD-20): What a company is actively hiring tells you something job databases cannot. A company posting five "Senior Data Engineer (Kafka, Flink)" positions is under specific infrastructure pressure right now. A company posting "DevOps Lead — experience with incident management tooling required" has a pain point written into a public document. Job postings are organizational pain crystallized in job description format — they just require AI to read them systematically.

### Signal 3: Psychological Fit — "Has this specific person publicly signaled they care about this?"

Psychological fit is the rarest and highest-value signal. It answers the question: has this person already done the intellectual work of framing the problem you solve as a real, current priority?

When someone publishes a post about their team's struggle with database migrations, they are not just a relevant contact — they have already decided that the problem is worth their public attention. When someone gave a conference talk last year about organizational patterns in engineering teams, they have a framework for thinking about this space that your email can connect to rather than having to establish from scratch. When someone's recent activity shows a consistent preoccupation with infrastructure reliability, you are not pitching a category — you are offering a solution to someone who has already built the mental model of the problem.

The difference in email quality between "has psychological signal" and "no psychological signal" is not cosmetic. It changes the entire rhetorical posture of the email:

- **No psychological signal:** You must convince the person that the problem exists, that it matters to them, and that your solution is worth their time to evaluate. This is a three-stage persuasion problem. Most cold emails attempt all three in 150 words and fail at all three.
- **High psychological signal:** The problem is already real to them. You skip stage one and most of stage two. Your email can say: "I saw you wrote about [specific thing] — we've built exactly what you were describing as the missing piece." That's a one-stage persuasion problem. You just have to establish that your solution is worth evaluating.

The practical impact on reply rates is substantial. But until recently, accessing psychological signals at any scale was impossible.

Finding a person's public activity requires:
1. Knowing where to look (LinkedIn, personal blogs, conference talk archives, GitHub, Substack)
2. Actually reading what you find with enough comprehension to identify relevance to your specific value proposition — not just keyword matching
3. Synthesizing multiple signals into a concrete, usable personalization hook

This used to require 20-30 minutes per person. At any kind of volume, SDRs skip it. The emails go out generic. The reply rates stay at 3%.

AI changes this. Haiku can take a person's name, company, and role, run a targeted web search, read the results with genuine comprehension, and return 2-3 specific personalization hooks in under 3 seconds, at a cost of roughly $0.0005. This is the breakthrough that makes the Three-Signal Framework viable as a production system rather than a manual research methodology for enterprise SDRs working a very short list.

Psychological fit is implemented in PRD-22 (Psychological Signal Search + Three-Signal Score Synthesis). The web search capability that underlies it — `web_search_20250305` via Haiku — makes what was previously a human-hours-per-contact task into a sub-second, sub-cent operation.

---

## 3. Why the Combination Is Multiplicative, Not Additive

Each signal in isolation improves on the baseline. All three together produces a qualitatively different kind of email with qualitatively different reply rates.

Here is a model for how the signals combine. These are projected figures based on industry data for cold email personalization levels; they will be calibrated against actual Foxworks reply data as EventFold accumulates signal-attributed reply records.

| Structural | Situational | Psychological | What it means | Projected reply rate |
|---|---|---|---|---|
| Low | Low | Low | Wrong person, wrong time, irrelevant | 0.5% |
| High | Low | Low | Right person, wrong time, doesn't care | 2-3% |
| High | High | Low | Right person, right time, unaware | 6-9% |
| High | Low | High | Right person, wrong time, thinking about it | 7-10% |
| High | High | High | Right person, right time, already thinking about it | 15-25% |

The jump from `High + Low + Low` (the current state of most outbound tooling) to `High + High + High` is not a linear improvement. It is a 6-10x improvement in reply probability. The reason is that each signal addresses a different failure mode:

- **High structural** removes the "wrong person" failure: the email reaches someone who could plausibly care
- **High situational** removes the "wrong time" failure: the person has an open window to evaluate new solutions
- **High psychological** removes the "wrong framing" failure: the person doesn't need to be convinced the problem is real

When all three failure modes are removed, you're sending a relevant message to a relevant person at a relevant moment. At that point, the primary variable is just the quality of your solution and your email copy — both of which are things you control.

The email content changes qualitatively depending on which signals are present:

**High structural only:** Pitch the category. Open with the pain ("teams like yours often struggle with X"). Establish the problem before proposing the solution. This is the coldest possible email — you're doing all three stages of persuasion.

**High structural + high situational (new hire):** Connect your solution to their mandate. They're in "evaluate everything" mode. Lead with "given where you are in establishing your technical direction" rather than leading with a problem statement. They already feel the openness — meet them there.

**High structural + high situational (funding/growth):** Connect to the scaling inflection. They know growth creates infrastructure pressure — that's already top of mind for them after a raise. Lead with the scaling problem rather than the product.

**High structural + high psychological:** Validate the pain they've already named. Reference the specific thing they wrote or said. This is the most powerful rhetorical move available in cold email: "I saw you framed this as [their framing]. We built exactly that."

**All three high:** The email writes itself. The person is in the right seat, something is happening, and they've already said they care. The job of the email is just to introduce the solution clearly and ask for 20 minutes.

EmailFold's `email_modifier_prompt` (output of the Three-Signal Score Synthesis in PRD-22) carries this signal combination directly into the EmailFold sequence generation prompts. The generation model (Sonnet) receives not just company context and contact info but an instruction that says: "This person's dominant signal is situational (new hire, 6 weeks in). Lead with vision-establishment framing." Or: "This person has psychological fit — they published about [specific topic]. Reference it in the opener." The email generation is aware of the signal mix, not just the target.

---

## 4. How Foxworks Is Uniquely Positioned to Implement This

Every component of the Three-Signal Framework has existed in some form for years. What has not existed until now is the ability to execute it at scale, automatically, and cheaply enough that it's viable for an individual SDR or a small team.

**What existed before:**

- Apollo for structural data: yes, and it's excellent. ProspectFold already uses it.
- Trigger event monitoring (Crunchbase, LinkedIn activity feeds, job change alerts): yes, but expensive, manual, and fragmented. Paying for Crunchbase Pro is $1,000+/month. LinkedIn Sales Navigator with TeamLink and job change alerts is $1,500+/month per seat. Most early-stage companies can't afford both. Even those that can still need a human to synthesize the signals into an action.
- Job posting analysis: technically possible, but nobody does it systematically because reading 20 job postings per company, extracting the organizational intelligence, and connecting it to your sales angle requires a skilled analyst, not an SDR.
- LinkedIn research for psychological signals: entirely manual. Thirty minutes per person when done properly. SDRs skip it on almost every prospect because the math doesn't work: at 30 min/person × 20 companies × 2-3 contacts/company, that's 20-30 hours of research per prospecting session. Nobody does 20-30 hours of research. They do 20 minutes and send generic emails.

**What AI changes:**

Haiku can read 10 job postings and extract organizational intelligence in 3 seconds. The quality of extraction is not "keyword matching" — it's genuine comprehension of what the hiring pattern implies about the organization's current pain and priorities. A company posting five senior backend engineers with "experience with distributed systems at scale" is telling you something specific. Haiku reads that and connects it to your ICP value proposition. That used to require a human who understood both the job description language and the sales context simultaneously.

Haiku can search the web for a person's public activity — blog posts, LinkedIn content, conference talks, GitHub activity — and synthesize 2-3 specific personalization hooks in 2 seconds. The hooks are not generic ("you seem interested in technology") — they're specific enough to reference in an email opener without sounding like you're summarizing their LinkedIn "About" section.

Haiku can synthesize all three signals into a scoring model and an `email_modifier_prompt` that carries the synthesis forward into email generation. The output isn't a score — it's a directive: "Open with their new-hire mandate. Reference their post about observability gaps from March. Tie the scaling pressure from their recent funding to what happens at 200 engineers without this."

The entire Phase 3 enrichment pipeline — Apollo people search, trigger event analysis, job posting intelligence, psychological signal search, champion/buyer classification, and three-signal score synthesis — runs in roughly 8 seconds per company at a total AI cost of approximately $0.008 per company.

That number is worth sitting with. Eight seconds. Less than a cent of AI cost. For work that used to require a skilled SDR 30-45 minutes per company — and that most SDRs skipped entirely because the math didn't work.

The breakthrough is not any single capability. It is the combination of:
1. AI that can read and synthesize at human quality without human cost or human time
2. A structured pipeline that applies AI judgment consistently across every company in the queue
3. A tight integration between intelligence generation (ProspectFold) and communication generation (EmailFold) that carries the full signal context from research to email without any copy-paste or manual transfer

This is what "AI-native outbound tooling" actually means. Not AI that writes emails (Lavender, Copy.ai, Jasper do that). AI that does the research that makes the email worth writing in the first place.

---

## 5. The Competitive Moat

The Three-Signal Framework is genuinely difficult to replicate. Not impossible — but the barriers are real and compounding.

**Data integration is not trivial.** The three signals live in different systems. Structural data is in Apollo. Trigger events require monitoring Crunchbase, LinkedIn, and company news feeds. Job posting intelligence requires accessing job boards (LinkedIn Jobs, Indeed, Greenhouse, Lever public pages) and reading them semantically. Psychological signals require web search plus AI synthesis. No single data provider has all of this. Building the integration layer that pulls from all sources and synthesizes them into a unified signal model is itself a significant engineering investment.

**Synthesis requires AI judgment, not just data aggregation.** The reason nobody has built this before is not that the data was unavailable — much of it has been available for years. It's that the synthesis step required human judgment: "Given that this person posted about X, their company just raised Y, and they're hiring for Z, what does that mean for how I should position my product to them specifically?" That's not a query you can run against a database. It requires reading comprehension, contextual reasoning, and the ability to connect disparate signals into a coherent picture of a person's current situation and mindset. Haiku can do this. It could not have done this three years ago.

**The output closes the loop from intelligence to communication.** Every other tool in this space produces data. Apollo gives you a contact record. Crunchbase gives you a funding announcement. LinkedIn gives you a job change alert. These are inputs to a human's thinking process. Foxworks produces an `email_modifier_prompt` — a directive that goes directly into the EmailFold sequence generation prompts. The intelligence doesn't just sit in a dashboard waiting for a human to act on it. It automatically shapes the email that gets written. This tight coupling between research and communication is architecturally unique.

**The feedback loop creates a learning moat.** This is the long-term structural advantage. EventFold tracks which `lead_signal` type produces the highest reply rates for each NAICS code and ICP persona combination. As replies accumulate, the system learns which signal mix predicts replies for your specific customers:

"For `engineering_leader` personas at Series B SaaS companies, new-hire situational signals produce a 22% reply rate vs. 9% for funding signals and 11% for psychological-only. Weight situational at 55% for this persona segment."

This kind of tuning cannot be stolen. It requires months of actual outbound data, attributed by signal type, with enough volume per segment to be statistically meaningful. A competitor who builds a similar pipeline next year starts with generic weights. A Foxworks user who has been running the system for six months has empirically calibrated weights for their specific ICP. The system that has been running longer is genuinely better at predicting which person to email — not because the algorithm changed, but because it learned from feedback that only accrues through use.

---

## 6. The Full Pipeline with All Three Signals

This is the complete end-to-end flow of the ProspectFold pipeline as it exists after implementing PRD-10 through PRD-22, and how it connects to EmailFold and EventFold.

```
ProspectFold Pipeline
══════════════════════════════════════════════════════════════════

Phase 0: Pre-qualification (Haiku)
  Input:  NAICS code or ICP criteria
  Output: company_fit_score (0-100), go/no-go gate
  Cost:   ~$0.0002 / company
  Note:   Runs before any API calls. Filters obvious mismatches.

Phase 1: Company Web Scan (Haiku)
  Input:  company domain
  Output: company_summary, pain_points[], signals[], icp_score
  Cost:   ~$0.007 / company
  Tool:   web_search_20250305

Phase 2: ICP Synthesis + Angles (Opus)
  Input:  Phase 1 output + NAICS context + ICP definition
  Output: target_persona, top_angles[], recommended_searches[]
  Cost:   ~$0.10 / company
  Note:   Strategic layer. Most expensive call. Sets the targeting frame.

─── Phase 3: Person-Level Intelligence (runs in parallel per company) ────────

Phase 3a: Apollo People Search  ← Signal 1 (Structural)
  Input:  apollo_company_id, TARGET_TITLES[target_persona]
  Output: candidate_contacts[] (name, title, seniority, email, linkedin_url)
  Cost:   $0 (plan credit)
  PRD:    10

Phase 3b: Trigger Event Engine  ← Signal 2 (Situational — trigger)
  Input:  company_name, company_domain, top candidate name
  Output: trigger_events[] (job_change, funding, acquisition, etc.)
          situational_score (0-100)
          situational_type (new_hire | funding | growth | acquisition | ...)
  Cost:   ~$0.001 / company
  PRD:    19

Phase 3c: Job Posting Intelligence  ← Signal 2 (Situational — organizational)
  Input:  company_name, company_domain
  Output: hiring_signals[] (role, volume, implied_pain)
          org_pain_summary
          headcount_velocity
  Cost:   ~$0.002 / company
  PRD:    20

Phase 3d: Psychological Signal Search  ← Signal 3 (Psychological)
  Input:  contact.name, contact.title, company.name, target_angles[]
  Output: public_activity[] (posts, talks, articles)
          personalization_hooks[]
          psychological_score (0-100)
          best_angle_match (which Phase 2 angle this person's activity best aligns to)
  Cost:   ~$0.0005 / contact
  PRD:    22

Phase 3e: Champion vs. Buyer Classification
  Input:  contact.title, contact.seniority, company.stage, target_angles[]
  Output: contact_role: "champion" | "economic_buyer" | "both"
          contact_strategy: approach notes based on role
          secondary_contacts[] (if champion, who is the likely buyer?)
  Cost:   included in 3d synthesis call
  PRD:    21

Phase 3f: Three-Signal Score Synthesis
  Input:  Outputs of 3a-3e
  Output: PersonSignalScore {
            structural_score:     0-100
            situational_score:    0-100
            psychological_score:  0-100
            composite_score:      weighted average (weights tunable per NAICS/persona)
            lead_signal:          dominant signal type ("new_hire" | "funding" | "psychological" | ...)
            confidence:           0-1
          }
          ContactMapping {
            recommended_contact:  RecommendedContact (from 3a + 3d enrichment)
            contact_role:         from 3e
            fallback_contacts:    alternatives
          }
          email_modifier_prompt:  string — direct instruction to EmailFold generation
            e.g. "Lead with new-hire mandate framing. Reference their March post about
                  observability gaps specifically. Tie to what happens at 200 engineers
                  without this in place. Angle: Technical Debt Acceleration."
  Cost:   ~$0.001 / company
  PRD:    22

══════════════════════════════════════════════════════════════════
ProspectFold → EventFold (POST /api/intel)
  Full payload including all Phase 3 outputs.
  EventFold auto-creates Contact aggregate tagged with enrichment data.

ProspectFold → EmailFold (POST /api/email-generate or via HTTP queue)
  Payload includes: company_intel, recommended_contact, PersonSignalScore,
                    personalization_hooks, email_modifier_prompt

══════════════════════════════════════════════════════════════════

EmailFold Pipeline
══════════════════════════════════════════════════════════════════

Phase 1: Company Web Scan Validation (Haiku)
  Input:  company intel from ProspectFold (or fresh scan if >48h old)
  Output: validated company_summary, refreshed signals[]
  Cost:   ~$0.003 / company (skipped if ProspectFold intel is fresh)

Phase 2: Email Generation (Sonnet)
  Input:  company_intel + recommended_contact + email_modifier_prompt
          + personalization_hooks + lead_signal + contact_role
  Output: email variants (3 angles)
  Cost:   ~$0.005 / email
  Note:   email_modifier_prompt shapes the opening frame and hook selection.
          Sonnet generates; the strategic direction comes from ProspectFold Phase 3f.

Phase 2b: Sequence Generation (Sonnet)
  Input:  chosen email variant + lead_signal + contact_strategy
  Output: 4-step sequence (Day 0, Day 3, Day 7, Day 14)
          Format: cold → value_add → pattern_interrupt → breakup
          Each step tuned to the lead_signal type:
            new_hire sequence:   step 2 references "as you build your 90-day plan"
            funding sequence:    step 2 references the headcount/infrastructure pressure
            psychological seq:   step 2 extends the conversation they've already started
  Cost:   ~$0.008 / sequence
  PRD:    14

══════════════════════════════════════════════════════════════════
EmailFold → EventFold (POST /api/email-sequence)
  4-step Interaction records created.
  lead_signal and PersonSignalScore stored on the sequence for analytics.
  EventFold tracks which signal types produce replies — feeds back into scoring weights.
```

Total time from "Run Prospecting" click to 20 companies with scored contacts, personalized hooks, and 4-step sequences: **approximately 8 minutes** for a full 20-company session at concurrency 3.

Total AI cost per company (full pipeline, Phase 0 through EmailFold Phase 2b): **approximately $0.12-0.15**.

Full 20-company session: **approximately $2.40-3.00** — and the output includes person-level research that would have taken a skilled SDR 45+ minutes per company to do manually.

---

## 7. What This Means for the SDR

The clearest way to communicate what the Three-Signal Framework changes is to contrast the experience before and after.

**Before Foxworks Three-Signal (current state of the market):**

An SDR working a list of 20 companies from Apollo faces this workflow:
- Open company 1. Google the company to understand what they do. 5 minutes.
- Find the right person on LinkedIn. Filter through results, decide who actually owns the buying decision. 5-10 minutes.
- Read their profile. Look for something to reference — maybe a recent post, a job change, a shared connection. On a good day, find something. On most days, find nothing. 10-15 minutes.
- Write the email. Try to make it specific. Probably write something like "Hi [Name] — I noticed [Company] is growing quickly and thought you might be interested in..." 10 minutes.
- Repeat 19 more times.

On a good day, this takes 6-8 hours. The emails are personalized for the 3-4 people where they found something interesting. The other 16 get templated. The reply rate across the 20 is maybe 3-4 replies if they're lucky.

The emotional arc is: start optimistic, get increasingly frustrated as the research turns up nothing interesting, start cutting corners by hour 3, send mediocre emails from hour 4 onwards because you're tired and the next 10 companies have no obvious hooks. Burnout accelerates. Standards drop.

**After Foxworks Three-Signal:**

An SDR opens ProspectFold, enters a NAICS code or ICP criteria, clicks "Run Prospecting."

Eight minutes later, they have:
- 20 companies scored by ICP fit
- For each company: the specific person to email, their email address if Apollo has it, their LinkedIn URL
- For each person: 2-3 concrete personalization hooks extracted from their actual public activity
- A situational signal for each company: "raised Series A 6 weeks ago," "VP Engineering started 5 weeks ago," "posted about Kafka performance issues 12 days ago"
- An `email_modifier_prompt` for each contact that says, in plain language, how to open the email and what angle to use
- Draft emails pre-generated with the hooks already woven in, ready to review

The SDR's job becomes editorial, not research. They're reading, approving, maybe tweaking a sentence, and sending. They are not doing 45 minutes of research per company. They are spending 2-3 minutes per company verifying that the system found the right person and that the email sounds like them.

The reply rates go up not because the SDR got better at writing emails. They go up because the emails are reaching people who are actually in a moment of need, with a message that references something they actually care about. The signal quality changed. The reply rate follows.

---

## 8. The Feedback Loop: How the System Gets Smarter

The Three-Signal Framework is not a static model. It gets better over time as EventFold accumulates signal-attributed reply data.

Every sequence that gets sent carries its `lead_signal`, `PersonSignalScore`, NAICS code, and `target_persona` into EventFold with the Interaction records. When an SDR logs a reply (or when a reply is automatically detected in a future integration), EventFold can attribute that reply back to the signal mix that produced it.

After a few months of data, the `SequenceMetrics` projection can answer:

- "For `data_leader` personas at NAICS 522320 (Fintech), which `lead_signal` type produces the highest reply rate?"
- "Are psychological signals outperforming situational signals for our specific ICP, or vice versa?"
- "What composite score threshold predicts a >10% reply rate for each vertical?"

This data feeds back into the Three-Signal Score Synthesis (PRD-22). The weighting model — currently a research-informed default (structural 30%, situational 40%, psychological 30%) — becomes empirically calibrated per NAICS code and per persona type:

```typescript
// Default weights (Phase 1 — research-informed):
const DEFAULT_WEIGHTS = {
  structural:    0.30,
  situational:   0.40,
  psychological: 0.30,
};

// Calibrated weights (Phase 2 — after EventFold feedback):
// For engineering_leader at Series B SaaS (from EventFold analytics):
const CALIBRATED_WEIGHTS_622110_ENGINEERING = {
  structural:    0.25,
  situational:   0.55,   // new-hire signal dramatically outperforms for this segment
  psychological: 0.20,
};
```

This is the learning moat. The model a Foxworks user runs after six months of feedback is not the same model they ran on day one. It has learned which signals actually predict replies for their specific customers, their specific product, their specific market.

A competitor who builds a similar pipeline next year runs the default weights because they have no data. The Foxworks user who has six months of replies attributed by signal type runs calibrated weights that are tuned to their reality.

The competitive advantage compounds with use. The more outbound runs through the system, the more accurate the scoring becomes, the higher the reply rates, the more data accumulates. The system is not just better than manual outbound today — it gets measurably better every month.

---

## 9. What This Document Asks of Engineers

Nothing specific to implement. But one thing to internalize:

Every PRD in the person-identification cluster (10 through 22) is implementing a piece of this model. When PRD-20 says "extract organizational pain from job postings," that is Signal 2. When PRD-22 says "search for psychological signals," that is Signal 3. When PRD-22 says "synthesize into a composite score and an email_modifier_prompt," that is the step that makes all three signals actionable.

When you're implementing these features and you face a design decision — "should this data be discarded after scoring or preserved in the payload?" — the answer comes from the model. Preserve it. The `email_modifier_prompt` is as important as the score. The `personalization_hooks` array is what makes the email different. The `lead_signal` type is what EventFold uses for reply attribution.

The pipeline is not a scoring system that produces a number. It is a research system that produces a directive. The directive is what changes the email. The email is what changes the reply rate. Keep that chain of causation visible in your implementation choices.

The Three-Signal Framework is not a feature. It is the reason Foxworks exists.

---

## Appendix A: Signal Weight Sensitivity Analysis

The composite score formula is:

```
composite = (structural × w_s) + (situational × w_sit) + (psychological × w_p)
```

Default weights: `w_s = 0.30`, `w_sit = 0.40`, `w_p = 0.30`.

The following table shows how the composite score changes for different signal combinations at these default weights. Scores are illustrative — actual per-company scores depend on the granularity of each signal's sub-components.

| Structural | Situational | Psychological | Composite (default weights) | Recommended action |
|---|---|---|---|---|
| 90 | 90 | 85 | 88.5 | Priority contact — generate and send immediately |
| 90 | 85 | 30 | 76.0 | Strong contact — send with situational-heavy framing |
| 90 | 30 | 80 | 63.0 | Good contact — send with psychological framing |
| 90 | 30 | 20 | 45.0 | Structural only — borderline; use if no better options |
| 60 | 90 | 80 | 78.0 | Structural miss covered by other signals — send, but flag title uncertainty |
| 60 | 30 | 30 | 48.0 | Weak signal across the board — skip or deprioritize |
| 90 | 90 | 0 | 63.0 | Classic "right person, right time" — respectable, missing personalization edge |

The score threshold for automatic inclusion in the export queue (vs. requiring manual review) is configurable per user in EventFold settings. The default recommended threshold is 65.

---

## Appendix B: The `email_modifier_prompt` Contract

The `email_modifier_prompt` is the mechanism through which ProspectFold's intelligence becomes EmailFold's instruction. It is a free-text string, written by Haiku during Phase 3f synthesis, addressed to the EmailFold generation model (Sonnet).

The format is intentionally natural-language rather than structured JSON — Sonnet performs better with directive prose than with parameter objects when the directive requires judgment calls about emphasis and tone.

A well-formed `email_modifier_prompt` answers four questions:

1. **How to open the email** — what hook or frame to use in the first sentence
2. **What to reference specifically** — which personalization hook to center the opener around
3. **What angle to use** — which of the Phase 2 strategic angles best fits this person's signals
4. **What tone to take** — informed by contact_role (champion vs. buyer) and situational context

Example outputs from Phase 3f:

```
// New hire + psychological signal:
"Open by acknowledging that this person is 6 weeks into a new VP role and likely
evaluating their infrastructure stack. Reference their February post about
distributed tracing gaps in microservices architectures — that's directly relevant.
Use the 'Observability Debt' angle. Tone: peer-to-peer, not vendor pitch. They're
in 'building vision' mode, not 'evaluating procurement' mode."

// Series A funding + hiring signal, no psychological:
"Company raised $12M Series A 5 weeks ago and is actively hiring backend engineers.
No strong personal signal found. Lead with the scaling inflection: at their
current trajectory, the infrastructure decision they make in the next 60 days will
define their stack for 3 years. Use the 'Growth Infrastructure' angle.
Tone: investor-aware (they just closed a round, they're thinking about deployment
of capital). Contact is economic buyer — skip champion-level technical depth."

// Strong psychological, weak situational:
"This person co-authored a post 3 weeks ago about data pipeline reliability at
scale that explicitly names the problem we solve. No major situational triggers
found. Lead entirely on the psychological signal: validate the framing in their
post, position as the solution they were describing. This is the highest-conversion
scenario for psychological-heavy outreach — they've already done the work of
articulating the problem. Use 'Pipeline Reliability' angle. Tone: solution-aware
(they know the problem; don't educate them)."
```

EmailFold Phase 2 injects the `email_modifier_prompt` directly into the generation prompt after the recipient context block. Sonnet treats it as authoritative instruction from the research layer. The generation model does not second-guess the directive — it executes it.

This contract — that the `email_modifier_prompt` is directive, not advisory — is what makes the pipeline coherent. If Sonnet treats it as a suggestion, the signal quality degrades by the time it reaches the email. If it treats it as instruction, the signal fidelity is preserved end-to-end from research to copy.
