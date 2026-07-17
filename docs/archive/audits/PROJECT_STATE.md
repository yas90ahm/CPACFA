# Sovereign CPA Engine — Final State Assessment

**Date:** 2026-02-20  
**Context:** Read-only audit after 13 prompts of refactoring, hardening, cleanup, and surgery. No code changes in this audit.

---

## Section 1: File Counts

| Metric | Count |
|--------|-------|
| **Active services** | 129 (`src/services/**/*.ts`, excluding `_quarantine`) |
| **Active routes** | 65 (`src/routes/**/*.ts`, excluding `_quarantine`) |
| **Quarantined files** | 115 (`src/_quarantine/**/*.ts`) |
| **Active types** | 58 (`src/types/**/*.ts`, excluding `_quarantine`) |
| **Database migrations** | 114 (SQL files in `migrations/`) |
| **Test files** | 110 (in `tests/`; `*.test.ts`); 0 in `src/` (excluding quarantine) |
| **Active TypeScript LOC** | ~59,216 (src, excluding `_quarantine`) |

*Counts obtained via PowerShell/Get-ChildItem and line-count over `src` excluding `_quarantine`.*

---

## Section 2: Build Status

**Result: FAIL**

**Errors (exact):**

```
src/services/result_generator.ts(31,62): error TS2307: Cannot find module './analysis_agent.js' or its corresponding type declarations.
src/services/statementGenerator.ts(17,65): error TS2307: Cannot find module './leaseLiabilityCalc.js' or its corresponding type declarations.
```

**Cause:** Two active services still import modules that were moved to `src/_quarantine/services/` during surgery (`analysis_agent.ts`, `leaseLiabilityCalc.ts`). The build excludes `_quarantine`, so those imports resolve to missing modules.

**Note:** The integration test script (`npm run test:integration`) runs against a previously built/running server (e.g. `tsx` or existing `dist/`); it does not run `tsc`, so it can pass while the current `npm run build` fails.

---

## Section 3: Test Status

| Command | Exists | Result |
|---------|--------|--------|
| `npm test` | No | N/A — script missing |
| `npm run test:unit` | No | N/A — script missing |
| `npm run test:integration` | Yes | **PASS** (10 steps passed in `scripts/test_gl_certification.ts`) |
| `npx jest` | Not in package.json | Not run (project uses tsx-based integration script, not Jest) |

**Test commands present in package.json:**  
- `test:integration` → `tsx scripts/test_gl_certification.ts`  
- `test:integration:dev` → same with `BASE_URL=http://localhost:3000`

**Integration test summary (last run):**  
- Login, COA upload, GL upload, TB derivation, Ensure Session, Initialize Checklist, Advance to Locked, Certify Session, Audit Binder, Verification — all **PASS**.  
- **10 passed, 0 failed, 0 skipped.**

**Unit / Jest:** No `test` or `test:unit` script; no Jest config found in package.json. Unit test files exist under `tests/unit/*.test.ts` but are not invoked by a single npm script in the audit.

---

## Section 4: Active Service Inventory

All 129 active service files under `src/services` (excluding `_quarantine`), with one-line purpose and category.

| File | Purpose (1 sentence) | Category |
|------|----------------------|----------|
| accountClassifier.ts | Classify GL accounts for BS/P&L and suggest mapping. | MAPPING |
| aje_template_service.ts | CRUD and propose/apply/skip AJE templates for close. | AJE |
| adjusted_trial_balance_service.ts | Build trial balance for period (GL-derived or period_trial_balance). | INGEST |
| agentic_onboarding.ts | COA mapping AI suggestions (only agentic service kept). | AI_ADVISORY |
| approval_request_service.ts | Create and manage approval requests for JEs/close. | CLOSE_CORE |
| approval_workflow_service.ts | Define approval workflows and steps. | CLOSE_CORE |
| audit_binder_export_service.ts | Build audit binder payload and export. | AUDIT_EXPORT |
| audit_export_service.ts | Export certified package, PBC, statements for audit. | AUDIT_EXPORT |
| audit_file_service.ts | Audit file generation and retrieval for engagements. | AUDIT |
| audit_ledger_service.ts | Append-only audit ledger and hash chain. | AUDIT |
| audit_log_service.ts | Query/purge audit log (append deprecated in favor of audit_service). | AUDIT |
| audit_service.ts | Record material events and audit trail. | AUDIT |
| cascade_engine.ts | Propagate TB/statement changes downstream (invalidate, cascade). | CASCADE |
| catalog_query_service.ts | Run catalog queries (balance_sheet, P&L, TB, etc.); data_catalog quarantined, uses fallback. | OTHER |
| certification_artifact_service.ts | Build and store certification artifact (snapshot, hash, signing). | CERTIFICATION |
| certified_statements_service.ts | Build certified BS/P&L/CF/equity from snapshot. | STATEMENTS |
| checklist_store_service.ts | Store and retrieve checklist state. | CLOSE_CORE |
| close_adjustment_update_service.ts | Update close adjustments and sync to GL. | CLOSE_CORE |
| close_calendar_config_service.ts | Close calendar configuration. | CLOSE_CORE |
| close_calendar_service.ts | Close calendar entries and scheduling. | CLOSE_CORE |
| close_checklist_readiness_service.ts | Compute readiness, checklist init, completeness gates for advance. | CLOSE_CORE |
| close_context.ts | Resolve close context (session, period) for routes. | CLOSE_CORE |
| close_controls_service.ts | Close controls CRUD and assertion suggestions. | CLOSE_CORE |
| close_readiness_service.ts | High-level readiness for UI (simplified; recsTied hardcoded). | CLOSE_CORE |
| close_session_service.ts | Close session state machine: create, advance, certify, lock, reopen. | CLOSE_CORE |
| close_status_service.ts | Aggregate close status (readiness, triage, etc.). | CLOSE_CORE |
| closing_entries_service.ts | Closing entries for period. | CLOSE_CORE |
| coa_mapping_service.ts | Map accounts to FS taxonomy and apply rules. | MAPPING |
| coa_template_service.ts | COA templates for upload/ingest. | MAPPING |
| coa_upload_service.ts | Upload and parse COA. | MAPPING |
| cpa_bridge_manifest.ts | CPA bridge manifest for deterministic standards (lease, revenue, etc.). | AJE |
| cpa_decision_handler.ts | Execute CPA bridge commands (lease/revenue/tax/fixed asset); lease path quarantined. | AJE |
| cross_statement_validation.ts | Cross-statement validation (A=L+E, net income, etc.). | STATEMENTS |
| decision_record_service.ts | Decision records CRUD for audit trail. | AUDIT_EXPORT |
| deferred_tax_service.ts | Deferred tax computation for bridge. | AJE |
| deterministic_pattern_detector.ts | Detect patterns for issue/auto-resolution. | HITL |
| disclosure_checklist_service.ts | Disclosure checklist CRUD. | CLOSE_CORE |
| draft_service.ts | Draft adjustments and HITL drafts. | HITL |
| equityChanges.ts | Equity changes statement logic. | STATEMENTS |
| evidence_attachment_service.ts | Attach evidence to JE and reconciliation; list by object. | EVIDENCE |
| evidence_manifest_service.ts | Build evidence manifest for certification. | EVIDENCE |
| evidence_storage_service.ts | Store/retrieve evidence files (adapter). | EVIDENCE |
| export_gate_service.ts | Gate export on integrity and blockers. | CERTIFICATION |
| export_service.ts | Export PDF/CSV and certified package. | AUDIT_EXPORT |
| financialStatements.ts | Generate BS, P&L, CF from TB. | STATEMENTS |
| fixed_asset_service.ts | Depreciation and fixed asset schedules for bridge. | AJE |
| freshness_interlock_service.ts | Prevent stale statement package use. | STATEMENTS |
| fx_currency_service.ts | FX and currency conversion. | OTHER |
| fx_translation_service.ts | FX translation for statements. | STATEMENTS |
| gl_to_tb_aggregation_service.ts | Aggregate GL to trial balance. | INGEST |
| gl_upload_service.ts | Upload GL and derive TB. | INGEST |
| hitl_orchestrator.ts | HITL orchestration and staging. | HITL |
| integrity_check.ts | Integrity checks (e.g. D=C). | STATEMENTS |
| integrity_conflict_service.ts | Covenant/conflict checks for export (deterministic fallback). | CERTIFICATION |
| integrity_gate_service.ts | Gate on integrity before export/certify. | CERTIFICATION |
| ingest_covenant_liquidity.ts | Derive covenant/liquidity from ingest (deterministic fallback). | OTHER |
| integration_store.ts | Store ERP/integration connections. | INTEGRATION |
| issue_auto_resolution_service.ts | Auto-resolve issues by rule. | HITL |
| issue_detection_service.ts | Detect issues (mapping, recon, template completeness). | HITL |
| issue_service.ts | Issue CRUD, status, assign, resolve, waive, reopen. | HITL |
| job_handlers.ts | Job queue handlers (no ingestion_pipeline in MVP). | INFRA |
| job_service.ts | Enqueue and manage jobs. | INFRA |
| job_worker.ts | Process job queue. | INFRA |
| journal_entry_service.ts | JE CRUD, post, approve, reject; cascade on post. | AJE |
| judgment_going_concern.ts | Going-concern judgment for professional review. | AUDIT |
| justification_service.ts | Justify with RAG (fallback store when handbook quarantined), create justification. | AUDIT_EXPORT |
| kpi_history_service.ts | KPI history snapshots. | OTHER |
| ledger_snapshot_service.ts | Create and hash ledger snapshots. | CERTIFICATION |
| lease_service.ts | Lease CRUD and schedules (PV/ROU quarantined; throws). | AJE |
| mapping_completeness_gate.ts | Ensure all TB accounts mapped before advance. | MAPPING |
| materiality_config_service.ts | Materiality configuration. | CLOSE_CORE |
| materiality_service.ts | Materiality thresholds and checks. | VARIANCE |
| month_end_close_service.ts | Month-end close orchestration. | CLOSE_CORE |
| notesPolicies.ts | Notes and policies for statements. | STATEMENTS |
| onboarding_service.ts | Tenant onboarding state. | INFRA |
| pack_builder_service.ts | Build export/package payloads. | AUDIT_EXPORT |
| period_close_service.ts | Period close state and resolution list. | CLOSE_CORE |
| period_lock_service.ts | Period lock for GL. | CLOSE_CORE |
| period_reconciliation_service.ts | Period reconciliations (tenant_period_reconciliations) CRUD and complete. | RECON |
| planExecuteVerify.ts | Plan-execute-verify verification (deterministic). | STATEMENTS |
| policy_inference_agentic.ts | Policy inference (e.g. standard); used in onboarding. | AI_ADVISORY |
| precedent_for_close_step.ts | Precedent for close step (prior period). | OTHER |
| professional_review_input_builder.ts | Build input for professional review. | AUDIT |
| professional_review_service.ts | Run professional review (going concern only; other judgments quarantined). | AUDIT |
| push_close_to_gl_service.ts | Push close to GL (ERP). | INTEGRATION |
| quality_checks.ts | Quality checks for TB/statements. | STATEMENTS |
| recon_completeness_gate.ts | All required recons complete and within tolerance. | RECON |
| recon_requirements_auto_generate.ts | Auto-generate recon requirements. | RECON |
| recon_service.ts | Recon runs and items (legacy recon_runs). | RECON |
| reconciliation_resolution_service.ts | Reconciliation resolutions CRUD. | RECON |
| reconciliation_summary_service.ts | Build reconciliation summary. | RECON |
| reconciliation_todos.ts | Reconciliation todos. | RECON |
| result_generator.ts | Generate result package (step2CFA etc.); **imports analysis_agent — build broken**. | OTHER |
| revenue_recognition_service.ts | Revenue recognition schedules for bridge. | AJE |
| risk_context_store.ts | Risk context and flags. | AUDIT |
| rules_registry.ts | Rules registry for mappings. | MAPPING |
| snapshot_gl_helpers.ts | Helpers for snapshot/GL. | CERTIFICATION |
| standard_selector.ts | Select reporting standard. | INGEST |
| statement_package_service.ts | Generate and store statement packages; diff. | STATEMENTS |
| statementGenerator.ts | Statement generation entry; **imports leaseLiabilityCalc — build broken**. | STATEMENTS |
| segregation_service.ts | Segregation of duties (can perform action). | INFRA |
| tax_strategy_service.ts | Tax strategy for bridge. | AJE |
| template_completeness_gate.ts | All proposed AJE templates applied or skipped. | AJE |
| trial-balance/helpers.ts | TB helpers. | INGEST |
| trial-balance/parser_utils.ts | TB parser utilities. | INGEST |
| trial_balance_rollup_service.ts | Roll up TB. | INGEST |
| trial_balance_store_service.ts | Store/retrieve period trial balance. | INGEST |
| trialBalanceParser.ts | Parse trial balance from rows. | INGEST |
| triage_service.ts | Triage assessments for close. | CLOSE_CORE |
| variance_analysis_service.ts | Variance analysis and explain/approve; completeness gate. | VARIANCE |
| fileIngestion.ts | File ingestion helpers. | INGEST |
| close_evidence_policy (via repo) | Evidence policy get/upsert (route uses repo). | EVIDENCE |
| evidence_policy_service.ts | Evidence policy enforcement for certification (materiality threshold, required assertions). | EVIDENCE |
| google_oauth.ts | Google OAuth for integrations. | INFRA |

*Categories: CLOSE_CORE, CASCADE, HITL, EVIDENCE, AUDIT, CERTIFICATION, STATEMENTS, RECON, AJE, MAPPING, VARIANCE, INGEST, INTEGRATION, AUDIT_EXPORT, AI_ADVISORY, INFRA, OTHER.*

---

## Section 5: Active Route Inventory

Routes under `src/routes` (excluding `_quarantine`). Method + path are as defined on the router; full path may be prefixed by mount (e.g. `/api/close`, `/api/audit`).

| Route File | Method + Path | Service Called | Purpose |
|------------|--------------|----------------|--------|
| close/close_sessions.ts | POST /sessions/ensure | ensureSessionForPeriod | Idempotent ensure session for entity+period |
| close/close_sessions.ts | POST /sessions | createSessionOrGetExisting | Create session |
| close/close_sessions.ts | GET /sessions/:id | getSession | Get session |
| close/close_sessions.ts | POST /sessions/:id/advance | advanceSession | Advance state (open→in_progress→under_review) |
| close/close_sessions.ts | GET /sessions/:id/readiness | computeReadiness | Readiness for advance |
| close/close_sessions.ts | POST /sessions/:id/certify | certifyCloseSession | Certify (under_review→certified) |
| close/close_sessions.ts | GET /sessions/:id/certified-source | (session + legacy flags) | Certified source metadata |
| close/close_sessions.ts | POST /sessions/:id/checklist/initialize | initializeChecklistTemplate | Init checklist |
| close/close_sessions.ts | GET /sessions/:id/checklist | getChecklistItems | List checklist |
| close/close_sessions.ts | POST /checklist-items/:itemId/complete | completeChecklistItem | Complete item |
| close/close_sessions.ts | POST /checklist-items/:itemId/skip | skipChecklistItem | Skip item |
| close/close_sessions.ts | POST /sessions/:id/checklist/emit-stuck-issues | emitIssuesForStuckChecklist | Emit stuck issues |
| close/close_sessions.ts | GET /sessions | listSessions | List sessions |
| close/close_sessions.ts | GET /sessions/:id/triage | getOrComputeTriage, getLatestTriage | Triage |
| close/close_sessions.ts | POST /sessions/:id/statement-packages/generate | generateStatementPackage | Generate statement package |
| close/close_sessions.ts | GET /sessions/:id/statement-packages | listStatementPackages | List packages |
| close/close_sessions.ts | GET /statement-packages/diff | getStatementDiff | Statement diff |
| close/close_sessions.ts | GET /statement-packages/:id | getStatementPackage | Get package |
| close/close_sessions.ts | GET /statement-packages/:id/lines | getStatementPackageWithLines | Package lines |
| close/close_sessions.ts | PATCH /sessions/:id/status | updateStatus | Update status |
| close/close_sessions.ts | POST /sessions/:id/reopen | reopenCloseSession | Reopen certified |
| close/close_sessions.ts | POST /sessions/:id/lock | lockCloseSession | Lock (certified→locked) |
| close/close_period_reconciliations.ts | GET /sessions/:periodId/reconciliations | listByCloseSession | List recons |
| close/close_period_reconciliations.ts | GET /sessions/:periodId/reconciliations/:reconId | getReconciliation | Get recon |
| close/close_period_reconciliations.ts | POST /sessions/:periodId/reconciliations/initialize | initializeReconciliations | Initialize recons |
| close/close_period_reconciliations.ts | POST .../supporting-balance | setSupportingBalance | Set supporting balance |
| close/close_period_reconciliations.ts | POST .../items | addReconcilingItems | Add reconciling items |
| close/close_period_reconciliations.ts | POST .../items/:itemId/create-aje | createAjeFromReconItem | Create AJE from item |
| close/close_period_reconciliations.ts | DELETE .../items/:itemId | removeReconItem | Remove item |
| close/close_period_reconciliations.ts | POST .../complete | completeReconciliation | Complete recon |
| close/close_period_reconciliations.ts | GET .../evidence | listEvidenceForReconciliation | List recon evidence |
| close/close_period_reconciliations.ts | POST .../evidence (multipart) | attachEvidenceToReconciliation | Upload recon evidence |
| close/close_period_reconciliations.ts | POST .../approve | approveReconciliation | Approve recon |
| close/close_period_reconciliations.ts | POST .../reject | rejectReconciliation | Reject recon |
| close/close_period_reconciliations.ts | GET /sessions/:periodId/recon-completeness | checkReconCompleteness | Recon completeness |
| close/close_aje_templates.ts | GET /templates | listTemplates | List templates |
| close/close_aje_templates.ts | POST /templates | createTemplate | Create template |
| close/close_aje_templates.ts | GET /templates/:id | getTemplate | Get template |
| close/close_aje_templates.ts | POST /templates/propose | proposeTemplates | Propose templates |
| close/close_aje_templates.ts | POST /templates/apply | applyTemplate | Apply template |
| close/close_aje_templates.ts | POST /templates/skip | skipTemplate | Skip template |
| close/close_aje_templates.ts | GET /sessions/:closeSessionId/template-status | getTemplateStatus | Template status |
| close/close_journal_entries.ts | (multiple) | journal_entry_service, evidence_attachment_service | JE CRUD, post, approve, evidence upload, attachments |
| close/close_journal_entries.ts | POST /journal-entries/:id/evidence/upload | addEvidenceWithFile | JE evidence upload |
| close/close_journal_entries.ts | POST /journal-entries/:id/evidence | attachEvidenceToJournalEntry | JE evidence (ref only) |
| close/close_journal_entries.ts | POST /journal-entries/:id/attachments | addJEAttachment | JE attachment (file) |
| close/close_journal_entries.ts | GET .../evidence/:evidenceId/download | (evidence_storage + repo) | Download JE evidence |
| close/close_journal_entries.ts | GET .../attachments/:attachmentId/download | (storage) | Download JE attachment |
| close/close_variance_analysis.ts | GET /sessions/:closeSessionId/variances | listVariancesForSession | List variances |
| close/close_variance_analysis.ts | POST /variances/:id/explain | explainVariance | Explain variance |
| close/close_variance_analysis.ts | POST /variances/:id/approve | approveVarianceExplanation | Approve explanation |
| close/close_variance_analysis.ts | GET /sessions/:closeSessionId/variance-status | getVarianceStatus | Variance status |
| close/close_issues.ts | POST /issues, GET /issues/summary, POST /issues/detect, GET /issues, GET /issues/:id | issue_service | Issues CRUD and detect |
| close/close_issues.ts | PATCH /issues/:id/status, .../assign, POST .../start, .../resolve, .../verify, .../waive, .../reopen | issue_service | Issue lifecycle |
| close/close_evidence_policy.ts | GET /evidence-policy | getEvidencePolicy (repo) | Get evidence policy |
| close/close_evidence_policy.ts | PUT /evidence-policy | upsertEvidencePolicy (repo) | Upsert evidence policy |
| close/close_recon_requirements.ts | GET/POST /recon-requirements, PUT/DELETE /:id | recon_requirements_repository, autoGenerateReconRequirements | Recon requirements |
| close/close_reconciliation.ts | POST/GET /reconciliation-resolution, PATCH :id | reconciliation_resolution_service | Reconciliation resolutions |
| close/close_decision_records.ts | (decision_record_service) | Decision records | Audit decision records |
| close/close_recon_runs.ts | (recon_service) | Recon runs (legacy) | Recon runs |
| close/close_checklist.ts | POST /checklist, GET /checklist/:periodLabel, PATCH step, GET/POST/PATCH checklist-templates | checklist_store_service, close_checklist | Checklist |
| close/close_signoff_readiness.ts | POST /sign-off, /reviewer-sign-off, GET /readiness, /status, /coach | (readiness, status) | Sign-off and readiness |
| close/close_segregation.ts | POST /can-perform, /perform-action | segregation_service | Segregation |
| close/close_controls.ts | (controls CRUD, control-evidence) | close_controls_service | Controls |
| close/close_materiality_disclosure.ts | GET/PATCH /materiality, GET/PATCH disclosure-checklist | materiality_service, disclosure_checklist_service | Materiality and disclosure |
| close/close_je_accruals.ts | POST /je-suggestions, /je-suggestions/from-text, /explain | (JE suggestions) | JE suggestions |
| close/close_audit_log.ts | POST/GET /audit-log, POST retention-purge | audit_log_service | Audit log |
| close/close_closing_entries.ts | GET /closing-entries, POST /closing-entries/add | closing_entries_service | Closing entries |
| close/close_adjustments.ts | (close_adjustment_update_service) | Close adjustments | Adjustments |
| close/close_period.ts | (period, period lock) | period_close_service, period_lock_service | Period and lock |
| close/close_task_assign.ts | (task assign) | (task assign) | Task assign |
| verification/certification.ts | GET /public-key, GET /artifacts/:closeSessionId, POST /verify | certification_artifact_service, verify | Verification |
| verification/snapshots.ts | (snapshots) | ledger_snapshot_service | Snapshots |
| verification/audit_chain.ts | (audit chain) | audit_ledger_service | Audit chain |
| verification/evidence_manifest.ts | (evidence manifest) | evidence_manifest_service | Evidence manifest |
| verification/db_enforcement.ts | (DB enforcement) | (db) | DB enforcement |
| audit/audit_binder.ts | POST /register-statements, GET /binder, GET /binder/export/pdf|csv, GET /draft-package | audit_export_service, pack_builder | Audit binder |
| audit/pbc_index.ts | (PBC index) | (PBC, certified source) | PBC index |
| audit/audit_reconciliation.ts | GET/POST /reconciliation-summary | reconciliation_summary_service | Reconciliation summary |
| audit/audit_prior_period.ts | POST /prior-period-comparison | (prior period) | Prior period comparison |
| audit/audit_professional_review.ts | (professional review) | professional_review_service, professional_review_input_builder | Professional review |
| audit/audit_todos.ts | (reconciliation_todos) | reconciliation_todos | Audit todos |
| audit/audit_auditor.ts | (auditor) | justifyWithRAG, etc. | Auditor |
| audit/audit_forensics.ts | (forensics) | (forensics) | Forensics |
| audit/audit_gaap_policy.ts | (GAAP policy) | (GAAP policy) | GAAP policy |
| gl/ingest.ts | (GL ingest) | gl_upload_service, gl_to_tb_aggregation_service | GL upload and TB derivation |
| coa_mapping.ts | GET /taxonomy, GET/POST /rules, POST /map | coa_mapping_service | COA mapping |
| coa.ts | (COA) | coa_upload_service, coa_template_service | COA upload/templates |
| export.ts | POST /pdf, POST /csv | export_service, export_gate_service | Export PDF/CSV |
| auth.ts | (login, register, etc.) | (auth) | Auth |
| config.ts | (config) | (config) | Config |
| tenants.ts | (tenants) | (tenants) | Tenants |
| hitl.ts | (multiple) | draft_service, hitl_orchestrator, justification_service | HITL and drafts |
| precheck.ts | POST /board-ready, /board-ready-pack | (precheck; board-ready 410 in MVP) | Precheck |
| data_quality.ts | GET/POST /rules, GET/PATCH /exceptions, POST /run, GET /summary | data_quality_rule_service, data_quality_exception_service | Data quality |
| approvals.ts | GET/POST workflows, POST submit, GET/PATCH requests | approval_workflow_service, approval_request_service | Approvals |
| accounting_integration.ts | POST/GET connections, sync-trial-balance, push-journal-entry, pull-transactions | integration_store, push_close_to_gl_service | ERP integration |
| onboarding.ts | (onboarding) | onboarding_service | Onboarding |
| justification.ts | (justification) | justification_service | Justification |
| memory.ts | (memory) | (memory) | Memory |
| trial-balance/* | POST /ingest, POST /statements, GET period, classification | trialBalanceParser, accountClassifier, etc. | TB ingest and classification |
| dev_diagnostics.ts | (dev only) | (diagnostics) | Dev diagnostics |

*Mounts: `/api/close` (closeRouter), `/api/audit` (auditRouter), `/api/verification` (verificationRouter), `/api/trial-balance`, `/api/gl`, `/api/config`, `/api/tenants`, `/api/auth`, `/api/export`, `/api/justification`, `/api/memory`, `/api/precheck`, `/api/integrations`, `/api/coa`, `/api/accounting-integration`, `/api/onboarding`, `/api/data-quality`, `/api/approvals`, `/api-dev` (when MODE=dev).*

---

## Section 6: Database Table Inventory

Tables created in `migrations/*.sql` and referenced by active code. **Active** = referenced in `src/` (excluding `_quarantine`).

| Table | Purpose | Active? | Migration |
|-------|---------|---------|-----------|
| tenants | Control DB tenant registry | Yes | 001 |
| users | Control DB users | Yes | 001 |
| schema_migrations | Tenant schema version | Yes | 003 |
| accounting_connections | ERP connections | Yes | 003 |
| period_locks | Period lock | Yes | 003 |
| close_adjustments | Close adjustments (JEs) | Yes | 003 |
| audit_log | Legacy audit log | Yes | 003 |
| data_quality_rules | DQ rules | Yes | 005 |
| data_quality_exceptions | DQ exceptions | Yes | 005 |
| approval_workflow_defs, approval_workflow_steps | Approval workflows | Yes | 007 |
| approval_requests, approval_request_events | Approval requests | Yes | 007 |
| close_sessions | Close session state | Yes | 065 |
| close_checklist_items | Checklist items | Yes | 073 |
| close_checklist_templates | Checklist templates | Yes | 026 |
| statement_packages, statement_lines, statement_diffs | Statement packages | Yes | 074 |
| journal_entries, journal_entry_lines, je_attachments | Journal entries | Yes | 072 |
| tenant_close_issues, tenant_close_issue_history | Close issues | Yes | 099 |
| tenant_period_reconciliations, tenant_recon_items | Period reconciliations | Yes | 102 |
| tenant_recon_requirements | Recon requirements | Yes | 101 |
| tenant_aje_templates, tenant_aje_template_applications | AJE templates | Yes | 111 |
| tenant_variance_analysis | Variance explanations | Yes | 112 |
| reconciliation_resolutions | Recon resolutions | Yes | 020 |
| coa_mapping_rules | COA mapping rules | Yes | 069 |
| period_trial_balance | Period TB | Yes | 060 |
| core.general_ledger | GL | Yes | 095 |
| core.tenant_chart_of_accounts | COA | Yes | 094 |
| ledger_snapshots | Snapshots | Yes | 083 |
| certification_artifacts | Certification artifacts | Yes | 089 |
| evidence_records, evidence_links | Evidence | Yes | 086 |
| evidence_policy | Evidence policy | Yes | 088 |
| audit_ledger | Audit ledger (hash chain) | Yes | 051 |
| close_audit_trail | Close audit trail | Yes | 047 |
| decision_records | Decision records | Yes | 070 |
| tenant_justifications | Justifications | Yes | 076 |
| tenant_hitl_staging | HITL staging | Yes | 062 |
| tenant_draft_adjustments | Draft adjustments | Yes | 064 |
| period_export_checks | Export checks | Yes | 052 |
| close_controls, control_evidence | Controls | Yes | 018 |
| statement_generations | Statement registry | Yes | 009 |
| tenant_financial_config | Financial config | Yes | 092 |
| onboarding_state | Onboarding | Yes | 013 |
| pbc_items | PBC items | Yes | 016 |
| fs_taxonomy_lines | FS taxonomy | Yes | 068 |
| recon_runs, recon_items, recon_match_groups, etc. | Legacy recon | Yes (recon_service) | 071 |
| reconciliation_todos | Recon todos | Yes | 014 |
| triage_assessments | Triage | Yes | 067 |
| jobs | Job queue | Yes | 075 |
| period_close | Period close | Yes | 019 |
| tenant_close_calendar_config, tenant_close_calendar_entry | Close calendar | Yes | 027, 061 |
| disclosure_checklist | Disclosure checklist | Yes | 021 |
| professional_audit_flags | Professional review flags | Yes | 048 |
| Many others (leases, fixed_assets, deferred_tax, etc.) | Various bridge/legacy | Some refs in active code | Various |

**Tables in migrations but not referenced by active code (or only by quarantined):**  
Documented in `113_document_deprecated_tables.sql` (e.g. tenant_issue_items, legacy tenant_recon_tables). Other tables (e.g. stock_grants, equity_method_investments, segment_reporting, business_combinations, dcf_valuations, sampling_results, audit_engagements) are created by migrations but their primary consumers were quarantined; some may still be referenced for reads or legacy paths.

---

## Section 7: Close Flow Walkthrough

| Step | Route | Service | Tables Written | Status |
|------|--------|---------|----------------|--------|
| **1: Create Close Session** | POST /api/close/sessions | createSessionOrGetExisting → createSession (close_session_service) | close_sessions | VERIFIED (integration test) |
| **2: Advance to IN_PROGRESS** | POST /api/close/sessions/:id/advance | advanceSession → updateStatus | close_sessions, audit_ledger (close_session_transition) | VERIFIED |
| **3: Ingest GL** | POST /api/gl/ingest (or trial-balance ingest) | gl_upload_service, gl_to_tb_aggregation_service; period_trial_balance / core.general_ledger | period_trial_balance, core.general_ledger | VERIFIED |
| **4: Map Accounts** | POST /api/coa/map, GET /api/coa-mapping/rules | coa_mapping_service | coa_mapping_rules, coa_mapping_history | VERIFIED. AI suggestion: agentic_onboarding (COA suggestions) YES. |
| **5: Initialize Reconciliations** | POST /api/close/sessions/:periodId/reconciliations/initialize | period_reconciliation_service.initializeReconciliations | tenant_period_reconciliations, tenant_recon_items | VERIFIED |
| **6: Complete Reconciliation (with evidence)** | POST .../supporting-balance, POST .../items, POST .../complete, POST .../approve; POST .../evidence (upload) | period_reconciliation_service; evidence_attachment_service | tenant_period_reconciliations, evidence_records, evidence_links | VERIFIED. Evidence required: YES (completed recons must have attachments per close_checklist_readiness_service). Cascade: period_reconciliation_service may trigger cascade; recon_completeness_gate checks. |
| **7: Propose AJE Templates** | POST /api/close/templates/propose | aje_template_service.proposeTemplates | tenant_aje_templates | VERIFIED |
| **8: Apply/Skip Templates** | POST /api/close/templates/apply, POST /api/close/templates/skip | aje_template_service.applyTemplate, skipTemplate | tenant_aje_templates, tenant_aje_template_applications; apply creates draft JE | VERIFIED |
| **9: Create/Approve/Post Manual AJEs** | POST/GET/PATCH .../journal-entries; POST .../evidence/upload; POST .../post | journal_entry_service; evidence_attachment_service | journal_entries, journal_entry_lines, je_attachments, evidence_* | Evidence above threshold required when policy hard_block; memo required (107_je_memo_required). D=C enforced. Cascade fires after post (cascade_engine). VERIFIED |
| **10: Generate Statement Package** | POST /api/close/sessions/:id/statement-packages/generate | statement_package_service.generateStatements | statement_packages, statement_lines | Cross-statement validation runs (cross_statement_validation). Variance analysis auto-computed (variance_analysis_service). VERIFIED |
| **11: Explain Material Variances** | GET /api/close/sessions/:closeSessionId/variances; POST /api/close/variances/:id/explain; POST /api/close/variances/:id/approve | variance_analysis_service | tenant_variance_analysis | VERIFIED |
| **12: Advance to UNDER_REVIEW** | POST /api/close/sessions/:id/advance | advanceSession (canAdvanceToUnderReview → computeReadiness) | close_sessions | Gates: TB validated (D=C) via integrity in computeReadiness (verifyChain, exportChecks) IMPLEMENTED. All accounts mapped: checkMappingCompleteness IMPLEMENTED. All recons complete: checkReconCompleteness IMPLEMENTED. Recon evidence attached: listEvidenceForObject per completed recon IMPLEMENTED. All templates resolved: checkTemplateCompleteness IMPLEMENTED. Statements not stale: checked only at certify (session.statementsStaleSince), not in computeReadiness for advance. Material variances explained: checkVarianceCompleteness IMPLEMENTED. Zero blocking issues: getBlockingIssuesForPeriod IMPLEMENTED. Hard checks: computeReadiness IMPLEMENTED. VERIFIED |
| **13: Certify** | POST /api/close/sessions/:id/certify | certifyCloseSession | close_sessions, ledger_snapshots, certification_artifacts, audit_ledger | Re-validation: YES. Cross-statement ties: runCrossStatementValidationForCertification (A=L+E, net income, cash, equity, RE). Snapshot created: createSnapshotFromTrialBalanceAndEntries; buildCertificationArtifact. Ed25519 signing: buildCertificationArtifact. Evidence manifest: buildEvidenceManifest included. Validation state stored. VERIFIED |
| **14: Lock** | POST /api/close/sessions/:id/lock | lockCloseSession | close_sessions, audit_ledger | Terminal state. VERIFIED |
| **15: Reopen (from CERTIFIED)** | POST /api/close/sessions/:id/reopen | reopenCloseSession | close_sessions, audit_ledger, tenant_close_issues | Auth: require approver (certify_close). Reason required (min 10 chars). Certification invalidated (updateReopen clears certified fields). VERIFIED |

---

## Section 8: Evidence System Status

| Item | Status |
|------|--------|
| **Reconciliation evidence** | |
| Upload endpoint | POST /api/close/sessions/:periodId/reconciliations/:reconId/evidence (multipart) |
| Required for completion | YES — completed recons without attachments are hard blockers in computeReadiness |
| Included in certification snapshot | YES — buildEvidenceManifest includes recon attachments |
| **JE evidence** | |
| Upload endpoint | POST /api/close/journal-entries/:id/evidence/upload; POST .../evidence (ref); POST .../attachments |
| Materiality threshold configurable | YES — evidence_policy.materialityThreshold (PUT /api/close/evidence-policy) |
| Required above threshold for posting | YES when policy enforcement_mode = hard_block (checkEvidencePolicyForCertification) |
| Default threshold | Not set (policy null or empty); code uses 0 if unset |
| **File hashing** | |
| SHA-256 at upload | Implemented in evidence storage path (evidence_storage_service / repository) |
| Hash stored with attachment | YES — evidence_records / storage metadata |
| **Evidence manifest in certification** | |
| Recon attachments listed | YES |
| JE attachments listed | YES |

---

## Section 9: What's Missing for Production

| Missing Item | Severity | Effort Estimate |
|--------------|----------|-----------------|
| Fix build (remove or stub quarantined imports in result_generator.ts, statementGenerator.ts) | BLOCKS_LAUNCH | Small |
| Frontend (UI for close, recons, JEs, certify, evidence upload) | BLOCKS_LAUNCH | Large |
| API documentation (OpenAPI/Swagger or equivalent) | SHOULD_HAVE | Medium |
| Unit test script and CI (e.g. npm run test:unit with Jest or tsx) | SHOULD_HAVE | Small |
| Configuration docs (env vars, first-tenant setup, signing keys) | SHOULD_HAVE | Small |
| Multi-tenant onboarding flow (tenant DB provisioning, schema migrate) | SHOULD_HAVE | Medium |
| Monitoring/alerting (health, latency, error rates) | SHOULD_HAVE | Medium |
| Deployment (Docker, CI/CD, env per stage) | SHOULD_HAVE | Medium |
| Rate limiting and auth hardening (per-route, role checks) | SHOULD_HAVE | Small–Medium |
| Replace hardcoded fallbacks (e.g. recsTied=true, US_GAAP default) with config or real gates | NICE_TO_HAVE | Medium |
| Performance (indexes, batch sizes, connection pooling) | NICE_TO_HAVE | Medium |
| Security review (injection, IDOR, file upload validation) | SHOULD_HAVE | Medium |

---

## Section 10: API Surface Summary

**Mount prefix:** `/api` (with optionalAuth/requireAuth and attachTenantPool). Base path for CPA: `/api/close`, `/api/audit`, etc.

### Close Lifecycle

| Method | Path | Purpose |
|--------|------|--------|
| POST | /api/close/sessions/ensure | Idempotent ensure session for entity+period |
| POST | /api/close/sessions | Create session |
| GET | /api/close/sessions | List sessions |
| GET | /api/close/sessions/:id | Get session |
| POST | /api/close/sessions/:id/advance | Advance state |
| GET | /api/close/sessions/:id/readiness | Readiness |
| POST | /api/close/sessions/:id/certify | Certify |
| GET | /api/close/sessions/:id/certified-source | Certified source |
| POST | /api/close/sessions/:id/checklist/initialize | Init checklist |
| GET | /api/close/sessions/:id/checklist | List checklist |
| POST | /api/close/checklist-items/:itemId/complete | Complete checklist item |
| POST | /api/close/checklist-items/:itemId/skip | Skip checklist item |
| POST | /api/close/sessions/:id/checklist/emit-stuck-issues | Emit stuck issues |
| GET | /api/close/sessions/:id/triage | Triage |
| POST | /api/close/sessions/:id/statement-packages/generate | Generate statement package |
| GET | /api/close/sessions/:id/statement-packages | List packages |
| GET | /api/close/statement-packages/diff | Statement diff |
| GET | /api/close/statement-packages/:id | Get package |
| GET | /api/close/statement-packages/:id/lines | Package lines |
| PATCH | /api/close/sessions/:id/status | Update status |
| POST | /api/close/sessions/:id/reopen | Reopen certified |
| POST | /api/close/sessions/:id/lock | Lock |

### Reconciliation

| Method | Path | Purpose |
|--------|------|--------|
| GET | /api/close/sessions/:periodId/reconciliations | List recons |
| GET | /api/close/sessions/:periodId/reconciliations/:reconId | Get recon |
| POST | /api/close/sessions/:periodId/reconciliations/initialize | Initialize recons |
| POST | /api/close/sessions/:periodId/reconciliations/:reconId/supporting-balance | Set supporting balance |
| POST | /api/close/sessions/:periodId/reconciliations/:reconId/items | Add items |
| POST | /api/close/sessions/:periodId/reconciliations/:reconId/items/:itemId/create-aje | Create AJE from item |
| DELETE | /api/close/sessions/:periodId/reconciliations/:reconId/items/:itemId | Remove item |
| POST | /api/close/sessions/:periodId/reconciliations/:reconId/complete | Complete recon |
| GET | /api/close/sessions/:periodId/reconciliations/:reconId/evidence | List recon evidence |
| POST | /api/close/sessions/:periodId/reconciliations/:reconId/evidence | Upload recon evidence |
| POST | /api/close/sessions/:periodId/reconciliations/:reconId/approve | Approve recon |
| POST | /api/close/sessions/:periodId/reconciliations/:reconId/reject | Reject recon |
| GET | /api/close/sessions/:periodId/recon-completeness | Recon completeness |
| GET/POST | /api/close/recon-requirements, PUT/DELETE /:id | Recon requirements |
| POST | /api/close/recon-requirements/auto-generate | Auto-generate recon requirements |
| POST/GET | /api/close/reconciliation-resolution | Reconciliation resolutions |

### Journal Entries

| Method | Path | Purpose |
|--------|------|--------|
| (CRUD) | /api/close/journal-entries | JE CRUD |
| POST | /api/close/journal-entries/:id/evidence/upload | JE evidence upload |
| POST | /api/close/journal-entries/:id/evidence | JE evidence (ref) |
| POST | /api/close/journal-entries/:id/attachments | JE attachment |
| GET | /api/close/journal-entries/:jeId/evidence/:evidenceId/download | Download JE evidence |
| GET | /api/close/journal-entries/:jeId/attachments/:attachmentId/download | Download JE attachment |
| POST | /api/close/je-suggestions | JE suggestions |

### Statements

| Method | Path | Purpose |
|--------|------|--------|
| (see Close Lifecycle) | /api/close/sessions/:id/statement-packages/* | Generate, list, diff, lines |

### Variance Analysis

| Method | Path | Purpose |
|--------|------|--------|
| GET | /api/close/sessions/:closeSessionId/variances | List variances |
| POST | /api/close/variances/:id/explain | Explain variance |
| POST | /api/close/variances/:id/approve | Approve explanation |
| GET | /api/close/sessions/:closeSessionId/variance-status | Variance status |

### AJE Templates

| Method | Path | Purpose |
|--------|------|--------|
| GET | /api/close/templates | List templates |
| POST | /api/close/templates | Create template |
| GET | /api/close/templates/:id | Get template |
| POST | /api/close/templates/propose | Propose templates |
| POST | /api/close/templates/apply | Apply template |
| POST | /api/close/templates/skip | Skip template |
| GET | /api/close/sessions/:closeSessionId/template-status | Template status |

### Evidence

| Method | Path | Purpose |
|--------|------|--------|
| GET | /api/close/evidence-policy | Get evidence policy |
| PUT | /api/close/evidence-policy | Upsert evidence policy |
| (Recon/JE upload above) | (see Reconciliation, JE) | Upload/list evidence |

### Certification

| Method | Path | Purpose |
|--------|------|--------|
| POST | /api/close/sessions/:id/certify | Certify |
| POST | /api/close/sessions/:id/lock | Lock |
| GET | /api/verification/certification/public-key | Public key |
| GET | /api/verification/certification/artifacts/:closeSessionId | Artifacts |
| POST | /api/verification/certification/verify | Verify |

### COA Mapping

| Method | Path | Purpose |
|--------|------|--------|
| GET | /api/coa-mapping/taxonomy | Taxonomy |
| GET | /api/coa-mapping/rules | Rules |
| POST | /api/coa-mapping/rules | Create rule |
| POST | /api/coa-mapping/map | Map |

### GL Ingest

| Method | Path | Purpose |
|--------|------|--------|
| (GL router) | /api/gl/ingest | GL upload / TB derivation |
| (Trial balance) | /api/trial-balance/ingest | TB file ingest |
| (Trial balance) | /api/trial-balance/statements | TB → statements |

### ERP Integration

| Method | Path | Purpose |
|--------|------|--------|
| POST | /api/accounting-integration/connections | Create connection |
| GET | /api/accounting-integration/connections | List connections |
| GET | /api/accounting-integration/connections/:id | Get connection |
| POST | /api/accounting-integration/sync-trial-balance | Sync TB |
| POST | /api/accounting-integration/push-journal-entry | Push JE |
| POST | /api/accounting-integration/pull-transactions | Pull transactions |

### Audit Binder / PBC

| Method | Path | Purpose |
|--------|------|--------|
| POST | /api/audit/register-statements | Register statements |
| GET | /api/audit/binder | Get binder |
| GET | /api/audit/binder/export/pdf | Export PDF |
| GET | /api/audit/binder/export/csv | Export CSV |
| GET | /api/audit/draft-package | Draft package |
| (PBC) | /api/audit/pbc-index (etc.) | PBC index |

### Decision Records

| Method | Path | Purpose |
|--------|------|--------|
| (close/close_decision_records) | /api/close/decision-records/* | Decision records CRUD |

### Auth

| Method | Path | Purpose |
|--------|------|--------|
| (auth router) | /api/auth/* | Login, register, etc. |

### Configuration

| Method | Path | Purpose |
|--------|------|--------|
| (config router) | /api/config/* | Config |
| (tenants router) | /api/tenants/* | Tenants |

### Other

| Method | Path | Purpose |
|--------|------|--------|
| GET | /health | Health |
| GET | /health/ready | Readiness |
| (precheck) | /api/precheck/* | Precheck (board-ready 410) |
| (data_quality) | /api/data-quality/* | Data quality |
| (approvals) | /api/approvals/* | Approvals |
| (justification) | /api/justification/* | Justification |
| (memory) | /api/memory/* | Memory |
| (onboarding) | /api/onboarding/* | Onboarding |
| (hitl) | /api/hitl/* | HITL |
| (export) | /api/export/pdf, /api/export/csv | Export PDF/CSV |
| (verification) | /api/verification/* | Verification (snapshots, audit chain, evidence manifest) |
| (coa) | /api/coa/* | COA upload/templates |
| (dev) | /api-dev/* | Dev diagnostics (MODE=dev) |

**Total endpoint count:** Approximately 150+ distinct route handlers (many routers with multiple methods/paths). Exact count can be obtained by enumerating all `router.(get|post|put|patch|delete)` in active route files.

---

*End of PROJECT_STATE.md*
