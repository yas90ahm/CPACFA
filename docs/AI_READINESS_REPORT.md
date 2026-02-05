# AI Readiness Report — Backend

**Role:** Skeptical CTO + Staff Engineer (read-only investigation)  
**Goal:** Determine existing AI-related capabilities, gaps, and exact insertion points for the 4 AI pillars (Classifier, Advisor, Shadow Auditor, Justifier).  
**Assumption:** Claude connected; no structured prompts or orchestration. All inferences from code, migrations, services, routes, and tests.

---

## 1) Architecture Discovery

### Ingestion flow

| Step | Responsibility | Exact files / services |
|------|----------------|------------------------|
| File upload | Route receives file; multer memoryStorage | `src/routes/trial-balance/ingest.ts` (POST `/ingest`), `src/routes/ingestion.ts` (POST `/agent`, `/pipeline`) |
| Parse CSV/XLSX | Canonical column mapping; raw rows | `src/services/fileIngestion.ts` (`ingestTrialBalanceFile`, `parseCsvToTrialBalance`, `parseXlsxToTrialBalance`) |
| Column standardization | Messy headers → debit/credit/amount | `src/services/trial-balance/parser_utils.ts` (`standardizeColumns`, `standardizedRowsToTrialBalanceRows`, `hasCanonicalDebitCredit`) |
| “Messy lines” → structured rows | Raw rows become `RawTrialBalanceRow[]`; `needsAgenticMapping` when no canonical debit/credit | `src/services/fileIngestion.ts` (above); `src/services/trialBalanceParser.ts` (parse to TB entries) |
| Optional agentic classification | TB account names → ASSET/LIABILITY/… (when `useAgenticClassification=true`) | `src/services/accountClassifier.ts` (`classifyTrialBalance` → `classifyAccountsAgentic` in `src/services/agentic_account_classifier.ts`) |
| Save unadjusted TB | Persist to tenant + period | `src/services/persistence_service.ts` (bridge) + `src/bridge/protocol_bridge.ts` (`SaveTrialBalance`) → `src/services/trial_balance_store_service.ts` (`saveUnadjustedFromUpload`) / `period_trial_balance_repository` |
| Build statements | TB → BS, P&L, cash flow, equity | `src/services/statementGenerator.ts`, `src/services/financialStatements.ts`; opts from `accountClassifier` (deterministic or preClassified) |
| Ingestion agent (separate API) | File type detection, document classification (bank/tax/TB/…), routing | `src/services/ingestion_agent.ts` (`runIngestionAgent`), `src/services/agentic_ingestion_classifier.ts` (`classifyIngestionAgentic`) |

**Ingestion entry points:**  
- **Trial balance:** `src/routes/trial-balance/ingest.ts` → `fileIngestion` → `trialBalanceParser` → (optional) `classifyTrialBalance` → bridge `SaveTrialBalance` / `getAdjustedTrialBalance` → `buildValidatedStatements` / `generateStatements`.  
- **Generic ingestion agent:** `src/routes/ingestion.ts` → `runIngestionAgent` (file type + LLM classification).

---

### Staging / “Forge” (HITL)

| Responsibility | Exact files / services |
|----------------|------------------------|
| Staging area (proposed action + justification) | `src/services/hitl_orchestrator.ts` (`submitToStaging`, `getStagingArea`, `getStagingItem`) |
| Persistence of staging items | `src/services/persistence_service.ts` (`createStagingItem`, `updateStagingStatus`, …) → DB `tenant_hitl_staging` |
| Resolve ingest (imbalanced TB) | `src/routes/hitl.ts` POST `/resolve-ingest`; applies human-supplied adjustment via bridge | `src/bridge/protocol_bridge.ts` (`ResolveIngest`) |
| Approve / reject staging | `src/routes/hitl.ts` POST `/resolve` (approve/reject); records to audit ledger | `src/services/audit_ledger_service.ts` (`recordOverride`) |
| “Forge” = approved adjustments merged into TB | Not a single “Forge” service; adjusted TB = unadjusted + approved HITL + posted close adjustments | `src/services/adjusted_trial_balance_service.ts` (`getAdjustedTrialBalance` → `mergeAdjustmentsIntoEntries`; uses `getUnadjustedOrRollup`, `getPostableJEAdjustments`, `listAdjustments`) |

**Flow:** Proposals (e.g. from `proposeTrialBalanceAdjustment` tool) → `submitToStaging` → stored in `tenant_hitl_staging` → human approve/reject → on approve, bridge applies to TB or close adjustments; adjusted TB is computed by `adjusted_trial_balance_service`.

---

### JE creation paths

| Path | Responsibility | Exact files / services |
|------|----------------|------------------------|
| Create draft JE | Validate balanced; insert JE + lines | `src/services/journal_entry_service.ts` (`createDraftJE`), `src/db/repositories/journal_entry_repository.ts` |
| Propose JE | draft → proposed | `journal_entry_service.ts` (`proposeJE`) |
| Approve / reject JE | proposed → approved (segregation) or rejected | `journal_entry_service.ts` (`approveJE`, `rejectJE`) |
| Post JE | approved → posted; **Shadow Auditor runs first**; then `recordMaterialEvent` + `ensureJustificationForPostedJE` | `journal_entry_service.ts` (`postJE`) → `shadow_auditor_service.runPrePostChecksAndStore` |
| Export JE | posted → exported | `journal_entry_service.ts` (`exportJE`) |
| JE as “suggestions” into close | Add JE suggestions to adjustments queue | `src/services/close_adjustments_service.ts` (`addJEAsAdjustments`); called from `src/routes/close/close_adjustments.ts`, `src/routes/close/close_closing_entries.ts` |
| Advisor-style proposal (to staging) | Tool proposes debit/credit; goes to HITL staging | `src/agents/tools/proposeTrialBalanceAdjustment.ts` → `submitToStaging` |

**Routes:** `src/routes/close/close_journal_entries.ts` (CRUD, propose, approve, reject, post, export).

---

### Posting / locking / certification

| Step | Responsibility | Exact files / services |
|------|----------------|------------------------|
| Close session status | draft → in_progress → ready_for_review → finalized → locked → certified | `src/services/close_session_service.ts` (transitions); `src/db/repositories/close_session_repository.ts` |
| Readiness (hard blockers) | Checklist, cash rec, critical issues, draft/proposed JEs, audit ledger chain, rounding | `src/services/close_checklist_readiness_service.ts` (`computeReadiness`); uses `journal_entry_repository`, `audit_ledger_service.verifyChain`, etc. |
| Lock | Allowed only from finalized; requires readiness | `close_session_service.ts` (status transition) |
| Certify | Only from locked; no hard blockers; approver role; writes `certify_close` to audit ledger | `src/services/close_session_service.ts` (`certifyCloseSession`), `src/db/repositories/close_session_repository.ts` (`updateCertification`) |
| Route | POST `/api/close/sessions/:id/certify` | `src/routes/close/close_sessions.ts` |

---

### Export / binder generation

| Endpoint / path | Responsibility | Exact files / services |
|-----------------|----------------|------------------------|
| POST `/api/export/pdf` | exportMode draft/certified; certified requires closeSessionId + session certified + gates | `src/routes/export.ts`; `src/services/pdf_export.ts` (`createPdfFromStructuredPayload`); `export_gate_service.checkExportGate`, `integrity_check.finalIntegrityCheck` |
| POST `/api/export/csv` | Same mode/gate logic; CSV with confidence column | `src/routes/export.ts`; `src/services/export_service.ts` (`generateCsvWithConfidence`) |
| GET `/api/audit/binder` | Certified only; closeSessionId required; run binder gates then build binder JSON | `src/routes/audit/audit_binder.ts`; `src/services/audit_export_service.ts` (`buildAuditBinder`) |
| GET `/api/audit/binder/export/pdf` | Certified only; gates then PDF | `audit_binder.ts`; `src/services/audit_binder_export_service.ts` (`exportAuditBinderToPdf`) |
| GET `/api/audit/binder/export/csv` | Certified only; gates then CSV | `audit_binder.ts`; `audit_binder_export_service` (`exportAuditBinderToCsv`) |
| GET `/api/audit/draft-package` | Draft-only PDF of same content with watermark | `audit_binder.ts`; `audit_binder_export_service.exportDraftPackageToPdf` |
| Export gates | Chain verification, period_export_checks (materiality), optional CPA-CFA conflicts | `src/services/export_gate_service.ts` (`checkExportGate`); `src/services/audit_ledger_service.ts` (`verifyChain`) |
| Truth Gate before export | Balance equation + optional plug/Suspense detection | `src/services/integrity_check.ts` (`finalIntegrityCheck`); `src/services/integrity_gate_service.ts` (`runIntegrityGate`, `detectSuspiciousPlugs`) |

---

### Justification storage

| Responsibility | Exact files / services |
|----------------|------------------------|
| Create justification (IRAC) linked to hitl_staging, close_adjustment, journal_entry, export, ingest | `src/services/justification_service.ts` (`createJustification`); `src/db/repositories/tenant_justifications_repository.ts` |
| Ingestion integrity memo | After successful TB ingest | `justification_service.ts` (`createIngestionIntegrityMemo` → `registerJustificationForPeriod`) |
| Bridge adjustment memo | After executeAgentRecommendation (deterministic) | `justification_service.ts` (`createBridgeAdjustmentJustification`) |
| Ensure justification for posted JE | After postJE; creates minimal memo if none | `justification_service.ts` (`ensureJustificationForPostedJE`) |
| Justification chat (RAG + LLM) | POST `/api/justification/chat`; IRAC with FASB/IFRS chunks | `justification_service.justifyWithRAG`; `src/routes/justification.ts` |
| List / audit-defense export | Get by period; export PDF | `justification_service.getJustificationsForPeriod`, `buildAuditDefenseHtml`, `exportAuditDefensePDF`; `src/routes/justification.ts` |

**Schema:** `tenant_justifications` (id, tenant_id, period_label, related_type, related_id, irac_json, memo_markdown, prompt_version, model, inputs_hash, …).

---

### Audit ledger

| Responsibility | Exact files / services |
|----------------|------------------------|
| Append-only hash-chained log | One record per event; previous_entry_hash, entry_hash | `src/db/repositories/audit_ledger_repository.ts` (`appendEntry`); `src/types/audit_ledger.ts` (event types) |
| Record override (staging approve/reject, etc.) | Before updating staging/flag status | `src/services/audit_ledger_service.ts` (`recordOverride`) |
| Record material event (e.g. je_posting, certify_close) | No user rationale required | `audit_ledger_service.ts` (`recordMaterialEvent`) |
| Record observation | Professional review, etc. | `audit_ledger_service.ts` (`recordObservation`) |
| Verify chain | Used by export gate and close readiness | `audit_ledger_service.verifyChain` → `audit_ledger_repository.verifyChain` |
| Event types | staging_approval, staging_rejection, certify_close, je_posting, user_induced_variance, integrity_gate_bypass, … | `src/types/audit_ledger.ts` |

---

## 2) Existing AI or “AI-like” code

### What exists (in use)

| Area | What | Where |
|------|------|--------|
| LLM provider | Anthropic (default), OpenAI, Mistral; `generateText` | `src/llm/provider.ts` |
| LLM call with fallback | Single place try/catch + parse + fallback | `src/llm/callWithFallback.ts` |
| Guardrails | No numeric amounts in agent output; data-grounding rule | `src/llm/guardrails.ts` (`assertNoNumericAmountsInAgentOutput`, `DATA_GROUNDING_RULE`) |
| Account classification (agentic) | Classify account names → ASSET/LIABILITY/… via LLM | `src/services/agentic_account_classifier.ts` (`classifyAccountsAgentic`) |
| Classification orchestration | Deterministic base + optional agentic overrides; used in ingest when `useAgenticClassification=true` | `src/services/accountClassifier.ts` (`classifyTrialBalance`, `getClassificationSuggestions`, `applyUserClassificationOverrides`) |
| Ingestion classifier | Document type (bank_statement, tax_form, trial_balance, …) + routing | `src/services/agentic_ingestion_classifier.ts`; used by `ingestion_agent.ts` |
| Justification (RAG + LLM) | IRAC Analysis/Conclusion from FASB/IFRS chunks; Claude | `src/services/justification_service.ts` (`justifyWithRAG`, `generateIRACAnalysisAndConclusion`) |
| Professional review | Five protocols (substance-over-form, revenue, GIPS, going concern, fraud); some use LLM | `src/services/professional_review_service.ts`; `judgment_substance_over_form.ts` (LLM), `judgment_revenue_recognition.ts`, etc. |
| Numerous “agentic” helpers | Narratives, suggestions, variance drivers, disclosures, accruals, revenue, lease, deferred tax, etc. | Many under `src/services/agentic_*.ts` (e.g. `agentic_disclosure_suggestions`, `agentic_approval_summary`, `agentic_cash_flow_narrative`, …) |
| Supervisor / tools | proposeTrialBalanceAdjustment, buildFinancialStatements, classifyAccount, etc. | `src/agents/tools/*.ts`; Supervisor in `src/agents/Supervisor.ts` (and experimental) |

### What is stubbed or optional

| Item | Evidence |
|------|----------|
| Agentic classification in ingest | Opt-in via `useAgenticClassification=true` in body; otherwise deterministic only |
| Agentic column mapping | `needsAgenticMapping` returned by fileIngestion; comment says “agentic mapping should be triggered” but ingest returns 400 and tells user to fix columns or use HITL resolve-ingest (no LLM column guess in main path) |
| Supervisor route | Dev route `/api/dev/supervisor` returns 410 “Quarantined”; “Supervisor moved to /experimental” |
| Export “agent_context” | Export route accepts `agent_context` for narrative; export_service can generate narrative via LLM when keys present; not wired as a single orchestrated flow |

### What is unused or orphaned

| Item | Evidence |
|------|----------|
| Some agentic services | Many `agentic_*` services exist but are only used from specific routes (e.g. onboarding, pipelines, trial-balance classification); no single “orchestrator” that runs them in a standard close flow |
| ReconcileCPAwithCFA tool | Deleted per git status (`src/agents/tools/reconcileCPAwithCFA.ts` removed) |
| Lead partner / unified orchestrator | `lead_partner_orchestrator`, `unified_orchestrator` deleted |

### What is missing entirely

| Gap | Note |
|-----|------|
| Structured prompts / prompt registry | No central prompt versioning or A/B; prompts are inline in services |
| Orchestration layer | No single “close workflow” that invokes Classifier → Advisor → Shadow Auditor → Justifier in sequence |
| Shadow Auditor AI | Shadow Auditor is **deterministic only** (restricted accounts, negative amounts, zero lines, materiality threshold); no LLM “audit” of JE before post |
| Justifier as a pillar | Justification exists (RAG chat, ingestion memo, JE memo, bridge memo) but no dedicated “finalize and write memo” step that runs at a single “before export” or “after certify” hook with structured inputs |
| Classifier at “first touch” | Agentic classification runs only when ingest explicitly requests it; no mandatory “classify every new line” step right after parse |
| Advisor as a single service | Draft adjustments and JE suggestions exist (close_adjustments, proposeTrialBalanceAdjustment tool, closing entries); no single “Advisor” service that takes TB + context and returns suggested adjustments with provenance |

---

## 3) Clean insertion points for each pillar

### Classifier

- **Where messy lines first become structured:**  
  Right after raw rows are produced and (optionally) normalized to TB entries. The first structured representation is `TrialBalanceEntry[]` (accountName, debit, credit, accountCode).  
- **Exact file and function that should receive classification output:**  
  - **File:** `src/services/accountClassifier.ts`  
  - **Function:** Callers that today call `classifyTrialBalance(entries)` or `classifyTrialBalanceDeterministic(entries)` and then pass result into statement build. The **receiving** side is statement build: `statementGenerator.ts` / `financialStatements.ts` which expect entries with `accountType` (and optionally `codificationRef`). So the function that **consumes** classification is the one that builds BS/P&L from TB (e.g. `generateStatements` / `buildValidatedStatements` with `preClassifiedEntries` or classified entries).  
- **Recommended hook for “Classifier” pillar:**  
  - **File:** `src/routes/trial-balance/ingest.ts` (and/or `src/services/trialBalanceParser.ts` if you want a single place for “parsed TB → classified TB”).  
  - **Function:** Immediately after `parseTrialBalance(...)` (or equivalent) returns `trialBalance.entries`, call the Classifier. Today ingest calls `classifyTrialBalance(trialBalance.entries)` only when `useAgenticClassification === true`.  
  - **Insertion point:** In `ingest.ts`, the block that sets `preClassified` / `classifiedEntries` (around 282–310). The **exact function to call** with Classifier output is the same one that today receives `preClassified` / result of `classifyTrialBalance`: the code path that builds `stmtOpts` and `buildOpts` and then calls `generateStatements` / `buildValidatedStatements`. So the “function that should receive classification output” is effectively **`generateStatements` / `buildValidatedStatements`** (they already accept `preClassifiedEntries`). The **hook for the pillar** is: immediately after obtaining `trialBalance.entries`, call the Classifier (your structured prompt), then pass its output into `stmtOpts.preClassifiedEntries` / `buildOpts.preClassifiedEntries`.  
  - **Why:** This is where TB entries are first available and before any statement build or save; putting Classifier here keeps “messy lines → structured + classified” in one place and avoids double classification.

### Advisor

- **Where draft adjustments or suggestions are created:**  
  - Close adjustments (JE suggestions, accrual suggestions) are added via `close_adjustments_service.addJEAsAdjustments` / `addAccrualsAsAdjustments`, called from `src/routes/close/close_adjustments.ts` and `src/routes/close/close_closing_entries.ts`.  
  - The **tool** that proposes TB adjustments to staging is `proposeTrialBalanceAdjustment` → `submitToStaging` (no direct call from a single “Advisor” service).  
- **Exact file and function a “Advisor” service should be called from:**  
  - **File:** `src/services/close_adjustments_service.ts` or a new “Advisor” facade that is invoked when the close workspace needs suggestions.  
  - **Function:** Either (a) before `addJEAsAdjustments` — i.e. a new function e.g. `getSuggestedAdjustments(tenantId, periodLabel, context)` that returns `JournalEntrySuggestion[]` / close adjustment payloads, and the route or close workflow calls that then `addJEAsAdjustments(periodLabel, suggestions, ...)`, or (b) the existing route that adds JE suggestions: `src/routes/close/close_adjustments.ts` (POST that receives `suggestions` in body). So the **caller** that should invoke the Advisor is whoever today sends `suggestions` to that route — i.e. the frontend or an orchestration job. The **service** that should implement the Advisor is a new (or extended) service that, given TB summary + mappings + context, returns those suggestions; it should be called from the same place that currently would prepare `body.suggestions` (e.g. a “get suggestions” endpoint or a close step).  
  - **Concrete insertion:** Add a function, e.g. in `src/services/close_adjustments_service.ts` or `src/services/advisor_service.ts`, such as `getJESuggestionsForPeriod(tenantId, periodLabel, pool, options)`. The **call site** is either a new route GET/POST `/api/close/suggestions` or the existing close workflow when it needs to “fill” the adjustments queue. So:  
  - **File (caller):** `src/routes/close/close_adjustments.ts` or `src/routes/close/close_closing_entries.ts` (or a new route).  
  - **Function (to implement Advisor):** e.g. `getJESuggestionsForPeriod` / `recommendAdjustments` that returns suggestions; then the existing `addJEAsAdjustments` continues to validate provenance and persist.  
  - **Why:** This is where draft adjustments are already created and queued; the Advisor pillar should be the thing that **produces** those suggestions (TB summary, mappings, context → suggested JEs with provenance).

### Shadow Auditor

- **Final “before posting” checkpoint:**  
  `postJE` in `src/services/journal_entry_service.ts`: it runs **`runPrePostChecksAndStore`** (Shadow Auditor) and blocks when `severity === 'block'`.  
- **Function that blocks posts today:**  
  - **File:** `src/services/journal_entry_service.ts`  
  - **Function:** `postJE`. It calls `runPrePostChecksAndStore` from `src/services/shadow_auditor_service.ts`; if `shadowResult.severity === 'block'`, it throws `JournalEntryError(..., 'SHADOW_AUDIT_BLOCK')`.  
- **Insertion point for Shadow Auditor pillar (AI):**  
  - **File:** `src/services/shadow_auditor_service.ts`  
  - **Function:** `runPrePostChecks` (deterministic) and/or `runPrePostChecksAndStore`. Today `runPrePostChecks` is purely rule-based (restricted accounts, negative amounts, zero lines, materiality). The **clean insertion** is: inside `runPrePostChecksAndStore`, after calling `runPrePostChecks`, call a new **AI Shadow Auditor** function with the same inputs (JE payload, lines, periodLabel, tenantId): e.g. `runShadowAuditLLM(input)`. Append its findings to `flags` and if it returns a “block” severity, set `severity = 'block'`. So the exact function that should host the AI check is **`runPrePostChecksAndStore`** (or a new `runPrePostChecksAndStoreWithAI` that delegates to the existing one and then adds LLM findings).  
  - **Why:** This is the only place that runs before JE post and can block it; adding an LLM step here keeps “deterministic + AI” in one audit checkpoint.

### Justifier

- **Where adjustments/exports are finalized:**  
  - Adjustments are “finalized” when approved (HITL) or when JEs are posted; exports are finalized when the user requests certified export (session already certified).  
  - Justifications are stored when: ingestion completes (`createIngestionIntegrityMemo`), JE is posted (`ensureJustificationForPostedJE`), HITL approval (`createJustification` from hitl route), or chat (`justifyWithRAG` + register).  
- **Where memos should be generated and persisted:**  
  - For **adjustments:** When an adjustment is approved (HITL approve) or when a JE is posted — already partially done via `ensureJustificationForPostedJE` and `createJustification` in hitl.  
  - For **export:** Right before or after a certified export (or at certification time). Today there is no single “finalize export and write memo” step; the binder includes justifications from `getJustificationsForPeriod`.  
- **Exact file and function for Justifier pillar:**  
  - **File:** `src/services/justification_service.ts` (extend) and/or the place that runs at “finalize” time.  
  - **Functions:**  
    - For **posted JE:** Already `ensureJustificationForPostedJE` — extend it to call a Justifier (e.g. “given this JE + rule refs, produce IRAC memo”) when no justification exists, then persist via `createJustification`.  
    - For **certified close / export:** Add a hook that runs when session is certified or when certified export is requested: e.g. in `src/routes/export.ts` after `finalIntegrityCheck` passes and before generating PDF, or in `close_session_service.certifyCloseSession` after `updateCertification`, call a new function e.g. `createCertificationMemo(sessionId, periodLabel, facts, ruleRefs)` that uses the Justifier (LLM + RAG) and persists to `tenant_justifications` with `relatedType: 'export'` or a new type.  
  - **Concrete insertion:**  
    - **File:** `src/services/justification_service.ts`  
    - **Function to add:** e.g. `createFinalizationMemo(params: { periodLabel, tenantId, pool, relatedType, relatedId, factsSummary, ruleRefs[] })` that calls the same IRAC/RAG stack as `justifyWithRAG` and then `createJustification`.  
    - **Call sites:** (1) `journal_entry_service.postJE` after `ensureJustificationForPostedJE` — optionally enhance so that if we want a “full” memo we call `createFinalizationMemo` for that JE. (2) In `src/routes/export.ts` for certified path, after gates pass, call `createFinalizationMemo` for the export event (or in `certifyCloseSession` for the certification event).  
  - **Why:** Justifications are already centralized here; adding a single “finalize and persist memo” entry point keeps the Justifier pillar in one place and reuses RAG + IRAC.

---

## 4) Data availability check

### Classifier

| Need | Status | Explanation |
|------|--------|-------------|
| Descriptions, accounts, amounts | **READY** | TB entries from ingest have `accountName`, `accountCode`, `debit`, `credit`; optional description in raw rows. `TrialBalanceEntry` and parser output provide enough for “account name → type” prompts. |
| Optional: prior period / mappings | **PARTIAL** | Prior TB and CoA mappings exist (e.g. coa_mapping, onboarding suggest); not always passed into the current classification call. |

### Advisor

| Need | Status | Explanation |
|------|--------|-------------|
| TB summary | **READY** | Adjusted TB available via `getAdjustedTrialBalance`; entries with account, debit, credit. |
| Mappings | **PARTIAL** | CoA mapping rules and onboarding suggestions exist; not all close paths pass them into one “Advisor” call. |
| Context (period, close state, issues) | **PARTIAL** | Close session, readiness, issue items, and checklist exist; would need to be assembled into one context payload for the Advisor. |

### Shadow Auditor

| Need | Status | Explanation |
|------|--------|-------------|
| JE payloads | **READY** | `PrePostCheckInput` has `journalEntry`, `lines` (accountRef, debit, credit); memo/source on JE. |
| Provenance | **PARTIAL** | JE lines don’t currently carry amountProvenance in DB; provenance is enforced for **suggestions** (amount_provenance, proposeTrialBalanceAdjustment). For posted JE, we have creator/approver and memo. |
| Rules | **READY** | Deterministic rules (restricted accounts, materiality) are in env/config; rule references for an AI auditor can be passed (e.g. from shared/config or integrity_gate). |

### Justifier

| Need | Status | Explanation |
|------|--------|-------------|
| Final facts | **PARTIAL** | For JEs we have JE + lines; for export we have binder content and period. No single “final facts” bundle for every finalization event. |
| Rule references | **PARTIAL** | RAG store and codification refs exist (justification_service, constants/codification); not every finalization path passes explicit rule refs. |

---

## 5) Gap list (no implementation)

- **Classifier:** No mandatory “classify on first touch” for every ingest; agentic classification is opt-in only. No central prompt for account classification.  
- **Advisor:** No single “Advisor” service that takes TB + context and returns suggested JEs with provenance; suggestions are either manual or from scattered agentic helpers; no structured “get suggestions for this period” API used by a standard close flow.  
- **Shadow Auditor:** No LLM-based audit step; only deterministic checks before post.  
- **Justifier:** No single “finalize and write memo” step for certification or certified export; justifications are created at multiple points with no unified “final facts + rule refs → memo” for every finalization event.  
- **Orchestration:** No structured workflow that runs Classifier → Advisor → Shadow Auditor → Justifier in sequence; no shared prompt registry or versioning.  
- **Data for pillars:** Advisor and Justifier lack a single assembled “context” and “final facts” payload in all code paths.  
- **Supervisor:** Supervisor route quarantined; no production entry point for an orchestrated agent that uses all four pillars.

---

*End of report. No code or files were modified; all findings are from read-only inspection of the repository.*
