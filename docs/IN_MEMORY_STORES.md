# In-memory stores and multi-tenant / multi-instance safety

This document lists services that use **in-memory stores** (process-local `Map` or variables) when a tenant database is not attached to the request. It clarifies which paths are safe for production multi-tenant and multi-instance deployments.

## Summary

- **Production multi-tenant or multi-instance**: Configure a database (BYOD or shared control DB) and require authentication so that `tenantId` and `tenantPool` are set on requests. Services that support a DB will use it when `pool` and `tenantId` are present; otherwise they fall back to in-memory storage.
- **In-memory fallbacks** are intended for **single-tenant dev or unauthenticated usage only**. They are not tenant-scoped, not persistent across restarts, and not shared across API instances.

## Production enforcement

When **NODE_ENV=production** or **REQUIRE_TENANT_CONTEXT=true**, the API enforces tenant context for all non-auth `/api` routes. Any request that does not have both `tenantId` and `tenantPool` set (e.g. missing auth token or DATABASE_URL) receives **503** with `error: 'Tenant context required'` and a message that DATABASE_URL and auth must be configured. In-memory fallbacks are therefore not used in production for those routes.

- **REQUIRE_TENANT_CONTEXT** (optional): When set to `'true'`, require tenant context even when `NODE_ENV !== 'production'`. Use this to test enforcement in development. When unset, enforcement runs only when `NODE_ENV === 'production'`.

## Services using in-memory stores (when pool/tenantId missing)

| Service | In-memory when | DB when | Notes |
|--------|----------------|---------|--------|
| **audit_export_service** | Last statement generation (single global) | `statement_generations` table per tenant (Phase 1) | Binder, catalog, reconciliation use “latest” per tenant when DB used. |
| **close_adjustments_service** | Adjustments in `Map` | `close_adjustments` table in tenant schema | Fallback for dev without DB. |
| **filing_calendar_service** | Calendar items in `Map` | `filing_calendar_items` in tenant schema | Same pattern: pool/tenantId → DB. |
| **drl_service** | Document requests in `Map` | `document_requests` in tenant schema (Phase 5b) | DRL: add, update, list, fulfill. |
| **budget_version_service** | Budget versions in `Map` | `budget_versions` (+ lines) in tenant schema (Phase 5b) | Create, list, get, update, lock. |
| **onboarding_service** | Onboarding state in `Map` | `onboarding_state` in tenant schema (013) | One row per tenant; get/upsert/update step, entity, CoA, first TB, first close. |
| **reconciliation_todos** | Todos in `Map` | `reconciliation_todos` in tenant schema (014) | addTodosFromGaps, list, markTodoDone, getGapsWithResolution. |
| **kpi_history_service** | KPI snapshots in `Map` | `kpi_snapshots` in tenant schema (015) | Append-only; list by tenant + filters. |
| **pbc_service** | PBC items in memory | `pbc_items` in tenant schema (016) | addPBCItem, listPBCItems, getPBCItem, updatePBCItem. |
| **sampling_result_store** | Sampling results in `Map` | `sampling_results` in tenant schema (017) | storeSamplingResult, getSamplingResult, updateSamplingTestResults. |
| **saved_scenarios_service** | Scenarios in memory | — | No tenant DB path yet. |
| **cash_flow_forecast_service** | Forecasts in memory | — | No tenant DB path yet. |
| **alerts / commentary** | In-memory | — | No tenant DB path yet. |
| **pack_run_service** | Pack run state in memory | — | No tenant DB path yet. |
| **catalog_query_service** | In-memory cache (TTL + max keys) | N/A (cache only) | Per-process; not shared across instances. |

## Recommendations

1. **Production**: Always use a database and authenticate requests so `tenantPool` and `tenantId` are set. Avoid relying on in-memory fallbacks for any critical path.
2. **High-value migrations**: DRL and budget versions are the first candidates for tenant DB persistence (see Phase 5b); other stores can follow the same pattern.
3. **Catalog cache**: Capped at 1000 keys with TTL; per-process. For shared cache across instances, consider Redis or similar in a later phase.
