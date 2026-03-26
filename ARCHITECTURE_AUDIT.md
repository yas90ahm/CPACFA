# Sabit Architecture Audit — 171 Services, 65,000 LOC

**Date:** 2026-03-26
**Audited by:** Claude Code (4 parallel agents, full codebase read)

## Overview

| Metric | Count |
|--------|-------|
| Total backend services | 171 |
| Total LOC (services only) | ~65,000 |
| Fully wired (active callers) | 164 |
| Unwired (no callers) | 5 |
| Utility/agent-only | 2 |
| Backend routes | 30+ |
| Frontend query hooks | 30+ |
| Frontend pages | 40+ |

---

## Pipeline: GL Upload → Certified Financial Statements

```
CONTROLLER UPLOADS GL CSV
       │
       ▼
  1. GL UPLOAD & PARSE (10 services)
  gl_upload_service → gl_to_tb_aggregation → trial_balance_store
  + gl_health_analysis (10 checks, A-F score)
  + gl_anomaly_detection (7 anomaly types)
  + deterministic_pattern_detector (80% of GL errors)
       │
       ▼
  2. ACCOUNT CLASSIFICATION & MAPPING (12 services)
  Layer 0: 120+ curated patterns (95-98% confidence)
  Layer 1: Prior period rules (coa_mapping_rules)
  Layer 2: XBRL trigram search (17,943 elements)
  Layer 2b: Claude AI RAG selection
  Layer 3: mapping_validation_agent (ASC citations)
  Layer 4: mapping_cross_validation (8 structural checks)
  Layer 5: mapping_learning_service (entity + cross-tenant)
  Auto-accept: confidence ≥0.80 + validation passes
       │
       ▼
  3. RECONCILIATION (15 services)
  period_reconciliation_service (GL vs supporting balance)
  + transaction_matching_service (bank-to-GL, 1:N, N:1)
  + recon_intelligence_service (pre-fill from prior period)
  + evidence_attachment + evidence_storage (SHA-256)
  Gate: recon_completeness_gate
       │
       ▼
  4. ADJUSTING ENTRIES (9 services + 13 modules)
  journal_entry_service (draft → proposed → approved → posted)
  + shadow_auditor_service (runs on EVERY JE post)
  + 13 accounting modules propose JEs:
    prepaids, fixed assets, payroll, debt, deferred tax,
    leases (ASC 842), inventory reserve, equity comp,
    impairment, revenue (ASC 606), AP aging, AR aging, segments
  Gate: template_completeness_gate
       │
       ▼
  5. STATEMENT GENERATION (13 services)
  statement_package_service (versioned, deterministic)
  → financialStatements (BS + P&L, kill switch enforced)
  → cashFlow (indirect method)
  → equityChanges
  → cross_statement_validation
  → certified_statements_service (from ledger snapshot)
       │
       ▼
  6. VARIANCE ANALYSIS (5 services)
  variance_analysis_service (compute, explain, approve)
  + variance_chat_service (Claude conversational explanation)
  + gl_investigation_service (what accounts drove the change)
       │
       ▼
  7. REVIEW & CERTIFICATION (16 services)
  close_session_service (state machine)
  11 gates → all must pass → certification
  → certification_artifact_service (Ed25519 signature)
  → ledger_snapshot_service (immutable snapshot)
  → period_lock_service (terminal, irreversible)

  States: OPEN → IN_PROGRESS → UNDER_REVIEW → CERTIFIED → LOCKED
```

---

## Service Reference by Pipeline Stage

### 1. GL Upload & Parse (10 services, ~4,200 LOC)

| Service | LOC | What It Does | Called By |
|---------|-----|-------------|----------|
| gl_upload_service | 1349 | Parse CSV/Excel GL, validate per-entry balance, save | routes/gl/ingest |
| gl_to_tb_aggregation_service | 213 | Aggregate GL entries → trial balance (Decimal.js) | gl_upload, routes/gl/ingest |
| trialBalanceParser | 91 | Normalize rows, SHA-256 lineId for audit trail | fileIngestion, routes |
| fileIngestion | 191 | CSV/XLSX ingestion with canonical column mapping | routes/trial-balance/ingest |
| trial_balance_store_service | 184 | Save/load unadjusted TB per tenant+period | gl_upload, routes/hitl |
| trial_balance_rollup_service | 89 | Aggregate monthly TBs into quarter/year | session_trial_balance |
| deterministic_pattern_detector | 303 | Detect ~80% GL patterns (no AI, instant) | gl_upload_service |
| gl_health_analysis_service | 926 | 10-check quality analysis, scores A-F | routes/gl/ingest, gl_health |
| gl_anomaly_detection_service | 235 | Anomalies: new accounts, reversed, duplicates | routes/close/gl_health |
| gl_investigation_service | 407 | What accounts drove the variance? | routes/close/investigation |

### 2. Account Classification & Mapping (12 services, ~4,500 LOC)

| Service | LOC | What It Does | Called By |
|---------|-----|-------------|----------|
| accountClassifier | 322 | Deterministic type classification (ASC 210) | coa_mapping, 10+ callers |
| ai_classification_service | 1167 | 6-layer pipeline + suggestion persistence | routes/suggestions, autonomous_mapping |
| autonomous_mapping_service | 273 | 5-layer orchestrator, auto-accept ≥0.80 | routes/suggestions |
| coa_mapping_service | 170 | Apply COA rules → fs_line_id | routes/coa_mapping, cascade_engine |
| coa_template_service | 108 | Detect ERP source (QB, Xero, NetSuite) | routes/trial-balance |
| coa_upload_service | 198 | Chart of Accounts CSV upload | routes/coa |
| mapping_completeness_gate | 165 | Hard gate: all accounts must be mapped | session_readiness, 5+ callers |
| mapping_validation_agent | 534 | Layer 3: mismatch detection + ASC corrections | autonomous_mapping |
| mapping_cross_validation_service | 198 | Layer 4: 8 structural checks | autonomous_mapping |
| mapping_learning_service | 308 | Layer 5: entity + cross-tenant learning | ai_classification |
| xbrl_search_service | 213 | Trigram search, 17,943 XBRL elements | ai_classification, mapping_agent |
| slm_client_service | 186 | HTTP client to Python SLM (dormant) | routes/suggestions |

### 3. Reconciliation (15 services, ~4,800 LOC)

| Service | LOC | What It Does | Called By |
|---------|-----|-------------|----------|
| period_reconciliation_service | 819 | Full lifecycle: init, balance, complete, approve | close_session, routes |
| recon_completeness_gate | 188 | Gate: all required accounts reconciled | session_readiness_gates |
| recon_intelligence_service | 313 | Pre-fill from prior period, PDF extraction | close_session, routes |
| recon_requirements_auto_generate | 179 | Auto-generate requirements from COA | routes |
| recon_service | 250 | Bank recon: runs, items, match groups | routes |
| recon_source_ingestion_service | 305 | Parse CSV sources, auto-match to GL | routes |
| reconciliation_resolution_service | 136 | Resolution workflow (assignee, due date) | routes |
| reconciliation_summary_service | 134 | Auditor summary artifact | routes/audit |
| reconciliation_todos | 165 | Gap → actionable to-dos | routes/audit |
| roll_forward_recon_service | 268 | Roll-forward for BS accounts | routes |
| transaction_matching_service | 580 | Bank-to-GL matching (exact, fuzzy, 1:N) | routes |
| evidence_attachment_service | 383 | Attach evidence to JEs and recons | routes |
| evidence_policy_service | 222 | Enforce evidence for certification | close_session |
| evidence_storage_service | 261 | File storage (disk/S3, SHA-256) | 5+ callers |
| evidence_manifest_service | 113 | Certified evidence manifest | close_session |

### 4. Adjusting Entries (9 services, ~2,400 LOC)

| Service | LOC | What It Does | Called By |
|---------|-----|-------------|----------|
| journal_entry_service | 813 | JE lifecycle: draft → posted | 13+ callers |
| aje_template_service | 259 | Recurring templates: propose, apply, skip | close_session, routes |
| closing_entries_service | 76 | Revenue/expense → retained earnings | routes |
| close_adjustments_service | 222 | Unified adjustment queue | routes, adjusted_TB |
| close_adjustment_update_service | 181 | Update status with workflow checks | protocol_bridge |
| draft_service | 207 | Save-for-later adjustments | routes/hitl |
| approval_request_service | 118 | Create/approve/reject requests | routes/approvals |
| approval_workflow_service | 39 | Workflow definitions | routes/approvals |
| segregation_service | 85 | Segregation of duties enforcement | 5+ callers |

### 5. Accounting Modules (13 services, ~4,300 LOC)

| Service | LOC | ASC/IFRS | Proposes JEs? |
|---------|-----|----------|--------------|
| prepaid_amortization_service | 259 | ASC 340-10 | Yes |
| fixed_asset_service | 405 | ASC 360 | Yes |
| payroll_accrual_service | 306 | — | Yes |
| debt_accrual_service | 219 | — | Yes |
| deferred_tax_service | 443 | ASC 740 / IAS 12 | Yes |
| lease_accounting_service | 759 | ASC 842 | Yes |
| inventory_reserve_service | 524 | ASC 330 | Yes |
| stock_compensation_service | 104 | ASC 718 / IFRS 2 | Yes |
| impairment_service | 90 | IAS 36 / ASC 350 | No |
| revenue_recognition_service | 518 | ASC 606 / IFRS 15 | Yes |
| segment_service | 112 | IFRS 8 / ASC 280 | No |
| ap_aging_service | 265 | ASC 405-20 | Yes |
| ar_aging_service | 300 | ASC 326-20 (CECL) | Yes |

### 6. Statement Generation (13 services, ~3,500 LOC)

| Service | LOC | What It Does | Called By |
|---------|-----|-------------|----------|
| statement_package_service | 681 | Versioned packages with diff | routes |
| financialStatements | 523 | BS + P&L with kill switch | statementGenerator |
| statementGenerator | 172 | Multi-standard (US GAAP, IFRS, ASPE) | routes |
| statement_drilldown_service | 199 | Line → accounts → GL entries | routes |
| adjusted_trial_balance_service | 283 | Unadjusted + approved adjustments → Adjusted | 17+ callers |
| session_trial_balance_service | 304 | Session-scoped TB with mapping status | routes |
| certified_statements_service | 176 | Certified output from snapshot | close_session, export |
| comparative_statements_service | 103 | Multi-period side-by-side | routes |
| cumulative_statement_service | 377 | QTD/YTD aggregation | routes, board_package |
| cross_statement_validation | 127 | Certification-time re-validation | close_session |
| cashFlow | 239 | Cash flow (indirect) | statement_package, 5+ |
| equityChanges | 51 | Changes in equity | statement_package, 5+ |
| ebitda_bridge_service | 115 | EBITDA bridge computation | routes |

### 7. Variance Analysis (5 services, ~870 LOC)

| Service | LOC | What It Does | Called By |
|---------|-----|-------------|----------|
| variance_analysis_service | 242 | Compute, explain, approve, gate | routes, statement_package |
| variance_chat_service | 255 | Claude conversational narration | routes/investigation |
| cumulative_variance_service | 242 | QTD/YTD vs prior year | routes |
| materiality_service | 56 | Thresholds per tenant | close_status |
| materiality_config_service | 73 | Effective materiality + defaults | export_gate |

### 8. Review & Certification (16 services, ~4,200 LOC)

| Service | LOC | What It Does | Called By |
|---------|-----|-------------|----------|
| close_session_service | 1068 | State machine (OPEN → LOCKED) | 11+ callers |
| close_readiness_service | 64 | Pre-close checks | close_status |
| close_checklist_readiness_service | 347 | Checklist + hard/soft gating | close_session, cascade |
| session_readiness_gates_service | 223 | Frontend gates array | routes |
| certification_artifact_service | 195 | Ed25519 build + hash + sign | close_session |
| ledger_snapshot_service | 152 | Immutable snapshot at cert time | close_session |
| integrity_check | 95 | Final Truth Gate | routes/export |
| integrity_gate_service | 215 | Deterministic validation | statementGenerator |
| integrity_report_service | 447 | Entity/portfolio integrity | routes/portfolio |
| integrity_conflict_service | 139 | Detect/classify conflicts | routes/export |
| export_gate_service | 184 | Pre-export firewall | routes/export |
| template_completeness_gate | 37 | Templates applied/skipped | session_readiness |
| gate_event_service | 247 | Gate orchestration + auto-advance | job_handlers |
| auto_advance_service | 237 | Auto-advance when gates pass | cascade_engine |
| period_lock_service | 100 | Terminal period lock | 10+ callers |
| subsequent_event_service | 101 | ASC 855 events | close_session |

### 9. AI Pillars (8 services, ~1,800 LOC)

| Service | LOC | What It Does | Trigger |
|---------|-----|-------------|---------|
| shadow_auditor_service | 189 | Pre/post JE checks | Every JE post |
| professional_review_service | 134 | CPA supervisor review | routes/audit |
| justification_service | 615 | IRAC justification + audit defense PDF | JE post, routes/hitl |
| variance_chat_service | 255 | Conversational variance narration | routes/investigation |
| judgment_going_concern | 83 | Going-concern (ASC 205-40) | professional_review |
| policy_inference_agentic | 83 | Policy change proposals | result_generator |
| agentic_onboarding | ~150 | CoA mapping + first-close guide | routes/onboarding |
| hitl_orchestrator | 312 | Human-in-the-loop escalation | routes/hitl, agents |

### 10. Governance & Audit (11 services, ~3,100 LOC)

| Service | LOC | What It Does | Called By |
|---------|-----|-------------|----------|
| audit_ledger_service | 161 | Hash-chained append-only ledger | 9+ callers |
| audit_log_service | 114 | Structured audit logging | routes |
| audit_service | 278 | Material event recording | 15+ callers |
| audit_export_service | 525 | Certified audit binder | routes/audit |
| audit_binder_export_service | 191 | PDF/CSV export | routes/audit |
| audit_analytics_service | 319 | Close analytics/metrics | routes/portfolio |
| audit_data_access_service | 478 | External auditor access | routes |
| close_controls_service | 153 | COSO framework controls | routes |
| disclosure_checklist_service | 174 | ASC disclosure tracking | routes |
| decision_record_service | 54 | Immutable decision log | routes |
| quality_checks | 106 | Data quality evaluation | recon_summary |

### 11. Portfolio & Reporting (9 services, ~2,500 LOC)

| Service | LOC | What It Does | Called By |
|---------|-----|-------------|----------|
| portfolio_service | 574 | Cross-entity aggregation for PE | routes/portfolio |
| portfolio_alerts_service | 293 | Real-time alerts | routes/portfolio |
| pe_reporting_service | 179 | PE hierarchy re-aggregation | routes |
| board_package_service | 202 | Board-ready reporting package | routes |
| budget_service | 166 | Budget upload + variance | routes |
| pack_builder_service | 79 | Management report packs | routes |
| pdf_export | 350 | Professional PDF export | routes/export |
| excel_export_service | 290 | .xlsx export | routes |
| export_service | 323 | Agent reasoning → PDF/CSV | 10+ callers |

### 12. Infrastructure (30+ services, ~6,500 LOC)

| Service | LOC | What It Does |
|---------|-----|-------------|
| cascade_engine | 366 | Central nervous system — triggers re-computation on mutations |
| notification_service | 443 | In-app + webhook notifications |
| entity_settings_service | 192 | Fiscal year, currency, materiality per entity |
| team_service | 250 | User management (invite, roles) |
| onboarding_service | 183 | Guided setup wizard |
| oauth_service | 421 | OAuth2 (QuickBooks, Xero, NetSuite) |
| accounting_integration_service | 202 | ERP sync abstraction |
| persistence_service | 648 | HITL staging + supervisor sessions |
| job_worker | 97 | Durable job worker with retry |
| issue_service | 408 | Central issue system (6-state lifecycle) |
| issue_detection_service | 266 | Auto-detect issues per type |
| close_velocity_service | 269 | Historical tracking + timeline prediction |
| triage_service | 206 | Materiality, risk score, risk drivers |
| account_intelligence_service | 868 | Pre-classifier for ERP accounts |
| risk_context_store | 273 | Session-scoped risk flags |
| data_quality_rule_service | 97 | Quality rules CRUD + evaluation |

---

## Key Architectural Patterns

1. **Cascade Engine** — when financial data changes (mapping, JE, recon), `executeCascade()` re-computes: adjusted TB → statements → validation → readiness
2. **AI Boundary** — AI writes ONLY to `ai_*` tables. Promotion to core requires human confirmation. `assertNoNumericAmountsInAgentOutput()` enforced
3. **Decimal.js everywhere** — all financial arithmetic. PostgreSQL `NUMERIC(20,2)`. Zero floating point
4. **Hash-chained audit ledger** — SHA-256 chain, tamper-evident, verified at certification
5. **Ed25519 certification** — signed attestation, public verification endpoint
6. **11 gates** — progressive validation, all must pass for certification
7. **Fail-open AI** — when Claude unavailable, degrades to deterministic. Never blocks close
