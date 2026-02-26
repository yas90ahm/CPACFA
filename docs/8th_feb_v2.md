# Test Summary: AI Boundary Enforcement → Present

**Document:** 8th Feb v2  
**Scope:** All tests and related work from "Integration test for AI boundary enforcement" through to present.

---

## 1. AI Mutation Boundaries (Integration)

**File:** `tests/integration/ai_mutation_boundaries.test.ts`  
**Purpose:** Enforce that AI proposals cannot mutate deterministic tables; only human approval can.

| Test | Description |
|------|-------------|
| **1** | AI proposal does not mutate `period_trial_balance` — imbalanced TB → HITL staging; AI proposals; TB remains empty |
| **2** | Human approval mutates `period_trial_balance` — resolve-ingest → TB populated; staging approved |
| **3** | AI cannot write to deterministic tables — code audit: zero direct imports of `period_trial_balance_repository`, `ledger_snapshot_repository`, `close_session_repository`, `journal_entry_repository` in `src/ai` or `src/agents` |

**Status:** ✓ All 3 tests pass

---

## 2. Export Certified Gate Isolation Fix

**File:** `tests/integration/export_certified_gate.test.ts`  
**Change:** Fixed `no_overlapping_sessions` failures by using unique `entityId` per run:  
`entityId = \`entity-export-gate-${Date.now()}\``

**Status:** ✓ Tests pass repeatedly without session conflicts

---

## 3. Large Trial Balance Performance

**File:** `tests/integration/large_trial_balance.test.ts`  
**Purpose:** Validate TB ingest at scale.

| Row count | Result | Time |
|-----------|--------|------|
| 1,000 | ✓ 200 | ~3s |
| 10,000 | ✓ 200 (full certify + export) | ~6s |
| 50,000 | ✓ 200 or 413 | ~104s |
| 100,001 | ✓ 413 | ~1s |

**Status:** ✓ All 4 tests pass

---

## 4. Large TB Performance Results (Analysis)

**File:** `analysis/LARGE_TB_PERFORMANCE_RESULTS.md`  
**Content:** Bottleneck analysis, test assertions, recommendations (batching, lazy classification, async ingest).

---

## 5. Trial Balance Parsing Edge Cases

**File:** `tests/integration/trial_balance_parsing_edge_cases.test.ts`  
**Purpose:** CSV/XLSX parsing robustness.

| # | Edge case | Result |
|---|-----------|--------|
| 1 | CSV with BOM | ✓ |
| 2 | CSV with Windows line endings (\r\n) | ✓ |
| 3 | CSV with quoted fields containing commas | ✓ |
| 4 | CSV with extra columns | ✓ |
| 5 | CSV with missing columns (no Debit/Credit) | ✓ |
| 6 | XLSX with multiple sheets | ✓ |
| 7 | XLSX with formulas | ✓ |
| 8 | Very long account names (>255 chars) | ✓ |
| 9 | Scientific notation (1.23E+05) | ✓ |
| 10 | Negative amounts in parentheses (1000.00) | ✓ |

**Parser changes:**
- `fileIngestion.ts`: `bom: true` for CSV
- `parser_utils.ts`: Parentheses in Debit/Credit columns via `Math.abs`

**Status:** ✓ All 14 tests pass

---

## 6. Startup Validation

**File:** `src/startup_validation.ts` + `tests/unit/startup_validation.test.ts`  
**Purpose:** Check prerequisites before server starts.

**Checks:** DATABASE_URL, DB connection, migrations, JWT_SECRET (when REQUIRE_AUTH=true), storage path, env consistency (MODE=prod rules).

**Unit tests:** 13 tests for `validateEnv` (DATABASE_URL, JWT_SECRET, MODE=prod rules).

**Status:** ✓ All 13 tests pass

---

## 7. Snapshot Hash Collision

**File:** `tests/integration/snapshot_hash_collision.test.ts`  
**Purpose:** Verify snapshot hash determinism and collision resistance.

| Test | Assertion |
|------|-----------|
| 1 | Same input → same hash |
| 2 | Slightly different input (1 char) → different hash |
| 3 | Reordered entries → same hash |
| 4 | Float drift within rounding → same hash |

**Status:** ✓ All 4 tests pass

---

## 8. Evidence Upload Limits

**File:** `tests/integration/evidence_upload_limits.test.ts`  
**Purpose:** Evidence file size and type enforcement for `POST /api/close/journal-entries/:id/attachments`.

| Test | Result |
|------|--------|
| 1. Upload 1MB PDF | 201 |
| 2. Upload 19MB PDF (under limit) | 201 |
| 3. Content-Length 21MB | 413 Payload Too Large |
| 4. Content-Length 100MB | 413 (reject before body read) |
| 5. Non-PDF (.exe) | 400 with clear error |

**Code changes in `close_journal_entries.ts`:**
- Content-Length check before body read
- Multer error handling (413 for size, 400 for type)
- Message: "File too large, maximum 20MB."
- Configurable via `EVIDENCE_ATTACHMENT_MAX_BYTES`

**Status:** ✓ All 5 tests pass

---

## Supporting Work (Flow Verification)

**Files:** `analysis/FLOW_VERIFICATION_REPORT.md`, `analysis/FLOW_E2E_TEST_REPORT.md`  
**Content:** Flow verification against codebase and E2E test assessment for TB ingest, close session certification, export gating, audit ledger chain, snapshot determinism, and AI boundaries.

---

## Rollup

| Category | File(s) | Tests | Status |
|----------|---------|-------|--------|
| AI boundaries | `ai_mutation_boundaries.test.ts` | 3 | ✓ |
| Export certified gate | `export_certified_gate.test.ts` | — | ✓ fixed |
| Large TB | `large_trial_balance.test.ts` | 4 | ✓ |
| TB parsing edge cases | `trial_balance_parsing_edge_cases.test.ts` | 14 | ✓ |
| Startup validation | `startup_validation.test.ts` | 13 | ✓ |
| Snapshot hash | `snapshot_hash_collision.test.ts` | 4 | ✓ |
| Evidence upload | `evidence_upload_limits.test.ts` | 5 | ✓ |
| **Total new/updated tests** | | **43** | **✓** |
