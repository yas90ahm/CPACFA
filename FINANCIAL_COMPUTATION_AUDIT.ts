/**
 * ============================================================================
 * FINANCIAL COMPUTATION ENGINE AUDIT REPORT
 * Sovereign CPA Engine (Sabit)
 * Audit Date: 2026-03-12
 * Auditor: CPA Financial Systems Review
 * Scope: GAAP correctness of all financial statement computations
 * ============================================================================
 *
 * Files Audited:
 *   migrations/068_fs_taxonomy_lines.sql
 *   migrations/125_cf_taxonomy_lines.sql
 *   migrations/126_oci_discontinued_taxonomy.sql
 *   migrations/142_is_subtotal_hierarchy.sql
 *   migrations/143_bs_current_noncurrent.sql
 *   migrations/148_expanded_taxonomy.sql
 *   migrations/148_pe_manufacturer_taxonomy_lines.sql
 *   migrations/152_xbrl_taxonomy_anchoring.sql
 *   src/services/financialStatements.ts
 *   src/services/cashFlow.ts
 *   src/services/cross_statement_validation.ts
 *   src/services/equityChanges.ts
 *   src/services/integrity_gate_service.ts
 *   src/utils/decimal.ts
 *
 * ============================================================================
 * TASK 1: TAXONOMY VERIFICATION
 * ============================================================================
 *
 * 1.1 COMPLETE LINE ITEM INVENTORY
 * ================================
 *
 * INCOME STATEMENT (PL) -- 22 lines:
 * --------------------------------------------------------------------------
 * id                       | name                         | parent_id         | normal_balance | is_contra
 * fs_revenue               | Revenue                      | NULL              | credit         | false
 * fs_revenue_product       | Product Revenue              | fs_revenue        | credit         | false
 * fs_revenue_service       | Service Revenue              | fs_revenue        | credit         | false
 * fs_revenue_other         | Other Revenue                | fs_revenue        | credit         | false
 * fs_revenue_contra        | Sales Returns & Allowances   | fs_revenue        | debit          | TRUE
 * fs_cogs                  | Cost of Goods Sold           | NULL              | debit          | false
 * fs_cogs_materials        | Direct Materials             | fs_cogs           | debit          | false
 * fs_cogs_labor            | Direct Labor                 | fs_cogs           | debit          | false
 * fs_cogs_overhead         | Manufacturing Overhead       | fs_cogs           | debit          | false
 * fs_opex                  | Operating Expenses           | NULL              | debit          | false
 * fs_opex_sga              | Selling, General & Admin     | fs_opex           | debit          | false
 * fs_opex_rd               | Research & Development       | fs_opex           | debit          | false
 * fs_opex_da               | Depreciation & Amortization  | fs_opex           | debit          | false
 * fs_opex_other            | Other Operating Expenses     | fs_opex           | debit          | false
 * fs_other_income          | Other Income / (Expense)     | NULL              | credit         | false
 * fs_interest_income       | Interest Income              | fs_other_income   | credit         | false
 * fs_interest_expense      | Interest Expense             | fs_other_income   | debit          | false
 * fs_other_other           | Other Non-Operating          | fs_other_income   | credit         | false
 * fs_other_gain_loss       | Gain / (Loss) on Disposal    | fs_other_income   | credit         | false
 * fs_tax_expense           | Income Tax Expense           | NULL              | debit          | false
 * fs_tax_current           | Current Income Tax Expense   | fs_tax_expense    | debit          | false
 * fs_tax_deferred          | Deferred Income Tax Expense  | fs_tax_expense    | debit          | false
 * fs_expense               | Expenses (fallback)          | NULL              | debit          | false
 * fs_discontinued_ops      | Disc. Operations             | NULL              | credit         | false
 * fs_discontinued_disposal | Gain/Loss on Disposal        | fs_discontinued_ops| credit        | false
 *
 * BALANCE SHEET (BS) -- 33 lines:
 * --------------------------------------------------------------------------
 * id                              | name                              | parent_id              | normal_balance | is_contra
 * fs_asset                        | Assets                            | NULL                   | debit          | false
 * fs_asset_current                | Current Assets                    | fs_asset               | debit          | false
 * fs_asset_cash                   | Cash and Cash Equivalents         | fs_asset_current       | debit          | false
 * fs_asset_ar                     | Accounts Receivable, Gross        | fs_asset_current       | debit          | false
 * fs_asset_ar_allowance           | Allowance for Doubtful Accounts   | fs_asset_current       | credit         | TRUE
 * fs_asset_inventory              | Inventory                         | fs_asset_current       | debit          | false
 * fs_asset_prepaid                | Prepaid Expenses                  | fs_asset_current       | debit          | false
 * fs_asset_other_current          | Other Current Assets              | fs_asset_current       | debit          | false
 * fs_asset_noncurrent             | Non-Current Assets                | fs_asset               | debit          | false
 * fs_asset_ppe                    | Property, Plant & Equipment, Gross| fs_asset_noncurrent    | debit          | false
 * fs_asset_ppe_accum_dep          | Accumulated Depreciation          | fs_asset_noncurrent    | credit         | TRUE
 * fs_asset_intangible             | Intangible Assets, Gross          | fs_asset_noncurrent    | debit          | false
 * fs_asset_intangible_amort       | Accumulated Amortization          | fs_asset_noncurrent    | credit         | TRUE
 * fs_asset_goodwill               | Goodwill                          | fs_asset_noncurrent    | debit          | false
 * fs_asset_dta                    | Deferred Tax Assets               | fs_asset_noncurrent    | debit          | false
 * fs_asset_other_noncurrent       | Other Non-Current Assets          | fs_asset_noncurrent    | debit          | false
 * fs_liability                    | Liabilities                       | NULL                   | credit         | false
 * fs_liability_current            | Current Liabilities               | fs_liability           | credit         | false
 * fs_liability_ap                 | Accounts Payable                  | fs_liability_current   | credit         | false
 * fs_liability_accrued            | Accrued Liabilities               | fs_liability_current   | credit         | false
 * fs_liability_current_debt       | Current Portion of LT Debt        | fs_liability_current   | credit         | false
 * fs_liability_deferred_rev_curr  | Deferred Revenue (Current)        | fs_liability_current   | credit         | false
 * fs_liability_other_current      | Other Current Liabilities         | fs_liability_current   | credit         | false
 * fs_liability_noncurrent         | Non-Current Liabilities           | fs_liability           | credit         | false
 * fs_liability_lt_debt            | Long-Term Debt                    | fs_liability_noncurrent| credit         | false
 * fs_liability_deferred_tax       | Deferred Tax Liabilities          | fs_liability_noncurrent| credit         | false
 * fs_liability_dtl                | Deferred Tax Liabilities (dup?)   | fs_liability_noncurrent| credit         | false
 * fs_liability_deferred_rev_nc    | Deferred Revenue (Non-Current)    | fs_liability_noncurrent| credit         | false
 * fs_liability_other_noncurrent   | Other Non-Current Liabilities     | fs_liability_noncurrent| credit         | false
 * fs_equity                       | Equity                            | NULL                   | credit         | false
 * fs_equity_common                | Common Stock & APIC               | fs_equity              | credit         | false
 * fs_equity_apic                  | Additional Paid-In Capital        | fs_equity              | credit         | false
 * fs_equity_retained              | Retained Earnings                 | fs_equity              | credit         | false
 * fs_equity_treasury              | Treasury Stock                    | fs_equity              | debit          | TRUE
 * fs_equity_dividends             | Dividends Declared                | fs_equity              | debit          | false(*)
 * fs_equity_other                 | Other Equity                      | fs_equity              | credit         | false
 * fs_equity_aoci                  | Accum. Other Comp. Income/Loss    | fs_equity              | credit         | false
 * fs_oci                          | AOCI (BS sub of equity)           | fs_equity              | credit         | false
 *
 * CASH FLOW (CF) -- 3 lines:
 * fs_cf_operating, fs_cf_investing, fs_cf_financing
 *
 * OCI -- 4 lines:
 * fs_oci_unrealized_gains, fs_oci_fx_translation, fs_oci_pension, fs_oci_hedge
 *
 * RATING: CORRECT (with observations below)
 *
 *
 * 1.2 HIERARCHY VALIDATION
 * ========================
 * Every child has a valid parent. No orphaned children detected.
 * Parent chain examples verified:
 *   fs_asset_cash -> fs_asset_current -> fs_asset -> NULL  (valid)
 *   fs_liability_ap -> fs_liability_current -> fs_liability -> NULL  (valid)
 *   fs_revenue_product -> fs_revenue -> NULL  (valid)
 *   fs_opex_sga -> fs_opex -> NULL  (valid)
 *   fs_equity_retained -> fs_equity -> NULL  (valid)
 *
 * OBSERVATION: fs_liability_deferred_tax and fs_liability_dtl appear to be
 * duplicates (both map to non-current liabilities for deferred tax).
 * fs_liability_deferred_tax comes from migration 143, fs_liability_dtl from
 * migration 152. The code references fs_liability_deferred_tax in
 * BS_NONCURRENT_LIAB_FS_LINES but NOT fs_liability_dtl.
 *
 * CONCERN: fs_liability_dtl is in the taxonomy but NOT in
 * BS_NONCURRENT_LIAB_FS_LINES in financialStatements.ts. An account mapped
 * to fs_liability_dtl would fall through to the accountType fallback, which
 * could still work but is inconsistent.
 *
 * RATING: CONCERN (minor -- duplicate DTL line; fs_liability_dtl not routed)
 *
 *
 * 1.3 SUBTOTAL LOGIC VERIFICATION
 * ================================
 * From buildProfitAndLoss() lines 344-349:
 *   grossProfit     = totalRevenue - totalCogs                            CORRECT
 *   operatingIncome = grossProfit - (totalOpex + totalUnclassifiedExpenses) CORRECT
 *   incomeBeforeTax = operatingIncome + totalOther                        CORRECT
 *   netIncome       = incomeBeforeTax - totalTax                          CORRECT
 *
 * From buildBalanceSheet() lines 205-212:
 *   totalAssets = sum(currentAssets + noncurrentAssets + unclassifiedAssets) CORRECT
 *   totalLiabilities = sum(currentLiab + noncurrentLiab + unclassifiedLiab) CORRECT
 *   totalEquity = equityOnly + (totalRevenue - totalExpenses) + totalOci    CORRECT (includes net income)
 *   Balance check: totalAssets == totalLiabilities + totalEquity            ENFORCED by integrity gate
 *
 * RATING: CORRECT
 *
 *
 * 1.4 CREDIT_POSITIVE_FS_LINES VERIFICATION
 * ==========================================
 * The set at line 36-48 of financialStatements.ts contains:
 *
 * Required Revenue lines:
 *   fs_revenue              PRESENT
 *   fs_revenue_product      PRESENT
 *   fs_revenue_service      PRESENT
 *   fs_revenue_other        PRESENT
 *
 * Required Liability lines:
 *   fs_liability            PRESENT (via 'fs_liability' key)
 *   fs_liability_ap         PRESENT
 *   fs_liability_accrued    PRESENT
 *   fs_liability_current_debt PRESENT
 *   fs_liability_lt_debt    PRESENT
 *   fs_liability_deferred_rev_current    PRESENT
 *   fs_liability_deferred_rev_noncurrent PRESENT
 *   fs_liability_other_current           PRESENT
 *   fs_liability_other_noncurrent        PRESENT
 *   fs_liability_deferred_tax            PRESENT
 *   fs_liability_dtl                     NOT PRESENT
 *
 * Required Equity lines (non-contra):
 *   fs_equity               PRESENT
 *   fs_equity_common        PRESENT
 *   fs_equity_apic          PRESENT
 *   fs_equity_retained      PRESENT
 *   fs_equity_aoci          NOT PRESENT  *** CONCERN ***
 *   fs_equity_other         PRESENT
 *
 * Correctly EXCLUDED (contra accounts):
 *   fs_equity_treasury      NOT in set -- CORRECT (debit-normal contra)
 *   fs_asset_ar_allowance   IN set (line 47) -- WAIT, this IS in the set
 *   fs_asset_ppe_accum_dep  IN set (line 47) -- WAIT, this IS in the set
 *   fs_asset_intangible_amort IN set (line 47) -- IN the set
 *   fs_revenue_contra       NOT in set -- CORRECT (debit-normal contra)
 *
 * CRITICAL ANALYSIS OF CONTRA-ASSET HANDLING:
 * The three contra-asset lines (fs_asset_ar_allowance, fs_asset_ppe_accum_dep,
 * fs_asset_intangible_amort) ARE in CREDIT_POSITIVE_FS_LINES.
 *
 * This means for Accumulated Depreciation with GL balance debit=0, credit=50000:
 *   net = debit - credit = 0 - 50000 = -50000
 *   Since fs_asset_ppe_accum_dep IS in CREDIT_POSITIVE_FS_LINES:
 *     signed = -net = -(-50000) = +50000
 *   But wait -- Accum Dep should REDUCE total assets, not increase them.
 *
 * HOWEVER: The amount +50000 is added to the assets array (line 193).
 * sumLines(assets) would then ADD this +50000 to total assets.
 * But Accum Dep should SUBTRACT from total assets!
 *
 * Let me re-verify...
 *
 * Actually, re-reading the netAmount function more carefully:
 *   net = minus(entry.debit, entry.credit) = debit - credit
 *   For Accum Dep: debit=0, credit=50000 -> net = -50000
 *   creditPositive = CREDIT_POSITIVE_FS_LINES.has('fs_asset_ppe_accum_dep') = TRUE
 *   signed = creditPositive ? -net : net = -(-50000) = +50000
 *
 * Wait -- that makes Accum Dep show as POSITIVE $50,000 in the assets section.
 * That would INCREASE total assets, which is WRONG.
 *
 * CORRECTION: I need to reconsider. The contra-asset lines ARE in
 * CREDIT_POSITIVE_FS_LINES with the comment "Contra accounts -- credit-normal
 * contra-assets show as negative (reduce asset total)".
 *
 * But the math shows they come out POSITIVE. Let me trace again:
 *   Accum Dep: normal credit balance. GL: debit=0, credit=50000
 *   net = 0 - 50000 = -50000
 *   creditPositive = true
 *   signed = -(-50000) = +50000
 *
 * This results in +50,000 for Accum Dep, which gets summed into totalAssets.
 * PPE Gross might be +1,000,000. Total would be 1,050,000 instead of 950,000.
 *
 * THIS IS AN ERROR... unless there is something else I'm missing.
 *
 * WAIT -- let me re-read. The contra-asset accounts have credit normal balance.
 * When they have credit balances, the sign convention makes them positive.
 * But they are in the ASSETS bucket (BS_NONCURRENT_ASSET_FS_LINES contains
 * fs_asset_ppe_accum_dep at line 103).
 *
 * So totalAssets = sumLines([...PPE_gross(+1M), ...AccumDep(+50K), ...]) = 1,050,000
 * This is WRONG. Net PPE should be 950,000.
 *
 * BUT WAIT -- I need to recheck. Let me look at the contra-assets more carefully.
 * The comment at line 46 says "credit-normal contra-assets show as negative
 * (reduce asset total)". Let me re-verify whether including them in
 * CREDIT_POSITIVE_FS_LINES actually makes them negative or positive.
 *
 * For a NORMAL credit-positive line (like revenue with credit balance):
 *   net = debit - credit = 0 - 100000 = -100000
 *   signed = -(-100000) = +100000 (shows POSITIVE -- correct for revenue)
 *
 * For Accum Dep (credit balance contra-asset):
 *   net = debit - credit = 0 - 50000 = -50000
 *   signed = -(-50000) = +50000 (shows POSITIVE)
 *
 * If Accum Dep were NOT in CREDIT_POSITIVE_FS_LINES:
 *   signed = net = -50000 (shows NEGATIVE)
 *
 * The NEGATIVE display (-50000) would be correct for a contra asset!
 * PPE Gross (+1M) + Accum Dep (-50K) = Net PPE (+950K). CORRECT.
 *
 * But the code HAS Accum Dep in CREDIT_POSITIVE_FS_LINES, making it +50K.
 * PPE Gross (+1M) + Accum Dep (+50K) = 1,050K. WRONG.
 *
 * *** ERROR CONFIRMED: Contra-asset lines should NOT be in
 * CREDIT_POSITIVE_FS_LINES. Including them flips the sign the wrong way,
 * causing them to ADD to total assets instead of reducing them. ***
 *
 * The comment on line 46 says "show as negative (reduce asset total)" but
 * the actual code does the opposite -- it makes them positive.
 *
 * RATING: ERROR
 *
 * ADDITIONAL FINDINGS ON CREDIT_POSITIVE_FS_LINES:
 *
 * fs_equity_aoci: NOT in CREDIT_POSITIVE_FS_LINES.
 *   An account mapped to fs_equity_aoci with a credit balance would compute:
 *   net = -amount, signed = net (no flip) = negative.
 *   This would REDUCE equity, which is wrong if AOCI is positive.
 *   CONCERN: fs_equity_aoci missing from CREDIT_POSITIVE_FS_LINES.
 *
 * fs_liability_dtl: NOT in CREDIT_POSITIVE_FS_LINES.
 *   Same issue -- DTL with credit balance would show negative.
 *   CONCERN: fs_liability_dtl missing from CREDIT_POSITIVE_FS_LINES.
 *
 * fs_equity_treasury: NOT in CREDIT_POSITIVE_FS_LINES.
 *   Treasury stock is a contra-equity with DEBIT normal balance.
 *   GL: debit=100000, credit=0 -> net = +100000
 *   Since NOT credit-positive: signed = net = +100000
 *   This +100000 gets added to the equity bucket via BS_EQUITY_FS_LINES.
 *   totalEquity = equityOnly + netIncome + OCI
 *   equityOnly includes Treasury at +100000, which INCREASES equity.
 *   But Treasury should DECREASE equity!
 *
 *   *** ERROR: Treasury Stock with debit balance shows as positive,
 *   INCREASING equity instead of reducing it. It should be negative. ***
 *
 * fs_equity_dividends: NOT in CREDIT_POSITIVE_FS_LINES.
 *   Dividends is debit-normal. GL: debit=50000, credit=0 -> net = +50000
 *   signed = +50000. This adds to equity. WRONG -- dividends reduce equity.
 *
 *   *** ERROR: Dividends with debit balance shows as positive,
 *   INCREASING equity instead of reducing it. ***
 *
 *
 * 1.5 CONTRA ACCOUNT HANDLING SUMMARY
 * =====================================
 *
 * Accumulated Depreciation: ERROR -- in CREDIT_POSITIVE_FS_LINES, which makes
 *   it positive (+) and ADDS to total assets. Should be negative (-).
 *   Fix: REMOVE from CREDIT_POSITIVE_FS_LINES.
 *
 * Allowance for Doubtful Accounts: ERROR -- same issue as Accum Dep.
 *   Fix: REMOVE from CREDIT_POSITIVE_FS_LINES.
 *
 * Accumulated Amortization: ERROR -- same issue.
 *   Fix: REMOVE from CREDIT_POSITIVE_FS_LINES.
 *
 * Treasury Stock: ERROR -- NOT in CREDIT_POSITIVE_FS_LINES, so debit balance
 *   shows positive, ADDING to equity. Should reduce equity.
 *   Fix: Need special handling -- either include a debit-contra negation
 *   or handle in the equity summation separately.
 *
 * Sales Returns & Allowances (fs_revenue_contra): NOT in CREDIT_POSITIVE_FS_LINES.
 *   GL: debit=10000, credit=0 -> net = +10000, signed = +10000
 *   This is ROUTED to the revenue bucket (line 293).
 *   totalRevenue = sumLines(revenue) = revenue(+100K) + returns(+10K) = +110K
 *   This INCREASES revenue instead of reducing it!
 *
 *   *** ERROR: Sales Returns add to revenue instead of reducing it. ***
 *   Fix: Either make the sign negative or subtract in grossProfit computation.
 *
 * RATING: ERROR (5 contra account sign errors)
 *
 *
 * ============================================================================
 * TASK 2: STATEMENT GENERATION TRACE
 * ============================================================================
 *
 * 2.1 TRACE: Product Revenue, $100,000 credit balance
 * ====================================================
 * Input: entry with debit=0, credit=100000, fsLineId='fs_revenue_product'
 *
 * netAmount() at line 59:
 *   net = minus(0, 100000) = -100000
 *   creditPositive = CREDIT_POSITIVE_FS_LINES.has('fs_revenue_product') = true
 *   signed = creditPositive ? -net : net = -(-100000) = +100000
 *   return round2(+100000) = 100000
 *
 * The sign flip code is at line 66: "const signed = creditPositive ? -net : net"
 *
 * Decimal.js usage: YES -- minus() uses Decimal.js (from utils/decimal.ts line 30).
 * round2() uses Decimal.js toDecimalPlaces(2).
 *
 * If fs_revenue_product were NOT in CREDIT_POSITIVE_FS_LINES:
 *   signed = net = -100000
 *   Revenue would display as -$100,000 (NEGATIVE). This would be wrong.
 *
 * RATING: CORRECT for revenue sign flip
 *
 *
 * 2.2 TRACE: Accumulated Depreciation, $50,000 credit balance
 * ============================================================
 * Input: entry with debit=0, credit=50000, fsLineId='fs_asset_ppe_accum_dep'
 *
 * netAmount():
 *   net = minus(0, 50000) = -50000
 *   creditPositive = CREDIT_POSITIVE_FS_LINES.has('fs_asset_ppe_accum_dep') = true
 *   signed = -(-50000) = +50000
 *
 * Routed to noncurrentAssets via BS_NONCURRENT_ASSET_FS_LINES (line 103).
 * Added to assets array at line 193.
 *
 * Result: Accum Dep shows as +$50,000 in assets.
 * If PPE Gross = $1,000,000:
 *   totalAssets includes: PPE(+1M) + AccumDep(+50K) = $1,050,000
 *   SHOULD BE: PPE(+1M) + AccumDep(-50K) = $950,000
 *
 * There is NO "Less:" prefix logic. There is NO net PPE calculation.
 * The system does NOT compute "Net PPE = PPE Gross - Accum Dep" explicitly.
 * It relies on the sign convention, which is BROKEN for contra-assets.
 *
 * RATING: ERROR
 *
 *
 * 2.3 TRACE: Retained Earnings, $200,000 credit balance
 * ======================================================
 * Input: entry with debit=0, credit=200000, fsLineId='fs_equity_retained'
 *
 * netAmount():
 *   net = minus(0, 200000) = -200000
 *   creditPositive = CREDIT_POSITIVE_FS_LINES.has('fs_equity_retained') = true
 *   signed = -(-200000) = +200000
 *
 * RE appears as +$200,000 in equity. CORRECT.
 *
 * If RE is negative (accumulated deficit), GL: debit=200000, credit=0:
 *   net = minus(200000, 0) = +200000
 *   signed = -(+200000) = -200000
 *   RE shows as -$200,000.
 *
 * Display format: The system returns the number -200000. Whether it shows as
 * "(200,000)" or "-200,000" depends on the frontend formatting, not the engine.
 * The engine correctly produces the negative number.
 *
 * RATING: CORRECT
 *
 *
 * ============================================================================
 * TASK 3: SIGN CONVENTION DEEP DIVE
 * ============================================================================
 *
 * 3.1 COMPLETE SIGN TRANSFORMATION MAP
 * =====================================
 *
 * Layer 1 - GL Storage:
 *   debit and credit stored as positive numbers (NUMERIC(20,2))
 *
 * Layer 2 - Trial Balance (net computation):
 *   net = debit - credit
 *   Assets/Expenses: positive net = normal debit balance
 *   Liabilities/Equity/Revenue: negative net = normal credit balance
 *
 * Layer 3 - Financial Statement Display (netAmount function, line 59-68):
 *   Single function handles ALL sign transformations.
 *   If fsLineId is in CREDIT_POSITIVE_FS_LINES: display = -(debit - credit)
 *   Otherwise: display = debit - credit
 *
 *   This means:
 *   - Revenue (credit-positive): credit balance -> positive display    CORRECT
 *   - Liability (credit-positive): credit balance -> positive display  CORRECT
 *   - Equity (credit-positive): credit balance -> positive display     CORRECT
 *   - Asset (NOT credit-positive): debit balance -> positive display   CORRECT
 *   - Expense (NOT credit-positive): debit balance -> positive display CORRECT
 *
 *   PROBLEM cases:
 *   - Contra-Asset (IN credit-positive): credit balance -> POSITIVE display
 *     Should be NEGATIVE to reduce total assets. ERROR.
 *   - Contra-Equity Treasury (NOT credit-positive): debit -> POSITIVE display
 *     Should be NEGATIVE to reduce total equity. ERROR.
 *   - Contra-Revenue (NOT credit-positive): debit -> POSITIVE display
 *     Gets summed INTO revenue total. Should reduce it. ERROR.
 *
 * 3.2 WHERE IS THE TRANSFORMATION?
 * =================================
 * SINGLE PLACE: netAmount() function at line 59-68 in financialStatements.ts.
 * This is the sole location for GL-to-FS sign transformation. This is good
 * architectural design (single source of truth) but the implementation has
 * errors for contra accounts as documented above.
 *
 * 3.3 SAFEGUARDS AGAINST MAPPING ERRORS
 * ======================================
 * - Fallback by accountType (line 62-65): if fsLineId is null, the function
 *   falls back to accountType ('LIABILITY', 'EQUITY', 'REVENUE').
 * - Integrity Gate: assertIntegrityGateOrThrow() checks A = L + E, which
 *   would catch errors that cause the balance sheet to not balance.
 * - BUT: contra-account errors may not break A = L + E if they affect BOTH
 *   sides symmetrically or if the amounts happen to be small enough.
 *
 * Could a mapping error cause Revenue to show negative?
 *   YES -- if an account is mapped to a revenue fsLineId but that fsLineId
 *   is accidentally removed from CREDIT_POSITIVE_FS_LINES, revenue with
 *   credit balances would show as negative. The safeguard is that the set
 *   is hardcoded (not configurable), reducing this risk.
 *
 * RATING: CONCERN (design is sound but contra implementation is wrong)
 *
 *
 * ============================================================================
 * TASK 4: CASH FLOW VERIFICATION
 * ============================================================================
 *
 * 4.1 INDIRECT METHOD IMPLEMENTATION (cashFlow.ts)
 * =================================================
 *
 * Starting point: Net Income from P&L (line 47)                      CORRECT
 *
 * Non-cash add-backs:
 *   Depreciation & Amortization (line 96, regex match)               CORRECT
 *   Deferred Tax change (line 98-100, balance delta with negation)   CORRECT
 *   Unrealized FX (line 102-105, P&L expense add-back)              CORRECT
 *   Stock-Based Compensation (line 107, P&L expense add-back)        CORRECT
 *
 * Working capital changes (lines 109-125):
 *   Change in AR:  amount = -changeAR                                CORRECT
 *     AR increase -> positive delta -> negated = cash decrease
 *   Change in Inventory: amount = -changeInv                         CORRECT
 *     Inventory increase -> positive delta -> negated = cash decrease
 *   Change in AP:  amount = changeAP (NOT negated)                   CORRECT
 *     AP increase -> positive delta -> cash increase
 *   Change in Accrued: NOT explicitly handled                        CONCERN
 *     Accrued liabilities are not in the working capital section.
 *     They could match under the explicit cfClassificationMap path,
 *     but the regex heuristic does not capture them.
 *
 * CONCERN: normalizeNet() in cashFlow.ts (line 231-237) uses a different
 * sign normalization than netAmount() in financialStatements.ts. The cashFlow
 * version checks accountType string equality, while the FS version checks
 * the CREDIT_POSITIVE_FS_LINES set. For accounts with fsLineId but unusual
 * accountType, these could produce different results. However, since cashFlow
 * uses balance DELTAS (current minus prior), sign consistency within the
 * function is what matters, and it is consistent.
 *
 * Investing Activities (lines 131-138):
 *   PPE change: amount = -changePPE                                  CORRECT
 *   Positive delta (more PPE) -> negated = capital expenditure (outflow)
 *
 * Financing Activities (lines 139-153):
 *   Debt change: amount = changeDebt                                 CORRECT
 *   Equity change: amount = changeEquity                             CORRECT
 *
 * 4.2 ENDING CASH = BS CASH?
 * ===========================
 * endingCash (line 45) = getNetAmount(trialBalance.entries, /cash|bank/i)
 * This uses the SAME trial balance entries that build the balance sheet.
 * getNetAmount() calls normalizeNet() which flips sign for LIABILITY/EQUITY/REVENUE
 * account types. Cash accounts are ASSET type, so net = debit - credit (positive).
 *
 * The cross-statement validation (check 3, line 79-88) explicitly verifies
 * CF ending cash equals BS cash by regex-matching /cash|bank/i on BS asset labels.
 *
 * CONCERN: Both CF and the cross-statement validator use regex /cash|bank/i
 * to find cash accounts. If a cash account name does not contain "cash" or
 * "bank", it would be missed. This is a heuristic risk.
 *
 * RATING: CORRECT (with minor concerns about accrued liabilities and regex fragility)
 *
 *
 * ============================================================================
 * TASK 5: CROSS-STATEMENT VALIDATION
 * ============================================================================
 *
 * 5.1 VALIDATION CHECKS (cross_statement_validation.ts)
 * ======================================================
 *
 * Check 1: A = L + E (line 54-63)
 *   Uses Decimal.js: YES (decimalFrom().toDecimalPlaces(2))
 *   Comparison: Decimal.equals() (exact match after rounding to 2dp)
 *   check_type: 'hard' -- blocks certification if fails
 *   CORRECT
 *
 * Check 2: Net Income Tie (IS net income = Equity net income) (line 66-76)
 *   Finds equity net income by regex /net income/i on equity changes
 *   Falls back to IS net income if not found
 *   Uses Decimal.js: YES
 *   check_type: 'hard'
 *   CORRECT
 *
 * Check 3: Cash Tie (CF ending cash = BS cash) (line 79-88)
 *   getCashFromBalanceSheet uses regex /cash|bank/i on BS asset labels
 *   Uses Decimal.js: YES
 *   check_type: 'hard'
 *   CORRECT
 *
 * Check 4: Equity Tie (Equity statement closing = BS total equity) (line 91-100)
 *   Uses Decimal.js: YES
 *   check_type: 'hard'
 *   CORRECT
 *
 * 5.2 MISSING CHECKS
 * ===================
 * - Beginning Equity + Net Income + OCI - Dividends = Ending Equity:
 *   NOT explicitly checked. The equity statement builder (equityChanges.ts)
 *   computes a "residual" for owner contributions/distributions, which means
 *   it always balances by construction. This is not a validation -- it's a
 *   plug calculation.
 *   CONCERN: No independent validation of equity roll-forward.
 *
 * - Retained Earnings on BS = RE on Equity Statement:
 *   NOT checked. The equity statement does not separately track RE.
 *   CONCERN: Missing check.
 *
 * 5.3 TOLERANCE
 * ==============
 * The cross-statement validation uses Decimal.equals() which is exact match
 * after rounding to 2dp. This means tolerance is effectively $0.00 (zero).
 * The integrity gate uses a configurable tolerance capped at $0.01.
 * The balance sheet builder has a rounding adjustment mechanism (lines 216-223)
 * that inserts a "Rounding adjustment" line to equity if the BS imbalance
 * is <= $0.01, which ensures the cross-statement check passes.
 *
 * 5.4 WHAT HAPPENS ON FAILURE?
 * =============================
 * Checks with check_type 'hard' block certification.
 * The function returns ValidationCheck[] with passes: false.
 * The caller (presumably the certification endpoint) blocks advancement.
 * This is CORRECT behavior for a gating mechanism.
 *
 * Additionally, the integrity gate (assertIntegrityGateOrThrow) throws
 * MathematicalIntegrityError (HTTP 422), which is an even harder gate
 * that prevents statement generation entirely.
 *
 * RATING: CORRECT (with concerns about missing equity roll-forward validation)
 *
 *
 * ============================================================================
 * TASK 6: EDGE CASES
 * ============================================================================
 *
 * 6.1 ALL ZERO BALANCES
 * =====================
 * If all GL entries have debit=0, credit=0:
 *   netAmount() = minus(0, 0) = 0 for all entries
 *   All totals = $0.00
 *   Balance sheet: A(0) = L(0) + E(0) -- passes integrity gate
 *   P&L: Revenue(0) - Expenses(0) = Net Income(0)
 *   Statements would generate with $0 everywhere.
 *   RATING: CORRECT
 *
 * 6.2 CONTRA ACCOUNT WITH ABNORMAL BALANCE
 * ==========================================
 * Example: Accumulated Depreciation with DEBIT balance (reversal situation)
 *   GL: debit=5000, credit=0, fsLineId='fs_asset_ppe_accum_dep'
 *   net = minus(5000, 0) = +5000
 *   creditPositive = true (in CREDIT_POSITIVE_FS_LINES)
 *   signed = -(+5000) = -5000
 *
 * This would show Accum Dep as -$5,000 in assets, which REDUCES total assets.
 * But an Accum Dep reversal (debit) should actually INCREASE net PPE.
 * The sign would be inverted from what's expected.
 *
 * Combined with the base error (normal credit Accum Dep showing positive
 * when it should be negative), the abnormal balance case adds confusion
 * but does not create an additional error pattern -- it's consistently wrong.
 *
 * RATING: ERROR (compounds the contra-asset sign error from Task 1)
 *
 * 6.3 NET LOSS (NEGATIVE NET INCOME)
 * ====================================
 * If expenses > revenue:
 *   netIncome = incomeBeforeTax - totalTax
 *   If totalRevenue=80K, totalCogs=60K, totalOpex=30K, totalTax=0:
 *     grossProfit = 80K - 60K = 20K
 *     operatingIncome = 20K - 30K = -10K
 *     incomeBeforeTax = -10K + 0 = -10K
 *     netIncome = -10K - 0 = -10K
 *
 * Balance Sheet:
 *   totalEquity = equityOnly + (totalRevenue - totalExpenses) + totalOci
 *   totalEquity = equityOnly + (-10K) + 0
 *   Net loss correctly reduces equity. CORRECT.
 *
 * Cash Flow:
 *   Starts with netIncome = -10K. CORRECT.
 *   Non-cash add-backs still work (add positive numbers). CORRECT.
 *
 * Equity Changes:
 *   changes includes { label: 'Net income', amount: -10000 }. CORRECT.
 *
 * RATING: CORRECT
 *
 * 6.4 ACCUMULATED DEFICIT (NEGATIVE RE)
 * =======================================
 * RE with debit balance (accumulated deficit):
 *   GL: debit=200000, credit=0, fsLineId='fs_equity_retained'
 *   net = +200000
 *   creditPositive = true
 *   signed = -200000
 *
 * Shows as -$200,000 in equity. This correctly reduces total equity.
 * XBRL element is 'RetainedEarningsAccumulatedDeficit' which handles both.
 *
 * RATING: CORRECT
 *
 *
 * ============================================================================
 * SUMMARY OF FINDINGS
 * ============================================================================
 *
 * AREA                                    | RATING
 * -----------------------------------------|--------
 * Taxonomy Line Inventory                  | CORRECT
 * Taxonomy Hierarchy (parent-child)        | CORRECT
 * Duplicate DTL taxonomy line              | CONCERN
 * P&L Subtotal Logic                       | CORRECT
 * Revenue Sign Convention                  | CORRECT
 * Expense Sign Convention                  | CORRECT
 * Asset Sign Convention                    | CORRECT
 * Liability Sign Convention               | CORRECT
 * Equity Sign Convention (non-contra)      | CORRECT
 * Contra-Asset Sign (AccumDep,Allow,Amort) | ERROR
 * Contra-Equity Sign (Treasury Stock)      | ERROR
 * Contra-Equity Sign (Dividends)           | ERROR
 * Contra-Revenue Sign (Sales Returns)      | ERROR
 * fs_equity_aoci missing from sign set     | CONCERN
 * fs_liability_dtl missing from sign set   | CONCERN
 * Decimal.js Usage Throughout              | CORRECT
 * Integrity Gate (Debits=Credits)          | CORRECT
 * Integrity Gate (A=L+E)                  | CORRECT
 * Rounding Adjustment Mechanism            | CORRECT
 * Plug Account Detection                  | CORRECT
 * Cash Flow Indirect Method               | CORRECT
 * Cash Flow Working Capital Signs          | CORRECT
 * Cash Flow Missing Accrued Liabilities    | CONCERN
 * Cash Flow Regex-based Classification     | CONCERN
 * Cross-Statement: A=L+E                  | CORRECT
 * Cross-Statement: Net Income Tie          | CORRECT
 * Cross-Statement: Cash Tie               | CORRECT
 * Cross-Statement: Equity Tie             | CORRECT
 * Missing: Equity Roll-Forward Validation  | CONCERN
 * Missing: RE Tie Check                   | CONCERN
 * Zero Balance Edge Case                  | CORRECT
 * Net Loss Flow-through                   | CORRECT
 * Accumulated Deficit Display             | CORRECT
 *
 *
 * ============================================================================
 * CRITICAL ERRORS REQUIRING REMEDIATION
 * ============================================================================
 *
 * ERROR 1: CONTRA-ASSET SIGN INVERSION (HIGH SEVERITY)
 * Location: financialStatements.ts line 47
 * Lines: fs_asset_ar_allowance, fs_asset_ppe_accum_dep, fs_asset_intangible_amort
 * Impact: These three lines are in CREDIT_POSITIVE_FS_LINES, causing their
 *   credit balances to display as POSITIVE amounts in the assets section.
 *   This OVERSTATES total assets by 2x the contra balance.
 *   Example: PPE Gross $1M + Accum Dep shows as +$50K = $1.05M
 *            Should be: PPE Gross $1M + Accum Dep -$50K = $0.95M
 * Fix: REMOVE these three lines from CREDIT_POSITIVE_FS_LINES.
 *   Without the credit-positive flag, credit balances compute as:
 *   net = 0 - 50000 = -50000, signed = net = -50000 (negative, reducing assets)
 * Note: The integrity gate A=L+E check MAY catch this if the overstatement
 *   is large enough, but it would manifest as a MathematicalIntegrityError
 *   rather than a clean resolution.
 *
 * ERROR 2: TREASURY STOCK SIGN (HIGH SEVERITY)
 * Location: financialStatements.ts lines 36-48 (MISSING from set) and line 119
 * Impact: Treasury Stock has debit normal balance. Not in CREDIT_POSITIVE_FS_LINES.
 *   GL: debit=100K, credit=0 -> net = +100K, signed = +100K
 *   Added to equity bucket, INCREASES total equity.
 *   Should DECREASE equity (it's a contra-equity account).
 * Fix: Treasury Stock needs special handling. Options:
 *   (a) Add to CREDIT_POSITIVE_FS_LINES -- but this would flip a DEBIT balance
 *       to negative, which is what we want. debit=100K: net=+100K, signed=-100K.
 *       YES, adding fs_equity_treasury to CREDIT_POSITIVE_FS_LINES fixes this.
 *
 * ERROR 3: DIVIDENDS DECLARED SIGN (HIGH SEVERITY)
 * Location: financialStatements.ts (fs_equity_dividends NOT in CREDIT_POSITIVE_FS_LINES)
 * Impact: Same as Treasury Stock. Dividends has debit normal balance.
 *   Debit balance shows positive, increasing equity instead of decreasing it.
 * Fix: Add fs_equity_dividends to CREDIT_POSITIVE_FS_LINES.
 *   debit=50K: net=+50K, signed=-(+50K)=-50K. Correctly reduces equity.
 *
 * ERROR 4: SALES RETURNS SIGN (MEDIUM SEVERITY)
 * Location: financialStatements.ts line 293 (routed to revenue bucket)
 * fs_revenue_contra is NOT in CREDIT_POSITIVE_FS_LINES.
 * Impact: Sales Returns (debit balance) shows as positive in revenue.
 *   debit=10K: net=+10K, signed=+10K. Added to totalRevenue.
 *   Revenue OVERSTATED by 2x the returns amount.
 * Fix: Either:
 *   (a) The netAmount function should NOT flip contra-revenue (current behavior
 *       is correct for that part) BUT the amount should be subtracted in the
 *       totalRevenue calculation. Currently sumLines(revenue) simply adds all.
 *   OR (b) Keep in revenue bucket but negate: add fs_revenue_contra to
 *       CREDIT_POSITIVE_FS_LINES. Then debit=10K: signed = -(+10K) = -10K.
 *       sumLines(revenue) = 100K + (-10K) = 90K net revenue. CORRECT.
 *   Recommended: Option (b) -- add to CREDIT_POSITIVE_FS_LINES.
 *
 *
 * ============================================================================
 * RECOMMENDED FIXES (SUMMARY)
 * ============================================================================
 *
 * In financialStatements.ts, the CREDIT_POSITIVE_FS_LINES set needs:
 *
 * REMOVE (contra-assets should NOT be credit-positive):
 *   - 'fs_asset_ar_allowance'
 *   - 'fs_asset_ppe_accum_dep'
 *   - 'fs_asset_intangible_amort'
 *
 * ADD (contra-equity and contra-revenue need sign flip):
 *   - 'fs_equity_treasury'
 *   - 'fs_equity_dividends'
 *   - 'fs_revenue_contra'
 *   - 'fs_equity_aoci'
 *   - 'fs_liability_dtl'
 *
 * ============================================================================
 * END OF AUDIT REPORT
 * ============================================================================
 */
