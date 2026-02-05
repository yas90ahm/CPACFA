-- Advisor pillar: AI proposals stored in draft only. Never posted or applied automatically.

CREATE TABLE IF NOT EXISTS tenant_ai_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  staging_id TEXT NULL,
  proposal JSONB NOT NULL,
  prompt_version TEXT NULL,
  model TEXT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_ai_proposals_tenant_period
  ON tenant_ai_proposals(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_tenant_ai_proposals_staging
  ON tenant_ai_proposals(tenant_id, staging_id) WHERE staging_id IS NOT NULL;
