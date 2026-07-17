# Codebase Audit V2 — Production & Demo Readiness

**Date:** February 2025  
**Scope:** Full codebase audit for demo readiness to audit firms, PE operating partners, and controllers.

---

## Executive Summary

**The system is NOT production-ready for demo to financial professionals today.** The core certification pipeline (trial balance → close session → certify → export) is **substantially implemented** with real logic, deterministic hashing, Ed25519 signing, and audit ledger chain verification. However: (1) The frontend is a diagnostic/lab redirect, not a controller-facing product UI. (2) Several integration tests are flaky or skipped. (3) AI classification is connected to real LLMs (Claude) with mocks available; architectural boundaries exist but are convention-based, not enforced. (4) Evidence storage supports local + S3 but PDF-only evidence upload is tested; multi-format support is limited. (5) Concurrent close-session operations expose ECONNRESET under load. A focused 30-day sprint on demo hardening—fixing flaky tests, stabilizing the frontend dashboard, and adding clear error messages—could make a controlled demo viable for a skeptical audience.

---

## PART 1: Feature-by-Feature Status

### Feature Status Table

| Capability | Status | Classification |
|------------|--------|----------------|
| 1. Trial Balance Ingestion | | |
| — CSV parsing (BOM, CRLF, quoted, scientific, formulas) | ✅ | PRODUCTION-READY |
| — XLSX parsing | ✅ | PRODUCTION-READY |
| — Debit = Credit validation | ✅ | PRODUCTION-READY |
| — Balance sheet equation (A = L + E) | ✅ | PRODUCTION-READY |
| — Plug/suspense detection | ✅ | PRODUCTION-READY |
| — HITL staging when imbalanced | ✅ | PRODUCTION-READY |
| — Multiple CoA formats | 🟡 | PARTIALLY BUILT |
| — Row limits (100k default, tested) | ✅ | PRODUCTION-READY |
| 2. Close Session State Machine | | |
| — All 6 states | ✅ | PRODUCTION-READY |
| — Valid transitions enforced | ✅ | PRODUCTION-READY |
| — Invalid transitions rejected | ✅ | PRODUCTION-READY |
| — Certified terminal, locked before certify | ✅ | PRODUCTION-READY |
| — Audit ledger logging | ✅ | PRODUCTION-READY |
| — Concurrent access handling | 🟡 | PARTIALLY BUILT |
| 3. Evidence Anchoring | | |
| — File upload (PDF) | ✅ | PRODUCTION-READY |
| — SHA-256 hash on upload | ✅ | PRODUCTION-READY |
| — Link to journal entry | ✅ | PRODUCTION-READY |
| — Evidence manifest assembly | ✅ | PRODUCTION-READY |
| — Manifest in snapshot hash | ✅ | PRODUCTION-READY |
| — File size limits | ✅ | PRODUCTION-READY |
| — Download evidence | ✅ | PRODUCTION-READY |
| — Storage: local + S3 configurable | ✅ | PRODUCTION-READY |
| 4. Snapshot & Certification | | |
| — Deterministic payload construction | ✅ | PRODUCTION-READY |
| — Deterministic sort key | ✅ | PRODUCTION-READY |
| — Decimal normalization (2 dp) | ✅ | PRODUCTION-READY |
| — Evidence manifest in snapshot | ✅ | PRODUCTION-READY |
| — SHA-256 hash | ✅ | PRODUCTION-READY |
| — Ed25519 signing (real) | ✅ | PRODUCTION-READY |
| — Ed25519 verification | ✅ | PRODUCTION-READY |
| — Snapshot immutability (DB triggers) | ✅ | PRODUCTION-READY |
| 5. Export Gating | | |
| — Audit chain check before export | ✅ | PRODUCTION-READY |
| — Snapshot hash verification | ✅ | PRODUCTION-READY |
| — Materiality threshold (configurable) | ✅ | PRODUCTION-READY |
| — Unresolved conflict check | ✅ | PRODUCTION-READY |
| — 403 on failure with error codes | ✅ | PRODUCTION-READY |
| — Certified PDF (real financial data) | ✅ | PRODUCTION-READY |
| — Draft PDF watermark | ✅ | PRODUCTION-READY |
| 6. Tamper Detection / Audit Chain | | |
| — Hash-chained audit ledger | ✅ | PRODUCTION-READY |
| — previous_entry_hash | ✅ | PRODUCTION-READY |
| — Chain verification | ✅ | PRODUCTION-READY |
| — Detect mutation, truncation, insertion | ✅ | PRODUCTION-READY |
| — Append-only DB (triggers) | ✅ | PRODUCTION-READY |
| — Hash versions v1, v2 | ✅ | PRODUCTION-READY |
| 7. AI Boundaries | | |
| — AI → staging tables | 🟡 | PARTIALLY BUILT |
| — Deterministic tables protected | 🟡 | Convention, not enforced |
| — tenant_ai_proposals used | ✅ | PRODUCTION-READY |
| — ai_call_log used | ✅ | PRODUCTION-READY |
| — tenant_hitl_staging used | ✅ | PRODUCTION-READY |
| — Human approval flow | ✅ | PRODUCTION-READY |
| — AI model integration (Claude) | ✅ | PRODUCTION-READY |
| 8. Multi-Tenant Isolation | | |
| — tenant_id on queries | ✅ | Verified in repos |
| — Cross-tenant leakage test | ✅ | PRODUCTION-READY |
| — BYOD support | ✅ | PRODUCTION-READY |
| — Connection pooling | ✅ | PRODUCTION-READY |
| — Tenant onboarding | ✅ | PRODUCTION-READY |
| 9. API Layer | | |
| — Endpoints exist | ✅ | 100+ routes |
| — Auth (JWT) | ✅ | PRODUCTION-READY |
| — Rate limiting | ✅ | PRODUCTION-READY |
| — Input validation | 🟡 | Many schemas; gaps |
| 10. Frontend / UI | | |
| — Frontend exists | 🟡 | Next.js, redirects to /diagnostics |
| — Login, dashboard, upload | 🟡 | Partial; not controller-centric |

---

## Detailed Findings Per Feature

### 1. Trial Balance Ingestion

#### CSV Parsing
- **BOM:** `src/services/fileIngestion.ts` line 43: `bom: true` in csv-parse options.
- **CRLF:** csv-parse handles both; tested in `tests/integration/trial_balance_parsing_edge_cases.test.ts` lines 31–38.
- **Quoted fields:** Tested lines 40–49.
- **Scientific notation:** `src/services/trial-balance/parser_utils.ts` line 160: `parseFloat(s)` handles 1.5e4, 3.2E-2; tests lines 164–185.
- **Formulas:** In CSV, `parseAmount('=SUM(A1:A5)')` returns 0; documented in test lines 182–186.

#### XLSX Parsing
- `src/services/fileIngestion.ts` lines 57–86: `parseXlsxToTrialBalance` uses `xlsx` library; formulas resolve to cached values.

#### Debit = Credit Validation
- `src/services/trialBalanceParser.ts` lines 66–71: tolerance 0.01, `balances` flag.
- `src/services/integrity_gate_service.ts` lines 198–202: `MathematicalIntegrityError` thrown on imbalance.

#### Balance Sheet Equation (A = L + E)
- `src/services/integrity_gate_service.ts` lines 203–210: `totalAssets !== totalLiabilities + totalEquity` throws.

#### Plug/Suspense Detection
- `src/services/integrity_gate_service.ts` lines 14–78: `detectSuspiciousPlugs` with pattern `Miscellaneous|Suspense|Other`, threshold 0.9 configurable.
- `src/services/result_generator.ts` lines 238–250: plug alert → HITL staging.

#### HITL Staging When Imbalanced
- `src/routes/trial-balance/ingest.ts` lines 204–221: imbalance routes to `tenant_hitl_staging`.
- `src/routes/hitl.ts` lines 132–191: POST `/api/hitl/resolve-ingest` applies adjustment.

#### Multiple Chart of Accounts Formats
- `src/services/trial-balance/parser_utils.ts`: column standardization maps variants (Dr, Cr, Balance, Amt). No explicit QuickBooks/Xero format profiles; `standardizeColumns` handles common headers.

#### Row Limits
- `src/routes/trial-balance/ingest.ts` lines 155–159: `MAX_TB_ROWS` default 100_000.
- `tests/integration/large_trial_balance.test.ts`: 1k, 10k, 50k, 100,001 rows tested. 100,001 rejected with 413. 50k takes ~80–100s.

---

### 2. Close Session State Machine

#### All 6 States
- `src/services/close_session_service.ts` lines 27–34:
```typescript
const ALLOWED_TRANSITIONS: Record<CloseSessionStatus, CloseSessionStatus[]> = {
  draft: ['in_progress'],
  in_progress: ['draft', 'ready_for_review'],
  ready_for_review: ['in_progress', 'finalized'],
  finalized: ['ready_for_review', 'locked'],
  locked: ['certified'],
  certified: [],
};
```

#### Invalid Transitions Rejected
- Same file: `updateSessionStatus` validates against `ALLOWED_TRANSITIONS`; `CloseSessionError` with code `INVALID_TRANSITION`.

#### Certified Terminal, Locked Before Certify
- `certified: []` — no outgoing transitions.
- Certify path requires session to be `locked`.

#### Audit Ledger Logging
- `recordMaterialEvent` called on transitions; `close_session_transition` event type.

#### Concurrent Access
- `src/services/close_session_service.ts` line 178: "acquires row lock (FOR UPDATE)". Concurrent certify tests exist but are **skipped** due to ECONNRESET flakiness (`tests/integration/security_adversarial.test.ts`).

---

### 3. Evidence Anchoring

#### File Upload
- `src/routes/close/close_journal_entries.ts`: POST `/journal-entries/:id/evidence/upload` (multipart).
- MIME: PDF explicitly tested; `evidence_attachment_service` accepts configurable types.

#### SHA-256
- `src/services/evidence_attachment_service.ts`: hash computed on upload, stored in `evidence_records.hash_sha256`.

#### Link to Journal Entry
- `evidence_links` table links `evidence_id` to `object_type='journal_entry'`, `object_id`.

#### Evidence Manifest
- `src/services/evidence_manifest_service.ts`: assembles manifest for close session.
- `src/services/close_session_service.ts` line 328: `buildEvidenceManifest` called before snapshot.

#### Manifest in Snapshot Hash
- `src/lib/snapshot_hash.ts` lines 200–203: `hashVersion >= HASH_VERSION_WITH_EVIDENCE_MANIFEST` includes `evidenceManifest`.

#### File Size Limits
- `tests/integration/evidence_upload_limits.test.ts`; multer limits in ingest routes.

#### Download
- `tests/integration/evidence_file_upload_download.test.ts`: GET `/journal-entries/:jeId/evidence/:evidenceId/download`; round-trip SHA-256 verified.

#### Storage
- `src/services/evidence_storage_service.ts` lines 39, 53–68, 193–209: `STORAGE_ADAPTER=local|s3`; local uses `EVIDENCE_STORAGE_PATH`; S3 requires `EVIDENCE_S3_BUCKET`.

---

### 4. Snapshot & Certification

#### Deterministic Sort
- `src/lib/snapshot_hash.ts` lines 46–58: `entrySortKey`: accountName, debit, credit, lineId, accountCode, description, provenance.

#### Decimal Normalization
- `src/utils/decimal.ts` line 9: `DP = 2`; `normalizeMoney` returns fixed 2 decimals (e.g. "1234.56").

#### SHA-256 Hash
- `src/lib/snapshot_hash.ts` line 206: `createHash('sha256').update(json).digest('hex')`.

#### Ed25519 Signing
- `src/lib/cert_signing.ts` lines 114–127: real `crypto.sign`; no stub. Keys from env or auto-generated in dev.

#### Snapshot Immutability
- `migrations/091_append_only_triggers.sql`: `ledger_snapshots` has BEFORE UPDATE/DELETE triggers that raise exception.

---

### 5. Export Gating

#### Audit Chain Check
- `src/services/export_gate_service.ts`: calls `verifyChain` from `audit_ledger_service`.

#### Materiality
- `src/services/export_gate_service.ts` lines 72–76: `getEffectiveMateriality` from `materiality_config_service`; `absoluteThreshold`, `relativeThreshold` configurable.

#### Unresolved Conflicts
- `getUnresolvedConflicts` from `risk_context_store`; blocks when `ENABLE_INTEGRATED_SUPERVISOR`.

#### 403 with Error Codes
- `CRITICAL_TAMPER_ALERT`, `TAMPERING_ATTEMPT_DETECTED`, `UNRESOLVED_CONFLICTS_ALERT`, `RESOLUTION_MISMATCH`.

#### Certified PDF
- `src/services/pdf_export.ts`: uses pdf-lib; real financial statements, reasoning chain, compliance package.

---

### 6. Tamper Detection / Audit Chain

#### Hash Chain
- `src/db/repositories/audit_ledger_repository.ts`: `previousEntryHash` from `getLatestHash`; `computeEntryHashV1`/`V2`.

#### Chain Verification
- `verifyChain` walks entries, recomputes hashes; detects mutation, truncation, insertion.

#### Append-Only
- `migrations/091_append_only_triggers.sql` lines 6–20: `prevent_audit_ledger_mutation` triggers block UPDATE/DELETE.
- `tests/integration/append_only_triggers.test.ts`: UPDATE and DELETE throw.

#### Hash Versions
- v1 (legacy), v2 (canonical sorted keys + normalized dates). `hash_version` column in `audit_ledger`.

---

### 7. AI Boundaries

#### Staging Tables
- `tenant_ai_proposals`, `tenant_hitl_staging` used by `persistence_service`, `hitl_orchestrator`, `result_generator`.

#### Enforcement
- Convention: AI writes to staging; human approval moves to deterministic tables. No code-level guard that blocks AI from writing directly to `period_trial_balance`; relies on service design.

#### AI Model
- `src/ai/ai_client.ts`: `callClaude` via `claude_adapter`; `AI_MODEL` env (default `claude-sonnet-4-5-20250929`). `AI_MOCK=true` used in tests.

---

### 8. Multi-Tenant Isolation

#### tenant_id Filtering
- All repositories accept `tenantId` and filter; 50+ repo files reference `tenant_id`/`tenantId`.

#### Cross-Tenant Test
- `tests/integration/tenant_isolation.test.ts`; `tests/integration/security_adversarial.test.ts`: IDOR tests (tenant A cannot access tenant B snapshot).

#### BYOD
- `src/db/index.ts`: `getTenantPool` uses `tenants.database_url` when set.
- `src/routes/tenants.ts`: POST `/api/tenants` with `database_url` validates connection, runs migrations.

---

### 9. API Layer

#### Endpoints (Sample)
- POST `/api/trial-balance/ingest`, `/api/trial-balance/statements`
- POST `/api/close/sessions`, `/api/close/sessions/:id/advance`, `/api/close/sessions/:id/certify`
- POST `/api/close/journal-entries`, `/api/close/journal-entries/:id/evidence/upload`
- GET `/api/audit/binder`, `/api/export/pdf`, `/api/export/csv`
- GET `/api/verification/snapshots/:id`, `/api/verification/evidence-manifest/:id`
- POST `/api/hitl/resolve-ingest`, GET `/api/hitl/staging`
- POST `/api/tenants`

#### Auth
- JWT via `src/auth/`: `requireAuth`, `optionalAuth`; `attachTenantPool`, `requireTenantContext`.

#### Rate Limiting
- `src/server.ts` lines 97–102: `apiLimiter` 200 req/min per IP.

#### Input Validation
- Zod schemas in `src/schemas/`; `validateBody` middleware. Not every route has explicit schema.

---

### 10. Frontend / UI

- **Framework:** Next.js (App Router).
- **Root:** `frontend/app/page.tsx` redirects to `/diagnostics`.
- **Pages:** `/login`, `/register`, `/diagnostics`, `/auditor`, `/consolidation`, `/genui`.
- **Login:** `frontend/app/login/page.tsx` — form, `useAuth().login`, redirect to `/dashboard`.
- **Verdict:** UI exists but is diagnostics/lab-oriented. No dedicated controller dashboard for month-end close; upload and close workflows are partial.

---

## PART 2: Test Coverage Analysis

### Test Files

| File | Type | Notes |
|------|------|-------|
| `unit/*.test.ts` | Unit | 18 files |
| `integration/*.test.ts` | Integration | 44+ files |
| `smoke/*.test.ts` | Smoke | 3 files |

### Counts
- **Total tests:** ~650
- **Passing (latest run):** 646 passed, 3 skipped, 1 failed (timeout in `close_sessions_advance`)
- **Skipped:** 3 concurrent security tests (ECONNRESET under load)

### Features with Zero/Low Coverage
- Some pipeline routes (e.g. bank, ap-aging) may have minimal tests.
- Frontend: no automated E2E tests in this suite.

### CI/CD
- `.github/workflows/ci.yml`: lint, test (Postgres service, migrations, tests), Docker build. Runs on push/PR to main.

---

## PART 3: Database / Schema Audit

### Key Tables
- `tenants`, `close_sessions`, `period_trial_balance`, `journal_entries`, `evidence_records`, `evidence_links`
- `ledger_snapshots`, `audit_ledger`, `certification_artifacts`
- `tenant_ai_proposals`, `tenant_hitl_staging`, `ai_call_log`
- `period_export_checks`, `period_lock`

### Indexes
- `idx_close_sessions_tenant`, `idx_close_sessions_tenant_entity`, etc.
- FK constraints on `close_sessions`, `journal_entries`, `evidence_links`.

### Append-Only
- `audit_ledger`: triggers block UPDATE/DELETE.
- `ledger_snapshots`: immutable triggers.
- `period_trial_balance`: mutation blocked when linked session is certified.

### Migrations
- 92 SQL files in `migrations/`; `npm run db:migrate` applies them. Fresh DB can be bootstrapped.

### Database Support
- PostgreSQL only. No SQLite path.

---

## PART 4: Deployment Readiness

- **Dockerfile:** Present.
- **docker-compose:** `docker-compose.yml`, `docker-compose.demo.yml`.
- **Env vars:** `DATABASE_URL`, `JWT_SECRET` required; `PORT`, `APP_MODE`, `CERT_SIGNING_*`, `STORAGE_ADAPTER`, `EVIDENCE_S3_*` as needed.
- **Startup validation:** `src/startup_validation.ts`; `runStartupValidation()` before listen.
- **Logging:** Structured via `src/lib/logger.ts`.
- **Health:** GET `/health`, GET `/health/ready`.
- **CORS:** Configurable via `CORS_ORIGINS`; default localhost:3000.
- **HTTPS:** Handled by reverse proxy; app listens HTTP.

---

## PART 5: Demo Readiness Assessment

### Question 1: "Can I demo this to a controller at a mid-market company TODAY?"

**What they would see:** API-driven flow: upload CSV trial balance, advance close session, certify, export PDF. No polished controller UI; they would need Postman/curl or the diagnostics frontend.

**What would break:** Flaky concurrent tests suggest possible ECONNRESET under load; a live demo with two users advancing simultaneously could fail. Large TB (50k rows) is slow (~90s).

**What's missing:** Clear "month-end close" UX, reconciliation dashboard, approval workflow UI. They would ask for Excel export, report templates, and integration with their GL.

---

### Question 2: "Can I demo this to an audit innovation partner at a mid-tier firm TODAY?"

**What would impress:** Deterministic snapshot hashing, Ed25519 signing, hash-chained audit ledger, append-only DB triggers, evidence manifest in certification, plug/suspense detection, integrity gate (422 on imbalance).

**What would concern:** AI writes to staging but enforcement is convention-based. No formal SOC2/compliance documentation in-repo. Evidence storage: local disk default; S3 requires setup.

**Questions we can't answer:** "What's your control framework?" "How do you prevent AI from writing to certified data?" (We'd say convention + review, not technical lock.)

---

### Question 3: "Can I demo this to a PE operating partner TODAY?"

**What they want that we have:** Multi-tenant, BYOD, close session workflow, certification, export, evidence linking.

**What they want that we don't have:** Portfolio-level rollup, fund-level reporting, LP reporting templates, Cap table integration. The product is single-entity close focused, not fund admin.

---

## Critical Gaps (Ranked for Demo Readiness)

1. **Controller-facing UI** — Dashboard for upload, close steps, certify, export. Currently lab/diagnostics.
2. **Flaky concurrent tests** — Fix or stabilize ECONNRESET in concurrent certify/advance.
3. **AI boundary enforcement** — Code-level guard that AI cannot write to deterministic tables.
4. **Demo script** — Step-by-step runbook for 5-minute demo (ingest → advance → certify → export).
5. **Error messages** — User-facing copy for 422, 403, 503 so demos don't show raw codes.
6. **Evidence UX** — Upload/download in UI, not just API.
7. **Large TB performance** — 50k rows ~90s; consider batching or streaming.

---

## 30-Day Sprint Plan (Demo-Ready)

| Week | Focus |
|------|-------|
| 1 | Fix flaky tests (close_sessions_advance timeout, security_adversarial ECONNRESET); add demo script (README or docs). |
| 2 | Controller dashboard: upload zone, close session list, advance/certify buttons, export PDF. |
| 3 | Polish: error messages, loading states, success toasts; evidence upload in JE UI. |
| 4 | Dry run: full flow with demo@cloudmetrics.io; record video; document known limitations. |

---

## Test Results (Latest Run)

```
Test Suites: 1 failed, 96 passed, 97 total
Tests:       646 passed, 3 skipped, 1 failed, 650 total
Time:        ~151s

Failed: integration/close_sessions_advance.test.ts
       — "A) draft session with valid data: advance locks it"
       — Exceeded timeout of 5000 ms for a test (needs higher timeout)

Skipped: security_adversarial — 3 concurrent certify/advance tests (ECONNRESET under load)
```

---

*End of Audit*
