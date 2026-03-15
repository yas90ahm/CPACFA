# SABIT Backend Architecture Audit

**Audit Date:** 2026-03-12
**Auditor:** Backend Architect (Claude Opus 4.6)
**Scope:** 152 services, 94 route files, 50+ repositories, 147 migrations
**Project Root:** `C:\Users\yasir\CPACFA`

---

## TASK 1: ARCHITECTURE QUALITY ASSESSMENT

---

### 1. SERVICE LAYER DESIGN

#### Structure and Single Responsibility

Services are organized as flat TypeScript modules in `src/services/` (no subdirectories except `trial-balance/`). Each service file exports standalone functions rather than classes, following a functional-service pattern. Most services exhibit strong single responsibility:

- `cascade_engine.ts` (329 lines) -- downstream state propagation only
- `journal_entry_service.ts` (690 lines) -- JE lifecycle only
- `close_session_service.ts` (894 lines) -- state machine only
- `statement_package_service.ts` (669 lines) -- statement generation and versioning

**Files exceeding 500 lines (candidates for splitting):**

| File | Lines | Assessment |
|------|-------|------------|
| `gl_upload_service.ts` | 1,325 | **Should split.** CSV/XLSX parsing, header detection, column mapping, validation, and persistence are all in one file. Extract `gl_parser.ts` and `gl_validator.ts`. |
| `gl_health_analysis_service.ts` | 919 | Should split into analysis and reporting. |
| `close_session_service.ts` | 894 | Acceptable -- the state machine, gates, and certification are tightly coupled. The advance/certify/reopen flows belong together. |
| `period_reconciliation_service.ts` | 746 | Acceptable -- reconciliation workflow is one domain. |
| `journal_entry_service.ts` | 690 | Acceptable -- JE lifecycle (draft/propose/approve/post/reverse) is one concern. |
| `ai_classification_service.ts` | 688 | Could split AI call logic from classification rules. |
| `statement_package_service.ts` | 669 | Acceptable -- generation, diffing, and persistence for statements. |
| `persistence_service.ts` | 648 | Review for potential dead code (in-memory fallbacks). |
| `justification_service.ts` | 605 | Acceptable. |

**Average service file size:** ~218 lines (33,202 total / 152 files). This is healthy.

#### Dependency Injection

Services use **module-level imports** and receive the `Pool` (database connection pool) as a function parameter. This is a pragmatic pattern for a monolith:

```typescript
// src/services/cascade_engine.ts, line 196
export async function executeCascade(
  pool: Pool,
  tenantId: string,
  trigger: CascadeTrigger,
  depth = 0
): Promise<CascadeResult> {
```

There is no DI container. Services are imported directly via ES module imports. Some services use dynamic `import()` to avoid circular dependencies (e.g., `cascade_engine.ts` line 229: `const { refreshGLBalances } = await import('./period_reconciliation_service.js')`).

**Assessment:** Acceptable for current scale. Pool-passing is simple and testable. Dynamic imports for cycle-breaking are a minor smell but not harmful.

#### Circular Dependencies

The cascade engine uses dynamic imports specifically to break circular dependencies:

- `cascade_engine.ts` line 229: dynamic import of `period_reconciliation_service.js`
- `cascade_engine.ts` line 240: dynamic import of `period_reconciliation_repository.js`
- `close_session_service.ts` line 529: dynamic import of `issue_service.js`

These are documented and intentional. No accidental circular dependency chains were found.

#### Statefulness

Services are **stateless**. All state lives in PostgreSQL. The only in-process state is:

1. **Connection pool cache** (`src/db/index.ts` lines 19-24): `tenantPoolsByUrl` Map with LRU eviction at 50 pools.
2. **Event emitter singleton** (`src/events/financial_event_emitter.ts` line 126): `financialEvents` singleton with `setMaxListeners(50)`.
3. **Registered flag** (`src/events/event_handlers.ts` line 68): `let registered = false` idempotency guard.

**Verdict:** Safe for multi-instance deployment behind a load balancer. The pool cache is per-instance (correct -- each instance needs its own connections). The event emitter is in-process (correct -- events are ephemeral triggers that enqueue persistent jobs).

#### Dead Code / Unwired Services

The `job_service.ts` file explicitly declares itself unwired:

```typescript
// src/services/job_service.ts, line 1-6
/**
 * STATUS: UNWIRED -- This service compiles but is not imported by any active route.
 * It exists as potential future functionality.
 * Last verified: 2026-02-25
 */
```

However, `event_handlers.ts` imports `enqueueJob` from `job_service.ts` (line 11), so the service IS wired indirectly through the event system. The status comment is stale.

**Grade: B+** -- Well-structured services with good separation of concerns. Pool-passing is clean. Dynamic imports for cycle-breaking are pragmatic. The gl_upload_service needs splitting. One stale status comment.

---

### 2. API DESIGN

#### RESTful Consistency

Routes are organized in directories (`close/`, `gl/`, `verification/`, `audit/`, `trial-balance/`) and follow REST conventions mostly:

- `POST /api/close/sessions` -- create session
- `GET /api/close/sessions/:id` -- get session
- `POST /api/close/sessions/:id/advance` -- transition (action endpoint)
- `POST /api/close/sessions/:id/certify` -- certify (action endpoint)
- `POST /api/gl/ingest` -- upload GL
- `GET /api/gl/trial-balance` -- derived TB

Action endpoints (advance, certify, lock, reject, reopen) correctly use POST rather than PATCH, which is appropriate for state transitions.

#### Error Response Format

**Two competing error envelope formats exist:**

1. **`errorEnvelope.ts`** (lines 9-15): `{ error, code, message, details, requestId }` -- used by `sendError()`.
2. **`errorHandler.ts`** (line 11): `{ error, code, message }` -- used by `send500()`.
3. **Route-level ad-hoc:** Many routes return `{ error: '...', message: '...' }` directly.

The `requestIdMiddleware` (line 29-33) injects `requestId` into all 4xx+ responses via `res.json` monkey-patch. This is clever but fragile.

**Example inconsistency in GL ingest route** (`src/routes/gl/ingest.ts`):
- Line 69: `res.status(400).json({ error: 'File is required' })` -- no `code`, no `message`
- Line 152: `res.status(400).json(result)` -- passes raw service result
- Line 164: `res.status(200).json({ status: 'success', message: '...' })` -- success uses `status` field

**Verdict:** Error envelope is inconsistent. Some routes use `sendError()`, some use `send500()`, some construct ad-hoc objects.

#### Input Validation

Two Zod validation middleware files exist:

1. `src/middleware/validateRequest.ts` -- simpler, returns `{ error, details }` format
2. `src/middleware/validationMiddleware.ts` -- richer, returns `{ error, message, fieldErrors }` format

Both export `validateBody`, `validateQuery`, `validateParams` with identical function signatures but different error response shapes. This is confusing and leads to inconsistent validation responses depending on which middleware a route imports.

Routes like `gl/ingest.ts` use `requireValidTenantId` from `validationMiddleware.ts` but do manual validation for file upload. Routes like `close_sessions.ts` use manual validation (no Zod middleware in the route chain).

**Verdict:** Zod validation exists but is not uniformly applied. Critical routes (certify, post JE, advance) rely on service-layer validation rather than middleware validation.

#### Pagination

List endpoints do not implement standardized pagination:
- `listCloseSessions` (`close_session_repository.ts` line 181-202): no LIMIT/OFFSET
- `listJournalEntries` accepts a `limit` filter but no `offset`
- `listByTenantAndPeriod` (audit ledger, line 158-230): accepts `limit` and `offset`
- GL endpoints return all lines for a period with no pagination

**Missing:** No standard pagination envelope (`{ data, total, page, perPage }`) across endpoints.

#### Response Shape Consistency

Responses are mixed:
- Some use `{ data: ... }` wrapper
- Some return bare objects
- Some use `{ status: 'success', ...result }`
- Statement package endpoints return `{ package, lines }`

**Grade: C+** -- RESTful structure is solid, but error envelopes, validation middleware, pagination, and response shapes are inconsistent. The dual validation middleware files are a concrete problem.

---

### 3. DATABASE LAYER

#### Query Strategy

Queries use **parameterized raw SQL** via `pg` driver. No ORM, no query builder. This is appropriate for a financial system where query precision matters:

```typescript
// src/db/repositories/close_session_repository.ts, line 157-160
const r = await client.query<CloseSessionRow>(
  `SELECT ${SESSION_COLUMNS} FROM close_sessions WHERE tenant_id = $1 AND id = $2`,
  [tenantId, id]
);
```

All queries use parameterized placeholders (`$1`, `$2`), preventing SQL injection.

#### Repository Pattern

A clean repository pattern exists with 50+ repository files in `src/db/repositories/`. Services never query the database directly; they call repository functions. Each repository file handles one table or closely related table group:

- `close_session_repository.ts` -- close_sessions table
- `general_ledger_repository.ts` -- general_ledger table
- `audit_ledger_repository.ts` -- audit_ledger table
- `journal_entry_repository.ts` -- journal_entries + journal_entry_lines tables

**Exception:** Some services contain raw queries alongside repository calls:
- `journal_entry_service.ts` lines 427-435: raw `pool.query()` for prior-period conflict check
- `journal_entry_service.ts` lines 614-626: raw `pool.query()` for reversal linking (with `.catch()` for missing columns)
- `close_session_service.ts` lines 270-273: raw `pool.query()` for `SELECT ... FOR UPDATE` lock

#### Transactions

Transactions are properly used for multi-step mutations via `withTransaction()` helper (`src/db/transaction.ts`):

```typescript
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
```

Used correctly in critical paths:
- `certifyCloseSession` (line 268): entire certification in one transaction
- `advanceSession` (line 841): status transition + reconciliation initialization
- `generateStatements` (line 422): statement generation + variance computation + audit event
- `upsertGLForPeriod` (line 69): DELETE + batch INSERT atomically

**Concern:** `client as unknown as Pool` casts appear in several places (e.g., `close_session_service.ts` line 515: `client as unknown as Pool`). This is done to pass a `PoolClient` where a `Pool` type is expected. It works because both share the `.query()` interface, but it defeats type safety and could mask bugs if a function calls `pool.connect()` on the client.

#### Connection Pooling

```typescript
// src/db/index.ts, line 50
controlPool = new Pool({ connectionString: url, max: 20 });

// src/db/index.ts, line 107
pool = new Pool({ connectionString: url, max: 10 });

// src/db/index.ts, line 137 (AI pool)
pool = new Pool({ connectionString: url, max: 5 });
```

- Control pool: max 20 connections
- Per-tenant pool: max 10 connections
- Per-tenant AI pool: max 5 connections
- LRU cache with max 50 tenant pools (eviction at line 86-93)

**Risk:** 50 tenants x 10 connections = 500 database connections maximum. Plus 50 AI pools x 5 = 250. Plus control pool = 20. Total theoretical max: 770 connections. PostgreSQL default `max_connections` is 100. This will fail spectacularly in production unless PostgreSQL is configured with higher limits or a connection pooler (PgBouncer) is deployed.

#### Potential Deadlocks

The `certifyCloseSession` function acquires a `FOR UPDATE` lock on the close_sessions row (line 270-273), then performs many downstream queries. If two concurrent requests lock different rows and then try to read each other's data, deadlocks could occur. However, since all operations are scoped to a single session ID, and the lock is acquired first before any other writes, the risk is **low for certification**.

The `appendEntry` function in `audit_ledger_repository.ts` (line 92) reads the latest hash then inserts. Two concurrent audit entries for the same tenant could race on `getLatestHash`. The DB trigger `enforce_audit_ledger_chain` (migration 128) would catch this and raise an exception, which is correct behavior but could cause retry failures under high concurrency.

#### Index Coverage

Dedicated performance indexes exist:
- Migration 097: `idx_gl_tb_covering` -- covering index for TB derivation
- Migration 141: Cascade performance indexes for period reconciliations, journal entries, close issues, recon requirements

**Missing indexes identified:**
1. `audit_ledger(tenant_id, created_at)` -- for `verifyChain` which does `ORDER BY created_at ASC` (currently a full table scan per tenant)
2. `close_sessions(tenant_id, entity_id, period_end)` -- for prior-period lookups in statement generation
3. `statement_packages(close_session_id, generated_at)` -- for latest package lookup

**Grade: B+** -- Repository pattern is clean, transactions are properly used, parameterized queries prevent injection, batch inserts for GL are efficient. The `client as unknown as Pool` casts and missing indexes are the main concerns. Connection pool limits need production tuning.

---

### 4. CASCADE ENGINE

**File:** `src/services/cascade_engine.ts` (329 lines)

#### How It Works

The cascade engine is the "nervous system of the close" (comment, line 4). Every financial mutation (JE posted, recon completed, mapping changed, TB reingested) triggers a synchronous cascade that propagates downstream effects:

1. **Step 0:** Fetch close session (validate it exists)
2. **Step 1:** Adjusted TB -- no action needed (computed on-demand, no cache)
3. **Step 2:** Refresh reconciliation GL balances (if TB-affecting trigger)
4. **Step 3:** Invalidate statement packages (set `statements_stale_since`)
5. **Step 4:** Re-run readiness validation (lightweight mode)
6. **Step 5:** Auto-resolve/create HITL issues

Steps 3, 4, 5 run in **parallel** via `Promise.all` (line 267), which is a smart optimization.

#### Triggers

```
AJE_POSTED       -> journal_entry_service.postJE (line 354)
AJE_REVERSED     -> (defined but wiring unclear)
RECON_COMPLETED  -> period_reconciliation_service
RECON_APPROVED   -> period_reconciliation_service
RECON_REJECTED   -> period_reconciliation_service
MAPPING_CHANGED  -> coa_mapping_service
TB_REINGESTED    -> TB ingest routes
VARIANCE_EXPLAINED -> via recon_completed
ISSUE_RESOLVED   -> (optional)
```

#### Recursion Guard

```typescript
// Line 39
const MAX_CASCADE_DEPTH = 3;

// Line 202-207
if (depth >= MAX_CASCADE_DEPTH) {
  console.warn(`Cascade depth limit reached...`);
  return emptyResult(0);
}
```

The depth is incremented when `runIssueCascade` is called (line 298: `depth + 1`). Issue auto-resolution can trigger further cascades, hence the guard.

**Can it infinite loop?** No -- `MAX_CASCADE_DEPTH = 3` hard-caps recursion. At depth 3, it returns an empty result immediately.

**Can it infinite recurse within a single depth level?** No -- each level only calls `runIssueCascade` once with `depth + 1`.

#### Performance Profile

Target: under 2000ms (line 40: `const MAX_CASCADE_MS = 2000`). Steps are instrumented with timing logs:

```typescript
// Lines 313-317
console.log(
  `[cascade] ${trigger.type} on ${trigger.period_id}: ${result.duration_ms}ms | ` +
    Object.entries(timings).map(([k, v]) => `${k}=${v}ms`).join(', ')
);
```

A warning is logged if the cascade exceeds 2000ms (line 319-324), but execution is **not aborted**. This means a slow cascade could block the HTTP response indefinitely.

**Worst case:** A TB-affecting trigger (AJE_POSTED) with many recons, many issues, and a large readiness check. Each step involves DB queries. With 100 reconciliation accounts, step 2 could involve 100+ queries. The `computeReadiness` in lightweight mode skips the O(n) `verifyChain` scan, which is critical for performance.

#### Partial Failure Handling

Step 2 has a try/catch (line 234): if no TB exists yet, recon refresh is silently skipped. Steps 3/4/5 run in `Promise.all` -- if any one fails, the entire cascade fails (rejected promise propagates). There is no partial-success handling.

**Risk:** If issue auto-resolution (step 5) throws an error, the successful results from steps 3 and 4 are lost, and the caller gets an error. However, since the cascade is called after the primary mutation has already committed, the financial data is safe -- only the downstream state update fails.

#### Grade: B+

Well-designed with proper depth guard, parallel execution, lightweight mode, and timing diagnostics. Missing: timeout abort, partial failure handling, and the warning-only approach to exceeding 2000ms.

---

### 5. STATE MACHINE

**File:** `src/services/close_session_service.ts` (894 lines)

#### Valid Transitions

Defined at line 45-51:

```typescript
const ALLOWED_TRANSITIONS: Record<CloseSessionStatus, CloseSessionStatus[]> = {
  open: ['in_progress'],
  in_progress: ['under_review'],
  under_review: ['in_progress'],       // rejection only
  certified: ['in_progress', 'locked'], // reopen or permanent lock
  locked: [],                           // terminal
};
```

Note: `under_review -> certified` is NOT in `ALLOWED_TRANSITIONS`. Certification bypasses the standard `updateStatus` path and goes through `certifyCloseSession` which directly calls `updateCertification` (line 461). This is intentional -- certification has its own validation gate.

**Full transition map:**
```
OPEN ──────────────────────> IN_PROGRESS
IN_PROGRESS ───(gated)────> UNDER_REVIEW
UNDER_REVIEW ──(reject)───> IN_PROGRESS
UNDER_REVIEW ──(certify)──> CERTIFIED    (via certifyCloseSession, not updateStatus)
CERTIFIED ─────(reopen)───> IN_PROGRESS  (requires approver role + reason >= 10 chars)
CERTIFIED ─────(lock)─────> LOCKED       (terminal, no undo)
LOCKED ────────────────────> (nothing)   (terminal state)
```

#### Invalid Transition Rejection

```typescript
// Line 211-216
const allowed = ALLOWED_TRANSITIONS[current.status];
if (!allowed?.includes(newStatus)) {
  throw new CloseSessionError(
    `Transition from ${current.status} to ${newStatus} is not allowed`,
    'INVALID_TRANSITION'
  );
}
```

#### Reopen Flow

Properly guarded at multiple levels:

1. **Role check** (line 687): `canPerform(actorRole, 'certify_close')` -- requires approver role
2. **AI boundary** (line 685): `assertNoAiMutationContext()` -- AI cannot reopen
3. **Status check** (line 652-656): locked sessions cannot be reopened
4. **Reason validation** (line 664-672): non-empty, minimum 10 characters
5. **Audit trail** (line 700-712): `close_session_reopened` event with full metadata
6. **Issue creation** (line 713-723): creates `period_reopened` info-level issue

#### Concurrent State Transition Prevention

The `certifyCloseSession` function uses `SELECT ... FOR UPDATE` (line 270-273) to serialize concurrent certify attempts:

```sql
SELECT id, status FROM close_sessions WHERE id = $1 AND tenant_id = $2 FOR UPDATE
```

The `advanceSession` function also uses `getCloseSessionByIdForUpdate` (line 842) inside a transaction.

**Gap:** The `lockCloseSession` function (line 729) does NOT use `FOR UPDATE`. It reads the session (line 731), checks `canLock`, then calls `updateCloseSessionStatus` inside a transaction. Two concurrent lock requests could both read `certified` status and both attempt to lock. This would succeed (both set status to `locked`) because there is no conflicting write, so the second UPDATE is a no-op (status already `locked`). This is benign but could double-log the audit event.

**Gap:** The `rejectSession` function (line 492) reads the session WITHOUT a lock (line 499), validates, then calls `updateStatus` inside a transaction. Two concurrent rejections could both read `under_review` and both attempt to transition to `in_progress`. The `updateStatus` call uses `getCloseSessionByIdForUpdate` internally (line 207), so the second one would wait for the first to commit, then see `in_progress` status, and throw `INVALID_TRANSITION` (since `in_progress -> in_progress` is not allowed). This is correct behavior.

#### Grade: A-

Excellent state machine design. All transitions are gated. Certification uses proper row-level locking. Reopen requires authority + reason + audit trail. The only gaps are the missing lock for `lockCloseSession` (benign) and the certification bypass of `ALLOWED_TRANSITIONS` (intentional but could be confusing to new developers).

---

### 6. ERROR HANDLING

#### Centralized Error Handler

`src/lib/errorHandler.ts` provides `send500()` which:
- Logs the full error (message + stack) server-side
- Returns a sanitized `{ error: 'Internal Server Error', code: 'INTERNAL', message: 'Unexpected error' }` to the client
- Never leaks stack traces, SQL, or file paths (line 1-4 comment)
- Includes requestId when available (line 29-33)

`src/lib/errorEnvelope.ts` provides `sendError()` for non-500 errors with structured `{ error, code, message, details, requestId }`.

#### Service Error Classes

Services define typed error classes with error codes:

```typescript
// close_session_service.ts, line 53-61
export class CloseSessionError extends Error {
  constructor(
    message: string,
    public readonly code: 'OVERLAP' | 'INVALID_TRANSITION' | 'NOT_FOUND' | ...
  ) { ... }
}

// journal_entry_service.ts, line 40-48
export class JournalEntryError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'VALIDATION' | 'INVALID_STATUS' | 'SEGREGATION' | 'SHADOW_AUDIT_BLOCK'
  ) { ... }
}
```

#### Async Error Catching

An `asyncHandler` wrapper exists (`src/lib/asyncHandler.ts`) that catches promise rejections and forwards to Express error middleware:

```typescript
export function asyncHandler(fn: AsyncRequestHandler) {
  return (req: Request, res: Response, next: NextFunction): void => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}
```

**However**, most routes use inline `try/catch` with `send500()` rather than the `asyncHandler` wrapper. This is acceptable (both patterns catch errors) but means each route handler must remember to wrap its body in try/catch.

**Gap:** The `close_sessions.ts` route file (1,180 lines) uses a mix of `try/catch` and checks for `CloseSessionError` to return appropriate status codes. Some error paths return detailed messages from the service error (which is fine since these are user-facing validation errors, not internal details).

#### Database Unavailability

The `/health/ready` endpoint (server.ts line 96-105) checks DB connectivity:
```typescript
try {
  await queryControl('SELECT 1');
  res.json({ status: 'ready' });
} catch {
  res.status(503).json({ status: 'not_ready', reason: 'database_unavailable' });
}
```

For regular API requests: if the DB is down, `getTenantPoolWithMigrations` will throw when trying to query `tenants` table. This error propagates through `attachTenantPool` middleware (line 82-83: `.catch(next)`) to Express error handling. The error handler would send a 500 with sanitized message.

**Gap:** No circuit breaker pattern. If PostgreSQL goes down, every request will attempt a connection, wait for timeout, then fail. Under load, this will exhaust the Node.js event loop.

#### AI API Timeout

AI calls go through `runJustifier` in `ai_orchestrator.js` (not audited -- outside scope). In `journal_entry_service.ts` line 322-345, the justifier result has an `ok` field -- if false, an `aiWarnings` array is returned to the caller but the JE posting still succeeds. AI failure is non-blocking for financial operations.

#### Grade: B

Sanitized 500 responses are excellent. Typed service errors with codes are well-designed. AI failures are correctly non-blocking. The gaps are: inconsistent error handling patterns across routes, missing circuit breaker for DB failures, and the dual validation middleware causing inconsistent 400 responses.

---

### TASK 1 SCORECARD

| Category | Grade | Rationale |
|----------|-------|-----------|
| **Service Design** | **B+** | Clean separation of concerns, stateless services, proper DI via pool-passing. gl_upload_service needs splitting. |
| **API Design** | **C+** | RESTful structure is good, but inconsistent error envelopes, dual validation middleware, no standard pagination, mixed response shapes. |
| **Database Layer** | **B+** | Proper repository pattern, parameterized queries, good transaction usage, batch inserts. Connection pool limits and missing indexes are concerns. |
| **Cascade Engine** | **B+** | Parallel execution, depth guard, lightweight mode, timing diagnostics. Missing timeout abort and partial failure handling. |
| **State Machine** | **A-** | All transitions gated, row-level locking for certification, reopen requires authority + audit trail. Minor gap in lock concurrency. |
| **Error Handling** | **B** | Sanitized 500s, typed error codes, non-blocking AI. Inconsistent patterns across routes, no circuit breaker. |

---

## TASK 2: SCALABILITY AND PERFORMANCE ASSESSMENT

---

### 1. CRITICAL PATH PERFORMANCE

#### GL Upload to TB Derivation

**Request path:** `POST /api/gl/ingest` -> `gl_upload_service.uploadGLForPeriod` -> `gl_to_tb_aggregation_service.buildDerivedTrialBalance` -> `trial_balance_store_service.saveUnadjustedFromGLDerived`

**DB queries:**
1. Parse CSV/XLSX in memory (CPU-bound, no DB)
2. Validate per-entry balance (CPU-bound)
3. `DELETE FROM general_ledger WHERE tenant_id AND period_label` (1 query)
4. Batch INSERT in chunks of 1000 (N/1000 queries for N lines)
5. `getGLForPeriod` -- SELECT all GL lines for aggregation (1 query)
6. `getAccountsByTenant` -- SELECT COA (1 query)
7. Aggregate in memory (O(n) single pass)
8. Save derived TB (1-2 queries)

**Total queries:** ~5 + ceil(N/1000) for N GL lines.

**For 10,000 GL lines:** ~15 queries. Acceptable.
**For 100,000 GL lines:** ~105 queries. The batch INSERT and the full `getGLForPeriod` SELECT are the bottleneck. The covering index (`idx_gl_tb_covering`) helps the aggregation query.

**N+1 assessment:** No N+1 patterns in this path. Batch inserts are correctly chunked.

**Memory concern:** The file is fully buffered in memory (`multer.memoryStorage()`, limit 50MB). A 100,000-line CSV at ~100 bytes/line is ~10MB -- acceptable. But XLSX files with formatting could be much larger.

#### Statement Generation

**Request path:** `POST /api/close/sessions/:id/statement-packages/generate` -> `statement_package_service.generateStatements`

**DB queries:**
1. Get session (1 query)
2. Get adjusted TB -- involves unadjusted TB + posted JE lines merge (3-5 queries)
3. Build statements (CPU-bound -- deterministic arithmetic)
4. Get prior period TB for cash flow (2-3 queries)
5. Build cash flow and equity statements (CPU-bound)
6. Cross-statement validation (CPU-bound)
7. Insert statement package (1 query)
8. Insert statement lines (N queries -- **line-by-line insert at line 437-449**)
9. Compute diff with previous version (2-3 queries)
10. Compute variances (2-5 queries)
11. Record audit event (1 query)

**Bottleneck:** Statement lines are inserted **one at a time** in a loop (line 437-449):
```typescript
for (const line of lines) {
  await repo.insertStatementLine(tx, { ... });
}
```

For a company with 200 accounts, this generates ~400-600 statement lines (BS + P&L + CF + Equity with headers and subtotals). That is 400-600 individual INSERT queries. This should be a batch insert.

**Complexity:** O(n) where n = number of accounts. No quadratic patterns.

#### Certification

**Request path:** `POST /api/close/sessions/:id/certify` -> `close_session_service.certifyCloseSession`

**Validations run (sequential):**
1. Row lock (SELECT FOR UPDATE) -- 1 query
2. Get session -- 1 query
3. Check stale statements -- already loaded
4. `computeReadiness` (full mode, NOT lightweight) -- 5-10 queries
5. `checkEvidencePolicyForCertification` -- 2-3 queries
6. `getTrialBalanceForCertification` -- 3-5 queries
7. `buildCertifiedStatementsFromSnapshot` -- CPU-bound
8. `runCrossStatementValidationForCertification` -- CPU-bound
9. Get GL lines (if hasGL) -- 1 query
10. `buildEvidenceManifest` -- 2-5 queries
11. `createSnapshotFromTrialBalanceAndEntries` -- 1-2 queries
12. `verifyChain` -- **full O(n) audit ledger scan**
13. `gatherAiMetadata` -- 1-3 queries
14. `buildCertificationArtifact` -- CPU-bound (Ed25519 signing)
15. Insert certification artifact -- 1 query
16. Update session to certified -- 1 query
17. Record audit event -- 1 query

**Total:** ~25-40 queries + O(n) chain verification.

The `verifyChain` (step 12) reads the ENTIRE audit ledger for the tenant and recomputes every hash. For a tenant with 10,000 audit entries, this is a significant operation. For 100,000 entries, it could take seconds.

#### Cascade Engine Worst Case

A `TB_REINGESTED` trigger on a period with:
- 50 reconciliation accounts (step 2: 1 query to get adjusted TB + 1 query to list recons + 50 UPDATE queries)
- An existing statement package (step 3: 2 queries)
- Full readiness check in lightweight mode (step 4: ~5 queries)
- 20 open issues (step 5: 1 query to list + 20 detection checks)

**Worst case:** ~80 queries, most parallelized in steps 3-5. Expected: 500-1500ms.

---

### 2. DATABASE PERFORMANCE

#### Most Expensive Queries

1. **`verifyChain`** (audit_ledger_repository.ts line 291-349): `SELECT * FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at ASC` -- reads entire tenant audit history, recomputes all hashes. O(n) rows, O(n) SHA-256 computations.

2. **Statement line inserts** (statement_package_service.ts lines 437-449): N individual INSERT statements inside a transaction. For 500 lines, this is 500 round-trips to PG.

3. **GL upload batch** (general_ledger_repository.ts lines 81-134): `DELETE + batch INSERT` for GL period. The DELETE is fast (indexed). The batch INSERT builds dynamic SQL with `$1...$17n` parameters. For 1000 lines, that is 17,000 parameters in one query. PG handles this but it is not ideal.

4. **`getPriorPeriodAdjustedTB`** (statement_package_service.ts lines 28-56): `listSessions` for all sessions of an entity, then `getAdjustedTrialBalance` for the prior period. The session list has no LIMIT.

5. **`listStatementPackagesByCloseSessionId`** in variance computation (line 462-466): queries all prior sessions for the entity, then gets packages for each, then gets lines. This is an N+1 pattern across prior sessions.

#### Audit Ledger Scalability

The audit ledger is append-only with ~10-30 events per close cycle per tenant. For a company closing monthly with 50 accounts:
- ~100-300 events per month per entity
- ~1,200-3,600 events per year per entity
- After 5 years: ~6,000-18,000 events

`verifyChain` must read ALL of these on every certification. At 18,000 events, this is ~18,000 rows with SHA-256 computation each.

**Recommendation:** Partition audit ledger by tenant. Add checkpoint hashes (verify only from last checkpoint). The chain enforcement trigger (migration 128) ensures integrity on INSERT, reducing the need for full-chain verification.

#### GENERATED ALWAYS Columns

The `period_reconciliations` table uses GENERATED columns for variance and unexplained variance (migration 132). These are recomputed on every UPDATE to the row. For reconciliation workflows with frequent item updates, this means the variance is recalculated on each `UPDATE`... but since it depends only on columns in the same row, the overhead is minimal (no subquery).

---

### 3. CONCURRENCY

#### Two Controllers Upload GL Simultaneously

`upsertGLForPeriod` (general_ledger_repository.ts line 61-144) uses `BEGIN` / `DELETE` / `INSERT` / `COMMIT` within a manually-managed transaction. Two concurrent uploads for the same period would both try to DELETE then INSERT. The second transaction would block on the DELETE until the first commits. Then the second DELETE would remove the first's data and insert its own. **Result: last writer wins.** No corruption, but the first upload is silently lost.

**Recommendation:** Add an application-level lock (advisory lock or `SELECT pg_advisory_xact_lock(hash(tenant_id, period_label))`) to serialize uploads per tenant+period.

#### JE Posted While Statements Being Generated

Statement generation and JE posting operate on different tables and do not lock each other. If a JE is posted mid-generation:
- The statement generator already fetched the adjusted TB (snapshot in memory)
- The JE post triggers a cascade that sets `statements_stale_since`
- The statement generator's transaction commits, clearing `statements_stale_since`
- **Result:** The generated statements do NOT include the newly posted JE, but `statements_stale_since` is cleared (incorrectly).

**This is a real bug.** The `clearStatementsStaleSince` in `generateStatements` (line 459) unconditionally clears the stale flag, even if a new mutation occurred after the TB was fetched but before the commit.

**Fix:** Use a conditional update: `UPDATE ... SET statements_stale_since = NULL WHERE statements_stale_since <= $generated_at`.

#### Two Reviewers Approve Same JE

`approveJE` (journal_entry_service.ts line 131-152) reads the JE, checks status, then updates. No row-level lock. Two concurrent approvals:
1. Both read status = 'proposed'
2. Both call `updateJournalEntryStatus`
3. Second UPDATE sets `approved_by` to the second reviewer (overwriting the first)
4. **Result:** Both get success, but only the second reviewer's approval is recorded.

**Recommendation:** Use `SELECT ... FOR UPDATE` before status check, or use optimistic concurrency (WHERE status = 'proposed' in the UPDATE).

---

### 4. MULTI-TENANT SCALABILITY

#### Tenant Isolation

**Row-level isolation** via `tenant_id` column on every query. Every repository function takes `tenantId` as the first filter parameter. No shared data between tenants.

**BYOD (Bring Your Own Database):** Tenants can have their own `database_url` (stored in `tenants.database_url`). The system supports schema-per-tenant (using `core`, `ai`, `audit` schemas with search_path) combined with row-level filtering within each schema.

**DB role separation** (when `AI_BOUNDARY_DB_ROLES=true`): AI writes go through a restricted `ai_writer` role that cannot write to `core.*` schema. This prevents AI from mutating financial data even if the application boundary is bypassed.

#### Connection Pool Strategy

Shared pool with LRU eviction:
```
Control pool:     max 20 connections (shared)
Tenant pool:      max 10 connections per tenant (LRU cache, max 50 pools)
AI pool:          max 5 connections per tenant (LRU cache, max 50 pools)
```

**Noisy neighbor risk:** All tenants on the control DB share the same PostgreSQL instance. A tenant running a large GL upload (DELETE + batch INSERT) holds a transaction lock that blocks other operations on that tenant's data. Other tenants are unaffected (different rows). However, all tenants share the same connection pool for the control DB, so a slow query from one tenant's control DB access could starve others.

For BYOD tenants: fully isolated connection pools and databases.

#### Tenant Capacity Estimate

With shared DB:
- 50 pool slots x 10 connections = 500 max connections
- PostgreSQL with `max_connections = 500` and PgBouncer: ~200 tenants
- Without PgBouncer: limited by LRU eviction -- max 50 active tenants before pool eviction starts thrashing

---

### 5. MEMORY AND RESOURCE USAGE

#### In-Memory Caches

1. **Tenant pool cache** (db/index.ts lines 19-24): Bounded by `MAX_TENANT_POOLS = 50`. LRU eviction. Pool objects hold open TCP connections but do not grow unbounded.

2. **Event emitter** (financial_event_emitter.ts line 101): `setMaxListeners(50)`. Fixed number of handlers registered once at startup. No leak risk.

3. **No computed data caches.** TB, statements, readiness are all recomputed on every request from DB. This is correct for a financial system (fresh data always) but means every request pays the full query cost.

#### File Upload Handling

```typescript
// src/routes/gl/ingest.ts, line 29-31
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50 MB
});
```

Files are **fully buffered in memory**. A 50MB CSV with 100k rows is fine for a single request, but concurrent uploads from multiple tenants could spike memory usage. 10 concurrent 50MB uploads = 500MB memory.

**Recommendation:** For production, switch to `multer.diskStorage()` or streaming parser for large files.

#### Large GL Handling

- **10,000 entries:** ~15 INSERT queries (batched at 1000), ~10MB memory. Fast (< 2s).
- **50,000 entries:** ~55 INSERT queries, ~50MB memory. Moderate (5-10s).
- **100,000 entries:** ~105 INSERT queries, ~100MB memory. Slow (10-20s). Could trigger Multer's 50MB limit if the CSV is verbose. `getGLForPeriod` returns all 100k lines in one query (high memory).

**Recommendation:** For 100k+ entries, implement streaming parsing and chunked INSERT with progress reporting.

#### Event Listener Leaks

The `registerEventHandlers` function (event_handlers.ts line 74-85) has an idempotency guard (`let registered = false`). The `unregisterEventHandlers` function properly removes all handlers. No leak risk.

---

### SCALABILITY PROFILE

| Metric | Estimate | Bottleneck |
|--------|----------|------------|
| **Max concurrent users** | ~100-200 per instance | Connection pool exhaustion (770 theoretical max connections) |
| **Max GL size (entries)** | ~50,000 per upload | Memory (multer.memoryStorage) and single-query fetch in getGLForPeriod |
| **Max tenants on single instance** | ~50 (shared DB), unlimited (BYOD) | LRU pool cache (MAX_TENANT_POOLS = 50) |
| **First bottleneck** | Connection pool / `verifyChain` | At ~100 concurrent requests or ~20k audit entries, chain verification dominates certification time |
| **Second bottleneck** | Statement line inserts | Individual INSERTs for 500+ statement lines in generateStatements |
| **Third bottleneck** | GL memory usage | 100k-entry GL upload with memoryStorage multer |

---

## TASK 3: ARCHITECTURE ROADMAP

---

### 1. IMMEDIATE FIXES

#### P0: Statements Stale Flag Race Condition

**File:** `src/services/statement_package_service.ts`, line 459
**Issue:** `clearStatementsStaleSince` unconditionally clears the stale flag, even if a mutation occurred after the TB snapshot was taken.
**Fix:** Change to conditional clear:
```sql
UPDATE close_sessions SET statements_stale_since = NULL
WHERE tenant_id = $1 AND id = $2
  AND (statements_stale_since IS NULL OR statements_stale_since <= $3)
```
Where `$3` is the timestamp when the adjusted TB was fetched (before statement generation started).

#### P0: JE Approval Race Condition

**File:** `src/services/journal_entry_service.ts`, lines 131-152
**Issue:** No row-level lock on `approveJE`. Concurrent approvals can overwrite each other.
**Fix:** Add optimistic concurrency:
```sql
UPDATE journal_entries SET status = 'approved', approved_by = $1
WHERE id = $2 AND tenant_id = $3 AND status = 'proposed'
```
Check `rowCount === 0` to detect concurrent modification.

#### P1: Statement Line Batch Insert

**File:** `src/services/statement_package_service.ts`, lines 437-449
**Issue:** Statement lines inserted one at a time in a loop (~500 INSERT queries per generation).
**Fix:** Build a batch INSERT similar to `upsertGLForPeriod`. Expected speedup: 10-50x.

#### P1: verifyChain Scalability

**File:** `src/db/repositories/audit_ledger_repository.ts`, lines 291-349
**Issue:** Full table scan recomputing all hashes. O(n) for every certification.
**Fix:** Implement checkpoint hashing. Store a `last_verified_hash` and `last_verified_id` per tenant. On verification, only check entries after the last checkpoint. Add index `audit_ledger(tenant_id, created_at)`.

#### P1: GL Upload Concurrency

**File:** `src/db/repositories/general_ledger_repository.ts`, lines 61-144
**Issue:** Two concurrent uploads for the same tenant+period silently lose the first upload.
**Fix:** Use PostgreSQL advisory lock: `SELECT pg_advisory_xact_lock(hashtext($1 || $2))` at the start of the transaction.

#### P2: Dual Validation Middleware

**Files:** `src/middleware/validateRequest.ts` and `src/middleware/validationMiddleware.ts`
**Issue:** Two files export identically-named functions (`validateBody`, `validateQuery`, `validateParams`) with different error response formats.
**Fix:** Delete `validateRequest.ts` and standardize on `validationMiddleware.ts` which has richer error responses. Update all imports.

#### P2: Error Response Standardization

**Files:** Multiple route files
**Issue:** Mix of `{ error, message }`, `{ error, code, message, details }`, and bare service results.
**Fix:** Create a `sendSuccess(res, data, status?)` helper alongside `sendError`. Use consistently in all routes. Add eslint rule to flag `res.json({ error: ... })` direct calls.

---

### 2. PRE-PRODUCTION REQUIREMENTS

#### Security Gaps

1. **Rate limiting on auth endpoints:** The auth router is mounted ABOVE the general API rate limiter (server.ts line 109, 112-118). Auth routes should have their own stricter rate limit (e.g., 10 login attempts per minute) to prevent credential stuffing. Currently, auth has no visible rate limit (need to check auth router internals).

2. **JWT secret rotation:** The system uses a single `JWT_SECRET` with no rotation mechanism. In production, JWT should use asymmetric keys (RS256) or have a secret rotation strategy.

3. **Tenant ID in JWT claims:** The `tenantId` comes from the JWT payload (auth/middleware.ts line 33). If a user has access to multiple tenants, there is no mechanism to switch tenants without re-authentication. This is fine for single-tenant users but needs review for admin/portfolio users.

4. **Advisory lock for audit_ledger:** The chain enforcement trigger (migration 128) prevents broken chains at the DB level, but concurrent audit_ledger inserts for the same tenant will cause one to fail with an exception (not a retry). Production needs a serialization mechanism (advisory lock per tenant for audit writes).

5. **SQL injection in dynamic query building:** `listByTenantAndPeriod` (audit_ledger_repository.ts lines 176-230) builds SQL with string concatenation for optional filters, but ALL values are parameterized (`$1`, `$2`, etc.). No injection risk, but the pattern is fragile.

#### Reliability Requirements

1. **Health check dependency:** The `/health/ready` endpoint only checks `SELECT 1`. It should also verify:
   - Schema migrations are current
   - Connection pool has available connections
   - Disk space for file uploads (if using diskStorage)

2. **Graceful shutdown:** No visible `SIGTERM` handler for draining in-flight requests and closing connection pools. The `closePool()` function exists but is not wired to process signals.

3. **Request timeout:** No global request timeout middleware. A slow `verifyChain` or statement generation could hold a connection indefinitely.

#### Monitoring and Observability

Required before production:

1. **Structured logging** is in place (`src/lib/logger.ts`) with JSON output, request_id correlation, and secret redaction. This is good.

2. **Missing metrics:**
   - Request latency percentiles (p50, p95, p99) by endpoint
   - Connection pool utilization (active/idle/waiting per tenant)
   - Cascade execution time distribution
   - Audit ledger entry count per tenant (for verifyChain scaling alerts)
   - Statement generation duration
   - GL upload size and duration

3. **Missing alerts:**
   - Cascade exceeding 2000ms (currently only console.warn)
   - Connection pool exhaustion
   - verifyChain finding a broken chain
   - Database query latency exceeding 500ms
   - Memory usage exceeding 80% of available

4. **Audit trail monitoring:**
   - verifyChain should be run as a background job (daily) for all tenants, not just at certification time
   - Alert if chain verification fails for any tenant (indicates tampering or bug)

---

### 3. SCALING STRATEGY

#### When to Go Multi-Instance

**Trigger:** When any of these is true:
- More than 100 concurrent users
- More than 50 active tenants (shared DB mode)
- Average request latency exceeds 500ms at p95
- Single-instance memory exceeds 2GB

**Required changes for multi-instance:**
1. **Session storage:** Not needed -- JWT-based auth is stateless.
2. **File uploads:** If using multer.memoryStorage, uploads are per-instance. No shared state needed since uploads are processed immediately and persisted to DB.
3. **Event handlers:** Currently in-process. With multiple instances, events emitted on one instance are not visible to others. This is acceptable since events trigger DB-backed jobs that any worker can pick up.
4. **Connection pools:** Each instance creates its own pools. With 3 instances x 50 tenants x 10 connections = 1,500 connections. **PgBouncer is mandatory for multi-instance.**

#### Database Scaling

1. **Read replicas:** Route all GET queries to read replica. The adjusted TB computation, statement package listing, and readiness checks are read-heavy and would benefit. Requires query-level routing (not trivial with current architecture -- all queries use the same pool).

2. **Partitioning:**
   - `general_ledger` by `tenant_id` (hash partition) or by `period_label` (range partition)
   - `audit_ledger` by `tenant_id` (hash partition) -- most critical for verifyChain performance
   - `statement_lines` by `package_id` (hash partition)

3. **Connection pooling:** Deploy PgBouncer in transaction mode. Reduce per-tenant pool `max` from 10 to 3-5, let PgBouncer handle multiplexing.

#### Background Job Processing

Currently, the cascade engine runs **synchronously** within the HTTP request. The following should move to background jobs:

1. **AI justification** after JE posting (journal_entry_service.ts lines 322-345): Already somewhat fire-and-forget, but still blocks the HTTP response.
2. **GL health analysis** after ingest (gl/ingest.ts line 157-161): Already fire-and-forget with `try/catch`.
3. **Variance computation** during statement generation (statement_package_service.ts lines 462-518): Could be deferred since variances are not needed immediately.
4. **verifyChain** during certification: Should be precomputed and cached, not run in the certification request path.

The `job_service.ts` and `job_worker.ts` infrastructure exists but is marked as "UNWIRED" (stale comment). The event handler system already enqueues jobs. **Recommendation:** Wire the job worker into the main server startup and use it for all background processing.

---

### 4. SERVICE DECOMPOSITION ANALYSIS

#### Should Any Services Become Microservices?

**Not yet.** The current monolith is appropriate for the scale (< 200 concurrent users, < 100 tenants). Premature decomposition would add operational complexity without proportional benefit.

**When to decompose:**

1. **AI/ML Service** (first candidate): Extract all AI classification, justification, and policy inference into a separate service. This would:
   - Allow independent scaling of AI workload (GPU/CPU intensive)
   - Enforce the AI boundary at the network level (AI service has no write access to core tables)
   - Enable independent deployment of AI model updates

2. **PDF/Export Service** (second candidate): Extract audit binder generation, PDF export, and Excel export. These are CPU-intensive and could benefit from dedicated workers.

3. **Notification Service** (third candidate): Currently in-process. Could be extracted for independent scaling and to support webhooks, email, Slack integrations.

#### Message Queue Benefits

A message queue (Redis Streams or RabbitMQ) would improve:

1. **Cascade reliability:** Instead of synchronous cascade, emit an event to the queue. A worker processes the cascade asynchronously. The HTTP response returns immediately with the primary mutation result. The cascade status can be polled or pushed via WebSocket.

2. **GL upload processing:** For large uploads, accept the file, enqueue processing, return a job ID. Client polls for completion.

3. **Cross-instance event propagation:** Currently, events emitted on one instance are not visible to others. A shared queue solves this.

#### Event-Driven vs. Synchronous Cascade

The current synchronous cascade has a significant advantage: the HTTP response includes the full cascade result (invalidated statements, updated readiness, resolved issues). This provides immediate feedback to the user.

**Recommendation:** Keep the cascade synchronous for now, but add a timeout (2s) and fall back to async processing if the cascade exceeds the timeout. Return partial results with a flag indicating that background processing is still running.

---

### 5. MONITORING AND OBSERVABILITY

#### What Should Be Logged

Already logged:
- Cascade timing per step (cascade_engine.ts lines 313-317)
- Critical route outcomes (logger.ts `logCriticalRoute`)
- Errors with request_id correlation

Should add:
- DB query duration (wrap pool.query with timing)
- Request duration per endpoint (middleware)
- GL upload size (rows, bytes)
- Statement generation line count and duration
- Certification step-by-step timing

#### Metrics to Track

| Metric | Type | Alert Threshold |
|--------|------|-----------------|
| `http_request_duration_ms` (p50, p95, p99) by endpoint | Histogram | p95 > 2000ms |
| `db_pool_active_connections` by tenant | Gauge | > 80% of max |
| `db_pool_waiting_count` by tenant | Gauge | > 0 for > 30s |
| `cascade_duration_ms` | Histogram | p95 > 2000ms |
| `audit_ledger_entries_total` by tenant | Counter | > 50,000 (plan for checkpoint) |
| `verify_chain_duration_ms` | Histogram | > 5000ms |
| `statement_generation_duration_ms` | Histogram | p95 > 10000ms |
| `gl_upload_rows` | Histogram | > 100,000 (trigger async processing) |
| `error_rate` by status code | Counter | 5xx rate > 1% |
| `jwt_token_expiry_failures` | Counter | Spike (indicates mass token expiry) |

#### Alerts

| Alert | Condition | Severity |
|-------|-----------|----------|
| Database unavailable | `/health/ready` returns 503 for > 30s | CRITICAL |
| Connection pool exhaustion | `db_pool_waiting_count > 5` for > 60s | HIGH |
| Cascade timeout | `cascade_duration_ms > 5000` | MEDIUM |
| Audit chain broken | `verifyChain.valid = false` for any tenant | CRITICAL |
| High error rate | `5xx_rate > 5%` over 5-minute window | HIGH |
| Memory pressure | Process RSS > 80% of available | HIGH |
| Certification failure rate | `certify_error_rate > 20%` over 1 hour | MEDIUM |
| Statement staleness | `statements_stale_since > 24h` for any session | LOW |

#### Audit Trail Monitoring

1. **Daily background job:** Run `verifyChain` for all active tenants (not just at certification). Store results in a monitoring table. Alert on any failure.

2. **Chain growth monitoring:** Track `audit_ledger` row count per tenant. When approaching the threshold where certification verifyChain exceeds 5s, alert to implement checkpoint optimization.

3. **Tampering detection:** Compare the latest `entry_hash` from the daily verification with a securely stored checkpoint. If they diverge, someone has modified or deleted entries.

4. **Cross-instance consistency:** If running multiple instances, ensure all audit_ledger writes go through the same serialization mechanism (the DB trigger handles this, but advisory locks would add an application-level guarantee).

---

## APPENDIX: FILE REFERENCE INDEX

### Core Architecture Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/db/index.ts` | 385 | Connection pool management, BYOD tenant pools, AI boundary pools |
| `src/db/transaction.ts` | 30 | Transaction helper (BEGIN/COMMIT/ROLLBACK) |
| `src/db/destructive_guards.ts` | 42 | Prevent destructive operations in staging/production |
| `src/auth/index.ts` | 50 | JWT sign/verify, bcrypt password hashing |
| `src/auth/middleware.ts` | 101 | Auth middleware, tenant pool attachment |
| `src/lib/errorHandler.ts` | 35 | Sanitized 500 error responses |
| `src/lib/errorEnvelope.ts` | 37 | Structured error envelope |
| `src/lib/ai_boundary.ts` | 78 | AsyncLocalStorage-based AI mutation prevention |
| `src/lib/session_write_guard.ts` | 36 | Block writes to certified/locked sessions |
| `src/lib/tenant_context.ts` | 23 | Extract tenantId/pool from request |
| `src/lib/asyncHandler.ts` | 22 | Async route handler wrapper |
| `src/lib/logger.ts` | 76 | Structured JSON logging with secret redaction |
| `src/middleware/requestId.ts` | 38 | Request ID correlation |
| `src/middleware/requireRole.ts` | 27 | RBAC middleware |
| `src/middleware/validateRequest.ts` | 83 | Zod validation (simpler format) |
| `src/middleware/validationMiddleware.ts` | 227 | Zod validation (richer format) |

### Critical Service Files

| File | Lines | Purpose |
|------|-------|---------|
| `src/services/cascade_engine.ts` | 329 | Downstream state propagation on financial mutations |
| `src/services/close_session_service.ts` | 894 | State machine: OPEN -> CERTIFIED -> LOCKED |
| `src/services/journal_entry_service.ts` | 690 | JE lifecycle: draft -> posted, reversals |
| `src/services/statement_package_service.ts` | 669 | Statement generation, versioning, variance computation |
| `src/services/gl_upload_service.ts` | 1,325 | GL CSV/XLSX parsing, validation, persistence |
| `src/services/gl_to_tb_aggregation_service.ts` | 213 | GL -> Trial Balance aggregation |
| `src/services/audit_ledger_service.ts` | 153 | Audit trail: overrides, observations, events |
| `src/services/period_reconciliation_service.ts` | 746 | Balance sheet account reconciliation |
| `src/services/issue_auto_resolution_service.ts` | ~100 | Cascade-triggered issue resolution |
| `src/events/financial_event_emitter.ts` | 150 | Typed event bus for financial anomalies |
| `src/events/event_handlers.ts` | 98 | Event-to-job queue bridge |

### Critical Repository Files

| File | Purpose |
|------|---------|
| `src/db/repositories/audit_ledger_repository.ts` | Hash-chained append-only audit ledger |
| `src/db/repositories/close_session_repository.ts` | Close session CRUD with FOR UPDATE locking |
| `src/db/repositories/general_ledger_repository.ts` | GL batch upsert with covering index |
| `src/db/repositories/statement_package_repository.ts` | Statement packages and lines |
| `src/db/repositories/journal_entry_repository.ts` | JE and lines with batch operations |

### Critical Migrations

| Migration | Purpose |
|-----------|---------|
| `091_append_only_triggers.sql` | DB triggers preventing audit_ledger UPDATE/DELETE |
| `097_gl_performance_indexes.sql` | Covering index for TB derivation |
| `098_close_session_state_machine.sql` | State machine status constraint |
| `105_je_immutability_trigger.sql` | Posted JE immutability at DB level |
| `128_audit_ledger_chain_enforcement.sql` | DB trigger enforcing hash chain on INSERT |
| `141_cascade_performance_indexes.sql` | Performance indexes for cascade hot paths |

---

*End of audit. This document should be reviewed with the engineering team and prioritized issues addressed before production deployment.*
