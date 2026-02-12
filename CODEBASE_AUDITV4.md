# CODEBASE AUDIT V4 — Production & Demo Readiness

**Audit Date:** 2026-02-12  
**Scope:** Full codebase — trial balance, close sessions, evidence, certification, export, audit chain, AI, multi-tenant, API, frontend.  
**Purpose:** Determine readiness to demo to audit firms, PE operating partners, and controllers. **Brutally honest.**

---

## Executive Summary

**Are we ready?** No. The platform has a strong foundation—close session state machine, audit ledger hash chain, Ed25519 signing, export gating—but critical gaps block production use. **22 repository queries lack tenant_id filtering** (documented in TENANT_ISOLATION_SQL_AUDIT.md), meaning cross-tenant data leakage is possible. The AI boundary is DB-enforced when roles are configured, but migration 093 is optional and most environments run without it. Tests currently fail (startup_validation, others). The frontend exists but is skeletal; most workflows are API-only. **Recommendation:** Fix tenant isolation and test failures before any demo to financial professionals.

---

## PART 1: Feature-by-Feature Status

### 1. Trial Balance Ingestion

| Capability | Status | Evidence |
|------------|--------|----------|
| CSV parsing (BOM, CRLF, quoted fields) | 🟡 PARTIALLY BUILT | `fileIngestion.ts` L37-43: `parse()` with `bom: true`, `trim: true`, `relax_column_count: true`. No explicit CRLF/quoted-field tests. |
| Scientific notation, formulas | 🔴 STUBBED/MOCKED | `trialBalanceParser.ts` L22-31: `parseAmount()` uses `parseFloat(s)`—scientific notation works implicitly; Excel formulas NOT parsed (xlsx returns computed values). |
| XLSX parsing | ✅ PRODUCTION-READY | `fileIngestion.ts` L57-86: `XLSX.read()`, first sheet, header row 0. |
| Debit = Credit validation | ✅ PRODUCTION-READY | `trialBalanceParser.ts` L66-71: tolerance 0.01, `balances` flag, errors array. |
| Balance sheet equation (A = L + E) | ✅ PRODUCTION-READY | `integrity_gate_service.ts` L153+: `runIntegrityGate()` validates equation. |
| Plug/suspense detection | ✅ PRODUCTION-READY | `integrity_gate_service.ts` L13-77: `detectSuspiciousPlugs()`, pattern `^(Miscellaneous|Suspense|Other)`, configurable threshold (default 0.9). |
| HITL staging when imbalanced | ✅ PRODUCTION-READY | `ingest.ts` L204-228: `createStagingItem()` with `poolAi`, `tenant_hitl_staging`. |
| Multiple CoA formats | 🟡 PARTIALLY BUILT | `parser_utils.ts`: variants for Dr/Cr, AccountName, etc. `coa_template_service.ts` maps QuickBooks, NetSuite, Xero. Not all formats tested. |
| Row limits (real max) | ✅ PRODUCTION-READY | `ingest.ts` L156-162: `MAX_TB_ROWS ?? 100_000`. `large_trial_balance.test.ts` L265: 100,001 rows → 413. 50k rows ~90–104s (analysis/LARGE_TB_PERFORMANCE_RESULTS.md). |

---

### 2. Close Session State Machine

| Capability | Status | Evidence |
|------------|--------|----------|
| All 6 states | ✅ PRODUCTION-READY | `close_session.ts` L10-16: draft, in_progress, ready_for_review, finalized, locked, certified. |
| Valid transitions enforced | ✅ PRODUCTION-READY | `close_session_service.ts` L27-34: `ALLOWED_TRANSITIONS` map; `updateStatus()` validates. |
| Invalid transitions rejected | ✅ PRODUCTION-READY | `CloseSessionError` code `INVALID_TRANSITION`; `close_sessions.ts` returns 409. |
| Certified terminal | ✅ PRODUCTION-READY | `ALLOWED_TRANSITIONS.certified = []`. |
| Cannot certify unless locked | ✅ PRODUCTION-READY | `certifyCloseSession` L261-266: `if (lockedStatus !== 'locked') throw`. |
| Every transition logged | ✅ PRODUCTION-READY | `recordMaterialEvent()` for close_lock, certify_close, advance. |
| Timestamps on transitions | ✅ PRODUCTION-READY | `close_sessions` has `updated_at`, `certified_at`. |
| Concurrent access | ✅ PRODUCTION-READY | `certifyCloseSession` L253-256: `SELECT ... FOR UPDATE`; `advanceSession` uses `withTransaction` + row lock. Second concurrent certify blocks then gets INVALID_TRANSITION. |

---

### 3. Evidence Anchoring

| Capability | Status | Evidence |
|------------|--------|----------|
| File upload formats | 🟡 PARTIALLY BUILT | `evidence_attachment_service.ts`: PDF, PNG, JPEG, CSV, XLSX (ATTACHMENT_ALLOWED_MIMES). |
| SHA-256 on upload | ✅ PRODUCTION-READY | `evidence_storage_service.ts`: hash computed; `evidence_records` has `hash_sha256`. |
| Hash linked to JE | ✅ PRODUCTION-READY | `evidence_links` table: `object_type`, `object_id` (journal entry). |
| Evidence manifest assembly | ✅ PRODUCTION-READY | `evidence_manifest_service.ts` L26-76: `buildEvidenceManifest()`, sorted by journalEntryId, evidenceId. |
| Manifest in snapshot hash | ✅ PRODUCTION-READY | `close_session_service.ts` L329-347: `buildEvidenceManifest` passed to `createSnapshotFromTrialBalanceAndEntries`; `ledger_snapshot_service.ts` L72-74: `evidenceManifest` in payload. |
| File size limits | ✅ PRODUCTION-READY | `EVIDENCE_ATTACHMENT_MAX_BYTES` default 20MB; `evidence_upload_limits.test.ts`. |
| Hash mismatch detection | ✅ PRODUCTION-READY | `export_gate_service.ts` L127-138: `verifyEvidenceIntegrity`; blocks export on mismatch. |
| Download evidence | ✅ PRODUCTION-READY | `close_journal_entries.ts` L642: `GET /journal-entries/:jeId/evidence/:evidenceId/download`. |
| Storage backend | ✅ PRODUCTION-READY | `evidence_storage_service.ts`: `STORAGE_ADAPTER=local|s3`. Local: `EVIDENCE_STORAGE_PATH` or `./data/evidence`. S3 when configured. |

---

### 4. Snapshot & Certification

| Capability | Status | Evidence |
|------------|--------|----------|
| Deterministic payload | ✅ PRODUCTION-READY | `ledger_snapshot_service.ts` L59-75: `buildSnapshotPayloadFromInput`, `round2` for amounts. |
| Entries sorted deterministically | ✅ PRODUCTION-READY | `snapshot_hash.ts` L47-59: `entrySortKey` = accountName, debit, credit, lineId, accountCode, description, provenance. |
| Decimal normalization | ✅ PRODUCTION-READY | `utils/decimal.ts`: `round2`, `normalizeMoney`. `round2` = 2 decimal places. |
| Evidence manifest in snapshot | ✅ PRODUCTION-READY | `ledger_snapshot_service.ts` L72-74; `snapshot_hash.ts` supports `evidenceManifest` in payload. |
| SHA-256 of snapshot | ✅ PRODUCTION-READY | `snapshot_hash.ts`: `hashSnapshotPayload`, `hashSnapshotPayloadLegacy`. Hash versions 1, 2, 3. |
| Ed25519 key generation | ✅ PRODUCTION-READY | `crypto/keygen.ts`: `generateKeyPairSync('ed25519')`. |
| Ed25519 signing | ✅ PRODUCTION-READY | `cert_signing.ts` L51-82: real Node `crypto.sign()`, not stub. Auto-generated in dev when keys missing. |
| Ed25519 verification | ✅ PRODUCTION-READY | `cert_signing.ts`: `verify()`; `verification/certification.ts` POST /verify. |
| Snapshot stored in DB | ✅ PRODUCTION-READY | `ledger_snapshot_repository.ts`; `ledger_snapshots` table. |
| Snapshot immutability | ✅ PRODUCTION-READY | `091_append_only_triggers.sql` L24-39: triggers block UPDATE/DELETE on ledger_snapshots. |

---

### 5. Export Gating

| Capability | Status | Evidence |
|------------|--------|----------|
| Audit chain check | ✅ PRODUCTION-READY | `export_gate_service.ts` L118-125: `verifyChain()`; blocks on invalid. |
| Snapshot hash verification | 🟡 PARTIALLY BUILT | Chain includes certify_close; snapshot integrity via chain. No explicit "re-hash snapshot and compare" in gate. |
| Materiality threshold | ✅ PRODUCTION-READY | `materiality_config_service.ts`: `getEffectiveMateriality()`; `absoluteThreshold`, `relativeThreshold` (default 0.5%). Configurable via `config/materiality` API. |
| Unresolved conflict check | ✅ PRODUCTION-READY | `export_gate_service.ts` L142-165: `ENABLE_INTEGRATED_SUPERVISOR`, `getUnresolvedConflicts`. |
| 403 on failure | ✅ PRODUCTION-READY | `export.ts` L194-200: `res.status(403)`, `alert`, `message`. |
| Certified PDF generation | ✅ PRODUCTION-READY | `export.ts`: `getCertifiedStatementsForBinder`, `statementsToExportPayload`, real PDF via pdf-lib. Not placeholder. |
| Draft PDF watermark | 🟡 PARTIALLY BUILT | Draft mode exists; watermark behavior depends on PDF builder implementation. |
| Certification hash in headers | ✅ PRODUCTION-READY | `audit_export_service.ts` / binder: certification hash in response. |

---

### 6. Tamper Detection / Audit Chain

| Capability | Status | Evidence |
|------------|--------|----------|
| Hash-chained ledger | ✅ PRODUCTION-READY | `audit_ledger_repository.ts`: `appendEntry`, `previousEntryHash` from `getLatestHash`. |
| Chain verification | ✅ PRODUCTION-READY | `audit_ledger_repository.ts`: `verifyChain` walks entries, recomputes hashes. |
| Detects mutation | ✅ PRODUCTION-READY | Hash mismatch → `valid: false`. |
| Detects truncation | ✅ PRODUCTION-READY | Chain walk would fail on broken link. |
| Detects insertion | 🟡 PARTIALLY BUILT | Verification walks by `created_at` order; insertion detection implicit if order broken. |
| Blocks export on failure | ✅ PRODUCTION-READY | `export_gate_service.ts` L119-125. |
| Hash versions | ✅ PRODUCTION-READY | `audit_ledger_repository.ts` L24-25: v1 (legacy), v2 (canonical). `079_audit_ledger_hash_version.sql`. |
| Append-only in DB | ✅ PRODUCTION-READY | `091_append_only_triggers.sql` L5-21: triggers block UPDATE/DELETE on audit_ledger. |

---

### 7. AI Boundaries

| Capability | Status | Evidence |
|------------|--------|----------|
| AI → staging only | ✅ PRODUCTION-READY | `ai_boundary.ts`: `assertNoAiMutationContext`; AI writes to `tenant_ai_proposals`, `ai_call_log`, `tenant_hitl_staging`. |
| DB-enforced (no core writes) | 🟡 PARTIALLY BUILT | Migration 093: `ai_writer` role, schema separation. **Only when `AI_BOUNDARY_DB_ROLES=true` and roles created.** Default: no separation; app-level guard only. |
| tenant_ai_proposals | ✅ PRODUCTION-READY | Table, repository, used in ingest. |
| ai_call_log | ✅ PRODUCTION-READY | `ai_call_log_repository.ts`, `callAIWithSchema`. |
| tenant_hitl_staging | ✅ PRODUCTION-READY | `persistence_service.ts`, HITL flow. |
| Human approval flow | ✅ PRODUCTION-READY | resolve-ingest, approve/reject → core tables via protocol_bridge. |
| Rejection flow | ✅ PRODUCTION-READY | `persistence_service.rejectStagingItem`. |
| AI model integration | 🟡 PARTIALLY BUILT | `claude_adapter.ts` → `llm/provider.ts` → Anthropic/OpenAI/Mistral. **Tests use AI_MOCK=true.** Production: real API key required. |

---

### 8. Multi-Tenant Isolation

| Capability | Status | Evidence |
|------------|--------|----------|
| tenant_id on queries | 🔴 STUBBED/MOCKED | **TENANT_ISOLATION_SQL_AUDIT.md: 22 MUST FIX.** Queries in triage_assessment, recon, close_checklist_item, statement_package, ledger_snapshot, journal_entry, evidence repos lack tenant_id or validate via JOIN. |
| Cross-tenant test | ✅ PRODUCTION-READY | `tenant_isolation.test.ts`: Tenant B cannot access Tenant A's close_session, journal_entry, etc. |
| BYOD support | ✅ PRODUCTION-READY | `db/index.ts`: `tenants.database_url`; `getOrCreateTenantPool(url)`. |
| Connection pooling | ✅ PRODUCTION-READY | `tenantPoolsByUrl` Map, LRU eviction, max 50. |
| Tenant onboarding | 🟡 PARTIALLY BUILT | `tenant_onboarding_completeness.test.ts`; `tenants` table. Manual INSERT or script; no self-service UI. |

---

### 9. API Layer

| Capability | Status | Evidence |
|------------|--------|----------|
| Endpoints | ✅ PRODUCTION-READY | 60+ routes across trial-balance, close, audit, export, hitl, auth, config, etc. |
| Auth required | ✅ PRODUCTION-READY | JWT via `requireAuth`, `optionalAuth`. `attachTenantPool`, `requireTenantContext`. |
| Request/response schemas | 🟡 PARTIALLY BUILT | `validateBody(schema)` on many routes; Zod schemas in `schemas/`. Not all endpoints validated. |
| Integration tests | 🟡 PARTIALLY BUILT | Many integration tests exist; some endpoints untested. |
| Rate limiting | ✅ PRODUCTION-READY | `server.ts` L97-101: `apiLimiter` 200 req/min per IP. |
| Input validation | 🟡 PARTIALLY BUILT | `validateBody` where applied; raw `req.body` casts elsewhere. |

---

### 10. Frontend / UI

| Capability | Status | Evidence |
|------------|--------|----------|
| Frontend exists | ✅ PRODUCTION-READY | `frontend/` — Next.js 14, React, Tailwind. |
| Pages | 🟡 PARTIALLY BUILT | `app/page.tsx`, `login/page.tsx`, `register/page.tsx`, `auditor/`, `consolidation/`, `diagnostics/`, `genui/`. |
| Login and use in browser | 🟡 PARTIALLY BUILT | Login page exists; full close workflow via UI not complete. Most flows are API/CLI. |
| Framework | ✅ PRODUCTION-READY | Next.js 14.2.3, React 18, Tailwind. |

---

## PART 2: Test Coverage Analysis

### Test Files (102 total)

- **Unit:** 46 files (e.g. `ai_boundary.test.ts`, `cert_signing.test.ts`, `close_session_service.test.ts`)
- **Integration:** 48 files (e.g. `ai_mutation_boundaries.test.ts`, `certification_pipeline.test.ts`, `tenant_isolation.test.ts`)
- **Smoke:** 3 files
- **Sovereign validator:** 1

### Test Results (Actual Run — 2026-02-12)

```
PASS unit/protocol_bridge.test.ts
PASS unit/journal_entry_service.test.ts
FAIL unit/close_session_service.test.ts — "Transition from in_progress to in_progress is not allowed" (test expects advance to locked to emit close_lock; test setup may be wrong)
FAIL unit/startup_validation.test.ts — 2 failures:
  1. Expected "JWT_SECRET is required when REQUIRE_AUTH=true." but received "JWT_SECRET is required when auth is enforced." (startup_validation.ts L42)
  2. Same in "collects all env errors" test
PASS integration/evidence_repository.test.ts
PASS integration/audit_binder_chain_verification.test.ts
PASS integration/je_post_error_codes.test.ts
PASS integration/append_only_triggers.test.ts
FAIL integration/ai_db_boundary.test.ts — "permission denied to set role ai_writer" (migration 093 not applied to test DB; ai_writer role does not exist)
PASS integration/board_ready_pack.test.ts
```

**Summary:** Multiple suites pass; at least 3 suites fail. Failures are:
1. **startup_validation** — test expects old error message; code now says "auth is enforced"
2. **close_session_service** — test logic expects different advance behavior
3. **ai_db_boundary** — requires migration 093 + role setup; test DB does not have ai_writer role

### Features with Zero or Weak Coverage

- Tenant isolation SQL fixes (22 queries) — no regression tests for fixed queries
- Some pipelines (bank, ar-aging, etc.) — stub implementations
- Frontend flows — no E2E tests

### CI/CD

- `.github/workflows/ci.yml`: lint, test, green-gate (security profile invariants), build (Docker)
- Postgres 16 service for tests

---

## PART 3: Database / Schema Audit

### Tables (94 migrations)

- Control: `tenants`, `users`, `schema_migrations`, `scheduler_locks`, `jobs`
- Tenant: 80+ tables across core, ai, audit (post-093) or public (pre-093)

### Indexes

- `audit_ledger`: `tenant_id`, `(tenant_id, created_at)`, `(tenant_id, event_type)`
- `journal_entries`, `close_sessions`, `period_trial_balance`: tenant_id indexes

### Foreign Keys

- `journal_entry_lines` → `journal_entries`
- Many tables reference `close_session_id`, `tenant_id`

### audit_ledger Append-Only

- **Yes.** `091_append_only_triggers.sql`: `BEFORE UPDATE` and `BEFORE DELETE` triggers raise exception.

### Migrations

- Control: 001, 002, 010, 075
- Tenant: 003–093 (093 = AI boundary schemas)
- Fresh DB: `npm run db:migrate` + `npm run db:migrate --tenant` (or `migrate:tenant`)

### Database Support

- **Postgres only.** No SQLite.

---

## PART 4: Deployment Readiness

| Item | Status | Evidence |
|------|--------|----------|
| Dockerfile | ✅ | Multi-stage, Node 20 Alpine |
| docker-compose | ✅ | `docker-compose.yml`, `docker-compose.demo.yml` |
| Env vars | ✅ | `.env.example`; DATABASE_URL, JWT_SECRET, CERT_SIGNING_* required in prod |
| Startup validation | ✅ | `runStartupValidation()`: env, DB, migrations, storage, signing keys, AI boundary grants (when AI_BOUNDARY_DB_ROLES) |
| Logging | 🟡 | `lib/logger.ts`; structured JSON logs. No Sentry/DataDog integration. |
| Health check | ✅ | `GET /health`, `GET /health/ready` |
| CORS | ✅ | `CORS_ORIGINS` or default localhost |
| HTTPS/TLS | ⬛ MISSING | No TLS termination in app; expect reverse proxy (nginx, cloud load balancer) |

---

## PART 5: Demo Readiness Assessment

### Question 1: "Can I demo this to a controller at a mid-market company TODAY?"

**Partial.** They could:

- Upload a trial balance CSV/XLSX, see Balance Sheet + P&L
- Use the close workflow (draft → certified) via API
- See evidence anchoring and certification artifacts

**Would break or concern:**

- No polished UI; mostly API/Postman
- Tenant isolation bugs: 22 queries can leak data across tenants
- Tests failing (startup_validation)
- Demo user seeding works, but onboarding flow is manual

### Question 2: "Can I demo this to an audit innovation partner TODAY?"

**Partial.** They would be impressed by:

- Hash-chained audit ledger, append-only DB triggers
- Ed25519-signed certification artifacts
- Export gating (chain verification, materiality)
- AI boundary (when configured) and staging flow

**Would concern them:**

- Tenant isolation gaps (would fail a SOC2-style review)
- Migration 093 (AI boundary) not run by default — AI could write core if misconfigured
- Lack of full audit trail UI

### Question 3: "Can I demo this to a PE operating partner TODAY?"

**Partial.** They would want:

- **Have:** Multi-entity/tenant structure, BYOD, close state machine
- **Missing:** Portfolio-level rollup, fund-level reporting, operating partner dashboard
- **Missing:** Clear "portfolio health" or KPI view across investments

---

## Critical Gaps (Ranked for Demo Readiness)

1. **P0: Fix tenant isolation** — 22 repository queries must add tenant_id filtering or JOIN to close_sessions. Documented in TENANT_ISOLATION_SQL_AUDIT.md.
2. **P0: Fix failing tests** — startup_validation.test.ts and any others; update assertions to match current error messages.
3. **P1: Run migration 093 by default** — Or document that AI_BOUNDARY_DB_ROLES + role setup is required for secure AI boundary.
4. **P1: Frontend close workflow** — End-to-end UI for ingest → advance → certify for demo.
5. **P2: Evidence download UX** — Ensure evidence download is accessible from UI.
6. **P2: Structured error tracking** — Sentry or equivalent for production.

---

## 30-Day Sprint Plan (Demo-Ready)

| Week | Focus | Deliverables |
|------|-------|--------------|
| 1 | Tenant isolation | Fix all 22 MUST FIX queries; add regression tests |
| 1 | Tests | Fix startup_validation and any other failing tests |
| 2 | AI boundary | Document and optionally auto-apply 093 in demo/prod |
| 2 | Frontend | Close session list, advance button, certify flow |
| 3 | Controller demo script | Step-by-step: ingest CSV → advance → certify → export PDF |
| 3 | Auditor demo script | Show chain verification, evidence manifest, signing |
| 4 | Polish | Error messages, rate limit responses, health check docs |

---

## Feature Status Summary Table

| Feature Area | Overall | Notes |
|--------------|---------|-------|
| 1. Trial Balance Ingestion | 🟡 | CSV/XLSX, D=C, A=L+E, plug detection, HITL. Scientific/formulas edge cases. |
| 2. Close Session State Machine | ✅ | All states, transitions, locks, audit logging. |
| 3. Evidence Anchoring | ✅ | Upload, hash, manifest, download, local/S3. |
| 4. Snapshot & Certification | ✅ | Deterministic hash, Ed25519, evidence in snapshot. |
| 5. Export Gating | ✅ | Chain, materiality, conflicts, 403, real PDF. |
| 6. Tamper Detection | ✅ | Hash chain, append-only triggers. |
| 7. AI Boundaries | 🟡 | DB-enforced when configured; app guard always. |
| 8. Multi-Tenant | 🔴 | 22 queries need tenant_id; cross-tenant test exists. |
| 9. API Layer | 🟡 | 60+ endpoints, auth, rate limit; validation partial. |

### API Endpoints (representative)

- **Auth:** POST /api/auth/login, POST /api/auth/register
- **Trial Balance:** POST /api/trial-balance/ingest
- **Close:** POST /api/close/sessions/ensure, GET/POST /api/close/sessions/:id, POST /api/close/sessions/:id/advance, POST /api/close/sessions/:id/certify
- **Journal Entries:** CRUD, propose/approve/reject/post, evidence upload/download
- **Export:** POST /api/export/pdf, POST /api/export/csv
- **Audit:** /api/audit/binder, /api/audit/pbc-index, /api/audit/reconciliation
- **Verification:** GET /api/verification/public-key, POST /api/verification/verify, GET /api/verification/audit-chain
- **Config:** GET/PUT /api/config/materiality
- **Pipelines:** POST /api/pipelines/bank, ar-aging, bank-rec, etc. (some stubbed)
| 10. Frontend | 🟡 | Next.js exists; workflows incomplete. |

---

*End of CODEBASE_AUDITV4.md*
