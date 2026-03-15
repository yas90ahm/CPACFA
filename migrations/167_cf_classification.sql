-- Renumbered from 067 to 167 to resolve duplicate prefix
-- GAP 6: Cash flow classification on COA mapping rules.
-- The cash_flow_class column already exists (migration 124_coa_mapping_cash_flow_class.sql).
-- This migration is a no-op; kept for numbering continuity.
-- The existing column cash_flow_class TEXT with CHECK constraint covers:
--   'operating', 'investing', 'financing', 'not_applicable', or NULL (heuristic fallback).

SELECT 1;
