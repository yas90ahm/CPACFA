# Sabit Backend Blind Audit

**Auditors:** Backend Architect (financial integrity) + Security Engineer (security posture)
**Date:** 2026-03-11
**Scope:** `src/` (TypeScript), `migrations/` (SQL), `package.json` — no frontend, no markdown files read
**Codebase:** ~250 TypeScript files, 150+ API endpoints, 121 services, Node.js/Express/PostgreSQL

---

## FINANCIAL INTEGRITY SCORECARD

| # | Claim | Rating | Evidence |
|---|-------|--------|----------|
| 1 | Every dollar computed by Decimal.js | **PARTIAL** | 48+ services use Decimal.js via `src/utils/decimal.ts`. But `cpa_decision_handler.ts` lines 100-146 uses `Number()` on financial params. `deterministic_pattern_detector.ts` uses native `Math.abs()`, `/`, `+`. All Decimal results convert back to JS `number` via `.toNumber()`. |
| 2 | Ed25519 digital signatures | **VERIFIED** | Real Ed25519 via Node.js `crypto.generateKeyPairSync('ed25519')` in `src/crypto/keygen.ts`. Signing in `src/lib/cert_signing.ts` lines 115-130. Startup self-test validates sign/verify cycle. Production requires env keys. No key rotation mechanism. |
| 3 | Hash-chained tamper-evident audit trail | **VERIFIED** | SHA-256 chain in `src/db/repositories/audit_ledger_repository.ts`. Each entry includes `previousEntryHash`. DB triggers prevent UPDATE/DELETE (migration 091). DB trigger enforces chain link on INSERT (migration 128). `verifyChain()` walks and recomputes entire chain. |
| 4 | AI never computes dollar amounts | **VERIFIED** | 5 enforcement layers: (1) AsyncLocalStorage AI boundary (`src/lib/ai_boundary.ts`), (2) `assertNoNumericAmountsInAgentOutput()` regex guard (`src/ai/guardrails/proposal_validator.ts`), (3) Number provenance validator (`src/lib/number_provenance_validator.ts`), (4) DB role separation for AI writer, (5) All pillars fail-open (never block financial workflow). |
| 5 | 11 certification gates | **VERIFIED** | All 11 gates in `src/services/session_readiness_gates_service.ts` lines 41-223. All `category: 'hard'`. Re-evaluated LIVE at certification time (not cached) — `close_session_service.ts` line 295 calls `computeReadiness()`. |
| 6 | Segregation of duties | **VERIFIED** | `src/services/segregation_service.ts` with role hierarchy. JE approval SoD in `journal_entry_service.ts` lines 142-147 (preparer ≠ approver). Production-hardened: `isSameUserApproveAllowed()` returns false in prod. Missing DB-level trigger for defense-in-depth. |
| 7 | Posted JEs are immutable | **VERIFIED** | DB triggers on `journal_entries` (migration 105) and `journal_entry_lines` (migration 106) prevent UPDATE/DELETE when status='posted'. Balance check trigger on posting (migration 131). Memo required (migration 107). |
| 8 | A=L+E verified at certification | **VERIFIED** | `src/services/cross_statement_validation.ts` lines 55-63 uses Decimal.js (`decimalFrom`). Checks A=L+E, net income tie, cash tie, equity tie. Called at certification time (`close_session_service.ts` lines 361-371). Blocks certification on failure. |
| 9 | DB-computed variance | **VERIFIED** | `GENERATED ALWAYS` columns in migrations 102 and 112: `variance`, `is_within_tolerance`, `unexplained_variance`, `change_amount`, `change_percentage`. All use NUMERIC(20,2) or DECIMAL(20,4). Computations correct. |
| 10 | 4-pillar AI orchestrator | **VERIFIED** | All 4 pillars in `src/ai/ai_orchestrator.ts`: Justifier (line 173), Shadow Auditor (line 252), Classifier (line 348), Advisor (line 435). Each has dedicated prompt + Zod schema. All fail gracefully. Output validation via `assertNoNumericAmountsInAgentOutput()`. |

**Summary: 9 VERIFIED, 1 PARTIAL. No claims VIOLATED or UNVERIFIED.**

---

## PHASE 1: FINANCIAL INTEGRITY — DETAILED FINDINGS

### Claim 1: Decimal.js (PARTIAL)

**What works:**
- Centralized utility at `src/utils/decimal.ts` (lines 1-93) with `from()`, `sumRound2()`, `minus()`, `plus()`, `mul()`, `div()`, `round2()`, `normalizeMoney()`
- 48+ services import from `../utils/decimal.ts` including all critical paths: `financialStatements.ts`, `cashFlow.ts`, `equityChanges.ts`, `journal_entry_service.ts`, `gl_to_tb_aggregation_service.ts`, `cross_statement_validation.ts`
- `financialStatements.ts` line 57-66: `netAmount()` uses `minus()` and `round2()`

**Violations found:**
| File | Line | Issue |
|------|------|-------|
| `cpa_decision_handler.ts` | 100-146 | `Number(params.amount)`, `Number(params.rate)`, `Number(params.cost)` — native JS on financial values |
| `deterministic_pattern_detector.ts` | 100-127 | `Math.abs()`, native `/`, native `+`, `toFixed()` on financial values (diagnostic path, not ledger-write) |
| `close_checklist_readiness_service.ts` | 229 | `totalAmount.toFixed(2)` — display-only |
| All decimal utility functions | — | Convert back to `number` via `.toNumber()` — safe for amounts under $9 quadrillion at 2 decimals |

### Claim 5: 11 Certification Gates (VERIFIED)

| # | Gate ID | Name | What It Checks |
|---|---------|------|----------------|
| 1 | `tb_balanced` | Trial Balance Balanced | Debits = Credits |
| 2 | `all_accounts_mapped` | All Accounts Mapped | Every TB account mapped to reporting line |
| 3 | `recons_complete` | Reconciliations Complete | All required accounts reconciled |
| 4 | `templates_resolved` | Recurring Entries Resolved | All AJE templates applied or skipped |
| 5 | `statements_current` | Statements Current | Statements generated and not stale |
| 6 | `variances_explained` | Material Variances Explained | All material P-o-P changes documented |
| 7 | `no_blocking_issues` | No Blocking Issues | All critical issues resolved |
| 8 | `evidence_policy` | Evidence Policy Met | Required evidence attached |
| 9 | `checklist_complete` | Close Checklist Complete | All required items done |
| 10 | `cash_rec_complete` | Cash Reconciliation Complete | Bank recon signed off |
| 11 | `material_jes_approved` | Material JEs Approved | No draft/proposed JEs remaining |

All re-evaluated live at certification time. Additionally, `runCrossStatementValidationForCertification()` runs 4 cross-statement checks (A=L+E, net income tie, cash tie, equity tie).

### Claim 4: AI Boundary (VERIFIED — 5 Layers)

| Layer | Mechanism | File | What It Prevents |
|-------|-----------|------|------------------|
| 1 | AsyncLocalStorage context | `src/lib/ai_boundary.ts` | `assertNoAiMutationContext()` throws if mutation called from AI execution chain |
| 2 | Regex guard | `src/ai/guardrails/proposal_validator.ts` | `assertNoNumericAmountsInAgentOutput()` scans for dollar amounts in AI text |
| 3 | Number provenance | `src/lib/number_provenance_validator.ts` | Every number in AI output must trace to investigation data |
| 4 | DB role separation | `src/db/index.ts` | `ai_writer` role can only INSERT/SELECT/UPDATE on `ai.*` schema, not `core.*` |
| 5 | Fail-open design | `src/ai/ai_orchestrator.ts` | All pillars return safe defaults on failure; AI crash never blocks close |

---

## PHASE 2: SECURITY AUDIT

### CRITICAL

#### S-1: Hardcoded Demo Credentials Printed to Console
**Files:** `src/server.ts` line 279-280, `src/scripts/seed_demo.ts` lines 22-24
**Finding:** `console.log('Login: demo@cloudmetrics.io / DemoPass2026!')` — credentials in source code and stdout. Console output captured by log aggregation (CloudWatch, Datadog). If demo mode accidentally enabled in prod, grants access.
**Remediation:** Load demo creds from env vars. Never print passwords to logs. Use randomly generated passwords displayed once during setup.

### HIGH

#### S-2: Open Registration Allows Self-Assigned Admin Role
**File:** `src/routes/auth.ts` lines 68-103
**Finding:** `/api/auth/register` is publicly accessible (rate-limited to 50/15min). Any unauthenticated user can create tenants and register with `admin` or `approver` role. `registerSchema` in `src/schemas/authSchemas.ts` line 31-39 allows `admin`.
**Remediation:** Disable open registration in production. Require invitation token or admin approval. Never allow self-assignment of privileged roles.

#### S-3: No Route-Level RBAC Middleware
**File:** All `src/routes/` files
**Finding:** No `requireRole()` middleware exists. Authorization is ad-hoc within handlers. Many routes have no role checks — any authenticated user can: create close sessions, generate statements, upload GL data, upload CoA. Service-layer checks exist for some operations (certification, JE approval) but not all.
**Remediation:** Create reusable `requireRole(...roles)` middleware. Apply to all sensitive operations.

#### S-4: Cross-Tenant Email Lookup in Wedge Login
**File:** `src/db/repositories/user_repository.ts` lines 30-36
**Finding:** `getUserByEmailOnly()` queries without `tenant_id`. Called from login when `tenantId` not provided. If same email exists in multiple tenants, returns first match (indeterminate). Attacker can attempt login without knowing tenant.
**Remediation:** Require `tenantId` on all login requests in production. Or enforce global email uniqueness.

#### S-5: Unauthenticated Tenant Creation
**File:** `src/routes/tenants.ts` lines 26-90
**Finding:** `POST /api/tenants` creates new tenants. While general `/api` middleware applies `requireAuth` in production, the route itself has no role check — any authenticated user can create tenants.
**Remediation:** Restrict tenant creation to admin users.

#### S-6: Login Rate Limit Too Generous
**File:** `src/routes/auth.ts` lines 31-37
**Finding:** 100 login attempts per 15 minutes per IP (~400/hour). Sufficient for targeted brute force. Comment says "generous for automated tests."
**Remediation:** Production: 5-10 attempts/15min. Add account lockout after 5 failures. Separate test configuration.

### MEDIUM

#### S-7: JWT Secret Guard Only Checks NODE_ENV, Not MODE
**File:** `src/auth/index.ts` lines 10-14
**Finding:** The app uses `MODE` as canonical trust mode (demo/staging/prod), but JWT secret check only guards `NODE_ENV=production`. Running `MODE=demo` without `NODE_ENV=production` silently uses dev secret.
**Remediation:** Extend guard to cover `MODE=demo` and `MODE=staging`.

#### S-8: No Token Revocation on User Deactivation
**File:** `src/auth/middleware.ts`, `src/routes/settings_team.ts` line 156
**Finding:** Deactivated users' JWTs remain valid for up to 24 hours. No token blacklist, no refresh token mechanism.
**Remediation:** Short-lived access tokens (15 min) + revocable refresh tokens. Or check `active` status in middleware.

#### S-9: Many Routes Lack Zod Body Validation
**Files:** `settings_team.ts` line 64, `tenants.ts` line 31, `portfolio.ts` line 191, `close_sessions.ts`
**Finding:** TypeScript `as` assertions provide zero runtime protection. Malicious payloads with unexpected fields pass through.
**Remediation:** Apply `validateBody()` middleware to all POST/PUT/PATCH handlers.

#### S-10: Unparameterized SQL in DB Reset Script
**File:** `src/db/reset_and_bootstrap.ts` lines 66-93
**Finding:** Table/type/function names interpolated directly in DROP statements. Protected by multiple guards (`isAllowedForDestructive`, `looksLikeProduction`, NODE_ENV checks). Low practical risk.
**Remediation:** Use `pg_catalog.quote_ident()`.

#### S-11: No Dependency Vulnerability Scanning
**Finding:** No `npm audit` in scripts, no Dependabot/Snyk configuration, no CI/CD security scanning.
**Remediation:** Add `npm audit --production` to build. Configure Dependabot.

#### S-12: No CORS_ORIGINS Warning in Deployment Modes
**File:** `src/server.ts` lines 74-81
**Finding:** Falls back to localhost origins when `CORS_ORIGINS` not set. No warning in demo/staging.
**Remediation:** Add startup warning.

### LOW

#### S-13: 24h JWT Expiration
**File:** `src/auth/index.ts` line 17
**Finding:** Long for a financial application. 1-4 hours is more appropriate.

#### S-14: Local Storage Path Traversal Defense Improvable
**File:** `src/storage/local_disk_storage.ts` lines 12-18
**Finding:** Sanitization strips leading `../` but could be stronger. Use `path.resolve()` + prefix check.

#### S-15: search_path via Template Literal
**File:** `src/db/index.ts` lines 52, 109, 139
**Finding:** Safe constant, but pattern could be copied incorrectly.

#### S-16: Redundant console.error Before send500
**Files:** `src/routes/coa.ts` line 81, `src/routes/gl/ingest.ts` line 178
**Finding:** `send500` already logs. Double-logging clutters output.

### POSITIVE FINDINGS

| Area | Assessment |
|------|-----------|
| **SQL Injection** | All repository queries use parameterized `$1, $2` placeholders consistently. No user-input-derived SQL found. |
| **Error Handling** | `src/lib/errorHandler.ts`: Fixed `STANDARD_500_BODY` returned to clients. Full error logged server-side. Stack traces never exposed. |
| **File Upload** | Size limits (2-50MB), MIME whitelist, extension validation, memory storage (no temp files). |
| **Rate Limiting** | Applied to login (100/15min), register (50/15min), general API (200/min). Standard headers enabled. |
| **Tenant Isolation** | JWT-derived `tenantId`, per-tenant DB pools (BYOD), `tenant_id` in all WHERE clauses, AI DB role separation. |
| **Cryptographic Security** | Ed25519 via Node.js crypto (no weak algorithms). SHA-256 hash chain. Startup key validation. |
| **Helmet** | Security headers middleware applied (`src/server.ts` line 73). |
| **Password Policy** | Uppercase + lowercase + digit + special char + 8+ chars enforced in Zod schema. |
| **CORS** | Configurable whitelist, defaults to localhost in dev, no `credentials: true`. |

---

## PHASE 3: DATABASE INTEGRITY

### Money Column Types

**All money columns use NUMERIC(20,2) or DECIMAL(20,4).** No FLOAT, DOUBLE, or REAL found.

Standardization migration: `migrations/121_money_column_precision.sql` covers: `journal_entry_lines.debit/credit`, `statement_lines.amount`, `recon_items.amount`, issue items, intercompany results, budget lines.

GL columns: `migrations/095_general_ledger.sql` — `debit NUMERIC(20,2)`, `credit NUMERIC(20,2)` with CHECK constraints.

### Immutability Triggers

| Table | Protection | Migration |
|-------|-----------|-----------|
| `journal_entries` (posted) | No UPDATE, No DELETE | 105 |
| `journal_entry_lines` (posted parent) | No UPDATE, No DELETE | 106 |
| `journal_entries` posting | Debits must equal credits | 131 |
| `journal_entries` memo | Non-null non-empty CHECK | 107 |
| `audit_ledger` | No UPDATE, No DELETE | 091 |
| `audit_ledger` chain | INSERT must chain correctly | 128 |
| `ledger_snapshots` | No UPDATE, No DELETE | 091 |
| `period_trial_balance` (certified) | No UPDATE, No DELETE | 091 |
| `certification_artifacts` | No UPDATE, No DELETE | 120 |

### Tenant Isolation

- `tenant_id TEXT NOT NULL` on all tables: `journal_entries` (migration 072), `general_ledger` (095), `close_sessions` (065), `audit_ledger` (051)
- All queries include `tenant_id` in WHERE clauses
- BYOD model: per-tenant connection pools capped at 50 with LRU eviction

### Indexes

Comprehensive indexing: 4 indexes on `general_ledger`, 4 on `journal_entries`, performance indexes in migrations 097 and 141.

---

## PHASE 4: PERFORMANCE RISKS

| Risk | Severity | Detail |
|------|----------|--------|
| **No connection pool timeouts** | MEDIUM | No `connectionTimeoutMillis`, `idleTimeoutMillis`, or `statement_timeout` configured in `src/db/index.ts`. Slow query holds connection indefinitely. |
| **Unbounded verifyChain() query** | LOW | `audit_ledger_repository.ts` line 299: `SELECT * FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at ASC` without LIMIT. Infrequent operation. |
| **N+1 in citation validation** | LOW | `proposal_validator.ts` lines 94-113: one KB query per citation in loop. Typically 1-5 items, advisory-only path. |
| **Cascade engine** | SAFE | `cascade_engine.ts` line 39: `MAX_CASCADE_DEPTH = 3`, `MAX_CASCADE_MS = 2000` timeout. |
| **Bounded list queries** | SAFE | `listAllForTenant()` caps at `Math.min(opts?.limit ?? 100, 500)`. |

---

## PHASE 5: TEST COVERAGE

### CRITICAL FINDING: Zero Test Files Exist

**No `.test.ts` or `.spec.ts` files found anywhere in `src/`.** The only test-adjacent files are:
- `scripts/test_gl_certification.ts` — integration test runner (not unit tests)
- `src/db/seed_test.ts` — test data seeding

### Critical Paths Missing Automated Tests

| Missing Test | Severity | Why It Matters |
|-------------|----------|----------------|
| Decimal.js arithmetic in `financialStatements.ts` | **CRITICAL** | A refactor could silently introduce floating-point bugs in statement generation |
| Hash chain append + verify in `audit_ledger_repository.ts` | **CRITICAL** | Chain integrity is the foundation of tamper-evidence |
| Ed25519 sign + verify cycle | **HIGH** | Certification signatures must remain valid across deployments |
| Segregation of duties enforcement | **HIGH** | SoD bypass would be an audit failure |
| Cross-statement validation (A=L+E) | **HIGH** | Mathematical proof claim depends on this |
| AI boundary guard (`assertNoAiMutationContext`) | **HIGH** | Core product claim that AI never writes to financial tables |
| `assertNoNumericAmountsInAgentOutput` regex | **MEDIUM** | Regex could miss edge cases (e.g., numbers in different formats) |
| Number provenance validator | **MEDIUM** | Could allow unverified numbers through |
| 11 readiness gates evaluation | **MEDIUM** | Gate logic bugs could allow premature certification |
| Cascade engine recursion guard | **MEDIUM** | Unguarded recursion could crash server |
| Negative tests (bad input, unauthorized access) | **HIGH** | No evidence of security testing |

**This is the single largest risk in the entire codebase.** Every integrity mechanism is well-designed but has zero automated regression testing. Any refactor could silently break guards.

---

## PRIORITY REMEDIATION PLAN

### Immediate (Before Any Public Deployment)

| # | Action | Severity | Effort |
|---|--------|----------|--------|
| 1 | **Remove hardcoded demo credentials** from source and console output | CRITICAL | S |
| 2 | **Restrict registration** — require invitation token, prevent self-assigned admin | HIGH | M |
| 3 | **Require tenantId on login** in production | HIGH | S |
| 4 | **Write unit tests** for: Decimal.js math, hash chain, Ed25519, SoD, A=L+E, AI boundary | CRITICAL | L |

### Before Production

| # | Action | Severity | Effort |
|---|--------|----------|--------|
| 5 | **Implement RBAC middleware** — `requireRole()` on all sensitive routes | HIGH | M |
| 6 | **Add token revocation** on user deactivation | MEDIUM | M |
| 7 | **Tighten login rate limits** to 10/15min + account lockout | HIGH | S |
| 8 | **Extend JWT_SECRET guard** to cover MODE=demo/staging | MEDIUM | XS |
| 9 | **Restrict tenant creation** to admin roles | HIGH | S |
| 10 | **Fix Decimal.js violations** in `cpa_decision_handler.ts` | HIGH | S |

### Next Sprint

| # | Action | Severity | Effort |
|---|--------|----------|--------|
| 11 | Add Zod validation to all route handlers | MEDIUM | M |
| 12 | Add `npm audit` + Dependabot to CI/CD | MEDIUM | S |
| 13 | Shorten JWT expiration to 1-4h + refresh tokens | LOW | M |
| 14 | Add DB-level SoD trigger (defense-in-depth) | MEDIUM | S |
| 15 | Configure connection pool timeouts | MEDIUM | S |
| 16 | Ed25519 key rotation mechanism | MEDIUM | M |

### Effort Key
- **XS:** < 30 min, 1 file
- **S:** 1-2 hours, 1-4 files
- **M:** 3-8 hours, 5-15 files
- **L:** 1-2 days, 15+ files

---

## OVERALL ASSESSMENT

**Financial Integrity: STRONG.** 9 of 10 claims verified by code. The architecture is well-designed with defense-in-depth (application guards + database triggers + AI boundary separation). The one partial claim (Decimal.js) affects only edge paths, not core financial computation.

**Security Posture: GOOD with GAPS.** Parameterized SQL, file upload controls, rate limiting, error sanitization, tenant isolation, and cryptographic signing are all well-implemented. The critical gaps are: hardcoded demo credentials, open registration with admin self-assignment, missing RBAC middleware, and cross-tenant email lookup.

**Test Coverage: ABSENT.** This is the single biggest risk. Every integrity mechanism is well-engineered but could be silently broken by a refactor. Adding regression tests for the 10 critical paths listed above should be the top priority.

**Database Integrity: EXCELLENT.** NUMERIC(20,2) for all money. GENERATED ALWAYS for computed fields. Immutability triggers on 6 tables. Hash chain enforcement at the database level. Tenant isolation in every query.
