# Foxworks Suite — Product Requirements Documents
**Date:** 2026-03-10
**Stack:** ProspectFold (Electron) + EmailFold (Electron) + EventFold CRM (Tauri v2 / Rust)

---

## Document Index

| PRD | Title | Priority | Affects | Depends On |
|---|---|---|---|---|
| [PRD-00](./PRD-00-integration-guide.md) | **Integration Guide & Technical Design Specification** | **READ FIRST** | All three apps | — |
| [PRD-01](./PRD-01-prospectfold-intel-import.md) | ProspectFold → EventFold Intel Import Bridge | P0 | EventFold | — |
| [PRD-02](./PRD-02-emailfold-crm-bridge.md) | EmailFold → EventFold Email Draft Persistence | P0 | EventFold + EmailFold | — |
| [PRD-03](./PRD-03-outbox-view.md) | Outbox View: Daily Send Command Center | P1 | EventFold | PRD-02 |
| [PRD-04](./PRD-04-haiku-cost-optimization.md) | Haiku Cost & Speed Optimization Map | P1 | ProspectFold + EmailFold | — |
| [PRD-05](./PRD-05-intel-history-versioning.md) | Intel History & Snapshot Versioning | P1 | EventFold | PRD-01 |
| [PRD-06](./PRD-06-convert-to-deal-flow.md) | "Convert to Deal" Fast Flow | P1 | EventFold | PRD-02 |
| [PRD-07](./PRD-07-prospecting-metrics-dashboard.md) | Prospecting Metrics Dashboard | P2 | EventFold | PRD-02 + PRD-03 |
| [PRD-08](./PRD-08-pipeline-speed-and-throughput.md) | Pipeline Speed & Throughput Optimization | P1 | ProspectFold + EmailFold | — |
| [PRD-09](./PRD-09-local-api-connectivity.md) | Local HTTP API: Direct App-to-App Connectivity | **P0** | All three apps | — |
| [PRD-10](./PRD-10-contact-person-research.md) | Contact & Person Research: Finding THE Person | **P0** | ProspectFold + EmailFold | PRD-09 |
| [PRD-11](./PRD-11-auto-pipeline.md) | The Auto Pipeline: Zero-Click Prospecting | P1 | All three apps | PRD-09 + PRD-10 |
| [PRD-12](./PRD-12-reply-drafting.md) | Reply Assist: Drafting the Conversation Continuation | **P0** | EmailFold + EventFold | PRD-02, PRD-03 |
| [PRD-13](./PRD-13-linkedin-variant.md) | LinkedIn Variant: Second Channel, Same Research | P1 | EmailFold | PRD-10 |
| [PRD-14](./PRD-14-sequence-generation-engine.md) | Sequence Generation Engine (EmailFold) | **P0** | EmailFold | PRD-10, PRD-09 |
| [PRD-15](./PRD-15-sequence-data-model.md) | Sequence Data Model & Storage (EventFold) | **P0** | EventFold | PRD-02, PRD-09 |
| [PRD-16](./PRD-16-sequence-outbox-view.md) | Sequence Outbox View | P1 | EventFold | PRD-15, PRD-03 |
| [PRD-17](./PRD-17-sequence-automation.md) | Sequence Automation (auto-stop, auto-advance) | **P0** | EventFold | PRD-15, PRD-12 |
| [PRD-18](./PRD-18-sequence-analytics.md) | Sequence Analytics | P2 | EventFold | PRD-15, PRD-07 |
| **— Person Intelligence Cluster —** | | | | |
| [PRD-19](./PRD-19-trigger-event-engine.md) | Trigger Event Engine: The Right Moment Layer | P1 | ProspectFold | PRD-10 |
| [PRD-20](./PRD-20-job-posting-intelligence.md) | Job Posting Intelligence: Organizational X-Ray | P1 | ProspectFold | PRD-10 |
| [PRD-21](./PRD-21-champion-vs-buyer-mapping.md) | Champion vs. Buyer Mapping | P1 | ProspectFold + EventFold | PRD-10, PRD-15 |
| [PRD-22](./PRD-22-person-signal-scoring.md) | Person Signal Scoring: The Composite Fit Model | P1 | ProspectFold + EmailFold | PRD-10, PRD-19, PRD-20 |
| [PRD-23](./PRD-23-three-signal-framework.md) | The Three-Signal Framework: Philosophy & Architecture | **READ SECOND** | All teams | — |

> **⚠ Architecture update:** PRD-09 supersedes the clipboard transport described in PRD-01 and PRD-02. Data contracts and aggregates in PRD-01/02 remain valid; the **transport layer changes from clipboard → local HTTP API**. No user clipboard interaction required.

---

## The Pipeline (updated architecture)

```
1. ProspectFold (Electron) — port 7778
   - Input: NAICS code + ICP criteria (from EventFold job OR manual)
   - Phase 0: Haiku pre-qualification (PRD-04, PRD-08)
   - Phase 1: Haiku web scan (PRD-04)
   - Phase 2: Opus synthesis — ICP score, angles (PRD-04 Quick/Deep modes)
   - Phase 3a: Apollo people search (structural candidates) (PRD-10 v2.0)
   - Phase 3b: Trigger event detection — funding, new hires, headcount (PRD-19) [concurrent]
   - Phase 3c: Job posting intelligence — org pain, tech stack (PRD-20) [concurrent]
   - Phase 3d: Psychological signal search — posts, talks, GitHub (PRD-22) [concurrent]
   - Phase 3e: Champion vs. buyer classification (PRD-21) [concurrent]
   - Phase 3f: Three-signal score synthesis → email_modifier_prompt (PRD-22)
   - Output: POSTs directly to EventFold /api/intel (PRD-09) — NO clipboard

        ↓ PRD-01: intel bridge
        ↓ PRD-04: switch Phase 1 to Haiku
        ↓ PRD-08: Phase 0 pre-qual + parallel queue

2. EventFold CRM (Tauri)
   - Receives: ProspectIntel + Company batch import
   - Stores: ProspectIntel aggregate + Company aggregates + Notes
   - PRD-01: import flow
   - PRD-05: intel history / stale tracking

        ↓ (SDR reviews intel, opens EmailFold for top companies)

3. EmailFold (Electron)
   - Input: Company from ProspectFold queue (or manual)
   - Model: Haiku (Phase 1) + Sonnet (Phase 2)
   - Output: 3 email angle variants with subject options
   - PRD-04: reduce max_tokens, Phase 0 pre-qual
   - PRD-08: parallel queue (3 companies at a time)

        ↓ PRD-02: email bridge

4. EventFold CRM (Tauri)
   - Receives: Chosen email draft
   - Stores: Interaction (Draft) + Note (research snapshot)
   - PRD-03: Outbox view (mark sent, log reply)
   - PRD-06: Convert to Deal (1 click when reply comes in)
   - PRD-07: Metrics (funnel, angle performance, NAICS performance)
```

---

## Build Order (Recommended)

### Phase 1 — Foundation (Week 1–2)
No-clipboard architecture + instant cost wins. Build these before anything else.

1. **PRD-04** — Switch ProspectFold Phase 1 to Haiku (1 line, instant ROI)
2. **PRD-04** — EmailFold max_tokens: 2500 → 1500 (1 line)
3. **PRD-09** — EventFold local HTTP API server (axum, port 7777, token auth, offline queue)
4. **PRD-01** — ProspectFold → EventFold: intel import aggregate + auto-POST on completion
5. **PRD-02** — EmailFold → EventFold: extend Interaction + auto-POST on completion

### Phase 2 — Daily Workflow (Month 2)
The CRM becomes the daily command center. No clipboard anywhere.

6. **PRD-10** — Contact/person research: Apollo people search + Haiku enrichment in ProspectFold
7. **PRD-03** — Outbox view (Draft → Sent → Replied lifecycle)
8. **PRD-06** — Convert to Deal fast flow
9. **PRD-08** — EmailFold parallel queue (concurrency 3)
10. **PRD-05** — Intel history + stale intel indicator

### Phase 3 — Sequences & Auto Pipeline (Month 3)
Full conversation arc. One click → full Outbox with 4-step sequences ready.

11. **PRD-14** — Sequence generation engine in EmailFold (Phase 2b, Sonnet, 4-step output)
12. **PRD-15** — Sequence data model in EventFold (Interaction extensions, IPC commands, SequenceIndex projection)
13. **PRD-17** — Sequence automation (auto-stop on reply, auto-advance on send, per-step Tasks)
14. **PRD-16** — Sequence Outbox view (Sequences tab, ●●○○ indicators, due-today banner)
15. **PRD-11** — Auto pipeline: EventFold triggers ProspectFold + EmailFold end-to-end
16. **PRD-12** — Reply Assist (in EmailFold + inline in Outbox)
17. **PRD-13** — LinkedIn variant (one Haiku call, woven into sequence arc)

### Phase 4 — Intelligence (Month 4)
Close the feedback loop. The system learns and improves.

18. **PRD-07** — Prospecting metrics dashboard (funnel, angle performance, NAICS rates)
19. **PRD-18** — Sequence analytics (step reply rates, Lazarus rate, angle × sequence performance)
20. **PRD-04** — Phase 0 batch pre-qual + NAICS angle cache + Quick Refill mode

### Phase 5 — The Right Person (Month 5)
The person intelligence cluster. Transforms "find a VP Engineering" into "find Jane Smith, who posted about this problem last week, just got promoted, and whose team is actively hiring for the exact role that signals the pain."

21. **PRD-23** — Read the Three-Signal Framework first (philosophy + architecture)
22. **PRD-10 v2.0** — Updated Phase 3 coordinator (now covers 6 concurrent sub-phases)
23. **PRD-19** — Trigger Event Engine (funding rounds, new hires, headcount spikes)
24. **PRD-20** — Job Posting Intelligence (org pain + tech stack from job descriptions)
25. **PRD-21** — Champion vs. Buyer Mapping (two contacts, sequencing strategy)
26. **PRD-22** — Person Signal Scoring (composite three-signal model + email_modifier_prompt)

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Inter-app bridge | Local HTTP API (axum, 127.0.0.1:7777, bearer token auth) | Invisible to user, offline-queued, no clipboard choreography. Discovery via `~/.foxworks/api.json`. See PRD-09. |
| ProspectFold intel storage | New `ProspectIntel` aggregate | Intel is a versioned snapshot with its own lifecycle — not a property of Company |
| EmailFold email storage | Extend `Interaction` aggregate | Email is an interaction; avoid new aggregate registration overhead |
| Research snapshot | `Note` companion record | Keeps Interaction.body clean; research is a separate artifact |
| Task creation on send | Direct in `mark_email_sent` command | `EmailSent` event lacks contact/company IDs; Tauri command has full AppState access |
| Phase 1 model | Switch to `claude-haiku-3-5` | Web search + format = no reasoning needed; Haiku is identical quality, 11× cheaper |
| Parallel queue | Sliding window, concurrency 3 | Balances Anthropic rate limits vs throughput; configurable per user plan |
| Person targeting | Three-Signal model (Structural + Situational + Psychological) | Title alone predicts 2-3% reply rate; three-signal scoring targets 10-15%+ |
| Phase 3 execution | 6 sub-phases run concurrently per company | Max latency = slowest sub-phase (~4s), not sum (~18s); parallel with other companies |
| Contact strategy | Champion first, Economic Buyer second | Internal advocacy beats cold buyer outreach by ~10:1; PRD-21 automates the split |

---

## For the Senior Dev (EventFold)

**Start with [PRD-00](./PRD-00-integration-guide.md)** — it consolidates the full HTTP API spec, all 29 IPC commands, complete Tauri event catalog, all new Interaction fields, projection list, and an implementation checklist. Read it before any individual PRD.

All EventFold changes are described in PRDs 01–23. Person intelligence (PRDs 19–23) primarily affects ProspectFold and EmailFold; EventFold changes are limited to contact storage extensions (PRD-21) and reply-rate tracking by signal type (PRD-22/18).

**Critical files identified:**
- `src/domain/interaction.rs` — extend for PRD-02 (email fields) + PRD-15 (sequence fields)
- `src/domain/` — add `prospect_intel.rs` for PRD-01
- `src/api_server.rs` — NEW: axum HTTP server for PRD-09
- `src/commands.rs` — add 29 new IPC commands across all PRDs
- `src/projections.rs` — add 4 new projections: EmailInteractionIndex, SequenceIndex, EmailOutreachMetrics, SequenceMetrics
- `src/lib.rs` — register new aggregate + commands + projections + spawn API server
- `src-frontend/src/components/companies/CompanyDetail.tsx` — intel tab (PRD-05)
- NEW: `src-frontend/src/components/outbox/EmailOutbox.tsx` (PRD-03)
- NEW: `src-frontend/src/components/outbox/SequenceCard.tsx` (PRD-16)
- NEW: `src-frontend/src/components/prospect-intel/ProspectIntelDetail.tsx` (PRD-01)
- NEW: `src-frontend/src/components/pipeline/PipelineStudio.tsx` (PRD-11)
- NEW: `src-frontend/src/components/metrics/ProspectingMetrics.tsx` (PRD-07)

**Shared Electron utility:** `src/lib/foxworks-api-client.js` — add to both ProspectFold and EmailFold (canonical source in PRD-00).

**Each PRD has an "Open Questions for Senior Dev" section** with Rust/EventFold-internal decisions that only you can make. Cross-PRD questions are resolved in PRD-00.
