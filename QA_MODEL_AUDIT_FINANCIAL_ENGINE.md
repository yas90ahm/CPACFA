# Model QA Audit Report -- Sabit Financial Computation Engine

**Audit Date**: 2026-03-12
**Auditor**: Model QA Specialist (Independent)
**Scope**: Reconciliation math, equity statement, XBRL mapping integrity, journal entry integrity, audit ledger integrity, certification flow, edge cases
**Overall Opinion**: SOUND WITH FINDINGS (3 Medium, 4 Low, 4 Info)

---

## Findings Summary

| # | Finding | Severity | Domain | Rating |
|---|---------|----------|--------|--------|
| F1 | JE immutability trigger does not protect `exported` status | Medium | Journal Entry Integrity | CONCERN |
| F2 | Equity statement is a residual estimate, not a true roll-forward | Medium | Equity Statement | CONCERN |
| F3 | Percentage tolerance type configured but never used in GENERATED columns | Medium | Reconciliation Math | CONCERN |
| F4 | 748 deprecated XBRL elements in parsed taxonomy seed data | Low | XBRL Mapping | CONCERN |
| F5 | 25+ fs_taxonomy_lines lack XBRL element mapping | Low | XBRL Mapping | CONCERN |
| F6 | Audit ledger chain enforcement trigger has theoretical concurrency gap | Low | Audit Ledger | CONCERN |
| F7 | Cash flow and OCI taxonomy lines lack XBRL mapping in migration 152 | Low | XBRL Mapping | CONCERN |
| F8 | NUMERIC(20,2) boundary behavior undocumented | Info | Edge Cases | CORRECT |
| F9 | Single-account GL produces valid but meaningless statements | Info | Edge Cases | CORRECT |
| F10 | Same-account debit/credit JE lines are allowed | Info | Edge Cases | CORRECT |
| F11 | Reconciliation items sign convention requires user understanding | Info | Reconciliation Math | CORRECT |

---

## TASK 1: RECONCILIATION MATH

### Rating: CORRECT (with 1 CONCERN)

**Files examined**:
- `migrations/102_tenant_period_reconciliations.sql`
- `migrations/123_fix_unexplained_variance_sign.sql`
- `migrations/132_recon_items_total_auto_update.sql`
- `src/services/period_reconciliation_service.ts`

### 1.1 GENERATED ALWAYS Columns

Three GENERATED columns exist on `tenant_period_reconciliations`:

```sql
variance NUMERIC(20,2) GENERATED ALWAYS AS (gl_balance - supporting_balance) STORED
is_within_tolerance BOOLEAN GENERATED ALWAYS AS (
  (gl_balance IS NOT NULL AND supporting_balance IS NOT NULL)
  AND (ABS(gl_balance - supporting_balance) <= tolerance_amount)
) STORED
unexplained_variance NUMERIC(20,2) GENERATED ALWAYS AS (
  (gl_balance - supporting_balance) + COALESCE(reconciling_items_total, 0)
) STORED
```

### 1.2 Variance Formula: `gl_balance - supporting_balance`

**Verdict: CORRECT.** Positive variance means GL is higher than supporting balance. This is the standard convention -- a positive variance on Cash would mean the GL shows more cash than the bank statement, prompting investigation for deposits in transit or recording errors.

### 1.3 Tolerance Check: `ABS(variance) <= tolerance_amount`

**Verdict: CORRECT.** The NULL guard `(gl_balance IS NOT NULL AND supporting_balance IS NOT NULL)` ensures the boolean is FALSE (not within tolerance) when either balance is missing. This prevents premature completion.

### 1.4 Unexplained Variance: `(gl_balance - supporting_balance) + reconciling_items_total`

**Verdict: CORRECT (after migration 123 fix).** Migration 123 documents the fix: reconciling items have negative amounts for items that explain why GL is higher (e.g., outstanding checks = -2500). The formula `variance + items` correctly nets to zero when items fully explain the variance:
- GL=102500, Supporting=100000, variance=2500
- Outstanding check item: amount=-2500
- unexplained = 2500 + (-2500) = 0 (fully explained)

The original formula `variance - items` was incorrect and doubled the variance. This was caught and fixed.

### 1.5 GL Balance Computation

`getGLBalanceForAccount()` at line 44: `from(entry.debit).minus(entry.credit).toDecimalPlaces(2)`

**Verdict: CORRECT.** Debit-minus-credit gives the natural balance for asset/expense accounts (positive) and a negative number for liability/equity/revenue accounts (which is correct -- GL balance for Cash = debits - credits = positive; GL balance for AP = debits - credits = negative, because AP has credit normal balance).

### 1.6 Zero Tolerance

When `tolerance_amount = 0.00` (the default), the formula `ABS(variance) <= 0.00` requires exact match. This is correct -- zero tolerance means zero tolerance. The service enforces this at lines 347-349.

### 1.7 Negative GL Balance (Contra Account)

Negative GL balances work correctly. For a contra-asset like Accumulated Depreciation: GL balance = debits - credits = negative (because credits dominate). The variance still computes correctly: `(-50000) - (-50000) = 0`.

### 1.8 Completion with Unexplained Variance != 0

**Verdict: CORRECT.** At `completeReconciliation()` line 347: if `absUnexplained > tolerance`, an exception is thrown. A reconciliation CANNOT be marked complete if unexplained variance exceeds tolerance. Additionally, if unexplained variance is non-zero but within tolerance, a variance explanation is required (lines 353-363). Evidence upload is also required (lines 365-372).

### 1.9 Finding F3: Percentage Tolerance Type (CONCERN - Medium)

`tenant_recon_requirements` supports `tolerance_type IN ('absolute', 'percentage')` with a `tolerance_percentage` column. However, the GENERATED column in `tenant_period_reconciliations` only uses `tolerance_amount` (absolute). If a requirement specifies percentage tolerance, the system copies `tolerance_amount` into the reconciliation but never computes the percentage-based threshold from the GL balance. The `is_within_tolerance` GENERATED column always uses absolute comparison.

**Impact**: An entity configured with percentage tolerance (e.g., 5% of GL balance) would silently fall back to the absolute tolerance amount, which defaults to 0.00. This would make reconciliation completion unnecessarily strict or impossible if the absolute amount is not also set.

**Recommendation**: Either (a) compute the effective tolerance at initialization time by converting percentage to absolute based on GL balance, or (b) add application-level tolerance checking that considers tolerance_type.

### 1.10 Trigger-Based Recalculation (Migration 132)

The DB trigger `recalc_recon_items_total()` fires on INSERT/UPDATE/DELETE of `tenant_recon_items` and re-sums amounts. The service layer also maintains this total via Decimal.js (`sumRound2`). This dual maintenance is defense-in-depth.

**Verdict: CORRECT.** Both paths produce consistent results.

---

## TASK 2: EQUITY STATEMENT VERIFICATION

### Rating: CONCERN (Medium)

**Files examined**:
- `src/services/equityChanges.ts`
- `src/services/cross_statement_validation.ts`

### 2.1 Equity Roll-Forward Formula

The `buildEquityChangesStatement()` function implements:

```
Opening Equity = prior period BS total equity (if available)
+ Net Income (from current IS)
+ OCI items (from current BS OCI)
Residual = Closing Equity - (Opening + Net Income + OCI)
  --> labeled "Owner contributions / distributions (net)"
Closing Equity = current BS total equity
```

### 2.2 Finding F2: Residual-Based Estimate, Not True Roll-Forward (CONCERN - Medium)

The equity statement does NOT separately track:
- Dividends declared
- Stock issuances (Common Stock + APIC changes)
- Treasury stock purchases
- Retained earnings adjustments

Instead, it computes a single residual that lumps ALL equity movements other than net income and OCI into "Owner contributions / distributions (net)". The function explicitly labels itself `estimated: !priorBalanceSheet` and includes a note: "Equity changes estimated from net income and equity movement; reconcile with equity ledger for full equity roll-forward."

**Impact**: For PE-backed companies with complex equity transactions (stock compensation, treasury buybacks, dividend distributions, equity restructurings), the equity statement will show a single net number that is not auditable without decomposition. An auditor would require itemized equity movements.

**Mitigating factor**: The system flags this with `estimated: true` and includes a reconciliation note. The closing equity DOES tie to BS total equity (verified by cross-statement validation `equity_tie` check at line 91-99 of `cross_statement_validation.ts`).

**Recommendation**: Implement a proper equity roll-forward that decomposes changes into: retained earnings (net income - dividends), APIC changes, treasury stock changes, and OCI. This requires tracking equity sub-component movements from JE lines mapped to equity taxonomy lines.

### 2.3 Closing Equity = BS Total Equity?

**Verdict: CORRECT.** `closingEquity = currentBalanceSheet.totalEquity` at line 14. This is enforced as a hard certification gate by `cross_statement_validation.ts` check `equity_tie` (lines 91-99).

### 2.4 First Period Handling (No Prior Balance)

When `priorBalanceSheet` is undefined:
- `openingEquity` is undefined
- No residual is computed (the `if (openingEquity != null)` guard at line 33 skips it)
- Only net income and OCI changes are shown
- `estimated: true` is set (since `!priorBalanceSheet` is true)
- Note reads: "Estimated from current balance sheet; provide prior period equity and transactions for full equity roll-forward."

**Verdict: CORRECT for first-period behavior.** The system gracefully degrades with transparent labeling.

---

## TASK 3: XBRL MAPPING INTEGRITY

### Rating: CORRECT (with 3 Low CONCERNs)

**Files examined**:
- `migrations/152_xbrl_taxonomy_anchoring.sql`
- `migrations/153_xbrl_full_taxonomy.sql`
- `data/xbrl_parsed_taxonomy.json`
- `migrations/068_fs_taxonomy_lines.sql`
- `migrations/143_bs_current_noncurrent.sql`
- `migrations/125_cf_taxonomy_lines.sql`
- `migrations/126_oci_discontinued_taxonomy.sql`
- `migrations/148_pe_manufacturer_taxonomy_lines.sql`

### 3.1 XBRL Element Semantic Correctness

Verified all 32 XBRL mappings in migration 152. Spot-check results:

| Sabit Line | XBRL Element | Semantic Match |
|---|---|---|
| fs_revenue | us-gaap:Revenues | CORRECT |
| fs_cogs | us-gaap:CostOfGoodsAndServicesSold | CORRECT |
| fs_asset_cash | us-gaap:CashAndCashEquivalentsAtCarryingValue | CORRECT |
| fs_asset_ar | us-gaap:AccountsReceivableNetCurrent | CORRECT |
| fs_asset_ppe | us-gaap:PropertyPlantAndEquipmentGross | CORRECT |
| fs_liability_ap | us-gaap:AccountsPayableCurrent | CORRECT |
| fs_equity_retained | us-gaap:RetainedEarningsAccumulatedDeficit | CORRECT |
| fs_equity_treasury | us-gaap:TreasuryStockValue | CORRECT |
| fs_equity_aoci | us-gaap:AccumulatedOtherComprehensiveIncomeLossNetOfTax | CORRECT |
| fs_interest_income | us-gaap:InterestIncomeExpenseNet | CORRECT (net element appropriate for combined line) |

### 3.2 XBRL Balance Type vs Sabit normal_balance

All mappings verified for balance type consistency:

| Sabit Line | normal_balance | XBRL Element Balance Type | Match |
|---|---|---|---|
| fs_revenue (credit) | us-gaap:Revenues | credit | CORRECT |
| fs_cogs (debit) | us-gaap:CostOfGoodsAndServicesSold | debit | CORRECT |
| fs_asset_cash (debit) | us-gaap:CashAndCashEquivalentsAtCarryingValue | debit | CORRECT |
| fs_liability_ap (credit) | us-gaap:AccountsPayableCurrent | credit | CORRECT |
| fs_equity_treasury (debit) | us-gaap:TreasuryStockValue | debit | CORRECT |
| fs_asset_ar_allowance (credit) | us-gaap:AllowanceForDoubtfulAccountsReceivableCurrent | credit | CORRECT |
| fs_asset_ppe_accum_dep (credit) | us-gaap:AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment | debit | **NOTE** |

**Note on fs_asset_ppe_accum_dep**: The XBRL element `AccumulatedDepreciation...` has balance_type `debit` in the US GAAP taxonomy, but Sabit assigns normal_balance `credit` (contra-asset). Both are defensible -- XBRL uses debit for the gross amount concept, while Sabit treats it as a contra (credit reduces assets). The `is_contra = TRUE` flag in the expanded taxonomy (migration 148) correctly identifies this as a contra account, so the presentation logic should handle it. No error, but worth documenting.

### 3.3 Deprecated XBRL Elements

None of the 32 mapped XBRL elements in migration 152 reference deprecated elements. All use current us-gaap taxonomy elements.

### 3.4 Finding F4: Deprecated Elements in Seed Data (CONCERN - Low)

The `xbrl_parsed_taxonomy.json` contains 748 deprecated elements out of 17,943 total. The `xbrl_taxonomy_elements` table has a `deprecated BOOLEAN DEFAULT false` column, so these are tracked. However, the search and suggestion system should exclude deprecated elements from classification suggestions.

### 3.5 Finding F5: Taxonomy Lines Without XBRL Mapping (CONCERN - Low)

The following fs_taxonomy_lines were inserted across migrations but do NOT receive an xbrl_element mapping in migration 152:

**Balance Sheet subtotal/grouping nodes** (no XBRL mapping needed for abstract groupings):
- fs_asset_current, fs_asset_noncurrent, fs_liability_current, fs_liability_noncurrent (grouping nodes)

**Lines with no XBRL mapping**:
- fs_asset_other_noncurrent (no XBRL mapping)
- fs_liability_deferred_tax (inserted in 143; fs_liability_dtl inserted separately in 152)
- fs_equity_other (no XBRL mapping)
- fs_equity_common (mapped in 152 to us-gaap:CommonStockValue -- CORRECT)

**Cash Flow lines** (3 lines, none mapped):
- fs_cf_operating, fs_cf_investing, fs_cf_financing

**OCI lines** (5 lines, none mapped):
- fs_oci, fs_oci_unrealized_gains, fs_oci_fx_translation, fs_oci_pension, fs_oci_hedge

**Discontinued Ops** (2 lines, none mapped):
- fs_discontinued_ops, fs_discontinued_disposal

### 3.6 Finding F7: CF and OCI Lines Lack XBRL Mapping (CONCERN - Low)

Cash flow lines (Operating/Investing/Financing) and OCI lines have no XBRL element assigned. For XBRL-tagged filings, these would need mappings to:
- us-gaap:NetCashProvidedByUsedInOperatingActivities
- us-gaap:NetCashProvidedByUsedInInvestingActivities
- us-gaap:NetCashProvidedByUsedInFinancingActivities
- us-gaap:OtherComprehensiveIncomeLossNetOfTax (and sub-components)

### 3.7 XBRL Taxonomy Seed Data Statistics

- **Total elements**: 17,943
- **Abstract**: 5,762 (32.1%)
- **Non-abstract (reportable)**: 12,181 (67.9%)
- **Deprecated**: 748 (4.2%)
- **Statement distribution**: BS=4,791 | IS=5,376 | CF=758 | OCI=327 | other=6,691
- **Taxonomy version**: 2025

---

## TASK 4: JOURNAL ENTRY INTEGRITY

### Rating: CORRECT (with 1 CONCERN)

**Files examined**:
- `src/services/journal_entry_service.ts`
- `migrations/105_je_immutability_trigger.sql`
- `migrations/106_prevent_posted_je_lines_modification.sql`
- `migrations/131_je_balance_trigger_on_post.sql`
- `migrations/130_reject_zero_zero_je_lines.sql`

### 4.1 Balance Enforcement: sum(debits) = sum(credits)

**Enforced at THREE levels (defense-in-depth)**:

1. **Application layer** (line 428-441): `validateBalanced()` uses `sumRound2()` with Decimal.js for exact comparison. Difference must be exactly zero (not a tolerance check).

2. **Application layer at creation** (line 67-72): `createDraftJE()` calls `validateBalanced()` before INSERT.

3. **Database trigger** (migration 131): `validate_je_balance_before_post()` fires BEFORE UPDATE when `NEW.status = 'posted'`. It re-sums debits and credits from `journal_entry_lines` and raises an exception if they differ.

**Verdict: CORRECT.** Triple enforcement with exact-penny precision via both Decimal.js and PostgreSQL NUMERIC(20,2).

### 4.2 Unbalanced JE Attempt

An unbalanced JE is rejected at creation time with error message: "Total debits (X) do not equal total credits (Y); difference: Z". Even if application code is bypassed, the DB trigger blocks posting.

### 4.3 Zero-Zero Line Rejection

Migration 130 adds `CHECK (debit > 0 OR credit > 0)` constraint. Application code also rejects at lines 60-66.

### 4.4 Posted JE Immutability

Migration 105: triggers `je_immutable_after_post` and `je_no_delete_after_post` fire BEFORE UPDATE/DELETE when `OLD.status = 'posted'`, raising: "Posted journal entries are immutable. Entry ID: %, posted at: %"

Migration 106: trigger `je_lines_immutable_after_post` fires BEFORE UPDATE OR DELETE on `journal_entry_lines`, checking parent JE status = 'posted'.

### 4.5 Finding F1: `exported` Status Not Protected by Immutability Trigger (CONCERN - Medium)

The immutability trigger only checks `OLD.status = 'posted'`. The JE lifecycle includes a status beyond `posted`: `exported` (posted -> exported, per `exportJE()` at line 408). Once a JE transitions to `exported`, the trigger condition `OLD.status = 'posted'` no longer matches, meaning:

- An UPDATE on an `exported` JE would NOT be blocked by the trigger
- A DELETE on an `exported` JE would NOT be blocked by the trigger

The application code prevents modifying exported JEs (status machine only allows posted -> exported, no further transitions). However, direct SQL access could modify or delete exported JEs.

**Impact**: An exported JE that has been sent to an external ERP could be altered in the Sabit database without trigger protection. This breaks the immutability guarantee for the most critical JEs (those already exported).

**Recommendation**: Change trigger condition to `WHEN (OLD.status IN ('posted', 'exported'))` or simply `WHEN (OLD.status NOT IN ('draft', 'rejected'))`.

### 4.6 JE Reversal Mechanism

`reversePostedJE()` (line 620) correctly creates a NEW draft JE with flipped debits/credits. The original remains immutable. The reversal must traverse the full workflow (draft -> proposed -> approved -> posted).

**Verdict: CORRECT.** Reversal-by-new-entry pattern preserves audit trail.

---

## TASK 5: AUDIT LEDGER INTEGRITY

### Rating: CORRECT (with 1 Low CONCERN)

**Files examined**:
- `src/db/repositories/audit_ledger_repository.ts`
- `migrations/091_append_only_triggers.sql`
- `migrations/128_audit_ledger_chain_enforcement.sql`

### 5.1 Hash Chain Implementation

Each entry's hash is SHA-256 of a JSON payload containing: tenantId, periodLabel, eventType, deterministicFlagSnapshot, agentDissentSnapshot, userPromptRationale, previousEntryHash, createdAt.

**v2 (current)**: Uses `canonicalizeForHash()` which sorts object keys recursively and normalizes values. This ensures deterministic hashing regardless of JavaScript property ordering or DB round-trip reordering.

**v1 (legacy)**: Raw JSON key order. Preserved for backward compatibility.

**Genesis entry**: `previousEntryHash` is NULL for the first entry. The hash is computed as SHA-256(payload with `previousEntryHash: null`).

### 5.2 Chain Verification

`verifyChain()` (line 303) walks entries in `created_at ASC` order:
1. For each entry, recomputes hash using the stored payload
2. Compares computed hash to stored `entry_hash` -- mismatch = "Hash mismatch"
3. Compares stored `previous_entry_hash` to the running `prevHash` variable -- mismatch = "Chain link broken"
4. Updates `prevHash` to current entry's hash for next iteration

Supports incremental verification via checkpoints (saves last verified entry ID + hash).

**Verdict: CORRECT.** Full chain walk with dual verification (content integrity + chain linkage).

### 5.3 Tamper Detection

On hash mismatch: returns `{ valid: false, brokenAtEntryId: row.id, message: 'Hash mismatch' }`.
On chain break: returns `{ valid: false, brokenAtEntryId: row.id, message: 'Chain link broken (previous_entry_hash)' }`.

The verification is called during certification (`certifyCloseSession` at line 422 of `close_session_service.ts`).

### 5.4 Append-Only Enforcement

Migration 091: triggers `audit_ledger_no_update` and `audit_ledger_no_delete` raise: "audit_ledger is append-only: UPDATE/DELETE operations are prohibited"

Migration 128: trigger `audit_ledger_enforce_chain` on INSERT validates that `NEW.previous_entry_hash` matches the latest `entry_hash` for the tenant (or is NULL for first entry).

### 5.5 Finding F6: Concurrency Gap in Chain Enforcement (CONCERN - Low)

The chain enforcement trigger (migration 128) uses:
```sql
SELECT entry_hash INTO latest_hash
FROM audit_ledger
WHERE tenant_id = NEW.tenant_id
ORDER BY created_at DESC
LIMIT 1;
```

Without explicit row locking (`FOR UPDATE`), two concurrent INSERTs for the same tenant could both read the same `latest_hash`, both pass the chain check, and both INSERT with the same `previous_entry_hash`. This would create a fork in the chain.

**Mitigating factors**:
1. The application layer uses `getLatestHash()` before computing the hash, creating a read-compute-write pattern that is somewhat serialized by the pool's connection management
2. PostgreSQL's MVCC isolation means the trigger runs within the INSERT's transaction, but `BEFORE INSERT` triggers see committed data, not concurrent uncommitted inserts
3. The `created_at` ordering would still produce a linear chain for verification purposes

**Impact**: In high-concurrency scenarios (multiple simultaneous audit events for the same tenant), a chain fork could occur. The `verifyChain()` function would still detect this as a break since one of the two entries would have a stale `previous_entry_hash`.

**Recommendation**: Add `FOR UPDATE` to the trigger's SELECT, or use an advisory lock per tenant_id, to serialize chain extension.

---

## TASK 6: CERTIFICATION FLOW

### Rating: CORRECT

**Files examined**:
- `src/services/close_session_service.ts`
- `src/services/certification_artifact_service.ts`
- `src/lib/cert_signing.ts`
- `migrations/120_certification_artifacts_immutability.sql`
- `src/services/session_readiness_gates_service.ts`
- `src/services/cross_statement_validation.ts`

### 6.1 All Gates Must Pass

`certifyCloseSession()` (line 258) performs:
1. Row-level lock (`SELECT ... FOR UPDATE`) to prevent concurrent certification
2. Status check: must be `under_review`
3. Stale statements check
4. `computeReadiness()` -- if any hardBlockers exist, throws `HARD_BLOCKERS`
5. Evidence policy check
6. Trial balance retrieval and integrity check
7. Cross-statement validation (A=L+E, net income tie, cash tie, equity tie)
8. Hard failure check on cross-statement validation

**11 hard gates** are checked in `session_readiness_gates_service.ts`:
TB balanced, all accounts mapped, reconciliations complete, templates resolved, statements current, variances explained, no blocking issues, evidence policy met, checklist complete, cash reconciliation, material JEs approved.

**Verdict: CORRECT.** Comprehensive multi-level gate enforcement.

### 6.2 Ed25519 Signing

`cert_signing.ts` confirms:
- Algorithm: `ed25519` (line 13) -- not RSA, not HMAC
- `sign(null, hashBuf, _privateKey)` -- null algorithm parameter is correct for Ed25519 (algorithm is implicit)
- Production: throws fatal error if keys not configured (line 77-80)
- Dev/test: auto-generates ephemeral keypair (line 36-49)
- Startup validation: `validateSigningKeysProduceValidSignature()` performs sign-then-verify roundtrip

### 6.3 Signed Payload Contents

`buildCertificationArtifact()` constructs the artifact containing:
- `contractVersion: 'v1'`
- `artifactId` (UUID)
- `tenantId`, `closeSessionId`, `periodLabel`
- `certifiedAt` (ISO timestamp)
- `certifiedBy` (signer ID)
- `snapshot` (snapshotId, snapshotHash, hashVersion)
- `auditChain` (lastEntryId, lastEntryHash, entryCount, verifiedAt)
- `evidenceManifest` (manifestId, manifestHash, hashVersion)
- `validationStateAtCertification` (array of check results)
- `aiMetadata` (AI usage statistics)
- `mode` (runtime mode)

The artifact is then hashed with SHA-256 and signed with Ed25519.

**Verdict: CORRECT.** Payload includes data hash, session ID, timestamp, and signer ID as required.

### 6.4 Certificate Immutability

Migration 120: triggers `certification_artifacts_immutable_update` and `certification_artifacts_immutable_delete` block all UPDATE/DELETE operations.

### 6.5 Signature Verification

`verifyArtifactHash()` (line 150-168):
1. Decodes signature from base64
2. Reconstructs public key from base64 (handles both PEM and DER formats)
3. Calls `verify(null, hashBuf, pubKey, sigBuf)` -- returns boolean

**Verdict: CORRECT.** Standard Ed25519 verify path.

### 6.6 Failing Gates on Certification Attempt

If `readiness.hardBlockers.length > 0`, certification throws `CloseSessionError` with code `HARD_BLOCKERS` and message listing all blockers. The session remains in `under_review` status (transaction rolls back).

### 6.7 Modifying a Certified Session

Two paths:
1. **Reopen**: `reopenCloseSession()` requires approver role, reason >= 10 chars, and session in `certified` state. Creates an audit trail issue and material event.
2. **Locked sessions**: Cannot be modified. `locked` is terminal -- `ALLOWED_TRANSITIONS.locked = []`.

---

## TASK 7: EDGE CASES

### Rating: CORRECT

### 7.1 GL with Only 1 Account (e.g., only Cash)

**Behavior**: The system will create a trial balance with a single row. Statements will generate but be meaningless (all amounts on one line). The BS equation check (A=L+E) would likely fail since a single debit-balance account cannot satisfy A=L+E unless the single account is mapped correctly.

**Finding F9 (Info)**: The system does not explicitly reject single-account GLs. The cross-statement validation gates would block certification if the BS equation fails.

### 7.2 GL with 1000 Accounts

**Behavior**: No architectural limit on account count. The reconciliation auto-generation (line 88-112 of period_reconciliation_service.ts) would create requirements for all balance sheet accounts. JE line batch queries use `listJournalEntryLinesBatch()`. Statement generation aggregates by taxonomy line.

**Verdict: CORRECT.** No performance-critical O(n^2) patterns observed in the financial computation paths.

### 7.3 Same-Account Debit and Credit

**Finding F10 (Info)**: A JE line with a debit to Cash and a credit to Cash is allowed if it balances. The zero-zero check (migration 130) rejects lines where BOTH debit AND credit are zero, but not lines that debit one account and credit the same account across different lines. This is technically valid (reclassification entries exist in practice, though same-account is unusual). The net effect on the trial balance is zero for that account.

### 7.4 Zero Debit and Zero Credit Account

An account with zero debit and zero credit would appear on the trial balance with balance = 0. The reconciliation would set `gl_balance = 0`. If supporting_balance is also 0, variance = 0, and the reconciliation can be completed (within tolerance of 0). This is correct -- zero-balance accounts are valid.

### 7.5 NUMERIC(20,2) Boundary: $99,999,999,999,999,999.99

**Finding F8 (Info)**: NUMERIC(20,2) supports values up to 999,999,999,999,999,999.99 (18 digits before decimal). This is approximately $1 quintillion. Migration 121 standardizes all money columns to this precision. Decimal.js in the application layer has arbitrary precision, so there is no JavaScript-side overflow risk. PostgreSQL will reject values exceeding NUMERIC(20,2) with an overflow error at the INSERT/UPDATE level.

The maximum value is sufficient for any foreseeable business use case. Apple's total assets (~$350B) fit comfortably. Even sovereign debt levels fit.

---

## Appendix A: File Inventory

| File | Purpose |
|---|---|
| `migrations/102_tenant_period_reconciliations.sql` | Reconciliation table with GENERATED columns |
| `migrations/123_fix_unexplained_variance_sign.sql` | Corrected unexplained_variance formula |
| `migrations/132_recon_items_total_auto_update.sql` | Trigger to auto-sum reconciling items |
| `src/services/period_reconciliation_service.ts` | Reconciliation business logic |
| `src/services/equityChanges.ts` | Equity statement builder |
| `src/services/journal_entry_service.ts` | JE lifecycle management |
| `src/services/close_session_service.ts` | Close session state machine + certification |
| `src/services/certification_artifact_service.ts` | Certification artifact construction |
| `src/lib/cert_signing.ts` | Ed25519 signing/verification |
| `src/db/repositories/audit_ledger_repository.ts` | Hash-chained audit ledger |
| `src/services/cross_statement_validation.ts` | A=L+E, cash tie, equity tie, net income tie |
| `src/services/session_readiness_gates_service.ts` | 11 readiness gates for advancement |
| `migrations/105_je_immutability_trigger.sql` | Posted JE update/delete prevention |
| `migrations/106_prevent_posted_je_lines_modification.sql` | Posted JE lines protection |
| `migrations/131_je_balance_trigger_on_post.sql` | DB-level balance check on posting |
| `migrations/130_reject_zero_zero_je_lines.sql` | Zero-zero line constraint |
| `migrations/091_append_only_triggers.sql` | Audit ledger + snapshot immutability |
| `migrations/128_audit_ledger_chain_enforcement.sql` | Chain linkage enforcement on INSERT |
| `migrations/120_certification_artifacts_immutability.sql` | Certification artifact immutability |
| `migrations/152_xbrl_taxonomy_anchoring.sql` | XBRL element mapping to taxonomy lines |
| `migrations/153_xbrl_full_taxonomy.sql` | XBRL taxonomy elements table |
| `data/xbrl_parsed_taxonomy.json` | 17,943 XBRL elements seed data |

---

## Appendix B: Remediation Priority

| # | Finding | Severity | Effort | Priority |
|---|---------|----------|--------|----------|
| F1 | Exported JE immutability gap | Medium | Low (1-line trigger change) | HIGH -- fix immediately |
| F2 | Equity statement residual estimate | Medium | High (requires equity sub-ledger) | MEDIUM -- plan for next release |
| F3 | Percentage tolerance unused | Medium | Medium (compute at init time) | MEDIUM -- fix in reconciliation sprint |
| F4 | Deprecated XBRL elements in seed | Low | Low (filter on load) | LOW |
| F5 | Taxonomy lines without XBRL mapping | Low | Medium (add 15+ mappings) | LOW |
| F6 | Audit chain concurrency gap | Low | Low (add FOR UPDATE) | MEDIUM -- defensive fix |
| F7 | CF/OCI XBRL mapping missing | Low | Medium (add mappings) | LOW |

---

**QA Analyst**: Model QA Specialist (Independent)
**QA Date**: 2026-03-12
**Next Scheduled Review**: Upon remediation of F1, F2, F3
