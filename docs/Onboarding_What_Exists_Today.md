====================================================
1. WHAT THIS SYSTEM DOES (today, factually)
====================================================

If you run this project locally, there are three runnable servers that expose concrete behaviors:

- Node/Express API (TypeScript) via `npm run dev` (entry: `src/server.ts`)
  - Serves a large `/api/*` surface.
  - Concrete outcomes you can get:
    - Upload or submit a trial balance and receive Balance Sheet + P&L (and optionally cash flow / equity changes / notes).
    - Store/retrieve trial balances by period label, compute an adjusted trial balance from posted adjustments, and regenerate statements from that adjusted state.
    - Create/list/resolve HITL staging items (approve/reject).
    - Generate an audit binder JSON and export it as PDF/CSV (binder exports are reachable under `/api/audit/...`).
    - Run supervisor chat endpoints that return structured “agent” responses and (optionally) session traces.
    - Run close endpoints (period lock, close package exports, closing entries).
    - Register/authenticate users (JWT) when a Postgres DB is configured.

- Python/Flask API via `python backend/app.py` (entry: `backend/app.py`)
  - Concrete outcomes you can get:
    - Post a trial balance to `/api/math/trial-balance` and receive trial balance + balance sheet + validation (with a dedicated 422 error for math integrity failures).
    - Ask a justification question via `/api/justify` and receive a structured citation/explanation payload.
    - Post to `/api/math/dcf` for a DCF valuation response (present in code).
    - Depreciation schedule endpoint exists (present in code: `/api/depreciation/schedule`).

- Frontend (Next.js) via `cd frontend && npm run dev`
  - Contains pages that call the Node API for login/register and various feature screens (based on frontend scan). The UI is not the system of record; the Node API is.

====================================================
2. CORE USER WORKFLOWS (end-to-end)
====================================================

### Workflow 1 — Upload TB file → get statements (Node)
- Entry point (route/API/CLI)
  - `POST /api/trial-balance/ingest` (`src/routes/trial-balance/ingest.ts`)
- What inputs it accepts
  - Multipart file `file` (CSV/XLSX) + request body fields validated by `ingestBodySchema` (`src/schemas/request/trialBalance.js`).
- What processing happens
  - File → `ingestTrialBalanceFile()` (`src/services/fileIngestion.js`) → rows
  - Rows → `parseTrialBalance()` (`src/services/trialBalanceParser.js`) → `TrialBalanceResult`
  - Optional: messy-TB cleanup via `agenticLedgerToTrialBalance()` (`src/services/agentic_ledger_to_tb.js`) when `isMessyTrialBalance(...)` returns true (called inside `ingest.ts`)
  - Classification:
    - Default: deterministic via `classifyTrialBalanceDeterministic()` (`src/services/accountClassifier.ts`, used by `buildFinancialStatements()` in `src/services/financialStatements.ts`)
    - Optional: agentic via `classifyTrialBalance()` (`src/services/accountClassifier.ts`) if `useAgenticClassification` is true
  - Statements built via:
    - `generateStatements()` (`src/services/statementGenerator.ts`) when a `standard` path is used, OR
    - `buildValidatedStatements()` (`src/services/financialStatements.ts`)
  - Hard invariant enforcement:
    - `MathematicalIntegrityError` thrown for Check A (debits vs credits) and Check B (A = L + E) in `buildValidatedStatements()` and `validateTrialBalanceAndBalanceSheet()`
- What outputs are returned
  - JSON including `trialBalance`, `balanceSheet`, `profitAndLoss`, `reasoningChain`, and additional fields (cash flow / equity changes / notes when `fullSet`), plus audit-related URLs in the response.
- What services/modules are involved
  - `src/routes/trial-balance/ingest.ts`
  - `src/services/fileIngestion.ts`, `trialBalanceParser.ts`, `financialStatements.ts`, `statementGenerator.ts`, `accountClassifier.ts`
  - `src/services/agentic_plan_execute_verify.ts` (reasoningChain), `src/services/hitl_orchestrator.ts` (optional escalation), `src/services/audit_export_service.ts` (register statement generation)

### Workflow 2 — Submit TB JSON → get statements (Node)
- Entry point
  - `POST /api/trial-balance/statements` (`src/routes/trial-balance/parser.ts`)
- What inputs it accepts
  - JSON body validated by `statementsBodySchema` (`src/schemas/trialBalanceSchemas.js`) including `entries` and optional metadata (entity, jurisdiction, standard, etc.)
- What processing happens
  - `parseTrialBalance(entries)` → statements via `generateStatements()` or `buildValidatedStatements()` (same kill-switch model)
  - If standard cannot be inferred, route returns `400` with an “inferredStandard” payload (present in handler)
- What outputs are returned
  - JSON statements payload (same family as ingest path)
- What services/modules are involved
  - `src/routes/trial-balance/parser.ts`, plus the same core services as Workflow 1

### Workflow 3 — Register statements → get audit binder → export binder PDF/CSV (Node)
- Entry point
  - `POST /api/audit/register-statements` (`src/routes/audit/audit_binder.ts`)
  - `GET /api/audit/binder`
  - `GET /api/audit/binder/export/pdf`
  - `GET /api/audit/binder/export/csv`
- What inputs it accepts
  - Register: JSON validated by `registerStatementsBodySchema` (`src/schemas/auditSchemas.js`)
  - Binder requests: query params (`periodStart`, `periodEnd`, `entityName`) are read from request
- What processing happens
  - `registerStatementGeneration()` (`src/services/audit_export_service.ts`) persists latest statement generation to tenant DB when `tenantId/pool` exist, else keeps an in-memory last generation
  - `buildAuditBinder()` (`src/services/audit_export_service.ts`) bundles statements + line-level deep links
  - `exportAuditBinderToPdf()` / `exportAuditBinderToCsv()` produce buffers
  - Kill-switch enforcement exists inside audit binder builder (calls `validateTrialBalanceAndBalanceSheet()` before returning financials)
- What outputs are returned
  - Binder JSON or exported PDF/CSV buffers
- What services/modules are involved
  - `src/routes/audit/audit_binder.ts`
  - `src/services/audit_export_service.ts`
  - `src/services/audit_binder_export_service.ts`

### Workflow 4 — Store/retrieve TB by period + compute adjusted TB (Node)
- Entry point
  - `GET /api/trial-balance/period/:periodLabel`
  - `GET /api/trial-balance/period/:periodLabel/adjusted`
  - `GET /api/trial-balance/period/:periodLabel/statements`
  - Implemented in `src/routes/trial-balance/parser.ts`
- What inputs it accepts
  - `periodLabel` path param, optional query for statement generation
- What processing happens
  - Fetch unadjusted TB via `getUnadjustedOrRollup()` (`src/services/trial_balance_rollup_service.js`)
  - Compute adjusted TB via `getAdjustedTrialBalance()` (`src/services/adjusted_trial_balance_service.ts`), which merges unadjusted entries with posted adjustments from `listAdjustments()` (`src/services/close_adjustments_service.js`)
- What outputs are returned
  - Period TB payload, adjusted entries, or statements built from adjusted entries
- What services/modules are involved
  - `src/routes/trial-balance/parser.ts`
  - `src/services/adjusted_trial_balance_service.ts`, `trial_balance_rollup_service.ts`, `close_adjustments_service.ts`

### Workflow 5 — Human-in-the-loop staging + resolution (Node)
- Entry point
  - `POST /api/hitl/staging`, `GET /api/hitl/staging`, `GET /api/hitl/staging/:id`
  - `POST /api/hitl/resolve`, `POST /api/hitl/webhook`
  - Implemented in `src/routes/hitl.ts`
- What inputs it accepts
  - `staging`: `{ proposedAction, justification, type?, amount?, payload? }`
  - `resolve`: `{ id, action: 'approve'|'reject', reason?, signedBy? }`
  - `webhook`: `{ id, signal: 'HumanApproved'|'HumanRejected', rejectionReason? ... }`
- What processing happens
  - Uses `hitl_orchestrator` service functions (`submitToStaging`, `receiveHumanApproval`, `receiveHumanRejection`, etc.)
  - For override types `policy_change` and `flag_override`, approvals/rejections append an entry to the audit ledger via `recordOverride()` (`src/services/audit_ledger_service.ts`)
- What outputs are returned
  - Staging items list/details; resolved item status updates
- What services/modules are involved
  - `src/routes/hitl.ts`
  - `src/services/hitl_orchestrator.ts`
  - `src/services/audit_ledger_service.ts`

### Workflow 6 — Python TB math validation (Python)
- Entry point
  - `POST /api/math/trial-balance` (`backend/app.py`)
- What inputs it accepts
  - JSON `{ coa: [...], entries: [...], as_of?: ... }`
- What processing happens
  - `_run_trial_balance_math(body)` in `backend/app.py`
  - On `MathematicalIntegrityError`, returns 422 via `_math_integrity_422()`
- What outputs are returned
  - JSON trial balance + balance sheet + validation
- What services/modules are involved
  - `backend/app.py` plus imported `accounting_engine` functions/classes

====================================================
3. MAIN SUBSYSTEMS
====================================================

### Server & routing (Node)
- purpose
  - Express app, mounts routers, enforces auth/tenant context, starts migrations and scheduler.
- key files
  - `src/server.ts`
- how it connects to others
  - Mounts `/api/trial-balance`, `/api/audit`, `/api/hitl`, `/api/close`, `/api/supervisor`, `/api/auth`, etc.
- whether it looks production-real or experimental
  - Production-oriented server scaffolding exists (helmet, CORS, rate limit, readiness route, error handler). Auth behavior is controlled by env flags in code.

### Parsing & ingestion
- purpose
  - Read TB from CSV/XLSX, normalize into `TrialBalanceResult`.
- key files
  - `src/services/fileIngestion.ts`
  - `src/services/trialBalanceParser.ts`
  - `src/routes/trial-balance/ingest.ts`
  - `src/routes/trial-balance/parser.ts`
- how it connects to others
  - Feeds classification + statement generator.
- whether it looks production-real or experimental
  - Deterministic parsing is present; an additional “agentic cleanup” path exists for messy inputs (invoked conditionally).

### Classification
- purpose
  - Assign account types (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE) and codification refs.
- key files
  - `src/services/accountClassifier.ts`
  - `src/routes/trial-balance/classification.ts`
- how it connects to others
  - Used by statement build; suggestions can be generated agentically.
- whether it looks production-real or experimental
  - Deterministic classification is implemented via keyword rules; agentic classifier is also callable.

### Financial statements engine
- purpose
  - Build Balance Sheet and P&L lines and totals from classified TB entries.
- key files
  - `src/services/financialStatements.ts`
  - `src/services/statementGenerator.ts`
- how it connects to others
  - Called by TB ingest/statements routes; also used by audit binder registration.
- whether it looks production-real or experimental
  - Deterministic core with explicit invariant checks that throw.

### Math/integrity enforcement
- purpose
  - Enforce “hard” checks (TB balances; BS equation; plug detection) and run an integrity gate.
- key files
  - `src/services/financialStatements.ts`
  - `src/services/integrity_gate_service.ts`
- how it connects to others
  - Used in statement generation and audit binder paths.
- whether it looks production-real or experimental
  - Deterministic enforcement primitives exist and are referenced from multiple workflows.

### LLM/agentic services
- purpose
  - Provide agentic classification, narratives, reasoning chains, supervisor chat orchestration.
- key files (examples observed wired into core routes)
  - `src/services/agentic_plan_execute_verify.ts`
  - `src/services/agentic_quality_assessor.ts`
  - `src/services/standard_inference_agentic.ts`
  - `src/services/transaction_classifier.ts`
  - `src/services/agentic_account_classifier.ts`
  - `src/services/agentic_ledger_to_tb.ts`
  - `src/routes/supervisor.ts`
- how it connects to others
  - Augments or influences classification (when enabled), reasoningChain output, and some ancillary outputs (narratives, assessments).
- whether it looks production-real or experimental
  - These modules are callable and routes return their outputs; behavior depends on configured model providers and environment.

### Audit trail & binder
- purpose
  - Persist and bundle statement generations and links; export binder.
- key files
  - `src/services/audit_export_service.ts`
  - `src/routes/audit/audit_binder.ts`
- how it connects to others
  - TB ingest registers statement generation; binder reads latest generation and exports.
- whether it looks production-real or experimental
  - Supports tenant DB persistence when pool/tenantId exists; otherwise uses an in-memory “last generation” variable.

### HITL
- purpose
  - Store approval/rejection decisions and stage items for review.
- key files
  - `src/routes/hitl.ts`
  - `src/services/hitl_orchestrator.ts`
  - `src/services/audit_ledger_service.ts`
- how it connects to others
  - TB ingest may submit staging items; HITL resolution may record audit ledger overrides.
- whether it looks production-real or experimental
  - Route + service layer exists; persistent backing depends on tenant pool/DB context.

### Integrations
- purpose
  - Manage connections, sync TB, push journal entries, pull transactions.
- key files
  - `src/routes/accounting_integration.ts`
  - `src/services/accounting_integration_service.ts`
  - `src/services/trial_balance_store_service.ts`
- how it connects to others
  - Sync can write unadjusted TB; push-journal-entry can send entries to external providers.
- whether it looks production-real or experimental
  - Endpoints and service calls exist; provider behavior depends on connectors/credentials configuration.

### Frontend (Next.js)
- purpose
  - Web UI calling Node API endpoints.
- key files
  - Under `frontend/`
- how it connects to others
  - Calls Node API at `http://localhost:3001` by default (env-driven in frontend).
- whether it looks production-real or experimental
  - Frontend exists and calls APIs; exact completeness varies by page.

====================================================
4. WHAT IS DETERMINISTIC VS AI-DRIVEN
====================================================

Deterministic (math/rules/code only):
- `src/services/fileIngestion.ts`
- `src/services/trialBalanceParser.ts`
- `src/services/accountClassifier.ts` (deterministic classifier: `classifyTrialBalanceDeterministic`, `applyUserClassificationOverrides`)
- `src/services/financialStatements.ts` (build + kill-switch checks)
- `src/services/statementGenerator.ts` (standard-aware build + calls `validateTrialBalanceAndBalanceSheet`)
- `src/services/integrity_gate_service.ts` (hard gate + plug detection)
- `src/services/adjusted_trial_balance_service.ts` (merge adjustments into TB deterministically)
- Python endpoints visible in code:
  - `backend/app.py` `/api/math/trial-balance`
  - `backend/app.py` `/api/depreciation/schedule`

LLM/agentic driven:
- `src/services/agentic_plan_execute_verify.ts`
- `src/services/agentic_quality_assessor.ts`
- `src/services/standard_inference_agentic.ts`
- `src/services/transaction_classifier.ts` (`classifyTransactionsAgentic`)
- `src/services/agentic_account_classifier.ts` (via `classifyAccountsAgentic`)
- `src/services/agentic_ledger_to_tb.ts`
- `src/routes/supervisor.ts`

Where AI can influence outputs:
- Trial balance classification can be agentic if `useAgenticClassification` is enabled in request bodies (`src/routes/trial-balance/ingest.ts`, `src/routes/trial-balance/parser.ts`).
- Transactions categorization and several narrative/assessment fields returned by ingest/statements routes are agentic-driven when those options are used.
- `reasoningChain` included in statement responses is generated via an agentic service.

====================================================
5. WHAT PRODUCES FINANCIAL STATEMENTS
====================================================

Primary statement builders:

- `buildValidatedStatements(trialBalanceResult, options?)` in `src/services/financialStatements.ts`
  - Throws `MathematicalIntegrityError` if:
    - Check A fails: debits vs credits
    - Check B fails: assets vs liabilities + equity
  - Calls:
    - `buildFinancialStatements()` → `buildBalanceSheet()` and `buildProfitAndLoss()`

- `generateStatements(trialBalanceResult, standard, options)` in `src/services/statementGenerator.ts`
  - Builds BS/P&L and then calls:
    - `validateTrialBalanceAndBalanceSheet(...)` (from `src/services/financialStatements.ts`) which throws `MathematicalIntegrityError` on failure

Where invariants are checked / failures are thrown:
- `src/services/financialStatements.ts`
  - `buildValidatedStatements()` throws `MathematicalIntegrityError` (check ‘A’ or ‘B’)
  - `validateTrialBalanceAndBalanceSheet()` throws `MathematicalIntegrityError`
- `src/services/statementGenerator.ts`
  - Calls `validateTrialBalanceAndBalanceSheet(...)` before returning statements

All paths that can return statements:
- Node routes:
  - `POST /api/trial-balance/ingest`
  - `POST /api/trial-balance/statements`
  - `GET /api/trial-balance/period/:periodLabel/statements`
- Python route:
  - `POST /api/math/trial-balance`

====================================================
6. WHAT CAN MODIFY THE BOOKS
====================================================

Trial balance writes (persist unadjusted TB):
- From file upload:
  - `src/routes/trial-balance/ingest.ts` (when `periodLabel` is provided) calls `saveUnadjustedFromUpload(...)` (`src/services/trial_balance_store_service.ts`)
- From ERP sync:
  - `POST /api/accounting-integration/sync-trial-balance` (`src/routes/accounting_integration.ts`)
    - Calls `syncTrialBalance(...)` then `saveUnadjustedFromSync(...)` when `periodLabel` is provided

Adjustments / journal-entry-like writes (stored as close adjustments):
- Repository/service paths exist (per repo scan):
  - `src/db/repositories/close_adjustment_repository.ts`
  - `src/services/close_adjustments_service.ts`
- Adjusted TB is computed from unadjusted TB + posted adjustments:
  - `getAdjustedTrialBalance()` in `src/services/adjusted_trial_balance_service.ts`

Posting to an external GL:
- Route exists:
  - `POST /api/accounting-integration/push-journal-entry` (`src/routes/accounting_integration.ts`) calls `pushJournalEntry(...)` in `src/services/accounting_integration_service.ts`

Automated vs requires human approval (as implemented in observed routes):
- Automated:
  - Writing unadjusted TB from upload/sync occurs in route handlers when period label and tenant context are present.
  - Adjusted TB computation is deterministic and happens on read (`getAdjustedTrialBalance()` merges posted adjustments).
- Human approval:
  - HITL staging/resolve endpoints implement approve/reject flows in `src/routes/hitl.ts`.
  - Overrides of certain staging item types append audit ledger entries via `recordOverride()`.

====================================================
7. DATA FLOW (simple diagram in text)
====================================================

File/JSON Trial Balance
→ (`ingestTrialBalanceFile` / `parseTrialBalance`)
→ classification (`classifyTrialBalanceDeterministic` by default; agentic classification optional)
→ optional period persistence (`saveUnadjustedFromUpload` / `saveUnadjustedFromSync`)
→ adjustments applied on read (`getAdjustedTrialBalance` merges posted adjustments)
→ statements (`generateStatements` or `buildValidatedStatements`)
→ invariant check (`validateTrialBalanceAndBalanceSheet` / throws `MathematicalIntegrityError`)
→ outputs:
  - API JSON statements response
  - audit binder JSON/PDF/CSV (after `registerStatementGeneration`)
  - HITL staging records and audit ledger entries (when escalated/resolved)

====================================================
8. WHAT LOOKS UNUSED / EXPERIMENTAL / DECORATIVE
====================================================

- `src/routes/export.ts` exists but is not mounted in `src/server.ts`
  - `src/server.ts` imports `exportRouter` but there is no `app.use('/api/export', exportRouter)` present in the file, so `/api/export/*` routes are not reachable from that server as currently wired.
- In-memory fallback storage exists for statement registry
  - `src/services/audit_export_service.ts` keeps `lastStatementGeneration` in memory when `pool/tenantId` are not provided.
- Large number of “agentic” service modules exist
  - The repo contains many `src/services/agentic_*` modules; only a subset is directly invoked in the statement ingestion/build routes (agentic PEV, quality assessor, standard inference, transaction classification, messy TB conversion).

====================================================
9. SIMPLE SUMMARY FOR A NEW ENGINEER
====================================================

- The main backend is the Node/Express API in `src/server.ts` (`npm run dev`, default port 3001).
- There is also a Python/Flask API in `backend/app.py` (default port 5000) that exposes `/api/math/trial-balance` and other endpoints.
- The clearest end-to-end core flow is trial balance → Balance Sheet + P&L, via `/api/trial-balance/ingest` (file) or `/api/trial-balance/statements` (JSON).
- Statement building is deterministic (`src/services/financialStatements.ts`, `src/services/statementGenerator.ts`) with explicit `MathematicalIntegrityError` throws when invariants fail.
- The system supports period-labeled storage of unadjusted trial balance and computation of an adjusted trial balance by merging posted adjustments (`src/services/adjusted_trial_balance_service.ts`).
- HITL staging exists (`src/routes/hitl.ts`) and can record audit ledger overrides when certain staged items are approved/rejected.
- Audit binder routes exist under `/api/audit/*`, including binder export to PDF/CSV.
- Several fields returned by TB routes are produced by agentic services (reasoning chain, narratives, assessments), and classification can optionally be agentic.
- `src/routes/export.ts` exists but is not currently mounted in `src/server.ts`, so `/api/export/*` is not reachable from that server as written.

