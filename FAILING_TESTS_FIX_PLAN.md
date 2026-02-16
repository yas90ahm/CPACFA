# Failing Tests Fix Plan — 7 Suites

**Generated:** February 2026  
**CI Command:** `cd tests && npm ci && npm test` (env: CI=true, DATABASE_URL, JWT_SECRET, NODE_ENV=test)

---

## Prerequisite: DB Connection

All tests share `setup.ts` which runs `verifySchema(pool)` when `DATABASE_URL` is set. If Postgres is unreachable or schema not migrated, **beforeAll fails with AggregateError** at `schema_verify.ts:40` (pool.query). Ensure:

- Postgres running (CI: `postgres:16-alpine`, `cpacfa:cpacfa@localhost:5432/cpacfa_test`)
- Migrations applied: `npm run db:migrate`

---

## Suite 1: `unit/deployment_config_guard.test.ts`

### Failing Assertions (when DB available)

All tests expect `wouldDeploymentConfigPass()` to return specific values, but:

- **"fails when REQUIRE_AUTH=false"** (MODE=prod): expects `{ pass: false, reason: 'MODE=prod requires REQUIRE_AUTH=true' }`, gets `{ pass: true }`
- **"fails when REQUIRE_TENANT_CONTEXT=false"** (MODE=prod): expects `{ pass: false, reason: 'MODE=prod requires REQUIRE_TENANT_CONTEXT=true' }` — but `applyModeDefaults()` **throws** when REQUIRE_TENANT_CONTEXT=false in prod, so the test may never reach the expect
- **"fails when MODE=demo and REQUIRE_AUTH=false"**, **"fails when MODE=demo and REQUIRE_TENANT_CONTEXT=false"**: same pattern

### Root Cause

**File:** `src/lib/deployment_config_guard.ts`  
**Function:** `wouldDeploymentConfigPass()`  
**Logic:** Calls `requireAuth()` → `getEffectiveConfig()` → `applyModeDefaults()`. In prod/demo, `applyModeDefaults()` **overwrites** `REQUIRE_AUTH` to true before the guard sees it. The guard therefore never observes the user’s invalid config.

### Proposed Fix

Check **raw env** before calling `getEffectiveConfig()` (which mutates env):

```ts
// src/lib/deployment_config_guard.ts — wouldDeploymentConfigPass()
export function wouldDeploymentConfigPass(): { pass: boolean; reason?: string } {
  const mode = getMode();
  if (mode === 'prod' || mode === 'staging' || mode === 'demo') {
    if (process.env.REQUIRE_AUTH === 'false') {
      return { pass: false, reason: `MODE=${mode} requires REQUIRE_AUTH=true` };
    }
    if (process.env.REQUIRE_TENANT_CONTEXT === 'false') {
      return { pass: false, reason: `MODE=${mode} requires REQUIRE_TENANT_CONTEXT=true` };
    }
    const cfg = getEffectiveConfig();
    if (!cfg.REQUIRE_TENANT_CONTEXT) {
      return { pass: false, reason: `MODE=${mode} requires REQUIRE_TENANT_CONTEXT=true` };
    }
  }
  return { pass: true };
}
```

**Invariant:** `applyModeDefaults()` still enforces at startup; this only affects the test helper.

---

## Suite 2: `unit/tenant_injection_policy.test.ts`

### Failing Assertion

- **"returns true when MODE=dev and env vars unset (lenient default)"**: expects `isBodyTenantInjectionAllowed()` === true, gets false.

### Root Cause

**File:** `src/lib/runtime_mode.ts`  
**Function:** `getDevDefaults()`  
**Line 137:** `REQUIRE_AUTH: process.env.REQUIRE_AUTH !== 'false'`  

When `REQUIRE_AUTH` is unset, `undefined !== 'false'` is true, so `REQUIRE_AUTH` defaults to **true**. In dev with env unset, we want a **lenient** default (body tenant injection allowed), i.e. both flags false.

### Proposed Fix

Use explicit-true semantics in dev so unset = lenient:

```ts
// src/lib/runtime_mode.ts — getDevDefaults()
function getDevDefaults(): ModeConfig {
  return {
    REQUIRE_AUTH: process.env.REQUIRE_AUTH === 'true',
    REQUIRE_TENANT_CONTEXT: process.env.REQUIRE_TENANT_CONTEXT === 'true',
    // ... rest unchanged
  };
}
```

**Invariant:** In dev, unset → both false → body tenant injection allowed. Explicit `REQUIRE_AUTH=true` still enforces auth.

---

## Suite 3: `unit/auth_bypass_production.test.ts`

### Expected Behavior

- Run with `TEST_AUTH_PRODUCTION=1 MODE=prod NODE_ENV=production` so setup does not override mode.
- `useRequireAuthForApi()` must return true when MODE=prod, even if REQUIRE_AUTH=false.
- Unauthenticated requests must return 401; `/api-dev/*` must return 404 in prod.

### Potential Failures

1. **Script mismatch:** Test docstring says `TEST_AUTH_PRODUCTION=1 NODE_ENV=production jest ...` but CI runs `npm test` without that. Normal run uses `MODE=dev` from setup → `isProduction` false → 401 tests skip; `useRequireAuthForApi` tests run with MODE=prod set inside each test.
2. **Import order:** `server.ts` calls `applyModeDefaults()` at import; if env is wrong at that moment, behavior can be wrong.
3. **DB/schema:** If beforeAll fails (schema verify), all tests fail before assertions.

### Proposed Fix

- **CI:** Run auth-bypass suite with explicit env: add script `"test:auth-production": "TEST_AUTH_PRODUCTION=1 MODE=prod NODE_ENV=production jest unit/auth_bypass_production.test.ts --runInBand"` and run it in CI.
- **Or:** Ensure `resetModeCache()` runs in `beforeEach` (not only `afterEach`) so each test starts with a clean config before calling `useRequireAuthForApi()`.
- **Verify:** No code changes needed if MODE=prod + resetModeCache gives correct behavior; the fix is to run the suite with `TEST_AUTH_PRODUCTION=1` in CI.

---

## Suite 4: `integration/export_certified_gate.test.ts`

### Likely Failures

- Certified export 403 vs 200: setup creates certified session + snapshot; if audit chain or export gate fails, export returns 403 instead of 200.
- `res.body?.code` mismatches (e.g. expecting `CLOSE_NOT_CERTIFIED` but getting another code).
- Evidence policy or materiality checks blocking export.

### Diagnosis Steps

1. Run suite with DB: `npm test -- integration/export_certified_gate.test.ts`
2. Inspect actual status codes and `res.body.code` on failures.
3. Check `export_gate_service.ts`, `routes/export.ts` for conditions that block certified export.

### Proposed Fix

Needs concrete failure output. If failures are due to missing audit ledger entries or period_export_checks, extend test setup to create a minimal valid chain and checks before asserting export.

---

## Suite 5: `integration/tenant_isolation.test.ts`

### Likely Failures

- beforeAll `expect([200, 201, 400]).toContain(resA.status)` — if `/api/close/sessions/ensure` returns 503 or 401, the test fails.
- Tenant B accessing Tenant A resource: expects 404; if auth/tenant context is off (MODE=dev), might get 200.
- `closeSessionIdA` / `closeSessionIdB` undefined when ensure fails.

### Diagnosis Steps

1. Confirm MODE=dev from setup does not relax tenant enforcement for the routes under test.
2. Confirm `attachTenantPool` and `requireTenantContext` apply tenant filtering even in dev.
3. Run with DB and capture exact status codes and response bodies.

### Proposed Fix

If tenant isolation is bypassed in dev: ensure close-session routes always filter by tenant from `x-tenant-id` or JWT, regardless of MODE. If setup fails: ensure tenants exist and ensure returns 200/201 before using `closeSessionIdA`/`closeSessionIdB`.

---

## Suite 6: `integration/close_sessions_advance.test.ts`

### Known Failure (from audit)

- **"A) draft session with valid data: advance locks it"** — advance returns `code: 'NOT_READY'` (422).

### Root Cause

**File:** `src/services/close_session_service.ts`  
**Condition:** `advanceSession` returns NOT_READY when checklist readiness or other blockers are not satisfied.

### Diagnosis

- Checklist may not be fully complete/skipped.
- Evidence policy may require evidence before lock.
- Triage or other readiness checks may block.

### Proposed Fix

1. Inspect `advanceSession` logic: what exact conditions produce `NOT_READY`?
2. Ensure test setup completes all required checklist items (or skips) before calling advance.
3. If evidence policy blocks: create minimal evidence or configure tenant to allow lock without evidence in tests.
4. Optionally increase timeout if setup is slow.

---

## Suite 7: `integration/session_centric_hardening.test.ts`

### Likely Failures

- B3 "Binder explicit legacy: allowLegacyCertifiedSource=1" — in MODE=dev, `effectiveAllowLegacyCertifiedSource` allows query param; if route or export logic changed, this may fail.
- B4 "Audit ledger: legacy call records LEGACY_CERTIFIED_SOURCE_USED" — assertion on audit ledger content.
- A) Certify without TB: expects 422 SESSION_DATA_MISSING — if error code or message changed, assertion fails.
- B) Export without snapshot: expects 422 NO_CERTIFIED_SOURCE.

### Proposed Fix

Run suite, capture failures, and adjust assertions or setup to match current behavior, **without** weakening prod invariants (legacy path remains disabled in prod/demo).

---

## Checklist of Code Changes (by Suite)

| # | Suite | File | Change | Invariant |
|---|-------|------|--------|-----------|
| 1 | deployment_config_guard | `src/lib/deployment_config_guard.ts` | In `wouldDeploymentConfigPass`, check `process.env.REQUIRE_AUTH === 'false'` and `process.env.REQUIRE_TENANT_CONTEXT === 'false'` before calling `getEffectiveConfig()` | Prod still enforces via `applyModeDefaults` |
| 2 | tenant_injection_policy | `src/lib/runtime_mode.ts` | In `getDevDefaults()`, set `REQUIRE_AUTH: process.env.REQUIRE_AUTH === 'true'`, `REQUIRE_TENANT_CONTEXT: process.env.REQUIRE_TENANT_CONTEXT === 'true'` | Explicit true still enforces; unset = lenient |
| 3 | auth_bypass_production | `package.json` or CI | Add/run `test:auth-production` with `TEST_AUTH_PRODUCTION=1 MODE=prod NODE_ENV=production` | No auth bypass in prod |
| 4 | export_certified_gate | TBD | Depends on actual failure; likely extend setup (audit chain, period_export_checks) | Export gate remains strict |
| 5 | tenant_isolation | TBD | Depends on actual failure; ensure tenant filtering in dev | No cross-tenant leakage |
| 6 | close_sessions_advance | Test setup or `close_session_service.ts` | Complete/skip checklist, satisfy evidence policy, or fix readiness logic | Advance contract unchanged |
| 7 | session_centric_hardening | TBD | Depends on actual failure | Legacy path disabled in prod |

---

## Recommended Order of Changes

1. **deployment_config_guard** — Pure logic fix, no test changes.
2. **tenant_injection_policy** — Pure logic fix, no test changes.
3. **auth_bypass_production** — CI/script or beforeEach tweak; no prod logic change.
4. **close_sessions_advance** — Fix setup or readiness so advance can succeed.
5. **export_certified_gate** — Fix after seeing failure output.
6. **tenant_isolation** — Fix after seeing failure output.
7. **session_centric_hardening** — Fix after seeing failure output.

---

## Verification

After applying fixes 1–3, run:

```bash
cd tests
CI=true DATABASE_URL=postgres://cpacfa:cpacfa@localhost:5432/cpacfa_test JWT_SECRET=test_secret_key_for_testing_only NODE_ENV=test npm test -- unit/deployment_config_guard.test.ts unit/tenant_injection_policy.test.ts
```

For auth bypass (fix 3):

```bash
TEST_AUTH_PRODUCTION=1 MODE=prod NODE_ENV=production DATABASE_URL=... npm test -- unit/auth_bypass_production.test.ts --runInBand
```
