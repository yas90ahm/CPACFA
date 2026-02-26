-- Add cash flow classification to COA mapping rules.
-- Allows SLM or manual input to classify accounts for CF statement generation.
-- NULL means unclassified (will use heuristic fallback).

ALTER TABLE coa_mapping_rules
ADD COLUMN IF NOT EXISTS cash_flow_class TEXT DEFAULT NULL;

ALTER TABLE coa_mapping_rules
DROP CONSTRAINT IF EXISTS chk_cash_flow_class;

ALTER TABLE coa_mapping_rules
ADD CONSTRAINT chk_cash_flow_class
CHECK (cash_flow_class IS NULL OR cash_flow_class IN ('operating', 'investing', 'financing', 'not_applicable'));
