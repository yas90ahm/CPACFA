-- Seed Cash Flow taxonomy lines so the SLM has valid classification targets.
-- These represent the three CF sections; accounts classified as 'not_applicable'
-- are excluded from CF generation entirely (no taxonomy line needed for N/A).

INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance) VALUES
  ('fs_cf_operating', 'CF_OPERATING', 'Cash from Operating Activities', 'CF', NULL, 'debit'),
  ('fs_cf_investing', 'CF_INVESTING', 'Cash from Investing Activities', 'CF', NULL, 'debit'),
  ('fs_cf_financing', 'CF_FINANCING', 'Cash from Financing Activities', 'CF', NULL, 'debit')
ON CONFLICT (id) DO NOTHING;
