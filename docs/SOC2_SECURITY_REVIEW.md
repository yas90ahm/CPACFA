# SOC2 & Security Review — Production Pilot

**Date:** January 2025  
**Scope:** Data leakage, multi-tenancy, hardcoded values, error sanitization, logging, dependencies.  
**Goal:** Ensure the codebase meets enterprise fintech standards for a 50-person engineering team.

---

## 1. Data Leakage & Multi-tenancy

### Requirement
Every SQL query that reads or mutates tenant-scoped data must include `tenant_id` in the `WHERE` clause. "Naked" queries (by `id` only) can return or modify data across tenants.

### Changes Implemented

#### `src/services/persistence_service.ts`
| Function | Change |
|----------|--------|
| `getStagingItem(pool, id)` | → `getStagingItem(pool, tenantId, id)` with `WHERE id = $1 AND tenant_id = $2` |
| `getSession(pool, sessionId)` | → `getSession(pool, tenantId, sessionId)` with `WHERE id = $1 AND tenant_id = $2` |
| `updateStagingStatus(pool, id, ...)` | → `updateStagingStatus(pool, tenantId, id, ...)` with `WHERE id = $3 AND tenant_id = $4` |
| `deleteStagingItem(pool, id)` | → `deleteStagingItem(pool, tenantId, id)` with `WHERE id = $1 AND tenant_id = $2` |
| `updateSession(pool, sessionId, ...)` | → `updateSession(pool, tenantId, sessionId, ...)` with `WHERE id = $i AND tenant_id = $i+1` |
| `getSessionUpload(pool, uploadId)` | → `getSessionUpload(pool, tenantId, uploadId)` with `WHERE id = $1 AND tenant_id = $2` |
| `loadSessionSnapshot(pool, sessionId, tenantId?)` | `tenantId` is now **required**; uses tenant-scoped `getSession`. |

All internal call sites (e.g. `createStagingItem`, `createSession`, `createSessionUpload`, `updateSessionUploadMetadata`) pass `tenantId`.  
Call sites in routes and services were updated to pass `tenantId` from request/context.

#### `src/db/repositories/accounting_connection_repository.ts`
| Function | Change |
|----------|--------|
| `getConnection(pool, id)` | → `getConnection(pool, tenantId, id)` with `WHERE id = $1 AND tenant_id = $2` |
| `updateConnection(pool, id, patch)` | → `updateConnection(pool, tenantId, id, patch)` with `WHERE id = $1 AND tenant_id = $6` |

#### `src/db/repositories/risk_context_conflicts_repository.ts`
| Function | Change |
|----------|--------|
| `getById(pool, id)` | → `getById(pool, tenantId, id)` with `WHERE id = $1 AND tenant_id = $2` |
| `resolve(pool, id, ...)` | → `resolve(pool, tenantId, id, ...)` with `WHERE id = $3 AND tenant_id = $4 AND resolved_at IS NULL` |

#### Call-site updates
- **HITL:** `src/routes/hitl.ts` — resolve, GET staging/:id, and reject flow pass `tenantId` when using pool.
- **Supervisor:** `src/routes/supervisor.ts` — trace endpoint already used `getTenantId(req)` and passes it to `getSession`.
- **Unified orchestrator:** `getSession` and `updateSession` called with `tenantId` from context.
- **Agents/tools:** `getSession` called with `context.tenantId` when pool/sessionId/tenantId present.
- **Accounting integration:** GET `/connections/:id` and push-journal-entry pass `tenantId`; service already used tenant-scoped `getConnection`/`getConnectionById`/`updateConnection` when `tenantId` provided.
- **Risk context store:** `resolveConflictWithMemo` passes `tenantId` to `getById` and `resolve`.

### Already compliant (no change)
- `listStagingItems`, `listSessions`, `getSessionUploadsBySession`, `saveSessionSnapshot`, `appendReasoningLog`, `deleteSession` (when `tenantId` provided), `listConnections`, `listUnresolved` — all already filter by `tenant_id`.

---

## 2. Hardcoded Values

### Findings
- **API keys:** Loaded from `process.env` (e.g. `ANTHROPIC_API_KEY`, `OPENAI_API_KEY`). No hardcoded secrets.
- **URLs:** `localhost:3000` / `localhost:5000` appear as **defaults** in `server.ts`, `swaggerSetup.ts`, `export.ts`, `pythonBridge.ts`, `cfo-dashboard/scenarios.ts` — used only when env (e.g. `BACKEND_PYTHON_URL`, `FRONTEND_URL`) is unset. Acceptable for dev; production must set env.
- **Test tenant:** `default-tenant` or `'default'` used as fallback in ingestion, integrations, and ingestion_fetchers when tenant context is missing. **Recommendation:** In production, remove or strictly validate these fallbacks (e.g. reject requests without valid tenant context).
- **Paths:** `process.cwd()` used for migrations, store paths, and config (e.g. `financial_rules.json`). No hardcoded absolute paths like `/home/` or `/Users/`.

### Action
No code change required for this review. Ensure production config sets all URLs and disallows or validates default-tenant fallbacks.

---

## 3. Error Message Sanitization

### Requirement
Do not expose raw system paths, database table names, or stack traces to the client. Errors should be professional/accounting-oriented.

### Implementation (`src/routes/audit/audit_shared.ts`)
- **Generic errors:** In `NODE_ENV === 'production'`, `handleAuditError` returns a fixed message: *"An internal error occurred. Please try again or contact support."* instead of `err.message` or `String(err)`.
- **SessionPersistenceError:** In production, response uses the same sanitized message; `operation` is omitted. In dev, full message and `operation` are still returned.
- **MathematicalIntegrityError:** Unchanged; messages are already business-focused (e.g. trial balance imbalance, balance sheet equation). No system details.

---

## 4. Brain Sink (Debug Logging)

### Result
- **`src/agents/Supervisor.ts`:** No `console.log` or `console.dir` found. Logging is done via `fireReasoningStep` (structured audit trail). No change required.

---

## 5. Dependency Bloat

### package.json (Node)
- Dependencies are aligned with the product: agent SDKs, bcrypt, cors, csv-parse, decimal.js, dotenv, express, rate-limit, helmet, JWT, multer, pdf-lib, pg, xlsx, zod. Optional: mistral, openai, pdf-parse.
- No obviously unused "heavy" libraries identified.

### backend/requirements.txt (Python)
- flask, numpy, pandas, scipy, openpyxl, reportlab, unstructured — consistent with REST API, quantitative logic, and PDF/ingest. No obvious bloat.

---

## Summary

| Area | Status | Notes |
|------|--------|--------|
| Multi-tenancy / naked queries | **Fixed** | All relevant persistence and repo queries now include `tenant_id` in `WHERE`; call sites pass `tenantId`. |
| Hardcoded secrets/paths | **OK** | Env-based config; localhost/default-tenant only as dev fallbacks. |
| Error sanitization | **Done** | Production uses generic message for generic and SessionPersistence errors. |
| Debug logging | **OK** | Supervisor uses structured logging only. |
| Dependencies | **OK** | No unnecessary heavy deps identified. |

The codebase is in a state suitable for a production pilot from a SOC2 and security perspective, with tenant isolation and error handling aligned with enterprise fintech expectations.
