# Product Capability Audit — From Actual Code

> Generated 2026-02-23 by tracing every service file, route, migration, and gate in the codebase.
> This is what the product does today — not what the docs claim.

---

## Pipeline Overview

```
GL Upload → TB Derivation → COA Mapping → Reconciliation → Adjusting JEs
    → Statement Generation → Variance Analysis → Review & Certification → Lock
```

Each arrow is gated. You cannot skip steps. The cascade engine propagates changes backward through the pipeline when upstream data changes.

---

## Step-by-Step Audit

```
┌──────────────────────────────────────────────────────────────────────┐
│ STEP 1: GL INGEST                                                    │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEM DOES AUTOMATICALLY:                                           │
│   • Auto-detects 24+ column header variants (debit/dr/debits, etc.) │
│   • Detects JE format (has entry_id) vs register format (no entry_id)│
│   • Parses money notation: $1,234.56, (123), negative signs          │
│   • Validates per-entry balance (D=C per entry_id group, tol 0.01)   │
│   • Validates account codes against COA (if COA exists)              │
│   • Stages imbalanced entries for HITL with deterministic pattern    │
│     analysis (single-line, rounding, duplicate, decimal shift)       │
│   • Derives trial balance from balanced GL entries automatically     │
│   • Persists TB to database (no manual trigger needed)               │
│   • Infers account types from code prefix (1=Asset, 2=Liability...) │
│                                                                      │
│ HUMAN MUST DO:                                                       │
│   • Upload CSV file                                                  │
│   • Review/override column mapping if auto-detection is wrong        │
│   • Resolve HITL-staged imbalanced entries (approve/reject/fix)      │
│                                                                      │
│ SYSTEM ENFORCES (BLOCKS IF NOT MET):                                 │
│   • CSV format only (no XLSX/PDF)                                    │
│   • Must have account_code + (debit OR credit) columns              │
│   • No dual-sided lines (line cannot have both debit AND credit)     │
│   • Per-entry balance check (JE mode) — imbalanced entries rejected  │
│   • COA match required if COA exists — unknown codes rejected        │
│   • Imbalanced entries NOT persisted; staged for human review        │
│                                                                      │
│ AI ADVISORY (OPTIONAL):                                              │
│   • Pattern detection for imbalances is deterministic (no AI cost)   │
│   • AI flag set on HITL item only if deterministic confidence is low │
│                                                                      │
│ NOT IMPLEMENTED:                                                     │
│   • ERP sync (QuickBooks/Xero/NetSuite) — fully stubbed mock adapter│
│   • XLSX/PDF upload — CSV only                                       │
│                                                                      │
│ FILES:                                                               │
│   src/services/gl_upload_service.ts                                  │
│   src/services/gl_to_tb_aggregation_service.ts                       │
│   src/services/accounting_integration_service.ts (STUBBED)           │
│   src/db/repositories/general_ledger_repository.ts                   │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ STEP 2: COA MAPPING                                                  │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEM DOES AUTOMATICALLY:                                           │
│   • Applies existing mapping rules to accounts (pattern matching)    │
│   • Falls back to rule-based classifier (accountType → default line) │
│     with 0.8 confidence when no rule matches                         │
│   • When rules updated: fires MAPPING_CHANGED cascade to all open   │
│     sessions, auto-resolves unmapped_account issues                  │
│   • Increments rule version on each update                           │
│   • Records audit event for rule changes                             │
│                                                                      │
│ HUMAN MUST DO:                                                       │
│   • Create/edit mapping rules when classifier doesn't match          │
│   • Assign each GL account to a financial statement line item        │
│   • Review AI suggestions during onboarding (if used)                │
│                                                                      │
│ SYSTEM ENFORCES (BLOCKS IF NOT MET):                                 │
│   • HARD GATE: 100% of TB accounts must be mapped                   │
│   • Cannot advance to UNDER_REVIEW with ANY unmapped account         │
│   • Gate: checkMappingCompleteness() — passes only when              │
│     unmapped.length === 0                                            │
│                                                                      │
│ AI ADVISORY (OPTIONAL):                                              │
│   • Onboarding suggestions: AI classifies accounts into types        │
│     (Asset/Liability/Equity/Revenue/Expense)                         │
│   • Falls back to deterministic classifier if LLM fails              │
│   • Suggestions only — not auto-applied to mapping rules             │
│                                                                      │
│ FILES:                                                               │
│   src/services/coa_mapping_service.ts                                │
│   src/services/agentic_onboarding.ts                                 │
│   src/services/mapping_completeness_gate.ts                          │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ STEP 3: RECONCILIATION                                               │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEM DOES AUTOMATICALLY:                                           │
│   • Auto-generates recon requirements from TB when none exist        │
│     (ASSET + LIABILITY accounts only, $100 default tolerance)        │
│   • Populates GL balance from adjusted trial balance                 │
│   • Refreshes GL balances when AJEs posted (cascade)                 │
│   • If GL balance change pushes completed recon over tolerance:      │
│     auto-reverts to in_progress and creates blocking issue           │
│   • Computes variance/unexplained_variance via DB GENERATED columns  │
│   • Auto-recalculates reconciling items total after add/remove       │
│                                                                      │
│ HUMAN MUST DO:                                                       │
│   • Enter supporting balance (bank statement amount, subledger total)│
│   • Add reconciling items (bank fees, timing differences, etc.)      │
│   • Upload supporting evidence (bank statement PDF, etc.)            │
│   • Provide variance explanation if unexplained > 0 but ≤ tolerance  │
│   • Mark reconciliation as complete (preparer)                       │
│   • Approve reconciliation (reviewer — different person)             │
│                                                                      │
│ SYSTEM ENFORCES (BLOCKS IF NOT MET):                                 │
│   • Supporting balance MUST be set before completion                 │
│   • Evidence REQUIRED to complete (at least 1 attachment)            │
│   • Unexplained variance must be zero OR within tolerance            │
│   • Variance explanation required if 0 < variance ≤ tolerance        │
│   • SEGREGATION OF DUTIES: reviewer ≠ preparer (enforced in code)   │
│   • Cannot attach evidence to approved recon (locked)                │
│   • Cannot attach evidence to locked/certified session               │
│   • COMPLETENESS GATE: ALL required accounts must be                 │
│     completed/approved before advancing to UNDER_REVIEW              │
│   • Gate blockers: not_initialized, not_started, over_tolerance,     │
│     missing_explanation, awaiting_reviewer_approval                  │
│                                                                      │
│ AI ADVISORY (OPTIONAL):                                              │
│   • None — all reconciliation actions are explicit human actions     │
│                                                                      │
│ FILES:                                                               │
│   src/services/period_reconciliation_service.ts                      │
│   src/services/recon_completeness_gate.ts                            │
│   src/services/evidence_attachment_service.ts                        │
│   src/db/repositories/period_reconciliation_repository.ts            │
│   src/db/repositories/recon_requirements_repository.ts               │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ STEP 4: ADJUSTING JOURNAL ENTRIES                                    │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEM DOES AUTOMATICALLY:                                           │
│   • Proposes all active AJE templates at period start                │
│   • Validates balance (D=C, tolerance 0.001) on draft + propose      │
│   • Validates memo is non-empty on creation and posting              │
│   • Validates amount provenance on every non-zero debit/credit line  │
│   • Runs Shadow Auditor before posting (deterministic + AI checks)   │
│   • Runs AI Justifier after posting (generates IRAC justification)   │
│   • Triggers cascade engine on post (TB recalc, recon refresh, etc.) │
│   • Posted JEs are immutable via DB triggers (cannot UPDATE/DELETE)   │
│                                                                      │
│ HUMAN MUST DO:                                                       │
│   • Apply or skip each proposed template (with reason for skip)      │
│   • Create draft JEs with memo + balanced lines                      │
│   • Propose draft → approval                                        │
│   • Approve proposed JE (different person from creator)              │
│   • Upload evidence for JEs above materiality threshold              │
│   • Post approved JE                                                 │
│   • Reject JE with reason (min 10 chars)                             │
│                                                                      │
│ SYSTEM ENFORCES (BLOCKS IF NOT MET):                                 │
│   • Balance check: debits must equal credits (tolerance 0.001)       │
│   • Memo required on draft creation AND at posting                   │
│   • Amount provenance required on every non-zero line                │
│   • SEGREGATION OF DUTIES: approver ≠ creator                       │
│     (unless ALLOW_SAME_USER_APPROVE=1)                               │
│   • Evidence required for JEs above materiality threshold            │
│   • Shadow Auditor blocks posting when severity='block'              │
│     (restricted accounts, negative amounts detected)                 │
│   • Skip reason minimum 5 characters for template skip              │
│   • Rejection reason minimum 10 characters                          │
│   • DB triggers prevent modification of posted JEs (immutable)       │
│   • TEMPLATE GATE: all proposed templates must be applied or skipped │
│     before advancing to UNDER_REVIEW                                 │
│                                                                      │
│ AI ADVISORY (OPTIONAL):                                              │
│   • Shadow Auditor AI: pre-post pattern check (fail-open on error)   │
│   • Justifier AI: post-posting IRAC memo draft (not auto-saved)      │
│                                                                      │
│ FILES:                                                               │
│   src/services/aje_template_service.ts                               │
│   src/services/journal_entry_service.ts                              │
│   src/services/shadow_auditor_service.ts                             │
│   migrations/105_je_immutability_trigger.sql                         │
│   migrations/106_prevent_posted_je_lines_modification.sql            │
│   migrations/107_je_memo_required.sql                                │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ STEP 5: STATEMENT GENERATION                                         │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEM DOES AUTOMATICALLY:                                           │
│   • Builds 4 statements deterministically from adjusted TB:          │
│     - Balance Sheet (Assets, Liabilities, Equity)                    │
│     - Income Statement (Revenue, Expenses, Net Income)               │
│     - Cash Flow Statement (indirect method per ASC 230)              │
│     - Statement of Changes in Equity                                 │
│   • Computes input hash (SHA256 of canonical TB entries)             │
│   • Increments version number on each regeneration                   │
│   • Runs cross-statement validation:                                 │
│     - A = L + E (balance sheet equation)                             │
│     - IS net income = Equity statement net income                    │
│     - CF ending cash = BS cash                                       │
│     - Equity closing = BS total equity                               │
│   • Computes period-over-period variance diff                        │
│   • Detects suspicious plug accounts (>90% net activity)             │
│   • Marks statements stale when upstream data changes (cascade)      │
│   • Mathematical integrity kill switch: throws if D ≠ C or A ≠ L+E  │
│                                                                      │
│ HUMAN MUST DO:                                                       │
│   • Trigger statement generation (manual API call / button click)    │
│   • Review generated statements                                     │
│   • Regenerate if statements are stale after JE/mapping changes      │
│                                                                      │
│ SYSTEM ENFORCES (BLOCKS IF NOT MET):                                 │
│   • Kill switch: Sum(Debits) must equal Sum(Credits)                 │
│   • Kill switch: Assets must equal Liabilities + Equity              │
│   • Cross-statement validation must pass for certification           │
│     (6 hard checks: cash_flow_exists, equity_exists, BS equation,    │
│      net_income_tie, cash_tie, equity_tie)                           │
│   • Plug account alert: flags balanced-but-high-risk scenarios       │
│                                                                      │
│ AI ADVISORY (OPTIONAL):                                              │
│   • None — statement generation is purely deterministic arithmetic   │
│                                                                      │
│ CAVEATS:                                                             │
│   • Cash flow uses indirect method (estimated from TB deltas)        │
│   • Equity statement is minimal estimate (residual calculation)      │
│   • Both flagged estimated=true when no prior period data available  │
│                                                                      │
│ FILES:                                                               │
│   src/services/statement_package_service.ts                          │
│   src/services/financialStatements.ts                                │
│   src/services/cashFlow.ts                                           │
│   src/services/equityChanges.ts                                      │
│   src/services/cross_statement_validation.ts                         │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ STEP 6: VARIANCE ANALYSIS                                            │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEM DOES AUTOMATICALLY:                                           │
│   • Computes change_amount and change_percentage vs prior period     │
│   • Applies materiality threshold (default 5%) to flag material     │
│     variances                                                        │
│   • Generates boilerplate draft explanation (deterministic template) │
│                                                                      │
│ HUMAN MUST DO:                                                       │
│   • Write variance explanations for all material variances           │
│   • Approve each variance explanation                                │
│                                                                      │
│ SYSTEM ENFORCES (BLOCKS IF NOT MET):                                 │
│   • VARIANCE GATE: all material variances must have non-empty        │
│     explanations before advancing to UNDER_REVIEW                    │
│   • Gate: checkVarianceCompleteness() — passes only when             │
│     unexplained.length === 0                                         │
│                                                                      │
│ AI ADVISORY (OPTIONAL):                                              │
│   • AI draft explanation available but NOT auto-saved                 │
│   • Human must review, edit, and explicitly save                     │
│                                                                      │
│ FILES:                                                               │
│   src/services/variance_analysis_service.ts                          │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ STEP 7: REVIEW & CERTIFICATION                                       │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEM DOES AUTOMATICALLY:                                           │
│   • Computes readiness across 13 hard gates                          │
│   • Creates ledger snapshot (TB, GL, evidence manifest)              │
│   • Computes SHA256 hash of snapshot                                 │
│   • Creates certification artifact with Ed25519 digital signature    │
│   • Records audit event in hash-chained append-only ledger           │
│   • Row-level lock to prevent concurrent certification races         │
│                                                                      │
│ HUMAN MUST DO:                                                       │
│   • Trigger certification (requires approver role)                   │
│   • Resolve all hard blockers before certifying                      │
│                                                                      │
│ SYSTEM ENFORCES (BLOCKS IF NOT MET) — 13 HARD GATES:                │
│   1. Checklist required items complete (CASH_REC, NO_CRITICAL_ISSUES,│
│      MATERIAL_JES_APPROVED, INTEGRITY_CHECKS)                       │
│   2. Cash reconciliation signed off                                  │
│   3. Zero critical/blocking issues open                              │
│   4. All JEs approved or rejected (no drafts/proposed)               │
│   5. Audit ledger chain valid (hash chain integrity)                 │
│   6. Rounding gaps within materiality                                │
│   7. Reconciliation completeness (all required accounts reconciled)  │
│   8. All material variances explained                                │
│   9. All AJE templates applied or skipped                            │
│  10. Reconciliation evidence attached                                │
│  11. All accounts mapped to COA lines                                │
│  12. Statements not stale (regenerated after last change)            │
│  13. Trial balance exists and balances (Truth Gate: A = L + E)       │
│  14. Cross-statement validation passes (6 tie checks)                │
│                                                                      │
│ AI ADVISORY (OPTIONAL):                                              │
│   • None — certification is deterministic                            │
│   • assertNoAiMutationContext() BLOCKS AI from calling certify       │
│                                                                      │
│ FILES:                                                               │
│   src/services/close_session_service.ts                              │
│   src/services/close_checklist_readiness_service.ts                  │
│   src/services/certification_artifact_service.ts                     │
│   src/services/ledger_snapshot_service.ts                            │
│   src/lib/cert_signing.ts                                            │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ STEP 8: LOCK                                                         │
├──────────────────────────────────────────────────────────────────────┤
│ SYSTEM DOES AUTOMATICALLY:                                           │
│   • Records audit event (close_session_locked)                       │
│   • Terminal state — no further transitions allowed                  │
│                                                                      │
│ HUMAN MUST DO:                                                       │
│   • Trigger lock (manual, from CERTIFIED state only)                 │
│                                                                      │
│ SYSTEM ENFORCES:                                                     │
│   • Can only lock from CERTIFIED state                               │
│   • LOCKED is terminal — cannot reopen, cannot modify                │
│   • assertNoAiMutationContext() blocks AI from locking               │
│                                                                      │
│ REOPEN (from CERTIFIED only, NOT from LOCKED):                       │
│   • Requires approver role                                           │
│   • Requires reason (min 10 characters)                              │
│   • Transitions CERTIFIED → IN_PROGRESS                              │
│   • Creates blocking issue documenting the reopen                    │
│   • assertNoAiMutationContext() blocks AI from reopening             │
│                                                                      │
│ FILES:                                                               │
│   src/services/close_session_service.ts                              │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ CROSS-CUTTING: CASCADE ENGINE                                        │
├──────────────────────────────────────────────────────────────────────┤
│ TRIGGERS: AJE_POSTED, AJE_REVERSED, RECON_COMPLETED,                │
│   RECON_APPROVED, RECON_REJECTED, MAPPING_CHANGED,                  │
│   TB_REINGESTED, VARIANCE_EXPLAINED, ISSUE_RESOLVED                 │
│                                                                      │
│ WHAT IT DOES (synchronous, <2s target, max depth 3):                │
│   1. Recalculates adjusted trial balance                             │
│   2. Refreshes reconciliation GL balances (reverts if over tolerance)│
│   3. Marks statements stale if TB changed                            │
│   4. Re-runs all validation/readiness checks                        │
│   5. Auto-verifies resolved issues, creates new issues for problems  │
│                                                                      │
│ FILE: src/services/cascade_engine.ts                                 │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ CROSS-CUTTING: ISSUE DETECTION & AUTO-RESOLUTION                     │
├──────────────────────────────────────────────────────────────────────┤
│ AUTO-DETECTED PROBLEMS:                                              │
│   • unmapped_account — TB account without COA mapping (blocking)     │
│   • bs_imbalance — A ≠ L + E (critical)                             │
│   • recon_not_started / recon_over_tolerance / recon_incomplete      │
│   • missing_variance_explanation — material variance unexplained     │
│   • pending_aje_template — proposed template not applied/skipped     │
│                                                                      │
│ AUTO-RESOLUTION:                                                     │
│   • Issues auto-verify when their underlying check passes            │
│   • Triggered by cascade engine on each relevant event               │
│   • Idempotent: no duplicate issues for same type+account            │
│   • Human must fix the root cause; system detects when it's fixed    │
│                                                                      │
│ FILES:                                                               │
│   src/services/issue_detection_service.ts                            │
│   src/services/issue_auto_resolution_service.ts                      │
└──────────────────────────────────────────────────────────────────────┘

┌──────────────────────────────────────────────────────────────────────┐
│ CROSS-CUTTING: AI BOUNDARIES                                         │
├──────────────────────────────────────────────────────────────────────┤
│ HARD ENFORCEMENT:                                                    │
│   • assertNoAiMutationContext() — AI cannot call certify, lock,      │
│     or reopen. Throws immediately if in advisory context.            │
│   • assertNoNumericAmountsInAgentOutput() — AI output cannot contain │
│     debit/credit/amount/balance/total fields. Throws on violation.   │
│   • All LLM calls wrapped in enterAdvisoryContext/exitAdvisoryContext│
│                                                                      │
│ WHAT AI ACTUALLY DOES TODAY:                                         │
│   • Suggests account type classifications during onboarding          │
│   • Generates first-close guide steps                                │
│   • Drafts variance explanations (NOT auto-saved)                    │
│   • Shadow Auditor pre-post check on JEs (fail-open on AI error)     │
│   • IRAC justification after JE posting (draft only, human reviews)  │
│   • Policy inference recommendations (text only, no amounts)         │
│                                                                      │
│ WHAT AI CANNOT DO:                                                   │
│   • Compute or write any dollar amount to any financial table        │
│   • Trigger certification, lock, or reopen                           │
│   • Auto-apply mapping rules or post journal entries                 │
│   • Modify ledger, snapshot, or audit chain                          │
│                                                                      │
│ FILES:                                                               │
│   src/lib/ai_boundary.ts                                             │
│   src/llm/guardrails.ts                                              │
│   src/services/agentic_onboarding.ts                                 │
│   src/services/shadow_auditor_service.ts                             │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Summary: All Human Actions Required for a Complete Close

| # | Action | Step |
|---|--------|------|
| 1 | Upload GL CSV file | GL Ingest |
| 2 | Resolve any HITL-staged imbalanced entries | GL Ingest |
| 3 | Create/review COA mapping rules for all accounts | COA Mapping |
| 4 | Enter supporting balance for each balance sheet account | Reconciliation |
| 5 | Add reconciling items (bank fees, timing differences) | Reconciliation |
| 6 | Upload supporting evidence for each reconciliation | Reconciliation |
| 7 | Provide variance explanation if within tolerance | Reconciliation |
| 8 | Mark each reconciliation complete (preparer) | Reconciliation |
| 9 | Approve each reconciliation (reviewer, different person) | Reconciliation |
| 10 | Apply or skip each proposed AJE template | Adjusting JEs |
| 11 | Create any additional manual JEs with memo + balanced lines | Adjusting JEs |
| 12 | Propose, approve, and post each JE | Adjusting JEs |
| 13 | Upload evidence for JEs above materiality threshold | Adjusting JEs |
| 14 | Trigger statement generation | Statement Generation |
| 15 | Write variance explanations for all material variances | Variance Analysis |
| 16 | Trigger certification (approver role) | Certification |
| 17 | Trigger lock (optional, terminal) | Lock |

## Summary: All System-Automated Actions

| # | Action | Step |
|---|--------|------|
| 1 | Auto-detect GL column headers (24+ variants) | GL Ingest |
| 2 | Validate per-entry balance (D=C) | GL Ingest |
| 3 | Stage imbalanced entries with deterministic pattern analysis | GL Ingest |
| 4 | Derive trial balance from balanced GL entries | GL Ingest |
| 5 | Infer account types from code prefix | GL Ingest |
| 6 | Apply mapping rules to accounts (pattern match + fallback) | COA Mapping |
| 7 | Auto-generate recon requirements from TB (ASSET/LIABILITY) | Reconciliation |
| 8 | Populate GL balances from adjusted TB | Reconciliation |
| 9 | Refresh GL balances on cascade (revert recons if over tolerance) | Reconciliation |
| 10 | Compute variance/unexplained via DB GENERATED columns | Reconciliation |
| 11 | Propose active AJE templates at period start | Adjusting JEs |
| 12 | Enforce JE immutability via DB triggers (posted = read-only) | Adjusting JEs |
| 13 | Run Shadow Auditor pre-post checks | Adjusting JEs |
| 14 | Run AI Justifier post-posting (draft only) | Adjusting JEs |
| 15 | Build 4 financial statements (BS, IS, CF, Equity) deterministically | Statement Generation |
| 16 | Run cross-statement validation (6 tie checks) | Statement Generation |
| 17 | Detect suspicious plug accounts | Statement Generation |
| 18 | Mark statements stale when upstream changes | Statement Generation |
| 19 | Compute period-over-period variances | Variance Analysis |
| 20 | Create ledger snapshot with SHA256 hash | Certification |
| 21 | Sign certification artifact with Ed25519 | Certification |
| 22 | Run 13+ hard gates before allowing certification | Certification |
| 23 | Cascade: propagate changes through entire pipeline synchronously | Cross-cutting |
| 24 | Auto-detect issues (unmapped, imbalance, incomplete recon, etc.) | Cross-cutting |
| 25 | Auto-verify issues when underlying problem is fixed | Cross-cutting |

## Summary: All Gates / Enforcement Points

| # | Gate | Step | Type |
|---|------|------|------|
| 1 | Per-entry balance D=C (tolerance 0.01) | GL Ingest | Hard |
| 2 | No dual-sided GL lines | GL Ingest | Hard |
| 3 | Account code must exist in COA (if COA populated) | GL Ingest | Hard |
| 4 | 100% of TB accounts must be mapped | COA Mapping | Hard |
| 5 | Supporting balance required to complete recon | Reconciliation | Hard |
| 6 | Evidence required to complete recon | Reconciliation | Hard |
| 7 | Unexplained variance ≤ tolerance | Reconciliation | Hard |
| 8 | Variance explanation required if 0 < var ≤ tolerance | Reconciliation | Hard |
| 9 | Segregation of duties: reviewer ≠ preparer | Reconciliation | Hard |
| 10 | All required accounts reconciled | Reconciliation | Hard |
| 11 | JE balance check D=C (tolerance 0.001) | Adjusting JEs | Hard |
| 12 | JE memo required (non-empty) | Adjusting JEs | Hard |
| 13 | Amount provenance on every non-zero line | Adjusting JEs | Hard |
| 14 | Segregation of duties: approver ≠ creator | Adjusting JEs | Hard |
| 15 | Evidence required for JEs above materiality threshold | Adjusting JEs | Hard |
| 16 | Shadow Auditor blocks on severity='block' | Adjusting JEs | Hard |
| 17 | Posted JE immutability (DB trigger) | Adjusting JEs | Hard |
| 18 | All proposed templates applied or skipped | Adjusting JEs | Hard |
| 19 | Mathematical integrity: Sum(D) = Sum(C) | Statements | Hard |
| 20 | Mathematical integrity: A = L + E | Statements | Hard |
| 21 | Cross-statement: 6 tie checks for certification | Statements | Hard |
| 22 | All material variances explained | Variance | Hard |
| 23 | Statements not stale | Certification | Hard |
| 24 | TB exists and balances | Certification | Hard |
| 25 | Zero critical/blocking issues open | Certification | Hard |
| 26 | All JEs approved or rejected (no drafts/proposed) | Certification | Hard |
| 27 | Audit ledger hash chain valid | Certification | Hard |
| 28 | Rounding gaps within materiality | Certification | Hard |
| 29 | AI cannot mutate financial state | Cross-cutting | Hard |
| 30 | AI cannot output numeric amounts | Cross-cutting | Hard |
| 31 | Locked sessions cannot reopen | Lock | Hard |
