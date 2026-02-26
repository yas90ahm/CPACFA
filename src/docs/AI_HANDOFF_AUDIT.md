# AI Handoff Audit

**Purpose:** Trace the path from every agentic service output to the financial system. Ensure AI-generated dollar amounts never enter financial tables without explicit human confirmation.

**Rule:** AI NEVER TOUCHES NUMBERS. AI can classify, draft text, flag anomalies, suggest structure. AI cannot compute dollar amounts or have its numeric output auto-applied.

---

## Handoff Pattern (5 Steps)

For each agentic service that could produce amounts:

| Step | Question | Answer |
|------|----------|--------|
| 1 | AI service returns suggestion → assertNoNumericAmountsInAgentOutput applied? | YES/NO |
| 2 | Suggestion stored → Stored in ai_* table? If NO, where? | YES/NO / location |
| 3 | Human reviews → Explicit review/approval step? Can AI output auto-apply? | YES/NO |
| 4 | Human enters/confirms amount → Human types or confirms? Or AI amount auto-copied? | YES/NO |
| 5 | Financial system → Value in financial table: entered_by human? provenance correct? | YES/NO |

---

## Service-by-Service Trace

### agentic_account_classifier

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied on result (2025-02-10) |
| 2 | N/A | Returns classification (Asset/Liability/…) only; no storage to ai_* for this output |
| 3 | N/A | Output used for mapping only |
| 4 | N/A | No amounts |
| 5 | N/A | No amounts |

**Conclusion:** Safe. No dollar amounts; guardrail applied.

---

### agentic_ingestion_classifier

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied on result (2025-02-10) |
| 2 | N/A | Returns classification + schemaMapping; normalized data comes from sheet rows (user data), not LLM |
| 3 | N/A | Mapping drives parsing; amounts in normalized come from source file |
| 4 | N/A | Amounts from file, not AI |
| 5 | N/A | |

**Conclusion:** Safe. LLM returns only classification and mapping keys; guardrail applied.

---

### agentic_je_suggestions

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied on parsed result (2025-02-10). If LLM returns debit/credit/amount, guardrail throws and we return [] |
| 2 | YES | When suggestions exist they are stored in tenant_ai_proposals (or equivalent); no direct write to tenant_journal_entries |
| 3 | YES | User must approve/post JEs via bridge; executeBridgeCommand asserts assertNoAiMutationContext |
| 4 | YES | Journal entries posted via bridge use user-provided command payload; AI suggestions are advisory only |
| 5 | YES | Financial tables written only via executeBridgeCommand (human-originated) |

**Conclusion:** Safe. Guardrail rejects LLM output that contains amounts; any remaining suggestion path is advisory and requires human action to post.

---

### agentic_ar_ap_workflows (Collections, Payment Run, Cash Application)

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied on all three functions (2025-02-10). On violation, fallback used |
| 2 | N/A | Recommendations are typically displayed in UI; no direct write to financial tables from these functions |
| 3 | YES | User decides which recommendations to act on |
| 4 | YES | Payment/application amounts entered or confirmed by user |
| 5 | YES | Financial updates go through bridge or dedicated AP/AR services with user context |

**Conclusion:** Safe. Guardrail applied; outputs are recommendations only.

---

### accrual_deferral_service (suggestAccrualsAgentic)

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied (2025-02-10). On throw, rule-based suggestions only |
| 2 | N/A | Suggestions consumed by close/workflow; if stored, should be in ai_* or staging |
| 3 | YES | Accrual entries require human approval before posting |
| 4 | YES | Amounts in posted accruals must be from user confirmation or rule-based (open AR/AP/payroll) |
| 5 | YES | Posting via bridge only |

**Conclusion:** Safe. Guardrail blocks LLM amounts; rule-based amounts from open AR/AP/payroll are derived from user data.

---

### agentic_materiality_suggestion

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied on parsed JSON (2025-02-10). If LLM returns amount fields, we return undefined |
| 2 | N/A | Result is suggestion only; user accepts or edits |
| 3 | YES | Materiality is a user/audit decision |
| 4 | YES | User sets or confirms materiality settings |
| 5 | N/A | Materiality settings are config, not ledger rows |

**Conclusion:** Safe. Guardrail rejects LLM dollar amounts; only percent/basis can be used, with amount computed from human-provided summary when needed.

---

### agentic_bank_feed_matching

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied (2025-02-10). On throw, fallback (rule-based matches) |
| 2 | N/A | Match suggestions shown in UI; application is user-driven |
| 3 | YES | User confirms or corrects matches |
| 4 | YES | Applied amounts come from bank/GL data, not from LLM numeric output |
| 5 | YES | Reconciliation posting via bridge/user action |

**Conclusion:** Safe. Guardrail applied; suggestions are advisory.

---

### agentic_bank_rec_service (suggestReconciliationAdjustmentAgentic, explainBankRecAgentic)

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied on suggestReconciliationAdjustmentAgentic result (2025-02-10). explainBankRecAgentic returns text only (no amount keys) |
| 2 | N/A | Suggestions are advisory |
| 3 | YES | User applies or ignores adjustment suggestions |
| 4 | YES | Adjustment amounts entered or confirmed by user |
| 5 | YES | Posting via bridge |

**Conclusion:** Safe. Guardrail applied where structured data is returned.

---

### agentic_ledger_to_tb (parseLedgerLinesAgentic)

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied on parsed array (2025-02-10). If LLM returns debit/credit amounts, we return [] |
| 2 | N/A | Parsed lines feed into TB derivation; if used, they go through GL/TB path |
| 3 | YES | User uploads file and approves TB; no auto-post of parsed ledger lines without user step |
| 4 | YES | Amounts in TB from this path would be from LLM parse; guardrail prevents using LLM amounts (we return [] on violation) |
| 5 | YES | When guardrail passes, output has no amount keys (empty array); when it fails, we don’t use the data |

**Conclusion:** Safe. Guardrail ensures we do not use LLM-extracted debit/credit in financial pipeline (we fall back to []).

---

### invoice_to_books_service (suggestCodingAgentic)

| Step | Status | Notes |
|------|--------|-------|
| 1 | YES | assertNoNumericAmountsInAgentOutput applied on result (2025-02-10). Output is account codes/names only |
| 2 | N/A | Coding is stored on invoice capture; amounts come from invoice (user/source data) |
| 3 | YES | User approves coding before post |
| 4 | YES | Amounts from invoice; AI only suggests account codes |
| 5 | YES | Post to GL only after approval |

**Conclusion:** Safe. No amount in LLM output; guardrail applied.

---

### CPA decision handler (executeAgentRecommendation)

| Step | Status | Notes |
|------|--------|-------|
| 1 | N/A | This service executes deterministic calculations (lease, revenue, fixed asset, tax) using params |
| 2 | N/A | Results drive adjustments; params must be human-approved |
| 3 | CRITICAL | **Params (amount, rate, term, etc.) must NEVER come from raw AI output.** Callers must only pass params that have been entered or confirmed by a human (e.g. HITL form, user input) |
| 4 | YES | By design: executeAgentRecommendation must be invoked with human-approved params only |
| 5 | YES | Audit log records AGENTIC_ADJUSTMENT_EXECUTED; mutation path should be gated by bridge/HITL |

**Conclusion:** Safe only if every caller of executeAgentRecommendation supplies params from human-approved source. No direct AI → params path in codebase; document and enforce at API/caller level.

---

### Narrative / text-only agentic services

Examples: agentic_close_narrative, agentic_cash_flow_narrative, agentic_approval_summary, agentic_fx_currency, agentic_lease, agentic_deferred_tax, agentic_quality_assessor, agentic_close_coach, etc.

| Step | Status | Notes |
|------|--------|-------|
| 1 | N/A (text) | Return plain text; assertNoNumericAmountsInAgentOutput on a string does not flag (no amount keys in object sense). Optional: run on `{ text: raw }` for consistency |
| 2 | N/A | Text used for documentation/display |
| 3 | N/A | No structured amounts |
| 4 | N/A | No amounts |
| 5 | N/A | No amounts |

**Conclusion:** Safe. No structured dollar amounts in output.

---

## Summary

- **Guardrail applied:** All structured-data agentic services that could return amounts now call assertNoNumericAmountsInAgentOutput (2025-02-10). When the guardrail throws, services return fallback or empty so no AI-generated amounts are used.
- **Bridge:** executeBridgeCommand asserts assertNoAiMutationContext; no AI context can mutate financial tables.
- **ai_* tables:** AI proposals/suggestions are isolated; financial tables are updated only via human-originated commands (bridge).
- **CPA decision handler:** Must only receive params from human-approved sources; no direct AI → params path in code.

**P0 Item 2 (AI Guardrails): COMPLETED 2025-02-10**
