# Codebase Audit — Production Readiness Assessment

**Date:** February 10, 2026  
**Scope:** Full codebase review for demo readiness to audit firms, PE operating partners, and controllers.

---

## Executive Summary

**The system is NOT production-ready for financial professionals.** Core certification pathways (trial balance → close → certify → export) are implemented with real crypto, audit trails, and DB-enforced immutability. However: (1) Several integration tests fail due to API signature drift; (2) Ed25519 signing in dev returns `signed: false` when keys are not set; (3) Auth can be fully disabled in dev; (4) Evidence upload/download exists but hash re-verification post-certification is limited; (5) No multi-entity rollup dashboards for PE; (6) Dockerfile and CI exist, but Docker HEALTHCHECK uses port 3000 while the server defaults to 3001 (when PORT is unset). A controller could run a basic close flow; an audit partner would flag dev-mode signing behavior; a PE operating partner would want portfolio-level views that are scaffolded, not production-ready.

---

## Feature Status Table

| Capability | Status | Notes |
|------------|--------|-------|
| **1. Trial Balance Ingestion** | 🟡 PARTIALLY BUILT | CSV/XLSX parse, D=C, A=L+E, plug detection, HITL staging. Scientific notation/formulas not explicitly tested. MAX_TB_ROWS=100k. |
| **2. Close Session State Machine** | ✅ PRODUCTION-READY | All 6 states, valid/invalid transitions enforced. No explicit concurrent-access test; EXCLUDE constraint on overlapping sessions. |
| **3. Evidence Anchoring** | 🟡 PARTIALLY BUILT | Local + S3 storage, SHA-256 on upload, manifest in snapshot. Evidence download route exists. Hash mismatch blocks export. |
| **4. Snapshot & Certification** | 🟡 PARTIALLY BUILT | Deterministic payload, SHA-256, Ed25519 real when keys set—returns `signed: false` in dev without keys. Evidence manifest included. |
| **5. Export Gating** | ✅ PRODUCTION-READY | Chain + materiality + evidence integrity checks. Certified PDF with real data. Draft watermark. 403 with specific codes. |
| **6. Tamper Detection / Audit Chain** | ✅ PRODUCTION-READY | Hash-chained, v1/v2, **DB triggers enforce append-only** (migration 091). |
| **7. AI Boundaries** | ✅ PRODUCTION-READY | AI → staging only. Staging tables used. Tests verify. |
| **8. Multi-Tenant Isolation** | 🟡 PARTIALLY BUILT | tenant_id on queries. Tenant isolation test exists. BYOD via database_url. Connection pooling (max 50 tenant pools). |
| **9. API Layer** | 🟡 PARTIALLY BUILT | Many endpoints. Rate limit 200/min. JWT auth. Some endpoints lack integration tests. |
| **10. Frontend / UI** | 🟡 PARTIALLY BUILT | Next.js frontend (login, register, consolidation, auditor, diagnostics, genui). Can log in and use via browser. |

---

## PART 1: FEATURE-BY-FEATURE STATUS AUDIT

### 1. Trial Balance Ingestion

| Item | Status | Evidence |
|------|--------|----------|
| CSV parsing (BOM, CRLF, quoted) | ✅ | `fileIngestion.ts` L37-44: `bom: true`, `trim`, `relax_column_count`. |
| XLSX parsing | ✅ | `fileIngestion.ts` L57-86: first sheet, header row 0. |
| Debit = Credit validation | ✅ | `integrity_gate_service.ts` L151-164: `runIntegrityGate`. `ingest.ts` throws `MathematicalIntegrityError` on imbalance. |
| Balance sheet equation (A = L + E) | ✅ | `integrity_gate_service.ts` L159-164. |
| Plug/suspense detection | ✅ | `integrity_gate_service.ts` L46-78: `detectSuspiciousPlugs`, threshold default 0.9; pattern: Miscellaneous, Suspense, Other. |
| Rejection/routing to HITL staging | ✅ | `ingest.ts`: creates staging item, returns `status: 'staged'`, `stagedId`. |
| Multiple CoA formats | 🟡 | `parser_utils.ts`: standardizeColumns maps Dr/Cr/Balance/Amt etc. CoA templates in `src/data/coa_templates/` (QuickBooks, Xero, NetSuite). |
| Row limits (real max) | ✅ | `ingest.ts` L155-156: `MAX_TB_ROWS ?? 100_000`. `large_trial_balance.test.ts` L259: 100,001 rows reject with 413. |
| Scientific notation / formulas | 🔴 | Not explicitly tested. `parseFloat` handles scientific notation; Excel formulas are typically cell values. |

---

### 2. Close Session State Machine

| Item | Status | Evidence |
|------|--------|----------|
| All 6 states | ✅ | `close_session_service.ts` L28-35: draft, in_progress, ready_for_review, finalized, locked, certified. |
| Valid transitions enforced | ✅ | `ALLOWED_TRANSITIONS` L28-35; `updateStatus` L186-194 rejects invalid. |
| Invalid transitions rejected | ✅ | `CloseSessionError` code `INVALID_TRANSITION`. Tests: `close_sessions_advance.test.ts`, `export_certified_gate.test.ts`. |
| Certified terminal (no reverse) | ✅ | `certified: []` in ALLOWED_TRANSITIONS. |
| Cannot certify unless locked | ✅ | `close_session_service.ts` L227-231: throws if status !== 'locked'. |
| Transitions logged to audit ledger | 🟡 | `recordMaterialEvent` on close_lock, certify_close (L368, L564). Not every state transition (e.g. draft→in_progress). |
| Timestamps | ✅ | `created_at`, `updated_at` on close_sessions. |
| Concurrent access | 🟡 | EXCLUDE constraint on overlapping sessions. No explicit row-level lock test for two users advancing simultaneously. |

---

### 3. Evidence Anchoring

| Item | Status | Evidence |
|------|--------|----------|
| File upload (multipart) | ✅ | `close_journal_entries.ts` L506-530: `upload.single('file')`, multer. |
| PDF / other formats | ✅ | Multer config limits by extension; `ATTACHMENT_MAX_BYTES`. |
| SHA-256 on upload | ✅ | `ingest.ts` L192; evidence API requires `hashSha256`. `evidence_storage_service.ts` stores blobs. |
| Hash linked to JE | ✅ | `evidence_repository.ts`: link object_id = journal entry id. |
| Evidence manifest assembly | ✅ | `evidence_manifest_service.ts`: builds manifest from JEs + evidence. |
| Manifest in snapshot hash | ✅ | `ledger_snapshot_service.ts` L71-72; `snapshot_hash.ts` HASH_VERSION_WITH_EVIDENCE_MANIFEST. |
| File size limits | ✅ | `ATTACHMENT_MAX_BYTES`; 413 on LIMIT_FILE_SIZE. |
| Hash mismatch blocks export | ✅ | `export_gate_service.ts` L87-98: `verifyEvidenceIntegrity` blocks on mismatch. |
| **Download evidence** | ✅ | `GET /api/close/journal-entries/:jeId/evidence/:evidenceId/download` — `close_journal_entries.ts` L642-667, `adapter.retrieve()`. |
| Storage | ✅ | `evidence_storage_service.ts`: LocalDiskStorage (default); **S3 implemented** (L106-186) via `STORAGE_ADAPTER=s3`, `EVIDENCE_S3_BUCKET`, `EVIDENCE_S3_REGION`. |

---

### 4. Snapshot & Certification

| Item | Status | Evidence |
|------|--------|----------|
| Deterministic payload | ✅ | `ledger_snapshot_service.ts` L59-74: `buildSnapshotPayloadFromInput`, `round2` for amounts. |
| Entry sort key | ✅ | `snapshot_hash.ts` L46-58: `entrySortKey` = accountName, debit, credit, lineId, accountCode, description, provenance. |
| Decimal normalization | ✅ | `round2` in decimal.ts; `normalizeMoney` in snapshot_hash. |
| Evidence manifest in snapshot | ✅ | `ledger_snapshot_service.ts` L71-72. `snapshot_hash.ts` L101, L191-202. |
| SHA-256 of snapshot | ✅ | `snapshot_hash.ts`: `hashSnapshotPayload`. |
| Ed25519 key gen | ✅ | `npm run keygen` → `src/crypto/keygen.ts`. |
| Ed25519 signing | 🟡 | `cert_signing.ts` L105-124: real `sign()` when keys set. **In dev, returns `signed: false` when keys missing.** |
| Ed25519 verification | ✅ | `verifyArtifactHash` L127-145: real verify. |
| Snapshot in DB | ✅ | `ledger_snapshots` table. |
| Immutability | ✅ | `migrations/091_append_only_triggers.sql` L22-36: triggers block UPDATE/DELETE on `ledger_snapshots`. |

---

### 5. Export Gating

| Item | Status | Evidence |
|------|--------|----------|
| Audit chain check | ✅ | `export_gate_service.ts` L77-84: `verifyChain`. |
| Snapshot hash verification | ✅ | Certified export requires chain integrity; snapshot used in binder. |
| Materiality check | ✅ | `getPeriodExportChecks` from DB; `roundingGapExceedsMateriality`, `aggregateRoundingExceedsMateriality`. Config: `financial_rules.json`, `tenant_financial_config`. |
| Unresolved conflict check | ✅ | When `ENABLE_INTEGRATED_SUPERVISOR`: `getUnresolvedConflicts`, resolution count vs ledger. |
| 403 on failure | ✅ | `export.ts` L178-198: 403 with `CRITICAL_TAMPER_ALERT`, etc. |
| Certified PDF (real data) | ✅ | `getCertifiedStatementsForBinder`, `createPdfFromStructuredPayload`. |
| Draft watermark | ✅ | `Draft_Financials_NOT_CERTIFIED.pdf`, `DRAFT — NOT CERTIFIED`. |
| Certification hash in headers | ✅ | `X-Certified-Snapshot-Hash`, `X-Certified-Snapshot-Id`. |

---

### 6. Tamper Detection / Audit Chain

| Item | Status | Evidence |
|------|--------|----------|
| Hash-chained ledger | ✅ | `audit_ledger_repository.ts`: `previous_entry_hash`, `entry_hash` per entry. |
| Chain verification | ✅ | `verifyChain` walks chain, recomputes hashes. |
| Detects mutation | ✅ | Hash mismatch → `valid: false`, `brokenAtEntryId`. |
| Detects truncation/insertion | ✅ | previous_entry_hash chain breaks. |
| Blocks export on failure | ✅ | `checkExportGate` returns `allowed: false`. |
| Hash versions | ✅ | v1 (legacy), v2 (canonical). `migrations/079_audit_ledger_hash_version.sql`. |
| **Append-only in DB** | ✅ | **`migrations/091_append_only_triggers.sql` L5-21**: triggers `audit_ledger_no_update`, `audit_ledger_no_delete` block UPDATE/DELETE. |

---

### 7. AI Boundaries

| Item | Status | Evidence |
|------|--------|----------|
| AI → staging only | ✅ | `ai_mutation_boundaries.test.ts`: AI proposals in tenant_ai_proposals; period_trial_balance empty until human resolve. |
| No AI writes to deterministic tables | ✅ | Code audit: no imports of period_trial_balance_repository, ledger_snapshot_repository in src/ai, src/agents. |
| tenant_ai_proposals | ✅ | Migration 082. Used by classifier/advisor. |
| ai_call_log | ✅ | Migration 080. |
| tenant_hitl_staging | ✅ | Migration 062. |
| Human approval flow | ✅ | `resolve-ingest` moves from staging to period_trial_balance. |
| Rejection flow | ✅ | Staging item can be rejected. |
| AI model integration | 🟡 | LLM providers via `llm/provider.ts`. Classifier/advisor use real or mock (`AI_MOCK_CLASSIFIER`, `AI_MOCK_ADVISOR`). |

---

### 8. Multi-Tenant Isolation

| Item | Status | Evidence |
|------|--------|----------|
| tenant_id on queries | ✅ | ~55+ repository files use tenant_id in WHERE. |
| Cross-tenant leakage test | ✅ | `tenant_isolation.test.ts`: Tenant B cannot access Tenant A session. `close_session_idor.test.ts`. |
| BYOD | ✅ | `tenants.database_url`; `getTenantPool` routes to tenant pool. `db/index.ts` L86-97. |
| Connection pooling | ✅ | pg.Pool per tenant; max 50 tenant pools, LRU eviction. |
| Tenant onboarding | 🟡 | `POST /api/tenants`, onboarding routes exist. Full flow depends on DB setup. |

---

### 9. API Layer

**Key endpoints (partial list):**

| Method | Path | Auth | Notes |
|--------|------|------|-------|
| GET | /health | No | Public health |
| GET | /health/ready | No | DB connectivity |
| POST | /api/auth/login, register | No | Auth routes |
| POST | /api/trial-balance/ingest | Yes* | *optionalAuth in dev |
| POST | /api/justification/chat | Yes | |
| GET | /api/audit/binder, binder/export/pdf | Yes | Certified-only |
| POST | /api/export/pdf, /api/export/csv | Yes | |
| POST | /api/close/sessions, sessions/ensure | Yes | |
| POST | /api/close/sessions/:id/advance, :id/certify | Yes | |
| POST | /api/close/journal-entries | Yes | |
| GET | /api/close/journal-entries/:jeId/evidence/:evidenceId/download | Yes | Evidence retrieval |
| POST | /api/precheck/board-ready-pack | Yes | |
| GET | /api/verification/audit-chain | Yes | |
| POST | /api/hitl/resolve-ingest | Yes | |
| PATCH | /api/tenants/:id | Yes | BYOD database_url |

**Rate limiting:** `server.ts` L96-101: 200 req/min per IP.  
**Auth:** JWT via `jsonwebtoken`. `requireAuth` or `optionalAuth` based on `REQUIRE_AUTH`.  
**Input validation:** Zod schemas on key routes (ingest, close, etc.).  
**Integration tests:** full_close_flow, export_certified_gate, close_sessions_advance, tenant_isolation, evidence_attachment_api, trial_balance_parsing_edge_cases, integrity_gate_422, ai_mutation_boundaries, snapshot_verification, audit_chain_verification, large_trial_balance, evidence_policy_enforcement, evidence_file_upload_download. Many endpoints have no dedicated test.

---

### 10. Frontend / UI

| Item | Status | Evidence |
|------|--------|----------|
| Frontend exists | ✅ | Next.js app under `frontend/`. |
| Framework | ✅ | Next.js, React, Tailwind. |
| Pages | ✅ | `login`, `register`, `page` (dashboard), `consolidation`, `auditor`, `diagnostics`, `genui`. |
| Login and use | ✅ | Auth context, API client. User can log in and interact. |
| API-only fallback | ✅ | Backend runs standalone; frontend is optional. |

---

## PART 2: TEST COVERAGE ANALYSIS

**Test location:** `tests/` (package `cpacfa-validation-tests`).

| Category | Count | Files |
|----------|-------|-------|
| Unit tests | 45+ | `unit/*.test.ts` |
| Integration tests | 41 | `integration/*.test.ts` |
| Smoke tests | 3 | `smoke/*.test.ts` (jest.smoke.config.json) |

**Unit test examples:** ledger_snapshot_hash, cert_signing, export_gate_service, evidence_storage_service, audit_ledger_service, close_session_service, pilot_production_hardening, startup_validation, vector_store_tenant_isolation.

**Integration test examples:** full_close_flow, export_certified_gate, close_sessions_advance, tenant_isolation, evidence_attachment_api, evidence_file_upload_download, trial_balance_parsing_edge_cases, integrity_gate_422, ai_mutation_boundaries, snapshot_verification, audit_chain_verification, large_trial_balance, evidence_policy_enforcement, append_only_triggers, certification_pipeline.

**Test run (partial output):**

- **PASS:** issue_item_service, recon_service, ledger_snapshot_hash, evidence_policy_enforcement, coa_quickbooks_ingest, audit_chain_verification, schema_smoke, integrity_gate_422, and many others.
- **FAIL (TypeScript/API drift):**
  - `session_centric_hardening.test.ts` L188-191: `initializeChecklistTemplate` expects 3 args (tenantId added); `listChecklistItemsBySessionId` expects tenantId; `updateChecklistItemStatus` arg shape changed.
  - `close_checklist_readiness_service.test.ts` L56, L69: `initializeChecklistTemplate(mockPool, 'sess-1')` — missing tenantId.
  - `evidence_manifest_certification.test.ts` L119: `linkEvidenceToJournalEntry` missing `assertionType`.
- **FAIL (test logic):**
  - `append_only_triggers.test.ts`: ON CONFLICT DO UPDATE on period_trial_balance triggers the certified-session UPDATE block (test setup inserts certified session then does upsert).

**Features with zero/minimal coverage:** Some close sub-routes (adjustments, recon, materiality), config endpoints, onboarding wizard, coa-mapping apply.

**CI/CD:** `.github/workflows/ci.yml` — lint, test (with Postgres service), build, Docker build. Tests run from `tests/` with `DATABASE_URL`, `JWT_SECRET`, `NODE_ENV=test`.

---

## PART 3: DATABASE / SCHEMA AUDIT

**Tables (migrations 001–093+):** tenants, users, audit_ledger, ledger_snapshots, close_sessions, period_trial_balance, tenant_hitl_staging, tenant_ai_proposals, evidence, journal_entries, period_locks, period_export_checks, statement_registry, coa_mapping, fs_taxonomy_lines, coa_mapping_rules, and many domain tables (leases, fixed_assets, revenue_recognition, risk_context_conflicts, etc.).

**audit_ledger:** Migration 091 — `audit_ledger_no_update`, `audit_ledger_no_delete` triggers block UPDATE/DELETE. **Truly append-only at DB level.**

**ledger_snapshots:** Migration 091 — triggers block UPDATE/DELETE. Immutable.

**period_trial_balance:** Migration 091 — blocks UPDATE/DELETE when linked close_session is certified.

**Indexes:** Most critical tables have `tenant_id` and common query indexes (e.g. `idx_audit_ledger_tenant_id`, `idx_audit_ledger_tenant_created`).

**Foreign keys:** Present on many tables (e.g. close_sessions → tenants; journal_entries → close_sessions).

**Migrations:** `src/db/migrate.ts` runs migrations in order. Fresh DB via `db:reset`, `db:migrate`. Tenant migrations run per tenant when BYOD.

**Database support:** Postgres only (pg driver). No SQLite.

---

## PART 4: DEPLOYMENT READINESS

| Item | Status | Evidence |
|------|--------|----------|
| Dockerfile | ✅ | Root `Dockerfile` — multi-stage Node 20 Alpine. HEALTHCHECK on port 3000. **Note:** Server defaults to PORT 3001 when unset; docker-compose sets PORT=3000. |
| docker-compose | ✅ | `docker-compose.yml`, `docker-compose.demo.yml` — app + Postgres. |
| Env config | 🟡 | `.env.example` documents vars. Required: DATABASE_URL, JWT_SECRET. Prod/demo: CERT_SIGNING_* keys. |
| Startup validation | ✅ | `startup_validation.ts` — checks DATABASE_URL, DB connection, migrations, storage path. Fails fast. |
| Logging | 🟡 | Structured logs (timestamp, level, requestId). No Sentry/DataDog integration. |
| Health check | ✅ | `GET /health`, `GET /health/ready`. |
| CORS | ✅ | Configurable via CORS_ORIGINS / CORS_ORIGIN. |
| HTTPS/TLS | 🟡 | Handled by reverse proxy; app does not terminate TLS. |

---

## PART 5: DEMO READINESS ASSESSMENT

### Q1: Can I demo this to a controller at a mid-market company TODAY?

**Partial yes.** They could: upload a trial balance CSV/XLSX, create a close session, advance through states, attach evidence (upload + download), certify, and export a PDF. Debits=credits and plug detection would be visible. **What would break or confuse:** (1) Ed25519 returns `signed: false` in dev without keys—signatures appear missing. (2) Auth can be off in dev, which would alarm them. (3) No guided "first close" wizard end-to-end in the UI. (4) Balance sheet classification can fail if CoA mapping is off. **They'd ask:** "Where are my actual evidence files?" — **Answer:** Evidence can be stored locally or in S3; download exists. "Can I map my QuickBooks export automatically?" — CoA templates exist; full auto-mapping is partial.

### Q2: Can I demo this to an audit innovation partner at a mid-tier firm TODAY?

**Partial yes.** Strengths: hash-chained audit ledger, DB-enforced append-only, deterministic snapshot, Ed25519 when keys set, export gating on chain/snapshot/evidence, AI boundaries enforced, evidence manifest in snapshot hash. **Concerns:** (1) Ed25519 returns `signed: false` in dev without keys—looks like a stub. (2) No formal "who certified when" audit trail beyond DB columns (could be added). (3) Resolution mismatch / integration checks are conditional on `ENABLE_INTEGRATED_SUPERVISOR`. **They'd ask:** "Can I verify the chain independently?" — **Yes**, verification endpoints. "Where is the evidence integrity proof?" — Manifest in snapshot hash; `verifyEvidenceIntegrity` blocks export on mismatch.

### Q3: Can I demo this to a PE operating partner TODAY?

**Partial yes.** They'd see: close workflow, checklist, certification, export, multi-tenant isolation. **Missing:** Multi-entity rollup dashboards (consolidation page exists but may be thin), portfolio analytics (migrations exist, integration unclear), LBO/DCF models (migrations 033, 043), robust accounting integrations (QuickBooks/Xero/NetSuite scaffolded). **They'd want:** "Show me all my portfolio companies' closes" and "One-click sync from QuickBooks"—those are scaffolded, not production-ready.

---

## Critical Gaps (Ranked)

1. **Ed25519 in dev** — Signing is a silent no-op without keys. Demo setup must run `npm run keygen` and set CERT_SIGNING_* in .env.
2. **Auth bypass in dev** — REQUIRE_AUTH=false allows unauthenticated API. Must be clearly dev-only; MODE=demo/prod enforces auth.
3. **Failing integration tests** — session_centric_hardening, close_checklist_readiness_service, evidence_manifest_certification have API/signature drift. append_only_triggers test logic needs adjustment.
4. **Docker HEALTHCHECK port** — Dockerfile HEALTHCHECK uses 3000; server default is 3001. docker-compose sets PORT=3000; standalone Docker build may need PORT=3000 in CMD or ENV.
5. **Concurrent certify** — No proven handling of two users certifying simultaneously; EXCLUDE constraint prevents overlapping sessions but not race on advance.
6. **Materiality source** — Rounding/materiality from DB only; ensure all paths populate period_export_checks.

---

## 30-Day Sprint Plan (Demo-Ready)

| Week | Priority | Tasks |
|------|----------|-------|
| 1 | Signing & tests | Document `npm run keygen` and CERT_SIGNING_* for demo. Fix session_centric_hardening, close_checklist_readiness_service, evidence_manifest_certification, append_only_triggers. |
| 2 | Auth & env | Enforce REQUIRE_AUTH=true for MODE=demo/prod. Add "Demo in 5 minutes" README section with required env vars. |
| 3 | Docker & CI | Align Dockerfile HEALTHCHECK with PORT. Verify docker-compose demo flow. Ensure CI passes. |
| 4 | Demo polish | Add "who certified when" to export/binder. Clarify materiality config path. Optional: guided first-close wizard in UI. |

---

*Audit produced from direct code inspection and test run (partial). Re-run full test suite with `cd tests && npm test` and DATABASE_URL set for definitive pass/fail counts.*
