-- Durable IRAC justifications linked to approved adjustments and posted JEs.

CREATE TABLE IF NOT EXISTS tenant_justifications (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id         TEXT NOT NULL,
  period_label      TEXT NOT NULL,
  related_type      TEXT NOT NULL CHECK (related_type IN ('hitl_staging','close_adjustment','journal_entry','export','ingest')),
  related_id        TEXT NOT NULL,
  created_by        TEXT NULL,
  created_by_type   TEXT NOT NULL DEFAULT 'user' CHECK (created_by_type IN ('user','agent')),
  irac_json         JSONB NULL,
  memo_markdown     TEXT NULL,
  prompt_version    TEXT NULL,
  model             TEXT NULL,
  inputs_hash       TEXT NULL,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tenant_justifications_tenant_period
  ON tenant_justifications(tenant_id, period_label);
CREATE INDEX IF NOT EXISTS idx_tenant_justifications_related
  ON tenant_justifications(tenant_id, related_type, related_id);
