# PRD-08 — Prospecting Pipeline Speed & Throughput Optimization
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** ProspectFold + EmailFold owners (Electron apps)
**Priority:** P1 — Applies to all three apps, no EventFold dependency

---

## Problem

The current Foxworks pipeline is serial and slow:

```
ProspectFold:
  Company A — Phase 1 (web scan, 8s) → Phase 2 (synthesis, 15s) = 23s
  Company B — Phase 1 (8s) → Phase 2 (15s) = 23s
  ... × 20 companies = 460 seconds = ~8 minutes of waiting

EmailFold:
  Company A — Phase 1 (3s) → Phase 2 (4s) = 7s
  Company B — Phase 1 (3s) → Phase 2 (4s) = 7s
  ... × 20 companies = 140 seconds = ~2.5 minutes
```

Total pipeline: **10+ minutes of API waiting** for a 20-company session. The SDR is idle most of this time. Research happens one-at-a-time even though the Anthropic API supports concurrent requests.

**The opportunity:** Run companies in parallel. 20 companies × 7s (EmailFold) = 2.5 minutes serial → ~15 seconds parallel (if all run at once). Even with conservative concurrency (4 at a time), that's ~35 seconds.

---

## Proposed Solution: Batch Processing with Configurable Concurrency

Both ProspectFold and EmailFold should support a **queue with controlled concurrency** — processing N companies simultaneously rather than one at a time.

Three optimizations:
1. **Parallel queue execution** — N companies at a time (default 3, user-configurable)
2. **Phase 1 / Phase 2 pipeline overlap** — start Company B's Phase 1 while Company A is in Phase 2
3. **Background processing** — let the queue run while the SDR reads results for earlier companies

---

## OPTIMIZATION 1: EmailFold Parallel Queue

### Current Architecture
EmailFold has a company queue (from ProspectFold intel). It processes one company at a time — Phase 1 (Haiku web scan), then Phase 2 (Sonnet email draft). The user must wait for Phase 2 to finish before starting the next company.

### Proposed Architecture: `runQueue(concurrency = 3)`

```javascript
// New function in email-crafter.jsx

const runQueue = async (companies, concurrency = 3) => {
  const queue = [...companies];
  const inFlight = new Set();
  const results = new Map();

  const runOne = async (company) => {
    setCompanyStatus(company.name, "researching");
    try {
      const research = await runPhase1(company);
      setCompanyStatus(company.name, "drafting");
      const emails = await runPhase2(company, research);
      results.set(company.name, { research, emails });
      setCompanyStatus(company.name, "done");
    } catch (err) {
      setCompanyStatus(company.name, "error");
      setCompanyError(company.name, err.message);
    }
  };

  // Sliding window concurrency
  const workers = Array.from({ length: concurrency }, async () => {
    while (queue.length > 0) {
      const company = queue.shift();
      await runOne(company);
    }
  });

  await Promise.all(workers);
  return results;
};
```

### Company Cards Update During Processing

Each company card shows its live status:

```
Company Queue (20 companies)          Running: 3 | Done: 7 | Queued: 10
─────────────────────────────────────────────────────────────────────
✓ Acme Corp          [DONE]   View emails →
✓ Widget Co          [DONE]   View emails →
  DataFlow Inc        ●●● Researching... (Phase 1: web scan)
  FooBar SaaS         ●●● Drafting...    (Phase 2: email gen)
  TechCo Inc          ●●● Researching...
  NextUp Ltd          [QUEUED]
  ...
```

"View emails →" appears on completed companies while others are still processing. SDR can read + act on finished emails while the queue continues.

### Concurrency Setting

Add to EmailFold settings sidebar:

```
Queue Concurrency: [1] [2] [3✓] [4] [5]
```

Default 3. At 5: uses more API quota but fastest throughput. At 1: original sequential behavior.

**Rate limit consideration:** Anthropic rate limits apply per-minute per model. At concurrency 5 with Haiku + Sonnet, 5 simultaneous requests is well within typical limits. At Opus, 5 simultaneous may hit rate limits on lower-tier API plans.

---

## OPTIMIZATION 2: ProspectFold Phase 0 Pre-Qualification (Parallel Batch)

See PRD-04 for the Phase 0 concept. The parallel optimization here: run Phase 0 for all 20 companies simultaneously before starting Phase 1 for any.

```javascript
// Phase 0: fire all 20 pre-qualification checks simultaneously
const phase0Results = await Promise.all(
  companies.map(co => runPhase0(co))
);

// Filter to qualified companies only
const qualified = companies.filter((co, i) =>
  phase0Results[i].should_research
);

// Show pre-qualification summary to user:
// "Pre-qualified 14/20 companies (6 skipped: too small, wrong geo)"
// [Continue with 14] [Review skipped] [Include all]

// Phase 1 + 2: run qualified with concurrency = 3
await runQueue(qualified, 3);
```

**Cost:** 20 × Haiku Phase 0 call = ~$0.002 total (negligible)
**Time:** All 20 Phase 0 calls run in parallel = ~2s for the entire batch
**Savings:** Skip 6 companies before spending $0.60 on their Phase 1+2

---

## OPTIMIZATION 3: Streaming Partial Results

Currently, Phase 2 waits for the full JSON response before displaying anything. Users see a loading spinner for 4–15 seconds.

Switch Phase 2 to **streaming mode** so the email body appears word-by-word:

```javascript
// Phase 2 — streaming version

const stream = await anthropic.messages.create({
  model: "claude-sonnet-4-5",
  max_tokens: 1500,
  stream: true,
  system: systemPrompt,
  messages: [{ role: "user", content: draftPrompt }],
});

let buffer = "";
for await (const chunk of stream) {
  if (chunk.type === "content_block_delta") {
    buffer += chunk.delta.text;
    // Try to parse JSON progressively
    // Update email preview as content accumulates
    setStreamingBody(extractBodyFromPartialJson(buffer));
  }
}
```

**Challenge:** Phase 2 returns structured JSON (`{ angle, subject, subjects[], body, ... }`). Progressive JSON parsing needs a lightweight parser that extracts `body` as it streams. The `body` field is the most valuable to stream early.

**Alternative (simpler):** Separate the body generation from the JSON wrapper. Run Phase 2 as two calls:
1. Haiku call (200 tokens): extract angle metadata quickly (angle, hook, why)
2. Sonnet call (streaming): generate email body with streaming visible to user

This costs one extra Haiku call per company but removes 4–8s of waiting blank screen.

---

## OPTIMIZATION 4: ProspectFold "Quick Refill" Mode

**Scenario:** You've already run ProspectFold for NAICS 541511 (Custom Software Dev) last week. You have the angles, ICP criteria, and strategy. Now you just want a fresh list of 20 Apollo companies for that same segment.

**Quick Refill** skips Phase 2 (the Opus synthesis) entirely and replaces it with a Haiku call that:
- Takes the cached NAICS angle strategy
- Personalizes opening lines for each new company using Phase 1's web scan results

```javascript
const quickRefill = async (company, cachedStrategy) => {
  // Phase 1 stays the same (Haiku web scan)
  const research = await runPhase1(company);

  // Phase 2 replacement: personalize, don't strategize
  const personalized = await anthropic.messages.create({
    model: "claude-haiku-3-5",    // ← Haiku, not Opus
    max_tokens: 800,
    messages: [{
      role: "user",
      content: `
You have these proven angles for ${cachedStrategy.naicsLabel} companies:
${JSON.stringify(cachedStrategy.angles)}

Personalize the top 2 angles for this specific company:
Company: ${company.name}
What they do: ${research.what_they_do}
Tech stack: ${research.tech_stack.join(", ")}
Recent news: ${research.recent_news}
Pain points: ${research.pain_points.join(", ")}

Return JSON: same angle format but with company-specific hook and opening_line.`
    }]
  });

  return parseAngles(personalized.content[0].text);
};
```

**Cost comparison (20 companies):**
- Full Deep run: $4.00 (Opus + Opus)
- Quick Refill: $0.30 (Haiku + Haiku) — **13× cheaper**
- Quality: Identical angle strategy, lighter company personalization

**UI:** Add a "Quick Refill" button to ProspectFold's NAICS selector. If a cached strategy exists for the NAICS code, show "Quick Refill (saved $3.70)". If not, use Full Deep mode and cache the result.

---

## OPTIMIZATION 5: Deduplication Before Processing

Before running any company through the pipeline:
1. Check EventFold CRM clipboard API for known companies
2. Check ProspectFold's own localStorage history
3. Flag companies already processed in the last 30 days with a "Researched recently" badge
4. Allow user to skip or force-rerun

```javascript
const deduplicateQueue = (companies, recentHistory) => {
  return companies.map(co => {
    const lastRun = recentHistory.find(h =>
      h.companyName.toLowerCase() === co.name.toLowerCase() ||
      h.companyUrl === co.website_url
    );
    return {
      ...co,
      alreadyProcessed: lastRun
        ? { daysAgo: daysSince(lastRun.ts), result: lastRun }
        : null,
    };
  });
};
```

Show in the queue:

```
✓ Acme Corp      [DONE 8 days ago — skip or re-run?]
  Widget Co      [QUEUED — new]
  FooBar SaaS    [QUEUED — new]
```

Skipping duplicates at 25% of the queue = 25% cost reduction with no research value lost.

---

## Throughput Summary

| Scenario | Time (20 companies) | Cost | vs. Baseline |
|---|---|---|---|
| Baseline (serial, current) | 8–10 min | $4.16 | — |
| Phase 1 → Haiku only | 5–7 min | $2.10 | 50% cost |
| Phase 0 pre-qual (25% skip) | 4–5 min | $1.60 | 61% cost |
| Parallel queue (concurrency 3) | 2–3 min | $1.60 | 62% time |
| Quick Refill mode | 1–2 min | $0.30 | 93% cost |
| All optimizations combined | **< 2 min** | **$0.25** | **94% cost** |

---

## Implementation Priority

**Immediate (1–2 days, highest ROI):**
1. Phase 1 model → Haiku (single-line change, PRD-04)
2. EmailFold parallel queue (concurrency 3) — biggest throughput win per hour of dev work

**Short-term (week 1–2):**
3. Phase 0 pre-qualification call
4. Deduplication check against localStorage history
5. Streaming for Phase 2 body field

**Medium-term (month 1–2):**
6. Quick Refill mode with NAICS angle cache
7. Concurrency UI control in settings

---

## Out of Scope

- Distributed processing (sending tasks to a server)
- Caching API responses (Anthropic prompt caching could help but adds complexity)
- Running ProspectFold + EmailFold simultaneously on the same company list (different apps, no shared queue)

---

## Success Metrics

- Full 20-company EmailFold session time: **< 3 minutes** (from ~2.5 min serial, but with parallel → done-while-working)
- Full 20-company ProspectFold session time: **< 5 minutes** (from ~8 min)
- Cost per 20-company session: **< $1.00** (from $4.16)
- SDR's "idle waiting" time per session: **< 30 seconds** (work starts appearing within seconds of pressing Run All)
