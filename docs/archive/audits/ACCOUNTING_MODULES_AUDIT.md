# Accounting Modules Deep Audit — CPA Assessment

**Date:** 2026-03-27
**Auditors:** 4 parallel CPA+Engineer agents, line-by-line code review
**Question:** Do these modules produce correct journal entries a CPA would accept?

---

## Verdict Summary

| Module | ASC | Score | CPA Verdict | Key Finding |
|--------|-----|-------|-------------|-------------|
| Leases | 842 | **75%** | **ACCEPT** | PV correct (Decimal.pow), interest/principal split correct, all 3 JE types correct, modifications handled. GAP: no lease classification logic, no partial-period proration. |
| Segments | 280 | **85%** | **ACCEPT** | All three 10% tests correct, ANY logic correct, 75% aggregate test present. GAP: iterative add-next-segment missing. |
| Payroll | — | **70%** | **ACCEPT** | Day-count correct, wages/tax/benefits all tracked, JE correct. GAP: no auto-reversal, no PTO/variable comp. |
| AP Cutoff | 405 | **60%** | **FLAG** | Cutoff accrual JE correct, configurable date. GAP: no GL reconciliation, no auto-reversal. |
| CECL | 326 | **65%** | **FLAG** | Aging-based loss rates correct, JE correct (DR bad debt, CR allowance). GAP: no PD/LGD, no macro scenarios, no write-off/recovery. |
| Revenue | 606 | **40%** | **FLAG** | Linear/cost-to-cost/milestone schedules correct. Steps 1-3 incomplete: no enforceability test, no distinctness test, no variable consideration. No GL posting in service. |
| Fixed Assets | 360 | **35%** | **REJECT** | SL and DDB calculations correct, schedules correct. WRONG: **no JE generated**. GAP: no disposal, no impairment. UNWIRED (no routes). |
| Deferred Tax | 740 | **30%** | **REJECT** | Asset/liability method correct, DTA/DTL = diff × rate correct. GAP: no JE, no FIN 48, no state tax, rate change formula risky. UNWIRED. |
| Stock Comp | 718 | **25%** | **REJECT** | Pre-computed FV only, straight-line by period count. WRONG: vestingFraction computed but unused, no graded vesting, no forfeitures. No JE. |
| Inventory | 330 | **25%** | **REJECT** | Aging-only heuristic, no NRV testing, reversals unbounded. JE structure correct but methodology is not GAAP-compliant. |

---

## Module-by-Module Detail

### ASC 842 Leases — 75% (ACCEPT)

**What's correct:**
- PV calculation: `Σ(payment / (1 + monthlyRate)^n)` using Decimal.pow() — **CORRECT**
- Interest/principal split: `interest = liability × monthlyRate`, `principal = payment − interest` — **CORRECT**
- Finance lease JE: DR Interest Expense, CR Lease Liability + DR Amortization, CR Accum Amort — **CORRECT**
- Operating lease JE: DR Lease Expense (straight-line), CR ROU Asset + CR Lease Liability — **CORRECT**
- ROU amortization: straight-line over term — **CORRECT** (ASC 842-10-30-13)
- Modifications: remeasure PV at new IBR, adjust ROU asset — **CORRECT**
- Disclosures: WARL, WADR, maturity analysis — **CORRECT**
- Date arithmetic: manual month clamping (Jan 31 + 1 month = Feb 28) — **CORRECT**

**What's missing:**
- No lease classification logic (ASC 842-10-25-2) — accepts user input, doesn't validate
- Payment schedule not regenerated after modification
- No partial-month proration at commencement
- No lease purchase option, no residual value guarantee
- No lease impairment testing

### ASC 360 Fixed Assets — 35% (REJECT)

**What's correct:**
- Straight-line: `(cost − residual) / life`, prorated by actual days — **CORRECT**
- Double-declining: `rate = 2/life`, `exp = bookValue × rate` — **CORRECT**
- Caps at remaining to depreciate — **CORRECT**
- Schedule generation mathematically sound — **CORRECT**

**What's WRONG:**
- **No journal entry generated** — `runDepreciation()` computes amounts and saves to DB but never calls `createDraftJE()`. The DR Depreciation Expense / CR Accumulated Depreciation entry does not exist.

**What's missing:**
- Asset disposal accounting (no gain/loss JE)
- Impairment testing (no carrying value vs recoverable amount)
- Units-of-production throws `NotImplementedError`
- Service is UNWIRED — not called by any route
- No half-year convention documentation

### ASC 606 Revenue Recognition — 40% (FLAG)

**What's correct:**
- Step 5 recognition: linear (straight-line), cost-to-cost (% complete × price), milestone — all **CORRECT**
- Cost-to-cost formula: `(costs_incurred / total_estimated) × amount` — **CORRECT**
- Final period rounding sweep — **CORRECT**
- AI allocation suggestions staged in `ai_revenue_suggestions` (not auto-posted) — **CORRECT** boundary

**What's WRONG/missing:**
- **Step 1 (Contract ID):** No enforceability test. Draft contracts can proceed. — **WRONG**
- **Step 2 (POB ID):** No distinctness test per ASC 606-10-25-14. Records POBs but doesn't validate. — **PARTIAL**
- **Step 3 (Transaction Price):** No variable consideration (rebates, bonuses, penalties). Uses static total. — **WRONG**
- **Step 4 (Allocation):** Equal-split fallback, no explicit SSP_i/ΣSSP formula — **PARTIAL**
- **No contract modifications** (ASC 606-10-25-10) — **WRONG**
- **No GL posting** in the service — computation only — **PARTIAL**

### ASC 326 CECL — 65% (FLAG)

**What's correct:**
- Aging-based loss rate methodology: `Σ(bucket_balance × loss_rate)` — **CORRECT**
- 6 aging buckets (current, 1-30, 31-60, 61-90, 91-120, 120+) with configurable rates — **CORRECT**
- JE: DR Credit Loss Expense / CR Allowance — **CORRECT**
- Decimal.js precision throughout — **CORRECT**
- DB GENERATED `adjustment_needed` column — **CORRECT**

**What's missing:**
- No PD/LGD model
- No forward-looking macro-economic scenarios (ASC 326 "reasonable and supportable")
- No customer/product segmentation (aging buckets only)
- No write-off or recovery accounting
- No partial write-off handling

### ASC 740 Deferred Tax — 30% (REJECT)

**What's correct:**
- Asset/liability method (not deferred method) — **CORRECT**
- Temporary differences identified: `diff = bookBasis − taxBasis` — **CORRECT**
- DTA/DTL = `diff × taxRate` using Decimal.js — **CORRECT**
- Valuation allowance: 3-tier assessment with evidence factors — **PARTIAL**

**What's WRONG/missing:**
- **No JE generated** — service computes but doesn't post
- Service is **UNWIRED** (no routes call it)
- No FIN 48 / uncertain tax positions
- No state tax / multi-jurisdiction
- Rate change formula risky (uses ratio instead of recalculating from temp diffs)
- Valuation allowance too mechanical (doesn't implement >50% probability threshold properly)

### ASC 718 Stock Compensation — 25% (REJECT)

**What's correct:**
- Pre-computed fair value per share accepted — **CORRECT** (ASC 718 permits)
- Vesting schedule tracked — **CORRECT**

**What's WRONG:**
- `vestingFraction` computed but **never used** in expense calculation (dead code)
- Expense = `totalGrantExpense / periodCount` — straight-line ignoring vesting pattern — **WRONG** for graded vesting
- No cliff vs graded vesting distinction
- **No JE generated** in service
- No forfeiture reversal logic
- No performance/market conditions

### Payroll Accrual — 70% (ACCEPT)

**What's correct:**
- Day count: actual days between dates — **CORRECT**
- Components: wages + employer payroll taxes + benefits — all configurable — **CORRECT**
- JE: DR Wages Exp / CR Accrued Wages, DR Tax Exp / CR Accrued Taxes, DR Benefits Exp / CR Accrued Benefits — **CORRECT**
- Amount provenance tracked — **CORRECT**
- Import from payroll register CSV supported — **CORRECT**

**What's missing:**
- No auto-reversal in next period
- No PTO liability accrual
- No variable compensation (bonus accruals)
- Assumes pre-computed daily rates (no rate computation from gross wages)

### ASC 330 Inventory Reserve — 25% (REJECT)

**What's correct:**
- Aging bucket classification (current, 91-180, 181-365, over 365) — **CORRECT**
- JE: DR Write-Down Expense / CR Obsolescence Reserve — **CORRECT**
- Decimal.js throughout — **CORRECT**

**What's WRONG:**
- **No NRV testing** — ASC 330 requires lower of cost or net realizable value. Service uses aging-based percentage heuristic, not NRV comparison.
- Reversal logic lacks cost basis enforcement (can reverse beyond original cost)
- No turnover analysis, no ABC classification

### AP Cutoff — 60% (FLAG)

**What's correct:**
- Cutoff analysis: filters invoices by period end date — **CORRECT**
- JE: DR Expense / CR Accrued Liabilities — **CORRECT**
- Configurable cutoff date — **CORRECT**
- Amount provenance with `cutoff: true` marker — **CORRECT**

**What's missing:**
- No GL reconciliation (doesn't query what's already recorded)
- No auto-reversal in next period
- Requires candidates supplied by caller (passive, not active detection)

### ASC 280 Segments — 85% (ACCEPT)

**What's correct:**
- Revenue 10% test: `segment_revenue / total_revenue >= 10%` — **CORRECT**
- P&L 10% test: `|segment_PL| / max(|total_profit|, |total_loss|) >= 10%` — **CORRECT** (correct benchmark per ASC 280-10-50-11)
- Assets 10% test: `segment_assets / total_assets >= 10%` — **CORRECT**
- Reportable if ANY test met (OR logic) — **CORRECT**
- 75% aggregate test present — **CORRECT**
- Report-only, no JEs — **CORRECT**
- All calculations via Decimal.js — **CORRECT**

**What's missing:**
- 75% test doesn't iteratively add next-largest segment
- No "all other" aggregation for non-reportable segments

---

## The Most Dangerous Gap

**For a $200M PE-backed manufacturer:**

**Inventory Reserve (ASC 330)** is the highest-risk module. A manufacturer with $50-100M inventory cannot use aging-only heuristics. External auditors will:
1. Test NRV on a sample of SKUs
2. Compare carrying value to recent sale prices minus costs to sell
3. Flag the absence of NRV testing as a control deficiency

**Potential misstatement:** $5-10M understated COGS / overstated net income (2-5% of revenue). This is material.

**Second most dangerous:** Deferred Tax (UNWIRED). Tax provision is a major audit focus for PE portfolio companies. Without it, the close is incomplete.

---

## Honest Verdict

**These modules are DEMO-READY, not production-ready.**

The core close pipeline (GL → TB → mapping → recon → JEs → statements → certification) is production-grade. The 13 accounting modules range from solid (Leases 75%, Segments 85%) to insufficient (Inventory 25%, Stock Comp 25%).

**For a simple SaaS company** (no inventory, minimal fixed assets, basic AR): the system works. Leases, payroll, CECL, and AP cutoff handle the common cases.

**For a PE-backed manufacturer** (the stated target): 4 modules need significant work before an auditor would accept them — Inventory, Deferred Tax, Stock Comp, and Revenue.

**The architecture is right.** Decimal.js everywhere, amount provenance, hash-chained audit trail, AI boundary enforcement, Ed25519 signing. The foundation supports production-grade modules. The modules themselves need completion.

---

*Audit performed by 4 independent CPA+Engineer agents reading every line of code. No documentation referenced.*
