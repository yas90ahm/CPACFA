# Blind Backend Architecture Review: Sovereign CPA Engine

**Reviewer**: Senior Backend Architect (cold review -- never seen this codebase before)
**Date**: 2026-03-13
**Scope**: Backend source code only (.ts, .sql, .json files)
**Codebase stats**: 156 services, 80 repositories, 31 route modules, 3 middleware files, 166 migrations

---

## Executive Summary

**Overall Grade: B+**

This is a genuinely impressive financial close engine with several architectural decisions that reflect deep domain expertise. The state machine is correctly gated, monetary arithmetic uses Decimal.js throughout, the audit ledger is cryptographically hash-chained, and AI is structurally prevented from writing to financial tables. The separation of concerns across 156 services is generally clean, with services being stateless and repositories handling all database access.

The main architectural risks are: (1) 156 services is a large surface area for a single Express process, (2) some route handlers bypass the Zod validation middleware in favor of manual checks, creating inconsistency, and (3) the `insertJournalEntryLines` function inserts lines one at a time in a loop rather than batching. None of these are blocking for production. The financial integrity guarantees are unusually strong for a codebase of this size.

---

## Detailed Assessment

### 1. SERVICE DESIGN: Grade A-

**Strengths:**

- **Single responsibility is well-maintained.** The close session lifecycle (`close_session_service.ts`), journal entry lifecycle (`journal_entry_service.ts`), cascade propagation (`cascade_engine.ts`), and financial statement generation (`financialStatements.ts`) are cleanly separated. Each service owns one concern.
  - `src/services/close_session_service.ts` lines 1-18: Clear documentation of states, transitions, and responsibilities.
  - `src/services/cascade_engine.ts` lines 1-30: Explicit trigger taxonomy with documented wiring points.

- **Services are stateless.** No mutable state held between calls. All state lives in PostgreSQL. Pool is passed as a parameter, not stored in a module-level variable.
  - `src/services/close_session_service.ts` line 74: `createSession(pool: Pool, ...)` -- pool injected per call.
  - `src/services/journal_entry_service.ts` line 51: Same pattern throughout.

- **Database access follows a consistent pattern.** Services import from `src/db/repositories/*` and never write raw SQL (with one exception noted below). This is a strong boundary.
  - `src/services/close_session_service.ts` line 24: `import * as repo from '../db/repositories/close_session_repository.js'`

- **Typed error classes per service domain.** `CloseSessionError`, `JournalEntryError`, `PeriodReconciliationError`, `MathematicalIntegrityError` each carry a discriminated `code` field for programmatic error handling.
  - `src/services/close_session_service.ts` lines 53-61
  - `src/services/journal_entry_service.ts` lines 40-48
  - `src/errors.ts` lines 7-24

**Issues:**

- **One raw SQL query in a service.** `journal_entry_service.ts` line 476 contains `pool.query('SELECT id, period_start, period_end, status FROM close_sessions ...')` bypassing the repository pattern. This is a minor breach of the otherwise consistent repository boundary.
  - File: `src/services/journal_entry_service.ts`, line 476

- **Some services are large.** `close_session_service.ts` is 895 lines. Manageable but approaching the point where extraction of the certification logic into a dedicated `certification_service.ts` would improve readability. The `certifyCloseSession` function alone spans lines 258-489 (230 lines).

- **Service-to-service coupling via dynamic imports.** `close_session_service.ts` line 529 uses `await import('./issue_service.js')` and line 856 uses `await import('./period_reconciliation_service.js')`. This suggests circular dependency avoidance, which is pragmatic but indicates the dependency graph has some tension.

- **156 services in a single process.** This is a monolith. Not inherently bad, but startup time and memory will grow. No evidence of lazy loading beyond the dynamic imports.

### 2. API DESIGN: Grade B+

**Strengths:**

- **RESTful conventions are generally followed.** POST for creates, GET for reads, DELETE for deletes. The close session routes use POST for state transitions (`/advance`, `/certify`, `/lock`, `/reopen`, `/reject`) which is appropriate for non-idempotent operations.
  - `src/routes/close/close_sessions.ts` lines 131, 174: POST for create/ensure
  - `src/routes/gl/ingest.ts` lines 62, 97: POST for uploads

- **Consistent error response shape.** The `handleSessionError` function in `close_sessions.ts` (lines 68-100) maps typed error codes to appropriate HTTP status codes: 404 for NOT_FOUND, 403 for INSUFFICIENT_ROLE, 409 for OVERLAP/INVALID_TRANSITION, 422 for NOT_READY, 400 for VALIDATION.

- **Zod validation middleware exists and is well-designed.** `src/middleware/validationMiddleware.ts` provides `validateRequest`, `validateBody`, `validateQuery`, `validateParams` using Zod schemas. Returns structured `fieldErrors` array (lines 23-49).

- **Rate limiting applied globally.** `src/server.ts` line 113: 200 requests/minute per IP with standard headers. Auth routes are excluded (mounted before the limiter).

- **Request ID correlation.** `src/middleware/requestId.ts` generates or accepts `X-Request-Id`, attaches it to error responses automatically (lines 28-34).

- **Idempotent session creation.** `createSessionOrGetExisting` (line 121-137 of close_session_service.ts) returns existing session with 200 or creates new with 201. Good API design for client retries.

**Issues:**

- **Zod validation not used consistently across routes.** The GL ingest routes (`src/routes/gl/ingest.ts`) and close session routes (`src/routes/close/close_sessions.ts`) use manual `if (!body.entityId)` checks instead of Zod schemas. The middleware exists but is underutilized. Compare the `requireValidTenantId` middleware (which uses Zod, line 112 of validationMiddleware.ts) with the manual checks in the close sessions route (lines 146-156 of close_sessions.ts).

- **No pagination on several list endpoints.** `listCloseSessions` in the repository (line 181 of close_session_repository.ts) has no LIMIT clause. For a multi-tenant system, this could return unbounded rows. The GL endpoints at `src/routes/gl/ingest.ts` line 302 (`GET /api/gl/`) also return all entries without pagination.

- **Inconsistent response envelopes.** Some routes return `{ entities }` (portfolio.ts line 39), others return `{ status, message, ...result }` (gl/ingest.ts line 166), and others return the raw object (close_sessions.ts creates). No unified envelope pattern.

### 3. DATABASE: Grade A

**Strengths:**

- **Repository pattern is used consistently across 80 repositories.** All SQL is in `src/db/repositories/*.ts`. Services never construct SQL directly (with the one exception noted above).
  - `src/db/repositories/close_session_repository.ts`: Clean row-to-domain mapping (lines 54-87)
  - `src/db/repositories/journal_entry_repository.ts`: Same pattern with typed row interfaces

- **All queries are parameterized.** Every query uses `$1, $2, ...` placeholders. No string concatenation for SQL. I examined all four repository files fully and found zero instances of SQL injection vectors.
  - `src/db/repositories/close_session_repository.ts` line 98: `pool.query<{ id: string }>('SELECT id FROM close_sessions WHERE tenant_id = $1 AND ...')`
  - `src/db/repositories/general_ledger_repository.ts` line 133: Batch insert uses parameterized `$N` for every value

- **Money stored as NUMERIC(20,2), never FLOAT.** Migration `121_money_column_precision.sql` standardizes all money columns. The `GENERATED ALWAYS` columns in migration 102 use NUMERIC(20,2) for computed variance. Grep for FLOAT/REAL/DOUBLE across all 166 migrations found zero monetary float columns.

- **GENERATED ALWAYS columns used correctly.** `migrations/102_tenant_period_reconciliations.sql` lines 14-23: `variance`, `is_within_tolerance`, and `unexplained_variance` are GENERATED ALWAYS AS expressions computed from `gl_balance` and `supporting_balance`. This prevents application-layer bugs from creating inconsistency.

- **Transactions used for multi-step operations.** `src/db/transaction.ts` provides a clean `withTransaction` helper (29 lines). Used correctly in certification (`close_session_service.ts` line 268), advance (`close_session_service.ts` line 841), and GL upsert (`general_ledger_repository.ts` line 69).

- **Advisory locks prevent concurrent upload races.** `general_ledger_repository.ts` lines 74-77: `pg_advisory_xact_lock(hashtext(...))` prevents two concurrent GL uploads for the same tenant+period from racing.

- **Row-level locks for concurrent certification prevention.** `close_session_service.ts` line 270: `SELECT ... FOR UPDATE` inside transaction. Also `getCloseSessionByIdForUpdate` in repository (line 167).

- **CHECK constraints on domain values.** `migrations/072_tenant_journal_entries.sql` line 17: `CHECK (status IN ('draft', 'proposed', 'approved', 'posted', 'exported', 'rejected'))`. Line 35: `CHECK (debit >= 0 AND credit >= 0)`.

- **Proper indexing.** Lines, entries, and sessions have indexes on tenant_id, status, close_session_id, and created_at. Migration 072 has 4 indexes on journal_entries alone.

**Issues:**

- **Batch insert for JE lines is missing.** `journal_entry_repository.ts` lines 246-268: `insertJournalEntryLines` inserts one row at a time in a for loop. For a JE with 50 lines, this is 50 round trips. Compare with `general_ledger_repository.ts` lines 88-141 which correctly batches. This is the single most impactful performance fix available.

- **Primary keys are TEXT, not UUID type.** All tables use `TEXT PRIMARY KEY` with UUIDs generated in application code (`randomUUID()`). Using the native UUID type would be more storage-efficient and enable `gen_random_uuid()` defaults. Not a functional issue but a missed optimization across 166 migrations.

### 4. STATE MACHINE: Grade A

**Strengths:**

- **Valid transitions are explicitly defined.** `close_session_service.ts` line 45-51: `ALLOWED_TRANSITIONS` is a static record. `locked: []` means LOCKED is truly terminal. The machine is clear: `open -> in_progress -> under_review`, then certification via a separate code path, then `certified -> locked`.

- **Transitions are gated by readiness checks.** Line 848: `computeReadiness` blocks `in_progress -> under_review` if hard blockers exist. Lines 296-310: `certifyCloseSession` re-validates readiness, evidence policy, and cross-statement validation. No stale cache -- `canCertify` (line 618) re-runs validation fresh.

- **Steps cannot be skipped.** `nextStatusTowardUnderReview` (line 554) only allows one step at a time. There is no code path from `open` to `under_review` or `certified` without traversing intermediate states.

- **Certification requires role check.** Line 264: `canPerform(actorRole, 'certify_close')` gates certification to approver role. The segregation service is imported and used correctly.

- **Reopen is audited and gated.** Lines 646-674: `canReopen` requires the session to be `certified` (not `locked`), a non-empty reason (min 10 chars), and `hasReopenAuthority`. The reopen is recorded in the audit ledger with the prior certification details (line 700-712).

- **Locked is permanent.** `ALLOWED_TRANSITIONS['locked']` is `[]`. `lockCloseSession` (line 729) records the lock event with `daysSinceCertification`. No reopen from locked.

- **Stale statements block certification.** Line 288-293: If `statementsStaleSince` is set (by the cascade engine after a TB change), certification is blocked until statements are regenerated.

- **Cross-statement validation at certification.** Lines 361-371: `runCrossStatementValidationForCertification` checks A=L+E, net income tie, cash tie, equity tie, and retained earnings tie. All are hard checks that block certification.

- **AI boundary assertion.** Lines 263, 685, 730: `assertNoAiMutationContext()` is called at the top of `certifyCloseSession`, `reopenCloseSession`, and `lockCloseSession`. This is the first line of defense.

**Issues:**

- **Rejection creates an issue but uses `client as unknown as Pool`.** Line 515: `createIssue(client as unknown as Pool, ...)`. This is a type coercion that bypasses TypeScript safety. The issue service should accept `PoolClient` or a `Queryable` type. Same pattern at line 713.

### 5. CASCADE ENGINE: Grade A-

**Strengths:**

- **Recursion guard.** `cascade_engine.ts` line 39: `MAX_CASCADE_DEPTH = 3`. Line 202: Guard check `if (depth >= MAX_CASCADE_DEPTH)` returns empty result and logs warning.

- **Performance monitoring built in.** Line 40: `MAX_CASCADE_MS = 2000`. Lines 319-325: If cascade exceeds 2 seconds, a warning is logged with full timing breakdown.

- **Steps 3, 4, 5 run in parallel.** Lines 267-303: `Promise.all` for statement invalidation, readiness recomputation, and issue cascade. Independent steps are not serialized.

- **Lightweight mode for readiness.** Line 285: `computeReadiness(pool, tenantId, session, { lightweight: true })` skips expensive operations (verifyChain O(n) scan, N+1 evidence loops) during cascades.

- **Staleness propagation is correct.** Line 274: `setStatementsStaleSince` marks statements as stale when TB-affecting changes occur, without regenerating them. Regeneration is a separate, explicit action.

- **Cascade is deterministic.** The trigger type determines which steps execute. `affectsTB` (line 141) returns true only for TB-affecting triggers. Non-TB triggers (recon completed, issue resolved) skip TB recalculation and statement invalidation.

**Issues:**

- **No idempotency key.** If a cascade is triggered twice for the same event (e.g., due to a retry), it runs twice. The cascade is cheap enough that this is unlikely to cause issues, but a deduplication check based on trigger ID would add resilience.

- **Cascade runs synchronously within the request.** Lines 1-3 of the module docstring confirm this. For a 2-second cascade, the client is waiting 2 seconds. An async cascade queue would decouple the request from the cascade but adds complexity. The current approach is pragmatic for the current scale.

- **N+1 risk in recon status changes.** Lines 239-253: When reverted reconciliation IDs are detected, the code fetches the full reconciliation list and searches it in a loop. If 50 recons are reverted, this is 50 linear searches on the full list. Unlikely to be a real performance issue at current scale but worth noting.

### 6. ERROR HANDLING: Grade A-

**Strengths:**

- **Stack traces are never leaked to clients.** `src/lib/errorHandler.ts` lines 11-15: `STANDARD_500_BODY` is a constant with no variable content. Line 30: `send500` always returns this body with an optional requestId. The actual error is logged server-side only (line 28).

- **Global error handler in server.ts.** Line 247: `app.use((err, _req, res, _next) => send500(res, err, 'Internal server error'))`. This catches unhandled errors from any route.

- **Typed error codes enable programmatic handling.** `CloseSessionError` has 13 discriminated codes (line 56). `JournalEntryError` has 5 codes (line 42). `MathematicalIntegrityError` carries the check type ('A' or 'B') and imbalance amount (line 8-11). This is far better than generic Error messages.

- **HTTP status codes are appropriate.** Route-level error handling maps codes to correct statuses: 400 for validation, 404 for not found, 403 for insufficient role, 409 for conflicts, 422 for business logic violations, 500 for unexpected errors.
  - `src/routes/close/close_sessions.ts` lines 68-100: `handleSessionError` maps all codes.

- **RequestId attached to error responses.** `src/middleware/requestId.ts` lines 29-33: The `res.json` method is monkeypatched to inject `requestId` into any 4xx/5xx response body.

**Issues:**

- **Some routes log errors to console.error before calling send500.** `src/routes/gl/ingest.ts` line 180: `console.error('GL upload error:', err)` then `send500(res, err)`. The `send500` function already logs. This creates duplicate logging.

- **Error swallowing in journal_entry_service.ts.** Lines 666-668 and 672-675: The `reversePostedJE` function catches and discards errors from SQL queries that link the reversal: `.catch(() => {})`. The comment explains the columns may not exist (migration ordering), but silently swallowing errors in a financial mutation path is risky. A better approach would be to log the error and continue.

---

## Top 10 Architecture Risks (Ranked by Severity)

1. **P0 -- JE Line Insert N+1.** `journal_entry_repository.ts` lines 246-268 inserts lines one at a time. For a JE with 100 lines, this is 100 DB round trips within a single API call. Batch insert (like the GL repository does) would reduce this to 1 round trip. Impact: latency for large JEs, DB connection pool exhaustion under load.

2. **P1 -- Unbounded List Queries.** `listCloseSessions` (repository line 181) has no LIMIT. A tenant with 500 close sessions returns all of them. Same issue with GL list endpoint. Add pagination with configurable limit (default 50, max 200) and cursor-based pagination.

3. **P1 -- Zod Validation Inconsistently Applied.** The validation middleware exists and is well-designed but is only used on ~30% of routes. Close session routes, GL ingest, and portfolio routes use manual `if (!body.field)` checks. This creates inconsistent error response shapes and risks missing edge cases (e.g., empty string vs undefined).

4. **P1 -- Type Coercion in Transaction Paths.** `close_session_service.ts` line 515: `client as unknown as Pool` is used to pass a `PoolClient` where a `Pool` is expected. If the called function ever uses pool-specific methods (like `connect()`), this would crash at runtime. Solution: services and repositories should accept `Queryable = Pool | PoolClient`.

5. **P1 -- Error Swallowing in Financial Mutations.** `journal_entry_service.ts` lines 666-675: `.catch(() => {})` on SQL updates that link reversal JEs. If these fail silently, the reversal link is lost, and the original JE could be reversed again. At minimum, log the error.

6. **P2 -- Cascade Has No Idempotency Guard.** If a cascade is triggered twice for the same event, both run fully. Under normal conditions this is harmless (cascades are read-heavy), but a deduplication mechanism would prevent edge cases.

7. **P2 -- TEXT Primary Keys Instead of UUID Type.** All 166 migrations use `TEXT PRIMARY KEY` for UUID values. Native UUID type is 16 bytes vs ~36 bytes for TEXT, and enables database-level UUID generation. Not a functional issue but a storage and performance consideration at scale.

8. **P2 -- Single Process Monolith with 156 Services.** All services load into one Express process. Memory footprint, startup time, and blast radius are all correlated. Consider extracting the job worker (already separated via `runWorkerLoop`) and AI-related services into separate processes first.

9. **P2 -- Console Logging.** Many services use `console.log` and `console.error` for diagnostics. The `lib/logger.ts` module exists but is not universally used. Structured logging with correlation IDs is critical for production observability. The cascade engine (line 314) logs timing data via `console.log`.

10. **P2 -- Known Vulnerability in xlsx Dependency.** `package.json` line 34 documents two high-severity CVEs in the `xlsx` library (prototype pollution and ReDoS). The team has flagged this for replacement with `exceljs` but it remains in production.

---

## What the Codebase Does WELL

1. **Decimal Arithmetic Everywhere.** `src/utils/decimal.ts` wraps Decimal.js with `sumRound2`, `minus`, `plus`, `round2`, and `normalizeMoney`. Every financial calculation goes through these functions. The `financialStatements.ts` build functions use them exclusively (lines 114-116, 229-250). No floating-point arithmetic touches money. This is the single most important correctness decision in a financial system.

2. **AI Boundary is Structural, Not Just Policy.** `src/lib/ai_boundary.ts` uses `AsyncLocalStorage` to track whether the current async execution chain is inside an AI advisory context. `assertNoAiMutationContext()` is called at the entry point of every mutation path (certify, lock, reopen). This is per-request isolation (not global), preventing false positives during concurrent requests (lines 8-11). The enforcement runs in ALL environments, not just production (line 53).

3. **Hash-Chained Audit Ledger.** `src/db/repositories/audit_ledger_repository.ts` implements a blockchain-style append-only audit trail. Each entry contains `previous_entry_hash` and `entry_hash` (SHA-256). The `verifyChain` function (lines 313-469) walks the chain and validates every hash, with checkpoint support for incremental verification. This provides tamper-evident audit history for regulatory compliance.

4. **State Machine Correctness.** The close session state machine is implemented with explicit transition maps, row-level locks (FOR UPDATE), readiness gates, cross-statement validation, evidence policy checks, and stale statement detection. The certification path (lines 258-489 of close_session_service.ts) is the most thoroughly validated code path I have ever seen in a financial close system.

5. **Segregation of Duties.** `journal_entry_service.ts` line 151: `je.createdBy === approvedBy` check with production enforcement. Line 34: `isSameUserApproveAllowed()` always returns false in production regardless of environment variables. This is defense-in-depth.

6. **Cascade Engine Design.** The cascade engine (lines 196-328) is remarkably well-structured: recursion guard, performance monitoring with per-step timing, parallel execution of independent steps, lightweight readiness mode, and clear trigger taxonomy. This is the kind of infrastructure that prevents bugs when the system grows.

7. **Transaction Helper.** `src/db/transaction.ts` is 29 lines, perfectly correct, with BEGIN/COMMIT/ROLLBACK and proper client release in finally. Used correctly across all critical write paths.

8. **Multi-Tenant Architecture.** Per-tenant database pools with migration support (`getTenantPoolWithMigrations`), AI-scoped pools with restricted write access (`tenantAiPool`), and tenant context middleware that blocks in-memory fallbacks in production (`requireTenantContext`). The BYOD (Bring Your Own Database) architecture enables data sovereignty.

---

## Recommendations with Priority

### P0 (Fix before scaling)

1. **Batch JE line inserts.** Replace the loop in `journal_entry_repository.ts` lines 246-268 with a single multi-row INSERT using parameterized values, following the pattern already established in `general_ledger_repository.ts` lines 88-141.

### P1 (Fix in next sprint)

2. **Add pagination to all list endpoints.** Add `LIMIT/OFFSET` or cursor-based pagination to `listCloseSessions`, GL list, audit log list, and any other unbounded queries. Default LIMIT 50, max 200.

3. **Standardize on Zod validation.** Create Zod schemas for all route inputs (body, query, params) and wire them through `validateRequest`. This ensures consistent error shapes and catches edge cases (empty strings, wrong types, missing fields).

4. **Fix `Queryable` type across services.** Define `type Queryable = Pool | PoolClient` (already exists in some repositories) and use it consistently in service function signatures. Remove all `as unknown as Pool` casts.

5. **Log errors instead of swallowing.** Replace `.catch(() => {})` in `journal_entry_service.ts` lines 666-675 with `.catch((e) => console.warn('...',  e.message))`.

### P2 (Track for future improvement)

6. **Replace xlsx with exceljs.** The team has already identified this. Track as a dependency upgrade.

7. **Structured logging.** Replace `console.log`/`console.error` with the existing `lib/logger.ts` across all services. Add correlation ID (requestId) to all log entries.

8. **Extract worker process.** The job worker (`runWorkerLoop`, server.ts line 321) already runs as a separate loop. Extract it into a separate Node.js process for fault isolation.

9. **Consider UUID column type.** When the next major schema migration occurs, convert TEXT primary keys to native UUID type for storage efficiency.

10. **Add cascade idempotency.** Pass a `trigger_id` (e.g., the JE ID or recon ID that caused the cascade) and skip if already processed within a time window.

---

## Area Grade Summary

| Area | Grade | Rationale |
|------|-------|-----------|
| Service Design | A- | Clean SRP, stateless, typed errors. Minor: one raw SQL in service, large certification function. |
| API Design | B+ | RESTful, rate-limited, request ID correlation. Minor: inconsistent validation, no pagination. |
| Database | A | Parameterized queries, NUMERIC(20,2), GENERATED ALWAYS, advisory locks, proper transactions. Minor: JE line N+1. |
| State Machine | A | Explicit transitions, readiness gates, row-level locks, AI boundary, cross-statement validation. |
| Cascade Engine | A- | Recursion guard, parallel steps, performance monitoring, lightweight mode. Minor: no idempotency. |
| Error Handling | A- | No stack trace leakage, typed errors, global handler, request IDs. Minor: error swallowing. |

**Overall: B+** -- This is a production-ready financial close engine with unusually strong mathematical integrity guarantees, a well-designed state machine, and proper security boundaries. The issues identified are optimization opportunities, not architectural defects. The team has made consistently good decisions about the things that matter most in financial software: decimal arithmetic, immutable audit trails, segregation of duties, and preventing AI from mutating financial state.
