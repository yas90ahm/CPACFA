-- Risk context: QUALITATIVE_EVIDENCE_MISSING flag per tenant/period (Integration only).
-- Set when professional review runs with zero contract/lease narrative; cleared when narrative is provided.
-- Used by export gate (PDF disclaimer) and CFA (DCF/synthetic net debt disclaimer).

CREATE TABLE IF NOT EXISTS risk_context_qualitative_evidence (
  tenant_id TEXT NOT NULL,
  period_label TEXT NOT NULL,
  qualitative_evidence_missing BOOLEAN NOT NULL DEFAULT true,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (tenant_id, period_label)
);

CREATE INDEX IF NOT EXISTS idx_risk_context_qualitative_evidence_tenant_period
  ON risk_context_qualitative_evidence(tenant_id, period_label);
