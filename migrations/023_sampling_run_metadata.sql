-- Sampling run metadata: period, materiality, population count (add columns to sampling_results).

ALTER TABLE sampling_results ADD COLUMN IF NOT EXISTS period_label TEXT;
ALTER TABLE sampling_results ADD COLUMN IF NOT EXISTS materiality_threshold NUMERIC;
ALTER TABLE sampling_results ADD COLUMN IF NOT EXISTS population_count INTEGER;

CREATE INDEX IF NOT EXISTS idx_sampling_results_period ON sampling_results(tenant_id, period_label);
