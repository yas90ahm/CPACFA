# Production Phase 1 — DB, Auth, Tenant

Phase 1 of the production readiness plan is implemented: Postgres (when `DATABASE_URL` is set), auth (login/register + JWT), optional auth middleware that sets `req.tenantId`, and tenant-scoped persistence for accounting connections, period locks, and close adjustments.

## Environment

- **DATABASE_URL** (optional): Postgres connection string. When set, migrations run on startup and accounting connections, period locks, and close adjustments are stored in Postgres (tenant-scoped). When not set, the app uses in-memory stores and skips migrations.
- **JWT_SECRET** (optional): Secret for signing JWTs. Defaults to a dev value; set in production.
- **JWT_EXPIRES_IN** (optional): Token expiry (e.g. `7d`). Default `7d`.

## Migrations

- **Run manually:** `npm run migrate` (requires `DATABASE_URL`).
- **On startup:** When `DATABASE_URL` is set, the server runs migrations before listening.

## Auth

- **POST /api/auth/login** — Body: `{ tenantId, email, password }`. Returns `{ token, userId, tenantId, role }`. Requires DB.
- **POST /api/auth/register** — Body: `{ tenantName, email, password, role? }`. Creates tenant + user, returns token. Requires DB.
- **Optional auth:** All `/api/*` routes (except `/api/auth`) use `optionalAuth` middleware. If `Authorization: Bearer <token>` is present, `req.tenantId`, `req.userId`, `req.role` are set from the JWT. Otherwise `req.tenantId` is `'default'`.

## Tenant-scoped data (when DB is configured)

- **Accounting connections** — `POST/GET /api/accounting-integration/connections`; list/get/create use `req.tenantId`.
- **Period locks** — `POST/GET /api/close/period-lock`; lock/list use `req.tenantId`.
- **Close adjustments** — `POST/GET/PATCH /api/close/adjustments/*`; list/add/update use `req.tenantId`.

## Health

- **GET /health** — Liveness; always 200.
- **GET /health/ready** — Readiness; when `DATABASE_URL` is set, checks DB connectivity. Returns `{ status, db: 'connected'|'not_configured'|'error' }`.

## Next (Phase 2 / 3)

- Phase 2: Real QuickBooks, Xero, NetSuite adapters (replace mocks).
- Phase 3: Audit log write, rate limiting, requireAuth for sensitive routes.
