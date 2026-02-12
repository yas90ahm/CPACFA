# Security Invariants

This document defines the security invariants enforced by the CPACFA platform. These invariants must hold for demo, staging, and production deployments.

## 1. AI Cannot Write Core Tables (DB-Enforced)

**Invariant:** AI is physically unable to write deterministic financial tables. The database enforces this via role separation.

- **Schema separation:** `core.*` (trial balance, close sessions, journal entries, snapshots, certification artifacts, export checks, evidence), `ai.*` (tenant_ai_proposals, ai_call_log, tenant_hitl_staging, etc.), `audit.*` (audit_ledger, audit_log).
- **Roles:** `ai_writer` has INSERT/SELECT/UPDATE on `ai.*` only; no privileges on `core.*`. `core_writer` has full DML on `core.*`.
- **Enforcement:** When `AI_BOUNDARY_DB_ROLES=true`, the app uses separate DB pools; AI request paths use `ai_writer` and cannot obtain a handle to write core tables.
- **Verification:** Migration 093; startup validation verifies grants in demo/staging/prod; regression test `ai_db_boundary.test.ts`.

## 2. Certify / Advance Transitions Are Transactional and Locked

**Invariant:** Close session status transitions (draft → locked, locked → certified) are serialized and atomic to prevent races.

- **Row-level lock:** `certifyCloseSession` and `advanceSession` use `SELECT ... FOR UPDATE` inside a transaction to acquire a row lock before updating.
- **Transaction wrapper:** `withTransaction` ensures all status updates and audit ledger writes commit or rollback atomically.
- **Concurrent certify:** A second concurrent certify attempt will block until the first commits; INVALID_TRANSITION propagates as 409.
- **Enforcement:** `close_session_service.ts` (certifyCloseSession, advanceSession, updateStatus).

## 3. Export Gating Requires Verification

**Invariant:** PDF/CSV export and audit binder require server-side verification before release. Zero-trust: materiality and chain state come from DB, not client.

- **Export gate:** `checkExportGate` reads `period_export_checks` (DB) for rounding materiality; verifies audit ledger hash chain; blocks on conflicts.
- **Truth Gate:** Integrity gate enforces debits = credits and balance sheet equation before certified export.
- **Audit binder:** Certified-only; requires `checkExportGate` and `getCertifiedStatementsForBinder`.
- **Enforcement:** `export_gate_service.ts`, `audit_binder.ts`, `export.ts`; no client-supplied flags bypass verification.

## 4. No Auth Bypass in Demo / Staging / Prod

**Invariant:** In MODE=demo, staging, or prod, authentication and tenant context are always enforced. Dangerous bypasses are disallowed.

- **authRequired:** Always true. `REQUIRE_AUTH=false` is ignored and overridden.
- **tenantContextRequired:** Always true. In-memory fallbacks are not allowed.
- **dangerousBypassAllowed:** Always false. Legacy certified source, imbalanced draft export, and dev API are disallowed.
- **tenantInjectionAllowed:** Always false. Body tenant injection is disabled.
- **Enforcement:** `security_profile.ts`, `deployment_config_guard.ts` (assertDeploymentConfigSafe at startup); CI green-gate tests.

## Green Gate (CI)

The CI pipeline includes a **green-gate** job that runs after tests:

- **Security profile invariants:** Asserts that for MODE=demo and MODE=prod, `getSecurityProfile` returns `authRequired=true`, `dangerousBypassAllowed=false`, `tenantInjectionAllowed=false`, `tenantContextRequired=true`.
- **Prestart:** `runStartupValidation` runs before `server.listen`; when `AI_BOUNDARY_DB_ROLES=true`, it verifies DB roles and that `ai_writer` cannot write to core tables.

Builds and Docker images are produced only after the green gate passes.
