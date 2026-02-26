-- Expand taxonomy for OCI and Discontinued Operations.
-- Required for PE-backed companies with acquisitions/divestitures and OCI items.

-- Widen the statement constraint to include OCI
ALTER TABLE fs_taxonomy_lines DROP CONSTRAINT IF EXISTS chk_statement;
ALTER TABLE fs_taxonomy_lines ADD CONSTRAINT chk_statement
  CHECK (statement IN ('PL', 'BS', 'CF', 'OCI'));

-- OCI taxonomy lines (BS sub-section of equity)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance) VALUES
  ('fs_oci', 'BS_OCI', 'Accumulated Other Comprehensive Income', 'BS', 'fs_equity', 'credit'),
  ('fs_oci_unrealized_gains', 'OCI_UNREALIZED', 'Unrealized Gains/Losses on Securities', 'OCI', NULL, 'credit'),
  ('fs_oci_fx_translation', 'OCI_FX', 'Foreign Currency Translation Adjustments', 'OCI', NULL, 'credit'),
  ('fs_oci_pension', 'OCI_PENSION', 'Pension Adjustments', 'OCI', NULL, 'debit'),
  ('fs_oci_hedge', 'OCI_HEDGE', 'Cash Flow Hedge Gains/Losses', 'OCI', NULL, 'credit')
ON CONFLICT (id) DO NOTHING;

-- Discontinued Operations taxonomy lines (P&L sub-section)
INSERT INTO fs_taxonomy_lines (id, code, name, statement, parent_id, normal_balance) VALUES
  ('fs_discontinued_ops', 'PL_DISCONTINUED', 'Income/Loss from Discontinued Operations', 'PL', NULL, 'credit'),
  ('fs_discontinued_disposal', 'PL_DISCONTINUED_DISPOSAL', 'Gain/Loss on Disposal', 'PL', 'fs_discontinued_ops', 'credit')
ON CONFLICT (id) DO NOTHING;
