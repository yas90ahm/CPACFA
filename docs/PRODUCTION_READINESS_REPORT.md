# Production Readiness Report  
## Backend Assessment — Accounting Close Software

---

| Field | Value |
|-------|--------|
| **Document type** | Production Readiness Assessment |
| **Application** | Accounting close software (trial balance → BS/P&L, HITL, close controls, jobs) |
| **Scope** | Backend (Node/TypeScript) only |
| **Criteria** | Financial correctness, auditability, security, reliability, observability |
| **Method** | Evidence-based (file paths + symbols); no assumptions |
| **Disclaimer** | Assessment from codebase evidence only; no runtime or penetration testing performed. |

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Production Readiness Scorecard](#2-production-readiness-scorecard)
3. [Hard Blockers List](#3-hard-blockers-list)
4. [Go-Live Checklist](#4-go-live-checklist)
5. [Load & Failure Testing Plan](#5-load--failure-testing-plan)
6. [Recommendation](#6-recommendation)

---

## 1. Executive Summary

- **Data integrity:** Integrity gate blocks unbalanced statements; export gate enforces audit chain + materiality from DB only. Validation is Zod on many routes; some routes (e.g. catalog) accept raw body. Period lock, recon state machine, and JE lifecycle have DB persistence and constraints.
- **Audit trail:** Hash-chained audit ledger (append-only, `verifyChain`), used before export. Not every financial mutation is explicitly appended (e.g. some decision paths may skip `recordMaterialEvent`/`recordOverride`); coverage is partial.
- **Auth/Security:** JWT required in production; `REQUIRE_AUTH` and `shouldBypassAuth` (dev-only when `DIAGNOSTICS_AUTH_BYPASS=true`) protect APIs. In production, auth bypass is disabled. `requireTenantContext` returns 503 without tenant; production disallows in-memory stores in several services (audit_export, trial_balance_store, hitl_orchestrator) via `disallowMemoryStoreInProduction`. Period lock and accounting_integration can still fall back to in-memory when pool is missing (no `disallowMemoryStoreInProduction` in those services).
- **Reliability:** Durable job queue (jobs table, worker, retries, dead-letter, idempotency) is in place. Ingestion scheduler enqueues jobs; worker runs in-process. No APM/tracing; structured logging exists with secret redaction.
- **Hard blockers:** (1) Auth bypass paths exist (disabled in prod but must be removed or locked down). (2) Period lock and several services (accounting_integration, period_lock, budget_version, etc.) can use in-memory when pool/tenantId is missing—in production `requireTenantContext` mitigates for normal API flow but internal/cron paths could still hit in-memory. (3) No OpenTelemetry/tracing or metrics; observability is logs-only. (4) Push-to-GL (post-back) is mock-only and not idempotent by external_id in code. (5) Large-dataset strategy: no streaming ingest; file size limits (10–20 MB); no pagination on some list endpoints.
- **Recommendation:** **GO WITH LIMITS.** Safe for single-tenant or low-volume close with strict ops controls. Not yet suitable for multi-tenant at scale, post-back to real GL, or regulated audit without addressing blockers and the 2-week hardening plan below.

---

## 2. Production Readiness Scorecard

Scores are 0–5 per category. Each includes evidence (file paths/symbols), top risks, and remediation steps.

---

### 2.1 Data integrity & validation — **3.5/5**

| Evidence | Location |
|----------|----------|
| Integrity gate blocks unbalanced TB/BS | `src/services/integrity_gate_service.ts`; `buildValidatedStatements` throws `MathematicalIntegrityError` in `src/services/financialStatements.ts` |
| Export gate: materiality from DB only, chain verified | `src/services/export_gate_service.ts` — `getPeriodExportChecks`, `verifyChain`; `src/routes/export.ts` rejects body-supplied materiality (TAMPERING_ATTEMPT_DETECTED) |
| Zod validation on many routes | `validateBody(ingestBodySchema)` etc. in `src/routes/trial-balance/ingest.ts`, `src/routes/auth.ts`, `src/routes/close/*`, leases, impairment, etc. |
| JE balance checks | `src/services/push_close_to_gl_service.ts` (debit/credit balance); `journal_entries` CHECK constraints in `migrations/072_tenant_journal_entries.sql` |
| Raw body used without schema | `src/routes/catalog.ts` — body cast as `{ name, type, schema? }` without Zod |

**Risks:** Catalog and a few endpoints accept unsanitized body; no global request-size limit beyond multer; no DB-level CHECK on every numeric column for non-negative amounts.

**Remediation:** Add Zod (or equivalent) to catalog and any route taking body; add request body size limit at Express level; add DB CHECKs for amount >= 0 where applicable.

---

### 2.2 Audit trail completeness (hash chain coverage) — **3/5**

| Evidence | Location |
|----------|----------|
| Append-only hash-chained ledger | `src/db/repositories/audit_ledger_repository.ts` — `appendEntry`, `computeEntryHash`, `getLatestHash`; no UPDATE/DELETE |
| Chain verification before export | `src/services/export_gate_service.ts` — `verifyChain`; `src/services/close_checklist_readiness_service.ts` — `verifyChain` in readiness |
| Record override / material event | `src/services/audit_ledger_service.ts` — `recordOverride`, `recordMaterialEvent`, `recordObservation`; used from hitl, journal_entry, recon, coa_mapping, issue_item, export |
| Event types | `src/types/audit_ledger.ts` — e.g. human_override, statement_package_generation, recon_signoff, user_induced_variance |

**Risks:** Not every financial mutation is guaranteed to call `recordMaterialEvent`/`recordOverride`; no automated test that every critical path writes to the ledger.

**Remediation:** Audit all code paths that change financial state or approvals and ensure they call audit_ledger; add integration test that verifies chain after a full close flow.

---

### 2.3 Determinism & versioning — **3/5**

| Evidence | Location |
|----------|----------|
| Decision records (append-only) | `src/services/decision_record_service.ts`, `src/db/repositories/decision_record_repository.ts`; used from trial-balance/ingest, coa_mapping, bank_feed_matching |
| Statement package versioning | `src/services/statement_package_service.ts` — `input_hash`, version, `getMaxVersionByCloseSessionId`; `migrations/074_statement_packages.sql` — unique (close_session_id, version) |
| COA mapping / rule versions | `src/routes/coa_mapping.ts` — `engineVersion` in decision record; mapping rules in DB |
| Recon link to decision_record | `src/db/repositories/recon_repository.ts` — `decision_record_id` on match groups |

**Risks:** Prompt/model version not stored per run; LLM non-determinism can affect narratives and suggestions—only final numbers are guarded by integrity gate and approval.

**Remediation:** Store prompt/model version in decision records or audit ledger where agentic output is used; document deterministic vs agentic boundaries.

---

### 2.4 JE lifecycle controls (SoD, approvals, period lock) — **4/5**

| Evidence | Location |
|----------|----------|
| Segregation of duties | `src/services/segregation_service.ts` — `canPerform(actorRole, action)`, `ACTION_ROLE` (e.g. period_lock → approver, je_post → approver) |
| Period lock (DB) | `src/services/period_lock_service.ts`, `src/db/repositories/period_lock_repository.ts`; `assertPeriodNotLocked` in trial-balance/ingest, parser, close_adjustment_update, close_closing_entries |
| Period lock route gated by role | `src/routes/close/close_period.ts` — `canPerform(actorRole, 'period_lock')` before `lockPeriod` |
| JE status lifecycle | `migrations/072_tenant_journal_entries.sql` — chk_je_status (draft, proposed, approved, posted, exported, rejected) |
| Audit log for actions | `src/services/audit_log_service.ts` — `appendAuditLog`; production requires DB context (in-memory disabled) |

**Risks:** `period_lock_service` can fall back to in-memory `locks` Map when `!pool` (no `disallowMemoryStoreInProduction`). In production, normal API path has pool via `requireTenantContext`; internal/cron callers could still get in-memory lock.

**Remediation:** Call `disallowMemoryStoreInProduction` in `period_lock_service` when pool is missing; ensure all callers of `lockPeriod`/`isPeriodLocked` pass pool in production.

---

### 2.5 Reconciliation controls — **4/5**

| Evidence | Location |
|----------|----------|
| Recon state machine | `src/services/recon_service.ts`; `migrations/071_tenant_recon_tables.sql` — chk_recon_run_status (draft, in_progress, ready_for_review, signed_off) |
| Signoffs | `src/db/repositories/recon_repository.ts` — `upsertReconSignoff`; `src/routes/close/close_recon_runs.ts` — POST recon-runs/:id/signoff |
| Ledger event for signoff | `src/services/recon_service.ts` — `recordMaterialEvent(..., 'recon_signoff')` |
| Readiness: cash rec + signoff | `src/services/close_checklist_readiness_service.ts` — bank recon runs require sign-off for readiness |

**Risks:** No automated test that recon state transitions are enforced (e.g. cannot sign off draft).

**Remediation:** Add state-machine tests and ensure signoff is only allowed for appropriate status.

---

### 2.6 Close readiness gating — **4/5**

| Evidence | Location |
|----------|----------|
| Readiness computation | `src/services/close_checklist_readiness_service.ts` — `computeReadiness`: checklist, cash rec signoff, no critical issues, material JEs approved, integrity (verifyChain + period_export_checks) |
| Export path enforces readiness | `src/routes/export.ts` — when closeSessionId present, calls `computeReadiness` and returns 403 if !ready with hardBlockers |
| Export gate after readiness | `checkExportGate` (chain + materiality + optional conflicts) after readiness |

**Risks:** Readiness is only enforced on export when closeSessionId is provided; other entry points may skip readiness.

**Remediation:** Enforce readiness (or explicit bypass reason) for all financial export endpoints when tenant/period are present.

---

### 2.7 Security — **3.5/5**

| Evidence | Location |
|----------|----------|
| JWT required in production | `src/server.ts` — `useRequireAuth = isProduction \|\| requireAuthByDefault`; `src/auth/index.ts` — throws if JWT_SECRET is default in production |
| Auth bypass only when !production and DIAGNOSTICS_AUTH_BYPASS | `src/server.ts` — `shouldBypassAuth` returns false if `isProduction`; bypass paths: trial-balance/ingest, supervisor/chat, supervisor/session/:id/trace |
| Tenant context required in production | `src/auth/middleware.ts` — `requireTenantContext` returns 503 without tenantId/tenantPool when NODE_ENV=production or REQUIRE_TENANT_CONTEXT=true |
| Secret redaction in logs | `src/lib/logger.ts` — redact keys containing secret, password, token, key, authorization, cookie |
| File upload: type and size | `src/routes/trial-balance/ingest.ts` — multer fileFilter (CSV/XLSX), 10 MB; ingestion 10 MB; close_journal_entries 20 MB; vector_store isPdfBuffer check |
| Materiality from client rejected | `src/routes/export.ts` — 403 if body contains roundingGapExceedsMateriality or aggregateRoundingExceedsMateriality |

**Risks:** Auth bypass paths still exist (disabled in prod); no rate limit per tenant/user; file upload uses memory storage (DoS for large concurrent uploads); ingestion_dedup_store requires INGESTION_DEDUP_KEY in production.

**Remediation:** Remove or strictly gate auth bypass paths; add per-tenant rate limits; document and enforce INGESTION_DEDUP_KEY and JWT_SECRET in production; consider streaming upload for very large files.

---

### 2.8 Reliability (jobs, retries, idempotency) — **4/5**

| Evidence | Location |
|----------|----------|
| Jobs table and repository | `migrations/075_jobs.sql`; `src/db/repositories/job_repository.ts` — enqueue (idempotencyKey), claimNext, complete, fail, deadLetter |
| Worker with backoff and dead-letter | `src/services/job_worker.ts` — runWorkerLoop, nextRunAt (exponential backoff), deadLetter when attempts >= maxAttempts |
| Idempotency: completed job by key | `job_repository.enqueue` — if idempotencyKey and completed job exists, returns existing id (no insert) |
| Ingestion scheduler enqueues jobs | `src/services/ingestion_scheduler.ts` — enqueues ingestion_pipeline per tenant with idempotencyKey slot |
| Handlers | `src/services/job_handlers.ts` — ingestion_pipeline, agentic_cleanup (stub), statement_generation |

**Risks:** Worker runs in-process (single point of failure); no lock timeout (stale locked jobs not reclaimed); agentic_cleanup is placeholder.

**Remediation:** Document running a dedicated worker process; add lock timeout / heartbeat to reclaim stale locks; implement agentic_cleanup or remove job type.

---

### 2.9 Observability — **2/5**

| Evidence | Location |
|----------|----------|
| Structured logger with redaction | `src/lib/logger.ts` — JSON, level, timestamp, message, redact(meta) |
| Request ID middleware | `src/middleware/requestId.ts` — sets req.id, X-Request-Id header; `server.ts` app.use(requestIdMiddleware) |
| Health/readiness | `server.ts` — GET /health (ok), GET /health/ready (DB ping) |
| No OpenTelemetry/tracing | No trace_id/span in logger; requestId not automatically in log meta |
| No Prometheus/metrics | No prom-client or /metrics endpoint |
| Console.log in places | e.g. server startup; trial-balance/ingest file received |

**Risks:** Cannot trace requests across services or correlate logs; no SLO metrics or alerting hooks.

**Remediation:** Attach req.id (from requestIdMiddleware) to logger meta so logs are correlatable; add OpenTelemetry or /metrics (e.g. job queue depth, error rate).

---

### 2.10 Performance / scalability — **2.5/5**

| Evidence | Location |
|----------|----------|
| No streaming ingest | Trial balance and ingestion load full file into memory (multer.memoryStorage()); `ingestTrialBalanceFile(file.buffer, file.mimetype)` |
| File size limits | 10 MB (trial-balance, ingestion), 20 MB (JE attachments) |
| Pagination schema exists | `src/schemas/commonSchemas.ts` — paginationSchema; not used everywhere (e.g. listJournalEntries limit 1000) |
| DB indexes | jobs (idx_jobs_poll, idx_jobs_type, idx_jobs_created_at); period_locks, audit_ledger, etc. have indexes |
| listJournalEntries limit | `src/services/close_checklist_readiness_service.ts` — listJournalEntries(..., { limit: 1000 }) |

**Risks:** Large TB (e.g. 1M lines) will OOM or time out; no cursor-based pagination for very large lists; no read replicas or connection pooling strategy documented.

**Remediation:** Define max rows per tenant/period and enforce; add streaming/chunked parse for TB ingest; add cursor pagination for list endpoints; document scaling (pool size, read replicas).

---

### 2.11 Disaster recovery — **2/5**

| Evidence | Location |
|----------|----------|
| Migrations | `src/db/migrate.ts` — control DB (001, 002, 010, 075); tenant migrations in `src/db/index.ts` (TENANT_MIGRATION_FILES); runTenantMigrationsForUrl |
| No backup/restore in repo | No scripts or docs for Postgres backup/restore, point-in-time recovery |
| Idempotent migrations | Migrations use IF NOT EXISTS / ON CONFLICT where appropriate; no destructive DROP in application migrations |

**Risks:** Backup strategy is outside repo; no tested restore procedure; migration rollback not automated.

**Remediation:** Document backup/restore and PITR; add smoke test that restores from backup; version migrations and document rollback policy.

---

### 2.12 Integration safety (post-back, idempotent exports) — **2.5/5**

| Evidence | Location |
|----------|----------|
| Push to GL | `src/services/push_close_to_gl_service.ts` — calls `accounting_integration_service.pushJournalEntry`; mock adapter returns synthetic externalId |
| Accounting integration | `src/services/accounting_integration_service.ts` — in-memory store when no pool; Mock adapter; no idempotency key in pushJournalEntry |
| Export gate before PDF/CSV | Export path checks gate and readiness; no “export id” or idempotent export record in code (storeExport stores export artifact but no dedup by idempotency key) |
| Close adjustment external_id | `src/types/close_and_controls.ts` — “GL external reference after push (idempotent post)”; migration 059_close_adjustments_posted_external_id.sql |

**Risks:** Real GL post-back not implemented (mock only); push is not idempotent by external_id in code (re-post could duplicate in real GL); export “store” is not clearly idempotent by key.

**Remediation:** Implement idempotent post (by external_id or idempotency key) when real adapter is added; document export idempotency if storing exports.

---

## 3. Hard Blockers List

Each blocker includes: why it’s a blocker, how to reproduce the failure, and exact fix steps (with file/module pointers).

| # | Blocker | Why it’s a blocker | How to reproduce | Exact fix |
|---|--------|--------------------|-------------------|-----------|
| 1 | Auth bypass paths in code | In prod bypass is off, but paths remain; if env is mis-set or new route copies pattern, auth can be skipped. | Set NODE_ENV=development, DIAGNOSTICS_AUTH_BYPASS=true; GET /api/supervisor/chat without Bearer → 200 with optionalAuth. | Remove or move auth-bypass to a dedicated dev-only router; never use bypass in production code paths. `src/server.ts` (shouldBypassAuth, authBypassPaths). |
| 2 | Period lock in-memory fallback | If any caller invokes period lock without pool (e.g. script or mis-wired route), lock is process-local and lost on restart. | Call `lockPeriod('2025-01', 'user', undefined, undefined, undefined)` in production; lock stored in Map; restart → lock gone. | In `src/services/period_lock_service.ts`, when `!isDbConfigured() \|\| !tenantId \|\| !pool`, call `disallowMemoryStoreInProduction({ storeName: 'period lock', hasDurableContext: false })` instead of using `locks` Map. |
| 3 | Accounting integration in-memory | Connections and state can be in-memory when pool is missing; production could 503 from requireTenantContext but internal paths might not. | Use accounting_integration without pool/tenantId in production (e.g. from a job or script that doesn’t set tenant). | In `src/services/accounting_integration_service.ts`, before using `connectionStore`, call `disallowMemoryStoreInProduction` when in production and !pool. |
| 4 | No chain verification on all critical paths | Export and close readiness verify chain; if a new “financial result” endpoint is added without calling the gate, tampered or broken chain could be exposed. | Add a new route that returns financial data without calling checkExportGate or verifyChain. | Centralize “financial result” behind a helper that always runs export gate (or explicit bypass with audit); code review checklist for any new financial endpoint. |
| 5 | Post-back not idempotent | When real GL adapter is used, duplicate push could create duplicate entries in GL. | Call pushAdjustmentToGL twice for same adjustment; mock returns new externalId each time; real adapter would post twice. | In `push_close_to_gl_service` / accounting adapter: accept idempotency key or external_id; in adapter, check existing post by key/external_id before creating. |
| 6 | JWT_SECRET default in production | Server throws at startup if JWT_SECRET is default in production (`src/auth/index.ts`). | Set NODE_ENV=production and omit JWT_SECRET (or set to dev default) → process throws. | Already enforced; ensure deployment always sets JWT_SECRET. Document in runbook. |
| 7 | Missing DB constraint on amounts | Journal line amounts could theoretically be negative if app bug or direct DB write. | Insert negative debit/credit via raw SQL into journal_entry_lines. | Add CHECK (debit >= 0 AND credit >= 0) if not already (072 has chk_je_line_debit_credit); audit other amount columns. |
| 8 | No lock timeout for jobs | Worker that dies while holding a lock leaves job in “locked” forever; no other worker can process it. | Kill worker after claimNext, before complete; job stays locked. | In `src/db/repositories/job_repository.ts` or worker: add “lock timeout” (e.g. locked_at < NOW() - interval); in claimNext, only claim pending or timed-out locked jobs; or heartbeat that updates locked_at. |

---

## 4. Go-Live Checklist (30 items)

Status: **PASS** / **FAIL** / **UNKNOWN** based on evidence.

### Engineering (12 items)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 1 | Integrity gate blocks unbalanced statements | PASS | financialStatements.ts throws; buildFinancialStatements returns error on gate fail |
| 2 | Export gate (chain + materiality) before PDF/CSV | PASS | export.ts calls checkExportGate; materiality from DB only |
| 3 | All financial mutations use parameterized queries | PASS | Repositories use $1, $2; no string concat of user input into SQL |
| 4 | Zod (or equivalent) on all request bodies that affect state | FAIL | catalog and a few routes use raw body |
| 5 | File upload type and size limits | PASS | multer fileFilter and limits on ingest, TB, JE attachments, vector_store |
| 6 | Durable job queue with retries and dead-letter | PASS | jobs table, job_worker, job_repository |
| 7 | Idempotency for ingestion scheduler | PASS | idempotencyKey per tenant/slot in ingestion_scheduler |
| 8 | Migrations run before app start | PASS | runMigrations in server start |
| 9 | No in-memory fallback for HITL in production | PASS | hitl_orchestrator calls disallowMemoryStoreInProduction |
| 10 | No in-memory fallback for period lock in production | FAIL | period_lock_service has in-memory Map when !pool |
| 11 | Request body size limit (Express) | PASS | server.ts: express.json({ limit: '1mb' }) |
| 12 | Health endpoint | PASS | server.ts: GET /health (ok), GET /health/ready (DB ping) |

### Security / Compliance (8 items)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 13 | JWT required for /api in production | PASS | useRequireAuth = isProduction \|\| requireAuthByDefault |
| 14 | JWT_SECRET not default in production | PASS | auth/index.ts throws |
| 15 | Tenant isolation (tenantId in queries) | PASS | Repositories use tenant_id in WHERE |
| 16 | Auth bypass disabled in production | PASS | shouldBypassAuth returns false when isProduction |
| 17 | Secrets not logged | PASS | logger.ts redact |
| 18 | Materiality flags not accepted from client | PASS | export.ts 403 on body roundingGapExceedsMateriality |
| 19 | Role-based access for period lock and JE post | PASS | segregation_service canPerform; close_period checks role |
| 20 | Audit log requires DB in production | PASS | audit_log_service throws when context missing in production |

### Operations (6 items)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 21 | Structured logging (JSON) | PASS | lib/logger.ts |
| 22 | Metrics or metrics endpoint | FAIL | No Prometheus or /metrics |
| 23 | Distributed tracing or trace_id in logs | FAIL | No OpenTelemetry/trace_id |
| 24 | Backup and restore documented | FAIL | No backup/restore in repo |
| 25 | Migration rollback policy | UNKNOWN | No rollback scripts |
| 26 | Worker can run as separate process | UNKNOWN | Code supports in-process; doc for separate process not in repo |

### Accounting Controls (4 items)

| # | Item | Status | Evidence |
|---|------|--------|----------|
| 27 | Period lock enforced before TB/edit | PASS | assertPeriodNotLocked in ingest, parser, close_adjustment_update, close_closing_entries |
| 28 | Close readiness blocks export when hard blockers | PASS | export.ts computeReadiness and 403 |
| 29 | Recon signoff recorded in audit ledger | PASS | recon_service recordMaterialEvent recon_signoff |
| 30 | JE status constrained in DB | PASS | migrations/072 chk_je_status |

---

## 5. Load & Failure Testing Plan (Backend)

### 5.1 Load profiles (5)

1. **Small close:** 1 tenant, 500 GL lines, 1 period, 5 JEs, 2 recon runs. Target: p95 < 2s for export PDF, < 500ms for readiness.
2. **Medium close:** 1 tenant, 50k GL lines, 1 period, 50 JEs, 10 recon runs. Target: p95 < 10s for export, no OOM.
3. **Large ledger:** 1 tenant, 500k GL lines, 1 period. Target: ingest and buildValidatedStatements complete or fail fast with clear error; no silent truncation.
4. **Multi-tenant:** 20 tenants, 10k lines each, concurrent export and job worker. Target: no cross-tenant leakage; job throughput scales.
5. **Ingestion burst:** 50 ingestion_pipeline jobs enqueued in 1 minute; 1 worker. Target: all complete or dead-letter; queue depth and latency metrics.

### 5.2 Failure injection tests (10)

1. **DB outage:** Stop Postgres during export; expect 503/500 and no partial response; restart DB and retry export succeeds.
2. **Audit chain tampered:** Update one `previous_entry_hash` in audit_ledger; call export; expect 403 and verifyChain.valid false.
3. **Job retry storm:** Enqueue 100 jobs that fail on first run; worker retries with backoff; expect no thundering herd; eventual dead-letter after max_attempts.
4. **Partial import:** Upload TB with 50% rows then timeout; verify no half-written period_trial_balance or consistent rollback.
5. **Period lock race:** Two requests lock same period concurrently; expect one success, one overwrite or conflict (document expected behavior).
6. **JWT expired:** Request with expired token; expect 401.
7. **Missing tenant context:** Request with valid JWT but tenant not in DB or pool not attached; expect 503 from requireTenantContext.
8. **Oversized file:** Upload file > 10 MB to trial-balance/ingest; expect 413 or 400.
9. **Invalid file type:** Upload .exe to ingest; expect 400 from fileFilter.
10. **Duplicate idempotency key:** Enqueue two jobs with same idempotencyKey after first completes; expect second enqueue returns inserted: false and same job id.

### 5.3 Metrics/alerts to watch

- **Application:** Request rate by route, error rate (4xx/5xx), p95/p99 latency by endpoint.
- **Jobs:** Queue depth (pending), processed per minute, dead-letter count, lock timeout (if implemented).
- **DB:** Connection pool usage, slow queries, replication lag (if applicable).
- **Business:** Export gate failures (403), readiness hard blockers count, audit chain verification failures.

---

## 6. Recommendation

### Verdict: **GO WITH LIMITS**

### Safe constraints for initial production

- Single tenant or low number of tenants (e.g. ≤ 10).
- Max TB size per period (e.g. ≤ 100k lines) and enforce in ingest or config.
- No real GL post-back (mock only) until idempotent post is implemented.
- Export: read-only consumption (PDF/CSV); storeExport optional; no “re-export same key” idempotency requirement initially.
- Require DATABASE_URL, JWT_SECRET, INGESTION_DEDUP_KEY in production; run worker in same process or single dedicated process.
- No reliance on auth bypass; REQUIRE_AUTH and REQUIRE_TENANT_CONTEXT effectively required in production.

### 2-week production hardening sprint (top 12 tasks)

1. Remove or strictly isolate auth bypass paths (`server.ts`).
2. Add `disallowMemoryStoreInProduction` to period_lock_service when pool is missing.
3. Add same to accounting_integration_service when pool is missing.
4. Attach request-id (req.id) to logger meta for correlation.
5. Confirm /health and /health/ready are used in deployment.
6. Add job lock timeout or heartbeat and reclaim stale locked jobs.
7. Keep or adjust request body size limit (e.g. express.json({ limit: '1mb' }) already present).
8. Add Zod (or equivalent) validation to catalog and any route using raw body.
9. Document backup/restore and run a restore test.
10. Add integration test: full close flow then verifyChain and export gate pass.
11. Define and document max TB rows and add guard in ingest or config.
12. Implement idempotent GL post (by external_id or idempotency key) when real adapter is introduced; or explicitly document “mock only” and no post-back in production.

---

*Assessment completed from codebase evidence only; no runtime or penetration testing performed.*
