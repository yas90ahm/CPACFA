-- Income Statement: PE-standard subtotal hierarchy
-- Revenue → COGS → Gross Profit → OpEx → Operating Income → Other → Income Before Tax → Tax → Net Income → EBITDA
-- These are grouping/section nodes; existing fs_revenue and fs_expense remain as fallback leaf nodes.

-- Update statement constraint to allow OCI (may already exist from migration 126)
-- Safe no-op if already altered:
DO $$ BEGIN
  ALTER TABLE fs_taxonomy_lines DROP CONSTRAINT IF EXISTS chk_statement;
  ALTER TABLE fs_taxonomy_lines ADD CONSTRAINT chk_statement CHECK (statement IN ('PL', 'BS', 'CF', 'OCI'));
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- P&L section nodes (parent_id chains create hierarchy)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance) VALUES
  -- COGS section (debit-positive expense accounts that are cost of goods sold)
  ('fs_cogs',         'PL_COGS',         'Cost of Goods Sold',            'PL', NULL, 'debit'),
  -- Operating Expenses section
  ('fs_opex',         'PL_OPEX',         'Operating Expenses',            'PL', NULL, 'debit'),
  ('fs_opex_sga',     'PL_OPEX_SGA',     'Selling, General & Administrative', 'PL', 'fs_opex', 'debit'),
  ('fs_opex_rd',      'PL_OPEX_RD',      'Research & Development',        'PL', 'fs_opex', 'debit'),
  ('fs_opex_da',      'PL_OPEX_DA',      'Depreciation & Amortization',   'PL', 'fs_opex', 'debit'),
  ('fs_opex_other',   'PL_OPEX_OTHER',   'Other Operating Expenses',      'PL', 'fs_opex', 'debit'),
  -- Other Income / (Expense) section
  ('fs_other_income',   'PL_OTHER_INCOME',    'Other Income / (Expense)',      'PL', NULL, 'credit'),
  ('fs_interest_income','PL_INTEREST_INCOME', 'Interest Income',               'PL', 'fs_other_income', 'credit'),
  ('fs_interest_expense','PL_INTEREST_EXPENSE','Interest Expense',             'PL', 'fs_other_income', 'debit'),
  ('fs_other_other',    'PL_OTHER_OTHER',     'Other Non-Operating',           'PL', 'fs_other_income', 'credit'),
  -- Tax
  ('fs_tax_expense',  'PL_TAX_EXPENSE',  'Income Tax Expense',            'PL', NULL, 'debit')
ON CONFLICT (id) DO NOTHING;
