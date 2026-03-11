# PRD-04 — Haiku Cost & Speed Optimization Map
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** ProspectFold owner + EmailFold owner
**Priority:** P1 — Immediate ROI, no dependencies

---

## Problem

All Claude API calls in the Foxworks suite use premium models (Opus, Sonnet) for every task — including tasks that don't require frontier intelligence. This creates two problems:
1. **Cost:** Opus at ~$15/M output tokens vs Haiku at ~$1.25/M output tokens — a 12× price difference
2. **Speed:** Opus P50 latency is 8–15s per generation. Haiku is 1–3s. At 20 companies per session, that's 5 minutes waiting vs 1 minute waiting.

The goal: route each task to the cheapest model that can do it at acceptable quality. Never use Opus where Haiku will do.

---

## Current Model Usage

### ProspectFold (`prospect-crafter.jsx`)

| Phase | Model | Task | Input tokens | Output tokens |
|---|---|---|---|---|
| Phase 1 | `claude-opus-4-6` + `web_search_20250305` | Web research: gather company intel | ~3k | ~2k |
| Phase 2 | `claude-opus-4-6` + extended thinking (16k budget, 8k think) | Deep synthesis: ICP scoring, angle generation, qualification | ~8k | ~4k |

**ProspectFold cost per run:** ~$0.18–0.30 at Opus rates

### EmailFold (`email-crafter.jsx`)

| Phase | Model | Task | Input tokens | Output tokens |
|---|---|---|---|---|
| Phase 1 | `claude-haiku-3-5` + `web_search_20250305` | Company web scan: tech stack, news, pain points | ~1k | ~0.5k |
| Phase 2 | `claude-sonnet-4-5` | Email drafting: 3 angle variants with subjects | ~2.5k | ~1.5k |

**EmailFold cost per company:** ~$0.005–0.008 at Haiku + Sonnet rates — already well-optimized.

---

## Optimization Recommendations

### ProspectFold Phase 1: Web Research

**Current:** `claude-opus-4-6` + `web_search`
**Proposed:** `claude-haiku-3-5` + `web_search_20250305`
**Rationale:** Phase 1 is data retrieval + light structuring. It asks the model to search the web and format findings into JSON. Haiku handles this task with no quality regression — it's not doing multi-step reasoning or creative generation. EmailFold already uses Haiku for exactly this task.

**Expected quality delta:** None observable. The web search tool does the heavy lifting; the model just formats the results.
**Cost impact:** Phase 1 alone is ~$0.08/run at Opus → ~$0.007/run at Haiku. **11× cheaper.**
**Speed impact:** 8–12s → 1–2s per Phase 1 run.

**Code change (ProspectFold):**
```javascript
// Phase 1 — change from:
model: "claude-opus-4-6",
// to:
model: "claude-haiku-3-5",
```

---

### ProspectFold Phase 2: Synthesis + Angle Generation

**Current:** `claude-opus-4-6` + extended thinking (16k tokens, 8k thinking budget)
**Proposed:** Keep Opus, but evaluate Sonnet as an alternative for lower-stakes runs

**Rationale for keeping Opus here (for now):**
Phase 2 is the core intellectual product of ProspectFold. It produces:
- ICP fit score + explanation
- Multi-factor qualification checklist
- 2–4 sales angles with tailored opening lines
- Red flag identification

This requires sophisticated cross-referencing, strategic reasoning, and understanding of B2B sales dynamics. Opus with extended thinking produces noticeably better angles than Sonnet without thinking. Degrading this output degrades the entire pipeline.

**When to consider Sonnet for Phase 2:**
- If the target company is a known brand (Stripe, Shopify, etc.) — Sonnet has sufficient knowledge
- If you've already run this NAICS code before and have cached angles (see PRD-05)
- If the user explicitly selects "Quick mode" vs "Deep mode"

**Proposed optimization: Two-tier mode switch**

Add a "Quick / Deep" toggle to ProspectFold:

| Mode | Phase 1 | Phase 2 | Cost/run | Speed |
|---|---|---|---|---|
| Quick | Haiku | Sonnet (no thinking) | ~$0.02 | ~4s total |
| Deep | Haiku | Opus (extended thinking) | ~$0.10 | ~15s total |

Deep mode for new NAICS codes, first runs, or high-value targets.
Quick mode for filling the queue with companies once the angle strategy is known.

---

### EmailFold: Already Near-Optimal

EmailFold uses Haiku for research and Sonnet for drafting. This is the right split.

**One potential optimization:** Phase 2 `max_tokens: 2500` might be reducible.

Current Phase 2 output per company generates 3 full emails × ~200 words each = ~600 words total. At ~1.3 tokens/word that's ~780 output tokens. But the model thinks about subjects + hooks + why fields too, so ~1500 tokens is more realistic.

Setting `max_tokens: 1500` instead of `2500` would reduce cost ~40% on Phase 2 with no quality impact (the model rarely uses the full 2500 anyway).

**Code change (EmailFold):**
```javascript
// Phase 2 — change from:
max_tokens: 2500,
// to:
max_tokens: 1500,
```

---

### New: Haiku Pre-Qualification Filter (ProspectFold)

**Proposed new Phase 0 before the existing research pipeline:**

Before spending Opus tokens on a company, run a 200-token Haiku call to pre-qualify it:

```javascript
// Phase 0 — NEW: fast pre-qualification check
{
  model: "claude-haiku-3-5",
  max_tokens: 200,
  messages: [{
    role: "user",
    content: `Given this company: ${companyName} (${websiteUrl}), ${industry}, ${employeeCount} employees.

ICP criteria: ${icpCriteria.join(", ")}

Respond with JSON only:
{
  "should_research": true/false,
  "skip_reason": "reason if false, else null",
  "confidence": 0-100
}`
  }]
}
```

If `should_research: false` with `confidence > 85`, skip the company entirely without spending Phase 1 or Phase 2 tokens.

**When this helps:** You import a ProspectFold session with 20 Apollo companies. 5 of them are clearly too small, too large, or in the wrong geography. Phase 0 catches them in 1 second each for $0.0002 each, vs running the full pipeline for $0.10+ and discovering the mismatch at the end.

**Implementation:** Add as a new function `runPreQualification()` in `prospect-crafter.jsx`. Called before `runPhase1()` for each company in the queue. Display as a "Pre-qualifying..." status in the company card before the main research begins.

---

### New: NAICS Angle Cache (Cross-Session Reuse)

**Concept:** If you've already generated angles for NAICS code 541511 (Custom Software Dev), and now you have 8 new companies with that same NAICS, the angle strategy is already known. Phase 2 can be replaced with a "personalization" call that adapts the cached angles to the specific company.

**Proposed flow:**
1. ProspectFold checks localStorage for `angleCache[naicsCode]`
2. If cache hit (< 30 days old): run a lightweight Sonnet call to personalize existing angles for the new company
3. If cache miss: run full Opus Phase 2 and cache the resulting angles

**Cost impact:** Repeated NAICS codes drop from ~$0.10 to ~$0.015 per company.

**Personalization prompt (Sonnet, ~2k tokens):**
```
Here are proven sales angles for the {naicsCode} ({naicsLabel}) vertical:
[cached angles]

Now adapt them for this specific company:
Company: {companyName}
What they do: {webScanSummary}
Recent news: {recentNews}
Tech stack: {techStack}

Return the same angle names but with company-specific hooks, opening lines, and personalization.
```

---

## Full Cost Comparison Table

| Scenario | Current cost | Optimized cost | Savings |
|---|---|---|---|
| ProspectFold Deep run (20 companies) | $4.00 | $2.00 (Phase 1 → Haiku) | 50% |
| ProspectFold Quick mode (20 companies) | N/A | $0.40 | N/A |
| ProspectFold with Phase 0 filter (25% skip rate) | $4.00 | $1.50 | 62% |
| ProspectFold with NAICS cache (50% hit rate) | $4.00 | $1.40 | 65% |
| EmailFold (20 companies) | $0.16 | $0.10 (max_tokens fix) | 37% |
| Full session (ProspectFold + EmailFold, optimized) | $4.16 | $1.50 | **64%** |

---

## Recommended Implementation Order

1. **Week 1 — Quick wins (< 1 day each):**
   - ProspectFold Phase 1: switch to `claude-haiku-3-5` — single line change, no risk
   - EmailFold Phase 2: reduce `max_tokens: 2500 → 1500` — single line change
   - Add Quick/Deep mode toggle to ProspectFold UI

2. **Week 2 — Phase 0 pre-qualifier:**
   - Add `runPreQualification()` to ProspectFold
   - Add "Skip" status to company cards (show why skipped)
   - Add override button: "Research anyway"

3. **Month 2 — NAICS angle cache:**
   - Design `angleCache` localStorage schema
   - Add cache read/write to Phase 2 in ProspectFold
   - Add cache invalidation (30-day TTL per NAICS code)
   - Show "Using cached angles" indicator in UI

---

## Model Selection Reference

| Task | Use | Reason |
|---|---|---|
| Web search + JSON formatting | Haiku | No reasoning needed; tool does the work |
| Pre-qualification pass/fail | Haiku | Simple boolean decision on structured data |
| Email body drafting | Sonnet | Creative quality needed but not frontier intelligence |
| ICP scoring + angle generation (new vertical) | Opus + thinking | Strategic reasoning, cross-referencing, B2B expertise |
| Personalizing cached angles | Sonnet | Adapting known strategy; no new strategic thinking |
| Extracting structured data from a web page | Haiku | Extraction, not reasoning |
| Generating follow-up emails | Sonnet | Context-aware writing, not frontier reasoning |
| Generating sequence step 2/3 (based on reply content) | Sonnet | Pattern: "they said X, so respond with Y" |

---

## Out of Scope

- Switching from Anthropic to other providers
- Self-hosted models
- Fine-tuning
- Prompt caching API (could be added later for Phase 2's long system prompts)

---

## Success Metrics

- Cost per ProspectFold run (20 companies): **< $2.00** (from ~$4.00 today)
- Phase 1 latency per company: **< 3s** (from ~8–12s)
- Quality regression on angles (manual eval, 20 samples): **zero observable degradation** on Phase 1 switch; **acceptable** on Quick mode
