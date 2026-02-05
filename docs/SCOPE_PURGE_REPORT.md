# SCOPE PURGE REPORT — Sovereign CPA Engine

**Scope:** Deterministic accounting engine. AI limited to: (1) Classifier, (2) Advisor (JE templates/proposals only; NO amounts), (3) Shadow Auditor, (4) Justifier.

**Rules:** No forecasting/budget/scenario/CFO/valuation/advisory; no AI math; no direct DB mutation outside Protocol Bridge.

---

## Phase 0 — Baseline Inventory

### Entrypoints

| Entrypoint | Path | Role |
|------------|------|------|
| **Server** | `src/server.ts` | Express app; mounts all API routes; runs migrations; starts ingestion scheduler and job worker. |
| **Job worker** | Invoked from `src/server.ts` via `runWorkerLoop()`; handlers from `src/services/job_handlers.ts` | Polls `jobs` table; runs `ingestion_pipeline`, `agentic_cleanup`, `statement_generation`. |
| **CLI / scripts** | `scripts/generateOpenAPI.ts`, `scripts/purge_audit_log.ts`, `scripts/smoke-server.ts`, `scripts/smoke-test-*.mjs|.ps1` | OpenAPI gen; audit log purge; smoke tests. No production entrypoints. |

### Routes (mount path → router file)

| Mount | Router file | Purpose |
|-------|-------------|---------|
| `/api/auth` | `routes/auth.ts` | Login, register. |
| `/api/trial-balance` | `routes/trial-balance/index.ts` → ingest, parser, classification | **KEEP** — Core TB ingest, parse, statements. |
| `/api/justification` | `routes/justification.ts` | **KEEP** — Justifier (IRAC). |
| `/api/orchestrator` | `routes/orchestrator.ts` | prepare-q4, intent, lead-partner. |
| `/api/audit` | `routes/audit/index.ts` | Binder, reconciliation-summary, todos, gaap-consistency, auditor, DRL, sampling, forensics, prior-period. |
| `/api/export` | `routes/export.ts` | **KEEP** — PDF/CSV after gate. |
| `/api/knowledge-base` | `routes/financial_memory.ts` | **KEEP** — RAG for Justifier. |
| `/api/vector-store` | `routes/vector_store.ts` | **KEEP** — RAG ingestion/query. |
| `/api/ingestion` | `routes/ingestion.ts` | Agent, pipeline, fetchers. |
| `/api/memory` | `routes/memory.ts` | Semantic memory (vendor, consistency). |
| `/api/integrations` | `routes/integrations.ts` | OAuth. |
| `/api/pipelines` | `routes/pipelines.ts` | Bank, ap-aging, ar-aging, payroll-accrual, bank-rec, cash-position. |
| `/api/close` | `routes/close/index.ts` | **KEEP** — Sessions, adjustments, JE, recon, checklist, period, signoff, package, etc. |
| `/api/coa-mapping` | `routes/coa_mapping.ts` | **KEEP** — Taxonomy, rules, map. |
| `/api/forecasting` | `routes/forecasting.ts` | QUARANTINE. |
| `/api/capital` | `routes/capital.ts` | QUARANTINE. |
| `/api/budget` | `routes/budget.ts` | QUARANTINE. |
| `/api/entities` | `routes/entities.ts` | QUARANTINE (consolidation/fx). |
| `/api/intercompany` | `routes/intercompany.ts` | QUARANTINE (agentic variance). |
| `/api/data-quality` | `routes/data_quality.ts` | Rules/exceptions KEEP; suggest-remediation QUARANTINE. |
| `/api/approvals` | `routes/approvals.ts` | **KEEP** — Workflows, requests (close protocol). |
| `/api/catalog` | `routes/catalog.ts` | Datasets/query KEEP; resolve-intent QUARANTINE. |
| `/api/reporting` | `routes/reporting.ts` | Pack/commentary — QUARANTINE (advisory). |
| `/api/access` | `routes/access.ts` | Dashboards/alerts — QUARANTINE (CFO). |
| `/api/accounting-integration` | `routes/accounting_integration.ts` | **KEEP** — Sync TB, push JE (protocol). |
| `/api/ar-ap-workflows` | `routes/ar_ap_workflows.ts` | QUARANTINE (agentic collections/payment). |
| `/api/invoice-to-books` | `routes/invoice_to_books.ts` | QUARANTINE (agentic coding). |
| `/api/bank-feed-matching` | `routes/bank_feed_matching.ts` | QUARANTINE (agentic match). |
| `/api/revenue-recognition` | `routes/revenue_recognition.ts` | QUARANTINE (agentic allocation). |
| `/api/onboarding` | `routes/onboarding.ts` | **KEEP** — Guided setup (no advisory). |
| `/api/tenants` | `routes/tenants.ts` | **KEEP** — BYOD. |
| `/api/stock-comp` | `routes/stock_compensation.ts` | QUARANTINE. |
| `/api/deferred-tax` | `routes/deferred_tax.ts` | QUARANTINE. |
| `/api/impairment` | `routes/impairment.ts` | QUARANTINE. |
| `/api/segments` | `routes/segment_reporting.ts` | QUARANTINE. |
| `/api/consolidation` | `routes/consolidation.ts` | QUARANTINE. |
| `/api/statutory` | `routes/statutory.ts` | QUARANTINE. |
| `/api/acquisitions` | `routes/business_combination.ts` | QUARANTINE. |
| `/api/equity-investments` | `routes/equity_method.ts` | QUARANTINE. |
| `/api/leases` | `routes/leases.ts` | QUARANTINE. |
| `/api/fixed-assets` | `routes/fixed_assets.ts` | QUARANTINE. |
| `/api/eps` | `routes/eps.ts` | QUARANTINE. |
| `/api/fx` | `routes/fx_currency.ts` | QUARANTINE. |
| `/api/supervisor` | `routes/supervisor.ts` | QUARANTINE. |
| `/api/hitl` | `routes/hitl.ts` | **KEEP** — Staging, resolve-ingest. |
| `/api/cpa` | `routes/cpa_index.ts` | **KEEP** — Grouping when CPA_ENABLED. |
| `/api-dev` | `routes/dev_diagnostics.ts` | Dev-only; **KEEP** (not production). |

### Background jobs

| Job type | Handler | File | Verdict |
|----------|---------|------|---------|
| `ingestion_pipeline` | `handleIngestionPipeline` | `src/services/job_handlers.ts` | **KEEP** — Calls ingestion_fetchers. |
| `agentic_cleanup` | `handleAgenticCleanup` | `src/services/job_handlers.ts` | QUARANTINE or remove — Placeholder; comment references agenticLedgerToTrialBalance. |
| `statement_generation` | `handleStatementGeneration` | `src/services/job_handlers.ts` | **KEEP** — statement_package_service. |

### DB migrations (tables referenced)

- Control: `tenants`, `users`, `jobs`, `scheduler_locks`, migrations table.
- Tenant: `period_trial_balance`, `close_sessions`, `close_adjustments`, `journal_entries`, `recon_*`, `audit_ledger`, `statement_packages`, HITL staging, supervisor_sessions, etc.
- Quarantined-related: `tenant_budget_versions`, `tenant_kpi_history`, `risk_context_*`, `tenant_draft_adjustments`, etc. — Do NOT drop in Phase 4; deprecation plan only.

---

## KEEP (in-scope)

### Routes / mount paths

- `src/routes/auth.ts`
- `src/routes/trial-balance/*` (ingest, parser, classification) — after removing AI-number calls in Phase 2.
- `src/routes/justification.ts`
- `src/routes/export.ts` — after extracting `finalIntegrityCheck` from Supervisor (Phase 1).
- `src/routes/financial_memory.ts` (knowledge-base)
- `src/routes/vector_store.ts`
- `src/routes/ingestion.ts` (agent classify + pipeline; no numeric AI output in production path)
- `src/routes/memory.ts`
- `src/routes/integrations.ts`
- `src/routes/pipelines.ts` (bank, ap-aging, ar-aging, payroll-accrual; no valuation)
- `src/routes/close/*` (all close sub-routes except close_je_accruals agentic JE amounts — handle in Phase 2)
- `src/routes/coa_mapping.ts`
- `src/routes/approvals.ts`
- `src/routes/catalog.ts` — only datasets + query (no resolve-intent in production).
- `src/routes/accounting_integration.ts`
- `src/routes/onboarding.ts`
- `src/routes/tenants.ts`
- `src/routes/hitl.ts`
- `src/routes/cpa_index.ts`
- `src/routes/dev_diagnostics.ts` (dev only)
- `src/routes/access.ts` — only if restricted to non-CFO dashboards; else QUARANTINE.

### Services (files)

- `src/services/financialStatements.ts`
- `src/services/integrity_gate_service.ts`
- `src/services/trialBalanceParser.ts` (and trial-balance/parser_utils if present)
- `src/services/fileIngestion.ts`
- `src/services/trial_balance_store_service.ts`
- `src/services/accountClassifier.ts`
- `src/services/agentic_account_classifier.ts` (labels only)
- `src/services/statement_package_service.ts`, `statementGenerator.ts`
- `src/services/audit_ledger_service.ts`
- `src/services/export_gate_service.ts`
- `src/services/export_service.ts`, `pdf_export.ts`
- `src/services/persistence_service.ts`
- `src/services/hitl_orchestrator.ts`
- `src/services/close_adjustments_service.ts`, `close_adjustment_update_service.ts`
- `src/services/journal_entry_service.ts`
- `src/services/recon_service.ts`
- `src/services/period_lock_service.ts`
- `src/services/segregation_service.ts`
- `src/services/justification_service.ts`
- `src/services/rules_registry.ts`
- `src/services/job_worker.ts`, `src/services/job_service.ts`
- `src/services/adjusted_trial_balance_service.ts`
- `src/services/draft_service.ts`
- `src/services/audit_export_service.ts` (register only)
- `src/services/decision_record_service.ts`
- `src/services/issue_item_service.ts`
- `src/services/close_session_service.ts`, `close_status_service.ts`, `close_package_service.ts`, etc. (close workflow only)
- `src/services/ingestion_fetchers.ts`, `src/services/ingestion_pipeline.ts`, `src/services/ingestion_agent.ts` (classification only; no numeric output)
- `src/services/ingestion_dedup_store.ts`, `src/services/integration_store.ts`, `src/services/fetcher_run_tracker.ts`, `src/services/google_oauth.ts`
- `src/services/professional_review_service.ts` (Shadow Auditor)
- `src/services/data_quality_rule_service.ts`, `src/services/data_quality_exception_service.ts` (no agentic remediation in production)
- `src/services/catalog_query_service.ts` (query only; no resolve-intent)
- `src/services/coa_mapping_service.ts`
- `src/services/approval_workflow_service.ts`, `src/services/approval_request_service.ts`
- `src/lib/env.ts`, `src/lib/logger.ts`, `src/lib/tenant_context.ts`, `src/lib/errorHandler.ts`, `src/lib/validateBody.ts`, `src/lib/request_context.ts`, `src/lib/capability_flags.ts`, `src/lib/asyncHandler.ts`, `src/lib/closeRole.ts`
- `src/utils/decimal.ts`
- `src/errors.ts`
- `src/constants/codification.ts`, `src/constants/accounting/standards_registry.ts` (minimal for FS)

### Agents / tools (in-scope only)

- `src/agents/tools/classifyAccount.ts` — Classifier.
- `src/agents/tools/buildFinancialStatements.ts` — Calls TS core.
- `src/agents/tools/proposeTrialBalanceAdjustment.ts` — Advisor (staging only).
- `src/agents/tools/semanticMemory.ts` — Lookup/consistency (Classifier/Advisor).
- `src/agents/tools/getDataGaps.ts` — Gaps (no amounts from AI).
- `src/agents/tools/forensicRescan.ts` — Shadow Auditor style (flags).
- `src/agents/tools/types.ts`, `src/agents/tools/index.ts` — After trimming to in-scope tools only.

### Repositories / DB

- All repos used by KEEP services; no direct use from routes/agents.

---

## QUARANTINE (move to /experimental)

### Routes (entire router → /experimental)

| Item | Path | Reason |
|------|------|--------|
| Forecasting | `src/routes/forecasting.ts` | Forecasting out of scope. |
| Capital | `src/routes/capital.ts` | ROI, payback, advisory. |
| Budget | `src/routes/budget.ts` | Planning, reforecast. |
| Orchestrator | `src/routes/orchestrator.ts` | prepare-q4, lead-partner (CFA). |
| Supervisor | `src/routes/supervisor.ts` | ReAct chat, advisory. |
| Catalog resolve-intent | `src/routes/catalog.ts` — POST resolve-intent only | Agentic intent; ad-hoc. |
| Reporting | `src/routes/reporting.ts` | Pack builder, commentary (advisory). |
| Access (dashboards) | `src/routes/access.ts` | CFO dashboards, alerts. |
| Data quality suggest-remediation | `src/routes/data_quality.ts` — POST suggest-remediation | Agentic remediation. |
| Entities | `src/routes/entities.ts` | Consolidation, fx (advisory). |
| Intercompany | `src/routes/intercompany.ts` | Agentic variance. |
| AR/AP workflows | `src/routes/ar_ap_workflows.ts` | Agentic collections/payment. |
| Invoice-to-books | `src/routes/invoice_to_books.ts` | Agentic coding. |
| Bank feed matching | `src/routes/bank_feed_matching.ts` | Agentic match. |
| Revenue recognition | `src/routes/revenue_recognition.ts` | Agentic allocation. |
| Stock comp | `src/routes/stock_compensation.ts` | Valuation, advisory. |
| Deferred tax | `src/routes/deferred_tax.ts` | DTA/DTL, valuation. |
| Impairment | `src/routes/impairment.ts` | Testing, DCF, advisory. |
| Segment reporting | `src/routes/segment_reporting.ts` | Advisory. |
| Consolidation | `src/routes/consolidation.ts` | Agentic eliminations. |
| Statutory | `src/routes/statutory.ts` | Agentic adjustments. |
| Business combination | `src/routes/business_combination.ts` | PPA, advisory. |
| Equity method | `src/routes/equity_method.ts` | Advisory. |
| Leases | `src/routes/leases.ts` | Classification + valuation. |
| Fixed assets | `src/routes/fixed_assets.ts` | Depreciation, advisory. |
| EPS | `src/routes/eps.ts` | Advisory. |
| FX | `src/routes/fx_currency.ts` | Agentic. |

### Services (move to /experimental)

| Item | Path | Reason |
|------|------|--------|
| Forecasting | `src/services/forecasting_service.ts` | Forecasting. |
| Budget | `src/services/budget_version_service.ts` | Planning. |
| Capital | `src/services/capital_allocation_service.ts` | ROI, advisory. |
| Agentic forecasting/capital | `src/services/agentic_forecasting_capital.ts` | Forecasting, narrative. |
| Lead partner | `src/services/lead_partner_orchestrator.ts` | CFA, CoT. |
| Unified orchestrator | `src/services/unified_orchestrator.ts` | Supervisor, CFA. |
| Role dashboard | `src/services/role_dashboard_service.ts` | CFO dashboards. |
| KPI history | `src/services/kpi_history_service.ts` | CFO KPIs. |
| Agentic close coach | `src/services/agentic_close_coach.ts` | Advisory. |
| Agentic JE suggestions | `src/services/agentic_je_suggestions.ts` | AI outputs amounts. |
| Agentic gap analyzer | `src/services/agentic_gap_analyzer.ts` | AI outputs debit/credit. |
| Agentic ledger to TB | `src/services/agentic_ledger_to_tb.ts` | LLM extracts amounts. |
| Agentic consolidation | `src/services/agentic_consolidation.ts` | Advisory. |
| Agentic equity method | `src/services/agentic_equity_method.ts` | Advisory. |
| Agentic business combination | `src/services/agentic_business_combination.ts` | Advisory. |
| Agentic stock comp | `src/services/agentic_stock_comp.ts` | Advisory. |
| Agentic impairment | `src/services/agentic_impairment.ts` | Advisory. |
| Agentic lease | `src/services/agentic_lease.ts` | Advisory. |
| Agentic EPS | `src/services/agentic_eps.ts` | Advisory. |
| Agentic deferred tax | `src/services/agentic_deferred_tax.ts` | Advisory. |
| Agentic segment reporting | `src/services/agentic_segment_reporting.ts` | Advisory. |
| Agentic statutory | `src/services/agentic_statutory_reconciliation.ts` | Advisory. |
| Agentic prior period | `src/services/agentic_prior_period_comparison.ts` | Advisory. |
| Agentic variance drivers | `src/services/agentic_variance_drivers.ts` | CFO. |
| Agentic remediation | `src/services/agentic_remediation_suggestion.ts` | Advisory. |
| Driver-based planning | `src/services/driver_based_planning_service.ts` | Budget/planning. |
| Result generator | `src/services/result_generator.ts` | Uses lead_partner, analyzeGapsAgentic. |
| Ingest covenant/liquidity | `src/services/ingest_covenant_liquidity.ts` | Covenant/liquidity (advisory). |
| Pack builder / commentary | `src/services/pack_builder_service.ts`, `src/services/commentary_library_service.ts` | Advisory. |
| Catalog resolve-intent | `src/services/agentic_query_intent.ts` (and summary/follow-up if used only by catalog intent) | Ad-hoc intent. |
| KPI target | `src/services/kpi_target_service.ts` | CFO. |
| Orchestrator | `src/services/orchestrator.ts` | prepareQ4, CFA. |
| Month-end close (orchestrator) | `src/services/month_end_close_service.ts` — if it only wraps orchestrator | Else keep close-only parts. |
| Integrity conflict / risk context | `src/services/integrity_conflict_service.ts`, `src/services/risk_context_store.ts` | CPA-CFA conflict (advisory); optional for export gate. |
| Close context (KPI) | `src/services/close_context.ts` — if depends on kpi_history only | Quarantine or replace with minimal type. |
| Agentic quality assessor | `src/services/agentic_quality_assessor.ts` | If outputs numbers/quasi-advisory. |
| Agentic plan-execute-verify | `src/services/agentic_plan_execute_verify.ts` | May drive execute; restrict or quarantine. |

### Agents (move to /experimental)

| Item | Path | Reason |
|------|------|--------|
| Supervisor | `src/agents/Supervisor.ts` | ReAct chat, advisory. |
| CFA agents | `src/agents/cfa/*` (benchmark, dupont, montecarlo, skepticism, index, types) | Valuation, forecasting. |
| Reconcile CPA/CFA | `src/agents/tools/reconcileCPAwithCFA.ts` | Advisory. |
| Lease liability tool | `src/agents/tools/leaseLiability.ts` | Valuation. |
| Compute ratios | `src/agents/tools/computeRatios.ts` | If used for advisory only. |
| Portfolio policy | `src/agents/tools/portfolioPolicy.ts` | Advisory. |
| Auditor agent | `src/agents/auditor_agent.ts` | If advisory beyond Shadow Auditor. |
| CPA brain | `src/agents/cpa_brain.ts` | If it calls lead_partner/CFA. |

### Types (move or copy to shared)

- `src/types/cfo-dashboard.ts` → Quarantined or copy minimal to `src/types/shared/` if needed by close_context.
- `src/types/budget_forecast.ts` → Quarantined with budget.
- `src/types/orchestrator.ts` → Quarantined with orchestrator; copy minimal for month_end_close if needed.

### Audit routes (quarantine sub-paths only)

- `src/routes/audit/audit_forensics.ts` — uses `analyzeGapsAgentic` (numeric). Quarantine or remove forensics dashboard.
- DRL, sampling, prior-period — quarantine if they are advisory/commentary only; else keep read-only execution.

### Close sub-routes (quarantine or refactor)

- `src/routes/close/close_signoff_readiness.ts` — uses `getCloseCoach` (agentic_close_coach). Quarantine coach; keep readiness logic in TS.
- `src/routes/close/close_je_accruals.ts` — uses `explainJESuggestionsAgentic`, `suggestJEsFromTextAgentic` (amounts). Quarantine agentic JE amounts; keep deterministic accrual flow.

### Export route dependency

- `src/routes/export.ts` imports `finalIntegrityCheck` from `src/agents/Supervisor.js`. **Action:** Extract `finalIntegrityCheck` to `src/services/integrity_check.ts` (or similar) so export does not depend on Supervisor. Then quarantine Supervisor.

### HITL type dependency

- `src/routes/hitl.ts` uses type `JournalEntryProposal` from `agentic_gap_analyzer`. **Action:** Move type to `src/types/hitl.ts` or `src/types/shared/` so hitl does not import from quarantined module.

### Job handler

- `agentic_cleanup` in `src/services/job_handlers.ts` — Placeholder; comment references agenticLedgerToTrialBalance. **Action:** Remove handler registration or move to experimental worker; keep only `ingestion_pipeline` and `statement_generation` in production.

---

## DELETE candidates (only if unused after quarantine)

- **Phase 3 only.** After quarantine, delete no code until import-graph and route/job analysis show zero references from production.
- Candidates (confirm unused first): duplicate types, orphaned schemas for quarantined routes, stub files that only re-export from experimental.

---

## Phase 1–4 checklist (reference)

1. **Phase 1:** Create `/experimental`; move QUARANTINE list; remove route mounts and job registrations; fix production imports (finalIntegrityCheck, JournalEntryProposal, etc.); repo compiles, tests pass.
2. **Phase 2:** Remove AI-number paths from production (agenticLedgerToTrialBalance, suggestJournalEntriesForImbalance, suggestJEsFromTextAgentic in ingest/close paths); add `assertNoNumericAmountsInAgentOutput`; ensure AI suggestions only to Draft/HITL.
3. **Phase 3:** Delete only provably dead code (no references from production).
4. **Phase 4:** Deprecation plan doc for DB tables related to quarantined modules; no auto-drop in production; optional cleanup script for later.

---

## Phase 1 Completion (Quarantine / Stub)

**Done (no file moves to /experimental yet):**

1. **Extracted dependencies:** `src/services/integrity_check.ts` (finalIntegrityCheck from Supervisor); `src/types/hitl.ts` (JournalEntryProposal). Export route uses `integrity_check`; hitl route uses `types/hitl`.
2. **Unmounted quarantined routes** from `server.ts`: forecasting, capital, budget, orchestrator, supervisor, entities, intercompany, catalog, reporting, access, ar-ap-workflows, invoice-to-books, bank-feed-matching, revenue-recognition, stock-comp, deferred-tax, impairment, segments, consolidation, statutory, acquisitions, equity-investments, leases, fixed-assets, eps, fx. (Routes and imports removed; files remain in `src/`.)
3. **Trial-balance ingest:** Removed agentic numeric paths: no `suggestJournalEntriesForImbalance`, no `agenticLedgerToTrialBalance`. Deterministic parse + staging only; imbalance returns staged response without AI suggestions. Preserved brace structure with `else if (false)` branch.
4. **Close:** Coach endpoint returns 410 (quarantined). JE from-text and JE explain return 410 (quarantined).
5. **Result generator:** Removed `resolveConflict`, `analyzeGapsAgentic`, `proposePolicyChangesAgentic`; dissentingOpinion = undefined, agenticGaps = [], policyProposals = [].
6. **Audit forensics:** Returns empty forensic_anomalies (agentic quarantined).
7. **Job handlers:** `agentic_cleanup` left as no-op (still registered to avoid "Unknown job type" for existing jobs).

**Not done:** Physical move of quarantined modules to `/experimental` (would require moving many files and updating all internal imports; prefer stub/unmount for now).

---

## Phase 4 — DB & Migration Cleanup (Conservative)

**Deprecation plan (do NOT auto-execute in production):**

| Table / migration | Related to | Action |
|-------------------|------------|--------|
| `tenant_budget_versions` | Budget (quarantined) | Document only; no drop in prod. |
| `tenant_kpi_history` | CFO dashboards (quarantined) | Document only. |
| `risk_context_*` (conflicts, liquidity, etc.) | CPA-CFA / supervisor (quarantined) | Document only. |
| `tenant_draft_adjustments` | Close workflow | KEEP. |
| Other tenant tables for leases, impairment, eps, deferred_tax, etc. | Quarantined modules | Document only; optional cleanup script for dev later. |

**Cleanup script:** Provide a separate script (e.g. `scripts/deprecation_cleanup.sql` or doc only) listing optional `DROP TABLE` for dev/test only; not executed in pilot or production.

---

*End of report. Phase 0 + Phase 1 (stub/unmount) completed; Phase 2–3–4 as per plan.*
