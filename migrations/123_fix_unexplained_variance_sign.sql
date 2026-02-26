-- Fix unexplained_variance formula: reconciling items should REDUCE the variance, not increase it.
-- Old: (gl_balance - supporting_balance) - reconciling_items_total
--   With variance=2500 and items=-2500: 2500-(-2500)=5000 (wrong, doubled)
-- New: (gl_balance - supporting_balance) + reconciling_items_total
--   With variance=2500 and items=-2500: 2500+(-2500)=0 (correct)

ALTER TABLE tenant_period_reconciliations DROP COLUMN IF EXISTS unexplained_variance;
ALTER TABLE tenant_period_reconciliations ADD COLUMN unexplained_variance NUMERIC(20,2) GENERATED ALWAYS AS (
  (gl_balance - supporting_balance) + COALESCE(reconciling_items_total, 0)
) STORED;
