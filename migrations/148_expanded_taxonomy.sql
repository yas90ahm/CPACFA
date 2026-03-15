-- Expanded FS taxonomy: contra accounts, subtotal flags, display ordering.
-- Adds is_subtotal, is_contra, display_order columns and populates the complete taxonomy.

-- Add new columns (safe if already exist)
ALTER TABLE fs_taxonomy_lines ADD COLUMN IF NOT EXISTS is_subtotal BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fs_taxonomy_lines ADD COLUMN IF NOT EXISTS is_contra BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE fs_taxonomy_lines ADD COLUMN IF NOT EXISTS display_order INTEGER NOT NULL DEFAULT 0;

-- =====================================================================
-- INCOME STATEMENT taxonomy
-- =====================================================================
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance, is_subtotal, is_contra, display_order) VALUES
  -- Revenue section
  ('fs_revenue_contra', 'PL_REVENUE_CONTRA', 'Sales Returns & Allowances', 'PL', 'fs_revenue', 'debit', FALSE, TRUE, 102)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code, name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
  normal_balance = EXCLUDED.normal_balance, is_subtotal = EXCLUDED.is_subtotal,
  is_contra = EXCLUDED.is_contra, display_order = EXCLUDED.display_order;

-- Update existing PL lines with display_order
UPDATE fs_taxonomy_lines SET display_order = 100, is_subtotal = FALSE WHERE id = 'fs_revenue';
UPDATE fs_taxonomy_lines SET display_order = 200, is_subtotal = FALSE WHERE id = 'fs_cogs';
UPDATE fs_taxonomy_lines SET display_order = 300, is_subtotal = TRUE  WHERE id = 'fs_opex';
UPDATE fs_taxonomy_lines SET display_order = 310, is_subtotal = FALSE WHERE id = 'fs_opex_sga';
UPDATE fs_taxonomy_lines SET display_order = 320, is_subtotal = FALSE WHERE id = 'fs_opex_rd';
UPDATE fs_taxonomy_lines SET display_order = 330, is_subtotal = FALSE WHERE id = 'fs_opex_da';
UPDATE fs_taxonomy_lines SET display_order = 340, is_subtotal = FALSE WHERE id = 'fs_opex_other';
UPDATE fs_taxonomy_lines SET display_order = 500, is_subtotal = FALSE WHERE id = 'fs_interest_income';
UPDATE fs_taxonomy_lines SET display_order = 510, is_subtotal = FALSE WHERE id = 'fs_interest_expense';
UPDATE fs_taxonomy_lines SET display_order = 520, is_subtotal = FALSE WHERE id = 'fs_other_income';
UPDATE fs_taxonomy_lines SET display_order = 530, is_subtotal = FALSE WHERE id = 'fs_other_other';
UPDATE fs_taxonomy_lines SET display_order = 600, is_subtotal = FALSE WHERE id = 'fs_tax_expense';
UPDATE fs_taxonomy_lines SET display_order = 110, is_subtotal = FALSE WHERE id = 'fs_expense';

-- =====================================================================
-- BALANCE SHEET taxonomy — contra accounts
-- =====================================================================
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance, is_subtotal, is_contra, display_order) VALUES
  -- AR contra
  ('fs_asset_ar_allowance',    'BS_ASSET_AR_ALLOWANCE',    'Allowance for Doubtful Accounts',  'BS', 'fs_asset_current', 'credit', FALSE, TRUE,  1030),
  -- PPE contra
  ('fs_asset_ppe_accum_dep',   'BS_ASSET_PPE_ACCUM_DEP',   'Accumulated Depreciation',         'BS', 'fs_asset_noncurrent', 'credit', FALSE, TRUE,  1120),
  -- Intangible contra
  ('fs_asset_intangible_amort','BS_ASSET_INTANGIBLE_AMORT','Accumulated Amortization',         'BS', 'fs_asset_noncurrent', 'credit', FALSE, TRUE,  1140),
  -- Treasury stock (equity contra)
  ('fs_equity_treasury',       'BS_EQUITY_TREASURY',       'Treasury Stock',                   'BS', 'fs_equity', 'debit', FALSE, TRUE, 2030)
ON CONFLICT (id) DO UPDATE SET
  code = EXCLUDED.code, name = EXCLUDED.name, parent_id = EXCLUDED.parent_id,
  normal_balance = EXCLUDED.normal_balance, is_subtotal = EXCLUDED.is_subtotal,
  is_contra = EXCLUDED.is_contra, display_order = EXCLUDED.display_order;

-- Update existing BS lines with display_order
UPDATE fs_taxonomy_lines SET display_order = 1000, is_subtotal = TRUE  WHERE id = 'fs_asset';
UPDATE fs_taxonomy_lines SET display_order = 1001, is_subtotal = TRUE  WHERE id = 'fs_asset_current';
UPDATE fs_taxonomy_lines SET display_order = 1010, is_subtotal = FALSE WHERE id = 'fs_asset_cash';
UPDATE fs_taxonomy_lines SET display_order = 1020, is_subtotal = FALSE WHERE id = 'fs_asset_ar';
UPDATE fs_taxonomy_lines SET display_order = 1040, is_subtotal = FALSE WHERE id = 'fs_asset_inventory';
UPDATE fs_taxonomy_lines SET display_order = 1050, is_subtotal = FALSE WHERE id = 'fs_asset_prepaid';
UPDATE fs_taxonomy_lines SET display_order = 1060, is_subtotal = FALSE WHERE id = 'fs_asset_other_current';
UPDATE fs_taxonomy_lines SET display_order = 1100, is_subtotal = TRUE  WHERE id = 'fs_asset_noncurrent';
UPDATE fs_taxonomy_lines SET display_order = 1110, is_subtotal = FALSE WHERE id = 'fs_asset_ppe';
UPDATE fs_taxonomy_lines SET display_order = 1130, is_subtotal = FALSE WHERE id = 'fs_asset_goodwill';
UPDATE fs_taxonomy_lines SET display_order = 1135, is_subtotal = FALSE WHERE id = 'fs_asset_intangible';
UPDATE fs_taxonomy_lines SET display_order = 1150, is_subtotal = FALSE WHERE id = 'fs_asset_other_noncurrent';
UPDATE fs_taxonomy_lines SET display_order = 1500, is_subtotal = TRUE  WHERE id = 'fs_liability';
UPDATE fs_taxonomy_lines SET display_order = 1501, is_subtotal = TRUE  WHERE id = 'fs_liability_current';
UPDATE fs_taxonomy_lines SET display_order = 1510, is_subtotal = FALSE WHERE id = 'fs_liability_ap';
UPDATE fs_taxonomy_lines SET display_order = 1520, is_subtotal = FALSE WHERE id = 'fs_liability_accrued';
UPDATE fs_taxonomy_lines SET display_order = 1530, is_subtotal = FALSE WHERE id = 'fs_liability_current_debt';
UPDATE fs_taxonomy_lines SET display_order = 1540, is_subtotal = FALSE WHERE id = 'fs_liability_other_current';
UPDATE fs_taxonomy_lines SET display_order = 1600, is_subtotal = TRUE  WHERE id = 'fs_liability_noncurrent';
UPDATE fs_taxonomy_lines SET display_order = 1610, is_subtotal = FALSE WHERE id = 'fs_liability_lt_debt';
UPDATE fs_taxonomy_lines SET display_order = 1620, is_subtotal = FALSE WHERE id = 'fs_liability_deferred_tax';
UPDATE fs_taxonomy_lines SET display_order = 1630, is_subtotal = FALSE WHERE id = 'fs_liability_other_noncurrent';
UPDATE fs_taxonomy_lines SET display_order = 2000, is_subtotal = TRUE  WHERE id = 'fs_equity';
UPDATE fs_taxonomy_lines SET display_order = 2010, is_subtotal = FALSE WHERE id = 'fs_equity_common';
UPDATE fs_taxonomy_lines SET display_order = 2020, is_subtotal = FALSE WHERE id = 'fs_equity_retained';
UPDATE fs_taxonomy_lines SET display_order = 2040, is_subtotal = FALSE WHERE id = 'fs_equity_other';
UPDATE fs_taxonomy_lines SET display_order = 2050, is_subtotal = FALSE WHERE id = 'fs_oci';

-- Update CF and OCI lines with display_order and is_subtotal
UPDATE fs_taxonomy_lines SET display_order = 3000, is_subtotal = TRUE WHERE id = 'fs_cf_operating';
UPDATE fs_taxonomy_lines SET display_order = 3100, is_subtotal = TRUE WHERE id = 'fs_cf_investing';
UPDATE fs_taxonomy_lines SET display_order = 3200, is_subtotal = TRUE WHERE id = 'fs_cf_financing';

-- Rename some lines for clearer labels
UPDATE fs_taxonomy_lines SET name = 'Common Stock & APIC' WHERE id = 'fs_equity_common';
UPDATE fs_taxonomy_lines SET name = 'Property, Plant & Equipment, Gross' WHERE id = 'fs_asset_ppe';
UPDATE fs_taxonomy_lines SET name = 'Intangible Assets, Gross' WHERE id = 'fs_asset_intangible';
UPDATE fs_taxonomy_lines SET name = 'Accounts Receivable, Gross' WHERE id = 'fs_asset_ar';
