# BLIND MODEL QA REVIEW -- Financial Close Engine
**Auditor**: Model QA Specialist (Independent)
**Date**: 2026-03-14
**Scope**: Mathematical correctness of GAAP financial statement generation
**Files Reviewed**: 9 source files + 8 migration files (SQL triggers/schemas)

---

## 1. SIGN CONVENTION

**Grade: CORRECT**

### Mechanism

`netAmount()` in `financialStatements.ts` (line 83-92):
1. Computes `net = debit - credit` using `minus()` (Decimal.js)
2. Determines if the account's `fsLineId` is in `CREDIT_POSITIVE_FS_LINES`
3. If credit-positive: returns `-net` (flips sign so credit-heavy accounts display positive)
4. If not credit-positive: returns `net` as-is

### Trace-through of all six test cases

**Cash** (asset, debit-normal, fsLineId = `fs_asset_cash`):
- `fs_asset_cash` is NOT in `CREDIT_POSITIVE_FS_LINES`
- net = 100,000 - 0 = 100,000
- creditPositive = false, signed = net = +100,000
- **Displays: +100,000. CORRECT.**

**Accounts Payable** (liability, credit-normal, fsLineId = `fs_liability_ap`):
- `fs_liability_ap` IS in `CREDIT_POSITIVE_FS_LINES`
- net = 0 - 50,000 = -50,000
- creditPositive = true, signed = -(-50,000) = +50,000
- **Displays: +50,000. CORRECT.**

**Revenue** (credit-normal, fsLineId = `fs_revenue`):
- `fs_revenue` IS in `CREDIT_POSITIVE_FS_LINES`
- net = 0 - 200,000 = -200,000
- creditPositive = true, signed = -(-200,000) = +200,000
- **Displays: +200,000. CORRECT.**

**Accumulated Depreciation** (contra-asset, credit-normal, fsLineId = `fs_asset_ppe_accum_dep`):
- `fs_asset_ppe_accum_dep` is NOT in `CREDIT_POSITIVE_FS_LINES`
- net = 0 - 80,000 = -80,000
- creditPositive = false, signed = net = -80,000
- **Displays: -80,000 (reduces total assets). CORRECT.**

**Treasury Stock** (contra-equity, debit-normal, fsLineId = `fs_equity_treasury`):
- `fs_equity_treasury` IS in `CREDIT_POSITIVE_FS_LINES` (line 61)
- net = 15,000 - 0 = +15,000
- creditPositive = true, signed = -(+15,000) = -15,000
- **Displays: -15,000 (reduces total equity). CORRECT.**

**Sales Returns** (contra-revenue, debit-normal, fsLineId = `fs_revenue_contra`):
- `fs_revenue_contra` IS in `CREDIT_POSITIVE_FS_LINES` (line 65)
- net = 10,000 - 0 = +10,000
- creditPositive = true, signed = -(+10,000) = -10,000
- **Displays: -10,000 (reduces total revenue). CORRECT.**

### Assessment
The sign convention is well-designed and covers all five contra-account patterns (contra-asset, contra-equity, contra-revenue). The code comments at lines 36-48 explicitly document the rationale for each category. This is a clean implementation.

---

## 2. DECIMAL PRECISION

**Grade: CORRECT**

### `src/utils/decimal.ts` provides:
| Function     | Purpose                          | Precision |
|-------------|----------------------------------|-----------|
| `from()`    | Create Decimal from number/string | raw       |
| `sumRound2()` | Sum array via Decimal accumulator | 2 dp      |
| `minus()`   | a - b                            | 2 dp      |
| `plus()`    | a + b                            | 2 dp      |
| `mul()`     | a * b                            | 2 dp      |
| `div()`     | a / b                            | 2 dp      |
| `round2()`  | Round to 2 dp                    | 2 dp      |
| `round4()`  | Round to 4 dp (ratios)           | 4 dp      |
| `absGt()`   | |a - b| > tolerance              | Decimal   |
| `absLt()`   | |a - b| <= tolerance             | Decimal   |
| `normalizeMoney()` | Canonical string "1234.56" | 2 dp fixed |

### Scan results for `parseFloat / Number() / toFixed / Math.round`
All 50 hits reviewed. Categorized:

**Financial paths (safe):**
- `decimal.ts` itself: all `.toNumber()` calls follow `.toDecimalPlaces(2)` -- safe
- `number_provenance_validator.ts`: uses `parseFloat` to parse user-visible tokens, then immediately passes through `from().toDecimalPlaces(2)` -- safe
- `period_reconciliation_service.ts` line 354-356: uses `Number()` to read DB string columns (`unexplainedVariance`, `toleranceAmount`) -- these are already NUMERIC(20,2) in PostgreSQL, so no precision loss

**Non-financial paths (no risk):**
- `agents/tools/index.ts`: `Number()` on DB row fields already stored as NUMERIC(20,2)
- `agents/cfa/benchmark.ts`: `parseFloat` on PE ratios / EV/EBITDA -- display-only analytics, not financial values
- `agents/cfa/index.ts`: `.toFixed(1)` on DuPont ratios -- analytics display
- `scripts/map_sabit_to_xbrl.ts`: similarity percentages -- non-financial
- `knowledge_base/vector_store`: similarity scores -- non-financial

**PostgreSQL schema:**
- All money columns use `NUMERIC(20,2)` (confirmed in migration 102, 121)
- Reconciliation variance, tolerance, unexplained_variance are all `NUMERIC(20,2) GENERATED ALWAYS` columns

### Assessment
No floating-point arithmetic on financial dollar values anywhere in the critical path. All financial computations route through `decimal.ts` utilities. The database enforces `NUMERIC(20,2)`. This is exemplary precision discipline.

---

## 3. STATEMENT GENERATION

**Grade: CORRECT**

### Income Statement (P&L) -- `buildProfitAndLoss()` lines 334-411

Subtotal chain (all using Decimal.js):
```
grossProfit      = minus(totalRevenue, totalCogs)              -- Revenue - COGS
operatingIncome  = minus(grossProfit, plus(totalOpex, totalUnclassifiedExpenses))  -- GP - OpEx
incomeBeforeTax  = plus(operatingIncome, totalOther)           -- OI + Other Income/Expense
netIncome        = minus(incomeBeforeTax, totalTax)            -- IBT - Tax
```

**Verification**: Revenue - COGS = GP. GP - OpEx = OI. OI + Other = IBT. IBT - Tax = NI. **CORRECT per multi-step income statement format (ASC 220).**

Note: Discontinued operations are tracked separately and reported below the line (line 408), consistent with ASC 205-20. They are NOT included in `netIncome`, which is correct GAAP presentation.

EBITDA computation (line 386): NI + Tax + Interest Expense + D&A. **CORRECT.**

### Balance Sheet -- `buildBalanceSheet()` lines 201-285

```
totalEquity = equityOnly + (totalRevenue - totalExpenses) + totalOCI
```

This rolls net income into equity for the BS equation check. Then:
```
bsDiff = totalAssets - (totalLiabilities + totalEquity)
```

If bsDiff is nonzero but within $0.01, a rounding adjustment line is added to equity. This is a common and acceptable technique for statement-level rounding.

**A = L + E is enforced by `assertIntegrityGateOrThrow()` which throws `MathematicalIntegrityError` (HTTP 422) if the equation fails beyond tolerance. CORRECT.**

### Cash Flow -- `buildCashFlowStatement()` lines 39-170

- Starts with net income (line 116): `{ label: 'Net income', amount: netIncome }`
- Adds back non-cash: depreciation, deferred tax change, unrealized FX, SBC (lines 117-122)
- Working capital changes: delta AR (negated), delta inventory (negated), delta AP (lines 123-125)
- Investing: PPE delta negated (capex vs disposal)
- Financing: debt delta, equity delta
- Net change: `endingCash - beginningCash` when prior TB available

**CORRECT indirect method per ASC 230.**

### Equity Statement -- `buildEquityChangesStatement()` lines 8-50

```
residual = closingEquity - (openingEquity + netIncome + totalOCI)
```
If residual exceeds $0.01, it is reported as "Owner contributions / distributions (net)".

**CORRECT roll-forward structure.**

---

## 4. CROSS-STATEMENT VALIDATION

**Grade: CORRECT**

### Checks in `cross_statement_validation.ts`:

| # | Check | Type | Uses Decimal.js | Assessment |
|---|-------|------|-----------------|------------|
| 1 | A = L + E | hard | Yes (`d().plus().equals()`) | CORRECT |
| 2 | IS Net Income = Equity Net Income | hard | Yes | CORRECT |
| 3 | CF ending cash = BS cash | hard | Yes | CORRECT |
| 4 | Equity closing = BS total equity | hard | Yes | CORRECT |
| 5 | RE tie: opening + changes + OCI = closing | hard | Yes | CORRECT |

Additionally:
- Missing CF or Equity statement is a **hard failure** (lines 37-51)
- All comparisons use `decimalFrom(n).toDecimalPlaces(2)` before `.equals()` -- correct precision

### Missing check (observation, not error):
**IS Net Income = CF starting Net Income** tie is absent. The CF statement does include NI as the first operating line (cashFlow.ts line 116), but the cross-statement validation does not explicitly verify this tie. This is a **low severity observation** because:
1. The CF builder directly reads `profitAndLoss.netIncome`, so by construction they match
2. The IS-to-Equity NI tie IS validated

### Assessment
All five checks are hard failures that block certification. All use Decimal.js. The check set covers the essential GAAP cross-statement ties.

---

## 5. RECONCILIATION

**Grade: CORRECT**

### Database Schema (migration 102):
```sql
variance             = gl_balance - supporting_balance           -- GENERATED ALWAYS
is_within_tolerance  = ABS(variance) <= tolerance_amount         -- GENERATED ALWAYS
unexplained_variance = (gl_balance - supporting_balance) + reconciling_items_total  -- GENERATED ALWAYS (fixed in migration 123)
```

### Key observations:

**Variance formula**: `gl_balance - supporting_balance`. **CORRECT** -- positive means GL is higher.

**Tolerance check**: `ABS(gl_balance - supporting_balance) <= tolerance_amount`. **CORRECT** -- symmetric tolerance.

**Unexplained variance**: Originally was `variance - reconciling_items_total` which was wrong (migration 102 line 23-25). **Fixed in migration 123** to `variance + reconciling_items_total`. The fix comment explains: reconciling items are signed (e.g., -2500 for an outstanding check), so adding them reduces the variance. **NOW CORRECT.**

**Completion guard** (lines 337-374):
- Cannot complete if `supportingBalance` is null (line 350)
- Cannot complete if `|unexplainedVariance| > tolerance` (line 358) -- throws error
- If variance is nonzero but within tolerance, requires a `varianceExplanation` (line 364-374)
- Requires evidence attachment (line 376-383)

**Cannot bypass**: An over-tolerance recon throws `PeriodReconciliationError('VALIDATION')`. **CORRECT.**

**Percentage tolerance**: Supported (lines 128-135). Computes absolute threshold from GL balance times percentage, then stores as `effectiveToleranceAmount`. **CORRECT.**

**Segregation of duties**: Reviewer cannot approve their own reconciliation (line 431). **CORRECT.**

---

## 6. JOURNAL ENTRY INTEGRITY

**Grade: CORRECT**

### Balance validation layers:

| Layer | Location | Mechanism |
|-------|----------|-----------|
| 1. Service: createDraftJE | journal_entry_service.ts line 67-73 | `validateBalanced()` using `sumRound2` + Decimal comparison |
| 2. Service: proposeJE | journal_entry_service.ts line 120-125 | Re-validates balance on propose |
| 3. DB trigger: on status -> 'posted' | migration 131 | `SUM(debit) != SUM(credit)` at NUMERIC(20,2) precision |

**Three layers check debit = credit.** An unbalanced JE is rejected at draft creation AND at posting. The DB trigger is defense-in-depth against direct SQL bypass.

### Immutability:
- Migration 105: DB trigger blocks UPDATE/DELETE on `journal_entries` where `status = 'posted'`
- Migration 106: DB trigger blocks UPDATE/DELETE on `journal_entry_lines` when parent JE is posted
- Migration 155: Extends immutability to `status = 'exported'` as well
- Reversal mechanism (lines 620-694): creates a NEW draft JE with flipped debits/credits; original is never modified

**Posted JEs are truly immutable.** Reversals go through the full draft -> proposed -> approved -> posted workflow.

### Segregation of duties:
- `approveJE()` line 151: `je.createdBy === approvedBy` blocked with error code `SEGREGATION`
- `isSameUserApproveAllowed()` lines 33-38: returns `false` in production regardless of env var
- In non-production: bypass only if `ALLOW_SAME_USER_APPROVE=1`

**CORRECT. Production-hardened SoD enforcement.**

### Additional controls:
- Zero-amount lines rejected (lines 60-66)
- Memo required and minimum 5 chars (lines 52-58)
- Amount provenance required for non-zero amounts (lines 80-86)
- Prior-period posting prevention via SQL check (lines 469-497)
- Shadow Auditor blocks posting on severity=block findings (lines 297-300)
- Evidence required for JEs exceeding materiality threshold (lines 264-283)

---

## 7. AUDIT TRAIL

**Grade: CORRECT**

### Hash chain mechanism (`audit_ledger_repository.ts`):

**Algorithm**: SHA-256 (`createHash('sha256')`)

**Hash payload** (8 fields):
```
tenantId, periodLabel, eventType, deterministicFlagSnapshot,
agentDissentSnapshot, userPromptRationale, previousEntryHash, createdAt
```

**Chain linkage**: Each entry's `previousEntryHash` = the `entry_hash` of the most recent prior entry for that tenant. First entry has `previousEntryHash = null`.

**Hash versions**:
- v1 (legacy): raw JSON key order
- v2 (current): canonicalized sorted keys + normalized values for deterministic verification

**Tamper protection (4 layers)**:
1. DB trigger blocks UPDATE on `audit_ledger` (migration 091)
2. DB trigger blocks DELETE on `audit_ledger` (migration 091)
3. DB trigger on INSERT enforces chain linkage -- `previous_entry_hash` must match latest `entry_hash` (migration 128)
4. Application-level chain verification walks the full chain and re-computes each hash

**Chain verification** (`verifyChainInternal`, lines 313-469):
- Fetches all entries ordered by `created_at ASC`
- For each entry: recomputes hash (using correct version), compares to stored `entry_hash`
- Validates `previous_entry_hash` matches the prior entry's hash
- Returns `{ valid: false, brokenAtEntryId }` on any mismatch

**Checkpoint optimization**: Yes (lines 322-386). Stores last verified entry ID/hash. Incremental verification fetches only entries after checkpoint. Falls back to full verification if checkpoint is invalid.

### Assessment
Append-only with DB-enforced immutability, SHA-256 hash chain with DB-enforced chain linkage, full chain verification with checkpoint optimization. This is a robust audit trail implementation.

---

## 8. CERTIFICATION

**Grade: CORRECT**

### Gates that must pass (11 hard gates, all required):

| Gate | Description |
|------|-------------|
| tb_balanced | Debits = Credits on trial balance |
| all_accounts_mapped | Every TB account mapped to reporting line |
| recons_complete | All required account reconciliations complete |
| templates_resolved | All recurring entry templates applied or skipped |
| statements_current | Statements generated and not stale |
| variances_explained | All material period-over-period variances explained |
| no_blocking_issues | Zero open blocking/critical issues |
| evidence_policy | Required evidence attached |
| checklist_complete | Close checklist items complete |
| cash_rec_complete | Bank reconciliation signed off |
| material_jes_approved | No draft/proposed JEs pending |

`canAdvance = hardGates.every(g => g.passing)` (line 210). **No gate can be bypassed.**

### Signing:
- **Algorithm**: Ed25519 (line 13 of `cert_signing.ts`)
- **What is signed**: SHA-256 hash of the certification artifact (canonicalized JSON)
- **Artifact contents**: tenant, session, period, certifiedAt/By, snapshot hash, audit chain state, cross-statement validation results, AI metadata
- **Production enforcement**: Keys MUST be set via environment variables; module throws FATAL error on startup if missing (line 77-80)
- **Development**: Auto-generates ephemeral keys with warning (line 35-50)
- **Verification**: `verifyArtifactHash()` reconstructs public key and verifies Ed25519 signature
- **Immutability**: DB trigger blocks UPDATE/DELETE on `certification_artifacts` (migration 120)

### Cross-statement validation at certification:
`runCrossStatementValidationForCertification()` runs at certification time and results are embedded in the artifact (line 41 of `certification_artifact_service.ts`). Any hard check failure blocks certification.

---

## FINDINGS SUMMARY

| # | Area | Grade | Findings |
|---|------|-------|----------|
| 1 | Sign Convention | **CORRECT** | All 6 account types produce correct display values. Contra-accounts correctly handled. |
| 2 | Decimal Precision | **CORRECT** | All financial arithmetic uses Decimal.js. No floating-point on dollar values. DB uses NUMERIC(20,2). |
| 3 | Statement Generation | **CORRECT** | Income statement subtotals, BS equation, CF indirect method, and equity roll-forward all verified. |
| 4 | Cross-Statement Validation | **CORRECT** | 5 hard checks cover BS equation, NI tie, cash tie, equity tie, RE tie. All Decimal.js. All block certification. |
| 5 | Reconciliation | **CORRECT** | Variance formula correct (fixed in migration 123). Cannot complete over tolerance. Percentage tolerance supported. SoD enforced. |
| 6 | Journal Entry Integrity | **CORRECT** | 3 layers verify balance. Posted JEs immutable via DB triggers. SoD enforced in production. Reversals create new entries. |
| 7 | Audit Trail | **CORRECT** | SHA-256 hash chain, DB triggers block UPDATE/DELETE, chain linkage enforced on INSERT, full verification with checkpoint optimization. |
| 8 | Certification | **CORRECT** | 11 hard gates, none bypassable. Ed25519 signing. Artifact is immutable. Cross-statement validation embedded. |

---

## LOW-SEVERITY OBSERVATIONS

### L1: Missing IS-to-CF Net Income Tie (Info)

`cross_statement_validation.ts` validates IS NI = Equity NI (check 2) and Equity closing = BS equity (check 4), but does not explicitly validate IS NI = CF starting NI. By construction this is guaranteed because `buildCashFlowStatement()` reads `profitAndLoss.netIncome` directly, but an explicit cross-check would add defense-in-depth.

**Impact**: None in current architecture. Theoretical risk if CF is ever reconstructed from stored data rather than computed in the same call.
**Recommendation**: Add a hard check `cf.operating[0].amount === pl.netIncome` to `runCrossStatementValidationForCertification()`.

### L2: Cash Flow Heuristic Classification (Info)

`cashFlow.ts` uses regex patterns (`/receivable/i`, `/payable/i`, `/property|plant|equipment/i`) to classify balance sheet changes into operating/investing/financing sections. While `cfClassificationMap` provides explicit override capability, accounts with non-standard naming could be misclassified.

**Impact**: The statement is labeled "estimated" when derived from TB changes. The `note` field warns users to verify with detailed transaction data.
**Recommendation**: Already mitigated by the `cfClassificationMap` override mechanism and the `estimated` flag.

### L3: Rounding Adjustment Line Disclosure (Info)

`buildBalanceSheet()` line 242-247 inserts a "Rounding adjustment" equity line when the BS imbalance is within $0.01. This is mathematically correct but should be disclosed in statement footnotes for full GAAP transparency.

**Impact**: Maximum $0.01 adjustment. Immaterial.
**Recommendation**: Ensure the "Rounding adjustment" label is visible in generated statement packages so reviewers are aware.

---

## OVERALL OPINION

**SOUND.** The financial close engine produces mathematically correct GAAP financial statements. The sign convention correctly handles all normal and contra-account patterns. All financial arithmetic uses Decimal.js with 2-decimal-place precision. The balance sheet equation (A = L + E) and trial balance integrity (Debits = Credits) are enforced at both the application layer and the database layer. Cross-statement ties are validated using Decimal.js comparisons and block certification on failure. The audit trail is cryptographically chained, append-only, and tamper-evident at the database level. Certification requires all 11 gates to pass and produces an Ed25519-signed artifact. No mathematical errors were found.
