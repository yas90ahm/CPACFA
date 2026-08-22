-- Durable outbox for approved-only journal entry writeback to the configured ERP.
-- The model never supplies posting lines here: the worker reloads the immutable
-- approved journal entry and its lines from the accounting ledger.

ALTER TABLE core.tenant_close_calendar_config
  ADD COLUMN IF NOT EXISTS approved_erp_writeback_enabled BOOLEAN NOT NULL DEFAULT FALSE;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conrelid = 'core.tenant_close_calendar_config'::regclass
      AND conname = 'chk_close_calendar_erp_writeback_complete'
  ) THEN
    ALTER TABLE core.tenant_close_calendar_config
      ADD CONSTRAINT chk_close_calendar_erp_writeback_complete
      CHECK (
        approved_erp_writeback_enabled = FALSE
        OR (
          entity_id IS NOT NULL AND length(trim(entity_id)) > 0
          AND connection_id IS NOT NULL AND length(trim(connection_id)) > 0
        )
      );
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS core.journal_entry_erp_writebacks (
  journal_entry_id TEXT PRIMARY KEY REFERENCES core.journal_entries(id),
  tenant_id TEXT NOT NULL,
  connection_id TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  idempotency_key TEXT NOT NULL UNIQUE,
  requested_by TEXT NOT NULL,
  requested_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  posting_started_at TIMESTAMPTZ,
  external_id TEXT,
  external_ref TEXT,
  posted_at TIMESTAMPTZ,
  last_error TEXT,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  CONSTRAINT chk_je_erp_writeback_status CHECK (
    status IN ('pending', 'posting', 'posted', 'failed', 'reconciliation_required', 'cancelled')
  )
);

CREATE INDEX IF NOT EXISTS idx_je_erp_writebacks_tenant_status
  ON core.journal_entry_erp_writebacks(tenant_id, status, requested_at);

ALTER TABLE core.journal_entry_erp_writebacks ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'core'
      AND tablename = 'journal_entry_erp_writebacks'
      AND policyname = 'tenant_isolation_policy'
  ) THEN
    CREATE POLICY tenant_isolation_policy ON core.journal_entry_erp_writebacks
      USING (tenant_id = current_setting('app.current_tenant_id', true))
      WITH CHECK (tenant_id = current_setting('app.current_tenant_id', true));
  END IF;
END $$;

CREATE OR REPLACE FUNCTION core.prevent_confirmed_erp_writeback_mutation()
RETURNS TRIGGER AS $$
BEGIN
  IF OLD.status = 'posted' THEN
    RAISE EXCEPTION
      'Confirmed ERP writeback receipts are immutable. Journal entry ID: %',
      OLD.journal_entry_id;
  END IF;
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS erp_writeback_immutable_after_post ON core.journal_entry_erp_writebacks;
CREATE TRIGGER erp_writeback_immutable_after_post
  BEFORE UPDATE ON core.journal_entry_erp_writebacks
  FOR EACH ROW
  WHEN (OLD.status = 'posted')
  EXECUTE FUNCTION core.prevent_confirmed_erp_writeback_mutation();

DROP TRIGGER IF EXISTS erp_writeback_no_delete_after_post ON core.journal_entry_erp_writebacks;
CREATE TRIGGER erp_writeback_no_delete_after_post
  BEFORE DELETE ON core.journal_entry_erp_writebacks
  FOR EACH ROW
  WHEN (OLD.status = 'posted')
  EXECUTE FUNCTION core.prevent_confirmed_erp_writeback_mutation();
