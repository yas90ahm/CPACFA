# CTO + CPA Auditor: Sovereign CPA Engine — Pilot Production Audit

**Date:** 2026-02-05  
**Scope:** Codebase-only evaluation against canonical Sovereign CPA Engine scope. No assumptions; evidence from files only.

---

## 1) Executive summary

The backend implements a **TypeScript-first** trial-balance-to-statements pipeline with HITL staging, Protocol Bridge, audit ledger, export gate, and close/certify workflow. **Forge** is implemented: imbalanced ingest writes only to `tenant_hitl_staging`; ledger (`period_trial_balance`) is updated only after human resolve via `resolve-ingest`, which enforces balance and amount provenance. **Protocol Bridge** uses Zod-validated JSON commands; routes call `executeBridgeCommand` or services, not repositories directly for financial mutations. **Attribution** is present: bridge records `actor`; audit ledger uses `createdBy`; certify uses `certifiedBy`. **Advisor provenance** is enforced at resolve-ingest and in the proposeTrialBalanceAdjustment tool (`amountProvenance` required). **Shadow Auditor** runs before JE post (`runPrePostChecksAndStore`), can block on severity `block`. **Justifications** are persisted in `tenant_justifications` (irac_json, memo_markdown). **Truth Gate** blocks export on chain failure and materiality (DB-only flags); **finalIntegrityCheck** (imbalance + plug detection) runs on PDF/CSV export paths. **Audit chain** is append-only, hash-chained, with explicit `hash_version` (v1/v2). **Binder** includes financials, justifications, and chain verification in PDF/CSV. **Certification** gates export only when `closeSessionId` is supplied; **export bypass** (`exportBypassCertification=1`) and **binder export without gate** are gaps. **Determinism** is enforced in math (financialStatements, integrity_gate, rules_registry); agentic layer is classifier/advisor/justifier only. Integration tests cover certification pipeline and schema smoke; Jest exits cleanly after pool teardown. **Verdict: GO WITH LIMITS** — safe for 1–10 tenants in a controlled environment where certification bypass is disabled and binder/export policy is documented; not safe if certification can be bypassed or binder is treated as certified output without going through the same gate as POST /api/export/pdf.

---

## 2) Architecture map

| Layer | Entrypoints / artifacts | Evidence |
|-------|-------------------------|----------|
| **Entrypoints** | `src/server.ts` (Express app); `app` exported for supertest | `server.ts` L42–120 (mounts), L225–241 (start only when !Jest, NODE_ENV !== test) |
| **DB** | Control pool + tenant pools (shared or BYOD); migrations 001–079 | `src/db/index.ts` (getControlPool, getTenantPool, closePool); `src/db/migrate.ts` (control: 001,002,010,075); tenant list in index.ts (003–079) |
| **Schema (key tables)** | tenants, schema_migrations, tenant_hitl_staging, period_trial_balance, close_sessions, journal_entries, journal_entry_lines, audit_ledger (hash_version), tenant_justifications, period_locks, period_export_checks, tenant_shadow_audit_findings | `migrations/*.sql`; `src/db/schema_verify.ts` REQUIRED list |
| **Financial mutations** | Trial balance: `trial_balance_store_service.saveUnadjustedFromUpload` (only via bridge or resolve-ingest). JE: `journal_entry_service` (createDraftJE, proposeJE, approveJE, postJE) invoked by bridge. Lock: `period_lock_service.lockPeriod` via bridge. | `src/bridge/protocol_bridge.ts` (executeBridgeCommand); `src/services/trial_balance_store_service.ts`; `src/services/journal_entry_service.ts` |
| **Agent tools** | proposeTrialBalanceAdjustment (provenance required), buildFinancialStatements | `src/agents/tools/proposeTrialBalanceAdjustment.ts`; `src/agents/tools/buildFinancialStatements.ts`; `src/agents/tools/index.ts` |
| **Export pipeline** | POST /api/export/pdf, POST /api/export/csv → checkExportGate, finalIntegrityCheck, createPdfFromStructuredPayload / generateCsvWithConfidence. GET /api/audit/binder/export/pdf → buildAuditBinder, exportAuditBinderToPdf (no gate). | `src/routes/export.ts`; `src/services/export_gate_service.ts`; `src/services/integrity_check.ts`; `src/routes/audit/audit_binder.ts` |
| **Integration tests** | certification_pipeline.test.ts (ingest→resolve→lock→certify→export→binder→chain); schema_smoke.test.ts; export_certified_gate.test.ts; full_close_flow.test.ts; validation.test.ts | `tests/integration/*.test.ts`; `tests/setup.ts` (closePool in afterAll) |

---

## 3) Scope coverage matrix

| Feature | Implemented? | Evidence (files/functions) | Notes |
|---------|--------------|----------------------------|--------|
| **Forge (staging)** | YES | `routes/trial-balance/ingest.ts` L164–194: `absGt(totalDebits, totalCredits, tolerance)` → createStagingItem, return 200 staged; no write to period_trial_balance. `hitl.ts` resolve-ingest → executeBridgeCommand(ApplyHitlAdjustmentToTrialBalance) → saveUnadjustedFromUpload only after balance check | Imbalanced data cannot hit ledger |
| **Protocol Bridge** | YES | `bridge/protocol_bridge.ts`: Zod schemas (bridgeCommandSchema), executeBridgeCommand parses command, calls services (saveUnadjustedFromUpload, createDraftJE, etc.), recordBridgeMutation(actor) | Strict JSON; no direct repo writes from routes (JE route uses executeBridgeCommand; close routes use services) |
| **Attribution** | YES | Bridge: ctx.actor; recordMaterialEvent createdBy; certifyCloseSession certifiedBy; recordBridgeMutation snapshot includes actor | Every mutation tagged |
| **Advisor provenance** | YES | `hitl.ts` L139–146: validateAdjustmentProposals(body.adjustment); 400 AMOUNT_PROVENANCE_REQUIRED. `types/amount_provenance.ts` validateAdjustmentProposals. `agents/tools/proposeTrialBalanceAdjustment.ts` Zod + SOURCE_LINE_AMOUNT | HUMAN_ENTERED_AMOUNT | DETERMINISTIC_ENGINE_AMOUNT | Advisor cannot invent amounts; provenance required |
| **Shadow Auditor** | YES | `journal_entry_service.ts` L133–144: runPrePostChecksAndStore before post; if severity === 'block' throw JournalEntryError SHADOW_AUDIT_BLOCK. `shadow_auditor_service.ts` runPrePostChecks (deterministic), runPrePostChecksAndStore persists to tenant_shadow_audit_findings | Runs before posting; can block |
| **Justifications (IRAC)** | YES | `tenant_justifications` (irac_json, memo_markdown); `justification_service.ts` createJustification, getJustificationsForPeriod; ensureJustificationForPostedJE | Durable IRAC memos in DB |
| **Truth Gate** | PARTIAL | `export_gate_service.ts` checkExportGate: verifyChain, period_export_checks (DB only), optional conflicts. `export.ts` POST /pdf: checkExportGate when tenantId+pool; finalIntegrityCheck at L187 (PDF) and L388 (CSV) with tolerance from rules_registry (0.01). Binder GET /binder/export/pdf does NOT call checkExportGate or finalIntegrityCheck | Export PDF/CSV blocked on chain + materiality + finalIntegrityCheck; binder export not gated |
| **Audit chain** | YES | `audit_ledger_repository.ts`: append-only insert; hash_version (1 raw, 2 canonical); verifyChain by version; COALESCE(hash_version,1). `audit_ledger_service.ts` recordMaterialEvent, verifyChain | Append-only; cryptographic hash chain; verifiable; versioned |
| **Binder export** | PARTIAL | `audit_export_service.ts` buildAuditBinder: statements, justifications, verifyChain → chainVerification. `audit_binder_export_service.ts` binderToHtml includes chainVerification. `audit_binder.ts` GET binder/export/pdf builds binder and returns PDF — no checkExportGate or certification check | Includes financials + memos + chain; route not gated |
| **Lock/Certify gating** | PARTIAL | `close_session_service.ts` certifyCloseSession: requires locked, readiness, approver role; records certify_close in audit ledger. `export.ts` L98–115: when closeSessionId present, computeReadiness + block on hardBlockers; L341–361 (CSV): if session and status !== 'certified', allow bypass via exportBypassCertification=1 or 403 | Export blocked unless certified only when closeSessionId sent; bypass available; PDF path does not require closeSessionId |
| **Deterministic math only** | YES | `financialStatements.ts` buildValidatedStatements, MathematicalIntegrityError; `integrity_gate_service.ts` runIntegrityGate; `rules_registry.ts` getRoundingTolerance (0.01); `trialBalanceParser.ts`; no AI in number computation for ledger | No AI math; numbers from TS core |
| **Integration test coverage** | YES | certification_pipeline.test.ts: imbalanced ingest → staged → resolve-ingest → lock → certify → export pdf (gate + finalCheck) → binder → verifyChain. schema_smoke.test.ts; export_certified_gate.test.ts; full_close_flow.test.ts | Realistic E2E; Jest exits cleanly (closePool in setup afterAll) |

---

## 4) Gap analysis

| Gap | Severity | Location | Minimal fix |
|-----|----------|----------|-------------|
| **Certification bypass** (export without certified session via query/body flag) | HIGH | `src/routes/export.ts` L339–343 (CSV): `exportBypassCertification === '1'` allows export when session not certified; audit log records bypass but export still proceeds | In production (NODE_ENV=production), ignore exportBypassCertification and always require session.status === 'certified' when closeSessionId is present |
| **Binder export not behind Truth Gate or certification** | HIGH | `src/routes/audit/audit_binder.ts` GET /binder/export/pdf and /binder/export/csv: no checkExportGate, no finalIntegrityCheck, no certification check | Either require closeSessionId + run checkExportGate + certification check before binder PDF/CSV, or document that binder is “audit package” not “certified financial export” and restrict access by policy |
| **PDF export without closeSessionId** (certification not required) | MEDIUM | `src/routes/export.ts` L98–115: certification and readiness checked only when closeSessionId is present; PDF can be exported with only checkExportGate (chain + materiality) | Require closeSessionId (and thus certification) for POST /api/export/pdf in production when pilot policy is “export only after certify”; or document that PDF without closeSessionId is “draft” export |
| **Routes importing repositories** (read-only vs mutation) | LOW | `routes/trial-balance/ingest.ts` listContracts, periodFinancialDataState; `routes/close/close_journal_entries.ts` jeRepo (used for get/list, not insert — insert via bridge). No route found that directly calls repo.insert* for financial tables | No change required; mutations go through bridge/services |

---

## 5) Production readiness scorecard

| Criterion | Score (0–5) | Evidence |
|-----------|-------------|----------|
| **Determinism** | 4 | Math path: financialStatements, integrity_gate, rules_registry, trialBalanceParser; agentic limited to classification/suggestions; provenance required for amounts. Minor: tolerance from JSON file (could change at runtime). |
| **Data integrity** | 4 | Forge blocks imbalanced ledger write; bridge validates balance before SaveTrialBalance/ApplyHitlAdjustment; period lock enforced in bridge; JE balance validated. Gap: certification bypass and binder not gated. |
| **Auditability** | 5 | Audit ledger append-only, hash-chained, versioned; recordMaterialEvent on bridge commands, certify_close, je_posting; recordOverride for HITL; tenant_justifications for IRAC; shadow findings stored. |
| **Security (authn/authz/input)** | 4 | JWT in production (requireAuth when NODE_ENV=production or REQUIRE_AUTH); requireTenantContext in production; export rejects client-supplied materiality flags; Zod on bridge. Gap: certification bypass is a policy/configuration issue. |
| **Reliability (jobs/locks/retries)** | 3 | period_lock_service; jobs table + job_worker; no visible retry/backoff for transient DB failures in critical paths. |
| **Idempotency** | 4 | Session create idempotent (createSessionOrGetExisting); checklist init idempotent; INSERT … ON CONFLICT in period_trial_balance. |
| **Schema hygiene/migrations** | 5 | Migrations 001–079; schema_verify in tests; hash_version added with backward compat (missing = v1). |
| **Test coverage realism** | 4 | certification_pipeline E2E (ingest→certify→export→binder→chain); schema_smoke; export_certified_gate; full_close_flow; Jest teardown (closePool). |
| **Operational readiness** | 4 | NODE_ENV=production disables in-memory stores (env.ts); dev_diagnostics only when !production; JWT_SECRET check in production. CI requires DATABASE_URL. |
| **Observability** | 3 | requestIdMiddleware; logger used in ingest; appendAuditLog for blocked export; no metrics endpoint observed. |

---

## 6) Hard blockers

1. **Certification bypass** — In production, export (CSV path) can be performed without a certified close session if the client sends `exportBypassCertification=1`. This violates “export blocked unless certified” for pilot.
2. **Binder export ungated** — GET /api/audit/binder/export/pdf and /binder/export/csv do not run checkExportGate or certification. If binder is used as the “certified” deliverable, it can be obtained without passing the Truth Gate or certification.

**If** pilot policy is: (a) disable certification bypass in production (code or config), and (b) treat binder as internal audit package (not the certified export) and only POST /api/export/pdf with closeSessionId as the certified export path, then there are **no hard blockers** for a controlled 1–10 tenant pilot.

---

## 7) Verdict and next steps

**Verdict: GO WITH LIMITS**

- **Safe for:** Pilot with 1–10 tenants where:
  - `NODE_ENV=production` and `REQUIRE_AUTH` is not disabled.
  - Certification bypass is disabled for production (e.g. ignore `exportBypassCertification` when `NODE_ENV=production`).
  - Binder export is either gated (e.g. require closeSessionId + run checkExportGate/certification) or explicitly treated as non-certified audit package and access controlled.
  - Only POST /api/export/pdf (and CSV) with a certified closeSessionId is used as the certified export.
- **Unsafe for:** Treating binder as certified output without gate; allowing export without certification via bypass; or running without auth/tenant context in production.

**Max 10 next actions (in order of impact):**

1. **Disable certification bypass in production** — In `src/routes/export.ts`, when `NODE_ENV === 'production'`, do not honor `exportBypassCertification`; return 403 if session exists and is not certified.
2. **Gate binder export** — In `src/routes/audit/audit_binder.ts`, before building/exporting binder PDF/CSV, require closeSessionId (or periodLabel + tenant), call checkExportGate, and require certified session (or document that binder is ungated by design).
3. **Optional: require closeSessionId for PDF export in production** — If policy is “no PDF export without certified close,” require closeSessionId when NODE_ENV=production for POST /api/export/pdf.
4. **Add integration test** — Assert that in production mode (or with a feature flag), export with session not certified and no bypass returns 403.
5. **Document** — In runbook or ENGINEERING_CONSTITUTION: certified export path = POST /api/export/pdf with closeSessionId and certified session; binder = audit package (gated or not).
6. **Optional: add metrics** — Count export attempts, gate blocks, certification bypass (if ever allowed in non-prod).
7. **Optional: retries** — For critical DB operations (e.g. audit ledger append), consider idempotent retry with backoff.
8. **No change** — Keep Protocol Bridge, Forge, provenance, Shadow Auditor, and audit chain as-is; they meet scope.
9. **No change** — Keep deterministic math and agentic boundaries; they meet scope.
10. **No change** — Keep integration tests and pool teardown; they support reliable runs.

---

*Audit conducted against the codebase only. No redesign or new features proposed.*
