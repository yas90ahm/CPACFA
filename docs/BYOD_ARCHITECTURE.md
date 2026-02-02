# BYOD Architecture: App in Our Cloud, DB in Customer's Cloud

FinOS Agent supports **Bring Your Own Database (BYOD)**: the application runs in our cloud while each customer's business data lives in their own Postgres instance in their cloud. This keeps the product **SaaS** (you host and operate the app) with **customer-held data** (data residency and control stay with the customer).

## Overview

- **Control plane (our cloud):** One Postgres instance (`DATABASE_URL`) stores only **identity and tenant config**: `tenants` (id, name, optional `database_url`), `users` (id, tenant_id, email, password_hash, role). Used for login/register and to resolve which DB to use per tenant.
- **Tenant DB (customer cloud):** Each customer can provision Postgres in their own cloud/region. The schema contains only **business data**: accounting_connections, period_locks, close_adjustments, audit_log. The app connects using the URL stored in `tenants.database_url`.

When `tenants.database_url` is null, the tenant uses the **shared control DB** for business data (backward-compatible single-DB behaviour). When set, the app uses a **per-tenant pool** to that URL.

## How to provision a customer DB

1. Customer provisions Postgres in their cloud (e.g. AWS RDS, Azure Database for PostgreSQL, GCP Cloud SQL).
2. They allow outbound TLS from your API’s egress IP (or use a connector in their VPC).
3. They run tenant migrations against that DB (see below).
4. They set the connection URL in FinOS (admin UI or API).

## Setting `database_url`

- **On register:** `POST /api/auth/register` accepts optional `databaseUrl` in the body; if provided, it is stored in `tenants.database_url`.
- **After signup:** An admin with a JWT for that tenant can set or update the URL:
  - `PATCH /api/tenants/:id` with body `{ "databaseUrl": "postgresql://..." }`.
  - Optional: `{ "databaseUrl": "...", "testConnection": true }` to run tenant migrations (and thus validate the URL) before saving.
- **Read-only check:** `GET /api/tenants/:id` returns whether a database URL is configured (`databaseUrlConfigured: true/false`); the raw URL is not returned in responses to avoid leaking secrets.

Only the tenant’s own users (same `tenantId` as in the JWT) can read or update that tenant’s settings.

## Tenant migrations

- **Control DB:** On server startup, only **control** migrations run (e.g. `001_initial.sql`, `002_control_add_database_url.sql`) against `DATABASE_URL`.
- **Tenant DB:** The **tenant** schema (e.g. `003_tenant_schema.sql`) is run:
  - **Lazy:** On first request that needs a tenant pool, if the tenant has a `database_url`, the app ensures the tenant schema is applied to that DB before using it.
  - **Script:** You can run tenant migrations manually:
    - `MIGRATE_TENANT_URL=postgresql://user:pass@host:5432/db tsx src/db/migrate.ts --tenant`
    - Or: `npm run migrate:tenant` with `MIGRATE_TENANT_URL` set in the environment.

## Pool limits

- The app caches a pool per tenant DB URL (up to a maximum number of tenant pools, with LRU eviction) to avoid unbounded connections.
- Control DB uses a single pool. Tenant DBs use a separate pool per URL.

## Data stays in the customer's cloud

- Identity (tenants, users) and the mapping `tenant_id → database_url` live in the **control DB** (our cloud).
- All business data (connections, period locks, close adjustments, audit log) for a BYOD tenant live **only** in that tenant’s DB (customer’s cloud). The app never writes that data to the control DB.

## Security notes

- Do not log or expose raw `database_url` values.
- Prefer storing URLs in a secrets manager and keeping only a reference in `tenants`; if stored in the DB, restrict access and consider encryption at rest (to be expanded in a later security phase).
- Validate URL format (e.g. `postgres:` / `postgresql:`) before saving.
