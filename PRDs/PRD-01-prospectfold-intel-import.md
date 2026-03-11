# PRD-01 — ProspectFold → EventFold: Intel Import Bridge
**Version:** 1.0
**Date:** 2026-03-10
**Author:** Foxworks / Claude Architecture Session
**For:** Senior Dev (EventFold CRM)
**Priority:** P0 — Blocks all other integrations

---

## Problem

Every ProspectFold run produces a rich intel package: ICP fit score, angles, signals, qualifying criteria, and a list of 5–20 Apollo-sourced companies. Today, that package lives only on the clipboard and vanishes. The user manually re-keys company names into EventFold, forgets which angle they planned to use, and loses the ICP score context entirely.

**The gap:** Research happens in ProspectFold. The CRM knows nothing about it.

Pain points:
- Re-keying company names is slow and error-prone
- ICP scores and red flags are never recorded
- The same company gets researched again weeks later because there's no history
- Sales angles are forgotten before the email is sent

---

## Proposed Solution

Add a **"Paste Intel → EventFold"** flow to EventFold. When the user finishes a ProspectFold run and copies the output to clipboard, one click in EventFold imports the full intel package:
- Creates a permanent, versioned **ProspectIntel** record (snapshot of what was known at this moment)
- Batch-creates or merges **Company** records from the Apollo list
- Attaches a **Note** to each company with the full intel summary (angles, signals, red flags)
- Shows a per-company conflict resolution step when a company already exists in the CRM

---

## User Stories

- As a SDR, I want to paste ProspectFold intel into EventFold so that my company list is populated without manual entry
- As a SDR, I want to see the ICP fit score and angles on a company's page so that I know why we're targeting them and how to approach them
- As a manager, I want to see a history of intel snapshots per company so that I can see how our understanding has evolved
- As a SDR, I want a merge prompt when a company already exists so that I don't create duplicates

---

## Flow Diagram

```
ProspectFold                          EventFold CRM
─────────────                         ─────────────
User clicks "Copy to Clipboard"
  → writes __prospect_intel_v2
    JSON to system clipboard

                                      User clicks "Paste from ProspectFold"
                                        (button in sidebar or ApolloSearch panel)
                                        ↓
                                      Read clipboard → parse __prospect_intel_v2
                                        ↓
                                      For each apollo_company:
                                        → call find_company_by_name_or_url()
                                        → result: CREATE / MERGE / SKIP
                                        ↓
                                      Show confirmation modal:
                                        - Intel summary (NAICS, ICP score, # angles)
                                        - Per-company action list (user can override)
                                        - "Import" button
                                        ↓
                                      On confirm → import_prospect_intel()
                                        → Create ProspectIntel aggregate (1 per session)
                                        → For each company: create/merge Company aggregate
                                        → For each company: create Note with intel summary
                                        ↓
                                      Navigate to /prospect-intel/:id
                                      Show success: "Imported 12 companies, 1 merged"
```

---

## Clipboard Payload Contract

ProspectFold writes this to clipboard under key `__prospect_intel_v2`. EventFold reads it.

```typescript
// Already exists in eventfold-crm types.ts as ProspectIntelV2Payload
// Verify current shape — approximate:
interface ProspectIntelV2Payload {
  __prospect_intel_v2: true;
  naicsCode: string;
  naicsLabel: string;
  summary: string;
  icp: {
    fit_score: number;           // 0-100
    fit_explanation: string;
    signals: string[];
    red_flags: string[];
  };
  angles: Array<{
    name: string;
    hook: string;
    why: string;
    opening_line: string;
  }>;
  qualifying_criteria: string[];
  enrichment_urls: string[];
  apollo_companies: Array<{
    id: string;
    name: string;
    website_url: string;
    industry: string;
    employee_count: number;
    city: string;
    state: string;
    country: string;
    keywords: string[];
    technologies: string[];
    annual_revenue: number;
  }>;
}
```

---

## New Aggregate: `ProspectIntel`

One JSONL event stream per import session. Immutable snapshot.

```rust
// src/domain/prospect_intel.rs (NEW FILE)

pub struct ProspectIntel {
    pub id: String,
    pub imported_at: String,                    // ISO 8601

    // NAICS / ICP
    pub naics_code: Option<String>,
    pub naics_label: Option<String>,
    pub summary: String,
    pub icp_fit_score: Option<u8>,
    pub icp_fit_explanation: Option<String>,
    pub signals: Vec<String>,
    pub red_flags: Vec<String>,
    pub qualifying_criteria: Vec<String>,

    // Angles
    pub angles: Vec<ProspectAngle>,

    // Company links (CRM aggregate IDs, populated after import)
    pub company_ids: Vec<String>,
    pub apollo_raw: Vec<serde_json::Value>,     // original Apollo company objects, immutable

    pub enrichment_urls: Vec<String>,
    pub archived: bool,
}

pub struct ProspectAngle {
    pub name: String,
    pub hook: String,
    pub why: String,
    pub opening_line: String,
}

pub enum ProspectIntelEvent {
    Imported {
        naics_code: Option<String>,
        naics_label: Option<String>,
        summary: String,
        icp_fit_score: Option<u8>,
        icp_fit_explanation: Option<String>,
        signals: Vec<String>,
        red_flags: Vec<String>,
        qualifying_criteria: Vec<String>,
        angles: Vec<ProspectAngle>,
        apollo_raw: Vec<serde_json::Value>,
        enrichment_urls: Vec<String>,
        imported_at: String,
    },
    CompaniesLinked {
        company_ids: Vec<String>,
    },
    Archived {},
}
```

**Must register in:**
- `src/lib.rs` — aggregate type in `generate_handler!`
- `src/commands.rs` — `AGGREGATE_TYPES` constant

---

## New Tauri IPC Commands

```rust
/// Import a full ProspectFold intel payload from clipboard.
/// Orchestrates: ProspectIntel creation + Company batch create/merge + Note per company.
#[tauri::command]
pub async fn import_prospect_intel(
    payload: ProspectIntelV2Payload,
    company_actions: Vec<CompanyImportAction>,   // user's per-company CREATE/MERGE/SKIP decision
    state: State<'_, AppState>,
) -> Result<ImportIntelResult, AppError>

pub struct CompanyImportAction {
    pub apollo_id: String,
    pub action: CompanyAction,            // Create | Merge(existing_id) | Skip
}

pub enum CompanyAction {
    Create,
    Merge { existing_company_id: String },
    Skip,
}

pub struct ImportIntelResult {
    pub intel_id: String,
    pub companies_created: u32,
    pub companies_merged: u32,
    pub companies_skipped: u32,
    pub company_ids: Vec<String>,
    pub note_ids: Vec<String>,
}

/// Fuzzy-match a company by name and/or URL against existing CRM companies.
/// Returns up to 5 candidates with a match confidence score.
#[tauri::command]
pub async fn find_company_by_name_or_url(
    name: String,
    url: Option<String>,
    state: State<'_, AppState>,
) -> Result<Vec<CompanyMatchCandidate>, AppError>

pub struct CompanyMatchCandidate {
    pub company_id: String,
    pub company_name: String,
    pub website: Option<String>,
    pub confidence: f32,              // 0.0 - 1.0
}

/// List all ProspectIntel sessions, most recent first.
#[tauri::command]
pub async fn list_prospect_intel_sessions(
    limit: u32,
    offset: u32,
    state: State<'_, AppState>,
) -> Result<PaginatedResult<ProspectIntelSummary>, AppError>

pub struct ProspectIntelSummary {
    pub id: String,
    pub imported_at: String,
    pub naics_label: Option<String>,
    pub icp_fit_score: Option<u8>,
    pub company_count: u32,
    pub angle_count: u32,
}

/// Get all intel sessions that reference a specific company.
#[tauri::command]
pub async fn get_intel_for_company(
    company_id: String,
    state: State<'_, AppState>,
) -> Result<Vec<ProspectIntelSummary>, AppError>

/// Get full detail for one intel session.
#[tauri::command]
pub async fn get_prospect_intel(
    id: String,
    state: State<'_, AppState>,
) -> Result<Option<ProspectIntelDetail>, AppError>

pub struct ProspectIntelDetail {
    // All ProspectIntel fields + company names resolved
    pub id: String;
    pub imported_at: String;
    pub naics_code: Option<String>;
    pub naics_label: Option<String>;
    pub summary: String;
    pub icp_fit_score: Option<u8>;
    pub icp_fit_explanation: Option<String>;
    pub signals: Vec<String>;
    pub red_flags: Vec<String>;
    pub qualifying_criteria: Vec<String>;
    pub angles: Vec<ProspectAngle>;
    pub companies: Vec<CompanyWithId>;        // resolved from company_ids
    pub enrichment_urls: Vec<String>;
}
```

---

## Companion Note Format (auto-created per company)

When a company is imported, a Note is created with `company_id` set. Body:

```markdown
## ProspectFold Intel — [Company Name]
Imported: 2026-03-10 | ICP Score: 85 | NAICS: 541511 (Custom Software Dev)

**Why target them:** [icp_fit_explanation]

**Signals confirmed for this ICP:**
- Hiring rapidly for engineering roles
- Using Postgres + AWS (our stack)

**Red flags:**
- Series A only — may not have budget yet

**Qualifying criteria:**
- 50-500 employees ✓
- Has a dedicated engineering org ✓
- In expansion phase ✓

**Angles:**
1. **Technical Debt Automation** — Hook: "Your Postgres migration is costing you 3 sprints/quarter"
2. **Onboarding Speed** — Hook: "New devs at your scale take 6 weeks to ship"

**From Apollo:**
Industry: B2B SaaS | Employees: 150 | Revenue: $5M | Tech: React, AWS, Postgres
```

---

## New UI Components / Routes

### `/prospect-intel` — Intel Sessions List
```
+--------------------------------------------------+
|  ProspectFold Intel                [Paste from ProspectFold]
+--------------------------------------------------+
|  Mar 10, 2026 — Custom Software Dev (ICP 85)
|  12 companies imported · 3 angles
|  [View]
|  ------------------------------------------------
|  Mar 3, 2026 — Healthcare SaaS (ICP 72)
|  8 companies imported · 2 angles
|  [View]
+--------------------------------------------------+
```

### `/prospect-intel/:id` — Intel Detail View
```
+--------------------------------------------------+
| ← Back    Custom Software Dev                    |
| NAICS 541511  |  ICP Score: 85/100               |
+--------------------------------------------------+
| SUMMARY                                          |
| [icp_fit_explanation text]                       |
|                                                  |
| ANGLES (3)          SIGNALS (5)   RED FLAGS (1)  |
| › Technical Debt    ✓ Hiring fast  △ Series A    |
| › Onboarding Speed  ✓ Postgres     only          |
| › AI Readiness      ✓ AWS stack                  |
|                                                  |
| COMPANIES (12)                                   |
| Acme Corp      → [View in CRM]                   |
| Widget Co      → [View in CRM]                   |
| ...                                              |
+--------------------------------------------------+
```

### Company Detail — "Intel" tab (add to existing)
```
Interactions | Notes | Deals | Tasks | Intel
                                      ↑ new tab

Intel tab shows:
- 3 intel snapshots (most recent first)
- ICP score timeline: 72 → 85 (score improved after re-research)
- Angles that have been used against this company
```

### Confirmation Modal (shown before import)
```
+--------------------------------------------------+
|  Import ProspectFold Intel
+--------------------------------------------------+
|  NAICS: 541511 — Custom Software Dev
|  ICP Score: 85  |  12 companies  |  3 angles
|
|  Company Actions:
|  ☑ Acme Corp          [CREATE new]  ▼
|  ☑ Widget Co          [MERGE → Widget Corp (CRM)]  ▼
|  ☐ DataFlow Inc       [SKIP]  ▼
|  ... (show all 12, scrollable)
|
|  ☑ Create a Note on each imported company
|
|  [Cancel]                    [Import 11 Companies]
+--------------------------------------------------+
```

---

## Conflict Resolution Logic

| Name match | Domain match | Default action |
|---|---|---|
| > 95% | same TLD | Auto-MERGE (no prompt) |
| 80–95% | any | Show MERGE option (user decides) |
| < 80% | same TLD | Show MERGE option |
| < 80% | different | Auto-CREATE |
| exact | exact | Auto-MERGE (silent) |

---

## Intel Versioning

Each `import_prospect_intel` call creates a **new** ProspectIntel stream with a unique ID. Old snapshots are never overwritten. A company can be referenced by N intel sessions over time.

This gives the senior dev a natural "time-travel" surface: "View intel from March 3" vs "View intel from March 10" for the same company.

---

## Out of Scope

- Modifying ProspectFold's output format (it already writes the correct payload)
- Automatic background sync (user must click "Paste from ProspectFold" manually)
- Merging intel fields at the ProspectIntel level (ProspectIntel is immutable once created)
- Real-time Apollo data refresh from within EventFold

---

## Success Metrics

- Time from ProspectFold run completion → companies in CRM: **< 30 seconds**
- Zero manual re-keying of company names for runs that use this flow
- Company duplicate rate drops below 5% (from current ~30% from manual entry)

---

## Open Questions for Senior Dev

1. Is the fuzzy match for company dedup best done in Rust (Levenshtein on `AppState`)? Or should the frontend handle it by fetching all companies and doing client-side matching?
2. The `ProspectIntel` aggregate creates N Company commands atomically — does the event store support command batches, or does each Company creation need to be an independent `invoke` call from the frontend?
3. Should the companion Note be tagged/typed differently from user-created Notes so it's visually distinct in the Note list? (e.g., `note_source: "prospect_intel"`)
4. Does the existing `AGGREGATE_TYPES` constant need to be updated in a specific place beyond `lib.rs`?
