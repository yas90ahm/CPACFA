# BLIND SECURITY REVIEW -- Sovereign CPA Engine

**Date**: 2026-03-13
**Reviewer**: Security Engineer (cold review, no prior context)
**Scope**: Full backend codebase (`src/`), frontend layout, configuration files
**Classification**: CONFIDENTIAL

---

## EXECUTIVE SUMMARY

**Overall Security Posture: MODERATE-HIGH with ONE CRITICAL FINDING**

The Sovereign CPA Engine demonstrates strong security architecture in most areas: parameterized SQL queries, a well-designed AI boundary system, Ed25519 cryptographic signing with production enforcement, Zod-based input validation, helmet/CORS/rate limiting, and sanitized error responses. The development team clearly thinks about security.

However, there is **one Critical P0 finding that requires immediate action**: the `.env` file is committed to the repository (or at minimum present on disk alongside source) containing **live Supabase database credentials and a live Anthropic API key**. This alone could allow full database compromise.

Beyond that, there are several Medium-severity architectural concerns around open registration, missing token revocation, and sparse RBAC enforcement across 150+ endpoints.

**Findings Summary:**
- **CRITICAL (P0)**: 1 -- Committed secrets (database password + API key in `.env`)
- **HIGH (P1)**: 3 -- Open registration, no token revocation, deactivated user tokens still valid
- **MEDIUM (P2)**: 5 -- Sparse RBAC, prompt injection surface, CORS fallback, invite without role check, registration rate limit too generous
- **LOW/INFORMATIONAL**: 4

---

## AREA 1: AUTHENTICATION

**Grade: CONCERN**

### What Works Well

1. **JWT algorithm pinned**: `HS256` is explicitly set in `signToken()` and verified with `algorithms: [JWT_ALGORITHM]` -- the `"alg": "none"` attack is blocked.
   - File: `src/auth/index.ts:20-21, 44`

2. **Token expiration enforced**: Default 4h, configurable via `JWT_EXPIRES_IN`.
   - File: `src/auth/index.ts:19`

3. **Production JWT_SECRET enforcement**: The module throws at import time if `JWT_SECRET` is the dev default in production/staging/demo modes.
   - File: `src/auth/index.ts:14-16`

4. **Password hashing**: bcryptjs with 10 salt rounds.
   - File: `src/auth/index.ts:9, 22-24`

5. **Password complexity**: Registration enforces uppercase, lowercase, digit, and special character with minimum 8 characters.
   - File: `src/schemas/authSchemas.ts:24-30`

6. **Login rate limiting**: 10 requests per 15 minutes per IP.
   - File: `src/routes/auth.ts:31-37`

### Vulnerabilities

**[AUTH-1] No Token Revocation / Logout Mechanism (HIGH)**

There is no logout endpoint, no token blacklist, and no token revocation mechanism anywhere in the codebase. A `grep` for "logout", "blacklist", "revoke.*token", and "invalidate.*token" returned zero results.

**Impact**: When a user is deactivated via `PUT /api/settings/team/:userId/deactivate`, their existing JWT remains valid until natural expiration (up to 4 hours). During this window, a deactivated user retains full access.

**Exploit Scenario**:
1. Admin deactivates a compromised or terminated employee account
2. The employee's token is still valid for up to 4 hours
3. Employee exfiltrates data or performs unauthorized actions during this window
4. No mechanism exists to force-expire the token

**Remediation**: Implement a token revocation check. On each request in `requireAuth`, query a lightweight cache (Redis or in-memory set) of revoked tokens or revoked user IDs. When a user is deactivated, add their userId to the revocation set.

**[AUTH-2] No Deactivation Check During Authentication (HIGH)**

The `requireAuth` middleware (`src/auth/middleware.ts:20-43`) verifies the JWT signature and expiration but does **not** check whether the user account is still active. The `UserRow` type in `src/db/repositories/user_repository.ts` does not even have an `is_active` field -- deactivation appears to be tracked in a separate `status` field in the team service, but this is never consulted during authentication.

**Impact**: A deactivated user with a valid token (or one who obtains a new token through some vector) can continue to access all endpoints.

**[AUTH-3] Cross-Tenant Email Lookup in Dev/Demo Login (MEDIUM)**

In `src/routes/auth.ts:50-52`, when `tenantId` is not provided in the login request, `getUserByEmailOnly(email)` is called, which queries `SELECT ... FROM users WHERE email = $1 LIMIT 1` with no tenant filter. While tenantId is required in prod/staging, this is allowed in dev and demo modes.

**Impact**: In demo mode (which enforces auth), an attacker could log in as a user in a different tenant if email addresses collide across tenants. The `LIMIT 1` means the first match wins, which may be the wrong tenant's user.

---

## AREA 2: AUTHORIZATION

**Grade: CONCERN**

### What Works Well

1. **Tenant isolation from JWT**: `tenantId` is derived from the JWT payload (`src/auth/middleware.ts:33`), not from request parameters. Routes use `getTenantId(req)` which reads from the authenticated request.
   - File: `src/lib/tenant_context.ts:10-12`

2. **Tenant database isolation**: Each tenant gets its own database pool via `getTenantPoolWithMigrations(tenantId)`. All data queries go through the tenant pool.
   - File: `src/auth/middleware.ts:68-84`

3. **Tenant self-access enforcement on tenant settings**: `PATCH /api/tenants/:id` and `GET /api/tenants/:id` verify `tenantId === targetId`.
   - File: `src/routes/tenants.ts:101-103, 152-154`

4. **Portfolio access control**: Portfolio routes check for `operating_partner` or `admin` role, and verify entity-level access via `portfolio_access` table.
   - File: `src/routes/portfolio.ts:18-25, 131`

5. **Admin-only team management**: Role changes, deactivation, reactivation require `admin` role.
   - File: `src/routes/settings_team.ts:111, 157, 196, 228`

### Vulnerabilities

**[AUTHZ-1] Open Self-Registration Creates Unauthorized Access (HIGH)**

`POST /api/auth/register` (`src/routes/auth.ts:73-108`) is a public endpoint (no auth required) that allows anyone to:
- Create a new tenant (if no `tenantId` provided)
- Join an **existing** tenant by providing its `tenantId` (line 81-85 -- only checks if tenant exists, not whether registration is allowed)

The role is restricted to `['accountant', 'preparer', 'reviewer']` via Zod schema, but an attacker who discovers or guesses a valid `tenantId` can self-register into that tenant with `reviewer` access.

**Exploit Scenario**:
1. Attacker observes a valid `tenantId` (e.g., from a shared link, error message, or API response)
2. Attacker calls `POST /api/auth/register` with `{ tenantId: "target-tenant-id", email: "attacker@evil.com", password: "Str0ng!Pass", role: "reviewer" }`
3. Attacker receives a valid JWT for the target tenant
4. Attacker can now read all financial data for that tenant

**Remediation**: Registration into an existing tenant should require either an admin invitation token or an authenticated admin to approve. The `register` endpoint should only create new tenants, not join existing ones.

**[AUTHZ-2] Sparse RBAC Enforcement -- Most Routes Lack Role Checks (MEDIUM)**

A search for `requireRole` across all route files found it used in only **7 locations** across 2 files (`settings_team.ts` and `tenants.ts`). The remaining 40+ route files and 150+ endpoints do not use `requireRole` at all.

This means any authenticated user (accountant, preparer, reviewer) can access endpoints like:
- `POST /api/close/sessions` -- create close sessions
- `POST /api/close/sessions/:id/certify` -- certify financial statements
- `PUT /api/settings/general` -- modify entity settings
- `POST /api/close/journal-entries` -- create journal entries
- `POST /api/portfolio/access/grant` -- grant portfolio access (has inline admin check, but inconsistent pattern)

Some routes have inline role checks (e.g., `close_sessions.ts` uses `getCloseRoleFromReq` for segregation), but enforcement is inconsistent and relies on individual route handlers rather than middleware.

**[AUTHZ-3] Team Invite Lacks Full Role Restriction (MEDIUM)**

`POST /api/settings/team/invite` (`src/routes/settings_team.ts:52-108`) checks `canInvite(authReq.role)` but accepts any `role` value from the request body without validating it against `VALID_ROLES`. If `canInvite` allows certifiers to invite, a certifier could potentially invite a user with `admin` role (depending on `canInvite` implementation).

---

## AREA 3: INPUT VALIDATION

**Grade: SECURE**

### What Works Well

1. **Zod-based validation framework**: A comprehensive validation middleware (`src/middleware/validationMiddleware.ts`) supports body, query, and params validation with structured error responses.

2. **Auth route validation**: Both login and register use Zod schemas via `validateBody()`.
   - File: `src/routes/auth.ts:39, 73`

3. **SQL injection protection**: All database queries across the codebase use parameterized queries (`$1`, `$2`, etc.) with argument arrays. Dynamic SQL is built using parameterized indices (`$${i++}`), not string concatenation of user values.
   - Files: All repositories in `src/db/repositories/`

4. **File upload controls**: Multer with MIME whitelist, extension validation, and 20MB size limit.
   - File: `src/routes/close/close_journal_entries.ts:44-71`

5. **Path traversal protection**: Local disk storage sanitizes keys and rejects `..` sequences.
   - File: `src/storage/local_disk_storage.ts:12-18`

6. **JSON body size limit**: `express.json({ limit: '1mb' })`.
   - File: `src/server.ts:84`

### Minor Concerns

**[INPUT-1] Many POST/PUT Routes Skip Body Validation (LOW)**

While the validation framework exists, many route handlers cast `req.body` with TypeScript `as` assertions rather than using `validateBody()`. For example:
- `src/routes/settings.ts:64` -- `req.body as { entityName?: string; ... }`
- `src/routes/portfolio.ts:208` -- `req.body as { userId?: string; tenantId?: string }`
- `src/routes/settings_team.ts:65` -- `req.body as { email?: string; name?: string; role?: string }`

TypeScript type assertions provide zero runtime validation. Unexpected fields pass through silently.

**[INPUT-2] `dangerouslySetInnerHTML` in Frontend Layout (INFORMATIONAL)**

`frontend/app/layout.tsx:45-47` uses `dangerouslySetInnerHTML` for a theme detection script. The content is a static hardcoded string (not user input), so this is not exploitable. However, it should be documented to prevent future developers from adding user-controlled content to that pattern.

---

## AREA 4: AI BOUNDARY

**Grade: SECURE**

This is the strongest security area in the codebase. The AI boundary system is well-designed and defense-in-depth.

### What Works Well

1. **AsyncLocalStorage-based boundary**: Each HTTP request gets its own advisory context via `runInBoundaryScope()`, preventing cross-request interference.
   - File: `src/lib/ai_boundary.ts:69-71`

2. **Mutation assertion**: `assertNoAiMutationContext()` throws if called from within AI advisory context. This is enforced in ALL environments.
   - File: `src/lib/ai_boundary.ts:55-62`

3. **Enter/exit pairing**: `enterAdvisoryContext()` / `exitAdvisoryContext()` with try/finally in the LLM provider ensures the depth counter is always decremented.
   - File: `src/llm/provider.ts:66-103, 154-222`

4. **Numeric guardrail**: `assertNoNumericAmountsInAgentOutput` detects dollar amounts, large numbers, spelled-out currency, foreign currency symbols, and accounting-format amounts in AI output.
   - File: `src/ai/guardrails/proposal_validator.ts:50-108`

5. **AI-scoped database role**: When `AI_BOUNDARY_DB_ROLES=true`, AI code gets a restricted database pool (`ai_writer`) that cannot write to deterministic financial tables.
   - File: `src/auth/middleware.ts:74-76`

6. **SecurityProfile invariant**: `aiCoreWritesAllowed` is hardcoded to `false` with no override mechanism.
   - File: `src/security/security_profile.ts:59`

### Minor Concerns

**[AI-1] User Input Reaches LLM Prompts Without Sanitization (MEDIUM)**

In `src/services/justification_service.ts:122`, user input from `question` is directly interpolated into the LLM prompt:

```
const prompt = `...User question / facts: ${question.slice(0, 500)}\n\n...`;
```

Similarly in `src/routes/audit/audit_auditor.ts:42`:
```
const scopedQuestion = `Internal controls: ${question}`;
```

While the AI boundary prevents AI from writing to financial tables, a prompt injection could cause the AI to produce misleading IRAC justifications that, once approved by a human, could support incorrect accounting treatments.

**Remediation**: Add prompt injection detection (e.g., reject inputs containing "ignore previous instructions", system prompt fragments, or XML/markdown injection patterns). Consider adding a disclaimer to AI-generated justifications.

---

## AREA 5: SECRETS

**Grade: VULNERABLE**

### CRITICAL FINDING

**[SECRETS-1] Live Database Credentials and API Key in `.env` File (CRITICAL / P0)**

The file `C:\Users\yasir\CPACFA\.env` contains:

```
DATABASE_URL=postgresql://postgres:trMuY5TLhdI6hbeb@db.mfognnfycoqoyzwykjab.supabase.co:5432/postgres
ANTHROPIC_API_KEY=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
```

While `.env` is listed in `.gitignore`, the file is present on disk and accessible to anyone with access to the development machine or any backup of this directory. If this `.env` file was **ever** committed to git history (even if later removed), the credentials are permanently exposed.

**Impact**:
- **Database**: The Supabase connection string includes the password `trMuY5TLhdI6hbeb`. An attacker with this string can connect directly to the production database, bypassing all application-level access controls. They can read all tenant data, modify financial records, and delete audit trails.
- **Anthropic API Key**: The `sk-ant-api03-...` key allows unlimited API calls billed to the account owner.
- **JWT Secret**: `JWT_SECRET=dev-secret-key-change-in-prod` -- while this is a dev value and production enforcement exists, if anyone runs with this secret, all JWTs can be forged.

**Exploit Scenario**:
1. Attacker obtains `.env` file (git history, backup, shared machine, CI artifacts)
2. Attacker connects to `db.mfognnfycoqoyzwykjab.supabase.co` with the leaked credentials
3. Attacker runs `SELECT * FROM users` to get all user records
4. Attacker runs `SELECT * FROM tenants` to get all tenant data including BYOD database URLs
5. Attacker has full read/write access to all financial data across all tenants

**Immediate Remediation**:
1. **Rotate the Supabase database password IMMEDIATELY**
2. **Rotate the Anthropic API key IMMEDIATELY**
3. Run `git log --all --diff-filter=A -- .env` to check if `.env` was ever committed
4. If it was committed, consider the credentials permanently compromised and rotate everything
5. Use a secrets manager (AWS Secrets Manager, Vault, Supabase vault) rather than `.env` files

### Other Secrets Concerns

**[SECRETS-2] Keygen Script Prints Private Key to Console (LOW)**

`src/crypto/keygen.ts:58` prints the Ed25519 private key in hex to stdout:
```
console.log('privateKey (hex):', hex.privateKey);
```

This is a CLI utility, but if run in a CI/CD pipeline, the private key would appear in build logs.

**[SECRETS-3] JWT Dev Secret is Predictable (INFORMATIONAL)**

The dev secret `'dev-secret-change-in-production'` in `src/auth/index.ts:10` is hardcoded. Production enforcement exists (line 14-16), so this is acceptable for development, but the value should not be guessable.

---

## AREA 6: CRYPTOGRAPHIC INTEGRITY

**Grade: SECURE**

### What Works Well

1. **Ed25519 signing**: Uses Node.js native `crypto` module with `ed25519` algorithm -- no custom crypto, no deprecated RSA-PKCS1.
   - File: `src/lib/cert_signing.ts:13, 123`

2. **Production key enforcement**: Module throws at startup if keys are missing in production, staging, or demo modes.
   - File: `src/lib/cert_signing.ts:77-83, 96-105`

3. **Startup key validation**: `validateSigningKeysProduceValidSignature()` runs a sign/verify cycle to detect corrupted keys.
   - File: `src/lib/cert_signing.ts:136-147`

4. **SHA-256 hash chain**: Audit ledger entries are hash-chained. Each entry's hash includes the previous entry's hash.
   - File: `src/db/repositories/audit_ledger_repository.ts:55-82`

5. **Canonical hashing (v2)**: Hash computation uses sorted keys and normalized values to prevent JSON serialization order from breaking the chain.
   - File: `src/db/repositories/audit_ledger_repository.ts:30-41, 70-82`

6. **Chain verification**: `verifyChain()` exists to validate the entire audit chain integrity.
   - File: `src/db/repositories/audit_ledger_repository.ts` (referenced in `src/routes/verification/certification.ts:105`)

### Minor Concerns

**[CRYPTO-1] Auto-Generated Keys in Dev Are Ephemeral (INFORMATIONAL)**

In dev mode, Ed25519 keys are auto-generated in memory. Restarting the server generates new keys, invalidating any previously signed certifications. This is documented and acceptable for development.

---

## AREA 7: DATA EXPOSURE

**Grade: SECURE**

### What Works Well

1. **Sanitized error responses**: The `send500` function (`src/lib/errorHandler.ts:24-34`) never sends `err.message`, stack traces, SQL details, or file paths to the client. It always returns the fixed `STANDARD_500_BODY`.

2. **No password hashes in API responses**: Login returns `{ token, userId, tenantId, role, email, name }` -- no password hash.
   - File: `src/routes/auth.ts:66`

3. **Database URL not exposed**: `GET /api/tenants/:id` returns `databaseUrlConfigured: boolean` instead of the actual URL.
   - File: `src/routes/tenants.ts:135-139, 162-166`

4. **Helmet.js**: Security headers are applied globally.
   - File: `src/server.ts:74`

5. **Request ID correlation**: Errors include a `requestId` for log correlation without exposing internals.
   - File: `src/lib/errorHandler.ts:29-33`

### Minor Concerns

**[DATA-1] Role Name Disclosed in 403 Responses (LOW)**

The `requireRole` middleware (`src/middleware/requireRole.ts:18-19`) includes the user's actual role in the 403 error message: `Role '${userRole}' is not authorized`. This leaks the user's role to the client, which could aid privilege escalation attempts.

**Remediation**: Return a generic "Forbidden" message without disclosing the user's current role.

---

## AREA 8: RATE LIMITING

**Grade: CONCERN**

### What Works Well

1. **Global API rate limit**: 200 requests/min per IP on all `/api` routes.
   - File: `src/server.ts:113-119`

2. **Login rate limit**: 10 requests/15 min per IP.
   - File: `src/routes/auth.ts:31-37`

3. **Registration rate limit**: 50 requests/15 min per IP.
   - File: `src/routes/auth.ts:22-28`

4. **Standard headers**: Rate limit headers are sent to clients.

5. **Trust proxy configuration**: Configurable via `TRUST_PROXY` env var.
   - File: `src/server.ts:72`

### Concerns

**[RATE-1] Registration Rate Limit Too Generous (MEDIUM)**

50 registrations per 15 minutes per IP is very generous. Combined with [AUTHZ-1] (open registration into existing tenants), an attacker could create 50 unauthorized accounts across multiple tenants in 15 minutes.

**[RATE-2] No Per-User Rate Limiting (LOW)**

Rate limits are IP-based only. A distributed attacker (botnet, cloud IPs) can bypass IP-based limits. Consider adding per-user/per-token rate limiting for authenticated endpoints.

**[RATE-3] CORS Fallback Allows localhost Origins (INFORMATIONAL)**

When no `CORS_ORIGINS` env is set, the server allows `localhost:3000`, `localhost:3002`, `127.0.0.1:3000`, `127.0.0.1:3002`. This is fine for dev but should be validated that `CORS_ORIGINS` is always set in production deployments.
- File: `src/server.ts:75-81`

---

## PRIORITIZED REMEDIATION PLAN

### P0 -- Fix Immediately (Today)

| # | Finding | Action |
|---|---------|--------|
| 1 | [SECRETS-1] Live credentials in `.env` | **Rotate Supabase password and Anthropic API key NOW**. Check git history for prior commits of `.env`. |

### P1 -- Fix This Sprint

| # | Finding | Action |
|---|---------|--------|
| 2 | [AUTHZ-1] Open registration into existing tenants | Require an invitation token or admin approval to join an existing tenant. Registration should only create new tenants. |
| 3 | [AUTH-1] No token revocation | Add a lightweight token/user revocation check in `requireAuth`. Use Redis or an in-memory set with TTL matching JWT expiration. |
| 4 | [AUTH-2] No deactivation check at auth time | After JWT verification in `requireAuth`, query the user's active status. Cache this for the token's remaining lifetime. |
| 5 | [RATE-1] Registration rate limit too generous | Reduce to 5/15min. Add CAPTCHA or email verification for registration. |

### P2 -- Fix Next Sprint

| # | Finding | Action |
|---|---------|--------|
| 6 | [AUTHZ-2] Sparse RBAC enforcement | Audit all 150+ endpoints and add `requireRole()` middleware where appropriate. Create a role-to-endpoint matrix document. |
| 7 | [AI-1] Prompt injection surface | Add input sanitization for LLM prompts. Reject known injection patterns. Add "AI-generated" disclaimers. |
| 8 | [AUTHZ-3] Invite role validation | Validate the `role` parameter in team invite against an allowed list for the inviter's role level. |
| 9 | [INPUT-1] Missing runtime body validation | Add `validateBody()` middleware to all POST/PUT routes that currently use TypeScript `as` casts. |
| 10 | [DATA-1] Role disclosure in 403 | Change error message to generic "Forbidden" without revealing the user's role. |
| 11 | [AUTH-3] Cross-tenant email lookup in dev/demo | Either require tenantId in demo mode or add a warning when email collisions exist. |

---

## WHAT THE CODEBASE DOES WELL

This codebase has clearly been built with security awareness. The following deserve recognition:

1. **AI Boundary System**: The `AsyncLocalStorage`-based advisory context with mutation assertions is a novel and effective pattern. The fact that `aiCoreWritesAllowed` is hardcoded to `false` with no override, and the AI gets its own restricted database pool, shows genuine defense-in-depth thinking.

2. **SQL Injection Prevention**: Across hundreds of database queries in 30+ repository files, every single query uses parameterized placeholders. Even dynamic WHERE clause construction uses `$${i++}` indices. This is exemplary.

3. **Sanitized Error Handling**: The `send500` function never leaks internal details. The fixed `STANDARD_500_BODY` pattern prevents information disclosure across the entire API.

4. **Production Mode Enforcement**: The `SecurityProfile` system (`src/security/security_profile.ts`) provides a single source of truth for security invariants. Production mode forces auth, forces tenant context, disables dev APIs, and prevents dangerous bypasses. Environment variable overrides are explicitly rejected in deployment modes.

5. **Cryptographic Signing**: Ed25519 with Node.js native crypto, startup key validation, production key requirements, and a properly hash-chained audit ledger. This is textbook correct.

6. **Financial Integrity**: The use of `Decimal.js` (no floating point), `NUMERIC(20,2)` in PostgreSQL, and `GENERATED ALWAYS` columns for computed fields shows the team understands the domain's integrity requirements.

7. **Dependency Awareness**: The `_vulnerabilityNotes` field in `package.json` for the xlsx library shows the team tracks known CVEs in dependencies.

8. **Path Traversal Protection**: The local disk storage explicitly normalizes paths and rejects `..` sequences.

---

## DEPENDENCY RISK NOTES

| Package | Version | Known Issues |
|---------|---------|-------------|
| `xlsx` | `^0.18.5` | GHSA-4r6h-8v6p-xvw6 (prototype pollution, HIGH), GHSA-5pgg-2g8v-p4x9 (ReDoS, HIGH). Team has documented this and flagged for replacement with `exceljs`. |
| `express` | `^4.18.2` | Check for latest security patches. Express 4.x is maintained but Express 5 is available. |
| `jsonwebtoken` | `^9.0.2` | Current version; ensure `algorithms` whitelist is used (it is). |
| `multer` | `^1.4.5-lts.1` | LTS version; acceptable. |

---

*End of Blind Security Review*
*Reviewer: Security Engineer Agent*
*Classification: CONFIDENTIAL -- Contains vulnerability details*
