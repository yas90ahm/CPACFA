-- Add account_name column to general_ledger so GL registers can carry account names
-- from CSV through to the trial balance (without requiring a COA upload first).

ALTER TABLE core.general_ledger ADD COLUMN IF NOT EXISTS account_name TEXT;
