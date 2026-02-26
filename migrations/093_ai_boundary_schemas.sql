-- DB-enforced AI boundary: schema separation + roles + grants.
-- AI cannot physically write core tables (deterministic financial data).
-- BYOD Postgres compatible; uses standard GRANT/REVOKE.
--
-- Run as migration owner (already assumed by migrate.ts).
-- Requires: existing tables in public from migrations 003-092.

-- 1) Create schemas
CREATE SCHEMA IF NOT EXISTS core;
CREATE SCHEMA IF NOT EXISTS ai;
CREATE SCHEMA IF NOT EXISTS audit;

-- 2) Move tables to schemas (only if exist in public)
DO $$
DECLARE
  tbl text;
  core_tables text[] := ARRAY[
    'accounting_connections','period_locks','close_adjustments','period_trial_balance',
    'journal_entries','journal_entry_lines','je_attachments','close_sessions',
    'ledger_snapshots','certification_artifacts','period_export_checks',
    'statement_packages','statement_lines','statement_diffs','close_checklist_items',
    'evidence_records','evidence_links','recon_runs','recon_items','recon_match_groups',
    'recon_match_group_items','recon_exceptions','recon_signoffs','tenant_justifications',
    'period_close','pbc_items','operating_segments','segment_financials','segment_reconciliation',
    'period_financial_data_state','eps_calculations','risk_context_qualitative_evidence',
    'acquisitions','ppa_line_items','contingent_consideration','risk_context_liquidity_warnings',
    'onboarding_state','close_checklist_templates','reconciliation_todos','data_catalog',
    'control_assertions','deferred_tax_items','deferred_tax_valuation_allowance','deferred_tax_rate_changes',
    'portfolio_performance_corrections','tenant_close_calendar_entry','cash_generating_units',
    'goodwill_allocation','impairment_tests','dcf_models','wacc_calculations','dcf_sensitivity',
    'revenue_contracts','revenue_performance_obligations','revenue_recognition_schedule',
    'statement_generations','tenant_close_calendar_config','budget_versions','budget_version_lines',
    'lbo_models','disclosure_checklist','reconciliation_resolutions','document_requests',
    'decision_records','tenant_financial_config','sampling_results','close_controls','control_evidence',
    'close_checklist','comparable_analyses','comparable_companies','triage_assessments',
    'portfolios','portfolio_positions','portfolio_performance','coa_mapping_rules',
    'risk_context_conflicts','fs_taxonomy_lines','precedent_analyses','precedent_transactions',
    'stock_grants','stock_grant_valuations','stock_expense_schedule','leases','lease_schedules',
    'equity_method_investments','equity_method_income','fixed_assets','depreciation_runs','depreciation_run_details',
    'audit_engagements','audit_engagement_periods','filing_calendar_items','tax_returns',
    'intercompany_pairs','intercompany_reconciliation_results','data_quality_rules','data_quality_exceptions',
    'approval_workflow_defs','approval_workflow_steps','approval_requests','approval_request_events',
    'professional_audit_flags','tenant_draft_adjustments','issue_items','evidence_policy'
  ];
  ai_tables text[] := ARRAY[
    'tenant_ai_proposals','ai_call_log','tenant_hitl_staging','tenant_supervisor_sessions',
    'tenant_session_uploads','tenant_shadow_audit_findings','tenant_policy_memory'
  ];
  audit_tables text[] := ARRAY['audit_ledger','audit_log','close_audit_trail'];
BEGIN
  FOREACH tbl IN ARRAY core_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA core', tbl);
    END IF;
  END LOOP;
  FOREACH tbl IN ARRAY ai_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA ai', tbl);
    END IF;
  END LOOP;
  FOREACH tbl IN ARRAY audit_tables
  LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema = 'public' AND table_name = tbl) THEN
      EXECUTE format('ALTER TABLE public.%I SET SCHEMA audit', tbl);
    END IF;
  END LOOP;
END $$;

-- 3) Create roles (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'core_writer') THEN
    CREATE ROLE core_writer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'ai_writer') THEN
    CREATE ROLE ai_writer;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'auditor_reader') THEN
    CREATE ROLE auditor_reader;
  END IF;
END $$;

-- 4) Grant core_writer: full DML on core.*, INSERT on audit.*, UPDATE/DELETE on ai.* (for HITL approve/reject)
GRANT USAGE ON SCHEMA core TO core_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA core TO core_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO core_writer;

GRANT USAGE ON SCHEMA audit TO core_writer;
GRANT INSERT ON ALL TABLES IN SCHEMA audit TO core_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT INSERT ON TABLES TO core_writer;

GRANT USAGE ON SCHEMA ai TO core_writer;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA ai TO core_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO core_writer;

-- 5) Grant ai_writer: INSERT/SELECT/UPDATE on ai.* ONLY; no core.*
-- (UPDATE needed for appendReasoningLog on tenant_supervisor_sessions)
GRANT USAGE ON SCHEMA ai TO ai_writer;
GRANT SELECT, INSERT, UPDATE ON ALL TABLES IN SCHEMA ai TO ai_writer;
ALTER DEFAULT PRIVILEGES IN SCHEMA ai GRANT SELECT, INSERT, UPDATE ON TABLES TO ai_writer;

-- 6) Grant auditor_reader: SELECT on core.* and audit.*
GRANT USAGE ON SCHEMA core TO auditor_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA core TO auditor_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA core GRANT SELECT ON TABLES TO auditor_reader;

GRANT USAGE ON SCHEMA audit TO auditor_reader;
GRANT SELECT ON ALL TABLES IN SCHEMA audit TO auditor_reader;
ALTER DEFAULT PRIVILEGES IN SCHEMA audit GRANT SELECT ON TABLES TO auditor_reader;

-- 7) Ensure schema_migrations stays in public; grant read for version check
GRANT USAGE ON SCHEMA public TO core_writer;
GRANT SELECT ON public.schema_migrations TO core_writer;
