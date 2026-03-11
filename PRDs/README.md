# Foxworks Suite — Product Requirements Documents
**Date:** 2026-03-10
**Stack:** ProspectFold (Electron) + EmailFold (Electron) + EventFold CRM (Tauri v2 / Rust)

---

## Document Index

| PRD | Title | Priority | Affects | Depends On |
|---|---|---|---|---|
| [PRD-01](./PRD-01-prospectfold-intel-import.md) | ProspectFold → EventFold Intel Import Bridge | P0 | EventFold | — |
| [PRD-02](./PRD-02-emailfold-crm-bridge.md) | EmailFold → EventFold Email Draft Persistence | P0 | EventFold + EmailFold | — |
| [PRD-03](./PRD-03-outbox-view.md) | Outbox View: Daily Send Command Center | P1 | EventFold | PRD-02 |
| [PRD-04](./PRD-04-haiku-cost-optimization.md) | Haiku Cost & Speed Optimization Map | P1 | ProspectFold + EmailFold | — |
| [PRD-05](./PRD-05-intel-history-versioning.md) | Intel History & Snapshot Versioning | P1 | EventFold | PRD-01 |
| [PRD-06](./PRD-06-convert-to-deal-flow.md) | "Convert to Deal" Fast Flow | P1 | EventFold | PRD-02 |
| [PRD-07](./PRD-07-prospecting-metrics-dashboard.md) | Prospecting Metrics Dashboard | P2 | EventFold | PRD-02 + PRD-03 |
| [PRD-08](./PRD-08-pipeline-speed-and-throughput.md) | Pipeline Speed & Throughput Optimization | P1 | ProspectFold + EmailFold | — |

---

## The Pipeline

```
1. ProspectFold (Electron)
   - Input: NAICS code + ICP criteria
   - Model: Haiku (Phase 1 web scan) + Opus w/ thinking (Phase 2 synthesis)
   - Output: ICP score, angles, signals, Apollo company list
   - Clipboard: __prospect_intel_v2 payload

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

### Phase 1 — Core Bridges (Week 1–2)
These eliminate manual work. Build these first.

1. **PRD-04** — Switch ProspectFold Phase 1 to Haiku (1 line change, instant ROI)
2. **PRD-04** — EmailFold max_tokens fix (1 line change)
3. **PRD-01** — ProspectFold → EventFold intel import (new aggregate + IPC + UI)
4. **PRD-02** — EmailFold → EventFold email bridge (extend Interaction + IPC + button)

### Phase 2 — Daily Workflow (Month 2)
These make the CRM the daily command center.

5. **PRD-03** — Outbox view (Replied tab + Mark Sent + Log Reply)
6. **PRD-06** — Convert to Deal modal
7. **PRD-08** — EmailFold parallel queue (concurrency 3)
8. **PRD-05** — Intel history + stale intel indicator

### Phase 3 — Intelligence & Scale (Month 3)
These close the feedback loop and reduce cost further.

9. **PRD-07** — Prospecting metrics dashboard
10. **PRD-04** — Phase 0 pre-qualification filter
11. **PRD-08** — NAICS angle cache + Quick Refill mode

---

## Key Technical Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Inter-app bridge | System clipboard with typed JSON discriminators | Already proven: `__prospect_intel_v2` → `ApolloSearch.tsx`. Zero infrastructure. |
| ProspectFold intel storage | New `ProspectIntel` aggregate | Intel is a versioned snapshot with its own lifecycle — not a property of Company |
| EmailFold email storage | Extend `Interaction` aggregate | Email is an interaction; avoid new aggregate registration overhead |
| Research snapshot | `Note` companion record | Keeps Interaction.body clean; research is a separate artifact |
| Task creation on send | Direct in `mark_email_sent` command | `EmailSent` event lacks contact/company IDs; Tauri command has full AppState access |
| Phase 1 model | Switch to `claude-haiku-3-5` | Web search + format = no reasoning needed; Haiku is identical quality, 11× cheaper |
| Parallel queue | Sliding window, concurrency 3 | Balances Anthropic rate limits vs throughput; configurable per user plan |

---

## For the Senior Dev (EventFold)

All EventFold changes are described in PRDs 01, 02, 03, 05, 06, 07.

**Critical files identified:**
- `src/domain/interaction.rs` — extend for PRD-02
- `src/domain/` — add `prospect_intel.rs` for PRD-01
- `src/commands.rs` — add ~10 new IPC commands across PRD-01, 02, 03
- `src/lib.rs` — register new aggregate + commands
- `src-frontend/src/components/companies/CompanyDetail.tsx` — paste buttons + intel tab
- `src-frontend/src/components/apollo/ApolloSearch.tsx` — extend existing paste flow
- NEW: `src-frontend/src/components/outbox/EmailOutbox.tsx`
- NEW: `src-frontend/src/components/prospect-intel/ProspectIntelDetail.tsx`

**Each PRD has an "Open Questions for Senior Dev" section** with Rust/EventFold-internal decisions that only you can make.
