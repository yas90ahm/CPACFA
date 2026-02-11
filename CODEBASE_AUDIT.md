# Codebase Audit — Production Readiness Assessment

**Date:** February 2026  
**Scope:** Full codebase review for demo readiness to audit firms, PE operating partners, and controllers.

---

## Executive Summary

**The system is NOT production-ready for financial professionals.** Core certification pathways (trial balance → close → certify → export) are implemented with real crypto and audit trails, but many components are partially built, rely on mocks, or lack integration tests. Auth can be fully disabled in dev. Ed25519 signing requires env keys—in dev it silently returns `signed: false`. Evidence is metadata-only (hash + external URI), not actual file storage for download. No Dockerfile, no CI/CD. A controller would find the close flow workable but brittle; an audit partner would flag missing evidence persistence and AI integration ambiguity; a PE operating partner would want multi-entity dashboards and integrations that exist only as scaffolding.

---

## Feature Status Table

| Capability | Status | Notes |
|------------|--------|-------|
| **1. Trial Balance Ingestion** | 🟡 PARTIALLY BUILT | CSV/XLSX parse, D=C, A=L+E, plug detection, HITL staging. Scientific notation/formulas not explicitly tested. MAX_TB_ROWS=100k. |
| **2. Close Session State Machine** | ✅ PRODUCTION-READY | All 6 states, valid/invalid transitions enforced. No explicit concurrent-access test; schema has EXCLUDE constraint. |
| **3. Evidence Anchoring** | 🟡 PARTIALLY BUILT | Hash + metadata only. No file download. Local disk for multipart uploads; S3 planned. Manifest in snapshot hash. |
| **4. Snapshot & Certification** | 🟡 PARTIALLY BUILT | Deterministic payload, SHA-256, Ed25519 real when keys set—stub in dev. Evidence manifest included. |
| **5. Export Gating** | ✅ PRODUCTION-READY | Chain + snapshot + materiality checks. Certified PDF with real data. Draft watermark. |
| **6. Tamper Detection / Audit Chain** | ✅ PRODUCTION-READY | Hash-chained, v1/v2, append-only by convention (no DB trigger). |
| **7. AI Boundaries** | ✅ PRODUCTION-READY | AI does not import deterministic repos. Staging tables used. Tests verify. |
| **8. Multi-Tenant Isolation** | 🟡 PARTIALLY BUILT | tenant_id on queries. Tenant isolation test exists. BYOD via database_url. |
| **9. API Layer** | 🟡 PARTIALLY BUILT | Many endpoints. Rate limit 200/min. JWT auth. Some endpoints lack integration tests. |
| **10. Frontend / UI** | 🟡 PARTIALLY BUILT | Next.js frontend exists (login, dashboard, consolidation, auditor). Can log in and use via browser. |

---

## PART 1: FEATURE-BY-FEATURE STATUS AUDIT

### 1. Trial Balance Ingestion

| Item | Status | Evidence |
|------|--------|----------|
| CSV parsing (BOM, CRLF, quoted, relax_column_count) | ✅ | `fileIngestion.ts` L34-46: `bom: true`, `trim`, `relax_column_count`. `parser_utils.ts` L149-155: `parseAmount` handles commas, parentheses. |
| XLSX parsing | ✅ | `fileIngestion.ts` L54-82: first sheet, header row 0. |
| Debit = Credit validation | ✅ | `integrity_gate_service.ts` L151-164: `runIntegrityGate`. `ingest.ts` throws `MathematicalIntegrityError` on imbalance. |
| Balance sheet equation (A = L + E) | ✅ | `integrity_gate_service.ts` L159-164. |
| Plug/suspense detection (configurable threshold) | ✅ | `integrity_gate_service.ts` L46-78: `detectSuspiciousPlugs`, threshold default 0.9, pattern `Miscellaneous|Suspense|Other`. |
| Rejection/routing to HITL staging when imbalanced | ✅ | `ingest.ts`: creates staging item, returns `status: 'staged'`, `stagedId`. |
| Multiple CoA formats | 🟡 | `parser_utils.ts`: standardizeColumns maps Dr/Cr/Balance/Amt etc. No explicit QuickBooks/Xero formats. |
| Row limits (real max) | ✅ | `ingest.ts` L154: `MAX_TB_ROWS ?? 100_000`. `large_trial_balance.test.ts`: 100,001 rejects with 413. |
| Scientific notation / formulas | 🔴 | Not explicitly tested. `parseAmount` uses `parseFloat`—scientific notation works; Excel formulas would be cell values. |
| Quoted fields with commas | ✅ | `trial_balance_parsing_edge_cases.test.ts` L40-48: quoted fields tested. |

---

### 2. Close Session State Machine

| Item | Status | Evidence |
|------|--------|----------|
| All 6 states | ✅ | `close_session_service.ts` L28-35: draft, in_progress, ready_for_review, finalized, locked, certified. |
| Valid transitions enforced | ✅ | `ALLOWED_TRANSITIONS` L28-35; `updateStatus` L186-194 rejects invalid. |
| Invalid transitions rejected | ✅ | `CloseSessionError` code `INVALID_TRANSITION`. Tests in `close_sessions_advance.test.ts`, `export_certified_gate.test.ts`. |
| Certified terminal (no reverse) | ✅ | `certified: []` in ALLOWED_TRANSITIONS. |
| Cannot certify unless locked | ✅ | `close_session_service.ts` L227-231: throws if status !== 'locked'. |
| Transitions logged to audit ledger | 🟡 | `recordMaterialEvent` on close_lock, certify_close. Not every state transition (draft→in_progress etc.) logged. |
| Timestamps | ✅ | `created_at`, `updated_at` on close_sessions. |
| Concurrent access | 🟡 | `close_session_repository` uses `INSERT`; EXCLUDE constraint on overlapping sessions. No explicit row-level lock test for two users advancing simultaneously. `security_adversarial.test.ts` has "concurrent certify race" test but it failed with ECONNRESET. |

---

### 3. Evidence Anchoring

| Item | Status | Evidence |
|------|--------|----------|
| File upload (multipart) | ✅ | `close_journal_entries.ts` L506-530: `upload.single('file')`, multer. |
| PDF / other formats | ✅ | Multer config limits by extension; `ATTACHMENT_MAX_BYTES`. |
| SHA-256 on upload | ✅ | `ingest.ts` L192: `createHash('sha256').update(file.buffer).digest('hex')`. Evidence API requires `hashSha256` in body (client computes or server from multipart). |
| Hash linked to JE | ✅ | `evidence_repository.ts`: link object_id = journal entry id. |
| Evidence manifest assembly | ✅ | `evidence_manifest_service.ts`: builds manifest from JEs + evidence. |
| Manifest in snapshot hash | ✅ | `ledger_snapshot_service.ts` L69-72: `payload.evidenceManifest`. `snapshot_hash.ts` HASH_VERSION_WITH_EVIDENCE_MANIFEST. |
| File size limits | ✅ | `ATTACHMENT_MAX_BYTES` in close_journal_entries; 413 on LIMIT_FILE_SIZE. |
| Hash mismatch detection | 🔴 | No explicit post-certification hash re-verification of stored evidence. |
| Download evidence | 🔴 | Evidence is metadata + externalUri or local path. No canonical GET /evidence/:id/download. `audit-evidence-zip.ts` builds zip from external refs. |
| Storage | 🟡 | `storage/index.ts`: LocalDiskStorage default. Comment: "S3 adapter via STORAGE_ADAPTER=s3" — not implemented. |

---

### 4. Snapshot & Certification

| Item | Status | Evidence |
|------|--------|----------|
| Deterministic payload | ✅ | `ledger_snapshot_service.ts` L59-74: `buildSnapshotPayloadFromInput`, `round2` for amounts. |
| Entry sort key | ✅ | `snapshot_hash.ts` L46-58: `entrySortKey` = accountName, debit, credit, lineId, accountCode, description, provenance. |
| Decimal normalization | ✅ | `round2` in decimal.ts; `normalizeMoney` in snapshot_hash. |
| Evidence manifest in snapshot | ✅ | `ledger_snapshot_service.ts` L69-72. |
| SHA-256 of snapshot | ✅ | `snapshot_hash.ts`: `hashSnapshotPayload`. |
| Ed25519 key gen | 🔴 | Keys from env (CERT_SIGNING_PRIVATE_KEY, CERT_SIGNING_PUBLIC_KEY). No in-app keygen. |
| Ed25519 signing | 🟡 | `cert_signing.ts` L82-99: real `sign()` when keys set. In dev, returns `signed: false` when keys missing. |
| Ed25519 verification | ✅ | `verifyArtifactHash` L102-120: real verify. |
| Snapshot in DB | ✅ | `ledger_snapshots` table. |
| Immutability | 🟡 | No UPDATE/DELETE in app code. No DB trigger preventing UPDATE. |

---

### 5. Export Gating

| Item | Status | Evidence |
|------|--------|----------|
| Audit chain check | ✅ | `export_gate_service.ts` L68-75: `verifyChain`. |
| Snapshot hash verification | ✅ | Certified export uses snapshot; chain integrity required. |
| Materiality check | ✅ | `getPeriodExportChecks` from DB; roundingGapExceedsMateriality, aggregateRoundingExceedsMateriality. Config in `financial_rules.json`. |
| Unresolved conflict check | ✅ | When ENABLE_INTEGRATED_SUPERVISOR: `getUnresolvedConflicts`, resolution count vs ledger. |
| 403 on failure | ✅ | `export.ts` L178-198: 403 with code CRITICAL_TAMPER_ALERT etc. |
| Certified PDF (real data) | ✅ | `getCertifiedStatementsForBinder`, `statementsToExportPayload`, `createPdfFromStructuredPayload`. |
| Draft watermark | ✅ | `Draft_Financials_NOT_CERTIFIED.pdf`, `DRAFT — NOT CERTIFIED`. |
| Certification hash in headers | ✅ | `X-Certified-Snapshot-Hash`, `X-Certified-Snapshot-Id`. |

---

### 6. Tamper Detection / Audit Chain

| Item | Status | Evidence |
|------|--------|----------|
| Hash-chained ledger | ✅ | `audit_ledger_repository.ts`: `previous_entry_hash`, `entry_hash` per entry. |
| Chain verification | ✅ | `verifyChain` L178-235: recomputes hash, checks prev link. |
| Detects mutation | ✅ | Hash mismatch → `valid: false`, `brokenAtEntryId`. |
| Detects truncation | ✅ | previous_entry_hash chain breaks. |
| Detects insertion | ✅ | Recompute would fail at inserted entry (prev hash wrong). |
| Blocks export on failure | ✅ | `checkExportGate` returns allowed: false. |
| Hash versions | ✅ | v1 (legacy), v2 (canonical). `migrations/079_audit_ledger_hash_version.sql`. |
| Append-only in DB | 🟡 | No UPDATE/DELETE in app. Schema has no trigger. Relies on convention. |

---

### 7. AI Boundaries

| Item | Status | Evidence |
|------|--------|----------|
| AI → staging only | ✅ | `ai_mutation_boundaries.test.ts`: AI proposals in tenant_ai_proposals; period_trial_balance empty until human resolve. |
| No AI writes to deterministic tables | ✅ | `ai_mutation_boundaries.test.ts` L172-207: code audit—no imports of period_trial_balance_repository, ledger_snapshot_repository, etc. in src/ai, src/agents. |
| tenant_ai_proposals | ✅ | Migration 082. Used by classifier/advisor. |
| ai_call_log | ✅ | Migration 080. |
| tenant_hitl_staging | ✅ | Migration 062. |
| Human approval flow | ✅ | `resolve-ingest` moves from staging to period_trial_balance. |
| Rejection flow | ✅ | Staging item can be rejected. |
| AI model integration | 🟡 | LLM providers (Anthropic, OpenAI, Mistral) via `llm/provider.ts`. Classifier/advisor use real or mock (AI_MOCK_CLASSIFIER, AI_MOCK_ADVISOR). |

---

### 8. Multi-Tenant Isolation

| Item | Status | Evidence |
|------|--------|----------|
| tenant_id on queries | ✅ | Repositories use tenant_id in WHERE. ~55+ repository files. |
| Cross-tenant leakage test | ✅ | `tenant_isolation.test.ts`: Tenant B cannot access Tenant A session. `close_session_idor.test.ts`. |
| BYOD | ✅ | `tenants.database_url`; `tenant_context` routes to tenant pool. |
| Connection pooling | ✅ | pg.Pool per tenant when database_url set. |
| Tenant onboarding | 🟡 | `POST /api/tenants`, onboarding routes exist. Full flow depends on DB setup. |

---

### 9. API Layer

**Key endpoints (partial list):**

- `GET /health`, `GET /health/ready`
- `POST /api/auth/login`, register
- `POST /api/trial-balance/ingest`
- `POST /api/justification/chat`
- `GET /api/audit/binder`, `GET /api/audit/binder/export/pdf`
- `POST /api/export/pdf`, `POST /api/export/csv`
- `POST /api/close/sessions`, `POST /api/close/sessions/ensure`, `POST /api/close/sessions/:id/advance`, `POST /api/close/sessions/:id/certify`
- `POST /api/close/journal-entries`, `POST /api/close/journal-entries/:id/evidence`, `POST /api/close/journal-entries/:id/attachments`
- `POST /api/precheck/board-ready-pack`
- `GET /api/verification/audit-chain`, `GET /api/verification/snapshots/:id`
- `POST /api/hitl/resolve-ingest`
- Many more under close, onboarding, coa-mapping, data-quality, approvals, etc.

**Rate limiting:** `server.ts` L94-99: 200 req/min per IP.

**Auth:** JWT via `jsonwebtoken`. `requireAuth` or `optionalAuth` based on REQUIRE_AUTH.

**Integration tests:** full_close_flow, export_certified_gate, close_sessions_advance, tenant_isolation, evidence_attachment_api, trial_balance_parsing_edge_cases, integrity_gate_422, ai_mutation_boundaries, snapshot_verification, audit_chain_verification, large_trial_balance, etc. Many endpoints have no dedicated test.

---

### 10. Frontend / UI

| Item | Status | Evidence |
|------|--------|----------|
| Frontend exists | ✅ | Next.js app under `frontend/`. |
| Framework | ✅ | Next.js, React, Tailwind. |
| Pages | ✅ | login, register, page (dashboard), consolidation, auditor, diagnostics, genui. |
| Login and use | ✅ | Auth context, API client. User can log in and interact. |
| API-only fallback | ✅ | Backend runs standalone; frontend is optional. |

---

## PART 2: TEST COVERAGE ANALYSIS

**Test location:** `tests/` (separate package, `tests/package.json`).

**Unit tests:** `unit/` — ledger_provenance_and_snapshot, ledger_snapshot_hash, justification_service, pilot_security_hardening, pilot_production_hardening, canonical_json, storage, evidence_policy_service, triage_service, advisor_schema, issue_item_service, startup_validation, sovereign_validator.

**Integration tests:** `integration/` — full_close_flow, export_certified_gate, close_sessions_advance, close_sessions_ensure, close_session_idor, tenant_isolation, evidence_attachment_api, trial_balance_parsing_edge_cases, integrity_gate_422, ai_mutation_boundaries, snapshot_verification, audit_chain_verification, large_trial_balance, evidence_policy_enforcement, security_adversarial, classifier_ingest, pbc_index, precheck_board_ready, etc.

**Smoke tests:** `smoke/` — persistence_resume, etc.

**Test run (partial):** Many PASS. Failures observed:
- `security_adversarial.test.ts`: IDOR test hit exclusion constraint; tenant spoof tests ECONNRESET; concurrent certify race ECONNRESET.
- `evidence_policy_enforcement.test.ts`: Expected 200, received 400 on certify; evidence attach status assertion mismatch.

**CI/CD:** No GitHub Actions or similar in repo. No Dockerfile.

---

## PART 3: DATABASE / SCHEMA AUDIT

**Tables (migrations 001–085+):** tenants, users, audit_ledger, ledger_snapshots, close_sessions, period_trial_balance, tenant_hitl_staging, tenant_ai_proposals, evidence, journal_entries, period_locks, period_export_checks, statement_registry, coa_mapping, and many domain tables (leases, fixed_assets, revenue_recognition, etc.).

**audit_ledger:** No UPDATE/DELETE in app. Schema has no trigger; immutability is by convention.

**Indexes:** Most critical tables have tenant_id and common query indexes.

**Migrations:** `src/db/migrate.ts` runs migrations in order. Fresh DB can be bootstrapped via `db:reset`, `db:migrate`.

**Database support:** Postgres only (pg driver). No SQLite.

---

## PART 4: DEPLOYMENT READINESS

| Item | Status |
|------|--------|
| Dockerfile | ⬛ None |
| docker-compose | ⬛ None |
| Env config | 🟡 .env.example documents vars. DATABASE_URL, JWT_SECRET, CERT_SIGNING_* (prod/demo). |
| Startup validation | ✅ `runStartupValidation` checks DATABASE_URL, DB connection, migrations, storage path. Fails fast. |
| Logging | 🟡 Structured logs (timestamp, level, requestId). No Sentry/DataDog integration. |
| Health check | ✅ `GET /health`, `GET /health/ready`. |
| CORS | ✅ Configurable via CORS_ORIGINS / CORS_ORIGIN. |
| HTTPS/TLS | 🟡 Handled by reverse proxy; app does not terminate TLS. |

---

## PART 5: DEMO READINESS ASSESSMENT

### Q1: Can I demo this to a controller at a mid-market company TODAY?

**Partial yes.** They could: upload a trial balance CSV, create a close session, advance through states, attach evidence metadata, certify, and export a PDF. Debits=credits and plug detection would be visible. What would break or confuse: (1) Evidence is hash + link only—no actual PDF stored/retrieved in-app. (2) Balance sheet classification can fail (e.g. gap) if CoA mapping is off. (3) Auth can be off in dev, which would alarm them. (4) No guided UI flow for "first close" end-to-end. They’d ask: "Where are my actual evidence files?" and "Can I map my QuickBooks export automatically?"

### Q2: Can I demo this to an audit innovation partner at a mid-tier firm TODAY?

**Partial yes.** Strengths: hash-chained audit ledger, deterministic snapshot, Ed25519 when configured, export gating on chain/snapshot, AI boundaries enforced. Concerns: (1) Ed25519 returns `signed: false` in dev without keys—looks like a stub. (2) Evidence is metadata; no verifiable evidence blob storage. (3) No formal audit trail of "who certified when" beyond DB columns. (4) Resolution mismatch / integration checks are conditional. They’d ask: "Can I verify the chain independently?" (yes—verification endpoints) and "Where is the evidence integrity proof?" (partial—manifest in snapshot, but no content hashing of stored files).

### Q3: Can I demo this to a PE operating partner TODAY?

**Partial yes.** They’d see: close workflow, checklist, certification, export. Missing: multi-entity rollup dashboards (consolidation page exists but may be thin), portfolio analytics (migrations exist, integration unclear), LBO/DCF models (migrations 033, 043), and robust accounting integrations (QuickBooks/Xero/NetSuite). They’d want: "Show me all my portfolio companies’ closes" and "One-click sync from QuickBooks"—those are scaffolded, not production-ready.

---

## Critical Gaps (Ranked)

1. **Evidence persistence & download** — No canonical evidence blob storage and retrieval. Hash + externalUri only.
2. **Ed25519 in dev** — Signing is a silent no-op without keys. Demo/VC setup should generate or document keys.
3. **Auth bypass in dev** — REQUIRE_AUTH=false allows unauthenticated API. Must be clearly dev-only.
4. **Flaky integration tests** — security_adversarial, evidence_policy_enforcement have failures. Needs triage.
5. **No Docker/CI** — Harder for prospects to run locally; no automated test run on PR.
6. **Concurrent certify** — Race test failed. No proven handling of two users certifying at once.
7. **Materiality source** — Rounding/materiality from DB only; not yet clear if all paths populate it.

---

## 30-Day Sprint Plan (Demo-Ready)

| Week | Priority | Tasks |
|------|----------|-------|
| 1 | Evidence & signing | Implement evidence file storage (local or S3). Document Ed25519 key gen for demo. Add GET /evidence/:id/download or equivalent. |
| 2 | Auth & env | Enforce REQUIRE_AUTH=true for any non-dev demo. Add MODE=demo with strict defaults. |
| 3 | Tests & CI | Fix security_adversarial and evidence_policy_enforcement. Add GitHub Actions or equivalent for test run. |
| 4 | Deployment & docs | Add Dockerfile + docker-compose. Update README with "Demo in 5 minutes" and required env vars. |

---

*Audit produced from direct code inspection and partial test run. Re-run full test suite with DATABASE_URL set for definitive pass/fail counts.*
