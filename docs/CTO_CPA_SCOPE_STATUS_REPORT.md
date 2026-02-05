# CTO + CPA Scope Status Report — Sovereign CPA Engine (Backend)

**Date:** 2025-02-04  
**Scope:** SOVEREIGN CPA ENGINE — FINAL SCOPE (backend only; no UI)  
**Method:** Code-level evidence (file paths, symbols, migrations, tests). No assumptions.

---

## 1) Executive Summary (10 lines)

1. **Entrypoints:** Single API server (`src/server.ts`), job worker (`runWorkerLoop` in same process), no standalone CLI for certification flow.
2. **Persistence:** Control DB (Postgres via `DATABASE_URL`) + per-tenant BYOD pools; 75 migrations (control + tenant), including `audit_ledger`, `period_trial_balance`, `journal_entries`, `jobs`, `tenant_hitl_staging`.
3. **Forge (staging):** Imbalanced ingest is routed to HITL staging and blocked from GL; `resolve-ingest` applies human-approved adjustment then writes to `period_trial_balance`.
4. **Truth Gate:** Export runs `checkExportGate` (audit ledger chain + period_export_checks) and `finalIntegrityCheck` (integrity gate + plug detection); discrepancy ≥ $0.01 (tolerance from `rules_registry`) blocks export.
5. **Protocol Bridge:** No single named "Protocol Bridge" type; mutations go through services (e.g. `accounting_integration_service.pushJournalEntry`, `period_trial_balance_repository`, `journal_entry_repository`). Push JE validates balance (0.01) server-side.
6. **Attribution:** `userId`/`actor`/`createdBy` used in HITL, export, close adjustments, approvals, audit_ledger; not every ledger row has an explicit agent/user tag in schema.
7. **Advisor scope violation:** `proposeTrialBalanceAdjustment` accepts `amount` in debits/credits from caller (LLM); scope forbids AI-supplied amounts — should be accounts + direction only, TS computes amounts.
8. **Justifier:** IRAC memos exist (`justification_service`: `justifyWithRAG`, `createIngestionIntegrityMemo`, `createBridgeAdjustmentJustification`); justifications are stored in-memory (`justificationStore`) unless persisted elsewhere — not durable per-adjustment in DB.
9. **Shadow Auditor:** Structural JE validation (balance, period, segregation) exists; no dedicated "scrutinize manual entries / flag deviations" agent layer before posting.
10. **Build:** Repo has pre-existing TypeScript errors (e.g. `Supervisor.ts`, `revenue_recognition_repository`, `export_gate_service.getQualitativeEvidenceMissing`, `audit_export_service.validateTrialBalanceAndBalanceSheet`); tests exist for integrity gate, export gate, audit ledger, job queue, JE service.

---

## 2) Repo Map (Entrypoints / Modules / Data Stores)

### Entrypoints

| Entrypoint | Path / Symbol | Evidence |
|------------|----------------|----------|
| API server | `src/server.ts` | Express app; `app.listen(PORT)`; mounts auth, trial-balance, justification, audit, export, ingestion, hitl, close, coa-mapping, approvals, accounting-integration, onboarding, tenants, cpa, dev_diagnostics. |
| Job worker | `src/services/job_worker.ts` → `runWorkerLoop()` | Called from `server.ts` after listen; polls `jobs` via `repo.claimNext`, runs `JOB_HANDLERS` from `job_handlers.ts`. |
| Ingestion scheduler | `src/services/ingestion_scheduler.ts` → `startIngestionScheduler()` | Called from `server.ts`; enqueues `ingestion_pipeline` jobs with idempotency. |
| CLI / scripts | `scripts/generateOpenAPI.ts`, `scripts/purge_audit_log.ts`, `scripts/smoke-*.mjs|.ps1` | Not certification entrypoints; OpenAPI gen, audit purge, smoke tests. |

### Persistence

| Store | Evidence |
|-------|----------|
| Control DB | `src/db/index.ts`: `getControlPool()`, `queryControl()`; migrations 001–002, 010 (scheduler_lock), 075 (jobs). |
| Tenant DBs | `getTenantPool(tenantId)`; tenant migrations 003–074 (e.g. 051 audit_ledger, 060 period_trial_balance, 062 tenant_hitl_staging, 065 close_sessions, 072 journal_entries, 074 statement_packages, 052 period_export_checks). |
| Migrations | `src/db/migrate.js` + `src/db/index.ts` version list (e.g. 062_tenant_hitl_staging_and_supervisor_sessions.sql). |

### Core Modules (Scope-Relevant)

| Area | Paths / Symbols |
|------|------------------|
| Ingestion | `src/services/fileIngestion.ts` (parseCsvToTrialBalance, parseXlsxToTrialBalance), `src/services/trial-balance/parser_utils.ts` (standardizeColumns, standardizedRowsToTrialBalanceRows), `src/routes/trial-balance/ingest.ts`. |
| Forge / staging | `src/types/hitl.ts`, `src/services/hitl_orchestrator.ts` (submitToStaging, shouldEscalateToHuman), `src/routes/hitl.ts` (POST /staging, POST /resolve-ingest), persistence_service for staging when pool/tenantId. |
| Integrity / Truth Gate | `src/services/integrity_gate_service.ts` (runIntegrityGate, assertIntegrityGateOrThrow), `src/services/integrity_check.ts` (finalIntegrityCheck), `src/services/export_gate_service.ts` (checkExportGate, verifyChain), `src/services/rules_registry.ts` (getRoundingTolerance = 0.01). |
| Audit ledger | `src/db/repositories/audit_ledger_repository.ts` (appendEntry, verifyChain), `src/services/audit_ledger_service.ts` (recordOverride, recordMaterialEvent, verifyChain), migration 051_audit_ledger.sql. |
| Attribution | `src/routes/hitl.ts` (approvedBy: authReq.userId), `src/routes/export.ts` (createdBy: userId), `src/services/close_adjustment_update_service.ts` (actorUserId), `src/db/repositories/audit_ledger_repository.ts` (created_by). |
| JE / close | `src/services/journal_entry_service.ts` (createDraftJE, proposeJE, approveJE, postJE), `src/services/period_lock_service.ts` (assertPeriodNotLocked), `src/services/close_checklist_readiness_service.ts` (computeReadiness, hard/soft blockers). |
| Export / Binder | `src/routes/export.ts` (POST /pdf, POST /csv), `src/services/audit_export_service.ts` (buildAuditBinder, registerStatementGeneration), `src/services/justification_service.ts` (getJustificationsForPeriod, createIngestionIntegrityMemo). |
| Jobs | `src/services/job_worker.ts`, `src/services/job_handlers.ts` (ingestion_pipeline, agentic_cleanup, statement_generation), `src/db/repositories/job_repository.ts` (claimNext, idempotency_key). |
| Storage | `src/storage/index.ts` (getStorage), `src/storage/local_disk_storage.ts`; export route uses `getStorage().putObject()` when storeExport=1. |

---

## 3) Scope Violations (Evidence + Fix)

| Violation | Evidence | Fix |
|-----------|----------|-----|
| **Advisor supplies amounts** | `src/agents/tools/proposeTrialBalanceAdjustment.ts`: schema accepts `debits[].amount`, `credits[].amount` (z.number()); tool builds payload with those amounts and submits to staging. Caller can be LLM → AI-generated amounts reach staging. | Change Advisor to accounts + direction only: e.g. `debits: [{ account }]`, `credits: [{ account }]`; add a separate TS-only step that computes balancing amounts from current TB before submitting to staging, or require amounts to be entered by human in UI only. |
| **Justifications not durable per adjustment** | `src/services/justification_service.ts`: `justificationStore` is in-memory array; `getJustificationsForPeriod` filters it; `createIngestionIntegrityMemo` / `createBridgeAdjustmentJustification` push to same store. No tenant DB table for per-adjustment IRAC memos. | Persist justifications to tenant DB (e.g. tenant_justifications or link to audit_ledger/close_audit_trail); ensure every approved adjustment/JE has a corresponding justification row or audit_ledger event with memo ref. |
| **Missing symbols (build errors)** | `audit_export_service.ts`: `validateTrialBalanceAndBalanceSheet` not found. `export_gate_service.ts`: `getQualitativeEvidenceMissing` not found. Several services reference `disallowMemoryStoreInProduction` (env.ts) and `round2` (utils). | Implement or re-export `validateTrialBalanceAndBalanceSheet` (e.g. wrap runIntegrityGate + throw). Add or fix `getQualitativeEvidenceMissing` in export_gate_service. Ensure `round2` and `disallowMemoryStoreInProduction` are defined and imported where used. |

**Not violations (confirmed):**

- **AI numeric amounts in classifier outputs:** Guardrail `assertNoNumericAmountsInAgentOutput` in `src/llm/guardrails.ts` is used in `agentic_account_classifier.ts` and `agentic_ingestion_classifier.ts`.
- **Export without Truth Gate:** Export route calls `checkExportGate` then `finalIntegrityCheck` before PDF/CSV; both must pass.
- **Direct DB mutation bypass:** Ledger writes go through repositories invoked from services (trial_balance_store_service, hitl resolve-ingest → period_trial_balance; journal_entry_service → journal_entries). No raw SQL in routes for ledger.

---

## 4) Status Map (Built vs Partial vs Not Built)

| # | Capability | Status | Evidence | What's Missing | Risk if Missing |
|---|-------------|--------|----------|-----------------|-----------------|
| 1 | Ingestion (CSV/XLSX) deterministic parse | **BUILT** | `fileIngestion.ts`: parseCsvToTrialBalance, parseXlsxToTrialBalance; parser_utils standardizeColumns, standardizedRowsToTrialBalanceRows; ingest route uses them. | None for parse. | — |
| 2 | Forge staging that blocks imbalance | **BUILT** | Ingest: if absGt(totalDebits, totalCredits, tolerance) → submitToStaging, no save to period_trial_balance; buildFinancialStatements blocks when pending staging. hitl/resolve-ingest applies fix then saves. | Optional: explicit "Forge" naming in API. | Imbalanced data could reach GL. |
| 3 | Protocol Bridge (strict JSON, no hallucinated math) | **PARTIAL** | Push JE: accounting_integration_service.pushJournalEntry validates sum debits/credits within 0.01; adapters are mock. No single "Protocol Bridge" interface; mutations are service-mediated. | Formalize single bridge interface (e.g. PushJE, SaveTrialBalance) with strict JSON schema and no direct DB in routes. | Inconsistent contracts; risk of bypass. |
| 4 | Attribution (user/agent on every change) | **PARTIAL** | audit_ledger has created_by; HITL approval has approvedBy; export/close record userId. period_trial_balance has uploaded_by/synced_by; journal_entries has created_by/approved_by. Not every table has agent_id. | Add agent_id/origin to all mutation tables where applicable; ensure every ledger row traceable to actor. | Attribution gaps in audit. |
| 5 | Advisor JE proposal → Draft/HITL only (NO amounts) | **PARTIAL** | proposeTrialBalanceAdjustment submits to HITL staging; flow is Draft/HITL. Schema allows amounts from caller (see violation above). | Remove amount from Advisor output; TS or human supplies amounts only. | AI-generated amounts violate scope. |
| 6 | Shadow Auditor (scrutinize manual JEs before post) | **PARTIAL** | journal_entry_service: validateBalanced, proposeJE/approveJE/postJE with segregation (approved_by !== created_by). No agent that "flags deviations" or "blocks unsafe postings" beyond structural checks. | Add optional Shadow Auditor step: run checks (e.g. vs policy, materiality, unusual accounts) and record flags before post; block post if critical flag. | Manual error or override not flagged. |
| 7 | Justifier IRAC memo for every adjustment/JE | **PARTIAL** | justifyWithRAG, createIngestionIntegrityMemo, createBridgeAdjustmentJustification exist. Binder uses getJustificationsForPeriod. Store is in-memory; no DB link per adjustment. | Durable store per adjustment; ensure each approved JE/adjustment has an IRAC memo ref. | Memos lost on restart; no audit trail link. |
| 8 | Draft → Audit → Lock → Certify workflow states | **PARTIAL** | CloseSessionStatus: draft, in_progress, ready_for_review, finalized, locked. Period lock separate (period_lock_service). No single state machine enforcing order (e.g. Certify after Lock). | Enforce state transitions (e.g. cannot Certify until Locked); explicit Certify action that gates export. | Out-of-order actions possible. |
| 9 | Period lock (no edits after lock) | **BUILT** | period_lock_service: lockPeriod, isPeriodLocked, assertPeriodNotLocked. Ingest and parser call assertPeriodNotLocked; close_adjustment_update_service asserts. period_locks table. | None. | Edits after close. |
| 10 | Deterministic math (TB → statements) | **BUILT** | financialStatements.ts buildValidatedStatements, buildBalanceSheet, buildProfitAndLoss; uses rules_registry tolerance; buildFinancialStatements tool uses runIntegrityGate. | None. | Non-determinism in numbers. |
| 11 | Truth Gate ($0.01 blocks export) | **BUILT** | runIntegrityGate uses getToleranceForGate() (financial_rules.json, default 0.01). finalIntegrityCheck + checkExportGate before export; 422/403 on failure. | None. | Export of imbalanced data. |
| 12 | Audit ledger append-only + hash-chained | **BUILT** | audit_ledger_repository: appendEntry, getLatestHash, computeEntryHash(previousEntryHash); verifyChain. Migration 051. | None. | Tampering. |
| 13 | Audit Binder (statements + memos + hashes) | **PARTIAL** | buildAuditBinder (audit_export_service) uses statements, getJustificationsForPeriod, line-level links. Export PDF includes audit_trail. Chain verification is in gate, not necessarily "hashes in binder" doc. | Include latest chain hash or verification snippet in binder; ensure justifications are durable (see #7). | Binder not fully verifiable. |
| 14 | Statement versioning/diffs | **PARTIAL** | statement_packages have version, input_hash; statement_package_repository getLatestVersion. statement_registry for last generation. No explicit "diff" API in scope scan. | Document versioning; add diff endpoint if required. | Hard to prove what changed. |
| 15 | Close readiness (hard/soft blockers) | **BUILT** | close_checklist_readiness_service computeReadiness: hardBlockers (checklist, cash rec, critical issues, draft/proposed JEs, verifyChain, period_export_checks). Export route checks readiness when closeSessionId provided. | None. | Export before close ready. |
| 16 | Durable job queue + retries + idempotency | **BUILT** | jobs table; job_repository claimNext, retry with run_at backoff, dead-letter; idempotency_key for enqueue. job_worker runWorkerLoop. | None. | Lost jobs; duplicate work. |
| 17 | Storage for exports (no in-memory in prod) | **BUILT** | getStorage() (local_disk_storage default); export route putObject when storeExport=1. env disallowMemoryStoreInProduction for HITL/period lock. | S3/adapter for production if required. | Exports only in memory/disk. |
| 18 | Post-back safety (disabled or idempotent) | **PARTIAL** | Push to GL (push_close_to_gl_service) returns external_id; close_adjustments_posted_external_id migration. Idempotency on jobs. No explicit "post twice = same result" doc for GL push. | Document idempotency for GL push (e.g. by external_id); ensure retries safe. | Duplicate or inconsistent GL posts. |

---

## 5) End-to-End Certification Flow (Headless)

Exact API/service sequence and DB artifacts:

| Step | Action | Endpoint / Service | DB Artifacts |
|------|--------|---------------------|--------------|
| 1 | Ingest messy data | POST /api/trial-balance/ingest (CSV/XLSX) | If balanced: period_trial_balance (upsert), optional close_session; if imbalanced: tenant_hitl_staging row (no period_trial_balance). |
| 2 | Route imbalanced to Forge | (Same request) When imbalance detected, submitToStaging; return 422 + stagingId. | tenant_hitl_staging (type adjustment/journal_entry), pipeline_input_snapshot if session. |
| 3 | Refine via draft adjustments | POST /api/hitl/resolve-ingest with stagedId + adjustment lines; or approve staging item (POST /api/hitl/webhook / in-app approve). | On resolve-ingest: period_trial_balance updated; audit_ledger optional. On approve: staging status → approved, then merge into TB on next build. |
| 4 | Shadow Auditor checks | (No dedicated agent) JE flow: createDraftJE → proposeJE → approveJE → postJE. Validation in journal_entry_service. | journal_entries, journal_entry_lines; recordMaterialEvent if needed. |
| 5 | Lock period | POST /api/close/period-lock { periodLabel, lockedBy, reason }. | period_locks upsert. |
| 6 | Supervisor certify | (No single "certify" endpoint) Close session status can move to finalized/locked; readiness used at export. | close_sessions.status, sign-off via close_signoff_readiness if used. |
| 7 | Generate IRAC memos | POST /api/justification/chat (per question); createIngestionIntegrityMemo after ingest; createBridgeAdjustmentJustification after bridge adjustment. | In-memory justificationStore (see gap #7). |
| 8 | Generate statements | POST /api/trial-balance/statements or buildFinancialStatements tool with sessionId/tenantId; or statement_generation job. | statement_registry / statement_packages; close_audit_trail. |
| 9 | verifyChain + Truth Gate | Export route: checkExportGate(pool, tenantId, periodLabel) → verifyChain; then finalIntegrityCheck on request body totals. | Reads audit_ledger, period_export_checks. |
| 10 | Export Audit Binder | POST /api/export/pdf (body: financial_statements, clean_ledger, cover, …) or GET /api/audit/binder/export/pdf. | recordMaterialEvent(export_event); optional getStorage().putObject. |

**Order:** Ingest → (if staging) resolve-ingest/approve → period lock → readiness check → checkExportGate → finalIntegrityCheck → export. Close session readiness and periodLabel required when ENABLE_INTEGRATED_SUPERVISOR or when using closeSessionId.

---

## 6) Top 12 Prioritized Remaining Tasks

| # | Task | Why (CPA/Defensibility) | Files/Modules | Acceptance Criteria |
|---|------|-------------------------|---------------|---------------------|
| 1 | Remove Advisor-supplied amounts from proposeTrialBalanceAdjustment | Scope: AI must not produce amounts; only accounts + direction. | agents/tools/proposeTrialBalanceAdjustment.ts, agents/tools/index.ts, hitl_orchestrator/staging payload | Tool accepts accounts + direction only; amounts computed by TS from current TB or supplied by human only; guardrail rejects any amount in agent output for this tool. |
| 2 | Persist justifications per adjustment/JE | Every material change must have an auditable IRAC memo; in-memory loses on restart. | justification_service.ts, new tenant_justifications migration (or extend audit_ledger/close_audit_trail), routes that create adjustments/JEs | Each approved HITL item and each posted JE has a linked justification row; getJustificationsForPeriod reads from DB. |
| 3 | Fix build errors (validateTrialBalanceAndBalanceSheet, getQualitativeEvidenceMissing, round2, etc.) | Clean build required for deployment and CI. | audit_export_service.ts, export_gate_service.ts, revenue_recognition_repository, services using round2/disallowMemoryStoreInProduction | `npx tsc --noEmit` passes; all imports resolve. |
| 4 | Formalize Protocol Bridge (single JSON interface for mutations) | Single contract for all ledger/GL mutations; no hallucinated math. | New bridge module or accounting_integration + period_trial_balance + journal_entry entrypoints; routes call bridge only | All mutations go through bridge; strict JSON schema; no direct repo calls from routes for ledger. |
| 5 | Add Shadow Auditor step before JE post | Scrutinize manual entries; flag deviations; block unsafe postings. | journal_entry_service.ts or new shadow_auditor_service; optional agent that runs pre-post checks | Configurable checks (e.g. materiality, policy, unusual account); result recorded; post blocked if critical flag. |
| 6 | Enforce Draft → Audit → Lock → Certify state machine | Prevent out-of-order close actions; Certify gates export. | close_session_service, close_signoff_readiness, export route | Transitions validated; export requires Certified (or equivalent) state; documented state diagram. |
| 7 | Attribution: agent_id/origin on every ledger row | Full traceability for audit. | period_trial_balance_repository, journal_entry_repository, migrations, close_adjustments | Schema and code set created_by/approved_by/agent_id where applicable; docs. |
| 8 | Include chain hash or verification in Audit Binder export | Binder is cryptographically verifiable. | audit_export_service buildAuditBinder, pdf/export | Binder PDF or metadata includes latest entry_hash or verifyChain result. |
| 9 | Document and enforce idempotency for GL push | Safe retries; no duplicate posts. | push_close_to_gl_service, accounting_integration_service, migrations (external_id) | Push keyed by idempotency key or external_id; second push same key = no-op or same result. |
| 10 | HITL staging durability in production | Staging must not be in-memory in prod. | hitl_orchestrator.ts, persistence_service, 062_tenant_hitl_staging | When pool/tenantId present, staging always uses DB; disallowMemoryStoreInProduction enforced. |
| 11 | Statement versioning + diff API (if in scope) | Prove what changed between versions. | statement_package_repository, new route or audit_binder | API returns version list and diff between two versions (e.g. line-level). |
| 12 | End-to-end test: ingest → staging → resolve → lock → gate → export | Regression and pilot readiness. | tests/integration or tests/smoke | Single test: upload imbalanced CSV → staging → resolve-ingest → lock period → checkExportGate + finalIntegrityCheck pass → export PDF; assert artifacts in DB. |

---

*Report generated from code scan. Evidence is file/symbol/migration/test references; status may change as codebase changes.*
