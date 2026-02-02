-- Risk context: last DCF per tenant/period for Going Concern vs DCF conflict (Integration). Written on DCF save/calculate; read in step3Supervisor.

CREATE TABLE IF NOT EXISTS risk_context_last_dcf (
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  terminal_growth_rate NUMERIC NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_label)
);
