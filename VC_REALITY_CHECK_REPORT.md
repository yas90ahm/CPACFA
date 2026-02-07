# State of the System – VC Reality Check

*Generated from executable codebase and tests only. No .md/.txt interpretation. No speculation.*

---

## 1) What the product IS

A Node.js/Express API (port 3001) for accounting and audit workflows: trial balance ingestion (CSV/XLSX), financial statement generation (BS, P&L), export/binder PDFs, month-end close sessions with a draft→locked→certified state machine, journal entry lifecycle, hash-chained audit ledger, ledger snapshots with SHA-256 hashing, and integrity gates that block export when ledger chain fails or materiality thresholds are exceeded. Auth is JWT-based; tenant context is required in production. DB is PostgreSQL via `DATABASE_URL`; migrations run at startup. Multiple endpoints are quarantined (410) or stubbed out of scope.

**Refs:** `src/server.ts`, `src/auth/middleware.ts`, `src/db/index.ts`, `src/db/migrate.ts`

---

## 2) What the product DEFINITELY DOES

- **Trial balance ingest:** `POST /api/trial-balance/ingest` — upload CSV/XLSX; parse, classify, store; `addTodosFromGaps` for reconciliation todos.  
  `src/routes/trial-balance/ingest.ts`, `src/services/reconciliation_todos.ts`

- **Trial balance statements:** `POST /api/trial-balance/statements` — JSON TB → BS + P&L.  
  `src/routes/trial-balance/parser.ts`

- **Precheck:** `POST /api/precheck/board-ready`, `POST /api/precheck/board-ready-pack` — stateless structural check, no DB/AI.  
  `src/routes/precheck.ts`

- **Close sessions:** `POST /api/close/sessions`, `POST /api/close/sessions/ensure`, `GET /api/close/sessions/:id`, `POST /api/close/sessions/:id/advance`, `POST /api/close/sessions/:id/certify`, `GET /api/close/sessions/:id/readiness`.  
  `src/routes/close/close_sessions.ts`, `src/services/close_session_service.ts`

- **Journal entries:** create, propose, approve, reject, post, validate-balanced, validate-period, validate-materiality.  
  `src/routes/close/close_journal_entries.ts`, `src/services/journal_entry_service.ts`

- **Audit binder:** `GET /api/audit/binder`, `GET /api/audit/binder/export/pdf`, `GET /api/audit/binder/export/csv`, `GET /api/audit/draft-package`.  
  `src/routes/audit/audit_binder.ts`

- **Export:** `POST /api/export/pdf`, `POST /api/export/csv` — use `checkExportGate` before export.  
  `src/routes/export.ts`, `src/services/export_gate_service.ts`

- **Audit ledger:** append-only, hash-chained; `verifyChain` validates link integrity; `recordMaterialEvent` for `close_lock`, `certify_close`.  
  `src/db/repositories/audit_ledger_repository.ts`, `src/services/audit_ledger_service.ts`

- **Ledger snapshots:** `createSnapshotFromTrialBalanceAndEntries` builds payload, `hashSnapshotPayload` SHA-256, `verifySnapshotHash`.  
  `src/services/ledger_snapshot_service.ts`, `src/lib/snapshot_hash.js`

- **Integrity gate:** `finalIntegrityCheck` (Truth Gate) — debits=credits, Assets=Liabilities+Equity, plug detection.  
  `src/services/integrity_check.ts`, `src/services/integrity_gate_service.ts`, `src/services/certified_statements_service.ts`

- **Readiness:** `computeReadiness` — checklist, cash rec, critical issues, draft/proposed JEs, integrity (chain + materiality).  
  `src/services/close_checklist_readiness_service.ts`

- **HITL:** staging, resolve-ingest, webhook approve/reject.  
  `src/routes/hitl.ts`

- **COA mapping:** taxonomy, rules, map.  
  `src/routes/coa_mapping.ts`

- **Justification, audit todos, GAAP consistency, reconciliation summary, PBC index, approvals, onboarding, accounting integration.**  
  `src/routes/` (audit, justification, approvals, onboarding, accounting_integration)

- **Tests:** unit (close_session_service, ledger_snapshot_hash, export_gate_service, etc.), integration (close_sessions_advance, request_id_observability, certification_pipeline).  
  `tests/unit/`, `tests/integration/`

---

## 3) What the product DOES NOT DO (code-evidenced)

- **Supervisor:** `/api-dev/supervisor` returns 410 "Quarantined".  
  `src/routes/dev_diagnostics.ts:27`

- **Close coach:** `GET /readiness/coach` returns 410.  
  `src/routes/close/close_signoff_readiness.ts:89`

- **Agentic JE suggestions from text / explain:** 410.  
  `src/routes/close/close_je_accruals.ts:61–73`

- **Forensic anomalies:** `GET /api/audit/dashboard/forensic-anomalies` returns empty list/stub.  
  `src/routes/audit/audit_forensics.ts:10`

- **GAAP reconciliation:** `gaap_reconciliation_service.ts` is a stub pass-through.  
  `src/services/gaap_reconciliation_service.ts:3`

- **Agentic ledger-to-TB:** Branch kept but never runs (quarantined).  
  `src/routes/trial-balance/ingest.ts:155`

- **Budget/forecasting in catalog:** `catalog_query_service` returns empty for budget/forecasting.  
  `src/services/catalog_query_service.ts:98–101`

- **CPA-CFA conflict resolution:** quarantined in `result_generator.ts`.  
  `src/services/result_generator.ts:406`

- **AI gap analysis:** quarantined; use deterministic dataGaps only.  
  `src/services/result_generator.ts:432`

- **Agentic policy proposals:** quarantined.  
  `src/services/result_generator.ts:455`

- **Fixed assets:** Switch to SL when SL > DDB not implemented.  
  `src/services/fixed_asset_service.ts:217`

- **Job handler:** TODO for agentic cleanup.  
  `src/services/job_handlers.ts:25`

---

## 4) Deterministic guarantees

- **Snapshot hash:** `hashSnapshotPayload` in `src/lib/snapshot_hash.js` — canonical JSON, `entrySortKey`, SHA-256; `verifySnapshotHash` recomputes and compares.  
  `src/lib/snapshot_hash.js`, `src/services/ledger_snapshot_service.ts:92–100`

- **Audit ledger chain:** `verifyChain` in `audit_ledger_repository` — each entry links via `previous_entry_hash`; hash mismatch or broken link returns `valid: false`.  
  `src/db/repositories/audit_ledger_repository.ts:173–231`

- **Snapshot payload structure:** `SNAPSHOT_PAYLOAD_ALLOWED_TOP_LEVEL_KEYS`, `SNAPSHOT_PAYLOAD_REQUIRED_TOP_LEVEL_KEYS` — only `trialBalance` (required), `entries` (optional).  
  `src/services/ledger_snapshot_service.ts:29–32`

- **Integrity gate:** `finalIntegrityCheck` enforces debits=credits, Assets=Liabilities+Equity, plug detection.  
  `src/services/integrity_check.ts`, `src/services/certified_statements_service.ts`

- **Export gate:** `checkExportGate` blocks PDF/CSV on chain failure, `roundingGapExceedsMateriality`, `aggregateRoundingExceedsMateriality`; when `ENABLE_INTEGRATED_SUPERVISOR`, also blocks on unresolved conflicts.  
  `src/services/export_gate_service.ts`

---

## 5) Operational guarantees

- **Request ID:** `requestIdMiddleware` reads/provides `X-Request-Id`, sets `req.requestId`, injects into error JSON (4xx/5xx).  
  `src/middleware/requestId.ts`

- **Error envelope:** `send500` logs full error server-side, returns generic JSON with `error`, `code`, `message`, `requestId`.  
  `src/lib/errorHandler.ts`

- **In-memory fallback:** `disallowMemoryStoreInProduction` throws in production when durable context (pool/tenantId) is missing.  
  `src/lib/env.ts`

- **Production DB check:** `ensureProductionHasDatabase()` exits if `NODE_ENV=production` and `DATABASE_URL` unset.  
  `src/server.ts:193–199`

- **Tests:** `tests/integration/request_id_observability.test.ts` verifies X-Request-Id header and `requestId` in error JSON.

---

## 6) API surface summary

| Path | Method | Returns |
|------|--------|---------|
| `/api/trial-balance/ingest` | POST | Ingest result, todos |
| `/api/trial-balance/statements` | POST | BS + P&L |
| `/api/precheck/board-ready`, `/board-ready-pack` | POST | Precheck result |
| `/api/close/sessions` | POST, GET | Session(s) |
| `/api/close/sessions/ensure` | POST | Session (idempotent) |
| `/api/close/sessions/:id` | GET | Session |
| `/api/close/sessions/:id/advance` | POST | AdvanceResult (success/blockers) |
| `/api/close/sessions/:id/certify` | POST | Certified session |
| `/api/close/sessions/:id/readiness` | GET | Readiness (hardBlockers, softWarnings) |
| `/api/close/journal-entries` | POST, GET | JE(s) |
| `/api/close/journal-entries/:id/propose|approve|reject|post` | POST | Updated JE |
| `/api/audit/binder`, `/binder/export/pdf`, `/binder/export/csv` | GET | PDF/CSV (certified) |
| `/api/audit/draft-package` | GET | Draft PDF |
| `/api/audit/todos` | GET | Todos |
| `/api/export/pdf`, `/api/export/csv` | POST | PDF/CSV (gated) |
| `/api/coa-mapping/taxonomy`, `/rules`, `/map` | GET, POST | COA mapping |
| `/api/hitl/staging`, `/resolve-ingest`, `/webhook` | GET, POST | HITL staging / resolve |

**Refs:** `src/server.ts`, `src/routes/*`

---

## 7) State machine summary

**Close session:** `ALLOWED_TRANSITIONS` — draft↔in_progress↔ready_for_review↔finalized↔locked→certified.  
`src/services/close_session_service.ts:20–27`

**Advance behavior:**
- `advanceSession`: draft→…→locked in one call; readiness checked at finalized→locked; `recordMaterialEvent('close_lock')` on lock.
- locked→certified: `certifyCloseSession`; `recordMaterialEvent('certify_close')`; creates ledger snapshot; `buildCertifiedStatementsFromSnapshot` (Truth Gate).
- certified: no-op.

**Readiness for advance:** `computeReadiness` — checklist, cash rec sign-off, no critical issues, no draft/proposed JEs, audit chain valid, materiality (rounding) OK.

**Refs:** `src/services/close_session_service.ts`, `src/services/close_checklist_readiness_service.ts`

---

## 8) Hard dependencies

- **DB:** `DATABASE_URL` required for persistent data; production exits if missing.  
  `src/db/index.ts`, `src/server.ts`

- **Auth:** JWT required when `NODE_ENV=production` or `REQUIRE_AUTH !== 'false'`; `optionalAuth` used otherwise.  
  `src/server.ts:96–106`, `src/auth/middleware.ts`

- **Tenant context:** Required in production (`REQUIRE_TENANT_CONTEXT` or `NODE_ENV=production`); 503 if missing.  
  `src/auth/middleware.ts:63–80`

- **Env flags:** `NODE_ENV`, `REQUIRE_AUTH`, `REQUIRE_TENANT_CONTEXT`, `ALLOW_LEGACY_CERTIFIED_SOURCE`, `ALLOW_IMBALANCED_DRAFT_EXPORT`, `ENABLE_INTEGRATED_SUPERVISOR`, `CPA_ENABLED`, `AI_MOCK`, `AI_MODEL`, `LLM_PROVIDER`, `JOB_WORKER_ENABLED`, `MAX_TB_ROWS`, etc.  
  `src/lib/env.ts`, `src/lib/capability_flags.ts`, `src/server.ts`, `src/llm/provider.ts`

---

## 9) Known sharp edges / complexity

- **Reconciliation todos:** In-memory fallback when pool/tenantId missing; `disallowMemoryStoreInProduction` blocks in production.  
  `src/services/reconciliation_todos.ts`

- **Export gate:** When `ENABLE_INTEGRATED_SUPERVISOR`, `periodLabel` required for export; integrity check between resolved conflict count and ledger resolution count can log mismatch but still allow export.  
  `src/services/export_gate_service.ts:74–108`

- **Ledger hash versions:** v1 (legacy) and v2 (canonical) supported; `verifyChain` handles both.  
  `src/db/repositories/audit_ledger_repository.ts`

- **Snapshot hash:** Legacy format supported via `hashSnapshotPayloadLegacy` for verification.  
  `src/lib/snapshot_hash.js`, `src/services/ledger_snapshot_service.ts:98–99`

- **Fixed assets:** DDB/SL switch logic incomplete.  
  `src/services/fixed_asset_service.ts:217`

---

## 10) VC stage (honest answer from code)

The system is a narrow vertical demo: trial balance ingest, close sessions, JEs, audit binder, and export with integrity gates. Core flows are implemented and tested (close sessions, advance, certify, export gate, snapshot hash, request ID). Auth, tenant context, and DB are enforced in production. Several features are quarantined (supervisor, agentic JE suggestions, forensic anomalies, close coach) or stubbed (GAAP reconciliation, budget/forecasting). In-memory fallbacks exist for some services but are blocked in production. The codebase is structured for production-style deployment (migrations, env flags, logging) but the feature set is intentionally limited and non-agentic paths are favored. Functionally, this is a late prototype or early pilot: useful for a controlled close workflow, not a full product.
