# Codebase Inventory — Post-Refactoring Audit

**Date:** 2026-02-18  
**Scope:** Sovereign CPA Engine after 7-step refactoring. Read-only audit; no code changes.

---

## 1. Executive Summary

The codebase has a **working close lifecycle** from session create through certify and lock, with state machine, reconciliation gate, cascade engine, and audit ledger in place. **Two issue systems coexist:** `issue_item_service` (legacy `tenant_issue_items` / `issue_items`) is still used for create/list/readiness in several places, while `issue_service` (refactored `tenant_close_issues`) backs detect/verify/waive/reopen and blocking-issue checks. Readiness and certification therefore depend on both tables; migration 100 copies data from issue_items to tenant_close_issues but the app still writes to issue_items for manual creates. **Statement generation** is implemented for Balance Sheet and P&L (Income Statement) via `financialStatements.ts` and `statement_package_service`; Cash Flow exists in `cashFlow.ts` (indirect method) and is used in trial-balance/parser flows but **not** in the close-session statement-package path (which only flattens BS + P&L). **Variance analysis** and **mapping version history** tables exist; service wiring for mapping history on upsert is incomplete. **Unified audit:** `audit_service.recordAuditEvent` exists and `audit_ledger` has before/after state columns, but most callers still use `recordMaterialEvent` or deprecated `audit_log_service`; full migration to one audit path is not done. **Honest state:** Core close flow (create → advance → reconcile → AJE → statements → certify → lock) is wired and testable; gaps are dual issue stores, partial audit unification, no Cash Flow in statement packages, and several services/routes that are dormant or only partially wired.

---

## 2. Close Flow Readiness (Step-by-Step)

| Step | Action | Route | Service | Works? | Notes |
|------|--------|-------|---------|--------|-------|
| **1** | Create close session | `POST /api/close/sessions` | `close_session_service.createSessionOrGetExisting` | **YES** | Also `POST /api/close/sessions/ensure` for idempotent ensure. |
| **2** | Advance to IN_PROGRESS | `POST /api/close/sessions/:id/advance` | `close_session_service.advanceSession` | **YES** | OPEN→IN_PROGRESS allowed; further advance gated by readiness. |
| **3a** | Ingest TB (upload GL → derive TB) | `POST /api/gl/ingest` | `gl_upload_service.uploadGLForPeriod` → `gl_to_tb_aggregation_service.buildDerivedTrialBalance` → `trial_balance_store_service.saveUnadjustedFromGLDerived` | **YES** | Period-based; no closeSessionId. Adjusted TB for a session uses period + closeSessionId when fetching JEs. |
| **3b** | Ingest TB (upload TB file) | Trial-balance ingest under `/api/cpa/trial-balance` (complex pipeline) | `fileIngestion` / `trialBalanceParser` / `buildValidatedStatements` / persistence / bridge | **PARTIAL** | Heavy pipeline; can drive statements and staging. Link to close session is via period; no single “ingest TB for this close session” endpoint. |
| **4** | Map accounts (COA) | `GET/POST /api/coa-mapping/rules`, `POST /api/coa-mapping/map` | `coa_mapping_service.listCoaRules`, `upsertCoaRules`, `applyCoaRulesToAccounts` | **YES** | Mapping version history table exists (migration 109); service does not yet write history on upsert. |
| **5** | Initialize reconciliations | `POST /api/close/sessions/:periodId/reconciliations/initialize` | `period_reconciliation_service.initializeReconciliations` | **YES** | Requires `entity_id` in body. Uses recon_requirements; creates period reconciliations. |
| **6a** | Set supporting balance | `POST /api/close/sessions/:periodId/reconciliations/:reconId/supporting-balance` | `period_reconciliation_service.setSupportingBalance` | **YES** | |
| **6b** | Add reconciling items | `POST .../reconciliations/:reconId/items` | `period_reconciliation_service.addReconcilingItem` | **YES** | |
| **6c** | Complete recon | `POST .../reconciliations/:reconId/complete` | `period_reconciliation_service.completeReconciliation` | **YES** | Cascade runs after. |
| **6d** | Approve recon | `POST .../reconciliations/:reconId/approve` | `period_reconciliation_service.approveReconciliation` | **YES** | |
| **7a** | Create draft JE | `POST /api/close/journal-entries` (via bridge) | `executeBridgeCommand` → `journal_entry_service.createDraftJE` | **YES** | Memo required (app + DB). |
| **7b** | Propose / Approve / Post JE | `POST .../journal-entries/:id/propose`, `.../approve`, `.../post` | Bridge → `proposeJE`, `approveJE`, `postJE` | **YES** | Cascade fires after post. |
| **8** | Generate financial statements | `POST /api/close/sessions/:id/statement-packages/generate` | `statement_package_service.generateStatements` → `getAdjustedTrialBalance` → `buildValidatedStatements` | **YES** | Produces **Balance Sheet** and **P&L (Income Statement)** only. No Cash Flow or Equity statement in package. |
| **9** | Variance analysis | No dedicated “variance analysis” route for close. | Triage/session risk and materiality live under `GET /api/close/sessions/:id/triage`. Narrative/explanation services exist (e.g. agentic_variance_drivers) but not a single close-step variance route. | **PARTIAL** | Variance explanation can be stored on recon (complete with variance_explanation). |
| **10** | Advance to UNDER_REVIEW | `POST /api/close/sessions/:id/advance` (when ready) | `advanceSession` uses `computeReadiness` | **YES** | Gates: checklist, cash rec, no critical/blocking issues, material JEs approved, integrity (audit chain, export checks), evidence policy, **recon_completeness_gate**. |
| **11** | Certification | `POST /api/close/sessions/:id/certify` | `close_session_service.certifyCloseSession` | **YES** | Re-validates, creates snapshot, builds certification artifact (Ed25519), stores certifiedSnapshotId. |
| **12** | Lock | `POST /api/close/sessions/:id/lock` | `close_session_service.lockCloseSession` | **YES** | Terminal state. |
| **13** | Reopen (CERTIFIED → IN_PROGRESS) | `POST /api/close/sessions/:id/reopen` | `close_session_service.reopenCloseSession` | **YES** | Requires reason (min 10 chars) and approver role; creates policy issue. |

**Gates implemented for advance to UNDER_REVIEW (canAdvanceToUnderReview / computeReadiness):**

- **TB validated (D=C):** YES — via audit chain verification and export checks (rounding/materiality).
- **All accounts mapped:** Not an explicit gate in readiness; statement generation and certification use whatever mapping exists.
- **All recons complete:** YES — `recon_completeness_gate.checkReconCompleteness` in `close_checklist_readiness_service`.
- **All recurring AJEs posted:** Not explicitly named; readiness checks “no draft/proposed JEs” (materialJesApproved).
- **Statements generated and valid:** Not a hard gate; readiness does not require statement package.
- **All hard checks passing:** YES — integrity, evidence policy, recon completeness, no critical/blocking issues.
- **Zero blocking issues:** YES — `getBlockingIssuesForPeriod` (issue_service, tenant_close_issues) + listIssues (issue_item_service, issue_items) for critical.

**Cross-statement validation:** A = L + E and D = C are enforced in `certified_statements_service.buildCertifiedStatementsFromSnapshot` and `integrity_check.finalIntegrityCheck`. Net income tie and cash tie are not explicitly validated in the close certification path.

---

## 3. Service Inventory

Services under `src/services/` (selected; full list ~220+ files). Status: **ACTIVE** = on a code path from routes or wired services; **DORMANT** = not called by any route or active service; **DEAD** = superseded.

| File | What it does | Status | Wired | Tests | Notes |
|------|----------------|--------|--------|-------|------|
| `audit_service.ts` | Unified audit: recordAuditEvent, before/after state | ACTIVE | PARTIAL | NO | Exists; callers still use recordMaterialEvent / audit_log_service. |
| `audit_ledger_service.ts` | Hash-chained audit_ledger, recordMaterialEvent, verifyChain | ACTIVE | YES | YES | Used by close_session, export, checklist, JE, cascade. |
| `audit_log_service.ts` | Legacy audit log (appendAuditLog, queryAuditLog) | ACTIVE | PARTIAL | NO | Deprecated; still used by close_checklist, close_closing_entries, close_signoff_readiness, trial-balance ingest, export. |
| `journal_entry_service.ts` | Create/propose/approve/reject/post/export JE; memo validation | ACTIVE | YES | YES | Via bridge from close_journal_entries routes; cascade on post. |
| `cascade_engine.ts` | Sync recalc: adjusted TB, recon, statements stale, validation, issues | ACTIVE | YES | YES | Called from journal_entry_service, period_reconciliation_service. |
| `close_session_service.ts` | State machine, advance, certify, reopen, lock | ACTIVE | YES | YES | Central close lifecycle. |
| `close_checklist_readiness_service.ts` | computeReadiness, checklist init, emit stuck issues | ACTIVE | YES | YES | Gates advance; uses issue_item_service + issue_service. |
| `recon_completeness_gate.ts` | checkReconCompleteness for required recons | ACTIVE | YES | YES | Used by readiness and period_reconciliation_service. |
| `period_reconciliation_service.ts` | Init recons, supporting balance, items, complete, approve, reject | ACTIVE | YES | NO (integration only) | Wired to close_period_reconciliations routes; runs cascade. |
| `issue_item_service.ts` | CRUD for issue_items (legacy table) | ACTIVE | YES | YES | Create/list used by close_sessions, close_issues, close_checklist_readiness, close_session_service, export, trial-balance ingest. |
| `issue_service.ts` | tenant_close_issues: create, assign, resolve, verify, waive, getBlockingIssuesForPeriod | ACTIVE | YES | YES | Used by close_issues (unified actions), close_checklist_readiness (blocking), issue_detection, issue_auto_resolution. |
| `issue_detection_service.ts` | Run detection, create issues (issue_service) | ACTIVE | YES | NO | Called from close_issues route (POST /issues/detect). |
| `issue_auto_resolution_service.ts` | Auto-verify when conditions met | ACTIVE | PARTIAL | YES | Used by cascade/issue flow; may not run on every path. |
| `statement_package_service.ts` | Generate versioned statement packages (BS + P&L) for close session | ACTIVE | YES | YES | Close route generate + list/diff/get. |
| `certified_statements_service.ts` | Build certified statements from snapshot; Truth Gate | ACTIVE | YES | NO | Used by close_session_service.certifyCloseSession. |
| `financialStatements.ts` | buildValidatedStatements (BS + P&L), D=C and A=L+E | ACTIVE | YES | YES | Core statement engine. |
| `cashFlow.ts` | buildCashFlowStatement (indirect method) | ACTIVE | PARTIAL | NO | Used in trial-balance/parser and related flows; not in statement_package_service. |
| `adjusted_trial_balance_service.ts` | getAdjustedTrialBalance (unadjusted + JE adjustments by closeSessionId) | ACTIVE | YES | NO | Used by statement_package, certification, closing entries. |
| `gl_upload_service.ts` | Upload GL CSV, validate, store, derive TB | ACTIVE | YES | NO | POST /api/gl/ingest. |
| `gl_to_tb_aggregation_service.ts` | Aggregate GL to TB | ACTIVE | YES | NO | Used by gl_upload and GL ingest route. |
| `trial_balance_store_service.ts` | Save unadjusted TB (e.g. from GL derived) | ACTIVE | YES | NO | Used by gl_upload_service. |
| `coa_mapping_service.ts` | Taxonomy, listCoaRules, upsertCoaRules, applyCoaRulesToAccounts | ACTIVE | YES | YES | COA mapping routes; mapping history table exists but not written on upsert. |
| `recon_requirements_auto_generate.ts` | Auto-generate recon requirements from COA | ACTIVE | YES | NO | POST /api/close/recon-requirements/auto-generate. |
| `precheck_board_ready_service.ts` | Board-ready precheck | ACTIVE | PARTIAL | YES | Used by precheck route. |
| `integrity_gate_service.ts` | runIntegrityGate, plug detection, contra | ACTIVE | YES | YES | Used by financialStatements, audit professional review. |
| `ledger_snapshot_service.ts` | Create snapshot from TB + entries; verify hash | ACTIVE | YES | YES | Certification snapshot. |
| `certification_artifact_service.ts` | Build/sign certification artifact | ACTIVE | YES | YES | Certification flow. |
| `evidence_manifest_service.ts` | Build evidence manifest | ACTIVE | YES | NO | Certification. |
| `evidence_policy_service.ts` | checkEvidencePolicyForCertification | ACTIVE | YES | YES | Readiness and certify. |
| `segregation_service.ts` | canPerform (roles for certify/reopen) | ACTIVE | YES | NO | close_session_service. |
| `triage_service.ts` | getOrComputeTriage, materiality/risk | ACTIVE | YES | YES | GET /api/close/sessions/:id/triage. |
| `bridge/index.ts` (protocol_bridge) | executeBridgeCommand → JE lifecycle | ACTIVE | YES | YES | Close journal entry routes. |
| `month_end_close_service.ts` | buildJournalEntrySuggestions, createCloseChecklist | ACTIVE | PARTIAL | NO | close_je_accruals, close_checklist. |
| `checklist_store_service.ts` | getChecklist, setChecklist (period checklist) | ACTIVE | PARTIAL | NO | close_checklist. |
| `close_checklist_template_service.ts` | Template CRUD | ACTIVE | PARTIAL | NO | close_checklist. |
| `close_one_pager_service.ts` | buildCloseOnePager, export PDF | ACTIVE | PARTIAL | NO | close_one_pager_exceptions. |
| `close_exceptions_service.ts` | getCloseExceptions | ACTIVE | PARTIAL | NO | close_one_pager_exceptions. |
| `reconciliation_tie_out_service.ts` | buildReconciliationTieOut | ACTIVE | PARTIAL | NO | Audit reconciliation, close one pager. |
| `accrual_deferral_service.ts` | buildAccrualSuggestions, suggestAccrualsAgentic | ACTIVE | PARTIAL | NO | close_je_accruals. |
| `inventory_valuation_service.ts` | computeInventoryValuation | ACTIVE | PARTIAL | NO | close_je_accruals. |
| `close_adjustments_service.ts` | addJEAsAdjustments, closing flow | ACTIVE | PARTIAL | NO | close_closing_entries. |
| `closing_entries_service.ts` | buildClosingEntrySuggestion | ACTIVE | PARTIAL | NO | close_closing_entries. |
| `period_close_service.ts` | getOrCreatePeriodClose, setReviewerSignOff | ACTIVE | PARTIAL | NO | close_signoff_readiness. |
| `close_readiness_service.ts` | buildCloseReadiness | ACTIVE | PARTIAL | NO | close_signoff_readiness. |
| `close_status_service.ts` | buildCloseStatus | ACTIVE | PARTIAL | NO | close_signoff_readiness. |
| `decision_record_service.ts` | getDecisionRecord, listDecisionRecords | ACTIVE | PARTIAL | YES | close_decision_records. |
| `export_service.ts` | Export certified package | ACTIVE | YES | NO | export route. |
| `export_gate_service.ts` | checkExportGate | ACTIVE | YES | YES | export, audit_binder. |
| `integrity_check.ts` | finalIntegrityCheck | ACTIVE | YES | NO | certified_statements, export. |
| `integrity_conflict_service.ts` | detectIntegrityConflicts | ACTIVE | PARTIAL | NO | export. |
| `persistence_service.ts` | Staging, createStagingItem, etc. | ACTIVE | PARTIAL | NO | trial-balance parser, audit binder. |
| `hitl_orchestrator.ts` | shouldEscalateToHuman, submitToStaging | ACTIVE | PARTIAL | NO | trial-balance ingest. |
| `deterministic_pattern_detector.ts` | detectPatterns (GL) | ACTIVE | PARTIAL | NO | gl_upload_service. |
| `trial_balance_rollup_service.ts` | getUnadjustedOrRollup | ACTIVE | PARTIAL | NO | trial-balance parser. |
| `fileIngestion.ts` | ingestTrialBalanceFile | ACTIVE | PARTIAL | NO | trial-balance ingest. |
| `trialBalanceParser.ts` | parseTrialBalance | ACTIVE | PARTIAL | YES | trial-balance routes. |
| `accountClassifier.ts` | classifyTrialBalance, getClassificationSuggestions | ACTIVE | PARTIAL | YES | Parser, classification routes. |
| `ingestion_agent.ts` | runIngestionAgent | ACTIVE | PARTIAL | NO | ingestion route. |
| `ingestion_pipeline.ts` | buildIngestionPipeline | ACTIVE | PARTIAL | NO | ingestion route. |
| `onboarding_service.ts` | Onboarding state/steps | ACTIVE | PARTIAL | NO | onboarding route. |
| `agentic_onboarding.ts` | suggestCoAMappingAgentic, getFirstCloseGuideAgentic | ACTIVE | PARTIAL | NO | onboarding. |
| `bank_pipeline_service.ts` | runBankPipeline | ACTIVE | PARTIAL | NO | pipelines route. |
| `bank_reconciliation_service.ts` | Bank rec operations | ACTIVE | PARTIAL | NO | pipelines. |
| `agentic_bank_rec_service.ts` | Agentic bank rec | ACTIVE | PARTIAL | NO | pipelines. |
| `ap_ar_aging_service.ts` | buildApAgingReport, buildArAgingReport | ACTIVE | PARTIAL | NO | pipelines. |
| `payroll_accrual_service.ts` | buildPayrollAccrual | ACTIVE | PARTIAL | NO | pipelines. |
| `cash_position_service.ts` | buildCashPosition | ACTIVE | PARTIAL | NO | pipelines. |
| `accounting_integration_service.ts` | Connections, sync TB, push JE, pull txns | ACTIVE | PARTIAL | NO | accounting_integration route. |
| `data_quality_rule_service.ts` | Rules CRUD | ACTIVE | PARTIAL | NO | data_quality route. |
| `data_quality_exception_service.ts` | Exceptions, run, suggest remediation | ACTIVE | PARTIAL | NO | data_quality, trial-balance parser. |
| `justification_service.ts` | Chat, audit defense, list | ACTIVE | PARTIAL | YES | justification route. |
| `evidence_attachment_service.ts` | attachEvidenceToJournalEntry, attachEvidenceWithFile | ACTIVE | YES | NO | close_journal_entries. |
| `recon_service.ts` | Legacy recon (creates issue via issue_item_service) | ACTIVE | PARTIAL | YES | May overlap with period_reconciliation_service. |
| `ingestion_fetchers.ts` | runAllFetchers, runAllFetchersAndIngest | ACTIVE | PARTIAL | NO | ingestion route. |
| `ingestion_dedup_store.ts` | Dedup store | ACTIVE | PARTIAL | NO | Ingestion. |
| `fetcher_run_tracker.ts` | getUsage, getQuota | ACTIVE | PARTIAL | NO | ingestion route. |
| `integration_store.ts` | setIntegration, getIntegration, listIntegrations | ACTIVE | PARTIAL | NO | integrations route. |
| `audit_export_service.ts` | getCertifiedStatementsForBinder, registerStatementGeneration, recordPolicyChange | ACTIVE | PARTIAL | NO | audit_binder, pbc_index, trial-balance/classification. |
| `audit_binder_export_service.ts` | Binder export | ACTIVE | PARTIAL | NO | audit_binder. |
| `evidence_storage_service.ts` | Storage adapter | ACTIVE | YES | YES | Evidence upload/download. |
| `period_lock_service.ts` | assertPeriodNotLocked | ACTIVE | YES | NO | closing_entries, trial-balance parser. |
| `rules_registry.ts` | getRoundingTolerance | ACTIVE | YES | NO | financialStatements, certified_statements, trial-balance. |
| Many other agentic_* and domain services | Various (prior period, narratives, quality, etc.) | ACTIVE or DORMANT | PARTIAL/NO | Mixed | Not all called from close flow; many support audit/onboarding/pipelines. |

**DORMANT / DEAD (representative):**

- **audit_service.ts** — ACTIVE but PARTIAL: only unified entry point; most logging still goes to audit_ledger_service or audit_log_service.
- **recon_service.ts** — May duplicate period_reconciliation_service; both exist; recon_service uses issue_item_service.
- **tenant_issue_items vs tenant_close_issues** — Both in use; readiness uses both (listIssues from issue_items, getBlockingIssuesForPeriod from close_issues). No single “issues” store yet for close.

---

## 4. Route Inventory

Close and key routes only (full route set is large).

| File | Endpoints | Status | Notes |
|------|-----------|--------|-------|
| **close_sessions.ts** | POST/GET /sessions, POST /sessions/ensure, GET /sessions/:id, POST /sessions/:id/advance, GET /sessions/:id/readiness, POST /sessions/:id/certify, GET /sessions/:id/certified-source, POST/GET sessions/:id/checklist, POST checklist/emit-stuck-issues, POST checklist-items/:itemId/complete, POST checklist-items/:itemId/skip, GET /sessions, GET /sessions/:id/triage, POST/GET statement-packages, GET statement-packages/diff, GET statement-packages/:id, GET statement-packages/:id/lines, PATCH /sessions/:id/status, POST reopen, POST lock | WORKING | Full close lifecycle. |
| **close_journal_entries.ts** | POST/GET /journal-entries, GET postable, GET /:id, POST propose/approve/reject/post/export, validate-balanced/period/materiality, evidence upload/attach, attachments | WORKING | Via bridge; memo enforced. |
| **close_period_reconciliations.ts** | GET/POST sessions/:periodId/reconciliations, GET recon by id, POST supporting-balance, POST items, POST items/:itemId/create-aje, DELETE item, POST complete/approve/reject, GET recon-completeness | WORKING | :periodId is the close session id in path. |
| **close_recon_requirements.ts** | GET/POST /recon-requirements, PUT/DELETE /:id, POST auto-generate | WORKING | |
| **close_issues.ts** | POST/GET /issues, GET summary, POST detect, GET /:id, PATCH status/assign, POST assign/start/resolve/verify/waive/reopen | WORKING | Uses both issue_item_service (CRUD) and issue_service (summary, detect, verify, waive, reopen). |
| **gl/ingest.ts** | POST /ingest (GL CSV) | WORKING | Period query; no close session. |
| **trial-balance/ingest.ts** | Complex TB ingest pipeline | PARTIAL | Many dependencies; link to close is by period. |
| **coa_mapping.ts** | GET taxonomy, GET/POST rules, POST map | WORKING | |
| **verification/certification.ts** | GET public-key, GET artifacts/:closeSessionId, POST verify | WORKING | |
| **export.ts** | Export certified package | WORKING | Export gate, integrity, audit. |
| **precheck.ts** | Precheck board ready | WORKING | |
| **close_checklist.ts** | Checklist CRUD, templates, sign-off | WORKING | Different checklist model than sessions/:id/checklist (template vs session items). |
| **close_closing_entries.ts** | GET closing-entries, POST add | WORKING | |
| **close_je_accruals.ts** | Accrual suggestions, agentic JE suggestions, inventory valuation | WORKING | Stub-like for some agentic. |
| **close_signoff_readiness.ts** | POST sign-off, reviewer-sign-off, GET readiness, GET coach/status | WORKING | |
| **close_decision_records.ts** | GET decision-records, GET /:id | WORKING | |
| **close_audit_log.ts** | Audit log for close | WORKING | May use deprecated audit_log_service. |
| **close_one_pager_exceptions.ts** | One-pager, exceptions, tie-out narrative | WORKING | |
| **close_package.ts** | Close package | WORKING | |
| **close_adjustments.ts** | Adjustments | WORKING | |
| **close_evidence_policy.ts** | Evidence policy | WORKING | |
| **close_segregation.ts** | Segregation | WORKING | |
| **close_controls.ts** | Controls | WORKING | |
| **close_materiality_disclosure.ts** | Materiality/disclosure | WORKING | |
| **close_recon_runs.ts** | Recon runs | WORKING | Legacy bank recon runs. |
| **close_task_assign.ts** | Task assign | WORKING | |
| **close_period.ts** | Period | WORKING | |
| **audit/** (multiple) | Binder, PBC, prior period, reconciliation, professional review, etc. | WORKING / STUB | Many depend on certified source and evidence. |
| **ingestion.ts** | POST agent, pipeline, GET fetchers/status, POST fetchers/run, GET usage | WORKING | |
| **onboarding.ts** | state, steps, advance, entity-info, coa-import, suggest-coa-mapping, first-close-guide, first-tb-uploaded, first-close-completed | WORKING | |
| **pipelines.ts** | bank, ap-aging, ar-aging, payroll-accrual, bank-rec, cash-position | WORKING | |
| **accounting_integration.ts** | connections, sync-trial-balance, push-journal-entry, pull-transactions | WORKING | |
| **data_quality.ts** | rules, exceptions, run, summary, suggest-remediation | WORKING | |
| **justification.ts** | chat, audit-defense/summary|export, list | WORKING | |
| **auth.ts** | login, register | WORKING | |
| **config.ts**, **tenants.ts**, **dev_diagnostics.ts** | Config/tenant/diag | WORKING | |

---

## 5. Database State (Migrations)

| Migration | What it creates/modifies | Still relevant? | Notes |
|-----------|--------------------------|-----------------|-------|
| 051 | audit_ledger | YES | Hash chain; append-only triggers. |
| 065 | close_sessions | YES | Core close table. |
| 072 | journal_entries, journal_entry_lines | YES | JE immutability triggers (105, 106). |
| 094 | tenant_chart_of_accounts | YES | normal_balance added in 108. |
| 095 | general_ledger | YES | GL ingest. |
| 060, 096 | period_trial_balance, gl_derived_source | YES | TB storage. |
| 069 | coa_mapping_rules | YES | Mapping history in 109. |
| 068 | fs_taxonomy_lines | YES | |
| 071 | tenant_recon_tables (legacy recon) | PARTIAL | Legacy; period reconciliations in 102. |
| 101 | tenant_recon_requirements | YES | |
| 102 | tenant_period_reconciliations | YES | |
| 099 | tenant_close_issues | YES | Refactored HITL. |
| 100 | migrate issue_items → tenant_close_issues | YES | Data migration; issue_items still written by app. |
| 066 | tenant_issue_items | PARTIAL | Legacy; still used by issue_item_service. |
| 062 | tenant_hitl_staging_and_supervisor_sessions | PARTIAL | Migration 100 says cannot migrate (no period_id); staging may be legacy. |
| 073 | tenant_close_checklist_items | YES | Session checklist. |
| 074 | statement_packages | YES | |
| 083 | ledger_snapshots | YES | Certification. |
| 089 | certification_artifacts | YES | |
| 091 | append_only_triggers | YES | audit_ledger, etc. |
| 104 | audit_ledger before_state, after_state | YES | |
| 105, 106 | JE immutability (entries + lines) | YES | |
| 107 | je_memo_required | YES | |
| 108 | normal_balance on tenant_chart_of_accounts | YES | |
| 109 | coa_mapping_history | YES | Append-only; service not yet writing on mapping change. |

**Tables to consider dropping (future):** `tenant_issue_items` (after full migration to tenant_close_issues and dual-write removal); `tenant_hitl_staging` if no longer used. Not dropped in this audit.

---

## 6. Dead Code and Cleanup

**FILES TO REMOVE (after migration):**

- None removed in this audit. Recommended after full issue migration: deprecate `issue_item_service` and `issue_item_repository` once all callers use `issue_service` and `tenant_close_issues` only.

**FILES TO MODIFY (remove dead exports / consolidate):**

- `audit_log_service.ts` — Mark all exports deprecated; migrate remaining callers to `audit_service.recordAuditEvent` (and audit_ledger where appropriate). Then remove file in a later release.
- `close_issues.ts` (route) — Consolidate to one issue model: either route all CRUD to issue_service + tenant_close_issues and stop writing to issue_items, or maintain explicit dual-write and document it.

**TABLES TO DROP (future migration):**

- `tenant_issue_items` (or `issue_items` if that is the actual name) — After issue_item_service is removed and all data/behavior lives in tenant_close_issues.
- `tenant_hitl_staging` — Only if confirmed unused; migration 100 left it in place.

**DEPRECATED CODE TO CLEAN UP:**

- `audit_log_service` — Full migration of callers to unified audit_service + audit_ledger (with before/after state).
- **Mapping version history** — Table and triggers exist; `coa_mapping_service.upsertCoaRules` (or equivalent) should insert into `coa_mapping_history` on create/update and close previous version.

---

## 7. Missing Pieces

**MISSING — Required for MVP:**

1. **Single issue store for close** — Readiness and UI use both issue_items and tenant_close_issues. Unify so one source of truth (tenant_close_issues) and one service (issue_service) for close-scoped issues.
2. **Unified audit call path** — Every financial mutation should call `audit_service.recordAuditEvent` (or equivalent) with before/after state; today many still use `recordMaterialEvent` without before/after or use deprecated `audit_log_service`.
3. **Cash Flow in statement package** — `statement_package_service` only flattens BS + P&L. Cash Flow Statement (and optionally Statement of Equity) should be generated and stored in the same package for close.
4. **COA mapping history on upsert** — When a mapping rule is created/updated, insert/close version in `coa_mapping_history` and record audit event.

**MISSING — Nice to have:**

1. **Explicit “all accounts mapped” gate** — Readiness could require every account in the period TB to have a mapping (or explicit “unmapped” handling).
2. **Net income tie / cash tie checks** — In certification or statement package, validate net income ties to equity and cash ties to BS.
3. **Variance explanation as first-class step** — Dedicated route/service for variance analysis and explanation storage (beyond recon variance_explanation).
4. **Central validation check registry** — Single list of hard/soft checks used by readiness and certification (today spread across close_checklist_readiness_service and integrity checks).

**PARTIALLY BUILT — Needs completion:**

1. **Contra-balance using normal_balance** — Migration 108 added `normal_balance`; integrity_gate or validation should use it explicitly instead of inferring from account_type (and support contra accounts).
2. **Full close flow test** — `tests/integration/full_close_flow.test.ts` exists and covers several steps; extend to cover full path through certify and lock and audit chain verification.
3. **Query/purge in audit_log_service** — queryAuditLog and purgeRetention should be marked deprecated if not already.

---

## 8. Configuration Gaps

| Configuration | Where defined | Default? | Per-entity? | Notes |
|----------------|---------------|----------|-------------|-------|
| **Reporting taxonomy / line items** | fs_taxonomy_lines (068), shared config (e.g. financial_rules.json) | Yes (taxonomy in DB) | Not per-entity | Statement assembly uses taxonomy; subtotals (gross profit, operating income) depend on taxonomy structure. |
| **COA mapping rules** | coa_mapping_rules (069), coa_mapping_service | Yes | Yes (entityId) | Versioning and history table exist; history not yet written on change. |
| **Reconciliation requirements** | tenant_recon_requirements (101), recon_requirements_auto_generate | Yes (auto from COA) | Yes | Materiality threshold in auto-generate body. |
| **AJE templates (recurring)** | Not a dedicated table in scope | No | No | Recurring vs non-recurring is a JE source/type; no template CRUD in this audit. |
| **Approval thresholds / roles** | segregation_service, close role from request (getCloseRoleFromReq) | Yes (role-based) | Unclear | Dollar thresholds for JE approval not clearly configurable; roles from auth. |
| **Tolerance / materiality** | rules_registry (rounding), period_export_checks (materiality), recon tolerance per requirement | Yes | Partially | Recon tolerance per requirement (tolerance_amount, tolerance_type, tolerance_percentage). |
| **Evidence policy** | tenant_evidence_policy (088) | Yes | Yes | checkEvidencePolicyForCertification. |
| **Close checklist template** | tenant_close_checklist_templates (026), close_checklist_items (073) | Default items in code (CASH_REC, NO_CRITICAL_ISSUES, etc.) | Template per period type | initializeChecklistTemplate creates from DEFAULT_ITEMS. |

---

**End of inventory.** Use this document to prioritize next work: unify issues and audit, complete mapping history and Cash Flow in packages, then remove deprecated code and legacy tables.
