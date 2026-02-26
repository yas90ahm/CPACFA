# Deep Dive Analysis: HITL and GL Ingestion Output

*Analyzed from actual executable code (no documentation assumptions).*

---

## TASK 1: GL INGESTION FLOW (STEP-BY-STEP)

══════════════════════════════════════════════════════════════════════════════

**INPUT:** POST /api/gl/ingest with multipart CSV file, query ?period=2024-Q1

─────────────────────────────────────────────────────────────────────────────

### STEP 1: Parse CSV

- **File:** `src/services/gl_upload_service.ts` → `parseGLCsv(fileBuffer)`
- **What it does:** Parses CSV with csv-parse (columns: true, trim, bom). Maps headers via GL_COLUMN_MAP (entry_id, entry_date, account_code, debit, credit, description).
- **Output:** `GLUploadRow[]` — each row has entry_id, entry_date, account_code, debit, credit, description.
- **Errors caught:**
  - Missing account_code → row skipped (continue)
  - Missing account_code column OR missing both debit and credit → throws `'CSV must have account_code...'`
  - Empty file → returns []; uploadGLForPeriod returns early with errors: ['No data in CSV file']

### STEP 2: Group by Entry ID

- **File:** `src/services/gl_upload_service.ts` → `groupAndNumberLines(rows)`
- **What it does:** Groups rows by entry_id into Map<entry_id, rows[]>. Assigns line_number (1-based) per entry.
- **Output:** `GeneralLedgerLine[]` — flat list of lines with entry_id, line_number, entry_date, account_code, debit, credit, description.
- **Logic:** If entry_id column missing, uses `ENTRY-${i+1}` as synthetic ID.

### STEP 3: Validate Per Entry

- **File:** `src/services/gl_upload_service.ts` → `validateGLEntries(pool, tenantId, lines, tolerance=0.01)`
- **For each entry_id group:**
  - **Check:** `|totalDebits - totalCredits| <= tolerance`
  - **Tolerance:** 0.01 (hardcoded in validateGLEntries)
  - **Pass:** `imbalance <= 0.01` → entry added to `balancedEntries`
  - **Fail:** `imbalance > 0.01` → entry added to `imbalancedEntries` with totalDebits, totalCredits, imbalance

- **Additional checks (aggregate, not per-entry):**
  - Lines with both debit > 0 and credit > 0 → `errors.push(...)`
  - Account codes not in COA → `errors.push('Invalid account codes...')`

### STEP 4: FORK — Balanced vs Imbalanced

**PATH A: BALANCED ENTRIES (debits = credits within 0.01)**

- **Immediate action:** `glRepository.upsertGLForPeriod()` writes lines to `core.general_ledger`
- **Saved to:** `core.general_ledger` (tenant_id, period_label, entry_id, line_number, entry_date, account_code, debit, credit, description)
- **Next step:** `deriveAndPersistTB()` called — builds TB from saved GL, saves to `period_trial_balance` with source `gl_derived`

**PATH B: IMBALANCED ENTRIES (debits ≠ credits)**

- **Immediate action:** NOT saved to any table. Kept in memory for response only.
- **NOT saved to:** `core.general_ledger`
- **Instead:** Returned in API response as `imbalancedEntries` array
- **Data captured:** `{ entry_id, totalDebits, totalCredits, imbalance, lines }` — no DB persistence
- **Next step:** Nothing. No staging, no AI, no follow-up flow. Controller must fix externally.

### STEP 5: AI Analysis (GL Ingestion)

**NONE.** No AI is invoked during GL ingestion. The gl_upload_service has zero imports or calls to:
- `submitToStaging`
- `agentic_gap_analyzer`
- `runAdvisor`
- Any LLM/AI service

**Contrast:** Trial balance ingest (different flow, POST /api/trial-balance/parser/ingest) does call runClassifier and runAdvisor when TB is imbalanced and stages to HITL. GL ingest does not.

### STEP 6: TB Derivation

- **File:** `src/services/gl_upload_service.ts` → `deriveAndPersistTB()` (internal)
- **Triggered:** Immediately after saving balanced entries to GL (during upload, same request)
- **Input:** GL from `core.general_ledger` (just saved), COA from `core.tenant_chart_of_accounts`
- **Process:**
  - `buildDerivedTrialBalance(pool, tenantId, periodLabel)` — gl_to_tb_aggregation_service
  - Aggregate by account_code, sum debits/credits
  - Map account_type from COA
  - `saveUnadjustedFromGLDerived()` → `period_trial_balance` with source `gl_derived`
- **Validation:** TB validation (D=C, A=L+E) is NOT run in deriveAndPersistTB. It is done on GET /api/gl/trial-balance. Persist does not throw on validation failure.
- **Failure handling:** If deriveAndPersistTB throws, error is logged; GL upload still considered succeeded (do not throw).

### STEP 7: Response to User

**Actual API response structure (from gl/ingest.ts and gl_upload_service.ts):**

```json
{
  "status": "partial" | "success",
  "message": "244 entries saved, 3 entries imbalanced" | "247 entries uploaded successfully",
  "success": false | true,
  "balancedCount": 244,
  "imbalancedCount": 3,
  "imbalancedEntries": [
    {
      "entry_id": "JE-0042",
      "totalDebits": 10000.00,
      "totalCredits": 9500.00,
      "imbalance": 500.00,
      "lines": [
        {
          "entry_id": "JE-0042",
          "line_number": 1,
          "entry_date": "2024-03-15",
          "account_code": "1000",
          "debit": 10000.00,
          "credit": 0,
          "description": "Payment received",
          "tenant_id": "...",
          "period_label": "2024-Q1"
        },
        {
          "line_number": 2,
          "account_code": "4000",
          "debit": 0,
          "credit": 9500.00,
          "description": "Payment received"
        }
      ]
    }
  ],
  "errors": ["Invalid account codes (not in COA): 9999"]
}
```

**What is NOT in the response:**
- `derivedTB` — NOT returned. Controller must call GET /api/gl/trial-balance?period=X separately.
- `suggestedFix` — NOT present. No AI suggestions for GL imbalanced entries.
- `stagedId` — NOT present. Imbalanced entries are not staged to HITL.

**HTTP status:**
- 200: All balanced (success)
- 207: Some imbalanced (partial)
- 400: Validation errors (e.g., invalid COA) or no file

---

## TASK 2: HITL STAGING ANALYSIS

══════════════════════════════════════════════════════════════════════════════

### Q1: What triggers HITL staging?

| Trigger | Source | Applies to GL ingest? |
|---------|--------|------------------------|
| Imbalanced trial balance upload | trial-balance/ingest.ts | **NO** — trial balance ingest only |
| Agent proposes high-value JE | proposeTrialBalanceAdjustment, buildFinancialStatements | NO |
| Agent proposes policy change / flag override | result_generator, etc. | NO |
| Critical severity from agentic assessment | trial-balance/parser.ts | NO (TB parser) |

**GL imbalanced entries:** Do NOT trigger HITL staging. They are returned in the response only.

### Q2: What data goes into HITL staging?

**Table:** `tenant_hitl_staging` (migration 062)

| Column | Purpose |
|--------|---------|
| id | UUID (e.g. hitl-1234567890-abc) |
| tenant_id | Tenant |
| proposed_action | Human-readable description (e.g. "Trial balance upload out of balance by 500. Fix via HITL resolve-ingest.") |
| justification | Why (e.g. "Debits X != Credits Y") |
| status | pending | approved | rejected |
| type | journal_entry | policy_change | adjustment | flag_override | other |
| amount | Numeric (imbalance or transaction amount) |
| payload | JSONB — structure varies by kind |
| created_at, updated_at | Timestamps |
| approved_at, approved_by | Set when approved |
| rejected_at, rejected_reason | Set when rejected |

**For kind: trial_balance_ingest (TB ingest only):**
```json
{
  "kind": "trial_balance_ingest",
  "rawRows": [...],
  "periodLabel": "2024-Q1",
  "imbalanceAmount": 500,
  "fileName": "upload.csv",
  "totalDebits": 87000,
  "totalCredits": 86500,
  "source_type": "csv_upload",
  "source_hash": "...",
  "ingestion_timestamp": "..."
}
```

### Q3: Is AI involved in HITL? How?

**For trial balance ingest (imbalanced TB):**
- **AI Service:** `ai_orchestrator.runClassifier`, `ai_orchestrator.runAdvisor`
- **Triggered when:** TB upload does not balance (trial-balance/ingest flow)
- **runClassifier:** Classifies source lines (object_type, fs_placement, suggested_accounts)
- **runAdvisor:** Calls `agentic_gap_analyzer.suggestJournalEntriesForImbalance()` — proposes correcting JE lines
- **Output:** Proposals saved to `tenant_ai_proposals`; attached to staging item via stagingId
- **AI cannot enforce:** Human must supply correction via POST /api/hitl/resolve-ingest. Scope: no AI-generated amounts.

**For GL ingest:** No AI. No staging.

### Q4: What can DETERMINISTIC engine detect?

| Rule | Location | Condition | Output |
|------|----------|-----------|--------|
| Per-entry debits = credits | gl_upload_service.validateGLEntries | \|D - C\| > 0.01 | balancedEntries vs imbalancedEntries |
| Line cannot have both debit and credit | gl_upload_service.validateGLEntries | debit>0 and credit>0 | errors[] |
| Account must exist in COA | gl_upload_service.validateGLEntries | account_code not in COA | errors[] |
| TB debits = credits | gl_to_tb_aggregation_service.validateDerivedTB | \|total_debits - total_credits\| > 0.01 | errors[] |
| A = L + E | gl_to_tb_aggregation_service.validateDerivedTB | \|assets - (liabilities+equity)\| > 0.01 | errors[] |

### Q5: Deterministic vs AI

**DETERMINISTIC DETECTION:**
- Examples: Per-entry balance, COA validation, TB D=C, A=L+E
- Always fires when condition met
- Cannot be overridden by AI
- Output: hard split (balanced vs imbalanced), error messages

**AI DETECTION (TB ingest only, not GL):**
- Examples: Classification (object_type, fs_placement), suggested correcting JE lines
- May fire when TB imbalanced and staged
- Can be overridden: human supplies adjustment in resolve-ingest
- Output: proposals in tenant_ai_proposals; advisory only

### Q6: What does the controller see in HITL? (for TB ingest)

- **Entry details:** Staging item with proposedAction, justification, payload (rawRows, periodLabel, imbalanceAmount)
- **Problem description:** "Trial balance upload out of balance by X. Fix via HITL resolve-ingest."
- **Severity:** amount field; no explicit severity level
- **Suggested fix:** From runAdvisor → tenant_ai_proposals (if AI available). Human must supply amounts in resolve-ingest.
- **Actions available:** POST /api/hitl/resolve-ingest with { stagedId, adjustment: JournalEntryProposal[] }
- **Next steps:** After resolve-ingest, adjustment saved to period_trial_balance via bridge command; shadow audit runs.

---

## TASK 3: TB DERIVATION TIMING

══════════════════════════════════════════════════════════════════════════════

### Q1: When is TB built from GL?

| Trigger | Function | Called from | Automatic / On-demand |
|---------|----------|-------------|------------------------|
| During GL upload (balanced entries saved) | deriveAndPersistTB → buildDerivedTrialBalance | gl_upload_service.uploadGLForPeriod | Automatic (same request) |
| Explicit GET | buildDerivedTrialBalance | GET /api/gl/trial-balance | On-demand |
| Certification | getTrialBalanceForCertification (reads period_trial_balance or derives) | close_session_service.certifyCloseSession | During certify |

### Q2: Is TB built DURING upload or AFTER?

**DURING upload.** Evidence:
- gl_upload_service.uploadGLForPeriod calls deriveAndPersistTB immediately after glRepository.upsertGLForPeriod
- deriveAndPersistTB calls buildDerivedTrialBalance and saveUnadjustedFromGLDerived

**Separate endpoint:** GET /api/gl/trial-balance builds TB on-demand (does not persist; returns in response). Certification uses getTrialBalanceForCertification which may use stored TB (source gl_derived) or derive.

### Q3: What happens to TB after it's built?

**Storage:**
- Table: `period_trial_balance`
- Source: `gl_derived`
- Includes: entries (JSONB), uploaded_at, uploaded_by (derivedBy)
- Used by: certification (getTrialBalanceForCertification), export gate (getAdjustedTrialBalance → materiality)

**Validation:**
- D=C: validateDerivedTB (0.01 tolerance)
- A=L+E: validateDerivedTB (0.01 tolerance)
- On failure: validateDerivedTB returns { valid: false, errors }. GET /api/gl/trial-balance returns 422 with errors. deriveAndPersistTB does NOT run validateDerivedTB; it persists regardless.

### Q4: Can controller see TB immediately after upload?

**Yes, but not in the upload response.** The upload response does NOT include derivedTB. Controller must:
- Call GET /api/gl/trial-balance?period=2024-Q1
- Returns: `{ status: 'valid', derivedTB: { entries, total_debits, total_credits, balance_sheet_totals } }` or 422 if validation fails

---

## TASK 4: CONTROLLER'S VIEW

══════════════════════════════════════════════════════════════════════════════

### SCENARIO: Controller uploads GL with 247 entries, 3 imbalanced

**Actual response structure:**

```json
{
  "status": "partial",
  "message": "244 entries saved, 3 entries imbalanced",
  "success": false,
  "balancedCount": 244,
  "imbalancedCount": 3,
  "imbalancedEntries": [
    {
      "entry_id": "JE-0042",
      "totalDebits": 10000.00,
      "totalCredits": 9500.00,
      "imbalance": 500.00,
      "lines": [
        { "line_number": 1, "account_code": "1000", "debit": 10000.00, "credit": 0, "description": "Payment received" },
        { "line_number": 2, "account_code": "4000", "debit": 0, "credit": 9500.00, "description": "Payment received" }
      ]
    }
  ]
}
```

**No suggestedFix, no aiSuggestion, no stagedId.**

### WHAT CONTROLLER CAN DO

| Action | Endpoint | Notes |
|--------|----------|-------|
| Fix CSV and re-upload | POST /api/gl/ingest | Correct imbalanced entries in source file, re-upload |
| View saved GL | GET /api/gl?period=X | See balanced entries only |
| View derived TB | GET /api/gl/trial-balance?period=X | See TB from balanced GL |
| Export GL | GET /api/gl/export?period=X&format=csv | Export saved entries |
| View single entry | GET /api/gl/entries/:entryId?period=X | Inspect balanced entry |

### WHAT CONTROLLER CANNOT DO

| Limitation | Reason |
|------------|--------|
| Resolve imbalanced GL entries via API | No staging, no resolve-ingest for GL. resolve-ingest is for trial_balance_ingest only |
| Get AI suggestions for imbalanced GL entries | No AI in GL flow |
| See derived TB in upload response | derivedTB not returned; must call GET /api/gl/trial-balance |
| Stage imbalanced entries for later fix | gl_upload_service does not call submitToStaging |

---

## TASK 5: GAPS AND OPPORTUNITIES

══════════════════════════════════════════════════════════════════════════════

### WHAT WORKS WELL

- **Deterministic per-entry validation:** Clear pass/fail on debits = credits
- **COA validation:** Catches invalid account codes before save
- **Immediate TB derivation:** TB persisted for certification/export
- **Transparent response:** Imbalanced entries returned with full line-level detail

### WHAT'S MISSING

| Gap | Description |
|-----|-------------|
| **No HITL staging for GL imbalanced entries** | Comment says "returns imbalanced for HITL" but nothing stages them. Controller gets data in response only; must fix externally |
| **No AI suggestions for GL imbalance** | Trial balance ingest gets runAdvisor proposals; GL gets none |
| **No resolve flow for GL** | resolve-ingest expects kind: trial_balance_ingest. No equivalent for GL |
| **derivedTB not in response** | Controller must make second call to GET /api/gl/trial-balance |
| **No suggestedFix in imbalancedEntries** | No guidance on how to fix (e.g., which line might be wrong) |

### OPPORTUNITIES FOR ENHANCEMENT

1. **Stage GL imbalanced entries:** When imbalancedCount > 0, call submitToStaging/createStagingItem with kind: gl_ingest, payload: { entry_id, lines, totalDebits, totalCredits, imbalance, periodLabel }. Add POST /api/hitl/resolve-gl-ingest to apply correction and upsert to GL.

2. **Include derivedTB in response:** When success and balancedCount > 0, include derivedTB in response so controller sees TB in one call.

3. **AI suggestions for GL imbalance:** Invoke runAdvisor or suggestJournalEntriesForImbalance with imbalance + unmapped rows; attach proposals to response or staging item.

4. **Deterministic hinting:** e.g., "Entry JE-0042: credits 500 short — consider adding credit line or reducing debit" based on imbalance sign and magnitude.
