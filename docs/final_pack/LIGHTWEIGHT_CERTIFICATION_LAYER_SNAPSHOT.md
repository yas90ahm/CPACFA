# Sovereign CPA Engine — Implementation Snapshot (Lightweight Deterministic Certification Layer)

**Purpose:** Concise, precise snapshot of **implemented reality** for refining the system into a lightweight, infrastructure-style deterministic certification layer. No intended design; code and schema only.

---

## 1️⃣ Entry Points

### Main API endpoints (certification-relevant)

| Area | Path | Method | Role |
|------|------|--------|------|
| Trial balance | `/api/trial-balance/ingest` | POST | Upload CSV/XLSX → TB; balance check → persist or stage |
| HITL | `/api/hitl/resolve-ingest` | POST | Apply human adjustment to staged imbalanced TB; provenance required |
| HITL | `/api/hitl/staging` | GET/POST | List/create staging items; approve/reject via webhook |
| Close | `/api/close/sessions` | POST/GET | Create/list close sessions |
| Close | `/api/close/sessions/:id` | GET | Get one session |
| Close | `/api/close/sessions/:id/status` | PATCH | Update status (draft → … → locked) |
| Close | `/api/close/sessions/:id/certify` | POST | Certify close (approver only) |
| Close | `/api/close/period-lock` | POST | Lock period (approver) |
| Close | `/api/close/journal-entries` | * | Create/propose/approve/post JEs |
| Export | `/api/export/pdf`, `/api/export/csv` | POST | PDF/CSV; body has exportMode 'draft' \| 'certified' |
| Audit binder | `/api/audit/binder`, `/api/audit/binder/export/pdf|csv` | GET | Certified-only; requires closeSessionId, session.status === 'certified' |
| COA | `/api/coa-mapping/rules`, `/api/coa-mapping/map` | GET/POST | Taxonomy, rules, map accounts → FS lines |

Mounts: `src/server.ts` — trial-balance, audit, export, hitl, close (aggregate of close_*.ts), coa-mapping, etc.

### Typical flow: TB upload → certification

1. **Upload TB**  
   `POST /api/trial-balance/ingest` (multipart file + body: periodLabel, entityId, …).  
   **Modules:** `routes/trial-balance/ingest.ts` → `fileIngestion` / `trialBalanceParser` → balance check (`absGt(totalDebits, totalCredits, tolerance)` from `getRoundingTolerance()`).

2. **If imbalanced**  
   Staging item created (`persistence_service.createStagingItem`) with payload.kind `trial_balance_ingest`; response `status: 'staged', stagedId`. No write to `period_trial_balance`.  
   **If balanced**  
   Period lock checked (`assertPeriodNotLocked`), then either `runResultPipeline` / `buildValidatedStatements` and persist (e.g. `saveUnadjustedFromUpload` via trial_balance_store_service → period_trial_balance_repository.upsertUnadjusted), or other ingest path. Ingest route can also call classifier/advisor (AI); balance path does not depend on AI.

3. **Resolve staged imbalance (if any)**  
   `POST /api/hitl/resolve-ingest` with `stagedId` and `adjustment[]` (provenance required).  
   **Modules:** `routes/hitl.ts` → `validateAdjustmentProposals` (amount_provenance) → balance check on combined (staged rawRows + adjustment) → Shadow Auditor → `executeBridgeCommand(ApplyHitlAdjustmentToTrialBalance)` → `protocol_bridge` → `saveUnadjustedFromUpload` + `persistence.updateStagingStatus(approved)`.

4. **Close session and lock**  
   `POST /api/close/sessions` (create), `PATCH /api/close/sessions/:id/status` to advance to locked, `POST /api/close/period-lock` (approver).  
   **Modules:** `close_session_service`, `period_lock_service` (DB: `period_locks` when pool/tenantId present).

5. **Certify**  
   `POST /api/close/sessions/:id/certify` (approver only; session must be locked, no hard blockers).  
   **Modules:** `close_session_service.certifyCloseSession` → `close_session_repository.updateCertification` (status = 'certified', certified_by, certified_at, certification_memo) + `recordMaterialEvent(..., 'certify_close')`.

6. **Export (certified)**  
   `POST /api/export/pdf` with `exportMode: 'certified'`, `closeSessionId`, body (financial_statements, clean_ledger, …). Or GET `/api/audit/binder?closeSessionId=...` (certified-only).  
   **Modules:** Export: `routes/export.ts` → `checkExportGate` → `finalIntegrityCheck`; Binder: `routes/audit/audit_binder.ts` → `requireCertifiedSession` → `runBinderExportGates` (checkExportGate + finalIntegrityCheck) → build binder.

### Modules/services on the path (TB → certify → export)

- **Ingest:** `fileIngestion`, `trialBalanceParser`, `persistence_service` (staging), `trial_balance_store_service`, `period_trial_balance_repository`, `period_lock_service`, `financialStatements.buildValidatedStatements`, `result_generator`, `bridge` (ApplyHitlAdjustmentToTrialBalance).
- **Close:** `close_session_service`, `close_session_repository`, `close_checklist_readiness_service`, `period_lock_service`, `period_lock_repository`, `segregation_service`.
- **Certification gate:** `export_gate_service.checkExportGate`, `integrity_check.finalIntegrityCheck`, `integrity_gate_service.runIntegrityGate`, `audit_ledger_repository.verifyChain`, `period_export_checks_repository`.
- **Export/binder:** `export_service`, `pdf_export`, `audit_export_service`, `statement_package_service`, `getAdjustedTrialBalance`, `buildValidatedStatements`.

---

## 2️⃣ Core Deterministic Logic

### Balance checks

- **Trial balance (debits = credits):**  
  `src/services/integrity_gate_service.ts` — `runIntegrityGate()`:
  - `getTrialBalanceTotals(input.trialBalance)` then `absGt(totalDebits, totalCredits, tolerance)`.
  - Tolerance from `getToleranceForGate()` → `shared/config/financial_rules.json` (roundingTolerance or equation toleranceKey).
- **Same numeric check** used in:
  - `src/routes/trial-balance/ingest.ts` (before persist vs stage).
  - `src/routes/hitl.ts` resolve-ingest (combined totals vs tolerance); 422 if still imbalanced.
  - `src/bridge/protocol_bridge.ts` ApplyHitlAdjustmentToTrialBalance (combined totals; return error if not balanced).
- **Throw form:** `assertIntegrityGateOrThrow()` in `integrity_gate_service.ts` throws `MathematicalIntegrityError` with imbalance amount; used where 422 is required.

```ts
// integrity_gate_service.ts (excerpt)
const trialBalanceGapExceeds = absGt(totalDebits, totalCredits, tolerance);
const trialBalanceBalances = !trialBalanceGapExceeds;
// ...
const passed = trialBalanceBalances && balanceSheetBalances;
```

### Accounting equation (Assets = Liabilities + Equity)

- **Same file:** `runIntegrityGate()`:
  - `rhs = totalLiabilities + totalEquity`; `balanceSheetGapExceeds = absGt(totalAssets, rhs, tolerance)`.
- **Used by:** `finalIntegrityCheck` (integrity_check.ts), which is called by export and audit binder before certified output.

### Certification gating

- **Export (certified):**  
  `src/routes/export.ts`: when `exportMode === 'certified'`, calls `checkExportGate({ tenantId, pool, periodLabel })`. If `!gateResult.allowed`, responds 403 with gate alert/message. Then `finalIntegrityCheck(...)` on body’s clean_ledger and balance sheet; if `!finalCheck.passed`, 422 FINAL_INTEGRITY_CHECK_FAILED.
- **Binder:**  
  `src/routes/audit/audit_binder.ts`: `requireCertifiedSession()` enforces query `closeSessionId` and `session.status === 'certified'` (403 CLOSE_NOT_CERTIFIED otherwise). Then `runBinderExportGates()` → `checkExportGate()` then `finalIntegrityCheck()` on stored/last statement generation; 403/422 on failure.

```ts
// audit_binder.ts (excerpt)
if (session.status !== 'certified') {
  res.status(403).json({
    error: 'Close not certified',
    code: 'CLOSE_NOT_CERTIFIED',
    message: 'Binder is certified-only. Session must have status certified. ...',
  });
  return null;
}
```

### Period locking

- **Implementation:**  
  `src/services/period_lock_service.ts`: `lockPeriod`, `isPeriodLocked`, `assertPeriodNotLocked`. With DB: `period_lock_repository` (table `period_locks`: tenant_id, period_label, locked_at, locked_by, reason; PK (tenant_id, period_label)). Without pool: in-memory `Map` (production disallows via `disallowMemoryStoreInProduction`).
- **Assert (no mutation on locked period):**  
  `assertPeriodNotLocked(periodLabel, tenantId, pool)` throws `PeriodLockedError` if locked. Called from:
  - `trial-balance/ingest.ts` (before persisting balanced TB).
  - `trial-balance/parser.ts`.
  - `close_adjustment_update_service.ts`, `close_closing_entries.ts`.
  - `protocol_bridge.ts`: SaveTrialBalance, ApplyHitlAdjustmentToTrialBalance, CreateDraftJE, ProposeJE, ApproveJE, PostJE (where period is derived).

```ts
// period_lock_service.ts (excerpt)
export async function assertPeriodNotLocked(
  periodLabel: string,
  tenantId?: string,
  pool?: Pool
): Promise<void> {
  const locked = await isPeriodLocked(periodLabel, tenantId, pool);
  if (locked) throw new PeriodLockedError(periodLabel);
}
```

### Other invariants (explicit in code)

- **Provenance:** Non-zero amounts in resolve-ingest adjustment must have valid `amountProvenance` (ledger_exact | engine_calculation | human_entered). Enforced in `src/types/amount_provenance.ts` (`validateAdjustmentProposals`) and `routes/hitl.ts` (400 AMOUNT_PROVENANCE_REQUIRED).
- **Segregation:** `src/services/segregation_service.ts` — `canPerform(actorRole, action)`: period_lock, certify_close, je_suggest_approve, je_post require approver; close_checklist_complete, variance_confirm require reviewer. Used by close_session_service (certify), close_period (lock), journal_entry_service (approve/post), bridge (LockPeriod).
- **JE balance:** Journal entry lines must sum(debits) = sum(credits); enforced in `journal_entry_service` (createDraftJE, postJE) and in bridge CreateDraftJE.
- **Export gate:** Materiality flags read only from DB (`period_export_checks`); caller must not supply them (TAMPERING_ATTEMPT_DETECTED in production). Chain verification required for certified export.

---

## 3️⃣ Data Model

### Trial balances

| Table | Key fields | Relationships | Constraints |
|-------|------------|---------------|-------------|
| **period_trial_balance** | tenant_id, period_label, source ('uploaded'\|'synced'), entries (JSONB), uploaded_at, uploaded_by, synced_at, synced_by, file_name, connection_id, created_at, updated_at | None (PK only) | PK (tenant_id, period_label); source CHECK |

- **entries:** JSONB array of objects (e.g. accountName, debit, credit). No separate rows per line; no stable line identifiers in schema.

### Journal entries

| Table | Key fields | Relationships | Constraints |
|-------|------------|---------------|-------------|
| **journal_entries** | id, close_session_id, tenant_id, status, memo, source, created_by, approved_by, posted_at, reversal_date, created_at, updated_at | — | status CHECK (draft, proposed, approved, posted, exported, rejected); source CHECK (manual, suggestion, recon, accrual) |
| **journal_entry_lines** | je_id, line_index, account_ref, debit, credit, description | FK je_id → journal_entries(id) ON DELETE CASCADE | PK (je_id, line_index); debit, credit >= 0 |

- No `amount_provenance` column on lines; provenance enforced at API only.

### Close sessions

| Table | Key fields | Relationships | Constraints |
|-------|------------|---------------|-------------|
| **close_sessions** | id, tenant_id, entity_id, period_start, period_end, basis, standard, status, created_at, updated_at, certified_by, certified_at, certification_memo | — | chk_period_order (period_start <= period_end); chk_basis (cash\|accrual); chk_status (draft, in_progress, ready_for_review, finalized, locked, certified); EXCLUDE no_overlapping_sessions (tenant_id, entity_id, daterange) |

### Audit ledger

| Table | Key fields | Relationships | Constraints |
|-------|------------|---------------|-------------|
| **audit_ledger** | id, tenant_id, period_label, event_type, deterministic_flag_snapshot (JSONB), agent_dissent_snapshot (JSONB), user_prompt_rationale, previous_entry_hash, entry_hash, created_at, created_by, hash_version | — | Append-only in app (no UPDATE/DELETE) |

### Certification state

- **Stored in close_sessions:** status = 'certified', certified_by, certified_at, certification_memo. No separate certification table.
- **period_export_checks:** tenant_id, period_label, rounding_gap_exceeds_materiality, aggregate_rounding_exceeds_materiality, updated_at. Used by export gate (server-side only).

### Mapping rules

| Table | Key fields | Relationships | Constraints |
|-------|------------|---------------|-------------|
| **coa_mapping_rules** | id, tenant_id, entity_id, effective_from, effective_to, version, source_account_name_pattern, source_account_number_pattern, mapped_fs_line_id, confidence_default, created_at | mapped_fs_line_id → fs_taxonomy_lines.id (logical) | confidence_default in [0,1] |
| **fs_taxonomy_lines** | id, code, name, statement (PL\|BS\|CF), parent_id, normal_balance | — | chk_statement, chk_normal_balance |

### Period lock

| Table | Key fields | Relationships | Constraints |
|-------|------------|---------------|-------------|
| **period_locks** | tenant_id, period_label, locked_at, locked_by, reason | — | PK (tenant_id, period_label) |

---

## 4️⃣ Canonical Representation

- **Defined canonical ledger representation:** No single “canonical ledger” type or schema beyond the stored shapes. The **period trial balance** for a period is the one row in `period_trial_balance`; its `entries` JSONB is the list of lines. “Adjusted” view is computed (e.g. `getAdjustedTrialBalance`: period_trial_balance + approved/posted JEs and close adjustments), not stored as a separate canonical table.
- **TB stored as JSON or normalized rows:** **JSON.** `period_trial_balance.entries` is JSONB (array of { accountName, debit, credit } and optional fields). No normalized `trial_balance_lines` table.
- **Stable line identifiers:** **No.** Entries in JSONB have no required `id` or `line_id`. Parser and in-memory types may use indices; DB does not assign stable IDs to TB lines.
- **Source of truth at certification time:** For **certified export**, the route uses:
  - **Session state:** `close_sessions.status === 'certified'` and session id (closeSessionId).
  - **Export gate:** `period_export_checks` (materiality) and `audit_ledger` chain (verifyChain).
  - **Integrity:** Totals and optional plug check from the **request body** (export) or from **stored statement generation** (binder: `getLastStatementGeneration`) — i.e. TB/BS totals and optionally entries for plug detection. So “source of truth” for the gate is: DB for session + export_checks + audit chain; for balance/plug it is either client-supplied (export) or last registered statement generation (binder), not a single recomputed view from `period_trial_balance` at that moment.

---

## 5️⃣ Audit & Hash Chain

- **What is hash-chained:** Only the **audit_ledger** table. Each row is one event; `previous_entry_hash` points to the previous row’s `entry_hash`; `entry_hash` is computed over a payload (tenantId, periodLabel, eventType, deterministicFlagSnapshot, agentDissentSnapshot, userPromptRationale, previousEntryHash, createdAt).
- **Per event or per snapshot:** **Per event.** One hash per audit_ledger row. No hash of a full financial state (no snapshot hash of period_trial_balance or journal_entries).
- **Full financial state snapshot hashed:** **No.** Only the event payload above is hashed. Deterministic_flag_snapshot can contain arbitrary JSON (e.g. closeSessionId, certifiedBy) but is not a full ledger dump.
- **Verification:** `src/db/repositories/audit_ledger_repository.ts` — `verifyChain(pool, tenantId)`: load all rows for tenant ordered by created_at ASC; for each row compute hash (v1 or v2 from hash_version); compare to stored entry_hash; verify previous_entry_hash links. Returns `{ valid, brokenAtEntryId?, message?, entryCount, verifiedAt, latestEntryHash?, latestEntryId? }`. Used by `export_gate_service.checkExportGate`; if !valid, certified export is blocked.

```ts
// audit_ledger_repository.ts (excerpt) — v2 hash payload
const canonical = JSON.stringify({
  tenantId, periodLabel, eventType,
  deterministicFlagSnapshot: canonicalizeForHash(payload.deterministicFlagSnapshot),
  agentDissentSnapshot: canonicalizeForHash(payload.agentDissentSnapshot),
  userPromptRationale: payload.userPromptRationale,
  previousEntryHash: payload.previousEntryHash,
  createdAt: payload.createdAt,
});
return createHash('sha256').update(canonical, 'utf8').digest('hex');
```

---

## 6️⃣ AI Layer

- **Where invoked:**  
  - **Shadow Auditor:** `src/ai/ai_orchestrator.ts` `runShadowAuditor` → `callAIWithSchema` → `callClaude` (or mock). Called from `journal_entry_service` (pre-post) and `routes/hitl.ts` resolve-ingest (tb_adjustment).  
  - **Justifier:** `runJustifier`; called from journal_entry_service (memo).  
  - **Classifier:** `runClassifier`; called from trial-balance ingest (classification for staged path).  
  - **Advisor:** `runAdvisor`; called from trial-balance ingest (proposals for staged path).  
  LLM call: `src/ai/adapters/claude_adapter.ts` `callClaude` → `src/llm/provider.ts` `generateText` (Anthropic/OpenAI/Mistral by env).
- **What AI can mutate:** **Nothing** in the ledger. AI does not write to period_trial_balance or journal_entries. Shadow Auditor returns severity/findings; caller blocks post or resolve when severity === 'block'. Amounts that hit the ledger require human-supplied provenance (validated at API).
- **What data it receives:** Prompt content built in ai_orchestrator (e.g. JE lines, account names, amounts, policy snippets for Shadow Auditor; source lines for Classifier/Advisor). Request/response logged to `ai_call_log` (tenant_id, pillar, prompt_version, model, request_json, response_raw, response_json, ok, error).
- **Can AI be fully disabled without breaking flows:** **Yes.** Set `AI_MOCK=true`. In `claude_adapter.ts`, when AI_MOCK is true, no external call is made; mock JSON is returned per pillar (justifier, shadow_auditor, classifier, advisor). Balance checks, export gate, integrity check, and provenance validation do not depend on AI. Shadow Auditor on failure is fail-open (warn only, do not block).

---

## 7️⃣ Export Path

- **What generates financial statements:**  
  - **In-memory from TB:** `src/services/financialStatements.ts` — `buildFinancialStatements(trialBalanceResult, options)` and `buildValidatedStatements()` (throws on imbalance).  
  - **With DB/close context:** `statement_package_service.generateStatements` uses `getAdjustedTrialBalance(tenantId, periodLabel, pool, closeSessionId)` then `buildValidatedStatements(trialBalance)`.  
  - **Ingest path:** Ingest can call `generateStatements` or `buildValidatedStatements` and optionally `registerStatementGeneration` (audit_export_service) for binder/last-generation.
- **What generates the audit binder:** `src/services/audit_export_service.ts` — builds binder (statements + justification chain, line-level links). Binder routes: GET `/api/audit/binder`, GET `.../binder/export/pdf`, `.../binder/export/csv` use `getLastStatementGeneration` (or similar) and build bundle; all require certified session + runBinderExportGates.
- **Conditions that must pass before export:**  
  - **Certified export:** (1) `closeSessionId` in body/query and `close_sessions.status === 'certified'` (for binder; for POST export, session is not re-checked in the same way but readiness/close can be). (2) `checkExportGate`: period_export_checks (materiality) from DB, verifyChain(tenantId) valid. (3) `finalIntegrityCheck`: trial balance balance, balance sheet equation, optional plug detection — pass. (4) No CPA vs CFA fatal conflict (export route).  
  - **Draft:** Can allow imbalance if `ALLOW_IMBALANCED_DRAFT_EXPORT` is true; otherwise same integrity check can block.
- **What object/state determines “Certified”:** The **close_sessions** row: `status === 'certified'` and presence of certified_by, certified_at, certification_memo. Export gate and final integrity check then determine whether certified **output** is allowed (chain valid, materiality, math).

---

## 8️⃣ Missing Pieces Relative to Infrastructure Goal

**Factual from the codebase only:**

- **No single “canonical ledger” API or schema.** TB is one JSONB blob per period; adjusted view is computed in multiple places (getAdjustedTrialBalance, statement_package_service, export body). No single, versioned “ledger state” object that certification is defined against. Export/binder use request body or “last statement generation,” not a single recomputed snapshot from DB at export time.
- **Certification is not reversible.** There is no uncertify or revert; updateCertification only sets certified. No API to set status back from certified.
- **Provenance not persisted on ledger.** Enforced at input (resolve-ingest, proposals); journal_entry_lines and period_trial_balance have no amount_provenance column. Harder to treat the system as a portable “proof layer” that can re-verify every amount’s source later.
- **Hash chain is over events, not over financial state.** Tamper-evidence is over the audit event stream, not over a snapshot of TB + JEs. A third party cannot verify “this certified export matches this hash of ledger state” from the chain alone.
- **Tight coupling to Express, tenant context, and DB shape.** Routes assume req (tenantId, pool), multipart/JSON body, and existing tables. No standalone “certification library” or small CLI that takes a canonical payload and returns allow/deny; no Stripe-like single object (e.g. “CertificationIntent”) that encapsulates all inputs and outputs.
- **Multiple entry points for “statements.”** buildValidatedStatements, generateStatements (statementGenerator), statement_package_service.generateStatements, getAdjustedTrialBalance, and export’s body all interact. No single “build canonical statements from ledger” function used everywhere for certified export.
- **Period lock and some services can use in-memory when pool is missing.** For a portable layer, lock and all state would be in one durable store; today period_lock_service and a few others fall back to memory when pool is absent (blocked in production by requireTenantContext and disallowMemoryStoreInProduction in some paths only).
- **AI is optional but wired into several flows.** Ingest (classifier, advisor), resolve-ingest (Shadow Auditor), JE (Justifier, Shadow Auditor). Disabling AI (AI_MOCK) works, but the code paths and dependencies (pillars, prompts, ai_call_log) are not isolated behind a single “AI adapter” that could be swapped for a no-op in one place.
- **No stable line IDs on TB.** Harder to reference “line X” in proofs or external systems; entries are array position or content-based.
- **Export gate and integrity check depend on caller-supplied or “last stored” data for binder.** Binder uses getLastStatementGeneration; export uses body. So “certified” is “this session is certified and at export time gate + integrity passed on this payload,” not “certified over this exact snapshot of period_trial_balance + journal_entries.”

---

*End of snapshot. All claims are tied to current code and migrations; no intended design.*
