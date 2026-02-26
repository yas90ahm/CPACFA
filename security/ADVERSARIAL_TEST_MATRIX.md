# ADVERSARIAL TEST MATRIX v1

*Derived from source code only. No .md/.txt docs referenced.*

---

## 1) Threat Model Summary (code-based)

### Attacker types

| Type | Capabilities | Notes |
|------|--------------|-------|
| **External** | Unauthenticated; no JWT. Can hit public endpoints (/health, /health/ready), auth (login, register). | Auth routes rate-limited (login 10/15min, register 5/15min). |
| **Tenant insider** | Valid JWT for tenant A. Can reach all /api routes scoped to tenant A. | May attempt cross-tenant IDOR via guessable IDs. |
| **Infra compromise** | Server/DB access. Can read/write DB, forge tokens, tamper responses. | Not fully preventable in-app; defense in depth. |

### Trust boundaries

| Boundary | Location | Enforcement |
|----------|----------|-------------|
| API gateway | Before /api | apiLimiter 200 req/min; express.json 1mb |
| Auth middleware | server.ts app.use('/api', ...) | requireAuth or optionalAuth; attachTenantPool; requireTenantContext |
| Tenant context | getTenantId(req) from JWT | JWT payload only; body tenant injection disabled in strict modes |
| DB | getTenantPool(tenantId) | Pool per tenant (BYOD or shared); tenant_id in queries |
| File upload | multer limits | trial-balance 10MB; ingestion 15MB; vector-store 10MB; JE attachments 20MB |
| Verification endpoints | /api/verification/* | requireTenantContext; snapshot.tenantId === tenantId |
| Vector store / memory | in-memory chunks | No tenant scoping in store.js |

---

## 2) Attack Surface Inventory (summary)

| Group | Endpoints | Key routes |
|-------|-----------|------------|
| **Ingest** | POST /api/trial-balance/ingest, /api/trial-balance/statements, /api/ingestion/agent, /api/ingestion/pipeline | File upload, large JSON |
| **Close sessions** | POST /api/close/sessions, /sessions/:id/advance, /sessions/:id/certify, /checklist-items/:id/complete | Mutate state |
| **JE posting** | POST /api/close/journal-entries, /:id/propose, /:id/approve, /:id/post, /:id/attachments | JE lifecycle, attachments |
| **Evidence / attachments** | POST /api/close/journal-entries/:id/evidence, /:id/attachments; GET .../attachments/:id/download | File storage via getStorage() |
| **Exports / binder** | POST /api/export/pdf, /api/export/csv; GET /api/audit/binder, /binder/export/pdf, /binder/export/csv | Certified gate; closeSessionId required |
| **Verification** | GET /api/verification/snapshots/:snapshotId, /audit-chain, /evidence-manifest/:snapshotId | Read-only; tenant check |

---

## 3) Adversarial Scenarios Table

### A) Auth bypass / tenant spoofing

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-001 | /api/* | External | No Authorization header | 401 | requireAuth (server.ts:106) | H | Y | - |
| ADV-002 | /api/trial-balance/ingest | Tenant insider | body.tenantId = other-tenant | Reject; use JWT tenant only | isBodyTenantInjectionAllowed(); injectTenantFromBody (ingest.ts:81-101) | H | Y | - |
| ADV-003 | /api/* | External | REQUIRE_AUTH=false in prod | Auth still required | useRequireAuth = isProduction \|\| requireAuthByDefault (server.ts:98) | M | Y | - |

### B) IDOR (cross-tenant resource access)

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-004 | /api/verification/snapshots/:id | Tenant A | snapshotId = tenant B's UUID | 404 | snapshot.tenantId !== tenantId (snapshots.ts:44) | H | Y | - |
| ADV-005 | /api/verification/evidence-manifest/:id | Tenant A | snapshotId = tenant B's UUID | 404 | snapshot.tenantId !== tenantId (evidence_manifest.ts:81) | H | Y | - |
| ADV-006 | /api/audit/binder/export/pdf | Tenant A | closeSessionId = tenant B's | 403/404 | getSession(pool, tenantId, id); pool from JWT tenant | H | Y | - |
| ADV-007 | /api/close/sessions/:id | Tenant A | session id from tenant B | 404 | getSession(pool, tenantId, id) | M | N | - |

### C) Abuse / DoS (large payloads, repeated calls, timeouts)

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-008 | POST /api/precheck/board-ready | External | JSON body > 1MB | 413 or controlled failure | express.json limit 1mb (server.ts:63) | H | Y | - |
| ADV-009 | POST /api/trial-balance/statements | External | Very large trialBalance array | 413 or 400 | express.json 1mb | M | Y | - |
| ADV-010 | GET /api/verification/snapshots/:id | External | >200 requests/min | 429 | apiLimiter 200/min (server.ts:87-93) | M | Y | - |
| ADV-011 | POST /api/auth/login | External | Brute force | Rate limited | loginLimiter 10/15min (auth.ts:30-35) | M | N | - |

### D) File upload abuse (MIME spoof, zip bomb, path traversal)

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-012 | POST /api/trial-balance/ingest | External | .exe with Content-Type: text/csv | Reject | fileFilter MIME text/csv, xlsx (ingest.ts:65-72) | M | Y | - |
| ADV-013 | POST /api/ingestion/agent | External | MIME spoof (e.g. text/plain for exe) | Reject or flag | fileFilter MIME + ext (ingestion.ts:22-43) | M | Y | - |
| ADV-014 | POST /api/close/journal-entries/:id/attachments | Tenant | No MIME validation | Accept any | No fileFilter (close_journal_entries.ts:36) | H | Y | Add whitelist |
| ADV-015 | Storage putObject | Attacker | key with ../ | Reject | sanitizeKey (local_disk_storage.ts:12-17) | M | N | - |

### E) Verification endpoint abuse

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-016 | /api/verification/snapshots/:id | External | UUID enumeration | 404 for others' IDs | snapshot.tenantId check | M | N | - |
| ADV-017 | /api/verification/* | External | Hammering | 429 | apiLimiter | M | Y | - |
| ADV-018 | /api/verification/evidence-manifest/:id?includeDetails=1 | Tenant | Tamper claim | hashMatches/matchesSnapshotBinding false | recomputeAndVerifySnapshotHash | L | N | - |

### F) Data poisoning (vector store, RAG)

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-019 | POST /api/vector-store/ingest | Tenant A | Poison chunks | Affects all tenants | store.js in-memory; no tenant_id | M | N | Tenant-scoped store |
| ADV-020 | POST /api/vector-store/ingest-pdf | Tenant A | Malicious PDF | Accept if valid PDF | pdfUpload MIME + magic bytes (vector_store.ts:35-37) | M | N | - |

### G) Race conditions (double certify, lock/certify concurrent)

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-021 | POST /api/close/sessions/:id/advance (certify) | Tenant | Two concurrent certify | Idempotent or one fails safely | advance() status check; certified → none | H | Y | - |
| ADV-022 | POST /api/close/period-lock | Tenant | Concurrent lock same period | One succeeds; other fails or no-op | period_lock check | M | N | - |

### H) Error leakage (stack traces, internal messages)

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-023 | Any /api | External | Trigger 500 | Generic message only | send500 (errorHandler.ts:17-30) | M | N | - |

### I) Replay / rollback (old snapshots, legacy fallback)

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-024 | Certified export | Tenant | allowLegacyCertifiedSource=1 for old data | Configurable | ALLOW_LEGACY_CERTIFIED_SOURCE env | L | N | - |
| ADV-025 | Audit chain | Attacker | Replay old signed payload | Hash chain breaks | verifyChain | M | N | - |

### J) Misconfiguration risk

| ID | Target | Attacker | Attack | Expected | Defense (code) | Risk | Automate | Mitigation |
|----|--------|----------|--------|----------|----------------|------|----------|------------|
| ADV-026 | /api/* | Operator | REQUIRE_AUTH=false in prod | Auth still required | useRequireAuth: isProduction forces true | M | Y | - |
| ADV-027 | /api/* | Operator | REQUIRE_TENANT_CONTEXT=false in prod | Tenant still required when strict | strictTenantContext = NODE_ENV===production | M | N | - |

---

## 4) Protocol Gap

### Impossible to defend purely in-app

- **Server compromise**: Attacker with server access can forge responses, bypass middleware, read DB directly.
- **JWT secret compromise**: Attacker can mint valid tokens for any tenant.
- **Database compromise**: Attacker can tamper ledger_snapshots, audit_ledger; hash chain detects but cannot prevent.
- **Infra/network**: Man-in-the-middle without TLS; reverse proxy misconfiguration.

### What future artifact signing would solve

- **Tamper-evident exports**: Client-side verification of PDF/CSV via embedded signature (e.g. JWS, RFC 8785).
- **Snapshot chain of custody**: Cross-tenant verifiable proof that snapshot N follows N-1.
- **Auditor-held verification key**: Auditors verify hashes without trusting server responses.
