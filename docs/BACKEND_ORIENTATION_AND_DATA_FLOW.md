# Backend Orientation & Data Flow

**Scope:** Backend only. No assumptions; all claims reference code (file paths, functions/classes, tests). Partial implementations are marked PARTIAL with what is missing for production.

---

## A) REPO ORIENTATION (BACKEND ONLY)

### A.1 Languages & Frameworks

| Item | Evidence |
|------|----------|
| **Language** | TypeScript only (no Python in backend). `package.json`: `"typescript": "^5.3.2"`, `"build": "tsc"`. |
| **Runtime** | Node.js ≥18. `package.json`: `"engines": { "node": ">=18" }`. |
| **HTTP** | Express 4.x. `src/server.ts`: `import express from 'express'`, `const app = express()`. |
| **Validation** | Zod. `src/schemas/request/trialBalance.ts`, `src/agents/tools/proposeTrialBalanceAdjustment.ts` (z.object, z.coerce.number, etc.). |
| **DB client** | `pg` (Postgres). `src/db/index.ts`: `import pg from 'pg'`, `new Pool(...)`. |
| **File upload** | Multer (memory). `src/routes/trial-balance/ingest.ts`: `import multer from 'multer'`, `upload.single('file')`. |
| **LLM** | Anthropic (primary), OpenAI/Mistral optional. `src/llm/provider.ts`, `src/llm/callWithFallback.ts`; `@anthropic-ai/sdk`, optional `openai`, `@mistralai/mistralai`. |
| **CSV/Excel** | `csv-parse/sync`, `xlsx`. `src/services/fileIngestion.ts`: `parse(buffer, { columns: true })`, `XLSX.read(buffer)`. |
| **PDF** | `pdf-lib` (generation). `src/services/pdf_export.ts`. Optional `pdf-parse` (devDependencies). |

---

### A.2 Service Boundaries

| Boundary | Description | Evidence |
|----------|-------------|----------|
| **API** | Single Express app; all routes under `/api/*`. | `src/server.ts`: `app.use('/api/trial-balance', trialBalanceRouter)`, etc. Mounts: trial-balance, justification, orchestrator, audit, export, knowledge-base, vector-store, ingestion, memory, integrations, pipelines, close, forecasting, capital, budget, entities, intercompany, data-quality, approvals, catalog, reporting, access, accounting-integration, ar-ap-workflows, invoice-to-books, bank-feed-matching, revenue-recognition, onboarding, tenants, stock-comp, deferred-tax, impairment, segment-reporting, business-combination, equity-method, leases, fixed-assets, eps, fx-currency, consolidation, statutory, cpa, hitl, supervisor, auth. |
| **Workers** | No dedicated worker process. Background work is in-process. | `src/services/ingestion_scheduler.ts`: `setInterval(...)` + distributed lock via `scheduler_locks`; runs only when `INGESTION_SCHEDULER_ENABLED=true`. |
| **Pipelines** | Deterministic pipeline: `runResultPipeline` (result_generator). Agentic pipeline: Supervisor ReAct loop. | `src/services/result_generator.ts`: `runResultPipeline`; `src/agents/Supervisor.ts`: ReAct (Thought → Action → Observation); `src/services/unified_orchestrator.ts`: strategy (month_end_close vs forensic), calls `runResultPipeline` or `runSupervisor`. |
| **Libraries** | Shared utils, parsers, rules. | `src/utils/decimal.ts`, `src/services/trial-balance/parser_utils.ts`, `src/services/rules_registry.ts` (reads `shared/config/financial_rules.json`). |

---

### A.3 Key Folders (Backend)

| Folder | Purpose | Key Files |
|--------|---------|-----------|
| **Ingestion** | File → raw rows. | `src/services/fileIngestion.ts` (`ingestTrialBalanceFile`, `parseCsvToTrialBalance`, `parseXlsxToTrialBalance`); `src/routes/trial-balance/ingest.ts` (POST /ingest); `src/routes/ingestion.ts` (POST /agent, POST /pipeline). |
| **Parsers** | Column normalization, TB parsing. | `src/services/trial-balance/parser_utils.ts` (`standardizeColumns`, `standardizedRowsToTrialBalanceRows`, `hasCanonicalDebitCredit`); `src/services/trialBalanceParser.ts` (`parseTrialBalance`, `parseAmount`). |
| **Classifiers** | Account/transaction mapping. | `src/services/accountClassifier.ts` (`classifyTrialBalanceDeterministic`, `classifyAccountNameWithKeyword`, keyword rules); `src/services/agentic_account_classifier.ts` (`classifyAccountsAgentic`); `src/services/agentic_ledger_to_tb.ts` (`agenticLedgerToTrialBalance`, `isMessyTrialBalance`). |
| **Rules** | Rounding, materiality, integrity. | `src/services/rules_registry.ts` (`getRoundingTolerance`, `getFinancialRules` from `shared/config/financial_rules.json`); `src/services/integrity_gate_service.ts` (`runIntegrityGate`, `detectSuspiciousPlugs`); `src/constants/codification.ts` (ASC/IAS refs). |
| **Posting / adjustments** | Unadjusted → adjusted TB; HITL merge. | `src/services/trial_balance_store_service.ts` (`saveUnadjustedFromUpload`, `saveUnadjustedFromSync`); `src/services/adjusted_trial_balance_service.ts` (`mergeAdjustmentsIntoEntries`, `getAdjustedTrialBalance`); `src/db/repositories/period_trial_balance_repository.ts`. |
| **Statements** | BS, P&L, validation. | `src/services/financialStatements.ts` (`buildValidatedStatements`, `buildBalanceSheet`, `buildProfitAndLoss`, `MathematicalIntegrityError`); `src/services/statementGenerator.ts` (`generateStatements`); `src/agents/tools/buildFinancialStatements.ts` (loads session snapshot + approved HITL, merges, then buildValidatedStatements). |
| **Audit / logging** | Append-only audit log, hash-chained ledger, export gate. | `src/services/audit_log_service.ts` (`appendAuditLog`, `queryAuditLog`); `src/services/audit_ledger_service.ts` (`recordOverride`, `verifyChain`); `src/services/export_gate_service.ts` (`checkExportGate`); `src/db/repositories/audit_log_repository.ts`, `audit_ledger_repository.ts`. |
| **Storage** | Postgres (control + tenant), in-memory fallbacks. | `src/db/index.ts` (getControlPool, getTenantPool, runTenantMigrations); `src/db/migrate.ts`; `src/db/repositories/*` (50+ repos). |

---

### A.4 Data Persistence

| Mechanism | Evidence |
|-----------|----------|
| **Postgres (control DB)** | `DATABASE_URL` → single control pool. `src/db/index.ts`: `getControlPool()`, `getTenantPool(tenantId)` (uses `tenants.database_url` for BYOD or control). Migrations: `src/db/migrate.ts` (control), `runTenantMigrations` (tenant). |
| **Tables (control / shared)** | Migrations 001–002 (initial, database_url); 010 (scheduler_locks); 051 (audit_ledger); 052 (period_export_checks); 062 (tenant_hitl_staging, tenant_supervisor_sessions); 063 (reasoning_logs); 064 (tenant_draft_adjustments). Schema: `schema_migrations` for versioning. |
| **Tables (tenant-scoped)** | 003–009, 011–050, 053–061, etc.: period_trial_balance, period_financial_data_state, close_*, lease_*, revenue_recognition, risk_context_*, audit_log (tenant_id in repo), accounting_connection, etc. Repositories: `src/db/repositories/*.ts`. |
| **In-memory fallbacks** | When `!isDbConfigured()` or no pool: HITL staging (Map in hitl_orchestrator), session state, trial_balance_store (Map in trial_balance_store_service), audit_log (array in audit_log_service), accounting connections (inMemoryStore). |
| **Files** | Config: `shared/config/financial_rules.json` (rules_registry). No generic object storage or file-based ledger in code. |
| **Queues** | No message queue (e.g. Redis/RabbitMQ). Close adjustments “queue” is DB + service: `src/services/close_adjustments_service.ts` (listAdjustments, addJeSuggestions, addAccrualSuggestions) and related repos. |

---

### A.5 Integrations

| Integration | Status | Evidence |
|-------------|--------|----------|
| **QuickBooks / Xero / NetSuite** | PARTIAL — API surface exists; adapters are **mock**. | `src/services/accounting_integration_service.ts`: `MockAccountingAdapter` for quickbooks, xero, netsuite; `syncTrialBalance`, `pushJournalEntry`, `pullTransactions` return mock data. `src/routes/accounting_integration.ts`: POST /connections, GET /connections, POST /sync-trial-balance, POST /push-journal-entry, POST /pull-transactions. **Missing:** Real OAuth and provider API clients. |
| **Bank feeds** | PARTIAL — agentic matching only. | `src/services/agentic_bank_feed_matching.ts` (`suggestBankFeedMatchesAgentic`); `src/routes/bank_feed_matching.ts` (POST with bank tx + GL/AR). No bank API connector (Plaid/Yodlee, etc.). **Missing:** Actual bank feed ingestion and persistence of matched transactions. |
| **OAuth (Google)** | PARTIAL — routes present. | `src/routes/integrations.ts`: GET /google/start, GET /google/callback; `src/services/google_oauth.ts`. **Missing:** Verification of full token exchange and usage in pipelines. |
| **Ingestion scheduler** | Optional background poll. | `src/services/ingestion_scheduler.ts`: `startIngestionScheduler()` (if INGESTION_SCHEDULER_ENABLED=true), `runAllFetchersAndIngest(tenantId)` from `ingestion_fetchers.ts`; lock via `scheduler_locks`. |

---

## B) DATA FLOW TRACE (END-TO-END)

### B.1 Input Acquisition

| Step | How data enters | Code references |
|------|------------------|------------------|
| **CSV/Excel upload** | POST `/api/trial-balance/ingest` with multipart `file`. Multer → buffer + mimetype. | `src/routes/trial-balance/ingest.ts`: `router.post('/ingest', upload.single('file'), ...)`, `ingestTrialBalanceFile(file.buffer, file.mimetype)`. |
| **File parsing** | CSV: csv-parse (columns: true). XLSX: xlsx first sheet, header row 0. Both produce `Record<string, unknown>[]`. | `src/services/fileIngestion.ts`: `parseCsvToTrialBalance(buffer)`, `parseXlsxToTrialBalance(buffer)`; `ingestTrialBalanceFile(buffer, mimeType)` routes by mime. |
| **JSON TB (no file)** | POST `/api/trial-balance/statements` with JSON body (entries). | `src/routes/trial-balance/parser.ts`: POST /statements; parses body and uses `buildValidatedStatements` / `generateStatements`. |
| **Sync from accounting** | POST `/api/accounting-integration/sync-trial-balance` (connectionId, asOfDate, periodLabel). Returns mock entries; when periodLabel+tenantId present, saves via `saveUnadjustedFromSync`. | `src/routes/accounting_integration.ts` (sync-trial-balance); `src/services/accounting_integration_service.ts` (Mock adapter); `saveUnadjustedFromSync` in trial_balance_store_service (and route import). |
| **Supervisor chat** | POST `/api/supervisor/chat` with optional `raw_rows` or `pipeline_input`. Creates session; pipeline input stored as `pipeline_input_snapshot`. | `src/routes/supervisor.ts`: body `raw_rows` or `pipeline_input`; `persistence.createSession(..., { pipelineInputSnapshot })`; `runUnifiedSupervisor`. |

---

### B.2 Normalization

| Step | How data is cleaned/standardized | Code references |
|------|----------------------------------|------------------|
| **Column names** | Variant headers (Balance, Amt, Dr, Cr) → canonical (Debit, Credit, AccountName, etc.). | `src/services/trial-balance/parser_utils.ts`: `standardizeColumns(rows)`, `CANONICAL_MAP` / variants; `standardizedRowsToTrialBalanceRows(standardized)`; `hasCanonicalDebitCredit`. |
| **Amounts** | Strings → numbers; commas stripped; parentheses = negative. | `src/services/trialBalanceParser.ts`: `parseAmount(value)`; `src/services/trial-balance/parser_utils.ts`: numeric extraction in `standardizedRowsToTrialBalanceRows`. |
| **Request validation** | Ingest body validated with Zod (tenantId, periodLabel, standard, fullSet, etc.). | `src/schemas/request/trialBalance.ts`: `ingestBodySchema`; `src/routes/trial-balance/ingest.ts`: `validateBody(ingestBodySchema)`. |
| **Typing** | Raw rows as `RawTrialBalanceRow[]` (accountName, debit, credit, accountCode?). Trial balance as `TrialBalanceResult` (entries, totalDebits, totalCredits, balances, errors). | `src/services/trialBalanceParser.ts`: `RawTrialBalanceRow`, `parseTrialBalance` → `TrialBalanceResult`; `src/types/financial.ts` (TrialBalanceEntry, etc.). |

---

### B.3 Classification / Mapping

| Step | How accounts/transactions are categorized | Code references |
|------|------------------------------------------|------------------|
| **Deterministic (keyword)** | Keyword/phrase → Asset, Liability, Equity, Revenue, Expense. | `src/services/accountClassifier.ts`: `DEFAULT_KEYWORDS`, `classifyAccountName`, `classifyTrialBalanceDeterministic`; `codificationRefForType` (ASC/IAS refs from `constants/codification.js`). |
| **Agentic (LLM)** | Optional: `classifyTrialBalance` (agentic) or `classifyAccountsAgentic`. | `src/services/accountClassifier.ts`: `classifyTrialBalance` uses `classifyAccountsAgentic` when entries; `src/services/agentic_account_classifier.ts`: `classifyAccountsAgentic`. Ingest: `useAgenticClassification` → `classifyTrialBalance(trialBalance.entries)`. |
| **Messy ledger → TB** | If `isMessyTrialBalance(rawRows)` and agentic cleanup succeeds, raw rows replaced by LLM output. | `src/routes/trial-balance/ingest.ts`: `isMessyTrialBalance`, `agenticLedgerToTrialBalance` from `src/services/agentic_ledger_to_tb.js`; fallback keeps original rawRows. |
| **Column guess (no Debit/Credit)** | When `needsAgenticMapping`, ingest can return 200 with `requiresColumnConfirmation` and `suggestedEntries`; client confirms with `confirmMapping` + `confirmedEntries`. | `src/routes/trial-balance/ingest.ts`: `ingestResult.needsAgenticMapping` → `agenticLedgerToTrialBalance` or 200 with suggestedEntries; later `body.confirmMapping` + `body.confirmedEntries`. |

---

### B.4 Suggestions (Recommended Fixes / JEs)

| Step | How suggestions are generated | Code references |
|------|-------------------------------|------------------|
| **Imbalance JE suggestions** | When ingest detects imbalance, calls `suggestJournalEntriesForImbalance` (LLM); returns array of { accountName, debit?, credit?, memo? }. | `src/routes/trial-balance/ingest.ts`: `absGt(totalDebits, totalCredits, tolerance)` → `suggestJournalEntriesForImbalance({ imbalanceAmount, totalDebits, totalCredits, unmappedRows })`; `src/services/agentic_gap_analyzer.ts`: `suggestJournalEntriesForImbalance`, `parseJournalProposals`. |
| **Gap analysis** | `analyzeGapsAgentic` (LLM): gaps with type, title, description, urgency, suggestion. | `src/services/agentic_gap_analyzer.ts`: `analyzeGapsAgentic`; used elsewhere (e.g. reconciliation/todos). |
| **Agent proposing JEs** | Supervisor tool `proposeTrialBalanceAdjustment`: debits + credits + justification → submitted to HITL staging. | `src/agents/tools/proposeTrialBalanceAdjustment.ts`: `runProposeTrialBalanceAdjustment` → `submitToStaging({ proposedAction, justification, type: 'adjustment', payload })`; `src/agents/Supervisor.ts`: tool description and recovery prompt reference this tool. |
| **CPA Bridge (deterministic)** | `executeAgentRecommendation`: standard (Lease, Revenue, FixedAsset, Tax) + params → deterministic service (e.g. computeLeaseLiability, deferred tax). Result + justification logged; not “suggestions” but executed adjustments. | `src/services/cpa_decision_handler.ts`: `executeAgentRecommendation`, `runDeterministic`; `cpa_bridge_manifest.ts`. |

---

### B.5 HITL Gating (Approval / Rejection)

| Step | How approval/rejection is represented | Code references |
|------|--------------------------------------|------------------|
| **States** | Staging item: `status` = 'pending' \| 'approved' \| 'rejected'. | `src/services/hitl_orchestrator.ts`: `StagingStatus`, `StagingItem`; `src/services/persistence_service.ts`: `StagingStatus`, table `tenant_hitl_staging` (status CHECK). |
| **Persistence** | With pool+tenantId: `persistence.createStagingItem` → `tenant_hitl_staging`. Without: in-memory Map in hitl_orchestrator. | `src/services/hitl_orchestrator.ts`: `submitToStaging` → `persistence.createStagingItem(opts.pool, opts.tenantId, itemParams)` or in-memory; `src/services/persistence_service.ts`: `createStagingItem`, `updateStagingStatus`, `listStagingItems`, `getStagingItem`. |
| **Approve / Reject** | POST `/api/hitl/resolve` (id, action: approve \| reject, reason?, signedBy?). Overrides (policy_change, flag_override) append to audit_ledger. | `src/routes/hitl.ts`: `/resolve` → `receiveHumanApproval` / `receiveHumanRejection`; `recordOverride` for override types; `src/services/hitl_orchestrator.ts`: `receiveHumanApproval`, `receiveHumanRejection` (persistence.updateStagingStatus). |
| **Resolve imbalanced ingest** | POST `/api/hitl/resolve-ingest`: stagedId + adjustment (array of { accountName, debit?, credit? }). Re-verify balance; then `saveUnadjustedFromUpload` with combined entries. | `src/routes/hitl.ts`: `/resolve-ingest`; loads staging item by stagedId, payload.kind === 'trial_balance_ingest', combines rawRows + adjustment, checks `absGt(totalDebits, totalCredits, tolerance)` → 422 else saveUnadjustedFromUpload; appendAuditLog hitl_ingest_fix; updateStagingStatus approved. |
| **List staging** | GET `/api/hitl/staging` (optional status, limit). GET `/api/hitl/staging/:id`. | `src/routes/hitl.ts`: `getStagingArea`, `getStagingItem`. |
| **Refuse statements while pending** | buildFinancialStatements tool: if any `status === 'pending'` staging items, returns error and does not build. | `src/agents/tools/buildFinancialStatements.ts`: `listStagingItems(context.pool, tenantId, { status: 'pending' })`; if length > 0, return error. |

---

### B.6 Output (Statements & Export)

| Step | How statements are produced and how export works | Code references |
|------|--------------------------------------------------|------------------|
| **Build BS + P&L** | Ingest (balanced path): `buildValidatedStatements(trialBalance, options)` → balanceSheet, profitAndLoss, classifiedEntries; throws `MathematicalIntegrityError` if (A) debits ≠ credits or (B) assets ≠ L+E. | `src/services/financialStatements.ts`: `buildValidatedStatements`, `buildFinancialStatements`, `getRoundingTolerance`; tolerance from `rules_registry`. |
| **Tool path (session)** | buildFinancialStatements tool: load session snapshot → entriesFromSnapshot; reject if pending HITL; load approved HITL → mergeAdjustmentsIntoEntries → parseTrialBalance → buildValidatedStatements. | `src/agents/tools/buildFinancialStatements.ts`: `loadSessionSnapshot`, `entriesFromSnapshot`, `listStagingItems` pending/approved, `mergeAdjustmentsIntoEntries`, `parseTrialBalance`, `buildFinancialStatementsService`. |
| **Adjusted TB (period)** | For a tenant+period: unadjusted from period_trial_balance (or rollup) + approved adjustments from HITL/close → adjusted entries. | `src/services/adjusted_trial_balance_service.ts`: `getAdjustedTrialBalance`, `getUnadjustedOrRollup`, `listAdjustments`; `mergeAdjustmentsIntoEntries`. |
| **Export PDF** | POST `/api/export/pdf`: body (cover, financial_statements, clean_ledger, etc.). If tenant+pool: checkExportGate(tenantId, pool, periodLabel); then finalIntegrityCheck(clean_ledger totals); on pass, createPdfFromStructuredPayload → buffer. | `src/routes/export.ts`: `/pdf`; `checkExportGate` from `export_gate_service.ts`; `finalIntegrityCheck` from `agents/Supervisor.ts`; `createPdfFromStructuredPayload` from `pdf_export.ts`. |
| **Export CSV** | POST `/api/export/csv`: body.clean_ledger; same gate + finalIntegrityCheck; then generateCsvWithConfidence / buildCleanLedgerWithConfidence → buffer. | `src/routes/export.ts`: `/csv`; `export_service.js` (generateCsvWithConfidence, buildCleanLedgerWithConfidence). |
| **Export gate** | checkExportGate: period_export_checks (rounding/materiality from DB only), audit_ledger verifyChain, and if ENABLE_INTEGRATED_SUPERVISOR unresolved CPA-CFA conflicts block. Drafts (tenant_draft_adjustments) never included in export. | `src/services/export_gate_service.ts`: `checkExportGate`; `getPeriodExportChecks`, `verifyChain`, `getUnresolvedConflicts`; comment on drafts. |
| **Audit log** | appendAuditLog(entry, context?) → in-memory and, if context (pool, tenantId), insert into DB via audit_log_repository. | `src/services/audit_log_service.ts`: `appendAuditLog`, `queryAuditLog`; `src/db/repositories/audit_log_repository.ts`. |
| **Audit ledger (hash chain)** | recordOverride / appendEntry → audit_ledger table (previous_entry_hash, entry_hash). verifyChain used by export gate. | `src/services/audit_ledger_service.ts`: `recordOverride`, `verifyChain`; `src/db/repositories/audit_ledger_repository.ts`: appendEntry, verifyChain. |

---

## Tests (Evidence of What Is Exercised)

| Test | What it covers | Location |
|------|----------------|----------|
| Integrity gate (kill switch) | buildValidatedStatements throws MathematicalIntegrityError for imbalanced TB; passes when balanced. | `tests/smoke/integrity_gate.test.ts` |
| Export gate | checkExportGate behavior (unit). | `tests/unit/export_gate_service.test.ts` |
| Persistence resume | appendReasoningLog, session snapshot (reasoning_logs). | `tests/smoke/persistence_resume.test.ts` |
| Sovereign validator | Ingest (messy CSV → 422 or staged), HITL resolve-ingest, justification IRAC, export (imbalanced fail, balanced PDF). | `tests/sovereign_validator.test.ts` |
| Integration validation | Auth, stock-comp, trial-balance statements validation (input validation). | `tests/integration/validation.test.ts` |

---

## Summary: Gaps for Production

1. **Integrations (QuickBooks/Xero/NetSuite):** Mock adapters only. Need real OAuth and provider API clients, error handling, and sync/push/pull semantics.
2. **Bank feeds:** Only agentic matching endpoint; no bank API connector or stored feed data.
3. **Workers:** No separate worker process; scheduler is in-process and optional. For scale, consider a job queue and dedicated workers.
4. **Object storage:** No S3/blob for file artifacts; uploads are in-memory (multer.memoryStorage). Large files and retention need a storage layer.
5. **HITL webhook:** `/api/hitl/webhook` exists for external approve/reject; production needs verified payload and idempotency.
6. **Export gate:** Reads period_export_checks and audit_ledger from DB; ensure migrations and retention policies are applied in production.
