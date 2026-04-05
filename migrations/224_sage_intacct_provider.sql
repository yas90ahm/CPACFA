-- Extend provider constraints to include sage_intacct.
-- Uses DROP/CREATE pattern for CHECK constraints since ALTER CONSTRAINT isn't supported.

-- accounting_connections: provider constraint
DO $$ BEGIN
  ALTER TABLE accounting_connections DROP CONSTRAINT IF EXISTS accounting_connections_provider_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

ALTER TABLE accounting_connections ADD CONSTRAINT accounting_connections_provider_check
  CHECK (provider IN ('quickbooks', 'xero', 'netsuite', 'sage_intacct'));

-- tenant_oauth_tokens: provider constraint (may not exist)
DO $$ BEGIN
  ALTER TABLE tenant_oauth_tokens DROP CONSTRAINT IF EXISTS tenant_oauth_tokens_provider_check;
EXCEPTION WHEN OTHERS THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE tenant_oauth_tokens ADD CONSTRAINT tenant_oauth_tokens_provider_check
    CHECK (provider IN ('quickbooks', 'xero', 'netsuite', 'sage_intacct', 'google'));
EXCEPTION WHEN OTHERS THEN NULL; END $$;
