# Sovereign CPA Engine — Implementation Reality Summary

**Purpose:** Precise, implementation-level summary of what is **actually built** in the current codebase. No intended or future architecture; only implemented reality. For alignment with strategic positioning (e.g. with another team or ChatGPT instance).

**Convention:** File paths are relative to repo root. “Not implemented” means no code path or schema exists for it.

---

## 1️⃣ Core Data Model

### Ledger-related entities (tables / schemas / types)

**period_trial_balance** (`migrations/060_period_trial_balance.sql`)

- **Purpose:** One row per (tenant_id, period_label); holds unadjusted trial balance from upload or sync.
- **Fields:** `tenant_id`, `period_label`, `source` (CHECK: 'uploaded' | 'synced'), `entries` (JSONB, array of { accountName, debit, credit }), `uploaded_at`, `uploaded_by`, `synced_at`, `synced_by`, `file_name`, `connection_id`, `created_at`, `updated_at`.
- **Constraints:** PRIMARY KEY (tenant_id, period_label). No unique constraint on entries; upsert replaces the row for that tenant+period.
- **Canonical representation:** This table is the **persisted** trial balance for a period. The “canonical” shape for a single period’s TB is this row; entries are JSONB (no separate normalized rows per line). Determinism for **writing** begins when combined entries (staged + adjustment) pass balance check and are passed to `saveUnadjustedFromUpload` → `period_trial_balance_repository.upsertUnadjusted`.

**journal_entries** + **journal_entry_lines** (`migrations/072_tenant_journal_entries.sql`)

- **journal_entries:** `id` (PK), `close_session_id`, `tenant_id`, `status` (CHECK: draft | proposed | approved | posted | exported | rejected), `memo`, `source` (CHECK: manual | suggestion | recon | accrual), `created_by`, `approved_by`, `posted_at`, `reversal_date`, `created_at`, `updated_at`. FK none to close_sessions (session can be in same DB).
- **journal_entry_lines:** `je_id`, `line_index`, `account_ref`, `debit`, `credit`, `description`; PRIMARY KEY (je_id, line_index); CHECK debit >= 0 AND credit >= 0. No `amount_provenance` column; provenance is enforced at API/validation layer only (see HITL / resolve-ingest).
- **Types:** `src/types/journal_entry.ts` — JournalEntry, JournalEntryLine, JournalEntryStatus, JournalEntrySource, CreateDraftJEInput, ValidationResult.

**close_sessions** (`migrations/065_tenant_close_sessions.sql`, `078_close_sessions_certified.sql`)

- **Fields:** `id`, `tenant_id`, `entity_id`, `period_start`, `period_end`, `basis` (cash | accrual), `standard`, `status` (draft | in_progress | ready_for_review | finalized | locked | certified), `created_at`, `updated_at`; plus `certified_by`, `certified_at`, `certification_memo` (from 078).
- **Constraints:** chk_period_order (period_start <= period_end), chk_basis, chk_status; EXCLUDE (no overlapping daterange per tenant_id, entity_id).

**tenant_hitl_staging** (`migrations/062_tenant_hitl_staging_and_supervisor_sessions.sql`)

- **Fields:** `id`, `tenant_id`, `proposed_action`, `justification`, `status` (pending | approved | rejected), `type` (journal_entry | policy_change | adjustment | flag_override | other), `amount`, `payload` (JSONB), `created_at`, `updated_at`, `approved_at`, `approved_by`, `rejected_at`, `rejected_reason`.
- **Role:** HITL items; for trial balance ingest, payload.kind === 'trial_balance_ingest' with rawRows, periodLabel, imbalanceAmount, etc.

**audit_ledger** (`migrations/051_audit_ledger.sql`, `079_audit_ledger_hash_version.sql`)

- **Fields:** `id`, `tenant_id`, `period_label`, `event_type`, `deterministic_flag_snapshot` (JSONB), `agent_dissent_snapshot` (JSONB), `user_prompt_rationale`, `previous_entry_hash`, `entry_hash`, `created_at`, `created_by`, `hash_version` (1 or 2).
- **Constraints:** No UPDATE/DELETE in application code; append-only. Hash chain: each entry’s hash is computed over payload including previous_entry_hash.

**period_export_checks** (`migrations/052_period_export_checks.sql`)

- **Fields:** `tenant_id`, `period_label`, `rounding_gap_exceeds_materiality`, `aggregate_rounding_exceeds_materiality`, `updated_at`. PK (tenant_id, period_label).
- **Role:** Export gate reads these server-side; caller must not supply materiality flags.

**decision_records** (`migrations/070_tenant_decision_records.sql`)

- **Fields:** `id`, `close_session_id`, `tenant_id`, `decision_type` (classification | coa_mapping | recon_match | je_suggestion | anomaly_flag), `subject_ref` (JSONB), `input_hash`, `input_snapshot`, `output_snapshot`, `confidence_score`, `rationale_text`, `engine_version`, `prompt_snapshot`, `created_at`.
- **Role:** Append-only “why” for automated/assisted decisions; not the hash chain (that’s audit_ledger).

**coa_mapping_rules** (`migrations/069_coa_mapping_rules.sql`)

- **Fields:** `id`, `tenant_id`, `entity_id`, `effective_from`, `effective_to`, `version`, `source_account_name_pattern`, `source_account_number_pattern`, `mapped_fs_line_id`, `confidence_default`, `created_at`. confidence_default in [0,1].
- **Role:** Map source account (name/number pattern) to FS taxonomy line; versioned per tenant+entity.

**fs_taxonomy_lines** (`migrations/068_fs_taxonomy_lines.sql`)

- **Fields:** `id`, `code`, `name`, `statement` (PL | BS | CF), `parent_id`, `normal_balance` (debit | credit), `created_at`. Seeded: fs_revenue, fs_expense, fs_asset, fs_liability, fs_equity.
- **Role:** Target of COA mapping; shared structure for statement line items.

**tenant_shadow_audit_findings** (`migrations/077_tenant_shadow_audit_findings.sql`)

- Stores Shadow Auditor results per JE (or tb_adjustment): severity, findings (code, message, rule_ids, refs), confidence, prompt_version, model, etc.

**ai_call_log** (`migrations/080_ai_call_log.sql`)

- **Fields:** `id` (UUID), `tenant_id`, `pillar`, `prompt_version`, `model`, `request_json` (JSONB), `response_raw`, `response_json`, `ok`, `error`, `created_at`.
- **Role:** Every LLM call logged per tenant for audit; no per-line provenance stored in ledger tables.

### What constitutes the “canonical” representation

- **Trial balance for a period:** The single row in `period_trial_balance` for (tenant_id, period_label). Its `entries` JSONB is the canonical list of account lines (accountName, debit, credit) for that period from this system’s perspective. There is no separate “adjusted” table; adjustments are applied by combining staged raw rows + human adjustment and re-upserting.
- **Journal entries:** `journal_entries` + `journal_entry_lines` are the canonical JE store. No duplicate “ledger view” table; statement build and export derive from period_trial_balance + approved/posted JEs.
- **Close state:** `close_sessions` is the canonical close/session state; certification is a status + certified_by/certified_at/certification_memo.

### Where determinism begins in code

- **Ingest path:** Determinism begins at balance check. In `src/routes/trial-balance/ingest.ts`, if `absGt(totalDebits, totalCredits, tolerance)` then the upload is **not** written to period_trial_balance; it is staged (tenant_hitl_staging) and the response is status 'staged' with stagedId. Only when the human calls resolve-ingest with a balancing adjustment (and valid provenance) does the bridge command `ApplyHitlAdjustmentToTrialBalance` run, which re-checks balance and then calls `saveUnadjustedFromUpload` → repo.upsertUnadjusted.
- **Resolve-ingest:** `src/routes/hitl.ts` (resolve-ingest) and `src/bridge/protocol_bridge.ts` (ApplyHitlAdjustmentToTrialBalance) both use `getRoundingTolerance()` and `absGt(..., tolerance)` for the combined (base + adjustment) totals. So determinism is: same tolerance source (`rules_registry` / financial_rules.json), same comparison.
- **JE post:** Balance validation and Shadow Auditor run before post; determinism for “can post” is in `journal_entry_service` (balance check) and Shadow Auditor (deterministic rules + optional AI; AI fail-open).
- **Export:** Determinism is in export gate (chain verification, period_export_checks from DB) and final integrity check (trial balance balance, balance sheet equation, plug detection) in code; no client-supplied bypass in production.

---

## 2️⃣ Canonicalization Layer (if implemented)

### Formal canonical schema

- **FS taxonomy:** `fs_taxonomy_lines` defines a fixed set of statement lines (PL/BS/CF) with id, code, name, normal_balance. This is the target schema for **mapping** accounts to statement lines, not for storing raw TB. There is no single “canonical TB schema” beyond the JSONB `entries` in period_trial_balance (each entry: accountName, debit, credit; optional accountCode in some code paths).
- **Trial balance entry shape:** In TypeScript, `TrialBalanceEntry` (e.g. in `src/types/financial.ts`) and the parser output (e.g. `parseTrialBalance` in `src/services/trialBalanceParser.js`) normalize to a consistent in-memory shape. The DB stores that as JSONB; there is no separate “canonical” table of normalized account lines.

### Where messy input gets normalized

- **Trial balance upload:** `src/services/fileIngestion.ts` and `src/services/trialBalanceParser.js` (and parser_utils) parse CSV/XLSX into rows. Column mapping (account, debit, credit) is inferred or provided; `parseTrialBalance` / helpers produce a normalized list of entries (accountName, debit, credit). If column mapping cannot be determined, ingest returns 400 with message to use HITL resolve-ingest with a corrected file (`src/routes/trial-balance/ingest.ts`).
- **COA mapping:** `src/services/coa_mapping_service.ts` applies `coa_mapping_rules` (pattern match on account name/number) to map accounts to `fs_taxonomy_lines`. Fallback when no rule matches: `accountClassifier.js` (classifyAccount) returns an AccountType; DEFAULT_FS_LINE_BY_TYPE maps to fs_asset, fs_liability, etc. So normalization from “messy” account names to FS lines is: rules first (deterministic pattern match), then classifier (deterministic by account name).

### Deterministic vs heuristic

- **Deterministic:** Balance checks (debits vs credits, assets vs liabilities+equity), tolerance from `getFinancialRules()` / financial_rules.json; COA rule application (patternToRegExp, ruleMatches); hash chain computation (v2: sorted keys + normalized dates in `audit_ledger_repository.ts`); export gate (verifyChain, period_export_checks from DB); final integrity check (runIntegrityGate, detectSuspiciousPlugs).
- **Heuristic:** Column detection for CSV/XLSX (e.g. inferring which column is “account” or “debit”) can be heuristic; the code can fall back to “column mapping could not be determined.” Classifier fallback (classifyAccount) is deterministic in code but the logic is name-based rules, not ML, in accountClassifier. AI pillars (Shadow Auditor, Justifier, Classifier, Advisor) are non-deterministic when AI is used; when AI_MOCK is true, responses are deterministic mocks.

### Mapping rules persisted and versioning

- **Persisted:** Yes. `coa_mapping_rules` table: per tenant_id, entity_id, with effective_from, effective_to, version, source_account_name_pattern, source_account_number_pattern, mapped_fs_line_id, confidence_default. Repository: `src/db/repositories/coa_mapping_rules_repository.ts`.
- **Rule versioning:** The table has a `version` column (integer). `listCoaMappingRules` takes asOfDate; effective_from/effective_to determine which rules apply. When applying rules, the service can set `ruleVersionApplied` in the result (e.g. for decision records). No separate “rule version history” table; the same table holds versions via effective dates and version number.

---

## 3️⃣ Deterministic Engine

### Invariants enforced

- **Trial balance balance:** Sum(debits) === Sum(credits) within tolerance (from financial_rules.json roundingTolerance or equation toleranceKey). Enforced in: ingest (if balanced, proceed to save; if not, stage and do not write); resolve-ingest and ApplyHitlAdjustmentToTrialBalance (re-check combined totals before save); runIntegrityGate (used before certified export); finalIntegrityCheck (used by export and audit binder routes).
- **Balance sheet equation:** Assets = Liabilities + Equity within tolerance. Enforced in integrity_gate_service.runIntegrityGate and finalIntegrityCheck; certified export fails if not passed.
- **JE line balance:** Journal entry must have sum(debits) = sum(credits). Enforced in journal_entry_service (createDraftJE, postJE) and in bridge CreateDraftJE.
- **No unprovenanced amounts on resolve-ingest:** validateAdjustmentProposals (from amount_provenance.ts) requires every non-zero amount to have a valid amountProvenance (ledger_exact | engine_calculation | human_entered). Enforced in POST /api/hitl/resolve-ingest; 400 if invalid.
- **Period lock:** assertPeriodNotLocked is called before: trial balance save (ingest path when balanced), ApplyHitlAdjustmentToTrialBalance, and in bridge for SaveTrialBalance and ApplyHitlAdjustmentToTrialBalance. When locked, those operations throw / return error.
- **Segregation:** canPerform(actorRole, action) for period_lock, certify_close, je_approve, je_post. Enforced in close_session_service (certify), close_period (lock), journal_entry_service (approve/post), and bridge where role is passed.

### Where mathematical checks are implemented

- **src/services/integrity_gate_service.ts:** runIntegrityGate (trial balance totals + balance sheet totals vs tolerance), assertIntegrityGateOrThrow, validateTrialBalanceAndBalanceSheet; detectSuspiciousPlugs (plug account share of activity).
- **src/services/integrity_check.ts:** finalIntegrityCheck wraps runIntegrityGate + optional plug detection; used by export and audit binder before certified output.
- **src/utils/decimal.ts:** absGt used for tolerance comparisons.
- **src/services/rules_registry.ts:** getFinancialRules, getRoundingTolerance (from shared/config/financial_rules.json).
- **src/routes/trial-balance/ingest.ts:** balance check before deciding to persist or stage.
- **src/routes/hitl.ts (resolve-ingest):** combined totalDebits/totalCredits vs tolerance; 422 if still imbalanced.
- **src/bridge/protocol_bridge.ts:** Same balance check for ApplyHitlAdjustmentToTrialBalance.
- **src/services/journal_entry_service.ts:** Balance validation on JE lines before post.

### How imbalances are handled

- **On ingest:** If trial balance does not balance within tolerance, the upload is **not** written to period_trial_balance. A HITL staging item is created with payload.kind === 'trial_balance_ingest' (rawRows, periodLabel, etc.). Response is 200 with status 'staged', stagedId, and message that data is not saved to main ledger until resolve-ingest. No rejection of the file per se; it is quarantined in staging.
- **On resolve-ingest:** Human supplies adjustment array with provenance. Combined (staged rawRows + adjustment) must balance; otherwise 422 MathematicalIntegrityError. If balance passes and Shadow Auditor does not block, bridge command ApplyHitlAdjustmentToTrialBalance runs and overwrites period_trial_balance for that period (upsert).
- **On export:** Certified export is blocked if final integrity check fails (runIntegrityGate or plug detection). Draft export can be allowed with or without balance (ALLOW_IMBALANCED_DRAFT_EXPORT env); when allowed imbalanced, draft is watermarked.

### What is hash-chained and what object(s) get hashed

- **Hash-chained:** The **audit_ledger** table only. Each row is one “event”; previous_entry_hash links to the previous row’s entry_hash; entry_hash is computed over a payload that includes tenant_id, period_label, event_type, deterministic_flag_snapshot, agent_dissent_snapshot, user_prompt_rationale, previous_entry_hash, created_at.
- **Hash version:** v1 = raw JSON key order and stored createdAt; v2 = canonical (sorted keys + normalized ISO timestamps). New inserts use hash_version 2; verifyChain in audit_ledger_repository recomputes hash per row using the row’s hash_version and compares to stored entry_hash. Chain validity: each row’s previous_entry_hash must equal the previous row’s entry_hash.
- **What gets hashed:** The payload object above (one per audit_ledger row). No per-snapshot or per-batch hash of period_trial_balance or journal_entries; the **chain** is over the sequence of audit events (overrides, material events), not over the ledger state itself.

---

## 4️⃣ Certification Gate

### Conditions that must pass before export

- **Session certified:** close_sessions.status === 'certified'. Enforced in export routes and audit binder: requireCertifiedSession (audit_binder.ts) and in export.ts when exportMode === 'certified'. If not certified, 403 CLOSE_NOT_CERTIFIED.
- **Export gate:** checkExportGate (export_gate_service.ts) runs: (1) period_export_checks from DB for periodLabel — if rounding_gap_exceeds_materiality or aggregate_rounding_exceeds_materiality true → allowed false, CRITICAL_TAMPER_ALERT; (2) verifyChain(pool, tenantId) — if !valid → allowed false, CRITICAL_TAMPER_ALERT; (3) when ENABLE_INTEGRATED_SUPERVISOR, unresolved conflicts for period → UNRESOLVED_CONFLICTS_ALERT and allowed false. Caller must not supply materiality flags (TAMPERING_ATTEMPT_DETECTED if attempted in production).
- **Final integrity check:** finalIntegrityCheck (integrity_check.ts) run on the trial balance and balance sheet (and optional entries for plug detection). If not passed, export returns 422 FINAL_INTEGRITY_CHECK_FAILED. Used in export.ts and audit_binder.ts (runBinderExportGates).

### Is there a “certified” state?

- Yes. close_sessions.status can be 'certified'. Columns certified_by, certified_at, certification_memo store who certified and when. Certification is set by close_session_service.certifyCloseSession (updateCertification in close_session_repository: UPDATE sets status = 'certified' and the three certification fields). No other table stores a separate “certified” flag for export; the gate uses this session state plus export gate + integrity check.

### Is it reversible?

- **Not in code.** There is no API or service that sets status from 'certified' back to e.g. 'locked' or 'finalized'. updateCloseSessionStatus exists and can set any status, but no route or documented flow “uncertifies” a session. So certification is one-way in the implemented flows.

### Metadata stored at certification

- Stored in close_sessions: certified_by (TEXT), certified_at (TIMESTAMPTZ), certification_memo (TEXT), and status = 'certified'.
- Stored in audit_ledger: one material event with eventType 'certify_close', deterministicFlagSnapshot containing closeSessionId, certifiedBy, certifiedAt, certificationMemo, and createdBy.

---

## 5️⃣ Audit Ledger

### Events recorded

- **Event types (from src/types/audit_ledger.ts):** flag_override, staging_approval, staging_rejection, integrity_gate_bypass, user_induced_variance, cpa_observation, cfa_recommendation, mapping_rule_update, issue_status_change, recon_confirmation, recon_signoff, je_approval, je_posting, statement_package_generation, export_event, certify_close, bridge_command.
- **Where appended:** recordOverride (audit_ledger_service) → hitl.ts (staging approve/reject), statementGenerator (integrity gate bypass), risk_context_store (user_induced_variance); recordMaterialEvent → statement_package_service, journal_entry_service, issue_item_service, recon_service, coa_mapping_service, export.ts, close_session_service (certify_close), bridge (bridge_command). recordObservation for cpa_observation/cfa_recommendation.
- **Not every financial mutation is guaranteed to append:** Production readiness docs note that some code paths may not call recordMaterialEvent/recordOverride; coverage is partial (e.g. not every close flow path may write to the ledger).

### Append-only

- Yes. Application code does not UPDATE or DELETE audit_ledger. Inserts only via audit_ledger_repository.appendEntry.

### Hash structure

- **Per-event.** Each row is one event. Each row has previous_entry_hash (link to previous row’s entry_hash) and entry_hash (computed over that row’s payload). So per-event chaining, not per-snapshot or per-batch of ledger state.

### Are snapshots reproducible from raw input?

- **Audit ledger:** The chain is reproducible in the sense that verifyChain recomputes each row’s hash from stored fields and checks it. The deterministic_flag_snapshot (and optional agent_dissent_snapshot) are stored as JSONB; they are not recomputed from “raw input” (e.g. TB or JEs) — they are whatever the caller passed at record time. So “reproducible” here means “chain verification reproduces the hash from stored payload,” not “reproduce period_trial_balance from upload file.”
- **Period trial balance:** The entries in period_trial_balance are the result of upload (or resolve-ingest). Re-running the same upload with the same file would not necessarily produce the same row (e.g. uploaded_at differs); the content (entries) can be reproduced if the same input file and adjustment are re-applied. There is no built-in “replay from raw input” for the whole ledger.

---

## 6️⃣ AI Layer (in code)

### Roles implemented

- **Shadow Auditor:** Pre-post check for journal entries (and for resolve-ingest tb_adjustment). Returns severity (ok | warn | block) and findings. Implemented in shadow_auditor_service.ts; calls AI via ai_orchestrator.runShadowAuditor (or mock). When severity === 'block', caller (journal_entry_service, hitl resolve-ingest) refuses post/apply.
- **Justifier:** Memo/IRAC for documentation; used for HITL/staging, close_adjustment, journal_entry, export. Does not mutate amounts. ai_orchestrator.runJustifier.
- **Classifier:** Classifies source lines (e.g. for ingest); outputs suggested account types / FS placement. ai_orchestrator.runClassifier; used in ingest and COA fallback path.
- **Advisor:** Suggests reclass/adjustment proposals (with provenance requirements). ai_orchestrator.runAdvisor; proposals stored in tenant_ai_proposals; no automatic post — human must approve and supply provenance.

### What AI can mutate

- **Nothing in the ledger directly.** AI cannot post journal entries, cannot write to period_trial_balance, and cannot set certification. Amounts that affect the ledger require human-supplied provenance (validateAdjustmentProposals / validateJEProvenance); AI output that invents amounts is rejected at API. Shadow Auditor can only block or warn; it does not change amounts.

### AI upstream or inside deterministic core

- **Upstream / outside.** Balance checks, export gate, integrity check, and hash chain are implemented without AI. AI is used for: Shadow Auditor (pre-post), Justifier (narrative), Classifier (classification), Advisor (proposals). So AI is **upstream** of the deterministic core: it can block (Shadow Auditor) or feed suggestions; the core (balance, gate, chain, provenance validation) does not depend on AI for correctness.

### Outputs logged with attribution

- **ai_call_log:** Every call to callAIWithSchema (ai_client.ts) results in insertCallLog: tenant_id, pillar, prompt_version, model, request_json (sanitized), response_raw, response_json, ok, error, created_at. So per-tenant, per-pillar, per-call.
- **tenant_shadow_audit_findings:** Shadow Auditor results stored per JE (or tb_adjustment): severity, findings, confidence, prompt_version, model, actor_user_id.
- **Provenance:** Amount provenance (human_entered, engine_calculation, ledger_exact) is required at API for resolve-ingest and adjustment proposals; it is not stored in journal_entry_lines or period_trial_balance tables — only enforced at input.

---

## 7️⃣ HITL Workflow

### Where human approval is required

- **Staging (tenant_hitl_staging):** Items in status 'pending' require a human to approve or reject via POST /api/hitl/webhook (or equivalent approve/reject flow). On approval, recordOverride with staging_approval is called and the item status is updated to approved; on rejection, staging_rejection and status rejected. Only after approval can certain actions proceed (e.g. resolve-ingest applies the adjustment and then updates staging to approved after the bridge command succeeds).
- **Resolve-ingest:** Human must supply the adjustment array with valid amountProvenance. No automatic correction; the system rejects missing/invalid provenance (400).
- **JE lifecycle:** Propose and approve are separate; approve and post require approver role. So human (with approver role) must approve JEs and perform post (which also runs Shadow Auditor; human sees block and does not post).
- **Period lock and certification:** lockPeriod and certifyCloseSession require approver role; human initiates.

### Attribution enforced

- **Provenance:** Every non-zero amount in resolve-ingest adjustment must have amountProvenance (ledger_exact | engine_calculation | human_entered). validateAdjustmentProposals enforces this; 400 AMOUNT_PROVENANCE_REQUIRED otherwise.
- **Staging:** approved_by, rejected_reason stored on tenant_hitl_staging; audit_ledger gets staging_approval/staging_rejection with deterministicFlagSnapshot (e.g. stagingId) and userPromptRationale.
- **JE:** created_by, approved_by on journal_entries; audit_ledger je_approval, je_posting with createdBy.
- **Certification:** certified_by, certified_at, certification_memo; audit_ledger certify_close with createdBy.

### Objects that require sign-off

- **Staging items:** type journal_entry, policy_change, adjustment, flag_override, other — all require approve/reject to move from pending.
- **Trial balance (imbalanced):** Effectively “signed off” when human supplies resolve-ingest with balancing adjustment and provenance; then bridge applies and staging item is marked approved.
- **Journal entries:** Approve (approver) and post (approver); Shadow Auditor can block post.
- **Close:** Period lock and certify require approver sign-off (and are recorded in audit_ledger).

---

## 8️⃣ System Boundaries

### Inputs currently supported

- **Trial balance:** CSV or XLSX upload (multipart form, field name "file"); optional body fields (periodLabel, entityId, standard, prior_entries, transactions, fullSet, comparative, useAgenticClassification, etc.). Max file size 10 MB (multer limit in ingest.ts). Column mapping inferred or required; if not determined, 400 and suggest resolve-ingest with corrected file.
- **Resolve-ingest:** POST body: stagedId, adjustment (array of { accountName, debit?, credit?, amountProvenance? }).
- **Close session / checklist:** API to create and update close_sessions, close_checklist_items; period lock and certify via close_session_service and routes.
- **Journal entries:** Create draft, propose, approve, post via journal_entry_service and routes (and bridge CreateDraftJE, ProposeJE, ApproveJE, PostJE).
- **HITL:** Staging list, get one, submit to staging, approve/reject (webhook or equivalent).

### Exports supported

- **PDF:** POST /api/export/pdf with body (ReportPayload, exportMode 'draft' | 'certified', closeSessionId when certified). Builds PDF from structured payload; certified requires session certified + export gate + final integrity check.
- **CSV:** POST /api/export/csv with similar contract; certified path same gates.
- **Audit binder:** GET /api/audit/binder, GET .../binder/export/pdf, .../binder/export/csv — certified only (closeSessionId, session.status === 'certified', checkExportGate, finalIntegrityCheck). Draft package available via different route (e.g. draft-package).

### GL sync implemented

- **Implemented but disabled by default.** push_close_to_gl_service.pushAdjustmentToGL and accounting_integration_service.pushJournalEntry exist. When ENABLE_GL_POSTBACK !== 'true', pushAdjustmentToGL returns notImplemented: true and errors array with “GL post-back is disabled.” Callers (e.g. close_adjustments route) return 501. So GL sync is **stubbed/guarded**; no actual push to an external GL in default configuration. Implementation of pushJournalEntry depends on accounting_integration_service (connection-based); real ERP/GL integration is not verified here.

### System-of-record adjacent or independent

- **Independent.** The system does not assume it is the system of record for the company’s books. It has its own store (period_trial_balance, journal_entries, close_sessions, etc.). It can consume uploads and optional prior data; it does not replace the ERP or GL. Optional GL post-back is off by default. So it is **independent** and used **adjacent** to the real system of record (run in parallel or as a control layer), not as the primary ledger.

---

## 9️⃣ Gaps Between Vision and Code

### Discussed architecturally but not implemented

- **Uncertify / reversible certification:** No API or flow to revert a certified session to a prior status. Certification is one-way.
- **Provenance persisted on ledger:** amount_provenance is validated at API and in types, but journal_entry_lines and period_trial_balance have no amount_provenance column. So provenance is not stored per line in the ledger; only at decision/approval time (and in audit/decision records where applicable).
- **Full audit trail coverage:** Not every financial mutation path is guaranteed to call recordMaterialEvent/recordOverride; coverage is documented as partial.
- **Real GL post-back:** ENABLE_GL_POSTBACK is off by default; the push path exists but is not used in pilot; idempotency by external_id and full ERP integration are not asserted here.

### Stubbed or partially implemented

- **GL post-back:** Present as a code path but disabled; returns notImplemented when not enabled. Accounting integration service may have further stubs for real ERP connectors.
- **In-memory fallbacks:** Some services (e.g. period_lock_service, accounting_integration) can use in-memory when pool is missing; production readiness notes that requireTenantContext mitigates for normal API but internal/cron could still hit in-memory. disallowMemoryStoreInProduction is not called in every such path.
- **Auth bypass:** Diagnostic/auth bypass exists when DIAGNOSTICS_AUTH_BYPASS is set; disabled in production but still in code.

### Major components missing relative to stated design

- **Streaming ingest / large dataset:** No streaming ingest; file size limit (10 MB); some list endpoints not paginated. Large-dataset strategy not implemented.
- **Observability:** No OpenTelemetry or metrics; logs only. Runbooks and formal incident response not in repo.
- **Retention / deletion policy:** No automated retention or tenant data deletion endpoints; deletion is ad hoc (DB/admin) if at all.
- **VPC/private AI:** AI calls go to provider public API by default; no in-VPC or customer-hosted model path in code. AI can be disabled (AI_MOCK) for isolation.

---

*End of implementation reality summary. All statements are tied to the current codebase (migrations, src types, services, routes, bridge).*
