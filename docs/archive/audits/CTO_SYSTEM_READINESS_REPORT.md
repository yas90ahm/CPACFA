# CTO System Readiness Report

Code-only audit. No docs/specs/comments trusted; only wired, reachable, tested, executable paths cited.

---

## 1) Business Capabilities (Plain English)

- **Accepts trial balances** — Upload CSV trial balance; system parses and validates. Balanced TB can be saved to period ledger; imbalanced TB is staged for human fix (`src/routes/trial-balance/ingest.ts`, `src/routes/trial-balance/parser.ts`).
- **Stages messy data** — Out-of-balance uploads create a staging item with raw rows and imbalance amount; no write to main ledger until human resolves (`createStagingItem` in `src/routes/trial-balance/ingest.ts`; `tenant_hitl_staging`).
- **Supports HITL adjustments** — Human can approve/reject staging items; for trial-balance ingest, human supplies adjustment lines; system re-checks balance then applies via bridge (`POST /api/hitl/resolve`, `POST /api/hitl/resolve-ingest` in `src/routes/hitl.ts`).
- **Generates draft statements** — From trial balance (and optional prior period), system builds balance sheet, P&amp;L, cash flow, ratios; draft export allowed with optional imbalance watermark when `ALLOW_IMBALANCED_DRAFT_EXPORT` is set (`src/routes/export.ts`, `src/services/financialStatements.ts`, `src/services/statementGenerator.ts`).
- **Generates certified statements** — Certified PDF/CSV export requires close session status `certified`, export gate (audit chain + materiality), and final integrity check (balance + plug detection); production ignores any bypass flag (`src/routes/export.ts`, `src/routes/audit/audit_binder.ts`, `checkExportGate`, `finalIntegrityCheck`).
- **Produces audit binder** — Certified-only binder: statements, source documents, reasoning deep links; same gates as certified export (`GET /api/audit/binder`, `GET /api/audit/binder/export/pdf`, `GET /api/audit/binder/export/csv` in `src/routes/audit/audit_binder.ts`).
- **Provides AI suggestions** — Classifier suggests account mappings for imbalanced TB (stored in staging payload); Advisor produces proposals saved to `tenant_ai_proposals`; Shadow Auditor blocks JE post and resolve-ingest when severity is `block`; Justifier generates memo/IRAC for posted JEs and stores in `tenant_justifications` (`src/ai/ai_orchestrator.ts`, ingest + HITL + `journal_entry_service.postJE`).

---

## 2) Technical Capabilities (Engineering Reality)

- **Deterministic math engine** — Trial balance and BS/P&amp;L balance enforced; imbalance throws `MathematicalIntegrityError` (422). `runIntegrityGate` in `src/services/integrity_gate_service.ts`; `buildValidatedStatements` in `src/services/financialStatements.ts`; `validateBalanced` in `src/services/journal_entry_service.ts`.
- **Forge/staging** — Imbalanced TB creates staging item via `createStagingItem`; HITL staging in `tenant_hitl_staging`; list/get via `getStagingArea`, `getStagingItem` (`src/services/persistence_service.ts`, `src/services/hitl_orchestrator.ts`).
- **Protocol bridge** — Single command surface: `SaveTrialBalance`, `ApplyHitlAdjustmentToTrialBalance`, `CreateDraftJE`, `ProposeJE`, `ApproveJE`, `PostJE`, `LockPeriod`. Period lock asserted before TB save, HITL apply, JE create/propose/approve/post. `src/bridge/protocol_bridge.ts`; `executeBridgeCommand` used by ingest, HITL, close journal routes.
- **Posting gates** — JE post: only `approved` → `posted`; Shadow Auditor runs before post and can block (`runPrePostChecksAndStore` in `src/services/shadow_auditor_service.ts`; `postJE` in `src/services/journal_entry_service.ts`). Balanced lines validated on create/propose.
- **Certification workflow** — Close session status: draft → in_progress → ready_for_review → finalized → locked → certified (only from locked). Certify requires no hard blockers (checklist readiness) and approver role. `certifyCloseSession` in `src/services/close_session_service.ts`; `POST /api/close/sessions/:id/certify` in `src/routes/close/close_sessions.ts`.
- **Audit chain** — Overrides and material events appended to audit ledger (hash-chained); `verifyChain` used by export gate. `src/services/audit_ledger_service.ts`, `src/db/repositories/audit_ledger_repository.ts`.
- **Exports** — PDF/CSV export: draft (optional imbalance allowed by env) vs certified. Certified path requires `closeSessionId` + session `certified`, `checkExportGate` (chain + period materiality from DB), `finalIntegrityCheck` (balance + plug detection). `src/routes/export.ts`, `src/services/export_gate_service.ts`, `src/services/integrity_check.ts`.
- **AI pillars** — **Classifier**: `runClassifier` on imbalanced ingest; result stored in staging payload; fail-open. **Advisor**: `runAdvisor` after classifier; proposals to `tenant_ai_proposals`; fail-open. **Shadow Auditor**: `runShadowAudit` on resolve-ingest and pre-JE-post; severity `block` returns 403 and blocks apply/post; findings in `tenant_shadow_audit_findings`; AI failure = fail-open (warn). **Justifier**: `runJustifier` after postJE; memo/IRAC to `tenant_justifications` via `createJustificationFromAI`. All in `src/ai/ai_orchestrator.ts`; adapters in `src/ai/adapters`, prompts/schemas in `src/ai/prompts`, `src/ai/schemas`.
- **DB tooling** — Migrations in `migrations/`; schema expectations in `src/db/schema_verify.ts`; tenant pool from `getTenantPool`/`getTenantId`; `runMigrations` on startup (`src/db/migrate.ts`, `src/db/index.ts`).
- **Integration tests** — Certification pipeline E2E: imbalanced TB → staging → resolve-ingest → lock → certify → export gates → binder; DB artifacts and chain verification (`tests/integration/certification_pipeline.test.ts`). Export certified gate test (`tests/integration/export_certified_gate.test.ts`). Full close flow test (`tests/integration/full_close_flow.test.ts`).

---

## 3) Production Readiness Assessment

**A) Data integrity**  
- Math errors: **Blocked.** Imbalance (TB or A≠L+E) throws `MathematicalIntegrityError` (422) on ingest, statement build, and resolve-ingest; JE lines must balance on create/propose.  
- Imbalances: **Blocked** from main ledger until resolved via HITL; resolve-ingest re-validates sum(debits)=sum(credits) before bridge apply.  
- Writes: **Controlled.** TB save and HITL apply go through bridge with period-lock check; JE lifecycle and lock/certify follow defined transitions; certified export requires session status and server-side gates (no client-supplied materiality).

**B) Operational safety**  
- Migrations: Present and run on startup.  
- Reset/bootstrap: `src/db/reset_and_bootstrap.ts` exists.  
- Schema: `schema_verify.ts` defines expected tables/columns.  
- Integration tests: Certification pipeline, export gate, and full close flow covered; tests skip when DB not configured.

**C) Reliability**  
- Export gate and certified binder: **Fail-closed** — chain + materiality + final integrity; production ignores bypass flag and logs tampering attempt.  
- Shadow Auditor: **Block on severity=block**; AI failure is fail-open (do not block), recorded as warn.  
- Classifier/Advisor: Fail-open; no blocking of ingest.

**D) Pilot readiness**  
- Multi-tenant: Tenant-scoped pool and IDs; period locks and close sessions per tenant.  
- Auth: `requireAuth` for `/api` in production; `requireCertifiedSession` for binder (query `closeSessionId` + session.status === `certified`).  
- In-memory fallback: Disallowed in production via `disallowMemoryStoreInProduction` for period lock, HITL, etc.

**Verdict: GO WITH LIMITS.**  
Core close path is enforceable and test-covered: balance enforced, certification gated, export and binder certified-only with server-side gates. Pilot-ready for 1–10 tenants with clear limits: AI (Classifier/Advisor/Shadow/Justifier) is best-effort or block-only where coded; operational runbook and monitoring not inferred from code; integration tests assume DB and test tenant setup.

---

## 4) Technical Workflow (Step-by-step)

| Step | Route / service | Tables / store | Validations |
|------|-----------------|----------------|-------------|
| Ingest | `POST /api/trial-balance/ingest` | `tenant_hitl_staging` (if imbalanced), `period_trial_balance` (if balanced + periodLabel), `tenant_ai_proposals` (if Advisor runs) | Parse TB; if imbalanced → createStagingItem; period not locked; optional Classifier (updateStagingPayload), Advisor (saveProposals). If balanced → bridge SaveTrialBalance. Statement build throws MathematicalIntegrityError if A≠L+E or TB imbalance. |
| Stage | Staging item created in ingest or by submitToStaging | `tenant_hitl_staging` | N/A |
| Classify | Invoked inside ingest for imbalanced TB | Staging payload updated | runClassifier; result in payload; fail-open. |
| Advisor | Invoked after Classifier in ingest | `tenant_ai_proposals` | runAdvisor; proposals saved; fail-open. |
| HITL | `POST /api/hitl/resolve` (approve/reject) or `POST /api/hitl/resolve-ingest` (apply adjustment) | `audit_ledger` (override), staging resolution, `tenant_justifications` (resolve), `tenant_shadow_audit_findings` (resolve-ingest) | resolve-ingest: validateAdjustmentProposals (amountProvenance); balance check (debits=credits); runShadowAudit → block if severity=block; then bridge ApplyHitlAdjustmentToTrialBalance (period lock asserted in bridge). |
| Shadow Audit | Before JE post (`runPrePostChecksAndStore`) and before resolve-ingest apply | `tenant_shadow_audit_findings` | Deterministic + AI; block only when severity=block; AI failure = warn, do not block. |
| Post | `POST /api/close/journal-entries/:id/post` (via bridge PostJE) | `journal_entries`, `audit_ledger` (je_posting), `tenant_justifications` (Justifier), `tenant_shadow_audit_findings` | Only approved→posted; runPrePostChecksAndStore; if block → throw; then status update, recordMaterialEvent, runJustifier, createJustificationFromAI. |
| Lock | `POST /api/close/period-lock` (bridge LockPeriod) | `period_locks` | assertPeriodNotLocked before other mutations; lockPeriod; role check (period_lock requires approver) in bridge. |
| Certify | `POST /api/close/sessions/:id/certify` | `close_sessions`, `audit_ledger` (certify_close) | Session must be locked; computeReadiness hardBlockers must be empty; approver role; then updateCertification, recordMaterialEvent. |
| Export | `POST /api/export/pdf` or `/csv` with exportMode=certified | — | Certified: closeSessionId + session certified; checkExportGate (period materiality from DB, verifyChain, optional unresolved conflicts); finalIntegrityCheck (runIntegrityGate + plug detection). Draft: ALLOW_IMBALANCED_DRAFT_EXPORT can allow imbalance with watermark. |
| Binder | `GET /api/audit/binder`, `GET /api/audit/binder/export/pdf|csv` | — | requireCertifiedSession (query closeSessionId, session.status===certified); runBinderExportGates (checkExportGate + finalIntegrityCheck); then buildAuditBinder. |

---

## 5) Business Workflow (User Journey)

1. **Upload TB** — User uploads trial balance CSV. If balanced and period given, it is saved to period ledger and statements can be built. If imbalanced, upload is staged with a message to fix via HITL.
2. **Review staging** — User sees staging area and, for trial-balance ingest, classifier/advisor output (suggestions and proposals) and can use them to decide adjustment.
3. **Accept suggestions / make adjustments** — User approves/rejects staging items. For imbalanced TB, user calls resolve-ingest with adjustment lines (with amount provenance). System re-checks balance, runs Shadow Auditor; if not blocked, applies adjustment to period trial balance.
4. **Lock period** — User locks the period (approver role); further edits to that period are blocked for TB ingest, JE, etc.
5. **Certify** — User certifies the close session (from locked, no hard blockers, approver role). Session becomes certified.
6. **Export** — User requests certified PDF/CSV; server checks session certified, export gate, and final integrity; then returns file. Draft export can be allowed with imbalance watermark if configured.
7. **Provide binder to auditor** — User calls binder endpoints with certified close session; server enforces certified session and same gates, then returns binder (and optional PDF/CSV export).

---

## 6) Security & Safety Review

- **Direct DB mutation risks:** All writes observed go through repos and bridge or services; no raw ad-hoc SQL in routes. Tenant scoping via pool/tenantId.
- **Integrity gates:** Balance enforced at ingest, statement build, resolve-ingest, JE create/propose; finalIntegrityCheck and runIntegrityGate block export when balance or plug checks fail.
- **Certification enforcement:** Certified export and binder require session.status === certified and closeSessionId; production ignores exportBypassCertification and logs tampering_attempt.
- **Audit trail:** Overrides and material events in audit ledger (hash-chained); verifyChain used before certified export.
- **Export bypass:** Certified path uses server-side state (period_export_checks, chain); no client-supplied materiality; bypass flag ignored in production.
- **Input validation:** Adjustment proposals require amountProvenance; balance and period checks at bridge; Zod schemas for bridge commands.
- **Failure handling:** MathematicalIntegrityError → 422; Shadow block → 403; Period locked → 403/409; validation errors return 4xx with codes.
- **Secrets:** Config via `process.env` (e.g. DATABASE_URL, AI_MODEL); `src/lib/env.ts` for NODE_ENV and feature flags; no secrets logged in cited paths.
- **Weak spots:** AI pillars depend on external model/config; auth bypass possible in non-production (optionalAuth when REQUIRE_AUTH false); dev-only routes mounted when !isProduction.

**Classification:** **Adequate for pilot.** Certified path and gates are strict and fail-closed; tenant and role checks present; pilot should run with production auth and no bypass.

---

## 7) What This Product Is (Positioning)

- This product is a **deterministic close and certification engine**: trial balance in, human-in-the-loop for imbalances and overrides, period lock, close session certification, and gated certified export and audit binder.
- This product is **not an ERP**: it does not run general ledger, AP/AR, or inventory; it consumes trial balance and supports close and audit deliverables.
- This product is **not forecasting or budgeting**: no forecasting or budget version workflows are wired in the cited code.
- This product is **not full bookkeeping automation**: it assumes trial balance (or equivalent) is supplied; it stages and resolves imbalances and applies adjustments via HITL.
- This product **does** provide AI-assisted suggestions (classification, proposals, shadow audit, justifications) that can block (Shadow) or inform (Classifier, Advisor, Justifier) under defined rules.

---

## 8) Final CTO Verdict

**Yes with limits.**

The system is **shipable to real pilot customers** for a bounded use case: ingest trial balance, resolve imbalances via HITL, run close and certification, and produce certified export and audit binder. Math is enforced; certification and export gates are server-side and fail-closed; integration tests cover the certification pipeline and export gate. Limits: AI is best-effort or block-only as implemented; operational hardening (monitoring, runbooks, backup) is not evidenced in code; pilot should use production auth, 1–10 tenants, and clear scope (close + certification + binder only). Recommend go for pilot with explicit limits and roadmap for operational and AI robustness.
