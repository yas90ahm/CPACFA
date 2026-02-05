# Scope Enforcement — CTO Strict Product Scope

*Canonical: [ENGINEERING_CONSTITUTION.md](./ENGINEERING_CONSTITUTION.md) (SOVEREIGN CPA ENGINE). Four Pillars: Classifier, Advisor, Shadow Auditor, Justifier. Mandatory: Forge (staging), Protocol Bridge, Attribution, Truth Gate, Audit Binder. Workflow: Ingest → Stage → Draft → Audit → Lock → Certify → Export.*

---

## 1) Architecture Summary (10 lines)

1. **Control DB** (Postgres): tenants, users, jobs, scheduler_locks. **Tenant DBs** (BYOD): period_trial_balance, close_sessions, close_adjustments, journal_entries, recon_*, audit_ledger, statement_packages, HITL staging.
2. **The Forge**: hitl_orchestrator — staging blocks imbalanced data; merge to period_trial_balance only after human resolve (resolve-ingest).
3. **Protocol Bridge**: All ledger/statement mutations via deterministic TS services only; repositories used only by services; no direct DB write from routes or agents.
4. **Math sovereign**: financialStatements.ts (buildValidatedStatements, MathematicalIntegrityError), integrity_gate_service, rules_registry, utils/decimal. Ingestion: fileIngestion → trialBalanceParser (deterministic); optional agentic_ingestion_classifier / agentic_ledger_to_tb for labels/mapping only — amounts from parse or HITL.
5. **Close**: close_sessions, close_adjustments, journal_entries, recon_service, period_lock, segregation, decision_records. All via close_*_service and journal_entry_service.
6. **Truth Gate**: export_gate_service — materiality from DB (period_export_checks), verifyChain (audit_ledger), optional conflict check; blocks export on failure. Export route calls checkExportGate before PDF/CSV.
7. **Audit Binder**: audit_ledger_service — append-only, hash-chained; recordMaterialEvent for JE posting, statement generation, export. verifyChain required before export.
8. **Job queue**: jobs table, job_worker, job_handlers; handlers call services only; no agent→DB write.
9. **Agentic layer (constitutional)**: Classifier — agentic_account_classifier, agentic_ingestion_classifier (labels only). Advisor — proposals to staging only (proposeTrialBalanceAdjustment → submitToStaging). **Advisor amount-provenance:** JE amounts only from (A) ledger/TB exact match, (B) deterministic TS engine (rule/version + inputs), or (C) human-entered; `amount_provenance` required on JE suggestions; reject AI output without valid provenance. Shadow Auditor — professional_review, integrity flags. Justifier — justification_service (IRAC). No AI-generated math; numbers from TS core or human-approved HITL.
10. **Ledger write path**: period_trial_balance only via trial_balance_store_service.saveUnadjustedFromUpload (ingest route or HITL resolve-ingest after human approval). close_adjustments / journal_entries only via close_adjustments_service, journal_entry_service. No repository imported in agents/ for write.

---

## 2) CORE Modules (within scope)

| Module | Evidence | Role |
|--------|----------|------|
| **financialStatements.ts** | `src/services/financialStatements.ts` | Deterministic BS/P&L build; MathematicalIntegrityError; sum debits = credits, A = L+E. |
| **integrity_gate_service.ts** | `src/services/integrity_gate_service.ts` | Plug detection, materiality; no AI. |
| **trialBalanceParser.ts** | `src/services/trialBalanceParser.ts` | Deterministic parse of TB rows. |
| **fileIngestion.ts** | `src/services/fileIngestion.ts` | Parse CSV/XLSX → raw rows; no ledger write. |
| **trial_balance_store_service.ts** | `src/services/trial_balance_store_service.ts` | Save to period_trial_balance via repo; disallowMemoryStoreInProduction. |
| **accountClassifier.ts** | `src/services/accountClassifier.ts` | Keyword + optional agentic labels (types only); classifyTrialBalanceDeterministic. |
| **agentic_account_classifier.ts** | `src/services/agentic_account_classifier.ts` | classifyAccountsAgentic → ASSET/LIABILITY/etc. (labels only, no numbers). |
| **statement_package_service.ts** | `src/services/statement_package_service.ts` | Generate statements for close session; records in audit_ledger. |
| **statementGenerator.ts** | `src/services/statementGenerator.ts` | Build statements from TB; uses financialStatements. |
| **audit_ledger_service.ts** | `src/services/audit_ledger_service.ts` | recordOverride, recordMaterialEvent, verifyChain; hash-chained. |
| **export_gate_service.ts** | `src/services/export_gate_service.ts` | checkExportGate: materiality (DB), verifyChain, conflicts; blocks export on failure. |
| **export_service.ts / pdf_export.ts** | `src/services/export_service.ts`, `pdf_export.ts` | PDF/CSV export after gate. |
| **persistence_service.ts** | `src/services/persistence_service.ts` | Sessions, staging, uploads; protocol for HITL. |
| **hitl_orchestrator.ts** | `src/services/hitl_orchestrator.ts` | Staging submit/approve; merge to TB only on human resolve. |
| **close_adjustments_service.ts** | `src/services/close_adjustments_service.ts` | Create/list adjustments via repo. |
| **close_adjustment_update_service.ts** | `src/services/close_adjustment_update_service.ts` | Status update, push to GL (gated by ENABLE_GL_POSTBACK). |
| **journal_entry_service.ts** | `src/services/journal_entry_service.ts` | JEs via repo. |
| **recon_service.ts** | `src/services/recon_service.ts` | Reconciliation runs/items. |
| **period_lock_service.ts** | `src/services/period_lock_service.ts` | Lock period; no edits when locked. |
| **segregation_service.ts** | `src/services/segregation_service.ts` | canPerform (role vs action). |
| **justification_service.ts** | `src/services/justification_service.ts` | IRAC memos (Justifier); no calculations. |
| **rules_registry.ts** | `src/services/rules_registry.ts` | Rounding tolerance, financial rules. |
| **job_worker.ts / job_service.ts** | `src/services/job_worker.ts`, `job_service.ts` | Durable job queue; handlers call services only. |
| **Close routes** | `src/routes/close/*` | Sessions, adjustments, JE, recon, checklist, signoff, period, audit log. |
| **Trial-balance ingest/parser** | `src/routes/trial-balance/ingest.ts`, `parser.ts` | Ingest → staging or save; parser deterministic. |
| **Export route** | `src/routes/export.ts` | Calls export gate then export service. |
| **HITL route** | `src/routes/hitl.ts` | Staging, resolve-ingest (human approval → save to TB). |

---

## 3) OUT OF SCOPE Modules (violate or exceed scope)

| Module | Why out of scope |
|--------|-------------------|
| **forecasting routes + forecasting_service** | Forecasting is explicitly out of scope. |
| **budget routes + budget_version_service** | Planning / reforecast; "reforecast (agentic)" in server comment. |
| **capital routes** | ROI, payback — advisory / financial models. |
| **lead_partner_orchestrator.ts** | CFA sub-tasks, DCF, ratios, valuation, "reasonability check"; advisory intelligence. |
| **orchestrator.ts (prepareQ4Financials)** | May call lead_partner; CPA part in scope, CFA part out. |
| **unified_orchestrator.ts** | CFA task patterns (DCF, valuation, multiples); injects "accounting_context" for CFA; advisory. |
| **agents/cfa/** (montecarlo.ts, benchmark.ts, dupont.ts, skepticism.ts) | Monte Carlo liquidity forecast, DCF/valuation, ratios — forecasting and financial models. |
| **types/cfo-dashboard.ts + role_dashboard_service, kpi_history_service** | CFO KPIs, scenario, sensitivity, margin scenarios — financial health scoring and scenario analysis. |
| **supervisor routes + Supervisor.ts** | ReAct chat; general agent that can advise, run tools (proposeTrialBalanceAdjustment, buildFinancialStatements); exceeds "Classifier, Shadow Auditor, Justifier only." |
| **agentic_forecasting_capital.ts** | Forecasting / capital — out of scope. |
| **agentic_close_coach.ts** | Advisory intelligence. |
| **agentic_je_suggestions.ts (suggestJEsFromTextAgentic)** | AI generates journal entry amounts from natural language; "AI is FORBIDDEN to perform calculations" / mutate ledger values. |
| **agentic_gap_analyzer.ts (suggestJournalEntriesForImbalance)** | AI proposes debit/credit numbers to fix imbalance; performs numeric suggestions. |
| **agentic_ledger_to_tb.ts (parseLedgerLinesAgentic)** | LLM extracts debit/credit numbers from messy lines; interprets/mutates ledger values. |
| **Leases, impairment, EPS, deferred_tax routes + agentic_* (lease, impairment, eps, deferred_tax)** | Full modules are advisory/calculations (e.g. DCF, discount rates, valuations). Only FS placement/classification for statements is in scope; entire modules exceed. |
| **agentic_consolidation, agentic_equity_method, agentic_business_combination, agentic_stock_comp, agentic_impairment** | Advisory / valuation calculations. |
| **Catalog (query + resolve-intent)** | Ad-hoc query + agentic intent; not required for certified statements. |
| **reporting (pack builder, commentary)** | Commentary/agentic summary; advisory unless strictly packaging existing statements. |
| **data_quality (agentic_remediation_suggestion)** | Agentic remediation is advisory. |
| **audit_ledger_service (cfa_recommendation)** | CFA recommendation event type is advisory; keep for audit trail but do not drive decisions. |

---

## 4) RISKY Modules (non-determinism or possible state mutation outside protocol)

| Module | Risk | Recommendation |
|--------|------|----------------|
| **agentic_gap_analyzer.suggestJournalEntriesForImbalance** | AI outputs debit/credit numbers; if ever auto-applied, would mutate ledger. | Use only as suggestion into HITL staging; never auto-merge. Add guard: only human-approved staging may write to period_trial_balance. |
| **agentic_ledger_to_tb.parseLedgerLinesAgentic** | AI extracts numbers from text; could be merged into TB without human confirmation. | Use only for staging or require explicit human confirm before save. Do not call saveUnadjustedFromUpload with agentic output without HITL step. |
| **agentic_je_suggestions.suggestJEsFromTextAgentic** | AI outputs JE lines (account + amount); could be posted if wired to approval bypass. | Ensure all JEs from this path go through draft/staging or approval workflow; never direct insert to journal_entries from LLM output. |
| **agents/tools/proposeTrialBalanceAdjustment** | Submits to staging; numbers come from Supervisor (LLM). | Keep; staging is the protocol. Ensure no code path auto-approves staging or merges without human. |
| **Supervisor session update** | persistence.updateSession (last_step, last_result_summary) from agent path. | Allow only session metadata (no financial amounts). Ensure no ledger or close_adjustments write from supervisor tools except via staging → human resolve. |
| **agentic_plan_execute_verify / planExecuteVerify** | May drive "execute" steps; ensure execute is deterministic only. | Restrict to deterministic steps; any LLM-suggested numbers must go through staging/approval. |
| **ingestion_agent + agentic ingestion classifier** | Classifier in scope; if classifier output is ever written as source of truth for amounts, risk. | Classifier: labels only. Amounts must come from deterministic parse or human-confirmed staging. |
| **integrity_conflict_service / risk_context_store** | CPA-CFA conflict resolution; if resolution auto-updates ledger, risk. | Resolutions must be human-signed; no auto-mutation of TB or adjustments from conflict resolution. |
| **close_adjustment_update_service (push to GL)** | pushAdjustmentToGL can write to external GL. | Already gated by ENABLE_GL_POSTBACK; keep default false. |
| **In-memory production state** | audit_log_service (in-memory log only), intercompany_reconciliation_service (inMemoryPairs), policy_memory (inMemoryStore), close_controls_service / pbc_service / invoice_to_books_service (createInMemoryStore) — if used in production without DB, state is non-durable. | Core ledger/HITL/trial balance already use disallowMemoryStoreInProduction. Add disallowMemoryStoreInProduction for any in-memory path used in production, or document as dev-only. |

---

## 5) Explicit Verification (E)

| Check | Result |
|-------|--------|
| **Only TS core performs math** | Yes. financialStatements.ts, trialBalanceParser, accountClassifier (deterministic), rules_registry, utils/decimal. All amounts for statements and TB come from these or from human-supplied HITL adjustment. |
| **AI never writes numbers** | Violations: agentic_gap_analyzer.suggestJournalEntriesForImbalance, agentic_je_suggestions.suggestJEsFromTextAgentic, agentic_ledger_to_tb.parseLedgerLinesAgentic output debit/credit amounts. They must not be wired to direct DB write; only to staging or human-approved flow. proposeTrialBalanceAdjustment submits to staging (Advisor pillar). |
| **All mutations pass Protocol Bridge** | Yes. period_trial_balance via trial_balance_store_service (and HITL resolve-ingest calling it). close_adjustments / journal_entries via close_adjustments_service / journal_entry_service. No route or agent calls repository insert/update directly. |
| **All exports pass integrity gates** | Yes. export route calls checkExportGate before PDF/CSV; gate runs verifyChain, materiality from period_export_checks (DB), optional conflict check. No export without passing gate. |
| **Workflow sequence enforced** | Ingest → staging (hitl_orchestrator) → resolve-ingest (human) → period_trial_balance. Close adjustments/JE via services; export only after gate. No shortcut that skips staging for agentic-sourced numbers. |

---

## 6) OUT OF SCOPE — Recommended Actions

| Recommendation | Modules |
|----------------|---------|
| **MOVE to /experimental** | forecasting (routes + service), budget (reforecast agentic), capital routes, lead_partner_orchestrator, unified_orchestrator (CFA paths), agents/cfa/*, supervisor (ReAct chat), agentic_forecasting_capital, agentic_close_coach, catalog (agentic intent), role_dashboard_service, kpi_history (CFO view). |
| **FREEZE** | Leases, impairment, EPS, deferred_tax, business_combination, equity_method, stock_compensation routes and agentic_* for those domains (no new features; keep only if required for statement placement and strictly classification/labels). |
| **DELETE** (or move to experimental) | agentic_je_suggestions.suggestJEsFromTextAgentic (AI generates JE amounts). agentic_gap_analyzer.suggestJournalEntriesForImbalance (AI proposes numbers) — or restrict to labels only and move numeric suggestion to experimental. agentic_ledger_to_tb.parseLedgerLinesAgentic — or allow only in /experimental with mandatory HITL before any save. |

---

## 7) RISKY — Safeguards

| Action | Detail |
|--------|--------|
| **Amount provenance** | JE suggestions and HITL adjustment lines require valid `amount_provenance` (ledger_exact \| engine_calculation \| human_entered). Reject AI output without valid provenance (400 AMOUNT_PROVENANCE_REQUIRED). Advisor may not invent or estimate amounts. |
| **Staging-only for AI numbers** | Any service that returns debit/credit from LLM (suggestJournalEntriesForImbalance, parseLedgerLinesAgentic, suggestJEsFromTextAgentic) must only feed HITL staging. Never call period_trial_balance save or close_adjustments create with raw LLM output. Amounts from AI have no valid provenance until human confirms (human_entered). |
| **Export gate** | Already enforced: verifyChain + materiality from DB. No caller-supplied materiality. Keep. |
| **Approval workflow** | close_adjustment_update_service: posted only via approval or explicit post; ENABLE_GL_POSTBACK default false. Keep. |
| **Session metadata only** | Supervisor/persistence: allow only session fields (last_step, last_result_summary as text); no financial amounts in session that drive ledger. |
| **Audit ledger** | All material events (je_posting, statement_package_generation, export_event) already recorded. Ensure no path writes to period_trial_balance or close_adjustments without going through a service that records to audit_ledger. |

---

## 8) Verification Summary (duplicate of E for quick reference)

| Check | Status |
|-------|--------|
| **Ledger mutations through deterministic TS services** | Yes. period_trial_balance written only via trial_balance_store_service and HITL resolve (after human approve). close_adjustments and journal_entries via close_adjustments_service and journal_entry_service. Repositories not imported in agents/ or LLM call paths for write. |
| **No AI code writes numbers** | Violations: agentic_gap_analyzer (suggestJournalEntriesForImbalance), agentic_je_suggestions (suggestJEsFromTextAgentic), agentic_ledger_to_tb (parseLedgerLinesAgentic) output numbers. They must not be wired to direct DB write; only to staging or human-approved flow. |
| **Exports pass integrity + audit chain** | Yes. export_gate_service.checkExportGate runs before export; verifyChain required; materiality from DB. |
| **No service writes to DB outside protocol** | Repositories are used only by services. No raw pool.query('INSERT INTO period_trial_balance|close_adjustments|journal_entries') from routes or agents without going through the designated services. |

---

## 9) Concrete Refactor Plan (max 15 actions)

1. **Move to /experimental**: forecasting routes + forecasting_service, capital routes, lead_partner_orchestrator, unified_orchestrator (or split CPA vs CFA and move CFA branch to experimental), agents/cfa (montecarlo, benchmark, dupont, skepticism), supervisor route + Supervisor agent (or restrict to classification/justification tools only).
2. **Move to /experimental**: budget routes + budget_version_service (reforecast agentic path only); keep versioning/list if needed for close.
3. **FREEZE**: routes + agentic services for leases, impairment, eps, deferred_tax, business_combination, equity_method, stock_compensation — no new features; document "classification/labels only for statement placement."
4. **Remove or move to experimental**: agentic_je_suggestions.suggestJEsFromTextAgentic (AI-generated JE amounts).
5. **Restrict or move to experimental**: agentic_gap_analyzer.suggestJournalEntriesForImbalance — do not use for auto-merge; only suggestion to HITL; or delete and keep only gap labels (no numbers).
6. **Restrict or move to experimental**: agentic_ledger_to_tb.parseLedgerLinesAgentic — require HITL confirm before any save to period_trial_balance; document and enforce in code.
7. **Safeguard**: In hitl resolve-ingest and trial_balance_store_service.saveUnadjustedFromUpload, ensure no code path accepts "agentic-only" payload without human approval flag or HITL step.
8. **Safeguard**: Add assertion or comment in persistence_service and close_adjustments_service: "No LLM output used as sole source for financial amounts; human or deterministic source only."
9. **Document**: In export_gate_service and export route, state that export is only for certified path (period_trial_balance + approved HITL + adjustments via protocol).
10. **Remove CFA from export gate** (optional): If CPA-only scope, remove ENABLE_INTEGRATED_SUPERVISOR / CPA-CFA conflict check from export gate; or keep as optional integration and document as "advisory block."
11. **FREEZE**: role_dashboard_service, kpi_history_service, types/cfo-dashboard — no new CFO/scenario features.
12. **Catalog**: Move agentic resolve-intent to /experimental; keep catalog query (read-only) if needed for reporting.
13. **Justifier only**: Ensure justification_service and professional_review (audit flags) are the only LLM outputs that write to decision/audit trail (memos/flags), not numbers.
14. **Classifier only**: Ensure agentic_account_classifier and agentic_ingestion_classifier are the only agentic code that influence TB classification; output is labels/codes only; amounts always from deterministic parse or human.
15. **CI / gate**: Add a scope check (e.g. list of allowed agentic call sites or forbidden imports in agents that write to ledger) so future code cannot wire LLM output to period_trial_balance or close_adjustments insert.

---

*End of scope enforcement document.*
