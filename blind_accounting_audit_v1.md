# Blind Accounting Logic Audit v1

**Date:** 2026-03-26
**Methodology:** 5 independent CPA-perspective agents examined the codebase without knowledge of each other's findings. Each agent was given a specific US GAAP domain and asked to trace the logic from source code, not documentation.

---

## Agent 1: Accounting Equation Integrity (A = L + E)

### Scope
Verify that the fundamental accounting equation is enforced at every layer: trial balance, journal entries, statement generation, and certification.

### Findings

| # | Area | Rating | Detail |
|---|------|--------|--------|
| 1 | TB Balance Check | **CORRECT** | `readiness_service.ts` gate `tb_balanced` checks total debits = total credits with $0.01 tolerance via Decimal.js |
| 2 | JE Balance Enforcement | **CORRECT** | App-level validation in `journal_entry_service.ts` + DB-level CHECK trigger ensures every JE balances |
| 3 | Statement Generation | **CORRECT** | `statement_generation_service.ts` enforces A=L+E at generation time, blocks if gap > $0.01 |
| 4 | Certification Gate | **CORRECT** | `certifyCloseSession()` re-validates TB balance before signing |
| 5 | Prior-Period Continuity | **GAP** | No validation that opening Retained Earnings = prior period closing Retained Earnings. A manual override or data reload could silently break continuity across periods |
| 6 | DB-Level Balance Enforcement | **GAP** | Balance enforcement lives in application code only. A direct SQL INSERT bypassing the app could create an unbalanced JE (mitigated by DB trigger on `journal_entry_lines`, but the aggregate check is app-side) |

### Risk Assessment
- **Prior-period continuity** — Medium risk. Multi-period closes could diverge without detection. Recommend adding a gate check that compares opening balances to prior certified period's closing balances.
- **DB-level aggregate** — Low risk in practice (all access goes through the app), but violates defense-in-depth principle.

---

## Agent 2: Revenue Recognition (ASC 606)

### Scope
Verify the 5-step model implementation: identify contract → identify POs → determine price → allocate → recognize.

### Findings

| # | Area | Rating | Detail |
|---|------|--------|--------|
| 1 | Contract Identification | **CORRECT** | `revenue_recognition_service.ts` requires contract with enforceable rights, commercial substance |
| 2 | Performance Obligation ID | **CORRECT** | Distinct POs identified, standalone selling prices assigned |
| 3 | Transaction Price | **PARTIAL** | Fixed-price contracts handled correctly. **Variable consideration (bonuses, penalties, rebates)** not implemented — no constraint estimation or most-likely-amount calculation |
| 4 | Allocation | **CORRECT** | Relative SSP allocation with Decimal.js, residual method available |
| 5 | Recognition Schedules | **CORRECT** | Three deterministic patterns: linear (over time), cost-to-cost (input method), milestone (point in time) |
| 6 | AI Boundary | **CORRECT** | `suggestAllocationAgentic()` and `suggestRecognitionScheduleAgentic()` write to `ai_revenue_suggestions` staging table, not core tables. `assertNoAiMutationContext()` enforced |
| 7 | Contract Modifications | **GAP** | No handling for contract modifications (ASC 606-10-25-10 through 25-13). Modified contracts treated as new, no prospective/cumulative catch-up logic |

### Risk Assessment
- **Variable consideration** — High risk for companies with volume discounts, performance bonuses, or rebate programs. These are common in PE-backed mid-market.
- **Contract modifications** — Medium risk. Common in services/SaaS contracts. Without modification handling, revenue could be misstated when contract terms change mid-period.

---

## Agent 3: Journal Entry Controls & Integrity

### Scope
Verify the 7 core JE controls: balance, memo, segregation of duties, immutability, reversals, module-generated entries, and period cutoff.

### Findings

| # | Control | Rating | Detail |
|---|---------|--------|--------|
| 1 | Debit = Credit | **CORRECT** | App validates `sum(debits) === sum(credits)` via Decimal.js. DB trigger `check_je_balance` provides second layer |
| 2 | Memo Required | **CORRECT** | Minimum 5 characters enforced in `createDraftJE()` |
| 3 | Segregation of Duties | **CORRECT** | Creator cannot approve own JE. Certification requires different user than advancer (bypassed only via explicit `allowSameUserCertify` setting) |
| 4 | Immutability After Posting | **CORRECT** | DB triggers `prevent_posted_je_update` and `prevent_posted_je_delete` on `journal_entry_lines`. Application code also checks status before mutation |
| 5 | GL Immutability After Cert | **CORRECT** | Migration 209 adds `prevent_certified_gl_mutation()` trigger checking `certification_artifacts` existence |
| 6 | Reversal Entries | **CORRECT** | Reversals create offsetting JE (swap debit/credit), linked via `reversal_of` FK. Original remains immutable |
| 7 | Module-Generated JEs | **CORRECT** | All 13 accounting modules create draft JEs via `createDraftJE()` — same validation path as manual entries. `amount_provenance` JSON tracks source rule + version |
| 8 | Period Cutoff | **CORRECT** | JEs carry `period_label`, session enforces period boundaries. Cannot post to a certified period (migration 209 trigger) |

### Risk Assessment
All 7 controls rated **CORRECT**. This is the strongest area of the codebase. The dual-layer enforcement (app + DB triggers) provides genuine defense-in-depth.

---

## Agent 4: Reconciliation Logic

### Scope
Verify GL-to-subledger reconciliation: balance derivation, reconciling items, tolerance, evidence requirements, and completion gates.

### Findings

| # | Area | Rating | Detail |
|---|------|--------|--------|
| 1 | GL Balance Source | **CORRECT** | Pulled from adjusted trial balance (post-AJE), not raw GL. This is the correct GAAP approach |
| 2 | Supporting Balance | **CORRECT** | External balance (bank statement, subledger) stored with source type and Decimal.js parsing |
| 3 | Difference Calculation | **CORRECT** | `gl_balance - supporting_balance - sum(reconciling_items)` = unexplained difference. Decimal.js throughout |
| 4 | Tolerance Check | **CORRECT** | Configurable per-account tolerance. Default $0.01. Recon marked reconciled only when unexplained ≤ tolerance |
| 5 | Reconciling Items | **GAP** | Items have amount and description but **direction is not enforced by type**. A "deposit in transit" should always be positive (add to book), an "outstanding check" always negative. Currently any amount/sign is accepted for any type |
| 6 | Evidence Requirements | **PARTIAL** | `evidence_policy` configurable per account type. Evidence required check exists in app code but not enforced at DB level. A direct API call could mark recon complete without evidence if the route handler is bypassed |
| 7 | Auto-Match | **CORRECT** | `recon_intelligence_service.ts` matches GL lines to supporting items by amount + date proximity. Results staged for human review |
| 8 | Sign Convention | **GAP** | Mixed-source environments (some accounts where debit = increase, others where credit = increase) rely on the user entering correct signs. No account-type-aware sign normalization |

### Risk Assessment
- **Reconciling item direction** — Medium risk. Allows a user to enter a "deposit in transit" with a negative amount, which would mask a real difference rather than explain it. Recommend enforcing sign by item type.
- **Sign convention** — Low-medium risk. Most users understand their account types, but in a multi-entity consolidation with different chart structures, sign errors could compound.

---

## Agent 5: Financial Statement Construction

### Scope
Verify the four statements are built correctly from the adjusted TB under US GAAP presentation requirements.

### Findings

| # | Area | Rating | Detail |
|---|------|--------|--------|
| 1 | Balance Sheet | **CORRECT** | Assets, Liabilities, Equity sections built from mapped accounts. A=L+E check enforced |
| 2 | Income Statement | **BUG** | Discontinued operations (ASC 205-20) not separated from continuing operations. All revenue/expense flows into a single net income figure. For companies with discontinued segments, this violates GAAP presentation |
| 3 | Cash Flow Statement (Indirect) | **CORRECT** | Operating section starts with net income, adds back non-cash items (depreciation, amortization). Investing and financing sections from mapped accounts |
| 4 | Cash Flow — First Close | **BUG** | When no prior period exists, `netChangeInCash` falls back to `netIncome`. This is mathematically incorrect — net income ≠ net change in cash. Should fall back to `ending cash - 0` or require manual input |
| 5 | Statement of Stockholders' Equity | **CORRECT** | Opening equity + net income + contributions - distributions = closing equity. Comprehensive income items included |
| 6 | Cross-Statement Ties | **BUG** | 5 critical cross-statement validations are missing: (1) IS net income → SCF operating start, (2) IS net income → SE statement, (3) SCF ending cash → BS cash, (4) SE ending equity → BS equity, (5) BS retained earnings = opening RE + NI - dividends |
| 7 | Rounding | **CORRECT** | All statement amounts use Decimal.js with `toDecimalPlaces(2)`. Rounding residuals tracked and reported |
| 8 | Materiality Threshold | **CORRECT** | Configurable materiality for rounding gap tolerance. Default $0.01 |

### Risk Assessment
- **Discontinued operations** — High risk for PE-backed companies (frequent divestitures). Misstated if discontinued segment exists.
- **Cross-statement ties** — High risk. These are the first things an auditor checks. Missing ties mean the four statements could be internally inconsistent without detection.
- **First-close cash flow** — Medium risk. Only affects the very first period, but produces a materially wrong cash flow statement.

---

## Consolidated Summary

### By Severity

**BUGS (must fix)**
| # | Finding | Agent | Impact |
|---|---------|-------|--------|
| B1 | Discontinued operations not separated from continuing ops in Income Statement | 5 | GAAP violation for companies with divestitures |
| B2 | 5 cross-statement tie checks missing (IS→SCF, IS→SE, SCF→BS cash, SE→BS equity, BS RE continuity) | 5 | Internal inconsistency between statements undetected |
| B3 | First-close cash flow uses net income as net change in cash | 5 | Materially incorrect cash flow statement on first period |

**GAPS (should fix)**
| # | Finding | Agent | Impact |
|---|---------|-------|--------|
| G1 | No prior-period continuity validation (opening RE vs prior closing RE) | 1 | Silent divergence across periods |
| G2 | Variable consideration not implemented in ASC 606 revenue recognition | 2 | Cannot handle volume discounts, performance bonuses, rebates |
| G3 | Contract modifications not handled (ASC 606-10-25-10 through 25-13) | 2 | Modified contracts treated as new, potential misstatement |
| G4 | Reconciling item direction not enforced by type | 4 | Users can enter wrong-sign items that mask real differences |
| G5 | Sign convention risk in mixed-source reconciliation environments | 4 | Compound sign errors in multi-entity setups |

**CORRECT (no action)**
| Area | Rating |
|------|--------|
| Trial balance A=L+E enforcement | Strong — app + certification gate |
| Journal entry controls (all 7) | Strongest area — dual app + DB enforcement |
| AI boundary enforcement | Correctly isolated — staging tables, guardrails |
| Decimal.js financial arithmetic | Consistent — no native JS on money paths |
| Cryptographic certification chain | Ed25519 + SHA-256 hash chain + immutability triggers |
| Reconciliation core logic | Correct derivation from adjusted TB |
| Statement generation arithmetic | Decimal.js throughout, rounding tracked |

### Recommended Fix Priority

1. **B2 — Cross-statement ties** (highest leverage: catches B1, B3, and G1 as side effects)
2. **B1 — Discontinued operations** (GAAP compliance)
3. **B3 — First-close cash flow** (simple fix, high impact)
4. **G1 — Prior-period continuity** (automated check, prevents silent drift)
5. **G4 — Reconciling item sign enforcement** (data quality)
6. **G2/G3 — ASC 606 variable consideration + modifications** (feature work, scope for v2)

---

*Audit performed by 5 independent CPA-perspective agents examining source code directly. No documentation or prior audit results were referenced.*
