# Inferred Scope — Backend Map & Product Definition

*Inferred from codebase only. No founder/external context. Backend focus.*

---

## (1) What Have We Built?

**In one line:** A multi-tenant, agentic financial backend that ingests trial balance (and related documents), runs period-close workflows (reconciliations, checklists, controls, sign-off), generates financial statements (BS/P&L), and exposes LLM-powered orchestration (CPA/CFA-style tasks) and audit/evidence workflows — with durable jobs, optional ingestion scheduling, and BYOD tenant databases.

**How close to production:** **Not production-ready.** Gaps: storage module implementation missing (routes import it); accounting integrations are mock-only; agentic/LLM paths are non-deterministic (no stored inputs/outputs/model versions for reproducibility); ingestion scheduler and worker are opt-in; many routes and tenant migrations imply breadth but test coverage is narrow.

---

## TASK A — Repo Orientation (Backend Map)

### 1) Identified Elements

| Area | Evidence |
|------|----------|
| **Languages** | TypeScript (primary backend), Node ≥18; Python in `connectors/` (ERP/MCP) |
| **Frameworks** | Express 4.x, `pg` for Postgres |
| **Entrypoints** | **API:** `src/server.ts` (Express on PORT 3001). **Workers:** same process runs `runWorkerLoop` from `src/services/job_worker.js` and `startIngestionScheduler` from `src/services/ingestion_scheduler.js`. **CLI:** `tsx src/db/migrate.ts` (control), `tsx src/db/migrate.ts --tenant` (tenant DB). |
| **Persistence** | **DB:** PostgreSQL. **Control DB:** `DATABASE_URL` — identity, tenants, users, accounting_connections, jobs, scheduler_locks, schema_migrations. **Tenant DBs:** BYOD per tenant (`tenants.database_url`), pooled in-process (`src/db/index.ts` — getControlPool, getTenantPool, runTenantMigrations). **Migrations:** `migrations/` — control: 001, 002, 010, 075; tenant: 003–074 (see `src/db/migrate.ts` CONTROL_MIGRATION_FILES and runTenantMigrations). **ORM:** None; raw SQL + repository pattern (`src/db/repositories/*.ts`). |
| **Queues / Jobs** | **Table:** `jobs` in control DB (`migrations/075_jobs.sql`: id, type, payload, status, attempts, max_attempts, last_error, idempotency_key, run_at, locked_at, worker_id, completed_at). **Service:** `src/services/job_service.ts` (enqueueJob), `src/db/repositories/job_repository.ts` (enqueue, claimNext, complete, fail, deadLetter). **Worker:** `src/services/job_worker.ts` — poll, lock, run handler, retry with backoff, dead-letter after max_attempts. **Handlers:** `src/services/job_handlers.ts` — ingestion_pipeline, agentic_cleanup (placeholder), statement_generation. **Scheduler:** `src/services/ingestion_scheduler.ts` — distributed lock via `scheduler_locks` (010_scheduler_lock.sql), enqueues ingestion_pipeline per tenant on interval; enabled only if `INGESTION_SCHEDULER_ENABLED=true`. |
| **Storage** | **PARTIAL.** Routes call `getStorage()` from `../storage/index.js` / `../../storage/index.js` (`src/routes/export.ts`, `src/routes/close/close_journal_entries.ts`) for putObject/getObject (PDF/CSV export, journal entry attachments). **No `src/storage/` implementation in repo** — only tests reference `src/storage/local_disk_storage.js` and `src/storage/types.js` (`tests/unit/storage.test.ts`). App will fail at runtime when those routes hit storage unless a storage module is supplied elsewhere. |
| **Integrations / Adapters** | **Accounting:** `src/services/accounting_integration_service.ts` — IAccountingAdapter with MockAccountingAdapter for quickbooks, xero, netsuite (mock TB entries only). **Real ERP/MCP:** Python `connectors/` (erp_adapters, erp_bridge, erp_sync, mcp_erp_server, oauth_scopes, permission_guard) — separate process; TS backend does not import them. **Ingestion fetchers:** Gmail/Drive in `src/services/ingestion_fetchers.ts` (real HTTP to Google APIs when tokens present). |

### 2) Architecture Diagram (Text)

```
                    ┌─────────────────────────────────────────────────────────┐
                    │                    HTTP Clients                          │
                    └───────────────────────────┬─────────────────────────────┘
                                                │
                    ┌───────────────────────────▼─────────────────────────────┐
                    │  Express (src/server.ts :3001)                           │
                    │  /health, /health/ready, /api/auth, /api/* (rate limit)  │
                    │  requireAuth + attachTenantPool → tenant-scoped routes   │
                    └───┬─────────────────────────────────────────────────┬───┘
                        │                                                 │
        ┌───────────────┼───────────────┬─────────────────┬───────────────┼───────────────┐
        │               │               │                 │               │               │
        ▼               ▼               ▼                 ▼               ▼               ▼
   auth, users    trial-balance,    close/*,          orchestrator,   ingestion,     export,
   tenants        ingest, parser    adjustments,      cpa_index,      pipelines,     financial_memory,
                  classification    checklists,       lead-partner    hitl,          vector_store,
                                    journal entries,                  supervisor,     integrations,
                                    sign-off,                        accounting_     reporting,
                                    reconciliations                   integration     audit/*, ...
        │               │               │                 │               │               │
        └───────────────┴───────────────┴────────┬────────┴───────────────┴───────────────┘
                                                 │
                    ┌────────────────────────────▼────────────────────────────┐
                    │  Services (fileIngestion, ocr, parser_utils,            │
                    │  ingestion_agent, ingestion_fetchers, statement_package,│
                    │  job_service, integration_store, env, disallowMemory…)  │
                    └────────────────────────────┬────────────────────────────┘
                                                 │
        ┌───────────────────────────────────────┼───────────────────────────────────────┐
        │                                       │                                       │
        ▼                                       ▼                                       ▼
┌───────────────┐                    ┌─────────────────────┐                 ┌─────────────────────┐
│ Control DB   │                    │ Tenant DB (per       │                 │ Storage (PARTIAL)    │
│ (DATABASE_URL)│                    │ tenant_id via       │                 │ getStorage() —       │
│ tenants,      │                    │ tenants.database_url│                 │ missing impl in repo │
│ users,        │                    │ period_trial_balance│                 │ used by export,     │
│ accounting_   │                    │ close_*, journal_   │                 │ close_journal_entries│
│ connections,  │                    │ entries, recon_*,   │                 └─────────────────────┘
│ jobs,         │                    │ audit_*, etc.       │
│ scheduler_    │                    │ migrations 003–074   │
│ locks         │                    └─────────────────────┘
└───────┬───────┘
        │
        │  same process
        ▼
┌───────────────────────────────────────────────────────────────────────────────┐
│ Job worker (runWorkerLoop)  ←  claimNext(jobs) → JOB_HANDLERS → complete/fail  │
│ Ingestion scheduler (optional) ← tryAcquireLock(scheduler_locks) → enqueueJob  │
└───────────────────────────────────────────────────────────────────────────────┘

Data flow (high level):
  • Request → auth → attachTenantPool(tenantId) → route → service → control or tenant pool → response.
  • Ingestion: upload/sync → trial balance or docs → ingestion_agent / parser → tenant TB or catalog.
  • Close: close session, adjustments, JE, checklist, recon, sign-off → statement_package (BS/P&L).
  • Orchestrator / CPA: user query → LLM/orchestrator → tools / sub-tasks → response (non-deterministic).
  • Export / JE attachments: getStorage().putObject/getObject (storage impl missing in repo).
```

---

## TASK B — Inferred Product Scope (What We Built)

### 1) Domain & Workflows (from routes, services, migrations, tests)

- **Domain:** Multi-tenant financial close, trial balance → statements, reconciliations, controls, audit support, and agentic “CPA/CFA” style analysis.
- **Core workflows observed:**  
  - Ingest trial balance (upload CSV/Excel or sync mock accounting) → parse → period_trial_balance.  
  - Period close: close sessions, adjustments, journal entries (with attachments via storage), checklists, reconciliations, controls, materiality, sign-off, decision records.  
  - Generate statement package (adjusted TB → BS/P&L) via job or API.  
  - Orchestrator: “Prepare Q4 Financials”, intent detection, lead-partner CoT (CPA/CFA sub-tasks, conflict resolution, reasonability).  
  - Ingestion pipeline job: fetch email/drive → ingestion agent → dedup; optional scheduler per tenant.  
  - Audit: engagements, PBC, sampling, reconciliation, prior period, professional review, DRL, forensics, GAAP policy, todos.  
  - Other: onboarding, data quality, approvals, catalog, reporting, intercompany, budget, forecasting, revenue recognition, leases, fixed assets, EPS, deferred tax, impairment, segment, business combination, equity method, stock comp, statutory, FX, consolidation, bank feed matching, invoice-to-books, AR/AP workflows, HITL, supervisor, memory/vector store, accounting integration (mock).

### 2) Product Definition

**What the system does (inferred from code):**

- Multi-tenant backend with control DB (identity, jobs, scheduler lock) and per-tenant Postgres (BYOD).
- Ingests trial balance (file upload or mock accounting sync), parses and stores per period; supports ingestion from Gmail/Drive and an ingestion agent (classification, dedup).
- Runs period-close workflows: close sessions, adjustments, journal entries (with file attachments), checklists, reconciliations, controls, materiality, sign-off, decision records, audit trail.
- Generates statement packages (adjusted trial balance → Balance Sheet & P&L) via service and durable job.
- Exposes orchestration APIs: “Prepare Q4 Financials”, intent detection, lead-partner CoT with CPA/CFA-style sub-tasks and reasonability checks.
- Provides durable job queue (ingestion_pipeline, agentic_cleanup placeholder, statement_generation) with retries, backoff, dead-letter, and optional ingestion scheduler with distributed lock.
- Exposes many audit-related routes (engagements, PBC, sampling, recon, prior period, review, DRL, forensics, GAAP policy, todos) and domain modules (revenue recognition, leases, fixed assets, EPS, deferred tax, impairment, segment, business combination, equity method, stock comp, statutory, FX, consolidation, etc.).
- Auth (JWT), optional auth middleware, tenant-scoped pool attachment, rate limiting, health/readiness.
- Export APIs that write PDF/CSV via storage adapter; close journal entry attachments stored via same adapter.

**What it does NOT do (inferred):**

- Does not ship a working storage implementation in repo (getStorage/local_disk_storage expected by routes/tests but `src/storage/` not present).
- Does not integrate with real accounting providers (QuickBooks/Xero/NetSuite are mock adapters only).
- Does not guarantee reproducible agentic/LLM decisions (no evidence of stored prompts, responses, or model versions for replay).
- Does not run ingestion scheduler by default (env-gated).
- Does not provide a single “run all tests” backend test suite that covers all routes or migrations (tests are unit/smoke/integration subsets).

**Key domain objects (tables / concepts) and relationships:**

- **Control:** tenants (id, name, database_url), users (tenant_id, email, role), accounting_connections (tenant_id, provider, credential_ref), jobs, scheduler_locks, schema_migrations, audit_log.
- **Tenant (representative):** period_trial_balance (tenant_id, period_label, source, entries), close_sessions, close_adjustments, journal_entries (with attachment file_ref), close_checklist*, reconciliation*, close_controls, decision_records, statement_packages, period_close, disclosure_checklist, audit_engagements, pbc, sampling_results, recon_*, issue_items, triage_assessments, period_financial_data_state, close_audit_trail, fs_taxonomy_lines, coa_mapping_rules, plus many domain-specific tables (leases, fixed_assets, revenue_recognition, eps, deferred_tax, impairment, segment, business_combination, equity_method, stock_compensation, etc.).
- **Relationships:** Tenant is root; users and accounting_connections belong to tenant; period_trial_balance and close_* are per tenant+period; close sessions tie adjustments, JEs, checklists, sign-off; statement_packages are generated from close session; jobs in control DB are tenant-agnostic (payload carries tenantId/closeSessionId where needed).

### 3) Observed Capabilities Table

| Capability | Evidence | Input(s) → Output(s) | State |
|------------|----------|----------------------|--------|
| Multi-tenant identity & DB routing | `src/db/index.ts` (getControlPool, getTenantPool, attachTenantPool), `src/auth/middleware.ts`, `migrations/001_initial.sql`, `002_control_add_database_url.sql` | Request + JWT → tenantId; tenantId + DB URL → tenant pool | Implemented |
| Trial balance ingest (upload) | `src/routes/trial-balance/ingest.ts`, `src/services/fileIngestion.ts`, `migrations/060_period_trial_balance.sql`, `src/db/repositories/period_trial_balance_repository.ts` | File upload + tenant/period → parsed TB stored in period_trial_balance | Implemented |
| Trial balance sync (accounting) | `src/routes/accounting_integration.ts`, `src/services/accounting_integration_service.ts` | tenantId, provider, date → MockAccountingAdapter returns mock TB entries | **PARTIAL** (mock only) |
| Period close session & adjustments | `src/routes/close/close_sessions.ts`, `close_adjustments.ts`, `migrations/065_tenant_close_sessions.sql`, `064_tenant_draft_adjustments.sql`, close_adjustments in 001 | Create/update close session; create adjustment (debits/credits) | Implemented |
| Journal entries with attachments | `src/routes/close/close_journal_entries.ts`, `migrations/072_tenant_journal_entries.sql`, getStorage() | Multipart file or fileRef → JE + attachment stored via getStorage() | **PARTIAL** (storage impl missing) |
| Close checklist & sign-off | `src/routes/close/close_checklist.ts`, `close_signoff_readiness.ts`, `022_tenant_close_checklist.sql`, `073_tenant_close_checklist_items.sql`, repos | Checklist items, sign-off readiness read/write | Implemented |
| Reconciliations | `src/routes/close/close_reconciliation.ts`, recon repos, `071_tenant_recon_tables.sql`, `020_tenant_reconciliation_resolutions.sql` | Recon runs, resolution data | Implemented |
| Statement package generation | `src/services/statement_package_service.ts`, `src/services/job_handlers.ts` (statement_generation), `074_statement_packages.sql` | TenantId + closeSessionId → BS/P&L package (job or direct) | Implemented |
| Durable job queue | `migrations/075_jobs.sql`, `src/db/repositories/job_repository.ts`, `src/services/job_service.ts`, `job_worker.ts`, `job_handlers.ts` | enqueue(type, payload, idempotencyKey) → claim → run handler → complete/fail/dead-letter | Implemented |
| Idempotency & retry | `job_repository.ts` (enqueue with idempotencyKey), `job_worker.ts` (backoff, dead-letter), `tests/unit/job_queue.test.ts` | Same idempotencyKey → return existing completed id; fail → retry then dead-letter | Implemented |
| Ingestion scheduler | `src/services/ingestion_scheduler.ts`, `migrations/010_scheduler_lock.sql`, listTenantIds, enqueueJob | Interval + lock → enqueue ingestion_pipeline per tenant | Implemented (opt-in via env) |
| Ingestion pipeline job | `job_handlers.ts` handleIngestionPipeline, `ingestion_fetchers.ts` runAllFetchersAndIngest | tenantId → fetch email/drive, run ingestion agent, dedup | Implemented |
| Agentic cleanup job | `job_handlers.ts` handleAgenticCleanup | tenantId, sessionId → no-op placeholder | **PARTIAL** (placeholder) |
| Orchestrator “Prepare Q4” | `src/routes/orchestrator.ts`, `src/services/orchestrator.ts` | rawRows/entries/bankStatementBalance/periodLabel → plan, TB, BS, P&L, reconciliation, financialHealthSummary | Implemented |
| Lead-partner CoT | `src/routes/orchestrator.ts` lead-partner, `lead_partner_orchestrator.ts` | query + optional TB/BS/P&L/dcfInputs/cfoView → thought_process, cpa_sub_tasks, cfa_sub_tasks, conflict_variance, reasonability_checks | Implemented (non-deterministic) |
| Export (PDF/CSV) | `src/routes/export.ts`, getStorage().putObject | Session/period → PDF or CSV written to storage key | **PARTIAL** (depends on missing storage) |
| Storage (object) | `src/routes/export.ts`, `close_journal_entries.ts` import getStorage; `tests/unit/storage.test.ts` references local_disk_storage, types | putObject(key, body), getObject(key) | **PARTIAL** (no src/storage in repo) |
| Accounting integration (real) | `src/services/accounting_integration_service.ts` | Adapter interface exists; only MockAccountingAdapter for QB/Xero/NetSuite | **PARTIAL** (mock only) |
| Auth (JWT, login) | `src/routes/auth.ts`, `src/auth/`, users table | Login → JWT; requireAuth/optionalAuth middleware | Implemented |
| Health & readiness | `src/server.ts` /health, /health/ready | GET → ok or ready (DB check) | Implemented |
| Migrations (control vs tenant) | `src/db/migrate.ts`, migrations/*.sql | Control: 001,002,010,075; Tenant: 003–074 on tenant URL | Implemented |

---

## Production Readiness (Backend) — Summary

| Aspect | Status | Notes |
|--------|--------|--------|
| Storage | **Missing** | Routes and tests expect `src/storage` (getStorage, local_disk_storage); app will fail on export and JE attachment download without it. |
| Accounting integrations | **Mock only** | No real QuickBooks/Xero/NetSuite; sync returns mock data. |
| Agentic/LLM | **Non-deterministic** | No stored inputs/outputs/model versions in repo for reproducing decisions. |
| Jobs & scheduler | **Implemented** | Queue, worker, idempotency, retry, dead-letter, and optional scheduler with lock are in place. |
| Persistence | **Implemented** | Control + tenant Postgres, migrations, repositories; BYOD tenant DBs. |
| Auth & multi-tenant | **Implemented** | JWT, tenant pool attachment, rate limit, health. |
| Breadth of routes | **Large** | Many close/audit/domain routes; coverage and E2E not fully evidenced by tests. |

**Verdict:** The backend implements a broad set of features and a solid job/tenant/migration foundation but is **not production-ready** until storage is implemented (or stubbed), accounting adapters are real or explicitly documented as demo-only, and agentic behavior is either documented as best-effort or augmented with reproducibility (e.g., storing prompts/model versions/outputs).
