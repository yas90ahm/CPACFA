-- Sampling results per tenant (run id → population, method, sample, test results).

CREATE TABLE IF NOT EXISTS sampling_results (
  run_id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  population TEXT NOT NULL,
  method TEXT NOT NULL,
  sample_size INTEGER NOT NULL,
  selected_ids JSONB NOT NULL DEFAULT '[]',
  selected_items JSONB NOT NULL DEFAULT '[]',
  test_results JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sampling_results_tenant ON sampling_results(tenant_id);
