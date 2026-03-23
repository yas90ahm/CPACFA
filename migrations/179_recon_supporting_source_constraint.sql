-- Gap 3: Bank reconciliation provenance — constrain supporting_source to known values
ALTER TABLE tenant_period_reconciliations
  DROP CONSTRAINT IF EXISTS chk_supporting_source;
ALTER TABLE tenant_period_reconciliations
  ADD CONSTRAINT chk_supporting_source CHECK (
    supporting_source IS NULL OR supporting_source IN (
      'manual_entry','bank_feed','subledger_export','erp_sync','third_party_import'
    )
  );
