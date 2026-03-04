-- Balance Sheet: Current / Non-Current classification (GAAP ASC 210-10-45)
-- Adds sub-section nodes under fs_asset and fs_liability for current/non-current grouping.

INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance) VALUES
  -- Current Assets
  ('fs_asset_current',           'BS_ASSET_CURRENT',           'Current Assets',                  'BS', 'fs_asset', 'debit'),
  ('fs_asset_cash',              'BS_ASSET_CASH',              'Cash and Cash Equivalents',       'BS', 'fs_asset_current', 'debit'),
  ('fs_asset_ar',                'BS_ASSET_AR',                'Accounts Receivable',             'BS', 'fs_asset_current', 'debit'),
  ('fs_asset_inventory',         'BS_ASSET_INVENTORY',         'Inventory',                       'BS', 'fs_asset_current', 'debit'),
  ('fs_asset_prepaid',           'BS_ASSET_PREPAID',           'Prepaid Expenses',                'BS', 'fs_asset_current', 'debit'),
  ('fs_asset_other_current',     'BS_ASSET_OTHER_CURRENT',     'Other Current Assets',            'BS', 'fs_asset_current', 'debit'),
  -- Non-Current Assets
  ('fs_asset_noncurrent',        'BS_ASSET_NONCURRENT',        'Non-Current Assets',              'BS', 'fs_asset', 'debit'),
  ('fs_asset_ppe',               'BS_ASSET_PPE',               'Property, Plant & Equipment',     'BS', 'fs_asset_noncurrent', 'debit'),
  ('fs_asset_intangible',        'BS_ASSET_INTANGIBLE',        'Intangible Assets',               'BS', 'fs_asset_noncurrent', 'debit'),
  ('fs_asset_goodwill',          'BS_ASSET_GOODWILL',          'Goodwill',                        'BS', 'fs_asset_noncurrent', 'debit'),
  ('fs_asset_other_noncurrent',  'BS_ASSET_OTHER_NONCURRENT',  'Other Non-Current Assets',        'BS', 'fs_asset_noncurrent', 'debit'),
  -- Current Liabilities
  ('fs_liability_current',       'BS_LIAB_CURRENT',            'Current Liabilities',             'BS', 'fs_liability', 'credit'),
  ('fs_liability_ap',            'BS_LIAB_AP',                 'Accounts Payable',                'BS', 'fs_liability_current', 'credit'),
  ('fs_liability_accrued',       'BS_LIAB_ACCRUED',            'Accrued Liabilities',             'BS', 'fs_liability_current', 'credit'),
  ('fs_liability_current_debt',  'BS_LIAB_CURRENT_DEBT',       'Current Portion of Long-Term Debt','BS', 'fs_liability_current', 'credit'),
  ('fs_liability_other_current', 'BS_LIAB_OTHER_CURRENT',      'Other Current Liabilities',       'BS', 'fs_liability_current', 'credit'),
  -- Non-Current Liabilities
  ('fs_liability_noncurrent',    'BS_LIAB_NONCURRENT',         'Non-Current Liabilities',         'BS', 'fs_liability', 'credit'),
  ('fs_liability_lt_debt',       'BS_LIAB_LT_DEBT',            'Long-Term Debt',                  'BS', 'fs_liability_noncurrent', 'credit'),
  ('fs_liability_deferred_tax',  'BS_LIAB_DEFERRED_TAX',       'Deferred Tax Liabilities',        'BS', 'fs_liability_noncurrent', 'credit'),
  ('fs_liability_other_noncurrent','BS_LIAB_OTHER_NONCURRENT', 'Other Non-Current Liabilities',   'BS', 'fs_liability_noncurrent', 'credit'),
  -- Equity detail
  ('fs_equity_common',           'BS_EQUITY_COMMON',           'Common Stock',                    'BS', 'fs_equity', 'credit'),
  ('fs_equity_retained',         'BS_EQUITY_RETAINED',         'Retained Earnings',               'BS', 'fs_equity', 'credit'),
  ('fs_equity_other',            'BS_EQUITY_OTHER',            'Other Equity',                    'BS', 'fs_equity', 'credit')
ON CONFLICT (id) DO NOTHING;
