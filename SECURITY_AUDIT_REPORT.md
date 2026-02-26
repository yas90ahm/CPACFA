# Security Audit Report — Financial Software

*Codebase: CPACFA (FinOS Agent API). Focus: authentication, data integrity, input validation, financial data protection, compliance readiness.*

---

## 1. AUTHENTICATION / AUTHORIZATION

### JWT Implementation
- **Library:** `jsonwebtoken`, HS256. `verifyToken` uses `algorithms: [JWT_ALGORITHM]` — algorithm confusion prevented.
- **Secret:** `JWT_SECRET` required in production; throws at import if `NODE_ENV=production` and secret is unset or equals `DEV_SECRET` (`dev-secret-change-in-production`). **Strong.**
- **Expiry:** `JWT_EXPIRES_IN` (default 24h). Configurable.
- **Payload:** `userId`, `tenantId`, `email`, `role`. Stored in JWT; no server-side session lookup.

**Refs:** `src/auth/index.ts`

### Token Refresh Mechanism
- **None.** No refresh token flow. User re-authenticates when token expires.
- **Risk:** Long-lived tokens (e.g. 7d) increase exposure if stolen. Short expiry (24h) reduces risk but degrades UX.

### Session Management
- **Stateless:** JWT-only. No server-side session store or blacklist.
- **Revocation:** No way to invalidate a token before expiry. Compromised token valid until expiry.
- **Logout:** Client discards token; server has no awareness.

### Tenant Isolation
- **Primary path:** `tenantId` from JWT. `attachTenantPool` loads tenant DB from JWT `tenantId`. All main routes use `getTenantId(req)` / `req.tenantId`.
- **Vulnerability — Tenant IDOR:** `src/routes/integrations.ts` and `src/routes/ingestion.ts` use `req.query.tenantId ?? 'default-tenant'` instead of JWT `tenantId`. An authenticated user for tenant A can pass `?tenantId=tenantB` and:
  - Store/read OAuth tokens for tenant B
  - List tenant B's integrations
  - Run fetchers for tenant B
  - Read tenant B's usage
- **Fix:** Use `getTenantId(req)` from JWT; reject or ignore `query.tenantId` when it differs from JWT.

**Refs:** `src/auth/middleware.ts`, `src/lib/tenant_context.ts`, `src/routes/integrations.ts` (lines 21, 94, 99), `src/routes/ingestion.ts` (lines 164, 184)

### injectTenantFromBody
- **Behavior:** Sets `req.tenantId` from `body.tenantId` only when `!authReq.tenantId` (auth did not set it).
- **Production:** `/api` uses `requireAuth`; 401 before route if no token. `tenantId` always from JWT. **No override in production.**
- **Dev:** `/api-dev` uses `optionalAuth`; mounted only when `NODE_ENV !== 'production'`. Dev-only risk.

---

## 2. DATA INTEGRITY

### Hash Collision Potential
- **Snapshot hash:** SHA-256. Collision resistance ~2^128. Adequate for financial snapshots.
- **Audit ledger:** SHA-256 per entry. Same.
- **No truncated hashes.** Full 64-char hex output used.

**Refs:** `src/lib/snapshot_hash.ts`, `src/db/repositories/audit_ledger_repository.ts`

### Snapshot Tampering Detection
- **verifySnapshotHash:** Recomputes hash from stored payload; compares to `snapshot_hash`. Mismatch → `false`.
- **verifyChain:** Validates each audit ledger entry's hash and `previous_entry_hash` link. Tampering breaks chain.
- **Export gate:** Runs `verifyChain` before certified PDF/CSV. Blocks export on failure.
- **Materiality:** Client cannot supply `roundingGapExceedsMateriality` or `aggregateRoundingExceedsMateriality`; 403 if present. Values read from DB only.

**Refs:** `src/services/ledger_snapshot_service.ts`, `src/services/export_gate_service.ts`, `src/routes/export.ts` (lines 111–118)

### Audit Chain Immutability
- **Append-only:** No UPDATE/DELETE in application code. Schema supports it.
- **Hash-chained:** Each entry links to previous. `verifyChain` enforces integrity.
- **Risk:** No DB-level trigger preventing UPDATE/DELETE. Malicious DBA could alter. Application layer is correct.

**Refs:** `src/db/repositories/audit_ledger_repository.ts`, `migrations/051_audit_ledger.sql`

### Database Transaction Isolation
- **Gap:** `certifyCloseSession` and `advanceSession` perform multiple writes (snapshot, session update, audit ledger) **without a transaction**. Partial failure can leave inconsistent state.
- ** isolation level:** Default PostgreSQL (READ COMMITTED). No explicit SERIALIZABLE for financial flows.
- **Recommendation:** Wrap certify and advance in explicit transactions.

---

## 3. INPUT VALIDATION

### SQL Injection
- **Parameterized queries:** All repository queries use `$1`, `$2`, etc. No string concatenation of user input.
- **Dynamic updates:** `equity_method_repository`, `fixed_asset_repository`, etc. build `SET col = $n` from **whitelisted** keys only. Safe.
- **Exception:** `revenue_recognition_repository`, `lease_repository` use `Object.keys(patch)` for dynamic updates. If patch keys come from untrusted input, theoretical risk. Routes validate via Zod; patch structure is constrained. **Low risk.**

**Refs:** All `src/db/repositories/*.ts`

### CSV/XLSX Parsing
- **CSV:** `csv-parse/sync`. Options: `columns: true`, `skip_empty_lines`, `trim`, `relax_column_count`. No obvious injection; output is parsed into objects.
- **XLSX:** `XLSX.read(buffer, { type: 'buffer', cellDates: false })`. First sheet only.
- **Risks:**
  - **Zip bomb / billion laughs:** XLSX is ZIP. Malicious XLSX could decompress to huge size. No explicit size limit on decompressed output.
  - **Large CSV:** `MAX_TB_ROWS` (default 100k) limits rows. Rows processed in memory; 100k rows is manageable but could be tuned.
- **File size:** Multer limit 10 MB. Good.
- **MIME check:** File filter checks `mimetype`; can be spoofed. Extension not validated. Acceptable for internal tool; for public upload consider magic-byte validation.

**Refs:** `src/services/fileIngestion.ts`, `src/routes/trial-balance/ingest.ts` (multer config)

### JSON Payload Validation
- **Zod schemas:** `validateBody(ingestBodySchema)` etc. Request bodies validated before processing.
- **express.json limit:** `limit: '1mb'`. Prevents huge JSON attack.
- **Schema coverage:** Major routes use Zod. Coverage is good but not exhaustive.

### File Upload Security
- **Multer:** Memory storage. 10 MB limit. MIME filter (CSV, XLSX).
- **Field name:** `file` required. 400 if missing.
- **Path traversal:** `originalname` not used for filesystem writes (memory storage). Safe.
- **Virus scanning:** None. Consider ClamAV or cloud scanning for production.

---

## 4. FINANCIAL DATA PROTECTION

### Encryption at Rest
- **Database:** No application-level encryption. Relies on PostgreSQL / host encryption (e.g. RDS encryption, disk encryption).
- **Integration store:** AES-256-GCM for OAuth tokens in `.integrations.enc`. `INTEGRATION_STORE_KEY` required in production.
- **Ingestion dedup store:** Similar encryption. `STORE_KEY` from env.
- **Ledger snapshots:** Stored as JSONB. No application-level encryption; DB/host encryption assumed.

**Refs:** `src/services/integration_store.ts`, `src/services/ingestion_dedup_store.ts`

### Encryption in Transit
- **HTTPS:** Not implemented in app. Expected to run behind reverse proxy (nginx, load balancer) with TLS.
- **Outbound:** OAuth and LLM calls use `https://`. No TLS verification bypass.

### Sensitive Data Handling
- **Error responses:** `send500` returns generic message; full error and stack logged server-side only. No leakage.
- **Logs:** Structured. Avoid logging full financial payloads; log metadata (e.g. requestId, route).
- **Secrets:** In env vars. No hardcoded secrets.

### PII / Financial Data Exposure
- **Export:** PDF/CSV contain financial data. Access gated by certified session + export gate.
- **Binder:** Requires `closeSessionId` and certified status. Tenant-scoped.
- **Audit log:** Stores actor, action, resource. May include user identifiers. Retention: `AUDIT_LOG_RETENTION_YEARS` (default 7).
- **JWT:** Contains `userId`, `tenantId`, `email`. Not logged in responses.

---

## 5. COMPLIANCE CONSIDERATIONS

### SOC 2 Readiness
- **Access control:** JWT auth, role-based (preparer/approver). Tenant isolation. **Partial.** Tenant IDOR in integrations/ingestion weakens.
- **Audit logging:** Append-only audit log. Actions logged. 7-year retention. **Good.**
- **Encryption:** At rest: DB/host. In transit: proxy responsibility. OAuth tokens encrypted in file store. **Partial.**
- **Change management:** Hash-chain audit ledger. Tampering detectable. **Good.**
- **Vendor/third-party:** LLM, OAuth providers. No vendor assessment framework visible.

### GDPR (if applicable)
- **Data minimization:** Financial data retained for close/audit. No explicit retention policy for trial balance, journal entries.
- **Right to erasure:** No implemented flow. Deleting tenant data would require manual DB operations.
- **Data export:** Certified export provides financial data. No structured "export my data" for PII.
- **Consent:** Not in scope for B2B accounting tool.

### Financial Data Retention
- **Audit log:** `AUDIT_LOG_RETENTION_YEARS` (default 7). `deleteAuditLogOlderThan` exists.
- **Audit ledger:** Append-only. No purge. Indefinite retention.
- **Ledger snapshots:** No purge. Indefinite retention.
- **Trial balance, JEs:** No explicit retention policy in code.

### Audit Logging Completeness
- **Logged:** `appendAuditLog` for actions (e.g. period_edit_blocked, tampering_attempt). Audit ledger for certify_close, close_lock, overrides.
- **Missing:** Consistent logging of all mutations (e.g. JE post, recon signoff). Some flows may not audit.
- **Immutable:** Audit log and audit ledger are append-only. Tampering would require DB access.

---

## OVERALL SECURITY POSTURE

### Rating: **Needs Hardening** (6–12 weeks of security work)

**Rationale:**
- **Strengths:** JWT production guard, parameterized SQL, hash-chain/snapshot integrity, export gate, materiality zero-trust, audit logging.
- **Gaps:** Tenant IDOR in integrations/ingestion, no token refresh, no transaction wrapping for certify/advance, XLSX zip-bomb risk, no file magic-byte validation, encryption at rest depends on infra.
- **Not Enterprise-ready:** Tenant IDOR and lack of refresh/revocation would fail a security review for Fortune 500.
- **Not Vulnerable:** No critical SQL injection or auth bypass. Core integrity controls are sound.

---

## REMEDIATION STEPS (Priority Order)

| Priority | Remediation | Effort | Files |
|----------|-------------|--------|-------|
| **P0** | Fix tenant IDOR: Use JWT `tenantId` in integrations and ingestion; reject `query.tenantId` when it differs. | 0.5 day | `integrations.ts`, `ingestion.ts` |
| **P0** | Wrap certify and advance in transactions. | 2–3 days | `close_session_service.ts`, new `db/transaction.ts` |
| **P1** | Add token refresh flow (optional but recommended for enterprise). | 3–5 days | New auth routes, refresh token store |
| **P1** | Add XLSX decompression size limit or stream-based parsing to mitigate zip bomb. | 1 day | `fileIngestion.ts` |
| **P1** | Add file magic-byte validation (CSV: check first bytes; XLSX: PK header). | 0.5 day | Ingest route |
| **P2** | Document encryption at rest/transit requirements for deployment. | 0.5 day | Ops docs |
| **P2** | Add explicit retention policy for trial balance, JEs, snapshots. | 1 day | Config, purge job |
| **P2** | Token revocation: blacklist or short-lived tokens + refresh. | 2–3 days | Auth |
| **P3** | Virus scanning for uploads (ClamAV or cloud). | 2–3 days | Ingest pipeline |
| **P3** | SOC 2 readiness review and gap remediation. | 2–4 weeks | Broader |

**Estimated total for P0+P1:** ~2 weeks. **For enterprise-grade:** 6–12 weeks including SOC 2, retention, revocation, scanning.

---

## SUMMARY

| Area | Status | Notes |
|------|--------|-------|
| JWT | Strong | Production guard, algo fix |
| Token refresh | Missing | Increases stolen-token risk |
| Tenant isolation | **Vulnerable** | IDOR in integrations, ingestion |
| Hash/snapshot | Sound | SHA-256, deterministic, tested |
| SQL injection | Low risk | Parameterized throughout |
| File upload | Partial | Size limit, MIME filter; zip bomb, magic bytes |
| Encryption | Partial | OAuth encrypted; DB/infra assumed |
| Audit logging | Good | Append-only, retention |
| Transactions | Gap | Certify/advance not wrapped |

**Bottom line:** Fix tenant IDOR and add transactions for certify/advance. With those and P1 items, the system is **startup-grade** and acceptable for seed-stage pilots. For enterprise (Fortune 500), plan 6–12 weeks for revocation, scanning, SOC 2, and documentation.
