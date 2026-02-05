-- Save for Later: uncommitted JSON adjustments from CPA Bridge (and manual journal lines).
-- Used to resume a balancing session without losing AI suggestions or manual entries.
-- Export Gate and statement build use only committed/balanced data; drafts are never included in export.

CREATE TABLE IF NOT EXISTS tenant_draft_adjustments (
  id                TEXT PRIMARY KEY,
  tenant_id         TEXT NOT NULL,
  period_label      TEXT NULL,
  session_id        TEXT NULL,
  label             TEXT NULL,
  payload           JSONB NOT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by        TEXT NULL
);

CREATE INDEX IF NOT EXISTS idx_tenant_draft_adjustments_tenant
  ON tenant_draft_adjustments(tenant_id);
CREATE INDEX IF NOT EXISTS idx_tenant_draft_adjustments_session
  ON tenant_draft_adjustments(tenant_id, session_id) WHERE session_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_tenant_draft_adjustments_period
  ON tenant_draft_adjustments(tenant_id, period_label) WHERE period_label IS NOT NULL;
