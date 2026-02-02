-- Fixed assets and depreciation runs (PP&E)

CREATE TABLE IF NOT EXISTS fixed_assets (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  asset_number TEXT NOT NULL,
  description TEXT,
  asset_type TEXT NOT NULL,
  acquisition_date DATE NOT NULL,
  cost NUMERIC(15,2) NOT NULL,
  useful_life_years NUMERIC(6,2) NOT NULL,
  residual_value NUMERIC(15,2) DEFAULT 0,
  method TEXT NOT NULL, -- 'straight_line' | 'declining_balance' | 'units_of_production'
  depreciation_start_date DATE NOT NULL,
  disposed_date DATE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS depreciation_runs (
  id TEXT PRIMARY KEY,
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  run_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  total_depreciation NUMERIC(15,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE IF NOT EXISTS depreciation_run_details (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES depreciation_runs(id) ON DELETE CASCADE,
  fixed_asset_id TEXT NOT NULL REFERENCES fixed_assets(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  depreciation_amount NUMERIC(15,2) NOT NULL,
  accumulated_depreciation NUMERIC(15,2) NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_fixed_assets_tenant_id ON fixed_assets(tenant_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_runs_tenant_period ON depreciation_runs(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_depreciation_run_details_run_id ON depreciation_run_details(run_id);
CREATE INDEX IF NOT EXISTS idx_depreciation_run_details_fixed_asset_id ON depreciation_run_details(fixed_asset_id);
