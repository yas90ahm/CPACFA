-- Add normal_balance to chart of accounts for explicit validation.
-- Asset and Expense: debit normal. Liability, Equity, Revenue: credit normal.
-- Contra accounts (e.g. Accumulated Depreciation) can set normal_balance = 'credit'.

ALTER TABLE core.tenant_chart_of_accounts
  ADD COLUMN IF NOT EXISTS normal_balance VARCHAR(10);

UPDATE core.tenant_chart_of_accounts
SET normal_balance = 'debit'
WHERE account_type IN ('Asset', 'Expense')
  AND (normal_balance IS NULL OR normal_balance = '');

UPDATE core.tenant_chart_of_accounts
SET normal_balance = 'credit'
WHERE account_type IN ('Liability', 'Equity', 'Revenue')
  AND (normal_balance IS NULL OR normal_balance = '');

UPDATE core.tenant_chart_of_accounts
SET normal_balance = COALESCE(normal_balance, 'debit')
WHERE normal_balance IS NULL;

ALTER TABLE core.tenant_chart_of_accounts
  ALTER COLUMN normal_balance SET DEFAULT 'debit';

ALTER TABLE core.tenant_chart_of_accounts
  DROP CONSTRAINT IF EXISTS chk_normal_balance;

ALTER TABLE core.tenant_chart_of_accounts
  ADD CONSTRAINT chk_normal_balance
  CHECK (normal_balance IN ('debit', 'credit'));
