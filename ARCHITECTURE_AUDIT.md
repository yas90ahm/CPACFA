# ARCHITECTURE AUDIT REPORT
## CPACFA Codebase vs. Sovereign CPA Engine Target Architecture

**Date:** 2025-02-10  
**Target:** Sovereign CPA Engine (Rearchitecture/sovereign-cpa-architecture.md)  
**Audit Method:** Full codebase scan, mapping to target components, gap analysis, violation detection

> **P0 Item 1 (Decimal Precision): COMPLETED 2025-02-10**  
> All 14 files previously using native float for money have been refactored to use Decimal.js via `utils/decimal.ts`.  
> See Section 3.4 for updated status.
>
> **P0 Item 2 (AI Guardrails): COMPLETED 2025-02-10**  
> All agentic services that return structured data now apply `assertNoNumericAmountsInAgentOutput`.  
> See Section 3.1 and guardrail registry in `src/llm/guardrails.ts`; handoff audit in `src/docs/AI_HANDOFF_AUDIT.md`.
>
> **P1 Item 1 (Close State Machine): COMPLETED 2025-02-10**  
> Close state machine realigned: OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED.  
> Certification before lock; reopen (CERTIFIED → IN_PROGRESS) with reason and audit; lock is terminal.  
> See Section 2.1 and 2.9; migration `098_close_session_state_machine.sql`; tests `close_state_machine.test.ts`.
>
> **P1 Item 2 (HITL Unification): COMPLETED 2025-02-10**  
> Single unified Issue model: `tenant_close_issues` with lifecycle DETECTED→ASSIGNED→IN_PROGRESS→RESOLVED→VERIFIED (and WAIVED).  
> Issue service, detection service, auto-resolution cascade; blocking issues gate certification. Legacy `tenant_issue_items` data migrated; old tables retained.  
> See Section 2.8; `src/services/issue_service.ts`, `issue_detection_service.ts`, `issue_auto_resolution_service.ts`; routes in `close_issues.ts`; tests `issue_lifecycle.test.ts`.
>
> **P1 Item 3 (Reconciliation Gate): COMPLETED 2025-02-18**  
> Unified reconciliation requirements (`tenant_recon_requirements`), period reconciliations (`tenant_period_reconciliations`, `tenant_recon_items`) with DB-computed variance, tolerance, unexplained_variance.  
> `recon_completeness_gate.ts` blocks IN_PROGRESS→UNDER_REVIEW when required recons incomplete. `period_reconciliation_service.ts` for full workflow.  
> Migrations 101, 102; routes in `close_recon_requirements.ts`, `close_period_reconciliations.ts`; gate wired into `computeReadiness`.
>
> **P2 Item 1 (Cascade Implementation): COMPLETED 2025-02-18**  
> `cascade_engine.ts` orchestrates synchronous downstream updates after every financial mutation. Flow: (1) adjusted TB on-demand; (2) recon GL balances refreshed; (3) statements invalidated (not regenerated); (4) validation checks via computeReadiness; (5) HITL issues via runCascade; (6) readiness summary. Wired into: AJE posting, recon complete/approve/reject. Recursion guard depth 3; perf warning at 2s. Migration 103 adds `statements_stale_since` to close_sessions. Tests: `cascade_engine.test.ts`.
>
> **P2 Item 2 (Audit Log Unification): COMPLETED 2025-02-18**  
> `audit_ledger` extended with `before_state`, `after_state` (migration 104). Unified `audit_service.ts` with `recordAuditEvent()`. Old `audit_log_service` deprecated (not removed).
>
> **P2 Item 3 (JE Immutability): COMPLETED 2025-02-18**  
> DB triggers prevent UPDATE/DELETE on posted journal entries and lines (migrations 105, 106).
>
> **P2 Item 4 (normal_balance): COMPLETED 2025-02-18**  
> `normal_balance` column on core.tenant_chart_of_accounts (migration 108).
>
> **P2 Item 5 (Mapping Version History): COMPLETED 2025-02-18**  
> `coa_mapping_history` table (append-only) with triggers (migration 109).
>
> **P2 Item 6 (AJE Memo Required): COMPLETED 2025-02-18**  
> Application validation in createDraftJE; DB constraint je_memo_required (migration 107).
>
> **Deterministic Hardening (Part 1 — All Accounts Mapped): COMPLETED 2025-02-18**  
> `mapping_completeness_gate.ts` ensures all TB accounts have COA mapping before UNDER_REVIEW. `checkMappingCompleteness()` used by readiness and `detectUnmappedAccounts`. MAPPING_CHANGED cascade in `coa_mapping_service.upsertCoaRules`. Tests: `mapping_completeness_gate.test.ts`.
>
> **Deterministic Hardening (Part 2 — Cross-Statement Tie Checks): COMPLETED 2025-02-18**  
> `cross_statement_validation.ts` runs A=L+E, net_income_tie, cash_tie, equity_tie at certification. `statementsStaleSince` blocks certification if statements changed. `validationStateAtCertification` persisted on artifact. Migration 103 for `statements_stale_since`.
>
> **Deterministic Hardening (Part 3 — AJE Templates): COMPLETED 2025-02-18**  
> `tenant_aje_templates` and `tenant_aje_template_applications` (migration 111). `aje_template_service.ts` for CRUD, propose, apply, skip. `template_completeness_gate` and `detectPendingAjeTemplates` block when proposed templates not applied/skipped. Routes in `close_aje_templates.ts`.
>
> **Deterministic Hardening (Part 4 — Variance Analysis): COMPLETED 2025-02-18**  
> `tenant_variance_analysis` with DB-generated `change_amount` and `change_percentage` (migration 112). `variance_analysis_service.ts` for compute, explain, approve, gate. Material variances without explanation block advance. `computeVariances` called after statement generation. Routes in `close_variance_analysis.ts`.
>
> **Evidence Requirements — Recon Attachments: COMPLETED 2025-02-18**  
> Every reconciliation requires at least one supporting document. `attachEvidenceToReconciliation` + `listEvidenceForReconciliation`. Completion blocked without attachment. Routes: POST/GET `/sessions/:periodId/reconciliations/:reconId/evidence`. Readiness gate: hard check for completed recons missing evidence. Evidence manifest includes `reconciliationEvidence` at certification.
>
> **Evidence Requirements — JE Materiality Threshold: COMPLETED 2025-02-18**  
> JEs at or above `evidence_policy.materiality_threshold` cannot be posted without evidence. Gate in `postJE` before posting. Readiness gate: soft warning for posted JEs above threshold without evidence. Uses existing evidence_policy; file hashing (SHA-256) at upload via `evidence_storage_service.computeSha256`.

---

## SECTION 1: CODEBASE INVENTORY

*Note: Given the size of the codebase (~550+ src files, 109 tests, 98 migrations), this section provides a representative inventory by module. A complete file-by-file listing would exceed 1000 entries; the structure below captures every major area.*

### 1.1 Application Entry & Infrastructure

| File | Purpose | Maps to | Status | Notes |
|------|---------|---------|--------|-------|
| src/server.ts | Express app, route mounting, middleware | — | ALIGNED | Entry point |
| src/startup_validation.ts | Startup checks | — | ALIGNED | Fail-fast validation |
| src/errors.ts | Error types | — | ALIGNED | Application errors |

### 1.2 Routes (API Layer)

| File | Purpose | Maps to | Status | Notes |
|------|---------|---------|--------|-------|
| src/routes/auth.ts | Auth, JWT | Audit Log / Auth | ALIGNED | |
| src/routes/coa.ts | COA upload, list, get | Chart of Accounts | ALIGNED | |
| src/routes/coa_mapping.ts | FS taxonomy, mapping rules | Account Mapping | ALIGNED | |
| src/routes/gl/ingest.ts | GL CSV upload, TB derivation | Ingestion Service | ALIGNED | CSV only |
| src/routes/trial-balance/ingest.ts | TB CSV/XLSX ingest | Ingestion Service | ALIGNED | |
| src/routes/trial-balance/parser.ts | TB parsing, classification | Ingestion Service | ALIGNED | |
| src/routes/trial-balance/classification.ts | Classification, statements | Statement Generator | ALIGNED | |
| src/routes/close/close_sessions.ts | Close session CRUD, certify, reopen, lock | Close Orchestrator, Certification | ALIGNED | |
| src/routes/close/close_adjustments.ts | AJE create/approve/post | Adjusting Entry Service | ALIGNED | |
| src/routes/close/close_journal_entries.ts | JE lifecycle | Adjusting Entry Service | ALIGNED | |
| src/routes/close/close_reconciliation.ts | Reconciliation | Reconciliation Service | ALIGNED | |
| src/routes/close/close_checklist.ts | Close checklist | Close Orchestrator | ALIGNED | |
| src/routes/close/close_evidence_policy.ts | Evidence policy | Certification Service | ALIGNED | |
| src/routes/hitl.ts | HITL staging, resolve | HITL Issue Resolution | PARTIAL | Different lifecycle model |
| src/routes/export.ts | PDF/CSV export | Export Layer | ALIGNED | Export gate enforced |
| src/routes/audit/audit_binder.ts | Audit binder (certified-only) | Certification Service | ALIGNED | |
| src/routes/verification/certification.ts | Artifact verify, public key | Certification Service | ALIGNED | |
| src/routes/precheck.ts | Precheck / board-ready | Validation Engine | ALIGNED | |
| src/routes/justification.ts | IRAC justification chat | AI Advisory Layer | ALIGNED | |
| src/routes/ingestion.ts | Ingestion agent | Ingestion Service | ALIGNED | |
| src/routes/memory.ts | Semantic memory | AI Advisory Layer | ALIGNED | |
| src/routes/tenants.ts | BYOD database_url | Data Model | ALIGNED | |
| src/routes/config.ts | Config API | — | ALIGNED | |
| src/routes/dev_diagnostics.ts | Dev diagnostics | — | EXTRA | Dev-only |

### 1.3 Services (Core Logic)

| File | Purpose | Maps to | Status | Notes |
|------|---------|---------|--------|-------|
| src/services/close_session_service.ts | State machine, certify, reopen, lock | Close Orchestrator, Certification | ALIGNED | |
| src/services/gl_upload_service.ts | GL parse, validate, persist | Ingestion Service | ALIGNED | Uses Decimal.js |
| src/services/gl_to_tb_aggregation_service.ts | GL→TB aggregation | Ingestion Service | ALIGNED | |
| src/services/trial_balance_store_service.ts | TB persistence | Ingestion Service | ALIGNED | |
| src/services/fileIngestion.ts | TB CSV/XLSX parse | Ingestion Service | ALIGNED | |
| src/services/trialBalanceParser.ts | TB parse, D=C | Ingestion Service | ALIGNED | Uses Decimal.js |
| src/services/financialStatements.ts | BS, P&L build | Statement Generator | ALIGNED | Uses decimal utils |
| src/services/cashFlow.ts | CF statement | Statement Generator | ALIGNED | |
| src/services/equityChanges.ts | Equity statement | Statement Generator | ALIGNED | |
| src/services/statement_package_service.ts | Statement packages | Statement Generator | ALIGNED | |
| src/services/certified_statements_service.ts | Certified statements from snapshot | Statement Generator | ALIGNED | Uses Decimal.js |
| src/services/journal_entry_service.ts | JE create, approve, post | Adjusting Entry Service | ALIGNED | |
| src/services/close_adjustments_service.ts | Adjustments, provenance | Adjusting Entry Service | ALIGNED | |
| src/services/adjusted_trial_balance_service.ts | Adjusted TB | Statement Generator | ALIGNED | Uses Decimal.js |
| src/services/integrity_gate_service.ts | D=C, A=L+E | Validation Engine | ALIGNED | Uses decimal |
| src/services/integrity_check.ts | Final integrity check | Validation Engine | ALIGNED | |
| src/services/ledger_snapshot_service.ts | Snapshot create, verify | Certification Service | ALIGNED | |
| src/services/export_gate_service.ts | Export gate (chain, materiality) | Certification Service | ALIGNED | |
| src/services/audit_ledger_service.ts | Audit ledger record | Audit Log | ALIGNED | Hash-chained |
| src/services/persistence_service.ts | HITL staging CRUD | HITL Issue Resolution | PARTIAL | Different schema |
| src/services/hitl_orchestrator.ts | HITL orchestration | HITL Issue Resolution | PARTIAL | Different lifecycle |
| src/services/issue_item_service.ts | Issue items | HITL Issue Resolution | PARTIAL | |
| src/services/evidence_policy_service.ts | Evidence policy | Certification Service | ALIGNED | |
| src/services/deterministic_pattern_detector.ts | Pattern detection (GL) | Validation Engine | ALIGNED | |
| src/services/coa_upload_service.ts | COA upload | Chart of Accounts | ALIGNED | |
| src/services/ai/* (agentic_*.ts) | AI advisory services | AI Advisory Layer | PARTIAL | Mixed; some guardrails |
| src/services/ingestion_agent.ts | Ingestion agent | Ingestion Service | ALIGNED | |
| src/services/bank_pipeline_service.ts | Bank pipeline | Reconciliation Service | ALIGNED | Uses Decimal.js |
| src/services/consolidation_service.ts | Consolidation | Statement Generator | ALIGNED | Uses Decimal.js |
| src/services/fx_currency_service.ts | FX translation | Statement Generator | ALIGNED | Uses decimal |

### 1.4 Repositories (Data Access)

| File | Purpose | Maps to | Status | Notes |
|------|---------|---------|--------|-------|
| src/db/repositories/coa_repository.ts | COA CRUD | Chart of Accounts | ALIGNED | |
| src/db/repositories/general_ledger_repository.ts | GL CRUD | Data Model | ALIGNED | |
| src/db/repositories/close_session_repository.ts | Close sessions | Close Orchestrator | ALIGNED | |
| src/db/repositories/ledger_snapshot_repository.ts | Ledger snapshots | Certification Service | ALIGNED | |
| src/db/repositories/certification_artifact_repository.ts | Certification artifacts | Certification Service | ALIGNED | |
| src/db/repositories/audit_ledger_repository.ts | Audit ledger | Audit Log | ALIGNED | Append-only |
| src/db/repositories/period_trial_balance_repository.ts | Period TB | Data Model | ALIGNED | |
| src/db/repositories/journal_entry_repository.ts | JEs | Adjusting Entry Service | ALIGNED | |
| src/db/repositories/tenant_ai_proposals_repository.ts | AI proposals | AI Advisory (ai_* tables) | ALIGNED | |
| src/db/repositories/tenant_hitl_staging (via persistence) | HITL staging | HITL Issue Resolution | PARTIAL | |

### 1.5 Types

| File | Purpose | Maps to | Status | Notes |
|------|---------|---------|--------|-------|
| src/types/close_session.ts | Close session | Close Orchestrator | ALIGNED | |
| src/types/general_ledger.ts | GL lines, entries | Data Model | ALIGNED | |
| src/types/ledger_snapshot.ts | Snapshot payload | Certification Service | ALIGNED | |
| src/types/certification_artifact.ts | Certification artifact | Certification Service | ALIGNED | |
| src/types/audit_ledger.ts | Audit ledger | Audit Log | ALIGNED | |
| src/types/hitl.ts | HITL staging | HITL Issue Resolution | PARTIAL | |
| src/types/financial.ts | TB, statements | Data Model | ALIGNED | |

### 1.6 Lib / Utils

| File | Purpose | Maps to | Status | Notes |
|------|---------|---------|--------|-------|
| src/utils/decimal.ts | Decimal.js wrapper | Decimal Precision | ALIGNED | Not used everywhere |
| src/lib/ai_boundary.ts | assertNoAiMutationContext | AI Advisory Layer | ALIGNED | |
| src/lib/cert_signing.ts | Ed25519 signing | Certification Service | ALIGNED | |
| src/lib/snapshot_hash.ts | SHA-256 snapshot hash | Certification Service | ALIGNED | |
| src/llm/guardrails.ts | assertNoNumericAmountsInAgentOutput | AI Advisory Layer | ALIGNED | All agentic services guarded (2025-02-10) |

### 1.7 Migrations (Key)

| Migration | Purpose | Maps to | Status |
|-----------|---------|---------|--------|
| 094_tenant_chart_of_accounts.sql | COA | Chart of Accounts | ALIGNED |
| 095_general_ledger.sql | GL | Data Model | ALIGNED |
| 060_period_trial_balance.sql | TB | Data Model | ALIGNED |
| 062_tenant_hitl_staging...sql | HITL staging | HITL Issue Resolution | PARTIAL |
| 065_tenant_close_sessions.sql | Close sessions | Close Orchestrator | ALIGNED |
| 083_ledger_snapshots.sql | Snapshots | Certification Service | ALIGNED |
| 051_audit_ledger.sql | Audit ledger | Audit Log | ALIGNED |
| 089_certification_artifacts.sql | Certification artifacts | Certification Service | ALIGNED |
| 072_tenant_journal_entries.sql | JEs | Adjusting Entry Service | ALIGNED |
| 082_tenant_ai_proposals.sql | AI proposals | AI Advisory (ai_*) | ALIGNED |

---

## SECTION 2: TARGET ARCHITECTURE COVERAGE

### 2.1 Close Orchestrator (State Machine)

**Target:** OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED  
**Target:** Transition gates enforced by validation checks  
**Target:** Period locking and reopening with audit trail  

**What exists (aligned 2025-02-10):**
- Close session states: `open`, `in_progress`, `under_review`, `certified`, `locked`  
  - `src/services/close_session_service.ts`, `src/types/close_session.ts`
- State machine: `ALLOWED_TRANSITIONS` — open→in_progress→under_review; under_review→in_progress (reject) or certify via `certifyCloseSession`; certified→in_progress (reopen) or locked; locked terminal
- Certification from `under_review` (not from locked); lock from `certified` via `lockCloseSession`; reopen via `reopenCloseSession` (reason + audit + HITL issue)
- Readiness checks: `computeReadiness()` gates IN_PROGRESS→UNDER_REVIEW; re-validation at certify
- Migration `098_close_session_state_machine.sql`; tests `tests/unit/close_state_machine.test.ts`

**Status:** ALIGNED. P1 Item 1 (Close State Machine) completed 2025-02-10.

---

### 2.2 Ingestion Service

**Target:** CSV/Excel TB import, account matching to COA, structural validation (D=C, mapping, contra, period-over-period), immutable TB snapshots with hash  

**What exists:**
- TB ingest: `fileIngestion.ts` (CSV, XLSX), `trialBalanceParser.ts`, `parser_utils.ts` — column normalization
- GL ingest: `gl_upload_service.ts` — CSV only (50 MB limit)
- D=C: `parseTrialBalance` (TB), `validateGLEntries` (GL per-entry)
- COA matching: GL validates `account_code` against COA; TB has mapping flow
- Immutable snapshots: `ledger_snapshot_service` — TB + optional GL, hashed (SHA-256)
- TB stored: `period_trial_balance` (uploaded, synced, gl_derived)

**Gap:**
- **Period-over-period comparison:** Not explicit in ingest; exists in variance analysis elsewhere.
- **Contra-type detection:** Soft check; not a first-class ingest validation step.
- **Native float in parsing:** FIXED — all parsing now uses Decimal.js (P0 Item 1 completed 2025-02-10).

---

### 2.3 Chart of Accounts and Mapping Layer

**Target:** Accounts (code, name, type, normal_balance), AccountMapping to reporting line, cash flow classification, reporting taxonomy, mapping versioning  

**What exists:**
- COA: `tenant_chart_of_accounts` (account_code, account_name, account_type, etc.) — migration 094
- Mapping: `coa_mapping` routes, `fs_taxonomy_lines`, `coa_mapping_rules` — migration 068, 069
- Account types: Asset, Liability, Equity, Revenue, Expense
- No explicit `normal_balance` column; type implies it
- Cash flow classification: referenced in mapping/taxonomy; not consistently first-class

**Gap:**
- **normal_balance:** Not stored; inferred from account type.
- **AccountMapping as first-class link:** Mapping exists but schema is more fragmented (fs_taxonomy_lines, coa_mapping_rules).
- **Mapping versioning and audit trail:** Partial; not full version history.

---

### 2.4 Reconciliation Service

**Target:** Per-account recon (GL vs supporting), variance = GL − supporting, tolerance, reconciling items, preparer/reviewer, hard gate for certification  

**What exists (aligned 2025-02-18):**
- `tenant_recon_requirements`, `tenant_period_reconciliations`, `tenant_recon_items` — DB-computed variance, tolerance (migrations 101, 102)
- `period_reconciliation_service.ts`, `recon_completeness_gate.ts`
- No single “reconciliation service” that matches target; logic spread across `close_reconciliation`, bank pipeline, recon repos
- Routes: close_recon_requirements.ts, close_period_reconciliations.ts
- Gate wired into computeReadiness; HITL cascade; bank pipeline bridge deferred but not as a unified “all required recons complete” gate

**Status:** ALIGNED. P1 Item 3 (Reconciliation Gate) completed 2025-02-18. Prior gaps addressed:
- Unified reconciliation service: implemented via period_reconciliation_service.
- Variance: DB computed column in tenant_period_reconciliations.
- **Hard gate “all required recons complete”:** Not clearly enforced in certification checklist.

---

### 2.5 Adjusting Entry Service

**Target:** Three AJE types (recurring, correcting, non-recurring), AJE templates, D=C enforcement, required memo, approval workflow, linkage to original for correcting, immutable once posted  

**What exists:**
- JE service: `createDraftJE`, `proposeJE`, `approveJE`, `postJE` — `journal_entry_service.ts`
- Bridge: `executeBridgeCommand` for CreateDraftJE, ProposeJE, ApproveJE, PostJE
- D=C: Enforced in validation; cannot post imbalanced
- Provenance: `amountProvenance` (ledger_exact, engine_calculation, human_entered)
- Approval: Segregation service, `canPerform` for approve
- Accrual templates: `accrual_deferral_service`, recurring suggestions
- Immutable once posted: Design intent; no explicit DB trigger preventing update

**Gap:**
- **Explicit three AJE types:** Types exist conceptually but not as strict schema enum.
- **Required memo:** Enforced in some paths but not universally.
- **Linkage to original for correcting:** Not first-class (reference to original JE).
- **Immutable trigger:** No DB constraint/trigger; relies on application logic.

---

### 2.6 Statement Generator

**Target:** Deterministic IS, BS, CF, Equity from adjusted TB + mappings; Decimal.js; cross-statement integrity (A=L+E, net income, cash, CF completeness)  

**What exists:**
- `financialStatements.ts` — BS, P&L; uses `round2`, `sumRound2` (decimal)
- `cashFlow.ts`, `equityChanges.ts` — CF, equity
- `integrity_gate_service` — D=C, A=L+E
- `certified_statements_service` — build from snapshot
- All money-handling services now use `Decimal.js` via `utils/decimal.ts` (P0 Item 1 completed 2025-02-10).

**Gap:**
- **Consistent Decimal.js:** FIXED — certified_statements, adjusted_trial_balance, trialBalanceParser, and all other listed services now use Decimal.js.
- **~200 lines of computation:** Logic is spread; not a single “deterministic core” module.

---

### 2.7 Validation Engine

**Target:** Hard checks block certification; soft checks warn; runs after every state change (cascade)  

**What exists:**
- Hard checks: `computeReadiness` (close_checklist_readiness_service), `checkEvidencePolicyForCertification`, Truth Gate in certify
- Soft checks: Various (contra, flux, etc.) in data quality, precheck
- **Cascade (P2 Item 1):** `cascade_engine.executeCascade` runs synchronously after AJE posting, recon complete/approve/reject. Refreshes recon GL balances, invalidates statements, runs computeReadiness, updates HITL issues. See `src/services/cascade_engine.ts`. Adjusted TB is on-demand; statements invalidated (not regenerated) via `statements_stale_since`.
- Export gate: `checkExportGate` — chain, materiality, evidence integrity

**Gap:**
- **Mapping/TB ingest triggers:** Cascade engine supports MAPPING_CHANGED and TB_REINGESTED; wiring pending when period context available.
- **“Runs continuously”:** Validation runs at transition points, not continuously.

---

### 2.8 HITL Issue Resolution System

**Target:** Issue lifecycle DETECTED→ASSIGNED→IN_PROGRESS→RESOLVED→VERIFIED; severity levels; resolution types; auto-resolve on fix; new issues on change  

**Unified (2025-02-10):**
- Table `tenant_close_issues` + history; lifecycle DETECTED→…→VERIFIED/WAIVED
- Service `issue_service.ts`, detection `issue_detection_service.ts`, cascade `issue_auto_resolution_service.ts`; wired after postJE
- Blocking issues gate certification; routes in close_issues.ts; migration 100; legacy tables retained
- Auto-resolve: Some logic; not full cascade of “fix → issue auto-resolves”

**Status: ALIGNED (2025-02-10).** Unified Issue model in `tenant_close_issues`; lifecycle DETECTED→…→VERIFIED/WAIVED; `issue_service.ts`, `issue_detection_service.ts`, `issue_auto_resolution_service.ts`; cascade wired after postJE; blocking issues in certification gate; routes in `close_issues.ts`; migration 100. Legacy staging/issue_items retained.

---

### 2.9 Certification Service

**Target:** Pre-certification checklist, certification record (who, when, hash, validation snapshot), immutable snapshot, period lock, reopen workflow  

**What exists:**
- Pre-check: `computeReadiness`, `checkEvidencePolicyForCertification`, Truth Gate
- Certification: `certifyCloseSession` — from `under_review`; creates snapshot, artifact, signs, records
- Snapshot: `ledger_snapshots` — TB, evidence manifest, optional GL; hash_version 1–4
- Artifact: `certification_artifacts` — signed with Ed25519
- Reopen: `reopenCloseSession` — CERTIFIED→IN_PROGRESS; requires approver role and reason (min 10 chars); audit event `close_session_reopened`; HITL issue created (2025-02-10)
- Lock: `lockCloseSession` — CERTIFIED→LOCKED (terminal); audit event `close_session_locked`

**Gap:**
- **Checklist visibility:** Checklist exists but not as explicit pre-cert UI checklist matching target.

---

### 2.10 AI Advisory Layer

**Target:** AI READ financial data, WRITE only to ai_*; AI never computes dollar amounts; AI never pre-populates financial fields; AI functions as specified  

**What exists:**
- AI proposals: `tenant_ai_proposals` — AI writes here
- `assertNoAiMutationContext` in `executeBridgeCommand`, `certifyCloseSession` — blocks AI from calling mutations
- `assertNoNumericAmountsInAgentOutput` applied in all agentic services that return structured data (2025-02-10): agentic_account_classifier, agentic_ingestion_classifier, agentic_je_suggestions, agentic_ar_ap_workflows, accrual_deferral_service, agentic_materiality_suggestion, agentic_bank_feed_matching, agentic_bank_rec_service, agentic_ledger_to_tb, invoice_to_books_service. Registry in src/llm/guardrails.ts.
- Classifier/Advisor produce proposals; human approves via bridge
- Shadow auditor can block `resolve-ingest` on severity

**CRITICAL CHECK — AI numbers flowing into financial calculations:**
- **Handoff pattern:** Proposals in ai_*; human must approve via bridge. Bridge enforces provenance.
- **Agentic JE suggestions:** `agentic_je_suggestions` returns suggested lines with amounts. These are suggestions; human must enter/confirm. If any path auto-posts AI amounts without explicit human approval, that would be a violation. Audit: `executeBridgeCommand` requires human-originated commands; no direct AI→post path found.
- **CPA decision handler:** Uses `Number(params.amount)` etc. — params are from human/API, not raw AI output. OK if params are validated.
- **Risk:** Any agentic service that returns amounts used in `ApplyHitlAdjustmentToTrialBalance` or similar: the adjustment array is from request body. If frontend pre-fills from AI and user does not explicitly change, the value is still “human-entered” from system perspective. Target requires UI to not pre-fill. Cannot verify UI from backend audit.

**Gap:**
- **UI pre-population:** Not auditable from codebase; would need frontend review.
- **assertNoNumericAmountsInAgentOutput coverage:** FIXED 2025-02-10 — all agentic services that return structured data now apply the guardrail. See src/llm/guardrails.ts registry and src/docs/AI_HANDOFF_AUDIT.md.
- **AI call logging:** `ai_call_log` exists; use varies.

---

### 2.11 Audit Log

**Target:** Append-only log of every action; user, timestamp, action, target, before_state, after_state; never modified or deleted  

**What exists:**
- `audit_ledger` — hash-chained, append-only; event types (close_session_transition, certify_close, staging_approval, etc.)
- `recordMaterialEvent` — inserts with deterministic snapshot
- Migration `091_append_only_triggers.sql` — prevents UPDATE/DELETE
- `audit_log_service` — separate audit log (action, resource, detail)

**Gap:**
- **before_state/after_state:** Audit ledger has `deterministic_flag_snapshot`; not always before/after.
- **Single unified log:** `audit_ledger` vs `audit_log` — two systems; not one canonical log.

---

### 2.12 Data Model

**Target:** Organization→Entities→ChartOfAccounts→Accounts→AccountMapping; ClosePeriods→TB Snapshots, AJEs, Reconciliations, Statements, etc.; separate ai_* tables; Decimal precision  

**What exists:**
- Tenants, entities (implicit via entityId on close sessions)
- COA: `tenant_chart_of_accounts`
- GL: `general_ledger`
- TB: `period_trial_balance`
- Close: `close_sessions`, adjustments, checklist items
- JEs: `tenant_journal_entries`, lines
- Snapshots: `ledger_snapshots`
- Audit: `audit_ledger`
- AI: `tenant_ai_proposals`, `ai_call_log`
- Money: NUMERIC(20,2) or similar in migrations; not consistently Decimal in application

**Gap:**
- **Organization→Entities hierarchy:** Tenant-centric; no explicit Organization entity.
- **ReportingTaxonomy→ReportingLineItems:** Exists as `fs_taxonomy_lines`; structure differs.
- **Decimal in DB:** NUMERIC used; application sometimes uses native float before persistence.

---

### 2.13 Decimal Precision

**Target:** All money calculations use Decimal.js; no native JS float for dollar amounts  

**Status: FIXED (P0 Item 1 completed 2025-02-10)**

All previously listed files now use Decimal.js. See Section 3.4 for full status.

**What exists:**
- `utils/decimal.ts` — Decimal.js wrapper (sumRound2, round2, minus, plus, absGt, etc.)
- All money-handling paths now use decimal utils (gl_upload, trialBalanceParser, parser_utils, bank_pipeline, certified_statements, adjusted_trial_balance, integrity_gate, etc.)

**Gap:**
- None remaining for decimal precision.

---

## SECTION 3: CRITICAL VIOLATIONS

### 3.1 AI computes dollar amounts
- **Status:** No direct path where AI output flows into financial calculation. Proposals go to ai_*; bridge requires human-originated commands. **P0 Item 2 (2025-02-10):** All agentic services that return structured data now apply `assertNoNumericAmountsInAgentOutput`; when LLM output contains debit/credit/amount numbers, the guardrail throws and services return fallback (no AI amounts used).
- **Risk:** UI could pre-fill from AI; backend cannot detect. **Severity: MEDIUM** (requires frontend audit).

### 3.2 AI writes to financial tables
- **Status:** AI writes to `tenant_ai_proposals` (ai_*). `executeBridgeCommand` is the only mutation path for financial tables; it asserts `assertNoAiMutationContext`.
- **No violation found.** ✅

### 3.3 AI pre-populates financial fields
- **Status:** Cannot verify from backend; requires UI audit.
- **Severity: MEDIUM**

### 3.4 Native floating-point for money

**Status: FIXED — All files now use Decimal.js** (P0 Item 1 completed 2025-02-10)

| File | Prior Violation | Status |
|------|-----------------|--------|
| src/services/gl_upload_service.ts | parseFloat in parseGlAmount | **FIXED** — uses round2, from; throws on invalid |
| src/services/trialBalanceParser.ts | parseFloat, totalDebits += | **FIXED** — uses round2, from, sumRound2, absLt |
| src/services/trial-balance/parser_utils.ts | parseFloat | **FIXED** — uses round2, from |
| src/services/trial-balance/helpers.ts | Number(), Math.max | **FIXED** — uses round2, from |
| src/services/agentic_ledger_to_tb.ts | parseFloat | **FIXED** — uses round2, from |
| src/services/gl_to_tb_aggregation_service.ts | native +=, reduce | **FIXED** — uses plus, minus, sumRound2, round2 |
| src/services/adjusted_trial_balance_service.ts | existing.debit += | **FIXED** — uses plus() |
| src/services/trial_balance_rollup_service.ts | existing.debit += | **FIXED** — uses plus() |
| src/services/integrity_gate_service.ts | totalDebits +=, Math.abs | **FIXED** — uses sumRound2, plus, round2, from |
| src/services/certified_statements_service.ts | totalDebits +=, reduce | **FIXED** — uses plus, sumRound2, absLt |
| src/services/bank_pipeline_service.ts | parseFloat, += for totals | **FIXED** — uses round2, from, plus, minus |
| src/services/precheck_board_ready_service.ts | Number(), += | **FIXED** — uses round2, from, plus |
| src/services/export_service.ts | Number(r.debit) | **FIXED** — uses round2 |
| src/services/ingestion_agent.ts | parseFloat, pickNumber | **FIXED** — uses round2, from |

### 3.5 Uncertified statement access
- **Status:** Export and audit binder require certified session. `checkExportGate` enforces chain, materiality, evidence. Draft export exists but is explicitly labeled draft.
- **No violation found.** ✅

### 3.6 Missing audit trail
- **Status:** `recordMaterialEvent` used for close transitions, certify, staging. Bridge records events. Some mutation paths may not record; full audit of every write would be needed.
- **Potential gap:** Not every single state change audited in one canonical log; two log systems (audit_ledger vs audit_log).
- **Severity: MEDIUM**

---

## SECTION 4: WHAT EXISTS BUT ISN'T IN THE TARGET ARCHITECTURE

| Component | Description | Recommendation |
|-----------|-------------|----------------|
| Ingestion agent (multi-type) | Classifies bank, tax, AP, etc.; routes to specialists | KEEP; fits Ingestion Service |
| Pipelines (bank, AP/AR aging, payroll) | Bank tx, aging, accruals | KEEP; fits Reconciliation / AJE |
| Vector store / RAG | Justification, precedent | KEEP; fits AI Advisory |
| Knowledge base (tiered) | Global/Firm/Session | KEEP; fits AI Advisory |
| CFA agents (Monte Carlo, Dupont, etc.) | Financial analysis | KEEP or REFACTOR; advisory only |
| CPA brain, supervisor | Agent orchestration | KEEP; ensure AI boundary |
| Accounting integrations (QBO, Xero, NetSuite) | Sync TB, push JE | KEEP; extends Ingestion |
| Leases, revenue recognition, SBC, etc. | Domain modules | KEEP; extend Statement Generator |
| Risk context (conflicts, liquidity) | Risk/conflict tracking | KEEP; fits Validation / HITL |
| Shadow auditor | AI audit checks | KEEP; fits AI Advisory, must remain advisory |
| Dev diagnostics | Dev-only API | KEEP for dev; exclude from prod |
| BYOD (tenant database_url) | Per-tenant DB | KEEP; multi-tenant architecture |

---

## SECTION 5: PRIORITY REFACTORING ROADMAP

### P0 — Critical (architectural violations)

| Item | Complexity | Dependencies | Files Affected |
|------|------------|--------------|----------------|
| Replace all native float with Decimal.js in money paths | High | None | trialBalanceParser, gl_upload_service, parser_utils, bank_pipeline_service, certified_statements_service, adjusted_trial_balance_service, trial_balance_rollup_service, integrity_gate_service, precheck_board_ready_service, export_service, helpers, ingestion_agent, agentic_ledger_to_tb |
| ~~Add assertNoNumericAmountsInAgentOutput to all agentic outputs~~ | — | **DONE 2025-02-10** | agentic_je_suggestions, agentic_ar_ap_workflows, accrual_deferral_service, agentic_materiality_suggestion, agentic_bank_feed_matching, agentic_bank_rec_service, agentic_ledger_to_tb, invoice_to_books_service + classifiers |

### P1 — Core functionality gaps

| Item | Complexity | Dependencies | Files Affected |
|------|------------|--------------|----------------|
| ~~Align close state machine with target (OPEN→…→LOCKED)~~ **DONE 2025-02-10** | — | — | — |
| Unified reconciliation service with variance as computed column | High | Schema changes | recon services, migrations |
| HITL Issue lifecycle (DETECTED→…→VERIFIED) and resolution types | Medium | Schema, UI | hitl, persistence, issue_item_service |
| ~~Reopen workflow with authorization and documentation~~ **DONE 2025-02-10** | — | — | — |

### P2 — Important (before production)

| Item | Complexity | Dependencies | Files Affected |
|------|------------|--------------|----------------|
| Single audit log with before_state/after_state | Medium | Migration | audit_ledger_service, audit_log_service |
| AJE required memo enforcement | Low | None | journal_entry_service, bridge |
| Cascade principle: sync recalc after every state change | High | Performance | Multiple services |
| Central validation check registry | Medium | None | close_checklist_readiness_service, validation services |
| Recon completeness as explicit certification gate | Medium | Reconciliation service | close_checklist_readiness_service |

### P3 — Nice to have

| Item | Complexity | Dependencies | Files Affected |
|------|------------|--------------|----------------|
| normal_balance on accounts | Low | Migration | coa, migrations |
| Mapping versioning and audit trail | Medium | Schema | coa_mapping, migrations |
| DB trigger for JE immutability once posted | Low | Migration | migrations |
| Frontend audit for AI pre-population | — | UI codebase | N/A |

---

## SECTION 6: REFACTORING ORDER

1. **Decimal precision (P0)** — Fix all native float usage in money paths. No dependencies. Unblocks certification guarantee.

2. **AI guardrails (P0)** — DONE 2025-02-10. assertNoNumericAmountsInAgentOutput applied to all identified agentic services; handoff audit in src/docs/AI_HANDOFF_AUDIT.md.

3. **Close state machine (P1)** — DONE 2025-02-10. States: open→in_progress→under_review→certified→locked; certify from under_review; lock and reopen implemented.

4. **HITL/Issue model (P1)** — Introduce Issue lifecycle and resolution types. Depends on schema migration. Can run parallel to state machine.

5. **Reconciliation service (P1)** — Unify recon logic and add recon completeness gate. Depends on schema clarity for “required recons.”

6. **Reopen workflow (P1)** — DONE 2025-02-10. reopenCloseSession with reason, audit, HITL issue.

7. **Audit log unification (P2)** — DONE 2025-02-18. audit_ledger extended; audit_service; audit_log_service deprecated.

8. **Cascade principle (P2)** — DONE 2025-02-18. `cascade_engine.executeCascade` orchestrates sync recalc after AJE, recon mutations.

9. **Validation registry (P2)** — Central list of hard/soft checks. Can be done incrementally.

10. **Remaining P2/P3** — As capacity allows.

---

## Top 5 Most Critical Findings (Verbal Summary)

1. **Native floating-point for money (CRITICAL):** ~~Previously used parseFloat, Number(), native +=~~ **FIXED 2025-02-10** — All 14 files now use Decimal.js via utils/decimal.ts.

2. **Close state machine order mismatch (HIGH):** Target: OPEN→IN_PROGRESS→UNDER_REVIEW→CERTIFIED→LOCKED. CPACFA: draft→…→locked→certified. Certification happens after lock in CPACFA; target has certify then lock. Semantics and workflow differ.

3. **HITL model divergence (HIGH):** Target has Issue lifecycle (DETECTED→ASSIGNED→IN_PROGRESS→RESOLVED→VERIFIED) and resolution types. CPACFA has staging (pending/approved/rejected) and issue items as separate concepts. Resolution types and auto-resolve cascade are not fully implemented.

4. **AI amount guardrail coverage:** FIXED 2025-02-10. `assertNoNumericAmountsInAgentOutput` now applied in all agentic services that return structured data (JE suggestions, AR/AP workflows, accrual, materiality, bank matching, bank rec, ledger-to-TB, invoice coding, and both classifiers).

5. **Reconciliation completeness gate (MEDIUM):** Target requires “all required reconciliations complete” as a hard certification gate. CPACFA has evidence policy and readiness checks, but a unified “recon completeness” gate is not clearly implemented.
