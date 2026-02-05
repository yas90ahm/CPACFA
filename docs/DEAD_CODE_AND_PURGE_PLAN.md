# Dead Code + Scope Drift Audit — Sovereign CPA Engine Pilot

**Role:** Skeptical CTO (read-only). No code changes, no file deletions.  
**Goal:** Identify dead code, quarantined code, unused routes/services, and out-of-scope modules removable without breaking the Sovereign CPA Engine pilot.  
**Scope (keep):** Ingest TB → Forge/HITL → Adjusted TB → Statements; JE workflow (draft/propose/approve/post) with shadow auditor; Lock → Certify → Draft/Certified exports; Audit Binder (certified-only) + audit chain verification; Justifications (tenant_justifications); DB reset/migrate/verify + integration tests.

---

## 1) Executive summary

- **Reachability:** The pilot is served by routes mounted in `server.ts`: trial-balance, justification, audit (all sub-routers), export, knowledge-base, vector-store, ingestion, memory, integrations, pipelines, close (all sub-routers), coa-mapping, data-quality, approvals, accounting-integration, onboarding, tenants, hitl; and when enabled, cpa (re-mount of subset) and api-dev (dev-only). **Catalog router is never mounted** — dead. **Server console.log advertises deleted routes** (orchestrator, forecasting, capital, budget, entities, reporting, access).
- **Quarantined:** Supervisor route returns 410 on `/api-dev/supervisor`; Supervisor implementation lives in `experimental/agents/Supervisor.ts`; `src/agents/Supervisor.ts` is a stub. Tools that depend on Supervisor (step1CPA, catalog tools via supervisor_tools) are unreachable in pilot flow.
- **Dead / unreachable:** Catalog router (not mounted). Routes advertised in server.ts that no longer exist (orchestrator, forecasting, capital, budget, entities, reporting, access). Code that only serves those routes is dead (e.g. budget_version_service, forecasting_service, lead_partner_orchestrator, unified_orchestrator — already deleted per git status).
- **Scope drift (candidates for purge):** Valuation/DCF/LBO/WACC (migrations 033, 043, 056; freshness_interlock_service; synthetic_net_debt for DCF/LBO; impairment DCF; compsSchemas valuation); CFO forecasting (catalog cash_forecast quarantined; agentic_variance_drivers budget vs actual); segment_reporting (migration 032, segment_repository, segment_reporting_service, agentic_segment_reporting) if not in sovereign pipeline; complex disclosure/narratives used only by non-pilot routes; supervisor_tools + auditor_agent (only used by quarantined Supervisor). Revenue recognition **is** used in sovereign pipeline (ingest/parser listContracts; statement build; professional review; cpa_bridge_manifest) — **do not remove**.
- **Safe purge plan:** Phase 1 quarantine (unwire catalog if ever wired elsewhere; align server console.log with actual routes). Phase 2 delete dead code (catalog route + its services/repos only if confirmed unused; stub Supervisor + supervisor_tools/auditor_agent only after confirming no production call path). Phase 3 migrations/tables only after confirming no reads/writes (e.g. budget_versions, dcf_valuations, lbo_models, risk_context_last_dcf).

---

## 2) Reachability map

### 2.1 Server entry (`src/server.ts`)

| Mount path | Router | Used in pilot |
|------------|--------|----------------|
| `/api/auth` | authRouter | Yes (auth) |
| `/api/trial-balance` | trialBalanceRouter | **Yes** (ingest, statements, period, classification) |
| `/api/justification` | justificationRouter | **Yes** (chat, audit-defense, list) |
| `/api/audit` | auditRouter | **Yes** (binder, draft-package, reconciliation-summary, professional-review, etc.) |
| `/api/export` | exportRouter | **Yes** (pdf, csv) |
| `/api/knowledge-base` | financialMemoryRouter | Optional (CPA invoice consistency) |
| `/api/vector-store` | vectorStoreRouter | Optional (RAG, precedent) |
| `/api/ingestion` | ingestionRouter | Optional (agent, pipeline, fetchers) |
| `/api/memory` | memoryRouter | Optional (semantic memory) |
| `/api/integrations` | integrationsRouter | Optional (OAuth) |
| `/api/pipelines` | pipelinesRouter | Optional (bank-rec, etc.) |
| `/api/close` | closeRouter | **Yes** (sessions, certify, journal-entries, adjustments, period-lock, checklist, issues, recon-runs, etc.) |
| `/api/coa-mapping` | coaMappingRouter | **Yes** (taxonomy, rules, map) |
| `/api/data-quality` | dataQualityRouter | Optional (rules, exceptions; ingest/parser use RuleEvaluationContext) |
| `/api/approvals` | approvalsRouter | Optional (workflows) |
| `/api/accounting-integration` | accountingIntegrationRouter | Optional (QuickBooks, Xero, NetSuite) |
| `/api/onboarding` | onboardingRouter | Optional (first close, CoA) |
| `/api/tenants` | tenantsRouter | Yes (BYOD tenant context) |
| `/api/hitl` | hitlRouter | **Yes** (staging, resolve, resolve-ingest, webhook, drafts) |
| `/api/cpa` | cpaRouter | When CPA_ENABLED=true; re-mounts trial-balance, close, audit, knowledge-base, vector-store, pipelines, justification |
| `/api-dev` | devDiagnosticsRouter | **Dev only** (NODE_ENV !== 'production'); trial-balance + **410 on /supervisor** |

**Not mounted anywhere:** `catalogRouter` (src/routes/catalog.ts) — **never mounted in server.ts or cpa_index.ts**. Catalog routes are **unreachable**.

### 2.2 Workers / jobs

| Entrypoint | File | Used in pilot |
|------------|------|----------------|
| `runWorkerLoop` | `src/services/job_worker.ts` | Yes (started when JOB_WORKER_ENABLED=true and DB configured) |
| Job handlers | `src/services/job_handlers.ts` | ingestion_pipeline, agentic_cleanup (placeholder), statement_generation — **statement_generation** is in-scope for close; ingestion_pipeline optional |
| `startIngestionScheduler` | `src/services/ingestion_scheduler.ts` | Optional (scheduler lock; fetchers) |

### 2.3 Integration tests (certification_pipeline + schema_smoke)

| Test file | Entrypoints exercised |
|-----------|------------------------|
| `tests/integration/certification_pipeline.test.ts` | app from server; `/api-dev/trial-balance/ingest` or `/api/trial-balance/ingest`; `/api/hitl/resolve-ingest`; `/api/close/sessions`, `/api/close/sessions/:id/checklist/initialize`, checklist complete/skip; PATCH session status (in_progress → locked); `/api/close/period-lock`; `/api/close/sessions/:id/certify`; `/api/export/pdf`; `/api/audit/binder`, `/api/audit/binder/export/pdf`; persistence.getStagingItem, getUnadjustedMeta, verifyChain |
| `tests/integration/schema_smoke.test.ts` | getControlPool, isDbConfigured, verifySchema (src/db/schema_verify.js) |
| `tests/integration/export_certified_gate.test.ts` | POST /api/export/pdf, POST /api/export/csv; close session repo; binder 403/200 |

**Reachable from tests:** trial-balance ingest, hitl resolve-ingest, close sessions/checklist/period-lock/certify, export pdf/csv, audit binder, audit_ledger verifyChain, persistence_service, trial_balance_store_service, close_session_repository, schema_verify.

---

## 3) Dead code candidates table

| Module/File | Why dead/unreachable | Evidence | Risk level | Removal approach |
|-------------|----------------------|----------|------------|------------------|
| **Catalog router** | Never mounted in server.ts or cpa_index.ts | server.ts has no `import catalogRouter` or `app.use('/api/catalog', ...)`; cpa_index mounts only trial-balance, close, audit, knowledge-base, vector-store, pipelines, justification | Low | Phase 1: Do not mount. Phase 2: Remove route file and any service/repo used **only** by catalog (data_catalog_service, catalog_query_service, data_catalog_repository, catalogSchemas) after confirming no other caller (e.g. supervisor_tools uses catalog_query_service — see below). |
| **/api-dev/supervisor** | Quarantined; returns 410 | dev_diagnostics.ts: `router.use('/supervisor', ... res.status(410).json({ error: 'Quarantined', ... })` | Low | Phase 1: Leave 410. Phase 2: If Supervisor is permanently out of pilot, remove stub Supervisor.ts and experimental Supervisor; then remove auditor_agent, supervisor_tools, and tools that are only invoked by Supervisor. |
| **src/agents/Supervisor.ts** | Stub; runSupervisor throws | Supervisor.ts exports runSupervisor that throws "Supervisor is quarantined to /experimental" | Low | Phase 2: Delete only after confirming no production path calls runSupervisor (dev route returns 410, so no HTTP path). sovereign_validator.test.ts imports finalIntegrityCheck from Supervisor — switch to integrity_check.finalIntegrityCheck before deleting. |
| **supervisor_tools.ts** | Only used by agents/tools/index (step1CPA, catalog tools); tools run only when Supervisor runs | tools/index.ts imports runStep1CPA, runCatalogQuery, etc. from supervisor_tools; Supervisor (quarantined) would call executeTool | Medium | Phase 2: Remove after removing Supervisor; catalog_query_service is used by supervisor_tools — if catalog route is also removed, catalog_query_service may become dead except for data_quality/runCatalogQuery usage (check runCatalogQuery callers). |
| **auditor_agent.ts** | runSupervisorWithSkeptic only called by Supervisor flow (quarantined) | agents/index.ts re-exports; no route in server mounts supervisor chat | Low | Phase 2: Remove with Supervisor. |
| **Server console.log lines** | Advertise routes that do not exist | server.ts lines 202–204 (orchestrator), 216–219 (forecasting, capital, budget, entities, reporting, access) | N/A (docs only) | Phase 1: Update console.log to list only existing routes (or remove stale lines). |

**Note on catalog:** `runCatalogQuery` / `catalog_query_service` are used by `src/routes/catalog.ts` (unmounted) and by `supervisor_tools.ts` (quarantined). So if both catalog route and Supervisor are removed, `catalog_query_service` and `data_catalog_service` are only used by other dataset types (e.g. trial_balance, data_quality_exceptions) — need to verify which dataset IDs are still required for pilot. `data_catalog_repository` and migration 008 are used by data_catalog_service; if catalog UI/API is fully out of scope, Phase 2 can remove catalog **route** and optionally the catalog **dataset type** handlers that are quarantined (budget_version, cash_forecast) while keeping trial_balance and data_quality_exceptions if still used.

---

## 4) Scope drift candidates table

| Module/File | Why out-of-scope / drift | Evidence | Risk level | Removal approach |
|-------------|--------------------------|----------|------------|------------------|
| **Valuation / DCF / LBO / WACC** | Not required for ingest → TB → statements → certify → export | Migrations: 033_dcf_valuations.sql, 043_tenant_lbo_models.sql, 056_risk_context_last_dcf.sql; freshness_interlock_service (assertFreshnessForValuation for DCF/LBO); synthetic_net_debt_service ("DCF/LBO"); impairment_testing_service (Value in Use DCF); compsSchemas calculateValuation | Medium | Phase 3 only: After confirming no route or job reads/writes these tables, drop migrations 033, 043, 056 from runlist and add down-migrations if policy allows. Phase 2: Remove or stub routes that call DCF/LBO (none found in current server mount — already deleted). Remove freshness_interlock usage from any remaining valuation code paths. |
| **Budget / forecasting (CFO)** | Budget vs actual and cash forecast not in sovereign pipeline | catalog_query_service: budget_version and cash_forecast return empty "quarantined"; migration 012_tenant_budget_versions; types cfo-dashboard BudgetLine, variance; agentic_variance_drivers (budget vs actual) | Low | Phase 2: Keep migration 012 if other code references budget_versions table; otherwise Phase 3. Remove or keep quarantined catalog dataset types. agentic_variance_drivers may still be referenced by pipelines or reporting — verify before removal. |
| **Segment reporting** | IFRS 8 / ASC 280 segment report not in core pilot flow | migration 032_segment_reporting; segment_repository; segment_reporting_service; agentic_segment_reporting | Low | Phase 2: If no route in pilot calls segment reporting, mark as out-of-scope; Phase 3: drop migration 032 only after confirming no reads/writes. |
| **Unified / lead-partner orchestrator** | Already deleted | git status: D src/routes/orchestrator.ts, D src/services/lead_partner_orchestrator.ts, D src/services/unified_orchestrator.ts | N/A | Already removed. |
| **Reporting pack / commentary** | Advertised in server but no route found | server.ts console.log "GET /api/reporting/pack-templates; POST /api/reporting/pack; GET /api/reporting/commentary" | Low | Routes already deleted. Phase 1: Remove from console.log. |
| **Access dashboards/alerts** | Advertised in server but no route found | server.ts console.log "GET /api/access/dashboards, alerts" | Low | Routes already deleted. Phase 1: Remove from console.log. |
| **Audit DRL / sampling / prior-period / PBC / engagements / artifacts** | Sub-routers mounted under /api/audit; may be optional for minimal pilot | audit/index.ts mounts auditDrlRouter, auditSamplingRouter, auditPbcRouter, auditPriorPeriodRouter, auditEngagementsRouter, auditArtifactsRouter | Low | If pilot only needs binder, professional-review, reconciliation-summary, gaap-policy, todos, auditor, forensics — consider Phase 1 quarantine (stop mounting) for DRL, sampling, PBC, prior-period, engagements, artifacts; Phase 2 delete after confirmation. |
| **Revenue recognition** | **In scope** — used in sovereign pipeline | ingest/parser listContracts (revenue_recognition_repository); statement build; professional_review (judgment_revenue_recognition); cpa_bridge_manifest; revenue_recognition_service | **Do NOT remove** | Keep. |

---

## 5) Purge plan (phased)

### Phase 1 — Quarantine (remove route wiring / align docs)

- **1.1** Update `server.ts` console.log so it does not advertise deleted routes (orchestrator, forecasting, capital, budget, entities, reporting, access). Optionally add a short comment that Supervisor is quarantined at /api-dev/supervisor (410).
- **1.2** Do **not** mount catalog router unless product requires it; document that catalog is intentionally unmounted for pilot.
- **1.3** (Optional) If audit sub-routers DRL, sampling, PBC, prior-period, engagements, artifacts are out of scope for pilot: unmount them in `audit/index.ts` (comment out or conditional) so they are not reachable. Document.

### Phase 2 — Delete code + update tests

- **2.1** **Catalog:** If product confirms catalog API is out of scope for pilot: delete `src/routes/catalog.ts`; remove or stub any code that is **only** used by catalog (e.g. resolve-intent, agentic_query_follow_up, agentic_query_summary if only used by catalog). Keep `catalog_query_service` and `data_catalog_service` if still used by data_quality or trial_balance dataset types; otherwise remove. Update tests that reference catalog.
- **2.2** **Supervisor / agents:** After confirming no production or test path invokes runSupervisor (except tests that expect 410):
  - In `tests/sovereign_validator.test.ts`: change import of `finalIntegrityCheck` from `src/agents/Supervisor.js` to `src/services/integrity_check.js`.
  - Delete or stub `src/agents/Supervisor.ts` (stub).
  - Delete `experimental/agents/Supervisor.ts` and `experimental/middleware/swaggerSetup.ts` if no longer needed, or leave in experimental/ as reference.
  - Remove `auditor_agent.ts` and `supervisor_tools.ts` if their only caller was the Supervisor route. Remove from `agents/index.ts` the exports that are only for Supervisor (runSupervisorWithSkeptic, runSkepticReview, runDiscussion, SupervisorReport, etc.); keep executeTool, toolDefinitions, runGapAnalysis, DataGap if still used.
- **2.3** **Scope drift services:** Remove or stub valuation/DCF/LBO-specific code (e.g. freshness_interlock_service if only used by deleted routes; compsSchemas valuation endpoint if any). Do **not** remove revenue_recognition_service or revenue_recognition_repository — in use.
- **2.4** Run full test suite and integration tests (certification_pipeline, schema_smoke, export_certified_gate) after Phase 2.

### Phase 3 — Migrations / tables (only if confirmed unused)

- **3.1** Only after confirming no code path reads or writes:
  - **budget_versions** (migration 012): if no route or job uses it, consider dropping table and removing 012 from migration runlist (with down-migration if required by policy).
  - **dcf_valuations** (033), **tenant_lbo_models** (043), **risk_context_last_dcf** (056): same.
- **3.2** **Do not** remove: tenant_schema, period_trial_balance, tenant_hitl_staging, close_sessions, journal_entries, tenant_justifications, audit_ledger, period_export_checks, close_checklist, statement_packages, professional_audit_flags, revenue_recognition, tenant_revenue_recognition (041), etc. — required for pilot.
- **3.3** Segment reporting (032), audit_engagements (028), sampling (017, 023), PBC (016), etc.: remove from migration runlist only after explicit confirmation and down-migration plan.

---

## 6) “Do NOT remove” list (core sovereign modules)

- **Routes:** trial-balance (ingest, statements, period, classification), justification, audit (binder, draft-package, register-statements, professional-review, reconciliation-summary, integrity/validate), export (pdf, csv), close (sessions, certify, checklist, journal-entries, adjustments, period-lock, recon-runs, issues, decision-records, signoff-readiness, closing-entries, controls, materiality-disclosure, one-pager-exceptions, package, audit-log, segregation, task-assign), hitl (staging, resolve, resolve-ingest, webhook, drafts, context-memory), coa-mapping.
- **Services:** fileIngestion, trialBalanceParser, trial_balance_store_service, adjusted_trial_balance_service, persistence_service (HITL staging), hitl_orchestrator, close_session_service, close_checklist_readiness_service, journal_entry_service, shadow_auditor_service, audit_ledger_service, export_gate_service, integrity_check, integrity_gate_service, audit_export_service, audit_binder_export_service, justification_service, tenant_justifications_repository, period_trial_balance_repository, close_session_repository, journal_entry_repository, audit_ledger_repository, statementGenerator / financialStatements, buildValidatedStatements, accountClassifier (deterministic path), protocol_bridge (SaveTrialBalance, ResolveIngest), getAdjustedTrialBalance, listContracts (revenue_recognition_repository) / revenue_recognition_service (for statement build and professional review).
- **Migrations (core):** 001, 002, 003, 009, 019, 022, 026, 027, 047, 051, 052, 060, 062, 064, 065, 066, 067, 069, 070, 071, 072, 073, 074, 075, 076, 077, 078, 079; 041 (revenue_recognition); 048 (professional_audit_flags); 058 (period_financial_data_state); 059, 061; and any other migration referenced by the services above.
- **Agents/tools (in use):** cpa_brain (DataGap, runGapAnalysis) — used by reconciliation_todos, month_end_close_service, result_generator, agentic_quality_assessor, agentic_gap_analyzer, policy_inference_agentic. proposeTrialBalanceAdjustment tool and buildFinancialStatements tool (used by stub Supervisor; if Supervisor is removed, keep tools if they are ever invoked by another path, e.g. headless or future orchestrator).
- **Tests:** certification_pipeline.test.ts, schema_smoke.test.ts, export_certified_gate.test.ts, and any test that covers the “Do NOT remove” routes and services.

---

*End of audit. No files were modified or deleted. All conclusions are from read-only inspection of the repository.*
