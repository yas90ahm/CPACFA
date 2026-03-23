-- Migration 184: Row-Level Security (RLS) for tenant isolation.
-- Enables RLS on all tenant-scoped tables so that queries can only see rows
-- matching current_setting('app.current_tenant_id'). The migration user (table
-- owner) bypasses RLS by default, so migrations and admin operations still work.
-- Application connections MUST SET app.current_tenant_id before querying.

-- NOTE: We use ENABLE ROW LEVEL SECURITY (without FORCE) so that the table owner
-- (the migration/superuser role) bypasses RLS automatically. Application connections
-- that use non-owner roles are subject to RLS. The second parameter 'true' in
-- current_setting('app.current_tenant_id', true) returns NULL when the variable
-- is not set, causing the policy to match zero rows (safe default).

DO $$
DECLARE
  tbl_record RECORD;
  policy_exists BOOLEAN;
  rls_tables TEXT[] := ARRAY[
    'close_sessions',
    'journal_entries',
    'journal_entry_lines',
    'general_ledger',
    'tenant_period_reconciliations',
    'tenant_recon_items',
    'ai_coa_suggestions',
    'ai_cf_suggestions',
    'audit_ledger',
    'statement_packages',
    'statement_lines',
    'tenant_variance_analysis',
    'evidence_records',
    'evidence_links',
    'certification_artifacts',
    'ledger_snapshots',
    'period_trial_balance'
  ];
  tbl_name TEXT;
BEGIN
  FOREACH tbl_name IN ARRAY rls_tables
  LOOP
    -- Find the table in any schema (core, ai, audit, public)
    SELECT schemaname, tablename
      INTO tbl_record
      FROM pg_tables
     WHERE tablename = tbl_name
       AND schemaname IN ('core', 'ai', 'audit', 'public')
     LIMIT 1;

    IF tbl_record IS NULL THEN
      RAISE NOTICE 'Table % not found in any expected schema — skipping', tbl_name;
      CONTINUE;
    END IF;

    -- Enable RLS (idempotent — no error if already enabled)
    EXECUTE format(
      'ALTER TABLE %I.%I ENABLE ROW LEVEL SECURITY',
      tbl_record.schemaname, tbl_record.tablename
    );

    -- Check if the policy already exists
    SELECT EXISTS (
      SELECT 1 FROM pg_policies
       WHERE schemaname = tbl_record.schemaname
         AND tablename  = tbl_record.tablename
         AND policyname = 'tenant_isolation_policy'
    ) INTO policy_exists;

    IF NOT policy_exists THEN
      -- Create policy: rows visible only when tenant_id matches the session variable.
      -- current_setting(..., true) returns NULL when the variable is not set,
      -- so an unset session sees zero rows (deny-by-default).
      EXECUTE format(
        'CREATE POLICY tenant_isolation_policy ON %I.%I
           USING (tenant_id = current_setting(''app.current_tenant_id'', true))
           WITH CHECK (tenant_id = current_setting(''app.current_tenant_id'', true))',
        tbl_record.schemaname, tbl_record.tablename
      );
    ELSE
      RAISE NOTICE 'Policy tenant_isolation_policy already exists on %.% — skipping',
        tbl_record.schemaname, tbl_record.tablename;
    END IF;

    RAISE NOTICE 'RLS enabled on %.%', tbl_record.schemaname, tbl_record.tablename;
  END LOOP;
END $$;
