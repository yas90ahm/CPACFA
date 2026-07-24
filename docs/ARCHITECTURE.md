# Architecture

This document is the short map of Sabit's current code. It describes the
repository as it exists; it is not a claim that every component is ready for
production.

## System shape

```text
Next.js frontend
       |
       v
TypeScript API and worker
       |
       +--> deterministic accounting and close controls
       +--> human-review and approval workflows
       +--> AI suggestions and explanations
       +--> evidence storage and audit events
       |
       v
PostgreSQL control and tenant data

Optional side services: Python classifier, MCP server, and ERP connectors
```

`src/server.ts` assembles the API. Routes validate HTTP input and pass work to
services; services apply business rules and use repositories in `src/db`.
`src/worker.ts` handles asynchronous jobs. The frontend in `frontend/` is a
separate Next.js application that calls the API.

## Main boundaries

### Deterministic accounting core

Balance checks, journal-entry state changes, period locks, certification gates,
and export checks belong in TypeScript services and the database. AI output must
not be the authority for amounts or posting decisions.

The main code is under:

- `src/bridge` for guarded mutation paths
- `src/services` for accounting, close, evidence, export, and audit behavior
- `src/routes/close`, `src/routes/trial-balance`, and `src/routes/audit` for API
  entry points
- `shared/config` for shared financial rules

### Data and tenancy

`DATABASE_URL` connects to the control database. Tenant database information and
tenant-scoped repositories are handled under `src/db`. The migration history in
`migrations/` defines the durable model, including close sessions, journal
entries, evidence, audit events, AI call records, and integration state.

Strict environments should fail closed when database or tenant context is
missing. Development-only in-memory behavior must not be treated as durable.

### AI boundary

The AI code under `src/ai`, `src/llm`, and selected services classifies,
suggests, explains, or flags work for review. Schemas constrain responses and AI
calls are intended to be logged. Deterministic services and human approvals
remain responsible for accounting truth and state changes.

### Evidence and auditability

Evidence can use local or S3-backed storage through `src/storage`. Material
events and overrides feed the audit-ledger services. Certified outputs pass
server-side status, integrity, and audit-chain checks before export.

Generated evidence is runtime data. It must not be committed to the repository.

### External and Python services

- `connectors/` contains experimental ERP adapters and an MCP bridge.
- `mcp_server/` contains Python MCP and webhook services.
- `slm/` exposes a Python classification service and model scripts.

These components have separate dependency files and deployment concerns. Treat
them as optional integrations, not part of the deterministic accounting trust
boundary.

## Runtime profiles

`MODE` is the primary runtime profile. `dev` permits local conveniences; `demo`,
`staging`, and `prod` enforce progressively stricter authentication and startup
requirements. `NODE_ENV=production` adds production fail-fast behavior.

The canonical environment reference is `.env.example`. Security expectations
and reporting guidance live in [`SECURITY.md`](../SECURITY.md).
