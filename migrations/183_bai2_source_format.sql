-- Add 'bai2_upload' as a valid source for bank transactions.

ALTER TABLE tenant_bank_transactions
  DROP CONSTRAINT IF EXISTS tenant_bank_transactions_source_check;

ALTER TABLE tenant_bank_transactions
  ADD CONSTRAINT tenant_bank_transactions_source_check
  CHECK (source IN ('csv_upload', 'ofx_upload', 'bai2_upload', 'integration_sync', 'manual'));
