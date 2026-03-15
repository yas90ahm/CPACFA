-- Migration 152: Anchor FS taxonomy lines to XBRL US GAAP elements.
-- Adds xbrl_element and xbrl_label columns, populates for all existing lines.
-- Also adds missing taxonomy lines (fs_equity_aoci, fs_liability_dtl)
-- and mapping_status column to tenant_chart_of_accounts for account exclusion.

-- =====================================================================
-- PART A: Add XBRL columns to fs_taxonomy_lines
-- =====================================================================

ALTER TABLE fs_taxonomy_lines ADD COLUMN IF NOT EXISTS xbrl_element TEXT;
ALTER TABLE fs_taxonomy_lines ADD COLUMN IF NOT EXISTS xbrl_label TEXT;

-- =====================================================================
-- PART B: Insert missing taxonomy lines needed for XBRL mapping
-- =====================================================================

INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_equity_aoci', 'BS_EQUITY_AOCI', 'Accumulated Other Comprehensive Income/Loss', 'BS', 'fs_equity', 'credit')
ON CONFLICT (id) DO NOTHING;

INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance)
VALUES ('fs_liability_dtl', 'BS_LIAB_DTL', 'Deferred Tax Liabilities', 'BS', 'fs_liability_noncurrent', 'credit')
ON CONFLICT (id) DO NOTHING;

-- =====================================================================
-- PART C: Populate XBRL mappings for all existing taxonomy lines
-- =====================================================================

-- Income Statement lines
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:Revenues', xbrl_label = 'Revenues'
  WHERE id = 'fs_revenue';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:RevenueFromContractWithCustomerExcludingAssessedTax', xbrl_label = 'Revenue from Contract with Customer'
  WHERE id = 'fs_revenue_product';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:ServiceRevenue', xbrl_label = 'Service Revenue'
  WHERE id = 'fs_revenue_service';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:OtherIncome', xbrl_label = 'Other Revenue'
  WHERE id = 'fs_revenue_other';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:SalesReturnsAndAllowances', xbrl_label = 'Sales Returns and Allowances'
  WHERE id = 'fs_revenue_contra';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:CostOfGoodsAndServicesSold', xbrl_label = 'Cost of Goods and Services Sold'
  WHERE id = 'fs_cogs';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:CostOfGoodsSoldDirectMaterials', xbrl_label = 'Direct Materials'
  WHERE id = 'fs_cogs_materials';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:CostOfGoodsSoldDirectLabor', xbrl_label = 'Direct Labor'
  WHERE id = 'fs_cogs_labor';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:CostOfGoodsSoldOverhead', xbrl_label = 'Manufacturing Overhead'
  WHERE id = 'fs_cogs_overhead';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:SellingGeneralAndAdministrativeExpense', xbrl_label = 'SGA'
  WHERE id = 'fs_opex_sga';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:ResearchAndDevelopmentExpense', xbrl_label = 'R&D'
  WHERE id = 'fs_opex_rd';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:DepreciationDepletionAndAmortization', xbrl_label = 'D&A'
  WHERE id = 'fs_opex_da';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:OtherOperatingIncomeExpenseNet', xbrl_label = 'Other OpEx'
  WHERE id = 'fs_opex_other';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:InterestIncomeExpenseNet', xbrl_label = 'Interest Income'
  WHERE id = 'fs_interest_income';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:InterestExpense', xbrl_label = 'Interest Expense'
  WHERE id = 'fs_interest_expense';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:NonoperatingIncomeExpense', xbrl_label = 'Other Income/Expense'
  WHERE id = 'fs_other_income';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:GainLossOnDispositionOfAssets', xbrl_label = 'Gain/Loss on Disposal'
  WHERE id = 'fs_other_gain_loss';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:IncomeTaxExpenseBenefit', xbrl_label = 'Income Tax'
  WHERE id = 'fs_tax_expense';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:CurrentIncomeTaxExpenseBenefit', xbrl_label = 'Current Tax'
  WHERE id = 'fs_tax_current';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:DeferredIncomeTaxExpenseBenefit', xbrl_label = 'Deferred Tax'
  WHERE id = 'fs_tax_deferred';

-- Balance Sheet — Assets
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:CashAndCashEquivalentsAtCarryingValue', xbrl_label = 'Cash'
  WHERE id = 'fs_asset_cash';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:AccountsReceivableNetCurrent', xbrl_label = 'AR Net'
  WHERE id = 'fs_asset_ar';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:AllowanceForDoubtfulAccountsReceivableCurrent', xbrl_label = 'AR Allowance'
  WHERE id = 'fs_asset_ar_allowance';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:InventoryNet', xbrl_label = 'Inventory'
  WHERE id = 'fs_asset_inventory';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:PrepaidExpenseCurrent', xbrl_label = 'Prepaid'
  WHERE id = 'fs_asset_prepaid';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:OtherAssetsCurrent', xbrl_label = 'Other Current Assets'
  WHERE id = 'fs_asset_other_current';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:PropertyPlantAndEquipmentGross', xbrl_label = 'PPE Gross'
  WHERE id = 'fs_asset_ppe';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:AccumulatedDepreciationDepletionAndAmortizationPropertyPlantAndEquipment', xbrl_label = 'Accum Dep'
  WHERE id = 'fs_asset_ppe_accum_dep';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:IntangibleAssetsNetExcludingGoodwill', xbrl_label = 'Intangibles'
  WHERE id = 'fs_asset_intangible';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:AccumulatedAmortizationOfIntangibleAssets', xbrl_label = 'Accum Amort'
  WHERE id = 'fs_asset_intangible_amort';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:Goodwill', xbrl_label = 'Goodwill'
  WHERE id = 'fs_asset_goodwill';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:DeferredIncomeTaxAssetsNet', xbrl_label = 'Deferred Tax Assets'
  WHERE id = 'fs_asset_dta';

-- Balance Sheet — Liabilities
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:AccountsPayableCurrent', xbrl_label = 'AP'
  WHERE id = 'fs_liability_ap';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:AccruedLiabilitiesCurrent', xbrl_label = 'Accrued Liabilities'
  WHERE id = 'fs_liability_accrued';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:ShortTermBorrowings', xbrl_label = 'Current Debt'
  WHERE id = 'fs_liability_current_debt';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:ContractWithCustomerLiabilityCurrent', xbrl_label = 'Deferred Rev Current'
  WHERE id = 'fs_liability_deferred_rev_current';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:OtherLiabilitiesCurrent', xbrl_label = 'Other Current Liab'
  WHERE id = 'fs_liability_other_current';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:LongTermDebtNoncurrent', xbrl_label = 'LT Debt'
  WHERE id = 'fs_liability_lt_debt';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:ContractWithCustomerLiabilityNoncurrent', xbrl_label = 'Deferred Rev Non-Current'
  WHERE id = 'fs_liability_deferred_rev_noncurrent';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:DeferredIncomeTaxLiabilitiesNet', xbrl_label = 'Deferred Tax Liab'
  WHERE id = 'fs_liability_dtl';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:OtherLiabilitiesNoncurrent', xbrl_label = 'Other Non-Current Liab'
  WHERE id = 'fs_liability_other_noncurrent';

-- Balance Sheet — Equity
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:StockholdersEquity', xbrl_label = 'Stockholders Equity'
  WHERE id = 'fs_equity';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:CommonStockValue', xbrl_label = 'Common Stock'
  WHERE id = 'fs_equity_common';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:AdditionalPaidInCapital', xbrl_label = 'APIC'
  WHERE id = 'fs_equity_apic';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:RetainedEarningsAccumulatedDeficit', xbrl_label = 'Retained Earnings'
  WHERE id = 'fs_equity_retained';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:TreasuryStockValue', xbrl_label = 'Treasury Stock'
  WHERE id = 'fs_equity_treasury';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:AccumulatedOtherComprehensiveIncomeLossNetOfTax', xbrl_label = 'AOCI'
  WHERE id = 'fs_equity_aoci';
UPDATE fs_taxonomy_lines SET xbrl_element = 'us-gaap:Dividends', xbrl_label = 'Dividends'
  WHERE id = 'fs_equity_dividends';

-- =====================================================================
-- PART D: Add mapping_status column to tenant_chart_of_accounts
-- =====================================================================

ALTER TABLE core.tenant_chart_of_accounts
  ADD COLUMN IF NOT EXISTS mapping_status TEXT NOT NULL DEFAULT 'PENDING'
  CHECK (mapping_status IN ('PENDING', 'MAPPED', 'EXCLUDED', 'INVESTIGATING'));

CREATE INDEX IF NOT EXISTS idx_tenant_coa_mapping_status
  ON core.tenant_chart_of_accounts(tenant_id, mapping_status);
