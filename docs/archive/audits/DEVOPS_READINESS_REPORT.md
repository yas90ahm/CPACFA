# DevOps Readiness Report

Pragmatic audit: code and package.json only. No docs/comments. Focus: safe pilot production (1–10 tenants).

---

## 1. Executive summary

The backend has solid database safety (migrations, idempotent SQL, reset guarded against production-like URLs, schema verification, tests that fail fast when schema is wrong). Environment and security basics are in place: JWT_SECRET required in production, secrets from env, export bypass ignored in prod, auth enforced in prod. Single start path, reproducible setup, and structured logging with redaction exist. Gaps: db:seed:test can run against any DATABASE_URL; server starts without DB (no fail-fast when DB expected); job worker swallows poll errors and continues; a few non-fatal empty catches in ingest. With small, targeted fixes this is safe for pilot.

---

## 2. Category scores

| Category | Score | Notes |
|----------|--------|------|
| Database safety | **Strong** | Migrations exist (control + tenant), IF NOT EXISTS used, reset requires ALLOW_DB_RESET or NODE_ENV=test and refuses prod-like URLs, schema_verify + db:verify, tests run verifySchema in beforeAll when DATABASE_URL set. |
| Environment configuration | **Adequate for pilot** | .env.example documents vars; JWT_SECRET enforced in prod (auth/index.ts); secrets from env; no hardcoded secrets in code. Safe defaults (e.g. PORT 3001). Production checks for JWT, audit context, in-memory stores. |
| Deployability | **Adequate for pilot** | Single start: `npm run build && npm run start`. Reproducible: install, migrate, verify. Manual: set .env (DATABASE_URL, JWT_SECRET for prod). Build is deterministic (tsc). |
| Test reliability | **Strong** | Integration tests use real DB when DATABASE_URL set; setup runs verifySchema and throws on failure; certification pipeline and integration tests skip when DB not set (CI-safe). Schema smoke via db:verify. |
| Data integrity safeguards | **Adequate for pilot** | Startup runs migrations when DB configured and exits on migration failure. Job worker logs errors and continues (no process crash); handlers fail/retry/dead-letter. No schema verify at server startup (only at test startup when DB set). |
| Observability (minimal) | **Adequate for pilot** | Structured logger (lib/logger.ts): JSON, level, request_id, redaction of secret-like keys. send500 logs full error server-side, returns generic client message. Some non-fatal catch blocks in ingest (decision record, issue creation) intentionally no-op. |
| Security basics | **Strong** | Writes go through services/repos and bridge; no raw mutation SQL in routes. Export/certification gates server-side; production ignores exportBypassCertification and logs tampering. Auth: production always requireAuth; dev router (/api-dev) only when !production. |
| Backup/Recovery readiness | **Adequate for pilot** | No code assumes ephemeral DB. Reset script refuses prod-like DATABASE_URL and requires explicit ALLOW_DB_RESET or NODE_ENV=test. seed_test has no prod guard. |

---

## 3. Risks (real only)

- **db:seed:test** — Inserts a test tenant into whatever DB DATABASE_URL points at. No production-url check. Low impact if only run in CI/dev; risk if someone runs it against prod by mistake.
- **Server starts without DB** — When DATABASE_URL is unset, server still starts (migrations skipped). Acceptable for dev; for production you must set DATABASE_URL, so no automatic fail-fast for “forgot to set DB.”
- **Job worker** — Poll/handler errors are logged but worker keeps running. Handler failures go to retry/dead-letter. No silent data corruption; at worst jobs pile up.
- **Non-fatal catches in ingest** — A few `catch (_) { /* non-fatal */ }` for decision record and issue creation on MathematicalIntegrityError. Intentional; no silent swallow of the main error (response still 422). Minor: could log once for visibility.

---

## 4. Minimal fixes (max 10)

1. **Guard db:seed:test** — In `src/db/seed_test.ts`, reuse the same `looksLikeProduction(url)` (or a simple check) as in reset_and_bootstrap; exit 1 with a clear message if DATABASE_URL looks like production.
2. **Optional: fail server start when DB expected** — If you want strict production behavior: when NODE_ENV=production and DATABASE_URL is unset, throw or exit in server startup (after loading env). Keeps current dev behavior when DB not set.
3. **Optional: log non-fatal ingest catches** — In trial-balance ingest, where decision record or issue creation is caught and ignored, add a single log line (e.g. `log('warn', 'Decision record/issue creation skipped', { ... })`) so operators see that a side path was skipped.
4. **CI: run db:verify before integration tests** — Already covered by tests/setup.ts when DATABASE_URL is set. If CI runs integration tests, ensure DATABASE_URL is set and migrations have been run (e.g. db:migrate in CI before tests).
5. **Document production env** — In .env.example or a short runbook, list required production vars: DATABASE_URL, JWT_SECRET, NODE_ENV=production. No code change; clarity only.
6. **Optional: JOB_WORKER_ENABLED** — Already exists; for pilot you can set JOB_WORKER_ENABLED=false if you do not use background jobs, to reduce moving parts.
7. **No other changes required** for pilot — Migrations, reset guard, schema verify, auth, and export gates are sufficient.

---

## 5. Final verdict

**Safe with small fixes.**

- **Database:** Migrations, idempotent SQL, reset and schema verification, and tests that fail fast on schema mismatch are in place. No evidence of schema corruption or unsafe deploy from DB tooling.
- **Secrets & auth:** Env-only secrets, JWT enforced in production, no export bypass in prod. No debug bypass active in production.
- **Deploy & tests:** Single start command, reproducible setup, integration tests and schema verification suitable for CI. With db:seed:test guarded (and optional startup/observability tweaks), the backend is in good shape for 1–10 tenant pilot production.

Apply fix (1) and optionally (2)–(3) and (5); then treat as **safe for pilot**.
