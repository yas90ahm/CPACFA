# APP CURRENT STATE REPORT

**Backend-only snapshot. Evidence from code, migrations, and tests. No roadmap; current implementation only.**

---

## 1) What the app is (1 paragraph)

The backend is an **enterprise-grade agentic financial platform** that ingests trial balance (CSV/XLSX), enforces mathematical integrity (Debits = Credits, Assets = Liabilities + Equity) via a configurable Truth Gate (default $0.01 tolerance), and supports a human-in-the-loop (HITL) flow for imbalanced uploads. It creates and manages close sessions (draft → in_progress → ready_for_review → finalized → locked → certified), runs an append-only hash-chained audit ledger for overrides and material events, and gates all certified exports (PDF/CSV and Audit Binder) on certification plus chain verification and final integrity check. Draft exports are allowed with explicit watermark/disclaimer; certified exports and the Audit Binder are available only when the close session is certified and Truth Gate/chain checks pass. *(Evidence: `src/server.ts` description; `tests/integration/certification_pipeline.test.ts` end-to-end flow.)*

---

## 2) What problems it solves (bullets)

- **Imbalanced trial balance handling:** Uploads that fail balance check are staged (not written to `period_trial_balance`); human supplies adjustment via `POST /api/hitl/resolve-ingest`; math is re-verified before save. *(Evidence: `certification_pipeline.test.ts` steps 1–2; `src/routes/trial-balance/ingest.ts` staging; `src/routes/hitl.ts` resolve-ingest.)*
- **Provable correctness before persist:** Integrity gate (Truth Gate) and optional plug/Suspense detection block export when trial balance or balance sheet fails tolerance or when Suspense/Misc/Other absorb material activity. *(Evidence: `src/services/integrity_check.ts`, `src/services/integrity_gate_service.ts`; `shared/config/financial_rules.json` roundingTolerance 0.01.)*
- **Certified vs draft separation:** Certified export and Audit Binder require `closeSessionId` and `session.status === 'certified'`; no bypass in production; draft exports are watermarked and named so they cannot be confused with certified. *(Evidence: `src/routes/export.ts` exportMode + certified gate; `src/routes/audit/audit_binder.ts` requireCertifiedSession; `tests/integration/export_certified_gate.test.ts`.)*
- **Audit trail for overrides:** Hash-chained audit ledger records human overrides, material events, and observations; export gate verifies chain before certified export. *(Evidence: `src/services/audit_ledger_service.ts`, `src/db/repositories/audit_ledger_repository.ts`; `migrations/051_audit_ledger.sql`; `src/services/export_gate_service.ts` verifyChain.)*
- **Close lifecycle and certification:** Create session → checklist → status progression → period lock → certify; only certified sessions can drive certified export and binder. *(Evidence: `src/routes/close/close_sessions.ts`, `src/routes/close/close_period.ts`; `migrations/065_tenant_close_sessions.sql`, `078_close_sessions_certified.sql`.)*
- **Binder gating:** Audit Binder (GET `/api/audit/binder`, `/binder/export/pdf`, `/binder/export/csv`) requires certified session plus `checkExportGate` and `finalIntegrityCheck`; draft package is a separate endpoint with watermark. *(Evidence: `src/routes/audit/audit_binder.ts` runBinderExportGates, requireCertifiedSession; GET `/api/audit/draft-package`.)*

---

## 3) Core workflow (end-to-end)

**Ingest → Forge → Draft/HITL → Audit (Shadow Auditor) → Lock → Certify → Export**

| Step | Primary API endpoints (routes) | Key services/modules | DB tables touched |
|------|--------------------------------|----------------------|-------------------|
| **Ingest** | `POST /api/trial-balance/ingest` (or `/api-dev/trial-balance/ingest` in non-production); multipart CSV/XLSX | `fileIngestion`, `trialBalanceParser`, `buildValidatedStatements`, `createStagingItem` (imbalanced → staging) | `tenant_hitl_staging` (if imbalanced), `period_trial_balance` (if balanced or after resolve), `statement_registry`, `close_audit_trail` |
| **Forge** | Statement build is part of ingest pipeline; `registerStatementGeneration` after validated statements | `statementGenerator`, `buildValidatedStatements`, `registerStatementGeneration`, `audit_export_service` | `statement_registry` (tenant), `close_audit_trail` |
| **Draft/HITL** | `POST /api/hitl/resolve-ingest` (stagedId + adjustment); `POST /api/hitl/resolve` (approve/reject staging) | `persistence_service` (getStagingItem, ApplyHitlAdjustmentToTrialBalance), `parseTrialBalance`, `absGt` (tolerance), `validateAdjustmentProposals` (amountProvenance) | `tenant_hitl_staging`, `period_trial_balance`, `audit_ledger` (on override approvals) |
| **Audit (Shadow Auditor)** | Shadow auditor service and findings repo exist; integration with close/export is code-present | `shadow_auditor_service`, `tenant_shadow_audit_findings_repository` | `tenant_shadow_audit_findings` |
| **Lock** | `POST /api/close/period-lock` (periodLabel, lockedBy, reason); `PATCH /api/close/sessions/:id/status` (e.g. locked) | `period_lock_service`, close session status transitions | `period_locks`, `close_sessions` |
| **Certify** | `POST /api/close/sessions/:id/certify` (certifiedBy, periodLabel, memo) | `certifyCloseSession`, `close_session_service` | `close_sessions` (status certified, certified_by, certified_at, certification_memo) |
| **Export** | `POST /api/export/pdf`, `POST /api/export/csv` (body: exportMode, closeSessionId, …); certified requires session certified + checkExportGate + finalIntegrityCheck. `GET /api/audit/binder`, `/binder/export/pdf`, `/binder/export/csv` (query: closeSessionId); `GET /api/audit/draft-package` (draft only) | `checkExportGate`, `finalIntegrityCheck`, `createPdfFromStructuredPayload` / `createPdfFromHtml`, `exportAuditBinderToPdf` / `exportDraftPackageToPdf`, `buildAuditBinder`, `getLastStatementGeneration` | Read: `close_sessions`, `audit_ledger` (verifyChain), `period_export_checks`, `statement_registry`; write: `audit_ledger` (recordMaterialEvent on export) |

*(Evidence: `tests/integration/certification_pipeline.test.ts` (full pipeline); `src/server.ts` route mounts; `src/routes/export.ts`, `src/routes/audit/audit_binder.ts`, `src/routes/hitl.ts`, `src/routes/trial-balance/ingest.ts`, `src/routes/close/close_sessions.ts`, `src/routes/close/close_period.ts`.)*

---

## 4) What “deterministic” means in this codebase

- **Where math happens:** Trial balance totals and balance sheet equation checks use `absGt(totalDebits, totalCredits, tolerance)` and `absGt(totalAssets, liabilities + equity, tolerance)` with tolerance from `shared/config/financial_rules.json` (`roundingTolerance: 0.01`; equations reference `toleranceKey: "roundingTolerance"`). Plug detection uses a threshold (e.g. 0.9) on share of net activity in Suspense/Misc/Other accounts. *(Evidence: `src/services/integrity_gate_service.ts` runIntegrityGate, getToleranceForGate; `src/utils/decimal.js` absGt; `shared/config/financial_rules.json`.)*
- **What AI is allowed vs forbidden:** AI may suggest classifications and narratives; it may not supply exportable amounts without provenance. Adjustment amounts for resolve-ingest must have `amountProvenance` (e.g. human_entered, ledger_exact, engine_calculation); “Advisor may not invent or estimate amounts.” Materiality flags cannot be supplied by client; they are read only from `period_export_checks`. *(Evidence: `src/routes/hitl.ts` validateAdjustmentProposals; `src/types/amount_provenance.ts`; `src/routes/export.ts` bodyGate check for roundingGapExceedsMateriality/aggregateRoundingExceedsMateriality.)*
- **How amount provenance is enforced:** `validateAdjustmentProposals` (used in resolve-ingest) validates every non-zero amount has valid `amountProvenance`. Export path does not accept client-supplied materiality flags; Truth Gate uses server-side tolerance and optional `period_export_checks`. *(Evidence: `src/routes/hitl.ts` resolve-ingest; `src/services/export_gate_service.ts` getPeriodExportChecks.)*

---

## 5) Outputs (what users can get)

- **Draft exports (PDF/CSV):** Request with `exportMode: 'draft'` (default). No requirement for certified session. PDF includes: cover disclaimer “DRAFT — NOT CERTIFIED. This document is for internal/review use only…”; watermark “DRAFT — NOT CERTIFIED” on every page; footer with workflow state and generatedAt. If `ALLOW_IMBALANCED_DRAFT_EXPORT=true`, imbalanced draft is allowed and “IMBALANCED by $X.XX” is added to cover/watermark. Filenames: `Draft_Financials_NOT_CERTIFIED.pdf`, `Draft_Financials_NOT_CERTIFIED.csv`. *(Evidence: `src/services/pdf_export.ts` StructuredPdfPayload, createPdfFromStructuredPayload draft branch; `src/routes/export.ts` exportMode default 'draft', draft filenames; `src/lib/env.ts` ALLOW_IMBALANCED_DRAFT_EXPORT.)*
- **Certified exports (PDF/CSV):** Request with `exportMode: 'certified'`. Requires `closeSessionId`, `session.status === 'certified'`, `checkExportGate`, and `finalIntegrityCheck`. No watermark. Filenames: `Certified_Financials.pdf`, `Certified_Financials.csv`. Production ignores any `exportBypassCertification` and logs `tampering_attempt` if present. *(Evidence: `src/routes/export.ts` certified branch; `src/services/export_gate_service.ts`; `src/services/integrity_check.ts`; auditBypassFlagIfPresent.)*
- **Audit Binder (certified-only):** `GET /api/audit/binder`, `GET /api/audit/binder/export/pdf`, `GET /api/audit/binder/export/csv`. Require `closeSessionId` (query), `session.status === 'certified'`, `checkExportGate`, and `finalIntegrityCheck` (on last statement generation when present). No draft mode; no endpoint named “binder” serves draft. Filenames: `Audit_Binder-{period}.pdf` / `.csv`. *(Evidence: `src/routes/audit/audit_binder.ts` requireCertifiedSession, runBinderExportGates.)*
- **Draft package (not binder):** `GET /api/audit/draft-package`. Same content shape as binder but with DRAFT watermark/disclaimer; filename `Draft_Package_NOT_CERTIFIED.pdf`. Does not require certification. *(Evidence: `src/routes/audit/audit_binder.ts` GET draft-package; `src/services/audit_binder_export_service.ts` exportDraftPackageToPdf.)*
- **Chain verification artifacts:** Binder and export services use `verifyChain(pool, tenantId)`; result includes `valid`, `latestEntryHash`, `entryCount`, `verifiedAt`. Binder JSON includes `chainVerification` with these fields. *(Evidence: `src/services/audit_ledger_service.ts` verifyChain; `src/services/audit_export_service.js` buildAuditBinder chainVerification; `certification_pipeline.test.ts` assertions on binder.chainVerification.)*

---

## 6) Auditability & integrity

- **Audit ledger / hash chain:** Append-only table `audit_ledger`: `id`, `tenant_id`, `period_label`, `event_type`, `deterministic_flag_snapshot`, `agent_dissent_snapshot`, `user_prompt_rationale`, `previous_entry_hash`, `entry_hash`, `created_at`, `created_by`. Entries are hash-chained (SHA-256); v2 canonicalization uses sorted keys and normalized timestamps. No UPDATE/DELETE from application code. *(Evidence: `migrations/051_audit_ledger.sql`; `src/db/repositories/audit_ledger_repository.ts` appendEntry, getLatestHash, verifyChain; `079_audit_ledger_hash_version.sql`.)*
- **Truth Gate ($0.01) behavior:** `runIntegrityGate` uses tolerance from `financial_rules.json` (default `roundingTolerance: 0.01`). If |totalDebits − totalCredits| or |totalAssets − (L+E)| exceeds tolerance, gate fails and export is blocked (422 for export route; binder runBinderExportGates returns 422). Plug detection fails export when Suspense/Misc/Other absorb ≥ threshold (e.g. 90%) of net activity. *(Evidence: `src/services/integrity_gate_service.ts`; `src/services/integrity_check.ts`; `shared/config/financial_rules.json`.)*
- **Attribution (user/agent tagging):** Audit ledger has `created_by`; override entries require `userPromptRationale`. Justifications table has `created_by`, `created_by_type` ('user' | 'agent'). Export and HITL routes pass `(req as AuthRequest).userId` or similar into audit/log and ledger. *(Evidence: `src/services/audit_ledger_service.ts` RecordOverrideInput; `migrations/076_tenant_justifications.sql`; `src/routes/export.ts` recordMaterialEvent createdBy.)*
- **Justifications (IRAC) persistence:** Table `tenant_justifications`: `tenant_id`, `period_label`, `related_type`, `related_id`, `created_by`, `created_by_type`, `irac_json`, `memo_markdown`, etc. Linked to hitl_staging, close_adjustment, journal_entry, export, ingest. Audit binder and justification services read justifications for period. *(Evidence: `migrations/076_tenant_justifications.sql`; `src/services/justification_service.ts`; `src/services/audit_export_service.ts` getJustificationsForPeriod.)*

---

## 7) Production readiness for pilot

- **In place:** Migrations: 79 migration files (e.g. `001_initial.sql` through `079_audit_ledger_hash_version.sql`) for control DB and tenant schema. Scripts: `npm run db:migrate` (tsx src/db/migrate.ts), `npm run db:reset` (ALLOW_DB_RESET=true tsx src/db/reset_and_bootstrap.ts), `npm run db:verify` (tsx src/db/verify_schema.ts). Integration tests: `certification_pipeline.test.ts` (full pipeline E2E), `schema_smoke.test.ts` (verifySchema), `export_certified_gate.test.ts` (draft/certified/binder gates, production bypass ignored), `full_close_flow.test.ts`, `validation.test.ts`. Setup uses `schema_verify` before tests when DATABASE_URL is set. *(Evidence: `package.json` scripts; `tests/setup.ts`; `src/db/schema_verify.ts`; `tests/integration/certification_pipeline.test.ts`, `schema_smoke.test.ts`.)*
- **Environments/config required:** `DATABASE_URL` for Postgres (control DB); tenant records (with optional `database_url` for tenant DB). Auth: JWT (`REQUIRE_AUTH` / NODE_ENV; production always requires auth, no bypass). Optional: `ENABLE_INTEGRATED_SUPERVISOR`, `ALLOW_IMBALANCED_DRAFT_EXPORT`, `CORS_ORIGINS`/`CORS_ORIGIN`, `PORT`, `TRUST_PROXY`. Production: `NODE_ENV=production` disallows in-memory stores (env.ts disallowMemoryStoreInProduction). *(Evidence: `src/db/index.ts`; `src/lib/env.ts`; `src/server.ts`; `src/auth/middleware.js`.)*
- **Known limitations (evidenced in code/tests):** (1) Certification pipeline test uses `/api-dev/trial-balance/ingest` when not production, so production path for ingest is `/api/trial-balance/ingest`. (2) Binder and certified export depend on `getTenantPool`/tenant context; missing tenant/pool returns 403 or 400. (3) Schema smoke and certification pipeline skip cleanly when `DATABASE_URL` is not set; pilot requires configured DB. *(Evidence: `certification_pipeline.test.ts` ingestPath; `src/routes/audit/audit_binder.ts` requireCertifiedSession; `tests/setup.ts`.)*

---

## 8) Evidence appendix

| Category | Paths |
|----------|------|
| **Key route files** | `src/routes/export.ts`, `src/routes/audit/audit_binder.ts`, `src/routes/hitl.ts`, `src/routes/trial-balance/ingest.ts`, `src/routes/close/close_sessions.ts`, `src/routes/close/close_period.ts`, `src/routes/close/close_checklist.ts`, `src/server.ts` |
| **Key service files** | `src/services/export_gate_service.ts`, `src/services/integrity_check.ts`, `src/services/integrity_gate_service.ts`, `src/services/audit_ledger_service.ts`, `src/services/audit_export_service.ts`, `src/services/audit_binder_export_service.ts`, `src/services/pdf_export.ts`, `src/services/close_session_service.ts`, `src/services/period_lock_service.ts`, `src/services/persistence_service.ts`, `src/services/fileIngestion.ts`, `src/services/justification_service.ts` |
| **Key repositories** | `src/db/repositories/audit_ledger_repository.ts`, `src/db/repositories/close_session_repository.ts`, `src/db/repositories/period_export_checks_repository.ts`, `src/db/repositories/statement_registry_repository.ts`, `src/db/repositories/tenant_justifications_repository.ts`, `src/db/repositories/period_trial_balance_repository.ts` (or persistence for PTB), `src/db/repositories/tenant_shadow_audit_findings_repository.ts` |
| **Key migrations** | `051_audit_ledger.sql`, `052_period_export_checks.sql`, `060_period_trial_balance.sql`, `062_tenant_hitl_staging_and_supervisor_sessions.sql`, `065_tenant_close_sessions.sql`, `076_tenant_justifications.sql`, `078_close_sessions_certified.sql`, `079_audit_ledger_hash_version.sql` |
| **Key integration tests** | `tests/integration/certification_pipeline.test.ts`, `tests/integration/schema_smoke.test.ts`, `tests/integration/export_certified_gate.test.ts`, `tests/integration/full_close_flow.test.ts`, `tests/integration/validation.test.ts` |

---

*Report generated from codebase inspection. No new features proposed; state as implemented only.*
