# Database setup (for auth and trial balance upload)

The wedge app (login, register, trial balance upload) needs a **Postgres** control database. Without `DATABASE_URL`, login and register return 503 and upload returns 401.

## 1. Create a Postgres database

Use any Postgres 12+ (local or cloud).

**Local (Windows):**

- Install [PostgreSQL](https://www.postgresql.org/download/windows/) or use Docker:
  ```bash
  docker run -d --name finos-db -e POSTGRES_PASSWORD=postgres -e POSTGRES_DB=finos -p 5432:5432 postgres:15
  ```
- Default DB: `finos`, user: `postgres`, password: `postgres`, host: `localhost`, port: `5432`.

**Connection string format:**

```
postgresql://USER:PASSWORD@HOST:PORT/DATABASE
```

Example:

```
postgresql://postgres:postgres@localhost:5432/finos
```

## 2. Set DATABASE_URL

**Option A – environment variable (recommended)**

- Windows (PowerShell, current session):
  ```powershell
  $env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/finos"
  ```
- Or create a `.env` in the project root (if your stack loads it):
  ```
  DATABASE_URL=postgresql://postgres:postgres@localhost:5432/finos
  ```

**Option B – start the server with the variable**

```powershell
cd c:\Users\yasir\CPACFA
$env:DATABASE_URL = "postgresql://postgres:postgres@localhost:5432/finos"; npm run dev
```

## 3. Run migrations (control DB)

From the project root:

```bash
npm run migrate
```

This creates the control schema: `tenants`, `users`, `schema_migrations`, etc. You should see something like:

- `Running control migration 001_initial.sql (version 1)...`
- `Running control migration 002_control_add_database_url.sql (version 2)...`
- `Running control migration 010_scheduler_lock.sql (version 10)...`
- `Control migrations complete.`

## 4. Start the app and register

1. Start the backend (with `DATABASE_URL` set):
   ```bash
   npm run dev
   ```
2. Start the frontend (from `frontend/`):
   ```bash
   npm run dev
   ```
3. Open http://localhost:3000 → you’ll be redirected to **Login**.
4. Click **Register** and create an account (email, password, optional name).  
   This creates a tenant and user in the control DB.
5. After register you’re on the **Dashboard**. Use **Trial balance** to upload a CSV/XLSX; the request is authenticated and ingest runs.

## Summary

| Step | Command / action |
|------|-------------------|
| 1. Postgres | Install or `docker run ... postgres:15` |
| 2. Set URL | `$env:DATABASE_URL = "postgresql://user:pass@host:5432/dbname"` |
| 3. Migrate | `npm run migrate` (from project root) |
| 4. Run app | Backend: `npm run dev`; frontend: `cd frontend && npm run dev` |
| 5. Use app | Register → Dashboard → Upload trial balance |

Tenant-specific schema (close checklist, adjustments, etc.) is applied when needed; you don’t need to run `migrate:tenant` manually for the basic flow.
