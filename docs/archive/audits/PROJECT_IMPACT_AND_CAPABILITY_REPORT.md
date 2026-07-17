# Project Impact & Capability Report

**Document type:** Deep-scan assessment  
**Scope:** CPACFA / FinOS Agent — Accounting close software  
**Method:** Code-only analysis; specific files and symbols cited  
**Date:** February 4, 2025  

---

## 1. Business Capability Analysis

### High-Level Business Functions

This application is a **deterministic close and certification engine**. It does not run a general ledger or ERP; it consumes trial balance data and supports month-end close, human-in-the-loop resolution, period lock, certification, and audit deliverables.

| Business Function | Evidence | Real-World Problem Solved |
|------------------|----------|---------------------------|
| **Trial balance ingestion** | `src/routes/trial-balance/ingest.ts`, `src/routes/trial-balance/parser.ts` | Finance teams upload CSV trial balances from spreadsheets or ERP exports; system parses, validates, and either saves (if balanced) or stages for fix (if imbalanced). |
| **Staging imbalanced data** | `createStagingItem` in `src/routes/trial-balance/ingest.ts`; `tenant_hitl_staging` table | Prevents unbalanced data from reaching the main ledger; forces human review before any write. |
| **HITL adjustments** | `POST /api/hitl/resolve`, `POST /api/hitl/resolve-ingest` in `src/routes/hitl.ts` | Humans approve/reject or supply adjustment lines; system re-checks balance, runs Shadow Auditor, then applies via bridge. |
| **Draft financial statements** | `src/routes/export.ts`, `src/services/financialStatements.ts`, `src/services/statementGenerator.ts` | Generates balance sheet, P&L, cash flow, ratios from trial balance; draft export allowed with optional imbalance watermark when `ALLOW_IMBALANCED_DRAFT_EXPORT` is set. |
| **Certified export** | `src/routes/export.ts`, `checkExportGate`, `finalIntegrityCheck` | Certified PDF/CSV requires close session `certified`, export gate (audit chain + materiality from DB), and final integrity check; production ignores bypass flag. |
| **Audit binder** | `GET /api/audit/binder`, `GET /api/audit/binder/export/pdf|csv` in `src/routes/audit/audit_binder.ts` | Certified-only binder: statements, source documents, reasoning deep links; same gates as certified export. |
| **AI suggestions** | `src/ai/ai_orchestrator.ts` | Classifier suggests account mappings for imbalanced TB; Advisor produces proposals; Shadow Auditor can block JE post and resolve-ingest when severity is `block`; Justifier generates memo/IRAC for posted JEs. |

### Primary "Jobs to Be Done" (Stakeholder Perspective)

1. **Controller / Finance Manager:** Upload trial balance → fix imbalances with AI-assisted suggestions → lock period → certify close → export certified statements and audit binder.
2. **Auditor:** Receive certified binder with statements, source documents, and justification chain; verify audit trail and hash chain.
3. **Accountant:** Create draft JEs, propose, approve, post; Shadow Auditor blocks risky posts; Justifier produces memo for audit defense.

### Explicit Non-Capabilities (Inferred from Code)

- **No ERP:** No GL ledger, AP/AR, or inventory as product core (`INDEPENDENT_SYSTEM_AUDIT.md` §3).
- **No forecasting/budgeting:** No forecasting or budget version workflows wired to routes.
- **No payments:** No payment capture or settlement.
- **No automatic AI posting:** AI never calls `executeBridgeCommand` or posts to `journal_entries`; posting is human-approved only.

---

## 2. Technical Capability Analysis

### Architecture Pattern

**Hybrid: Monolithic API + Agentic AI layer + Single-mutation bridge.**

- **Monolithic:** Express API, single Node process, Postgres; no event bus or microservices.
- **Agentic:** AI pillars (Classifier, Advisor, Shadow Auditor, Justifier) in `src/ai/ai_orchestrator.ts`; adapters in `src/ai/adapters`, prompts in `src/ai/prompts`, schemas in `src/ai/schemas`.
- **Single-mutation path:** All financial writes go through `executeBridgeCommand` in `src/bridge/protocol_bridge.ts`; Zod-validated commands: `SaveTrialBalance`, `ApplyHitlAdjustmentToTrialBalance`, `CreateDraftJE`, `ProposeJE`, `ApproveJE`, `PostJE`, `LockPeriod`.

### Primary Tech Stack

| Layer | Technology | Evidence |
|-------|------------|----------|
| Runtime | Node.js ≥18 | `package.json` engines |
| Language | TypeScript | `tsconfig.json`, `src/**/*.ts` |
| Framework | Express 4.x | `src/server.ts`, `package.json` |
| Database | PostgreSQL | `pg` driver, `migrations/` |
| Validation | Zod | `src/bridge/protocol_bridge.ts`, route schemas |
| AI | Anthropic SDK, optional OpenAI/Mistral | `package.json`, `src/ai/ai_client.ts` |
| Frontend | Next.js | `frontend/` — diagnostics HUD, login, auditor views |

### Data Flow (Core Path)

```
CSV Upload → parseTrialBalance → [imbalanced?] → createStagingItem (tenant_hitl_staging)
                                    ↓
                            runClassifier → updateStagingPayload
                            runAdvisor → tenant_ai_proposals
                                    ↓
POST /api/hitl/resolve-ingest → validateAdjustmentProposals → runShadowAudit
                                    ↓ [if not blocked]
                            executeBridgeCommand(ApplyHitlAdjustmentToTrialBalance)
                                    ↓
POST /api/close/period-lock → executeBridgeCommand(LockPeriod)
                                    ↓
POST /api/close/sessions/:id/certify → certifyCloseSession (no hard blockers, approver role)
                                    ↓
POST /api/export/pdf (certified) → checkExportGate (verifyChain, period_export_checks)
                                 → finalIntegrityCheck (runIntegrityGate + plug detection)
                                    ↓
GET /api/audit/binder → requireCertifiedSession → runBinderExportGates → buildAuditBinder
```

**Key invariants enforced:**

- **Balance:** `MathematicalIntegrityError` (422) on TB imbalance, A≠L+E, or unbalanced JE lines (`src/services/integrity_gate_service.ts`, `src/services/financialStatements.ts`, `src/services/journal_entry_service.ts`).
- **Period lock:** `assertPeriodNotLocked` in bridge before TB save, HITL apply, JE create/propose/approve/post.
- **Audit chain:** Hash-chained `audit_ledger`; `verifyChain` used before certified export (`src/services/audit_ledger_service.ts`, `src/services/export_gate_service.ts`).

---

## 3. Pilot Assessment: Business Viability

### Core Value Proposition

The system delivers: **trial balance in → HITL for imbalances → period lock → certification → gated certified export and audit binder.** This is technically implemented and test-covered.

### ROI for a Test User

| Capability | Implemented | Pilot-Ready? |
|------------|-------------|--------------|
| Upload CSV TB | Yes | Yes |
| Stage imbalanced TB | Yes | Yes |
| AI classification + proposals | Yes (fail-open) | Yes — best-effort |
| HITL resolve-ingest | Yes | Yes |
| Shadow Auditor block | Yes (severity=block) | Yes |
| Period lock | Yes | Yes |
| Close session certify | Yes | Yes |
| Certified export | Yes (gated) | Yes |
| Audit binder | Yes (certified-only) | Yes |

### Business-Logic Gaps That May Hinder Pilot

1. **No ERP integration in core flow:** Trial balance must be uploaded manually (CSV). The `connectors/` Python MCP server (NetSuite/SAP/QuickBooks) exists but is a separate process; no evidence it is wired into the main close flow.
2. **Push-to-GL is mock-only:** `src/services/push_close_to_gl_service.ts` — post-back to external GL is not idempotent by `external_id`; `PRODUCTION_READINESS_REPORT.md` §2.5.
3. **Frontend is diagnostics-focused:** Root redirects to `/diagnostics`; no full close-management UI inferred from `frontend/app/`. Pilot may require API-only or custom UI.
4. **Materiality and export checks:** `period_export_checks` must be populated for certified export; no self-service flow for setting materiality thresholds documented in code.
5. **Multi-entity/consolidation:** `frontend/app/consolidation/page.tsx` exists; consolidation routes were deleted (`D src/routes/consolidation.ts`). Consolidation is not in scope for pilot.

### Verdict: **Viable for pilot with limits.**

A single-tenant or 1–5 tenant pilot can achieve ROI if:
- Trial balance is supplied via CSV (manual or scripted).
- Users accept API-driven workflow or minimal diagnostics UI.
- Materiality and export checks are configured (DB or admin path).

---

## 4. Pilot Assessment: Technical Stability & Scalability

### Error Handling

| Pattern | Evidence | Assessment |
|--------|----------|------------|
| 500 sanitization | `src/lib/errorHandler.ts` — `send500` logs full error server-side, returns generic message | Adequate |
| Structured logging | `src/lib/logger.ts` — JSON, level, request_id, secret redaction | Adequate |
| Route-level catch | Many routes use `send500` or `.catch`; `grep` shows 15+ route files with error handling | Inconsistent — some routes may not wrap async handlers |
| Integrity errors | `MathematicalIntegrityError` → 422; Shadow block → 403; Period locked → 403/409 | Clear, deterministic |
| Non-fatal catches | Ingest: decision record, issue creation caught and no-op; main response still 422 | Intentional; could add single log for visibility |

### Logging

- **Format:** JSON to stdout/stderr; `request_id` from async context (`src/lib/request_context.ts`).
- **Redaction:** Keys containing `secret`, `password`, `token`, `key`, `authorization`, `cookie` redacted (`src/lib/logger.ts`).
- **Gap:** No OpenTelemetry, APM, or metrics; observability is logs-only (`PRODUCTION_READINESS_REPORT.md` §2.5).

### Modularity

| Layer | Structure | Assessment |
|-------|-----------|------------|
| Routes | `src/routes/` — 58 files; close, audit, hitl, trial-balance, export, etc. | Clear separation |
| Services | `src/services/` — 149 files; business logic isolated | Good |
| Bridge | `src/bridge/protocol_bridge.ts` — single mutation surface | Strong |
| Repositories | `src/db/repositories/` — 64 files | Clean data access |
| AI | `src/ai/` — orchestrator, adapters, prompts, schemas | Well-structured |

### Scalability Constraints

1. **No streaming ingest:** File size limits (multer, express.json 1MB); no pagination on some list endpoints (`PRODUCTION_READINESS_REPORT.md` §2.5).
2. **In-process job worker:** `runWorkerLoop` in `src/services/job_worker.ts`; no separate worker process; retries and dead-letter exist.
3. **Single DB pool per tenant:** `getTenantPool`; no connection pooling tuning evident.
4. **In-memory fallbacks:** Some services (period_lock, accounting_integration) can fall back to in-memory when pool missing; `disallowMemoryStoreInProduction` used in audit_export, trial_balance_store, hitl_orchestrator (`PRODUCTION_READINESS_REPORT.md` §1).

### Foundation Assessment

| Criterion | Status |
|----------|--------|
| Migrations | Strong — control + tenant sets; IF NOT EXISTS; run on startup |
| Schema verification | Strong — `schema_verify.ts`, `verify_schema.ts`, tests run verifySchema in beforeAll |
| Reset safety | Strong — `reset_and_bootstrap.ts` refuses prod-like URLs |
| Integration tests | Strong — `certification_pipeline.test.ts`, `export_certified_gate.test.ts`, `full_close_flow.test.ts` |
| Auth | Adequate — JWT required in prod; `requireAuth` for /api; dev router only when !production |

### Verdict: **Production-ready for pilot with limits.**

The foundation is solid: deterministic math, protocol bridge, audit chain, certification gates. Not a proof-of-concept; refactor not required for 1–10 tenant pilot. Gaps (observability, streaming, push-to-GL) are scaling/ops concerns, not pilot blockers.

---

## 5. Stakeholder Gains: The Finance Perspective

### Time Saved on Manual Reconciliation / Data Entry

| Activity | Before (Manual) | With System | Gain |
|----------|-----------------|-------------|------|
| Trial balance validation | Manual Excel checks for debits=credits | Automatic parse + stage if imbalanced; no write until resolved | **Eliminates silent imbalance writes** |
| Imbalance resolution | Manual research, trial-and-error | AI Classifier + Advisor suggest mappings/proposals; human approves | **Faster triage** — suggestions in staging payload (`tenant_ai_proposals`) |
| JE approval workflow | Email/paper approvals | Propose → Approve → Post with status machine; Shadow Auditor blocks risky posts | **Structured workflow** |
| Audit binder assembly | Manual PDF collation | Certified-only binder: statements + source docs + reasoning deep links | **One-click binder** after certification |
| Period lock enforcement | Spreadsheet permissions | `assertPeriodNotLocked` in bridge; no mutations after lock | **Enforced at code level** |

**Quantification (estimates):**

- **Imbalance detection:** Near-instant vs. manual reconciliation (minutes to hours).
- **Binder assembly:** Single API call vs. manual collation (30–60 min per close).
- **JE memo generation:** Justifier produces IRAC/memo after post; reduces manual memo writing (15–30 min per material JE).

### Reduction in Audit Risk / Human Error

| Risk | Mitigation |
|------|------------|
| Exporting uncertified numbers as certified | `requireCertifiedSession`; `checkExportGate`; production ignores `exportBypassCertification` |
| Imbalanced statements in certified export | `finalIntegrityCheck` (runIntegrityGate + plug detection) before export |
| Tampering with materiality | Materiality read from `period_export_checks` (DB) only; no client-supplied materiality |
| Silent mutations | All TB/JE mutations via `executeBridgeCommand`; `recordMaterialEvent` on mutations |
| Shadow Auditor | Blocks JE post and resolve-ingest when severity=block; findings in `tenant_shadow_audit_findings` |

### Improvement in Reporting Speed / Accuracy

- **Statement generation:** `buildValidatedStatements` throws on A≠L+E; no silent wrong numbers.
- **Draft export:** Optional imbalance watermark when `ALLOW_IMBALANCED_DRAFT_EXPORT`; user sees imbalance explicitly.
- **Audit chain:** Hash-chained ledger; `verifyChain` before certified export; tampering detectable.

---

## 6. Stakeholder Gains: The Tech Perspective

### Maintainability and Documentation Quality

| Aspect | Evidence | Assessment |
|-------|----------|------------|
| Code structure | Routes → services → repos → bridge; clear layering | Good |
| Type safety | TypeScript throughout; Zod schemas for bridge commands | Strong |
| Schema verification | `schema_verify.ts` documents expected tables/columns | Good |
| Existing audits | `CTO_SYSTEM_READINESS_REPORT.md`, `INDEPENDENT_SYSTEM_AUDIT.md`, `DEVOPS_READINESS_REPORT.md`, `PRODUCTION_READINESS_REPORT.md` | Strong documentation of system behavior |
| README/inline | `README.md`, `connectors/README.md`; some routes have minimal comments | Adequate |

**Gap:** No single "developer onboarding" doc; new engineers must read multiple audit docs and trace code.

### Extensibility (Ease of Adding Features)

| Extension | Effort | Path |
|-----------|--------|------|
| New bridge command | Low | Add Zod schema + handler in `protocol_bridge.ts`; call `recordMaterialEvent` |
| New AI pillar | Medium | Add to `ai_orchestrator.ts`; create prompt + schema in `src/ai/` |
| New route | Low | Add file in `src/routes/`; mount in `server.ts` |
| New migration | Low | Add SQL in `migrations/`; control vs. tenant set in `migrate.ts` / `index.ts` |
| New audit event type | Low | Add to `src/types/audit_ledger.ts`; use `recordMaterialEvent` |

**Constraint:** All financial mutations must go through the bridge; no ad-hoc repo writes from routes.

### Efficiency of Existing Abstractions

| Abstraction | Efficiency | Notes |
|-------------|------------|-------|
| Protocol bridge | High | Single mutation path; Zod validation; period lock asserted; audit recording centralized |
| Integrity gate | High | `runIntegrityGate` / `runIntegrityGateOrThrow`; reusable across ingest, export, statement build |
| Export gate | High | `checkExportGate` + `finalIntegrityCheck`; certified path and binder share same gates |
| AI orchestrator | Medium | Four pillars (Classifier, Advisor, Shadow, Justifier) share `callAIWithSchema`; schemas enforce structure; fail-open/fail-closed policy clear |
| Persistence service | Medium | `createStagingItem`, `getStagingArea`, `getStagingItem`; HITL staging abstraction |
| Rules registry | High | `shared/config/financial_rules.json` — rounding tolerance, materiality; `getRoundingTolerance` used in integrity checks |

**Weak spots:**

- **Catalog route:** `src/routes/catalog.ts` accepts body without Zod; raw cast (`{ name, type, schema? }`).
- **Some services:** Period lock, accounting_integration can use in-memory when pool missing; not all services have `disallowMemoryStoreInProduction`.

---

## Summary

| Section | Verdict |
|---------|---------|
| 1. Business Capability | Deterministic close and certification engine; trial balance → HITL → lock → certify → export/binder. Not ERP, forecasting, or payments. |
| 2. Technical Capability | Monolithic + agentic; Express/TS/Postgres; single-mutation bridge; AI pillars fail-open or block-only where coded. |
| 3. Pilot: Business Viability | **Viable with limits.** Core path implemented; CSV ingest, API-driven workflow; no ERP integration in main flow; push-to-GL mock-only. |
| 4. Pilot: Technical Stability | **Ready for pilot.** Solid foundation; error handling and logging adequate; no refactor required for 1–10 tenants. |
| 5. Finance Gains | Time saved on imbalance resolution, binder assembly, JE memos; audit risk reduced via gates and chain; reporting accuracy enforced. |
| 6. Tech Gains | Good maintainability; extensible via bridge and AI orchestrator; strong abstractions (bridge, integrity gate, export gate); some weak spots (catalog, in-memory fallbacks). |

---

*Report generated from codebase analysis. No runtime or penetration testing performed.*
