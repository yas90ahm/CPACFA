-- Onboarding state per tenant (guided setup: entity, CoA, first TB, first close).
-- One row per tenant; upsert on get-or-create.

CREATE TABLE IF NOT EXISTS onboarding_state (
  tenant_id TEXT PRIMARY KEY,
  current_step TEXT NOT NULL DEFAULT 'welcome',
  completed_steps JSONB NOT NULL DEFAULT '[]',
  entity_info JSONB,
  coa_imported BOOLEAN DEFAULT FALSE,
  coa_account_count INTEGER,
  first_tb_uploaded BOOLEAN DEFAULT FALSE,
  first_close_completed BOOLEAN DEFAULT FALSE,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_state_tenant ON onboarding_state(tenant_id);
