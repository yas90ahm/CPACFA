# Audit Log Retention

This document describes how the audit log is stored, retained, and queried.

## Storage

- **In-memory**: When no tenant DB context is provided, entries are appended to an in-memory array. The array is capped at **50,000 entries** (`MAX_ENTRIES` in `audit_log_service.ts`). When the cap is exceeded, the oldest entries are removed (FIFO).
- **Tenant DB**: When a request includes tenant context (pool, tenantId), each `appendAuditLog` call also writes to the tenant's `audit_log` table. The table is append-only (no updates or deletes in normal operation).

## Schema (tenant DB)

- `id`, `tenant_id`, `timestamp`, `actor`, `action`, `resource`, `detail`, `payload` (JSONB).
- Index: `(tenant_id, timestamp)` for efficient querying by tenant and time range.

## Retention Policy (recommended)

- **In-memory**: Retain only the most recent 50,000 entries. No configurable retention; oldest entries are dropped when the cap is reached.
- **Tenant DB**: No automatic purge is implemented. For long-term compliance (e.g. 7 years), implement one of:
  - **Application-level**: A scheduled job or admin endpoint that deletes rows older than a configured cutoff (e.g. `DELETE FROM audit_log WHERE tenant_id = $1 AND timestamp < $2`).
  - **Database-level**: Use PostgreSQL partitioning by time and drop old partitions, or use a retention policy in your DB backup/archival process.
- **Query limits**: `queryAuditLog` limits results to 100 by default (max 500 when using DB) to avoid unbounded responses.

## Actions logged

Examples: `period_lock`, `close_checklist_complete`, `period_close_sign_off`, `period_close_reviewer_sign_off`, `close_adjustment_post`, `period_edit_blocked`, and other controlled actions. See `appendAuditLog` call sites for the full set.

## Querying

- Use `queryAuditLog(filters, context)` with optional `actor`, `action`, `resource`, `since` (ISO), `limit`.
- When context (pool, tenantId) is provided, results are read from the tenant DB; otherwise from the in-memory log.
