# Supabase Sync — Supervisor Sessions & Reasoning Logs

This project **does not use Prisma**. It uses **raw SQL migrations** and the **pg** driver. The `tenant_supervisor_sessions` table (and `reasoning_logs` column) are created by tenant migrations **062** and **063**, which are now included in the tenant migration list so they run when the app connects to a tenant DB (including Supabase).

---

## 1. Schema (no Prisma)

The backend uses **snake_case** column names and expects this structure:

- **Table:** `tenant_supervisor_sessions`
- **Columns:** `id` (TEXT PK), `tenant_id`, `user_id`, `mode`, `status`, `pipeline_input_snapshot` (JSONB), `last_step`, `last_result_summary`, `message_history` (JSONB), **`reasoning_logs`** (JSONB, default `'[]'`), `created_at`, `updated_at`, `completed_at`

`reasoning_logs` is a **JSONB array** of steps (thought/tool) appended by `appendReasoningLogWithClient` in `src/services/persistence_service.ts`. The persistence layer uses **snake_case** (`tenant_id`, etc.); no Prisma model is used.

---

## 2. Fix applied: migrations 062 and 063

**File:** `src/db/index.ts`

**Change:** **062** and **063** were added to `TENANT_MIGRATION_FILES`. When the app calls `getTenantPoolWithMigrations(tenantId)` (e.g. for `test-tenant-uuid` or any tenant), it now runs:

- **062** — creates `tenant_hitl_staging` and **`tenant_supervisor_sessions`** (without `reasoning_logs`).
- **063** — adds **`reasoning_logs`** (JSONB) to `tenant_supervisor_sessions`.

So the table and column are created automatically on first use of that tenant DB.

---

## 3. Syncing with Supabase

### Option A: Let the app run migrations (recommended)

1. Point **DATABASE_URL** (control DB) to your Supabase Postgres URL (or ensure the tenant’s `database_url` in the `tenants` table points to Supabase).
2. Ensure the **control DB** has run migrations 001, 002, 010 (control migrations run on app startup).
3. When the HUD (or any flow) calls the Supervisor with `tenantId` (e.g. `test-tenant-uuid`), the app calls `getTenantPoolWithMigrations(tenantId)`. That resolves the pool (control pool if tenant has no `database_url`) and runs **tenant** migrations 003–063 on that pool, including **062** and **063**.
4. Restart the Node API so it loads the updated migration list; the next Supervisor run will create the table if it doesn’t exist.

### Option B: Run SQL manually in Supabase

If you prefer to create the table once in the Supabase SQL Editor, run the contents of:

- `migrations/062_tenant_hitl_staging_and_supervisor_sessions.sql`
- `migrations/063_tenant_supervisor_sessions_reasoning_logs.sql`

Run 062 first, then 063. That creates `tenant_supervisor_sessions` and adds `reasoning_logs`.

### Commands (no Prisma)

- There is **no Prisma** in this repo, so **do not** use `npx prisma db push` or `npx prisma migrate dev`.
- To run **control** migrations only (e.g. after setting DATABASE_URL):  
  `npm run migrate`

**Run tenant migrations using the URL from your `.env` file:**

1. In `.env`, set your Supabase Postgres connection string as **`DATABASE_URL`** (or **`MIGRATE_TENANT_URL`**).  
   Get the URL from Supabase Dashboard → Settings → Database (e.g. `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`).

2. From the project root, run:

```bash
npx tsx src/db/migrate.ts --tenant
```

The script loads `.env` and uses **`MIGRATE_TENANT_URL`** if set, otherwise **`DATABASE_URL`**. So if your Supabase URL and password are already in `.env` as `DATABASE_URL`, this single command is enough.

**Override without .env:**

```bash
MIGRATE_TENANT_URL="postgresql://user:pass@host:5432/postgres" npx tsx src/db/migrate.ts --tenant
```

This runs all tenant migrations (003–063), including **062** (creates `tenant_supervisor_sessions`) and **063** (adds `reasoning_logs` JSONB).

---

## 4. Test tenant (`test-tenant-uuid`)

- **No FK from `tenant_supervisor_sessions` to `tenants`.** The table lives in the tenant DB (or control DB when the tenant has no `database_url`). There is no foreign key on `tenant_id`, so you do **not** need a row in `tenants` to avoid an FK error.
- For **pool resolution:** `getTenantPool('test-tenant-uuid')` looks up `tenants` in the **control** DB. If `test-tenant-uuid` is missing, `database_url` is null and the app uses the **control** pool (same DB as control migrations). So tenant migrations 003–063 (including 062 and 063) run on the **control** DB, and `tenant_supervisor_sessions` is created there.
- Optional: to have a dedicated DB for the test tenant, insert a row into the control DB’s `tenants` table with `id = 'test-tenant-uuid'` and set `database_url` to your Supabase (or other) URL. Then that pool gets migrations 062/063 on first use.

---

## 5. Persistence and HUD

- **Persistence:** `src/services/persistence_service.ts` uses **snake_case** and **raw SQL** (`tenant_id`, `reasoning_logs`, etc.). No code changes are required for field names.
- **Session:** `src/routes/supervisor.ts` already resolves pool for `test-tenant-uuid` (or body `tenantId`) via `getTenantPoolWithMigrations` and creates a session, so `sessionId` is returned to the HUD.
- **Trace:** The HUD polls `GET /api/supervisor/session/:sessionId/trace?tenantId=test-tenant-uuid` and passes `tenantId="test-tenant-uuid"` from `DiagnosticThoughtStream`; the trace route accepts `tenantId` from the query when there is no auth.

Once 062 and 063 run (either by app or by hand), the “relation does not exist” error should be resolved and thoughts should persist and show in the HUD.
