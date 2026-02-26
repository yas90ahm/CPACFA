# Sovereign CPA Engine — Technical Summary (Implemented Reality)

Structured reference for LLM collaborators. Describes the **implemented** architecture: deterministic vs agentic layers, immutable core, data lineage, non-bypass gates, and state management. No aspirational design—code and file references only.

---

## 1. System Hierarchy

### 1.1 Core Modules (Entry Points)

| Concern | Location | Role |
|--------|----------|------|
| **Single mutation entrypoint** | `src/bridge/protocol_bridge.ts`, `src/bridge/index.ts` | All financial mutations (SaveTrialBalance, CreateDraftJE, ProposeJE, ApproveJE, PostJE, ApplyHitlAdjustmentToTrialBalance, LockPeriod) go through `executeBridgeCommand`. Zod schemas enforce strict JSON; no client-supplied math. |
| **HTTP API** | `src/server.ts`, `src/routes/*` | Mounts close, trial-balance, hitl, export, audit (binder), etc. Routes call bridge or services; never bypass gate logic. |
| **Persistence** | `src/db/index.ts`, `src/db/repositories/*`, `migrations/*` | Tenant-scoped pools, `runTenantMigrations`; no UPDATE/DELETE on audit_ledger or decision_record. |

### 1.2 Deterministic Layer (Logic, Math, Invariants)

**Canonical statement engine (totals never from LLM):**

- **`src/services/financialStatements.ts`** — `buildValidatedStatements()`, `buildBalanceSheet()`, `buildProfitAndLoss()`, `validateTrialBalanceAndBalanceSheet()`. Uses **`classifyTrialBalanceDeterministic`** from `accountClassifier.ts` unless `preClassifiedEntries` (user-confirmed overrides only) is supplied. Throws `MathematicalIntegrityError` for (A) Sum(Debits)≠Sum(Credits) or (B) Assets≠L+E.
- **`src/services/accountClassifier.ts`** — `classifyTrialBalanceDeterministic()`: keyword-based AccountType (ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE). `applyUserClassificationOverrides()`: merges user-confirmed overrides with deterministic base. **Statement build must use deterministic + user overrides only** (see comments; `classifyTrialBalance()` is legacy/suggestion path, not for statement totals).
- **`src/services/integrity_gate_service.ts`** — `runIntegrityGate()`, `assertIntegrityGateOrThrow()`, `detectSuspiciousPlugs()`. Enforces (A)/(B) and optional plug/Suspense threshold (default 0.9).
- **`src/services/integrity_check.ts`** — **Truth Gate**: `finalIntegrityCheck()` runs `runIntegrityGate` + plug detection; used before export and in certified statement build.
- **`src/services/certified_statements_service.ts`** — `buildCertifiedStatementsFromSnapshot()`: snapshot payload → `snapshotPayloadToTrialBalanceResult` → `buildValidatedStatements` → `finalIntegrityCheck`; throws `CertifiedIntegrityError` if Truth Gate fails.
- **`src/errors.ts`** — `MathematicalIntegrityError(check: 'A'|'B', imbalanceAmount, details?)`. API must return 422 with imbalance (see `audit_shared.ts`, ingest, parser, hitl).

**Period and ledger immutability:**

- **`src/services/period_lock_service.ts`** — `lockPeriod()`, `isPeriodLocked()`, `getPeriodLock()`. Backed by `src/db/repositories/period_lock_repository.ts`; table `period_locks` (tenant_id, period_label, locked_at, locked_by, reason) in `migrations/001_initial.sql`, `003_tenant_schema.sql`.
- **`src/db/repositories/audit_ledger_repository.ts`** — **Append-only**: `appendEntry()` only. No UPDATE/DELETE. `getLatestHash()`, `verifyChain()` (see §2).
- **`src/services/audit_ledger_service.ts`** — `recordOverride()`, `recordMaterialEvent()`: append to audit ledger with hash chaining; used by bridge and close flows.

**Bridge (invariants at execution):**

- **`src/bridge/protocol_bridge.ts`** — Before SaveTrialBalance: `assertPeriodNotLocked()`. Before ApplyHitlAdjustmentToTrialBalance: period not locked, balance check via `absGt(totalDebits, totalCredits, tolerance)` → `PERIOD_LOCKED` or validation. CreateDraftJE: balanced lines + provenance; PostJE: pre-post shadow audit + period lock. Every mutation triggers `recordMaterialEvent(..., 'bridge_command', ...)`.

**Ledger snapshot (certified anchor):**

- **`src/services/ledger_snapshot_service.ts`** — `createSnapshotFromTrialBalanceAndEntries()`: builds payload, `hashSnapshotPayload()` (see `src/lib/snapshot_hash.ts`), `insertLedgerSnapshot`. `verifySnapshotHash()` for tamper check.
- **`src/lib/snapshot_hash.ts`** — Canonical JSON (sorted keys, sorted entries by accountName/debit/credit/lineId/…), SHA-256. Same payload ⇒ same hash.

### 1.3 Agentic Layer (LLM Integration, Classification Suggestions, Narrative)

**AI orchestration and prompts:**

- **`src/ai/ai_orchestrator.ts`** — `runClassifier()`, `runAdvisor()`, `runJustifier()`, `runShadowAudit()`. Calls adapters with pillar-specific prompts and schemas.
- **`src/ai/adapters/claude_adapter.ts`** — LLM calls; when `AI_MOCK=true` returns deterministic JSON per pillar.
- **`src/ai/prompts/*.ts`** — classifier, advisor, justifier, shadow_auditor prompt versions and snippets.
- **`src/ai/schemas/*.ts`** — Zod/JSON schemas for classifier, advisor, justifier, shadow_auditor outputs.

**Agentic classification (suggestions only; not used for statement totals):**

- **`src/services/agentic_account_classifier.ts`** — `classifyAccountsAgentic()`: returns AccountType per line. **`assertNoNumericAmountsInAgentOutput()`** from `src/llm/guardrails.ts`: throws if agent output contains numeric amounts (debit/credit/amount). Used for **suggestions**; statement build uses deterministic + user overrides.
- **`src/services/accountClassifier.ts`** — `getClassificationSuggestions()`: deterministic base + agentic overrides (diff only). `classifyTrialBalance()`: legacy path using agentic when available; **not for statement build** (see comments).

**Other agentic services (narrative, suggestions, optional):**

- **`src/services/agentic_*.ts`** — e.g. `agentic_ingestion_classifier.ts` (same guardrail: no numeric amounts), `agentic_close_readiness.ts`, `agentic_je_suggestions.ts`, etc. Narrative and suggestions only; no path allows agent to set final financial totals.

**Journal entry and HITL:**

- **`src/services/journal_entry_service.ts`** — CreateDraftJE: `validateJEProvenance()` (every non-zero amount must have `ledger_exact` | `engine_calculation` | `human_entered`). PostJE: `runPrePostChecksAndStore()` (shadow auditor); on severity `block` throws `JournalEntryError('SHADOW_AUDIT_BLOCK')`.
- **`src/types/amount_provenance.ts`** — `validateJEProvenance()`, `validateDebitCreditLines()`: reject any non-zero amount without valid provenance. Used by JE service and HITL resolve.

---

## 2. The Immutable Core

### 2.1 Mathematical Truth (Kill Switch)

- **Check A (trial balance):** Sum(Debits) = Sum(Credits). Enforced in:
  - `financialStatements.ts`: `buildValidatedStatements()` (and `validateTrialBalanceAndBalanceSheet()`).
  - `integrity_gate_service.ts`: `runIntegrityGate()`, `assertIntegrityGateOrThrow()`.
- **Check B (balance sheet):** Total Assets = Total Liabilities + Total Equity. Same files; materiality from `getRoundingTolerance()` / `rules_registry.js` and `shared/config/financial_rules.json`.
- **Error type:** `MathematicalIntegrityError` (`src/errors.ts`). Handlers (e.g. `handleAuditOrIntegrityError` in `src/routes/audit/audit_shared.ts`, ingest, parser, hitl) return **422** with `error: 'MathematicalIntegrityError'` and message including imbalance. No silent green.

### 2.2 Period Locking

- **Schema:** `period_locks` (tenant_id, period_label, locked_at, locked_by, reason). Created in `migrations/001_initial.sql`, `003_tenant_schema.sql`.
- **Service:** `period_lock_service.ts`: `lockPeriod()`, `isPeriodLocked()`, `getPeriodLock()`. With DB and pool, uses `period_lock_repository.ts`; tenant-scoped.
- **Enforcement:** Bridge calls `assertPeriodNotLocked()` before SaveTrialBalance and ApplyHitlAdjustmentToTrialBalance; PostJE path asserts period not locked before posting. On violation: `PeriodLockedError` → bridge returns `{ ok: false, code: 'PERIOD_LOCKED' }` → routes return **409**.

### 2.3 Append-Only Audit Ledger and Hash-Chain Verification

- **Schema:** `audit_ledger` in `migrations/051_audit_ledger.sql`: id, tenant_id, period_label, event_type, deterministic_flag_snapshot, agent_dissent_snapshot, user_prompt_rationale, **previous_entry_hash**, **entry_hash**, created_at, created_by. Indexes on tenant_id, (tenant_id, created_at). **No UPDATE/DELETE** in application code.
- **Hash versions:** `079_audit_ledger_hash_version.sql` adds hash_version. **v1:** raw JSON key order. **v2 (canonical):** sorted keys + normalized ISO timestamps (`audit_ledger_repository.ts`: `canonicalizeForHash()`, `computeEntryHashV2()`). New entries use v2.
- **Append:** `appendEntry()` in `audit_ledger_repository.ts`: gets `previousEntryHash = getLatestHash(pool, tenantId)`, builds payload with previous_entry_hash and createdAt, computes entry_hash (SHA-256), INSERT only.
- **Verification:** `verifyChain(pool, tenantId)` in same repo: SELECT ordered by created_at ASC; for each row recomputes hash from payload and compares to stored entry_hash; checks previous_entry_hash links. Returns `{ valid, entryCount, latestEntryHash, brokenAtEntryId?, message? }`. Used by **export gate** and **audit binder** before allowing export or serving certified binder.

### 2.4 Certified Outputs and Ledger Snapshot

- **Certified statements source:** `audit_export_service.ts`: `getCertifiedStatementsForBinder(pool, tenantId, closeSessionId)`. If closeSessionId present, uses **`getLatestSnapshotByCloseSessionId`** (ledger_snapshot_repository); if snapshot exists, **`buildCertifiedStatementsFromSnapshot(snapshot.snapshotPayloadJson)`** (certified_statements_service). If no snapshot, fallback to last registered statement generation + Truth Gate (`finalIntegrityCheck`). Returns null if no data or Truth Gate fails → binder/export routes return **422**.
- **Snapshot hash:** `ledger_snapshot_service.ts` + `lib/snapshot_hash.ts`: payload canonicalized (sorted keys, sorted entries), SHA-256 stored in `ledger_snapshots.snapshot_hash`. `verifySnapshotHash()` compares recomputed hash to stored.

---

## 3. Data Lineage: Messy Ledger → Certified State

### 3.1 Flow (Implemented Paths)

1. **Ingest (imbalanced or balanced):**  
   `POST /api/trial-balance/ingest` or dev ingest → `fileIngestion` / `trialBalanceParser` → parsed rows. If **imbalanced**: can be staged (HITL) via `persistence_service` (tenant_hitl_staging); classifier/advisor run (agentic **suggestions**); **no write to period_trial_balance** until resolved.

2. **HITL resolve:**  
   `POST /api/hitl/resolve-ingest`: body includes adjustment lines with **amountProvenance** (e.g. human_entered). Bridge command **ApplyHitlAdjustmentToTrialBalance**: `assertPeriodNotLocked`, balance check; then `saveUnadjustedFromUpload` / merge adjustment → period_trial_balance written. **recordMaterialEvent** (e.g. bridge_command) appended.

3. **Close session and JE lifecycle:**  
   Create session → CreateDraftJE (balanced + provenance) → ProposeJE → ApproveJE → PostJE. PostJE: **runPrePostChecksAndStore** (deterministic + shadow auditor); if severity `block` → 403 SHADOW_AUDIT_BLOCK. All mutations via bridge → audit ledger entries.

4. **Period lock:**  
   `POST /api/close/period-lock` (bridge LockPeriod) → `period_locks` row; further TB/JE mutations for that period blocked (409).

5. **Certification:**  
   Close session status → locked → certified via `close_session_service.certifyCloseSession`; **recordMaterialEvent(..., 'certify_close', ...)**.

6. **Certified export / binder:**  
   Binder and certified export require **getCertifiedStatementsForBinder**: either **ledger snapshot** for close session (from `ledger_snapshots.close_session_id`) or last registered statements; in both cases **buildCertifiedStatementsFromSnapshot** or equivalent runs **finalIntegrityCheck** (Truth Gate). Export gate also runs: **verifyChain** (audit ledger), optional period_export_checks (rounding/materiality from DB only), optional unresolved CPA-CFA conflict check.

### 3.2 Validation Rules (Implemented in Code)

| Rule | Where | Effect |
|------|--------|--------|
| Trial balance balance (A) | `financialStatements.buildValidatedStatements`, `integrity_gate_service.runIntegrityGate`, `certified_statements_service.buildCertifiedStatementsFromSnapshot` | Throw MathematicalIntegrityError / CertifiedIntegrityError; API 422 |
| Balance sheet equation (B) | Same | Same |
| Rounding tolerance | `getRoundingTolerance()` (rules_registry), used in absLt/absGt in financialStatements and integrity_gate | Within tolerance treated as balanced |
| Plug/Suspense threshold | `integrity_gate_service.detectSuspiciousPlugs`, `integrity_check.finalIntegrityCheck` | If plug share ≥ 0.9 of net activity → Truth Gate fails; 422 or CertifiedIntegrityError |
| JE balance | `journal_entry_service.validateBalanced()` (create + propose) | JournalEntryError VALIDATION |
| Amount provenance | `validateJEProvenance()` (amount_provenance.ts), called in createDraftJE and HITL resolve | Reject non-zero without ledger_exact \| engine_calculation \| human_entered |
| Period locked | `assertPeriodNotLocked` in bridge (SaveTrialBalance, ApplyHitlAdjustmentToTrialBalance, PostJE path) | 409 PERIOD_LOCKED |
| Shadow audit block | `runPrePostChecksAndStore` → severity 'block' | 403 SHADOW_AUDIT_BLOCK |
| Export gate | `export_gate_service.checkExportGate`: chain valid, period_export_checks (no client materiality), optional conflicts | 403 with CRITICAL_TAMPER_ALERT or UNRESOLVED_CONFLICTS_ALERT |
| Certified session for binder | `audit_binder.requireCertifiedSession`: session.status === 'certified' | 403 if not certified |
| No numeric amounts in agent output | `llm/guardrails.assertNoNumericAmountsInAgentOutput` in agentic_account_classifier, agentic_ingestion_classifier | Throw; prevents AI from emitting debit/credit/amount |

---

## 4. Non-Bypass Gates (AI Cannot Override Deterministic Totals)

- **Statement build always uses deterministic classification or user-confirmed overrides:**  
  `financialStatements.buildFinancialStatements()` / `buildValidatedStatements()` use `classifyTrialBalanceDeterministic(entries)` unless `preClassifiedEntries` is provided with **same length** as entries; preClassifiedEntries are intended from **applyUserClassificationOverrides** (user-confirmed), not raw agentic. `statementGenerator.ts` and `certified_statements_service.ts` use the same pattern. So **totals are never derived from unchecked LLM output**.

- **Register and serve only validated statements:**  
  `audit_export_service.registerStatementGeneration()` calls **validateTrialBalanceAndBalanceSheet** before persisting; **getCertifiedStatementsForBinder** returns statements only after **buildCertifiedStatementsFromSnapshot** (which runs Truth Gate) or after **finalIntegrityCheck** on stored statements. So **no unvalidated financials are stored or served**.

- **Agent cannot inject numbers:**  
  **assertNoNumericAmountsInAgentOutput** (guardrails.ts) used in agentic_account_classifier and agentic_ingestion_classifier; any numeric amount in agent output throws. JE and HITL amounts require **amountProvenance** (ledger_exact | engine_calculation | human_entered); agent suggestions must be passed through HITL with human-entered provenance to become part of the ledger.

- **Export and binder paths:**  
  Export gate runs **verifyChain** and (when applicable) reads materiality from **period_export_checks** only; **audit_binder** and export routes reject client-supplied **roundingGapExceedsMateriality** / **aggregateRoundingExceedsMateriality** (tampering attempt). Certified binder requires **getCertifiedStatementsForBinder**; no shortcut around snapshot or Truth Gate.

- **Bridge as single mutation path:**  
  All TB save, JE lifecycle, HITL apply, and period lock go through **executeBridgeCommand**; period lock and balance checks are enforced there before calling services. No route writes financial state without going through the bridge or equivalent gate (e.g. ingest uses buildValidatedStatements and MathematicalIntegrityError before persisting balanced state).

---

## 5. Tech Stack and State Management

### 5.1 Primary Stack

- **Languages:** TypeScript (Node) for backend (src/). Python in `connectors/` for ERP/MCP adapters; optional.
- **Runtime:** Node; ESM.
- **Database:** PostgreSQL. Tenant-scoped schema/tables via migrations (e.g. `runTenantMigrations` in db/index.ts); control DB when `database_url` is null for tenant.
- **API:** Express; JWT auth; tenant from auth or (for some routes) body/header; `getTenantPool` / `getTenantPoolWithMigrations` for pool.

### 5.2 Where Financial Truth Lives

- **Period trial balance:** Written by bridge (SaveTrialBalance, ApplyHitlAdjustmentToTrialBalance) and ingestion after validation; tables from tenant migrations (e.g. period_trial_balance, tenant_hitl_staging).
- **Journal entries:** `journal_entries`, `journal_entry_lines` (with amount_provenance); lifecycle and posting via bridge + journal_entry_service.
- **Close state:** `close_sessions`, checklist, period_locks, certify; status transitions in close_session_service.
- **Certified output:** `ledger_snapshots` (snapshot_payload_json, snapshot_hash, close_session_id); statement_package / statement_registry for last registered generation. Binder and certified export read from **getCertifiedStatementsForBinder** (snapshot-first, then registered + Truth Gate).

### 5.3 Guarding Against Corruption

- **Audit ledger:** Append-only; hash-chained; **verifyChain** before export/binder. No application UPDATE/DELETE on audit_ledger.
- **Ledger snapshots:** Hash stored with payload; **verifySnapshotHash**; immutable insert.
- **Period lock:** Prevents further TB/JE mutations for that period once locked.
- **Materiality and export flags:** Read from **period_export_checks** (DB) only; client cannot set roundingGapExceedsMateriality/aggregateRoundingExceedsMateriality for export gate.
- **Production:** `disallowMemoryStoreInProduction` used for period lock and similar; in production, durable DB required for these stores.

---

## Document Metadata

- **Scope:** Backend (src/, migrations, shared config). Frontend and connectors only where they touch the above contracts.
- **Philosophy:** Sovereign CPA Engine — deterministic layer is the source of truth; agentic layer suggests and narrates; gates ensure no bypass of (A), (B), period lock, provenance, or chain integrity.
