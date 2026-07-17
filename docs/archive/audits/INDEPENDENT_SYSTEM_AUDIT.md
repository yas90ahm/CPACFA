# Independent System Audit

Evidence-only. No README, docs, or comments. Verifiable by code paths and tests.

---

## 1) What the system ACTUALLY does (business behavior)

- **Accepts CSV trial balances** — `POST /api/trial-balance/ingest` (upload.single('file')); `src/routes/trial-balance/ingest.ts` line 89.
- **Stages imbalanced data** — When `absGt(totalDebits, totalCredits, tolerance)`, `createStagingItem` is called; response `status: 'staged'`, `stagedId` returned; no write to period_trial_balance. `src/routes/trial-balance/ingest.ts` lines 167–252; `src/services/persistence_service.ts`.
- **Supports manual adjustments for staged ingest** — `POST /api/hitl/resolve-ingest` accepts `stagedId` and `adjustment` array; balance rechecked; then `executeBridgeCommand(..., ApplyHitlAdjustmentToTrialBalance)`. `src/routes/hitl.ts` lines 133–274.
- **Locks periods** — `POST /api/close/period-lock` calls `executeBridgeCommand(..., LockPeriod)`; period lock asserted in bridge before TB save and JE/HITL mutations. `src/routes/close/close_period.ts`; `src/bridge/protocol_bridge.ts`.
- **Certifies closes** — `POST /api/close/sessions/:id/certify` calls `certifyCloseSession`; allowed only when session.status === 'locked'; requires no hard blockers and approver role; writes to close_sessions and audit_ledger. `src/routes/close/close_sessions.ts` line 161; `src/services/close_session_service.ts` lines 153–203.
- **Exports financial statements (draft or certified)** — `POST /api/export/pdf` and `POST /api/export/csv`; certified path requires closeSessionId and session.status === 'certified', then `checkExportGate` and `finalIntegrityCheck`. `src/routes/export.ts`; `src/services/export_gate_service.ts`; `src/services/integrity_check.ts`.
- **Generates audit binder** — `GET /api/audit/binder`, `GET /api/audit/binder/export/pdf`, `GET /api/audit/binder/export/csv`; each requires `requireCertifiedSession` (query closeSessionId, session.status === 'certified') then `runBinderExportGates` (checkExportGate + finalIntegrityCheck). `src/routes/audit/audit_binder.ts` lines 26–67, 70–124, 143–203.
- **Runs AI classification on imbalanced ingest** — For staged imbalanced TB, `runClassifier` is called; result written to staging payload via `updateStagingPayload(..., { classification_results, ... })`. `src/routes/trial-balance/ingest.ts` lines 195–206; `src/ai/ai_orchestrator.ts` runClassifier.
- **Runs AI advisor proposals on imbalanced ingest** — After classifier, `runAdvisor` is called; proposals saved via `aiProposalsRepo.saveProposals` to tenant_ai_proposals. `src/routes/trial-balance/ingest.ts` lines 222–236; `src/ai/ai_orchestrator.ts` runAdvisor.
- **Runs shadow audit before JE post and before resolve-ingest apply** — `runPrePostChecksAndStore` (deterministic + runShadowAudit) before postJE; severity === 'block' throws and blocks. resolve-ingest calls `runShadowAudit` then applies bridge command only if not blocked. `src/services/journal_entry_service.ts` lines 135–146; `src/services/shadow_auditor_service.ts`; `src/routes/hitl.ts` lines 204–236.
- **Generates AI justification memo for posted JEs** — After postJE status update and recordMaterialEvent, `runJustifier` is called; result written via `createJustificationFromAI` to tenant_justifications. `src/services/journal_entry_service.ts` lines 173–194; `src/ai/ai_orchestrator.ts` runJustifier.

---

## 2) Technical systems implemented (with evidence)

- **Deterministic math enforcement** — Trial balance and balance sheet balance enforced; failure throws `MathematicalIntegrityError` (check 'A' or 'B'). Used in buildValidatedStatements, runIntegrityGate, validateBalanced. `src/services/financialStatements.ts` (lines 192–220, 242–271); `src/services/integrity_gate_service.ts` (runIntegrityGate, runIntegrityGateOrThrow); `src/services/journal_entry_service.ts` validateBalanced; `src/errors.ts` MathematicalIntegrityError.
- **Protocol bridge** — Single mutation path: Zod-validated commands (SaveTrialBalance, CreateDraftJE, ProposeJE, ApproveJE, PostJE, ApplyHitlAdjustmentToTrialBalance, LockPeriod); period lock asserted where applicable; every mutation recorded via recordMaterialEvent. `src/bridge/protocol_bridge.ts` (bridgeCommandSchema, executeBridgeCommand); `src/bridge/index.ts` exports executeBridgeCommand.
- **Posting gate** — JE post: only status 'approved' → 'posted'; `runPrePostChecksAndStore` (Shadow Auditor) runs first; if severity === 'block', postJE throws JournalEntryError 'SHADOW_AUDIT_BLOCK'. `src/services/journal_entry_service.ts` postJE lines 124–146; `src/services/shadow_auditor_service.ts` runPrePostChecksAndStore.
- **Certification state machine** — Close session status transitions defined in ALLOWED_TRANSITIONS; certify only from 'locked'; computeReadiness hardBlockers must be empty; canPerform(actorRole, 'certify_close') required. `src/services/close_session_service.ts` lines 15–22, 153–203; `src/services/segregation_service.ts`.
- **Audit hash chain** — Entries appended with previous_entry_hash, entry_hash; verifyChain used before certified export. `src/services/audit_ledger_service.ts` (recordMaterialEvent, recordOverride, verifyChain); `src/db/repositories/audit_ledger_repository.ts`; `src/services/export_gate_service.ts` checkExportGate calls verifyChain.
- **Export gating** — Certified export and binder call checkExportGate (period_export_checks from DB, verifyChain, optional unresolved-conflicts check) and finalIntegrityCheck (runIntegrityGate + plug detection). Materiality read only from DB; no client-supplied materiality. `src/services/export_gate_service.ts`; `src/services/integrity_check.ts`; `src/routes/export.ts`; `src/routes/audit/audit_binder.ts`.
- **AI pillars** — Classifier: `src/ai/ai_orchestrator.ts` runClassifier; invoked in ingest for imbalanced TB; output written to staging payload. Advisor: runAdvisor; output saved to tenant_ai_proposals. Shadow: runShadowAudit in shadow_auditor_service (pre-post) and in hitl resolve-ingest; findings to tenant_shadow_audit_findings; block only when severity === 'block'. Justifier: runJustifier after postJE; output to tenant_justifications via createJustificationFromAI. All use callAIWithSchema / strict JSON schemas; ai_call_log repository logs calls.
- **DB tooling** — Migrations: control set (001, 002, 010, 075) in migrate.ts; tenant set (003–082) in index.ts runTenantMigrations. Schema verification: schema_verify.ts REQUIRED tables/columns; verify_schema.ts script exits non-zero on failure. Reset: reset_and_bootstrap.ts; requires ALLOW_DB_RESET or NODE_ENV=test; refuses URLs matching looksLikeProduction. `src/db/migrate.ts`; `src/db/index.ts`; `src/db/schema_verify.ts`; `src/db/verify_schema.ts`; `src/db/reset_and_bootstrap.ts`.
- **Tests** — Integration test: certification pipeline (imbalanced TB → staging → resolve-ingest → lock → certify → export gates → binder); verifyChain and DB artifacts asserted. Schema verified in tests/setup.ts beforeAll when DATABASE_URL set. Tests skip when !isDbConfigured(). `tests/integration/certification_pipeline.test.ts`; `tests/setup.ts` lines 20–28.

---

## 3) Explicit NON-capabilities

Inferred from absence of implementing code:

- **No general ERP** — No implemented GL ledger, AP/AR workflows, or inventory as a product core. Pipelines and close routes exist; no full double-entry ledger or vendor/customer ledgers as primary model.
- **No payments processing** — No payment capture, settlement, or payment-ledger modules in routes or services.
- **No forecasting engine** — No dedicated forecasting or projection service wired to routes; no forecast-specific persistence or APIs.
- **No automatic posting by AI** — Posting is only via bridge PostJE after human approve; AI never calls executeBridgeCommand or repo insert for journal_entries/period_trial_balance.
- **No AI math for totals** — Totals (debits, credits, assets, liabilities, equity) are computed only in TypeScript (financialStatements.ts, integrity_gate_service.ts, validateBalanced); AI returns classification, proposals, findings, or memo text only.
- **No client-controlled certification bypass in production** — exportBypassCertification in body/query is ignored when isProduction(); tampering_attempt is logged. `src/routes/export.ts` auditBypassFlagIfPresent.

---

## 4) Data integrity guarantees (provable only)

- **Imbalanced ledgers** — Prevented by: (1) buildValidatedStatements and runIntegrityGate throw MathematicalIntegrityError when totalDebits !== totalCredits or totalAssets !== totalLiabilities + totalEquity; (2) validateBalanced on JE lines at create/propose; (3) resolve-ingest rechecks sum(debits) === sum(credits) before bridge apply; (4) finalIntegrityCheck before certified export/binder. Evidence: `src/services/financialStatements.ts`; `src/services/integrity_gate_service.ts`; `src/services/journal_entry_service.ts`; `src/routes/hitl.ts` lines 183–192; `src/services/integrity_check.ts`.
- **Silent mutations** — All TB and JE mutations go through executeBridgeCommand or persistence_service; recordMaterialEvent or audit ledger append on mutations. No evidence of mutation paths that skip audit recording in the cited flow.
- **Exporting uncertified numbers as certified** — Prevented by: requireCertifiedSession (session.status === 'certified') for binder; certified export path checks session and runs checkExportGate and finalIntegrityCheck; production does not honor exportBypassCertification. Evidence: `src/routes/audit/audit_binder.ts` requireCertifiedSession, runBinderExportGates; `src/routes/export.ts` certified path and auditBypassFlagIfPresent.
- **Tampering** — Export gate reads materiality from period_export_checks (DB) only; verifyChain ensures audit ledger chain; bypass flag logged and ignored in production. Evidence: `src/services/export_gate_service.ts`; `src/routes/export.ts` lines 70–85.

---

## 5) AI layer analysis

- **Classifier** — Invoked in `src/routes/trial-balance/ingest.ts` when imbalanced TB is staged (lines 195–206). Returns structured results (object_type, fs_placement, suggested_accounts, rule_tags) per line; written only to staging payload via updateStagingPayload. Does not mutate period_trial_balance or journal_entries. On failure returns empty results (fail-open). Schema: ClassifierOutputSchema in `src/ai/schemas/classifier.schema.ts`. Calls logged via callAIWithSchema to ai_call_log.
- **Advisor** — Invoked in same ingest flow after classifier (lines 222–236). Returns proposals (lines with dr_account_key, cr_account_key, amount, amountProvenance); saved to tenant_ai_proposals only. Does not call bridge or post. On failure returns empty proposals (fail-open). Accepting adjustment amounts in resolve-ingest requires validateAdjustmentProposals (amountProvenance required): `src/types/amount_provenance.ts`; `src/routes/hitl.ts` lines 141–148.
- **Shadow Auditor** — Invoked in `src/services/shadow_auditor_service.ts` runPrePostChecksAndStore (pre-JE post) and in `src/routes/hitl.ts` before ApplyHitlAdjustmentToTrialBalance. Returns severity ('ok' | 'warn' | 'block') and findings; findings stored in tenant_shadow_audit_findings. Can block: when severity === 'block', postJE throws and resolve-ingest returns 403; does not mutate amounts or post. On AI failure: fail-open (warn), not block. Evidence: shadow_auditor_service.ts; hitl.ts lines 204–236; journal_entry_service.ts lines 144–146.
- **Justifier** — Invoked in `src/services/journal_entry_service.ts` after postJE status update and recordMaterialEvent (lines 173–194). Returns memo_markdown and irac_json; written via createJustificationFromAI to tenant_justifications. Runs after post; does not trigger or replace post. On failure placeholder can be used (justification_service creates from AI result or fallback).
- **AI cannot compute totals** — Evidenced: totalDebits/totalCredits and balance sheet totals are computed in `src/services/financialStatements.ts` and `src/services/integrity_gate_service.ts` using getRoundingTolerance and numeric logic; AI adapters return parsed JSON from schemas (classification, proposals, findings, memo). No AI code path calls buildValidatedStatements or runIntegrityGate.
- **AI cannot post** — Evidenced: PostJE is invoked only via executeBridgeCommand from routes (close journal entries, bridge); postJE is in journal_entry_service and is never called from ai_orchestrator or AI adapters. Adjustment apply is executeBridgeCommand(ApplyHitlAdjustmentToTrialBalance) only after human-supplied adjustment and validateAdjustmentProposals.

---

## 6) Production readiness (code-only)

- **Migrations** — Strong. Control and tenant migration sets exist; applied via schema_migrations; IF NOT EXISTS used in migration SQL (e.g. 001_initial.sql, 003_tenant_schema.sql). Server runs runMigrations() at startup when isDbConfigured(); on throw process.exit(1). `src/db/migrate.ts`; `src/server.ts` start().
- **Schema verification** — Strong. verifySchema in schema_verify.ts checks required tables and columns and audit_ledger index and journal_entry_lines FK; verify_schema.ts script exits 1 on failure; tests/setup.ts runs verifySchema in beforeAll when DATABASE_URL set and throws. `src/db/schema_verify.ts`; `src/db/verify_schema.ts`; `tests/setup.ts`.
- **Reset safety** — Strong. reset_and_bootstrap runs only when isAllowed() (NODE_ENV=test or ALLOW_DB_RESET=true) and refuses when looksLikeProduction(DATABASE_URL). `src/db/reset_and_bootstrap.ts` lines 42–46, 161–165.
- **Integration tests** — Strong. certification_pipeline.test.ts exercises full path; uses real DB when DATABASE_URL set; skips when !isDbConfigured(); setup runs schema verify. `tests/integration/certification_pipeline.test.ts`; `tests/setup.ts`.
- **Env config** — Adequate. DATABASE_URL, JWT_SECRET (required in production in auth/index.ts), NODE_ENV used; .env.example exists. No hardcoded secrets in code. JWT_SECRET check: `src/auth/index.ts` lines 12–14 throw if production and missing or default.
- **Failure modes** — Adequate. Migration failure exits process. Job worker catches errors and logs; continues loop; handler failures go to retry/dead-letter. Export gate and certification path are fail-closed (block on failure). Some non-fatal catches in ingest (decision record, issue creation) intentionally no-op; main response still 422 on MathematicalIntegrityError.

---

## 7) Security review (code-only)

- **Direct DB writes from routes** — Not evidenced. Mutations observed go through services (persistence_service, journal_entry_service, bridge, repos). Routes call executeBridgeCommand, service methods, or repos; no raw pool.query for INSERT/UPDATE/DELETE in route handlers for financial data.
- **Export bypass** — In production, exportBypassCertification is not honored; auditBypassFlagIfPresent logs tampering_attempt. `src/routes/export.ts` lines 70–85; isProduction() from `src/lib/env.ts`.
- **Auth enforcement** — In production (NODE_ENV=production) or when REQUIRE_AUTH !== 'false', useRequireAuth is true and /api uses requireAuth. Dev router /api-dev mounted only when !isProduction. `src/server.ts` lines 92–94, 99–101, 108–110.
- **Secrets** — JWT_SECRET, DATABASE_URL, API keys read from process.env. Logger redacts keys containing secret, password, token, key, authorization, cookie. `src/auth/index.ts`; `src/lib/logger.ts` redact.
- **Destructive scripts** — db:reset requires ALLOW_DB_RESET or NODE_ENV=test and refuses prod-like URL. db:seed:test has no production URL check (can insert into any DATABASE_URL). `src/db/reset_and_bootstrap.ts`; `src/db/seed_test.ts`.
- **Fail-open vs fail-closed** — Certified export and binder: fail-closed (gate failure → 403/422). Shadow Auditor: block only when severity === 'block'; AI failure → fail-open (warn). Classifier/Advisor: fail-open (empty results); do not block ingest.

---

## 8) Technical workflow (actual execution order)

1. **Ingest** — POST /api/trial-balance/ingest. parseTrialBalance; if imbalanced: createStagingItem (tenant_hitl_staging); runClassifier → updateStagingPayload; runAdvisor → aiProposalsRepo.saveProposals (tenant_ai_proposals). If balanced and periodLabel: executeBridgeCommand(SaveTrialBalance) → period_trial_balance; buildValidatedStatements used for response (throws MathematicalIntegrityError if A or B fails). `src/routes/trial-balance/ingest.ts`.
2. **Stage** — Staging item already created in ingest; GET /api/hitl/staging reads tenant_hitl_staging.
3. **Classify / Advisor** — Both run during ingest for imbalanced case; results in staging payload and tenant_ai_proposals.
4. **HITL** — POST /api/hitl/resolve-ingest: getStagingItem; validateAdjustmentProposals (amountProvenance); balance check (debits === credits); runShadowAudit; if severity === 'block' return 403; else executeBridgeCommand(ApplyHitlAdjustmentToTrialBalance). Tables: tenant_shadow_audit_findings (findingsRepo.createFinding); period_trial_balance and staging resolution via bridge and persistence. `src/routes/hitl.ts`.
5. **Shadow Audit** — For resolve-ingest: runShadowAudit before bridge. For JE post: runPrePostChecksAndStore (deterministic + runShadowAudit) inside postJE before status update.
6. **Post** — POST /api/close/journal-entries/:id/post → executeBridgeCommand(PostJE) → postJE. postJE: runPrePostChecksAndStore; if block throw; repo.updateJournalEntryStatus('posted'); recordMaterialEvent(je_posting); runJustifier; createJustificationFromAI → tenant_justifications. `src/services/journal_entry_service.ts`; `src/bridge/protocol_bridge.ts`.
7. **Lock** — POST /api/close/period-lock → executeBridgeCommand(LockPeriod); period_locks table; assertPeriodNotLocked used in bridge before SaveTrialBalance, ApplyHitlAdjustmentToTrialBalance, CreateDraftJE, ProposeJE, ApproveJE, PostJE.
8. **Certify** — POST /api/close/sessions/:id/certify → certifyCloseSession: session must be locked; computeReadiness hardBlockers empty; canPerform(certify_close); repo.updateCertification; recordMaterialEvent(certify_close).
9. **Export** — POST /api/export/pdf or /csv with certified path: session certified; checkExportGate (period_export_checks, verifyChain, optional conflicts); finalIntegrityCheck (runIntegrityGate, plug detection). Then PDF/CSV generated.
10. **Binder** — GET /api/audit/binder or binder/export/pdf|csv: requireCertifiedSession; runBinderExportGates (checkExportGate, finalIntegrityCheck); buildAuditBinder.

---

## 9) Business workflow (user journey)

- User uploads a trial balance file. If it does not balance, the system stores it in a staging area and returns a staging id; the user may see classification and proposal suggestions.
- User fixes the imbalance by submitting an adjustment (with required provenance) to the staging id; the system rechecks balance, runs a shadow audit, and if not blocked saves the corrected trial balance to the period.
- User can create and manage journal entries (draft → propose → approve → post). Posting runs a shadow check; if it blocks, the post is rejected. After a successful post, the system generates a justification memo.
- User locks the period, then certifies the close session (only from locked, with no hard blockers and with approver role).
- User requests certified export or audit binder; the server checks that the session is certified and runs the export gate and integrity check before returning the file or binder.
- Draft export is available with different rules; certified output is only after certification and gates.

---

## 10) Final independent verdict

**Pilot-ready system.**

Evidence: Deterministic balance enforcement and export/certification gates are implemented and tested. Mutations go through a single bridge and are recorded on the audit ledger; certified export and binder require certified session and server-side gates; production ignores certification bypass and enforces auth. AI is suggestion/validation only; amounts require provenance for adjustments; no AI posting or AI-computed totals. Migrations, schema verification, and reset guards are in place; integration test covers the certification pipeline; seed script has no production guard. Based strictly on code, this is not a prototype (full close and certification path exists) and not yet a hardened production-ready system (e.g. operational runbooks, backup strategy not evidenced in code). It fits a pilot: bounded scope, enforceable invariants, and identifiable gaps.
