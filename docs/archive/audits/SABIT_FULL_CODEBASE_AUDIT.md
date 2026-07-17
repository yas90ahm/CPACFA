# SABIT FULL CODEBASE AUDIT — V1 vs V2

Generated: 2026-03-10

---

## PHASE 1: CODEBASE MAP

| Metric | V1 (master) | V2 (V2-Sabit) |
|--------|-------------|----------------|
| .ts files in src/ | 507 | 507 |
| .tsx files in frontend/ | 75 | 95 |
| Service files (src/services/) | 142 | 130 |
| Route files (src/routes/) | 84 | ~85 |
| HTTP endpoints | 422 | ~420 |
| Migration .sql files | 149 | 148 |
| Test files | 110 | 110 |
| FS taxonomy entries | 39 (with contras) | 48 (no contras) |
| Frontend pages (page.tsx) | 33 | 39 |
| Frontend components | 24 | 38 |
| Frontend page lines | 11,712 | 13,603 |
| Frontend component lines | 2,492 | 6,415 |
| AI subsystem files (src/ai/) | 0 | 17 |
| Knowledge base files | 0 | 12 |

---

## PHASE 2: V1 AUDIT (Current Codebase — master)

### 2.1 Backend Services (src/services/) — 142 files

| # | File | Lines | Description |
|---|------|-------|-------------|
| 1 | accountClassifier.ts | 322 | Maps TB accounts to Asset/Liability/Equity/Revenue/Expense via deterministic rules |
| 2 | accounting_integration_service.ts | 164 | QuickBooks, Xero, NetSuite integration (sync TB, push JE) |
| 3 | adjusted_trial_balance_service.ts | 283 | Versioning: unadjusted TB + proposed adjustments = adjusted TB |
| 4 | agentic_onboarding.ts | 149 | Agentic onboarding: CoA mapping suggestions and first-close guide |
| 5 | ai_classification_service.ts | 653 | Orchestration layer for SLM-based account classification suggestions |
| 6 | aje_template_service.ts | 259 | AJE template CRUD, propose for period, apply, skip |
| 7 | approval_request_service.ts | 118 | Approval request execution: create, approve/reject, advance step |
| 8 | approval_workflow_service.ts | 39 | Approval workflow definitions CRUD |
| 9 | audit_binder_export_service.ts | 191 | Audit binder export to PDF and CSV |
| 10 | audit_export_service.ts | 525 | Audit binder generation: bundle statements with justification chains |
| 11 | audit_file_service.ts | 70 | Audit file/workpaper structure: sections with assertions and evidence |
| 12 | audit_ledger_service.ts | 152 | Record human overrides with deterministic flag + agent dissent + rationale |
| 13 | audit_log_service.ts | 114 | Immutable append-only audit log for who-did-what-when |
| 14 | audit_service.ts | 229 | Unified audit service |
| 15 | board_package_service.ts | 202 | Board package: aggregates statements, variances, metrics for board reporting |
| 16 | cascade_engine.ts | 328 | Cascade engine: every financial mutation triggers downstream state updates |
| 17 | cashFlow.ts | 172 | Cash flow statement builder (indirect method, ASC 230) |
| 18 | certification_artifact_service.ts | 191 | Build, hash, sign attestation artifacts for certified closes |
| 19 | certified_statements_service.ts | 176 | Canonical path for certified statement generation from ledger snapshots |
| 20 | checklist_store_service.ts | 98 | Checklist store per period for step updates |
| 21 | close_adjustment_update_service.ts | 181 | Update close adjustment status |
| 22 | close_adjustments_service.ts | 222 | Unified close adjustments queue |
| 23 | close_calendar_config_service.ts | 48 | Close calendar config per tenant |
| 24 | close_calendar_service.ts | 108 | Close calendar: list periods, due dates, status |
| 25 | close_checklist_readiness_service.ts | 327 | Close checklist and readiness gating |
| 26 | close_checklist_template_service.ts | 86 | Close checklist templates per tenant per period type |
| 27 | close_context.ts | 166 | Close context: single type + loader for prior-period comparative data |
| 28 | close_controls_service.ts | 153 | Control catalogue: controls with name, owner, frequency, evidence type |
| 29 | close_readiness_service.ts | 64 | Pre-close checks plus optional agentic ready/not-ready summary |
| 30 | close_session_service.ts | 894 | Close session state machine (OPEN→IN_PROGRESS→UNDER_REVIEW→CERTIFIED→LOCKED) |
| 31 | close_status_service.ts | 160 | Single "close status" view |
| 32 | closing_entries_service.ts | 76 | Suggest JEs to close revenue/expense to retained earnings |
| 33 | coa_mapping_service.ts | 186 | COA mapping engine: apply rules to accounts → fs_line_id |
| 34 | coa_template_service.ts | 108 | Detect source system from CSV/XLSX headers |
| 35 | coa_upload_service.ts | 198 | Chart of accounts upload: parse CSV, validate, upsert |
| 36 | comparative_statements_service.ts | 103 | Multi-column data for multi-period side-by-side views |
| 37 | consolidation_service.ts | 229 | Multi-entity consolidation |
| 38 | cpa_bridge_manifest.ts | 58 | Strict mapping from agent recommendation to deterministic service |
| 39 | cpa_decision_handler.ts | 173 | Validate agent JSON, param-check, execute deterministic service |
| 40 | cross_statement_validation.ts | 103 | Cross-statement validation for certification |
| 41 | cumulative_statement_service.ts | 377 | Cumulative (QTD/YTD) statement generation |
| 42 | cumulative_variance_service.ts | 242 | Cumulative variance analysis |
| 43 | data_quality_exception_service.ts | 92 | Data quality exceptions: list, acknowledge, resolve |
| 44 | data_quality_rule_service.ts | 97 | Data quality rules CRUD and evaluation |
| 45 | decision_record_service.ts | 54 | Append-only decision records for explainability |
| 46 | deferred_tax_service.ts | 443 | Deferred tax computation (UNWIRED) |
| 47 | deterministic_pattern_detector.ts | 303 | Deterministic pattern detection engine |
| 48 | disclosure_checklist_service.ts | 174 | Disclosure checklist by period/framework |
| 49 | draft_service.ts | 207 | Save-for-later: uncommitted JSON adjustments |
| 50 | entity_settings_service.ts | 163 | Entity settings: fiscal year, currency, auto-lock, variance materiality |
| 51 | equityChanges.ts | 51 | Statement of Changes in Equity (minimal estimate) |
| 52 | evidence_attachment_service.ts | 383 | Attach evidence files to journal entries |
| 53 | evidence_manifest_service.ts | 113 | Certified evidence manifest |
| 54 | evidence_policy_service.ts | 195 | Evidence policy enforcement for certification gate |
| 55 | evidence_storage_service.ts | 261 | Evidence file storage: store/retrieve evidence blobs |
| 56 | export_gate_service.ts | 184 | Export gate: fail-shut before PDF/CSV |
| 57 | export_service.ts | 315 | Export: connect agent reasoning to PDF/CSV export |
| 58 | fileIngestion.ts | 171 | Robust CSV/XLSX ingestion pipeline for trial balance |
| 59 | filing_calendar_service.ts | 102 | Filing calendar (UNWIRED) |
| 60 | financialStatements.ts | 493 | Build Balance Sheet and P&L from classified trial balance |
| 61 | fiscal_calendar_service.ts | 146 | Fiscal calendar: quarter/YTD from entity fiscal year end |
| 62 | fixed_asset_service.ts | 404 | Fixed asset management (UNWIRED) |
| 63 | fx_currency_service.ts | 155 | FX currency translation |
| 64 | gaap_reconciliation_service.ts | 74 | GAAP-to-IFRS reconciliation bridge |
| 65 | gl_health_analysis_service.ts | 606 | GL health: 10-check automated quality analysis |
| 66 | gl_investigation_service.ts | 418 | GL investigation engine (deterministic, Decimal.js, zero AI) |
| 67 | gl_to_tb_aggregation_service.ts | 213 | GL-to-TB aggregation |
| 68 | gl_upload_service.ts | 1325 | General ledger upload: parse CSV, validate per-entry balance, save |
| 69 | google_oauth.ts | 35 | Google OAuth token refresh helper |
| 70 | hitl_orchestrator.ts | 312 | Human-in-the-loop orchestrator: staging area, approval webhooks |
| 71 | impairment_service.ts | 90 | Impairment testing (UNWIRED) |
| 72 | integration_store.ts | 117 | Tenant-scoped integration credential store |
| 73 | integrity_check.ts | 78 | Final integrity check before export (Truth Gate) |
| 74 | integrity_conflict_service.ts | 139 | Cross-check CPA outputs against covenant thresholds |
| 75 | integrity_gate_service.ts | 215 | Hard gate: debits=credits AND assets=L+E |
| 76 | integrity_report_service.ts | 447 | Integrity report generation |
| 77 | intercompany_reconciliation_service.ts | 140 | Intercompany reconciliation |
| 78 | issue_auto_resolution_service.ts | 83 | Auto-verify/reopen issues based on state changes |
| 79 | issue_detection_service.ts | 266 | Detection functions for each issue type |
| 80 | issue_service.ts | 408 | Central HITL issue resolution system |
| 81 | job_handlers.ts | 49 | Job handlers: ingestion_pipeline, agentic_cleanup, statement_generation |
| 82 | job_service.ts | 66 | Job service (UNWIRED) |
| 83 | job_worker.ts | 97 | Durable job worker: polls, locks, executes, retries with backoff |
| 84 | journal_entry_service.ts | 662 | JE lifecycle: draft→proposed→approved/posted/exported/rejected |
| 85 | judgment_going_concern.ts | 83 | Going-concern analysis |
| 86 | justification_service.ts | 551 | Justification chat: RAG (FASB/IFRS), IRAC format, citations |
| 87 | ledger_snapshot_service.ts | 152 | Create immutable snapshots and verify hash |
| 88 | mapping_completeness_gate.ts | 153 | Mapping completeness gate |
| 89 | materiality_config_service.ts | 73 | Materiality configuration |
| 90 | materiality_service.ts | 56 | Materiality settings per tenant |
| 91 | month_end_close_service.ts | 86 | Month-end close: JE suggestions, checklist, period lock |
| 92 | notesPolicies.ts | 46 | Notes and accounting policies generator |
| 93 | notification_service.ts | 443 | Notification service: in-app, webhooks, HMAC signing |
| 94 | onboarding_service.ts | 183 | Onboarding: guided setup, CoA import, first close wizard |
| 95 | pack_builder_service.ts | 79 | Management and board reporting packs |
| 96 | pack_run_service.ts | 57 | Pack run store |
| 97 | pbc_service.ts | 73 | PBC list for auditor |
| 98 | pdf_export.ts | 350 | Export audit defense: generate professional PDF |
| 99 | period_close_service.ts | 152 | Period close record |
| 100 | period_lock_service.ts | 100 | Period lock store |
| 101 | period_reconciliation_service.ts | 668 | Period reconciliation full lifecycle |
| 102 | persistence_service.ts | 648 | CRUD for HITL staging and supervisor sessions |
| 103 | planExecuteVerify.ts | 104 | Plan-execute-verify loop for FinOS Agent |
| 104 | policy_inference_agentic.ts | 69 | Agentic policy inference |
| 105 | portfolio_service.ts | 574 | Portfolio service: entities, summary, cross-entity analytics |
| 106 | precedent_for_close_step.ts | 102 | Mandatory "similar precedent" for close steps |
| 107 | professional_review_input_builder.ts | 76 | Build ProfessionalReviewInput |
| 108 | professional_review_service.ts | 134 | Professional review orchestration |
| 109 | push_close_to_gl_service.ts | 92 | Push close adjustment to GL |
| 110 | quality_checks.ts | 106 | Statement quality checks |
| 111 | recon_completeness_gate.ts | 188 | Reconciliation completeness gate |
| 112 | recon_requirements_auto_generate.ts | 179 | Auto-generate reconciliation requirements |
| 113 | recon_service.ts | 250 | Reconciliation state machine |
| 114 | reconciliation_resolution_service.ts | 136 | Reconciliation resolution workflow |
| 115 | reconciliation_summary_service.ts | 134 | Reconciliation summary |
| 116 | reconciliation_todos.ts | 165 | Gap-to-actionable to-dos |
| 117 | result_generator.ts | 475 | Connect uploaded data to specialist brains |
| 118 | revenue_recognition_service.ts | 475 | Revenue recognition (ASC 606/IFRS 15) |
| 119 | risk_context_store.ts | 273 | Integrated risk ledger |
| 120 | rules_registry.ts | 84 | Reads financial_rules.json |
| 121 | segment_service.ts | 112 | Segment reporting |
| 122 | segregation_service.ts | 85 | Segregation of duties |
| 123 | session_readiness_gates_service.ts | 223 | Transform readiness checks into frontend gates array |
| 124 | session_trial_balance_service.ts | 289 | Session-scoped trial balance |
| 125 | shadow_auditor_service.ts | 189 | Shadow auditor: deterministic + AI pre-post checks |
| 126 | slm_client_service.ts | 186 | Typed HTTP client for SLM Python microservice |
| 127 | snapshot_gl_helpers.ts | 43 | Extract GL data from certified snapshots |
| 128 | standard_selector.ts | 93 | Infer accounting standard from jurisdiction metadata |
| 129 | statementGenerator.ts | 172 | Build financial statements by accounting standard |
| 130 | statement_drilldown_service.ts | 199 | Statement drill-down |
| 131 | statement_package_service.ts | 669 | Versioned statement packages: deterministic generation |
| 132 | stock_compensation_service.ts | 104 | Stock compensation (ASC 718/IFRS 2) |
| 133 | tax_return_service.ts | 76 | Tax return service (UNWIRED) |
| 134 | tax_strategy_service.ts | 61 | Tax strategy and compliance |
| 135 | team_service.ts | 250 | Team management |
| 136 | template_completeness_gate.ts | 37 | Template completeness gate |
| 137 | triage_service.ts | 206 | Triage: materiality threshold, risk score |
| 138 | trialBalanceParser.ts | 91 | Trial balance parser |
| 139 | trial_balance_rollup_service.ts | 89 | TB roll-up |
| 140 | trial_balance_store_service.ts | 184 | TB store |
| 141 | variance_analysis_service.ts | 175 | Variance analysis |
| 142 | variance_chat_service.ts | 244 | Conversational variance narration |

### 2.2 V1 Routes — 422 HTTP Endpoints Across 84 Route Files

**Key route files:**

| File | Lines | Endpoint Count | Key Endpoints |
|------|-------|---------------|---------------|
| close_sessions.ts | 1180 | 17 | CRUD sessions, advance, certify, lock, reopen, readiness, TB, statements |
| close_journal_entries.ts | 784 | 17 | CRUD JEs, propose/approve/reject/post, evidence, validation |
| close_period_reconciliations.ts | 550 | 10 | Init, supporting balance, items, complete, approve, evidence |
| coa_mapping.ts | 509 | 9 | Taxonomy, rules, suggestions, accept/reject, auto-accept |
| export.ts | 701 | 8 | PDF/CSV export |
| hitl.ts | 689 | 16 | HITL staging, proposals, supervision, reasoning logs |
| close_issues.ts | 404 | 13 | CRUD issues, assign, start, resolve, verify, waive, reopen |
| gl/ingest.ts | 377 | 2 | GL parse (preview), GL ingest (commit) |
| close_aje_templates.ts | 301 | 10 | CRUD templates, propose, apply, skip |
| close_variance_analysis.ts | 156 | 3 | List variances, AI draft, explain |
| auth.ts | 105 | 2 | Login, register |
| verification/ (5 files) | 542 | 7 | Public key, artifacts, verify, audit chain, evidence manifest |
| portfolio.ts | 234 | 8 | Entities, summary, cross-entity analytics |

### 2.3 V1 Migrations — 149 SQL Files

Key migrations:
- 065: Close sessions table (state machine)
- 068: FS taxonomy lines (5 base entries)
- 072: Journal entries + lines
- 074: Statement packages + lines + diffs
- 091: Append-only triggers
- 093: AI boundary schemas (core/ai/audit schema separation)
- 098: Close session state machine constraints
- 099: Close issues (unified HITL)
- 105-106: JE immutability triggers
- 125: Cash flow taxonomy (3 sections)
- 126: OCI + discontinued operations taxonomy
- 128: Audit ledger hash chain enforcement trigger
- 142: IS subtotal hierarchy (COGS, OpEx, Other, Tax)
- 143: BS current/noncurrent (23 taxonomy entries)
- 148: Expanded taxonomy — contra accounts, display ordering

### 2.4 V1 Taxonomy — 39 Entries (with contras)

**Income Statement (PL) — 16 entries:**

| id | name | parent_id | normal_balance | is_contra |
|----|------|-----------|----------------|-----------|
| fs_revenue | Revenue | NULL | credit | false |
| fs_revenue_contra | Sales Returns & Allowances | fs_revenue | debit | true |
| fs_expense | Expenses | NULL | debit | false |
| fs_cogs | Cost of Goods Sold | NULL | debit | false |
| fs_opex | Operating Expenses | NULL | debit | false |
| fs_opex_sga | Selling, General & Administrative | fs_opex | debit | false |
| fs_opex_rd | Research & Development | fs_opex | debit | false |
| fs_opex_da | Depreciation & Amortization | fs_opex | debit | false |
| fs_opex_other | Other Operating Expenses | fs_opex | debit | false |
| fs_other_income | Other Income / (Expense) | NULL | credit | false |
| fs_interest_income | Interest Income | fs_other_income | credit | false |
| fs_interest_expense | Interest Expense | fs_other_income | debit | false |
| fs_other_other | Other Non-Operating | fs_other_income | credit | false |
| fs_tax_expense | Income Tax Expense | NULL | debit | false |
| fs_discontinued_ops | Income/Loss from Discontinued Operations | NULL | credit | false |
| fs_discontinued_disposal | Gain/Loss on Disposal | fs_discontinued_ops | credit | false |

**Balance Sheet (BS) — 31 entries (including OCI under equity):**

| id | name | parent_id | normal_balance | is_contra | display_order |
|----|------|-----------|----------------|-----------|---------------|
| fs_asset | Assets | NULL | debit | false | 1000 |
| fs_asset_current | Current Assets | fs_asset | debit | false | 1001 |
| fs_asset_cash | Cash and Cash Equivalents | fs_asset_current | debit | false | 1010 |
| fs_asset_ar | Accounts Receivable, Gross | fs_asset_current | debit | false | 1020 |
| fs_asset_ar_allowance | Allowance for Doubtful Accounts | fs_asset_current | credit | true | 1030 |
| fs_asset_inventory | Inventory | fs_asset_current | debit | false | 1040 |
| fs_asset_prepaid | Prepaid Expenses | fs_asset_current | debit | false | 1050 |
| fs_asset_other_current | Other Current Assets | fs_asset_current | debit | false | 1060 |
| fs_asset_noncurrent | Non-Current Assets | fs_asset | debit | false | 1100 |
| fs_asset_ppe | Property, Plant & Equipment, Gross | fs_asset_noncurrent | debit | false | 1110 |
| fs_asset_ppe_accum_dep | Accumulated Depreciation | fs_asset_noncurrent | credit | true | 1120 |
| fs_asset_intangible | Intangible Assets, Gross | fs_asset_noncurrent | debit | false | 1135 |
| fs_asset_intangible_amort | Accumulated Amortization | fs_asset_noncurrent | credit | true | 1140 |
| fs_asset_goodwill | Goodwill | fs_asset_noncurrent | debit | false | 1130 |
| fs_asset_other_noncurrent | Other Non-Current Assets | fs_asset_noncurrent | debit | false | 1150 |
| fs_liability | Liabilities | NULL | credit | false | 1500 |
| fs_liability_current | Current Liabilities | fs_liability | credit | false | 1501 |
| fs_liability_ap | Accounts Payable | fs_liability_current | credit | false | 1510 |
| fs_liability_accrued | Accrued Liabilities | fs_liability_current | credit | false | 1520 |
| fs_liability_current_debt | Current Portion of Long-Term Debt | fs_liability_current | credit | false | 1530 |
| fs_liability_other_current | Other Current Liabilities | fs_liability_current | credit | false | 1540 |
| fs_liability_noncurrent | Non-Current Liabilities | fs_liability | credit | false | 1600 |
| fs_liability_lt_debt | Long-Term Debt | fs_liability_noncurrent | credit | false | 1610 |
| fs_liability_deferred_tax | Deferred Tax Liabilities | fs_liability_noncurrent | credit | false | 1620 |
| fs_liability_other_noncurrent | Other Non-Current Liabilities | fs_liability_noncurrent | credit | false | 1630 |
| fs_equity | Equity | NULL | credit | false | 2000 |
| fs_equity_common | Common Stock & APIC | fs_equity | credit | false | 2010 |
| fs_equity_retained | Retained Earnings | fs_equity | credit | false | 2020 |
| fs_equity_treasury | Treasury Stock | fs_equity | debit | true | 2030 |
| fs_equity_other | Other Equity | fs_equity | credit | false | 2040 |
| fs_oci | Accumulated Other Comprehensive Income | fs_equity | credit | false | 2050 |

**OCI — 4 entries:** Unrealized Gains/Losses, FX Translation, Pension Adjustments, Cash Flow Hedge

**Cash Flow — 3 entries:** Operating, Investing, Financing

### 2.5 V1 Financial Statement Generation

**File:** `src/services/financialStatements.ts` (493 lines)

**Balance Sheet (`buildBalanceSheet`):**
- Data-driven bucketing by `fsLineId` with `accountType` fallback
- 11 buckets: currentAssets, noncurrentAssets, assets (unclassified), currentLiabilities, noncurrentLiabilities, liabilities (unclassified), equity, revenue, expenses, OCI, discontinued
- Sign convention: `CREDIT_POSITIVE_FS_LINES` set flips sign for liabilities/equity/revenue/contra-assets
- Subtotals: totalCurrentAssets, totalNoncurrentAssets, totalAssets, totalCurrentLiabilities, totalNoncurrentLiabilities, totalLiabilities, totalEquity = equityOnly + (totalRevenue - totalExpenses) + totalOci
- Rounding adjustment: if |totalAssets - (totalLiabilities + totalEquity)| <= $0.01, adds rounding line
- All arithmetic: Decimal.js

**Income Statement (`buildProfitAndLoss`):**
- PE-standard subtotals: grossProfit = Revenue - COGS, operatingIncome = grossProfit - OpEx, incomeBeforeTax = operatingIncome + otherIncomeExpense, netIncome = incomeBeforeTax - taxExpense
- EBITDA = netIncome + tax + interestExpense + D&A

**Kill Switch (`buildValidatedStatements`):**
1. Builds BS + P&L
2. `assertIntegrityGateOrThrow` — throws HTTP 422 if debits≠credits OR A≠L+E
3. `detectSuspiciousPlugs` — flags if plug accounts absorb ≥90% of net activity

### 2.6 V1 Cash Flow (Indirect Method)

**File:** `src/services/cashFlow.ts` (172 lines)

**Operating:** Net Income + D&A + Change in Deferred Tax + Unrealized FX + Stock-Based Comp + ΔAR (reversed) + ΔInventory (reversed) + ΔAP
**Investing:** Change in PPE
**Financing:** Change in Debt + Change in Equity
**Flag:** `estimated: true` when no prior period TB available

### 2.7 V1 Cascade Engine

**File:** `src/services/cascade_engine.ts` (328 lines)

**Triggers:** AJE_POSTED, AJE_REVERSED, RECON_COMPLETED, RECON_APPROVED, RECON_REJECTED, MAPPING_CHANGED, TB_REINGESTED, VARIANCE_EXPLAINED, ISSUE_RESOLVED

**Steps:**
1. Adjusted TB recalculated (for TB-affecting triggers only)
2. Refresh reconciliation GL balances (sequential)
3-5. In parallel: Invalidate statements, Compute readiness, Issue cascade

**Guards:** Max depth 3, max time 2000ms

### 2.8 V1 HITL Issue System

**File:** `src/services/issue_service.ts` (408 lines)

**Lifecycle:** DETECTED → ASSIGNED → IN_PROGRESS → RESOLVED → VERIFIED (or WAIVED)
- Blocking severities: `critical`, `blocking` (prevent certification)
- Waivable: `warning`, `info` only
- 5 detection functions: unmapped accounts, BS imbalance, incomplete recons, unexplained variances, pending AJE templates

### 2.9 V1 AI Boundary Enforcement

**Application level** (`src/llm/guardrails.ts`, 99 lines):
- `assertNoNumericAmountsInAgentOutput` — throws if agent output contains monetary values
- `computeConfidence` — scores from 1.0 deducting for missing data
- `shouldEscalateToHuman` — true if confidence < 0.80
- `DATA_GROUNDING_RULE` — appended to every LLM system prompt

**DB level** (`migrations/093_ai_boundary_schemas.sql`, 115 lines):
- 3 PostgreSQL schemas: `core` (financial), `ai` (workspace), `audit` (immutable)
- 3 DB roles: `core_writer` (full core access), `ai_writer` (NO core write access), `auditor_reader` (SELECT only)

### 2.10 V1 RBAC

**Backend roles:** accountant, preparer, reviewer, approver, admin, operating_partner
**Close role mapping:** preparer < reviewer < approver
**Frontend roles (5):** admin, controller, reviewer, operating_partner, auditor

**Frontend permission matrix (19 functions):**
- admin: all permissions
- controller: upload, map, create/propose/post JE, complete recon, generate statements, explain variance, submit for review
- reviewer: approve/reject JE (SoD), approve recon (SoD), approve variance, certify
- operating_partner: read-only
- auditor: read-only

### 2.11 V1 Frontend Pages — 33 pages

| Route | Lines | Purpose |
|-------|-------|---------|
| `/` | 44 | Auth-gated redirect |
| `/login` | 109 | Login form |
| `/register` | 182 | Registration form |
| `/portfolio` | 506 | Multi-entity portfolio dashboard |
| `/close` | 255 | Session list |
| `/close/[sessionId]/dashboard` | 604 | Main close dashboard with state-dependent rendering |
| `/close/[sessionId]/mapping` | 733 | Account mapping with AI suggestions |
| `/close/[sessionId]/statements` | 552 | Four financial statements + validation |
| `/close/[sessionId]/adjustments` | 492 | Journal entries and AJE templates |
| `/close/[sessionId]/reconciliation` | 758 | Reconciliation list with batch entry |
| `/close/[sessionId]/reconciliation/[reconId]` | 863 | Single reconciliation detail |
| `/close/[sessionId]/trial-balance` | 544 | TB viewer |
| `/close/[sessionId]/variance` | 573 | Variance analysis |
| `/close/[sessionId]/review` | 1017 | Review and certification |
| `/close/[sessionId]/audit-trail` | 542 | Hash-chained audit trail viewer |
| `/close/[sessionId]/board-package` | 706 | Board package |
| `/close/[sessionId]/gl-health` | 197 | GL health diagnostics |
| `/close/[sessionId]/consolidation` | 241 | Multi-entity consolidation |
| `/close/[sessionId]/fx-translation` | 251 | Foreign currency translation |
| `/close/[sessionId]/segments` | 137 | Segment reporting |
| `/close/[sessionId]/fixed-assets` | 160 | Fixed assets and depreciation |
| `/close/[sessionId]/deferred-tax` | 154 | Deferred tax provision |
| `/close/[sessionId]/impairment` | 179 | Impairment testing |
| `/close/[sessionId]/stock-compensation` | 171 | Stock compensation expense |
| `/settings/general` | 243 | Tenant general settings |
| `/settings/team` | 215 | Team member management |
| `/settings/evidence-policy` | 117 | Evidence policy |
| `/settings/reconciliation` | 374 | Reconciliation requirements |
| `/settings/taxonomy` | 348 | Taxonomy management |
| `/settings/integrations` | 151 | ERP integration settings |
| `/settings/templates` | 280 | AJE template management |

### 2.12 V1 Frontend Components — 24 files

| Component | Lines | Purpose |
|-----------|-------|---------|
| AuthGuard.tsx | 35 | Route guard |
| ColumnMapper.tsx | 100 | GL CSV column mapping |
| InvestigationPanel.tsx | 391 | Variance investigation drill-down |
| IssuePanel.tsx | 232 | Blocking issues panel |
| NotificationBell.tsx | 109 | Notification dropdown |
| Sidebar.tsx | 139 | Role-based navigation |
| StateMachineBanner.tsx | 186 | Session state banner |
| TopBar.tsx | 135 | Top navigation |
| DataTable.tsx | 168 | Generic sortable table |
| ErrorBoundary.tsx | 59 | Error boundary |
| Other shared (14 files) | ~850 | AISuggestionCard, ConfirmDialog, FileUpload/Zone/List, FilterBar, MoneyCell/Input, ReadOnlyBanner, SearchableSelect, Skeleton, SlideOverPanel, StatusBadge, StepProgress |

### 2.13 V1 Auth System

- AuthProvider wraps app, loads token/user from localStorage
- Login: POST `/api/auth/login` → JWT + role normalization
- Token injection: `setAuthTokenGetter()` wired to `apiFetch`
- 401 handling: auto-logout (skips during hydration)
- AuthGuard: redirects to /login if no token
- Zero mock data remaining — all 33 pages use real API via `apiFetch`

---

## PHASE 3: V2 AUDIT (V2-Sabit Branch)

### 3.1 V2 Backend Services — 130 files

Same as V1 for core services. V2 has 12 fewer service files. Key differences noted below in comparison.

### 3.2 V2 Routes — ~420 HTTP Endpoints Across ~85 Route Files

Identical route structure to V1. Key additions in V2:
- `close_suggestions.ts` (205 lines) — POST generate, GET suggestions, POST accept/reject, GET health
- Knowledge base endpoints via `memory.ts` (211 lines)
- Richer recon routes: reject, reopen, notes, prior-period, copy-prior, carry-forward-items

### 3.3 V2 Migrations — 148 SQL Files

Same migrations 001-147 as V1. V1 has one additional migration (148_expanded_taxonomy.sql) that adds contra accounts and display ordering.

### 3.4 V2 Taxonomy — 48 Entries (NO contras)

Same base structure as V1 but:
- 48 entries vs V1's 39
- **Missing:** All contra-account lines (fs_revenue_contra, fs_asset_ar_allowance, fs_asset_ppe_accum_dep, fs_asset_intangible_amort, fs_equity_treasury)
- **Missing:** `is_contra` flag and `display_order` column (from V1's migration 148)

### 3.5 V2 Financial Statement Generation

**File:** `src/services/financialStatements.ts` (489 lines)

Identical logic to V1 (same engine). Both use:
- Data-driven bucketing by fsLineId
- CREDIT_POSITIVE_FS_LINES sign convention
- Decimal.js arithmetic
- Rounding adjustment at $0.01
- MathematicalIntegrityError on imbalance
- Suspicious plug detection

### 3.6 V2 Cash Flow — Identical to V1

Same file (172 lines), same indirect method logic.

### 3.7 V2 AI Orchestrator — 4 Pillars (V2 ONLY)

**File:** `src/ai/ai_orchestrator.ts` (387 lines)

**Pillar 1 — Justifier:**
- Input: pool, tenantId, periodLabel, relatedType (hitl_staging|close_adjustment|journal_entry|export), relatedId, facts
- Output: IRAC JSON (issue, rule, analysis, conclusion), memo_markdown, rule_ids, facts_used
- SHA-256 hash of inputs for idempotency

**Pillar 2 — Shadow Auditor:**
- Input: pool, tenantId, periodLabel, subjectType (journal_entry|tb_adjustment), subjectId, facts, materialityThreshold
- Output: severity (ok|warn|block), findings [{code, message, rule_ids, refs}], confidence 0-1
- Fail-open: returns warn on AI failure

**Pillar 3 — Classifier:**
- Input: pool, tenantId, periodLabel, sourceLines (NormalizedSourceLine[]), coaTaxonomy
- Output: results [{source_id, object_type, fs_placement, suggested_accounts, confidence}]
- Fail-open: returns empty results on failure

**Pillar 4 — Advisor:**
- Input: pool, tenantId, periodLabel, sourceLines (ClassifiedSourceLine[]), tbSummary, coaTaxonomy
- Output: proposals [{proposal_id, type (reclass|accrual_candidate|deferral_candidate|lease_candidate|mapping_fix|other), rationale, confidence, requires_human_confirmation, lines with amount_provenance}]
- Fail-safe: returns empty proposals on failure

### 3.8 V2 AI Subsystem (src/ai/) — 17 Files

| File | Lines | Purpose |
|------|-------|---------|
| ai_client.ts | 102 | Claude adapter + Zod validation + always log |
| ai_orchestrator.ts | 387 | 4-pillar orchestrator |
| ai_call_log_repository.ts | 44 | Persist every LLM call to DB |
| advisory_interface.ts | 70 | Type barrier: AI outputs branded as readonly |
| adapters/claude_adapter.ts | 154 | Claude HTTP adapter with mock support |
| prompts/justifier.prompt.ts | 55 | Justifier prompt (v1.0.0) |
| prompts/shadow_auditor.prompt.ts | 63 | Shadow auditor prompt (v1.0.0) |
| prompts/classifier.prompt.ts | 82 | Classifier prompt (v1.0.0) |
| prompts/advisor.prompt.ts | 95 | Advisor prompt (v1.0.0) |
| schemas/justifier.schema.ts | 23 | Zod schema |
| schemas/shadow_auditor.schema.ts | 22 | Zod schema |
| schemas/classifier.schema.ts | 23 | Zod schema |
| schemas/advisor.schema.ts | 71 | Zod schema with amount provenance |
| standards_snippets.ts | 19 | 7 snippets for Justifier |
| standards_snippets_shadow.ts | 72 | 12 snippets for Shadow Auditor |
| standards_snippets_classifier.ts | 52 | 8 snippets for Classifier |
| standards_snippets_advisor.ts | 42 | 6 snippets for Advisor |

**Multi-provider support:** Anthropic (primary), OpenAI, Mistral (via env key detection)
**Default model:** claude-sonnet-4-5-20250929
**Mock support:** AI_MOCK=true returns deterministic responses per pillar

### 3.9 V2 Knowledge Base — 3 Tiers

**Tier 1 — Global (FASB/IFRS/Tax):**
- 3 hardcoded Tax chunks (IRC §162(a), §263(a), §461)
- FASB/IFRS: quarantined RAG (returns empty in MVP)
- Keyword scoring search

**Tier 2 — Firm (CoA, Policies, Invoice Treatments):**
- In-memory stores for CoA, historical policies, invoice treatments
- `findSimilarTreatments` with weighted keyword matching (vendor 3x, account 2x)

**Tier 3 — Session (Uploaded Files):**
- Session-scoped uploads keyed by sessionId
- Cleanup on session end

**Hybrid Search:** BM25-style keyword scoring across selected tiers
**Vector Store:** 7 files (534 lines) — chunker, citation, store, retrieval, ingestion (code exists but no external vector DB connected)

### 3.10 V2 Amount Provenance System

**File:** `src/types/amount_provenance.ts` (89 lines)

Three provenance kinds:
1. `ledger_exact` — copied verbatim from TB row or ledger line
2. `engine_calculation` — computed by deterministic TypeScript engine (requires ruleId + ruleVersion)
3. `human_entered` — manually entered by named user

Validation: every non-zero amount in AI proposals MUST have valid provenance.

### 3.11 V2 Snapshot Hash System

**File:** `src/lib/snapshot_hash.ts` (253 lines)

| Version | Description |
|---------|-------------|
| 1 (Legacy) | Numbers as-is in JSON |
| 2 | Amounts as canonical strings ("1234.56") |
| 3 (Default) | v2 + evidence manifest in hash |
| 4 | v3 + general ledger entries in hash |

Sorted keys, SHA-256 hex digest, structural drift protection.

### 3.12 V2 Export Gate System

**File:** `src/services/export_gate_service.ts` (184 lines)

Fail-shut checks:
1. Materiality — rounding gap check
2. Audit ledger chain verification
3. Evidence integrity — SHA-256 hash verification per file
4. Unresolved CPA-CFA conflicts (when integrated supervisor enabled)
5. Resolution mismatch count
6. Qualitative evidence missing (informational only)

### 3.13 V2 Frontend Pages — 39 pages

V2 has all 33 V1 pages PLUS 6 additional:

| Route | Lines | Purpose |
|-------|-------|---------|
| `/onboarding` | 7 | Onboarding wizard wrapper |
| `/verify` | 550 | Public verification portal (no auth) |
| `/close/[sessionId]/discrepancies` | 485 | Unified discrepancy resolver (4 sources) |
| `/close/[sessionId]/ai-review` | 322 | AI review queue (HITL staging) |
| `/close/[sessionId]/controls` | 234 | SOX controls testing |
| `/close/[sessionId]/checklist` | 43 | Close checklist wrapper |

### 3.14 V2 Frontend Components — 38 files

V2 has all 24 V1 components PLUS 14 additional:

| Component | Lines | Purpose |
|-----------|-------|---------|
| OnboardingWizard.tsx | 553 | 7-step wizard: Welcome, Entity, CoA, TB, Close Guide, Statements, Complete |
| SmartCloseAssistant.tsx | 459 | 4 exports: ReconAIFlags, JEClassificationHint, CloseChecklistSuggestions, CloseHealthScore |
| CloseChecklist.tsx | 400 | Pipeline checklist with step completion |
| AIInsightsPanel.tsx | 357 | 4 tabs: Proposals, Risk Flags, GL Health, Decision Records |
| FundControllerDashboard.tsx | 293 | Fund controller: KPIs, consolidation readiness, intercompany |
| OperatingPartnerDashboard.tsx | 269 | PE partner: Portfolio Command Center, integrity score |
| ReviewerDashboard.tsx | 265 | CFO/reviewer: approval queue, certification readiness |
| AgentActivityPanel.tsx | 236 | 3 tabs: Precedents, Decisions, Semantic Search |
| PortfolioIntegrity.tsx | 222 | Integrity score gauge, component breakdown, trend |
| VerifiedCloseWorkflow.tsx | 180 | 4-step: ML Classification → IRAC → Multi-Sign-Off → Audit-Ready Push |
| DataQualityPanel.tsx | 156 | DQ checks with pass/fail/warning |
| AuditDefenseExport.tsx | 145 | Export audit defense package |
| IntegrityRibbon.tsx | 115 | Visual integrity score ribbon |
| DemoModeBanner.tsx | 34 | Banner for demo mode |

### 3.15 V2 Permissions — 6 Roles

V2 has 6 frontend roles vs V1's 5:
`admin`, `controller`, `fund_controller`, `reviewer`, `operating_partner`, `auditor`

The `fund_controller` role is unique to V2 — gets a dedicated FundControllerDashboard with consolidation readiness and intercompany matching.

### 3.16 V2 Dashboard — Role-Based Rendering

V2's dashboard (681 lines) uses persona-based rendering:
- OPEN state → OpenStateDashboard
- Reviewer persona → ReviewerDashboard
- Default → Full dashboard with CloseChecklist, DataQualityPanel, AgentActivityPanel, AIInsightsPanel

V1's dashboard (604 lines) uses state-based rendering only:
- OPEN → OpenStateDashboard
- IN_PROGRESS → Full dashboard with pipeline viz, gates, action items
- UNDER_REVIEW/CERTIFIED/LOCKED → Same structure with button gating

---

## PHASE 4: COMPARISON MATRIX

### 4.1 Core Pipeline

| Feature | V1 | V2 | Better | Port Difficulty |
|---------|----|----|--------|----------------|
| GL Upload (CSV/Excel) | BUILT | BUILT | Equal | — |
| GL-to-TB Aggregation | BUILT | BUILT | Equal | — |
| GL Replace Flow | BUILT | BUILT | V1 (has GLUploadFlow component) | — |
| Trial Balance (adjusted/unadjusted) | BUILT | BUILT | Equal | — |
| COA Mapping Engine | BUILT | BUILT | Equal | — |
| AI Classification Suggestions | BUILT | BUILT | Equal | — |
| Reconciliation (full lifecycle) | BUILT | BUILT | V2 (has reject, reopen, notes, prior-period, carry-forward) | MEDIUM |
| Journal Entries (full lifecycle) | BUILT | BUILT | Equal | — |
| AJE Templates | BUILT | BUILT | Equal | — |
| Statement Generation (BS+IS+CF+Equity) | BUILT | BUILT | Equal (identical engine) | — |
| QTD/YTD Cumulative Statements | BUILT | BUILT | Equal | — |
| Variance Analysis | BUILT | BUILT | Equal | — |
| Certification (Ed25519) | BUILT | BUILT | Equal | — |
| Lock (terminal) | BUILT | BUILT | Equal | — |
| Cascade Engine | BUILT | BUILT | Equal (identical 328 lines) | — |

### 4.2 Taxonomy & Statement Generation

| Feature | V1 | V2 | Better | Port Difficulty |
|---------|----|----|--------|----------------|
| BS Current/Noncurrent Classification | BUILT (23 entries) | BUILT (same) | Equal | — |
| IS Subtotal Hierarchy (COGS, OpEx, Other, Tax) | BUILT (11 entries) | BUILT (same) | Equal | — |
| OCI Lines (4 entries) | BUILT | BUILT | Equal | — |
| Cash Flow Taxonomy (3 sections) | BUILT | BUILT | Equal | — |
| Contra Accounts (5 entries) | BUILT (migration 148) | NOT BUILT | V1 | EASY |
| Display Ordering | BUILT (migration 148) | NOT BUILT | V1 | EASY |
| is_contra flag | BUILT | NOT BUILT | V1 | EASY |
| Net Amount Sign Convention | BUILT (CREDIT_POSITIVE_FS_LINES) | BUILT (same) | Equal | — |

### 4.3 AI Capabilities

| Feature | V1 | V2 | Better | Port Difficulty |
|---------|----|----|--------|----------------|
| AI Classification (SLM-based) | BUILT | BUILT | Equal | — |
| AI Orchestrator (4 pillars) | NOT BUILT | BUILT | V2 | HARD |
| Justifier (IRAC memos) | PARTIAL (justification_service.ts exists) | BUILT (dedicated pillar + prompt + schema) | V2 | MEDIUM |
| Shadow Auditor (pre-post checks) | PARTIAL (shadow_auditor_service.ts exists) | BUILT (dedicated pillar + deterministic + AI) | V2 | MEDIUM |
| Classifier (structured output) | NOT BUILT (as separate pillar) | BUILT | V2 | MEDIUM |
| Advisor (proposals with provenance) | NOT BUILT | BUILT | V2 | MEDIUM |
| AI Prompt Templates (versioned) | NOT BUILT | BUILT (4 prompt files) | V2 | EASY |
| Zod Output Schemas | NOT BUILT | BUILT (4 schema files) | V2 | EASY |
| Standards Snippets (33 total) | NOT BUILT | BUILT (4 snippet files) | V2 | EASY |
| Amount Provenance System | NOT BUILT (migration 084 exists) | BUILT (types + validation) | V2 | EASY |
| AI Call Logging | NOT BUILT (migration 080 exists) | BUILT | V2 | EASY |
| Advisory Type Barrier | NOT BUILT | BUILT (branded readonly types) | V2 | EASY |
| AI Guardrails (app-level) | BUILT | BUILT | Equal | — |
| AI Boundary (DB-level) | BUILT | BUILT | Equal (same migration 093) | — |
| AI Mock Support | NOT BUILT | BUILT (per-pillar mocks) | V2 | EASY |

### 4.4 Knowledge Base & RAG

| Feature | V1 | V2 | Better | Port Difficulty |
|---------|----|----|--------|----------------|
| Tier 1 Global (FASB/IFRS/Tax) | NOT BUILT | BUILT (3 Tax chunks, quarantined RAG) | V2 | EASY |
| Tier 2 Firm (CoA, Policies, Invoices) | NOT BUILT | BUILT (in-memory stores) | V2 | EASY |
| Tier 3 Session (Uploaded Files) | NOT BUILT | BUILT (session-scoped) | V2 | EASY |
| Hybrid Search (BM25-style) | NOT BUILT | BUILT | V2 | EASY |
| Vector Store | NOT BUILT | PARTIAL (code exists, no external DB) | V2 | MEDIUM |
| Memory API Routes | NOT BUILT | BUILT (211 lines) | V2 | EASY |

### 4.5 Frontend Pages & Components

| Feature | V1 | V2 | Better | Port Difficulty |
|---------|----|----|--------|----------------|
| Core Pipeline Pages (8 steps) | BUILT (33 pages) | BUILT (39 pages) | V2 (6 extra pages) | — |
| Discrepancy Resolver | NOT BUILT | BUILT (485 lines) | V2 | EASY |
| AI Review Queue | NOT BUILT | BUILT (322 lines) | V2 | EASY |
| SOX Controls Testing | NOT BUILT | BUILT (234 lines) | V2 | EASY |
| Public Verification Portal | NOT BUILT | BUILT (550 lines) | V2 | EASY |
| Onboarding Wizard (7 steps) | NOT BUILT | BUILT (553 lines) | V2 | EASY |
| Close Checklist Page | NOT BUILT | BUILT (43+400 lines) | V2 | EASY |
| Role-Specific Dashboards (3) | NOT BUILT | BUILT (827 lines total) | V2 | EASY |
| SmartCloseAssistant (4 exports) | NOT BUILT | BUILT (459 lines) | V2 | EASY |
| AIInsightsPanel (4 tabs) | NOT BUILT | BUILT (357 lines) | V2 | EASY |
| AgentActivityPanel | NOT BUILT | BUILT (236 lines) | V2 | EASY |
| PortfolioIntegrity | NOT BUILT | BUILT (222 lines) | V2 | EASY |
| VerifiedCloseWorkflow | NOT BUILT | BUILT (180 lines) | V2 | EASY |
| DataQualityPanel | NOT BUILT | BUILT (156 lines) | V2 | EASY |
| AuditDefenseExport | NOT BUILT | BUILT (145 lines) | V2 | EASY |
| IntegrityRibbon | NOT BUILT | BUILT (115 lines) | V2 | EASY |
| DemoModeBanner | NOT BUILT | BUILT (34 lines) | V2 | EASY |
| Mock Data Remaining | ZERO | ZERO | Equal | — |

### 4.6 RBAC & Permissions

| Feature | V1 | V2 | Better | Port Difficulty |
|---------|----|----|--------|----------------|
| Frontend Roles | BUILT (5 roles) | BUILT (6 roles) | V2 (fund_controller) | EASY |
| Backend Roles | BUILT | BUILT | Equal | — |
| SoD Enforcement (frontend) | BUILT | BUILT | Equal | — |
| SoD Enforcement (backend) | BUILT | BUILT | Equal | — |
| Settings Access Matrix | BUILT | BUILT | Equal | — |
| Sidebar Gating | BUILT | BUILT | Equal | — |
| Persona-Based Dashboards | NOT BUILT | BUILT (3 dashboards) | V2 | EASY |

### 4.7 Audit Trail & Certification

| Feature | V1 | V2 | Better | Port Difficulty |
|---------|----|----|--------|----------------|
| Hash-Chained Audit Ledger | BUILT | BUILT | Equal | — |
| Ed25519 Signing | BUILT | BUILT | Equal | — |
| Certification Artifacts | BUILT | BUILT | Equal | — |
| Ledger Snapshots | BUILT | BUILT | Equal | — |
| Snapshot Hash Versioning | BUILT | BUILT | Equal | — |
| Evidence Manifest | BUILT | BUILT | Equal | — |
| Export Gate (fail-shut) | BUILT | BUILT | Equal | — |
| Integrity Gate (A=L+E) | BUILT | BUILT | Equal | — |
| JE Immutability (DB triggers) | BUILT | BUILT | Equal | — |
| Append-Only Triggers | BUILT | BUILT | Equal | — |

### 4.8 Testing

| Feature | V1 | V2 | Better | Port Difficulty |
|---------|----|----|--------|----------------|
| Unit Tests | 110 files | 110 files | Equal | — |
| Integration Tests | BUILT | BUILT | Equal | — |
| AI Schema Tests | NOT BUILT | BUILT (justifier, classifier, advisor) | V2 | EASY |
| Security Tests | NOT BUILT | BUILT (pilot_security_hardening) | V2 | EASY |

### 4.9 Deployment & Infrastructure

| Feature | V1 | V2 | Better | Port Difficulty |
|---------|----|----|--------|----------------|
| cloudbuild.yaml | BUILT | NOT BUILT | V1 | EASY |
| frontend cloudbuild | BUILT | NOT BUILT | V1 | EASY |
| Demo Seed Script | BUILT | NOT BUILT | V1 | EASY |

---

## PHASE 5: GAP ANALYSIS — What NEITHER Codebase Has

1. **Async event-driven AI sidecar** — Both codebases run AI inline (synchronous within request). Neither has a message queue (Redis/RabbitMQ/Pub-Sub) for async AI processing.

2. **Plan-Execute-Verify agentic loop (activated)** — `planExecuteVerify.ts` exists in both (104 lines) but is not wired into any route or service. It's dead code.

3. **Vector store with external embedding DB** — V2 has vector store code (534 lines in 7 files) but no connection to Pinecone/Weaviate/pgvector. It's an in-memory placeholder.

4. **Real RAG pipeline** — V2's Tier 1 Global knowledge base quarantines the FASB/IFRS handbook integration (returns empty). No actual document chunking + retrieval pipeline is connected.

5. **Production deployment** — V1 has cloudbuild.yaml but no production environment. V2 has nothing for deployment.

6. **Real user validation** — Neither codebase has been tested with real users or real GL data from a PE-backed company.

7. **Multi-currency statement generation** — Migration 144 exists in both (multi_currency_gl) but the statement engine does not consume functional currency data during generation.

8. **Equity Statement detail** — `equityChanges.ts` (51 lines) is minimal in both — estimates residual as "owner contributions/distributions (net)" rather than breaking out share issuances, buybacks, dividends, AOCI.

9. **Lease accounting automation** — Migration 039 (leases) exists but no service is wired.

10. **EPS calculation** — Migration 042 (eps) exists but no service is wired.

11. **Business combinations / PPA** — Migration 036 exists but no service is wired.

12. **E2E test suite** — Neither has Cypress/Playwright browser tests.

13. **Rate limiting / API abuse protection** — Neither has rate limiting middleware.

14. **Webhook retry with dead-letter** — V2's notification_service sends webhooks but has no retry queue.

---

## PHASE 6: MERGE RECOMMENDATION

### 6.1 Foundation: V1 (master)

**Rationale:**
1. V1 is the deployed staging app with working end-to-end flow
2. V1 has migration 148 (contra accounts, display ordering) — a taxonomy improvement V2 lacks
3. V1 has cloudbuild.yaml for deployment
4. V1 has the demo seed script
5. V1's frontend is fully wired to real APIs (zero mock data)
6. Both backends share 95%+ identical service code (same 507 .ts files in src/)
7. The 12 extra services in V1 vs V2 are not critical but indicate V1 is slightly ahead on backend

### 6.2 Port FROM V2 → V1

**Priority 1 — AI Orchestrator (HIGH VALUE, MEDIUM EFFORT):**
- `src/ai/` directory (17 files) — orchestrator, prompts, schemas, snippets, client, adapter, advisory interface, call log repo
- `src/types/amount_provenance.ts` (89 lines) — provenance types + validation
- Wire orchestrator into existing services (shadow_auditor_service, justification_service, ai_classification_service)

**Priority 2 — Frontend Pages (HIGH VALUE, EASY EFFORT):**
- `/verify` page (550 lines) — public verification portal
- `/close/[sessionId]/discrepancies` page (485 lines) — unified discrepancy resolver
- `/close/[sessionId]/ai-review` page (322 lines) — AI review queue
- `/close/[sessionId]/controls` page (234 lines) — SOX testing
- `/onboarding` page + OnboardingWizard component (560 lines combined)
- `/close/[sessionId]/checklist` page + CloseChecklist component (443 lines combined)

**Priority 3 — Frontend Components (HIGH VALUE, EASY EFFORT):**
- Role-specific dashboards: FundControllerDashboard (293), OperatingPartnerDashboard (269), ReviewerDashboard (265)
- SmartCloseAssistant.tsx (459 lines)
- AIInsightsPanel.tsx (357 lines)
- AgentActivityPanel.tsx (236 lines)
- PortfolioIntegrity.tsx (222 lines)
- VerifiedCloseWorkflow.tsx (180 lines)
- DataQualityPanel.tsx (156 lines)
- AuditDefenseExport.tsx (145 lines)
- IntegrityRibbon.tsx (115 lines)

**Priority 4 — Knowledge Base (MEDIUM VALUE, EASY EFFORT):**
- `src/knowledge_base/` directory (12 files) — 3 tiers + hybrid search + vector store skeleton
- Memory API routes already exist in both codebases

**Priority 5 — fund_controller role (LOW VALUE, EASY EFFORT):**
- Add to frontend permissions.ts
- Wire to FundControllerDashboard

### 6.3 Build New (Neither Has)

**Priority 1:** Wire the Plan-Execute-Verify loop (both have dead code)
**Priority 2:** Connect vector store to pgvector for real RAG
**Priority 3:** Add E2E tests (Playwright)
**Priority 4:** Production deployment pipeline
**Priority 5:** Multi-currency statement generation
**Priority 6:** Detailed equity statement (beyond residual estimation)

### 6.4 Implementation Order

1. Port V2 AI orchestrator (src/ai/) → V1
2. Port V2 frontend pages (6 new pages) → V1
3. Port V2 frontend components (14 new components) → V1
4. Port V2 knowledge base → V1
5. Wire AI orchestrator into existing V1 services
6. Activate Plan-Execute-Verify loop
8. Connect pgvector for real RAG
9. E2E test suite
10. Production deployment

---

## APPENDIX: FILE COUNTS SUMMARY

| Category | V1 | V2 |
|----------|----|----|
| Backend .ts files (src/) | 507 | 507 |
| Frontend .tsx files | 75 | 95 |
| Service files | 142 | 130 |
| Route files | 84 | ~85 |
| HTTP endpoints | 422 | ~420 |
| Migrations | 149 | 148 |
| Test files | 110 | 110 |
| Frontend pages | 33 | 39 |
| Frontend components | 24 | 38 |
| Frontend page LOC | 11,712 | 13,603 |
| Frontend component LOC | 2,492 | 6,415 |
| AI subsystem files | 0 | 17 |
| Knowledge base files | 0 | 12 |
| FS taxonomy entries | 39 | 48 |
| Roles (frontend) | 5 | 6 |
| Permission functions | 19 | 17 |
