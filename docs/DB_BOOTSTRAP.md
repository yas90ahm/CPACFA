# Database Bootstrap and Verification

This document describes how to reset, migrate, verify, and seed the backend database (Supabase Postgres or standard Postgres). All destructive actions are guarded; the reset script cannot run unless explicitly allowed.

## Prerequisites

- **DATABASE_URL** in `.env` at project root (or in the environment).
- Node 18+ and `npm install` (or `npm ci`) at project root.

## Commands

| Script | Purpose |
|--------|---------|
| `npm run db:reset` | **Destructive.** Wipe `public` schema, recreate extensions, run all migrations, optionally seed test data, then verify schema. Refuses unless `NODE_ENV=test` or `ALLOW_DB_RESET=true`; refuses prod-like `DATABASE_URL`. Run with: `ALLOW_DB_RESET=true npm run db:reset`. |
| `npm run db:migrate` | Run control + tenant migrations only (idempotent; skips already-applied migrations). |
| `npm run db:verify` | Run schema verification only. Exits non-zero if any required table/column is missing. |
| `npm run db:seed:test` | Insert minimal test tenant data (e.g. `certification-pipeline-tenant`). Idempotent. |

## Reset Safely (Supabase / Postgres)

The reset script:

1. **Reads** `DATABASE_URL` from `.env` (or environment).
2. **Prints** the target database identity (host, database, user; password redacted) before doing anything.
3. **Refuses** to run unless one of:
   - `NODE_ENV=test`, or
   - `ALLOW_DB_RESET=true`
4. **Refuses** to run if `DATABASE_URL` looks like production (contains `prod`, `production`, or known prod hostname patterns).
5. **Wipes** the `public` schema using one of two modes (see **Full vs soft reset** below).
6. **Recreates** extensions: `uuid-ossp`, `pgcrypto`, `btree_gist` (no extensions are ever dropped).
7. **Runs** all control migrations (001, 002, 010, 075) then tenant migrations on the same DB.
8. **Seeds** test data only if `SEED_FOR_TESTS=true`.
9. **Runs** schema verification; exits non-zero if any check fails.

### Full vs soft reset

- **Full reset (default attempt):** `DROP SCHEMA public CASCADE` → `CREATE SCHEMA public` → `GRANT`. Works when the database allows dropping the `public` schema (e.g. many local Postgres and some Supabase setups).
- **Soft reset (fallback):** Used automatically when full reset fails (e.g. Supabase forbids `DROP SCHEMA public`). The script then:
  - Drops all tables in `public` with `DROP TABLE ... CASCADE`.
  - Drops custom types/enums in `public` that are not extension-owned.
  - Drops functions in `public` that are not extension-owned.
  - Does **not** drop any extensions or the schema; Supabase-managed extension objects are left intact.

The script tries full reset first. On success it logs `Reset mode: full`. On failure it logs the error, runs the soft reset, then logs `Reset mode: soft`. In both cases it then runs `ensureExtensions()` and continues with migrations, seed (if requested), and verification. **`npm run db:reset` works on Supabase even when `DROP SCHEMA` is forbidden.**

To reset a **non-production** database (e.g. local or CI):

```bash
# From project root; .env must contain DATABASE_URL. Explicit allow required.
ALLOW_DB_RESET=true npm run db:reset
# or: NODE_ENV=test npm run db:reset
```

To include test seed data:

```bash
SEED_FOR_TESTS=true ALLOW_DB_RESET=true npm run db:reset
```

Or run reset then seed separately:

```bash
ALLOW_DB_RESET=true npm run db:reset
npm run db:seed:test
```

## Run Migrations Only

Use when the database already exists and you only want to apply pending migrations:

```bash
npm run db:migrate
```

For tenant-specific URL (e.g. BYOD):

```bash
MIGRATE_TENANT_URL=<url> npm run migrate:tenant
```

## Run Verification Only

Check that required tables and columns exist (e.g. after migrations or in CI):

```bash
npm run db:verify
```

Verification checks for:

- **audit_ledger** (hash-chain columns: `previous_entry_hash`, `entry_hash`)
- **tenant_hitl_staging**
- **period_trial_balance**
- **journal_entries** and **journal_entry_lines**
- **tenant_justifications**
- **period_locks**
- **close_sessions**
- **schema_migrations**, **tenants**

Missing tables or columns are reported; the process exits non-zero.

## Integration Tests Against a Fresh DB

With a brand-new empty Supabase (or Postgres) database:

1. Put the database URL in `.env` as `DATABASE_URL`.
2. Reset and optionally seed (explicit allow required):

   ```bash
   ALLOW_DB_RESET=true npm run db:reset
   npm run db:seed:test
   ```

   Or with seed in one step:

   ```bash
   SEED_FOR_TESTS=true ALLOW_DB_RESET=true npm run db:reset
   ```

3. Run integration tests from the **tests** directory:

   ```bash
   cd tests
   npm test -- integration/certification_pipeline.test.ts
   ```

   Or from project root (if your test runner is configured):

   ```bash
   npm test -- tests/integration/certification_pipeline.test.ts
   ```

The test harness runs schema verification before tests when `DATABASE_URL` is set. If verification fails, tests fail with a clear message to run `db:migrate` or `db:reset`.

## CI

- Set **DATABASE_URL** in the CI environment (e.g. Supabase project URL). If `CI=true` and `DATABASE_URL` is missing, the test run **fails fast** with a message; integration tests are not silently skipped.
- Before running tests, run **db:verify** (or **db:migrate** / **db:reset**):

  ```yaml
  - run: npm run db:verify
  - run: cd tests && npm test
  ```

  Or reset once then test:

  ```yaml
  - run: ALLOW_DB_RESET=true npm run db:reset
  - run: cd tests && npm test -- integration/
  ```

## Migrations Layout

Migrations live in **`migrations/`** at the project root. Control migrations (001, 002, 010, 075) run first; tenant migrations (003–078) run on the same database when using a single DB (e.g. Supabase with one project). The migration runner is in `src/db/migrate.ts` and `src/db/index.ts`.

## No Production Changes

- Reset and bootstrap are **tooling only**; they do not change production runtime behavior.
- Destructive actions require explicit flags; the script will not run against production-like URLs.
