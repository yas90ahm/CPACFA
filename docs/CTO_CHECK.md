# CPACFA — Technical Architecture Report (CTO Check)

> **Status: TO REVIEW**

*VC Technical Diligence — CTO Summary*

---

## 1. ARCHITECTURE OVERVIEW

### High-level system architecture (text/ASCII)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND (Next.js, port 3000)                        │
│  Upload / Chat UI → supervisorChat() → POST /api/supervisor/chat                  │
│  AgentThinkingHUD → GET /api/supervisor/session/:sessionId/trace                   │
└─────────────────────────────────────────────────────────────────────────────────┘
                                          │
                                          ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         NODE API (Express, port 3001)                             │
│  unified_orchestrator: infer strategy → month_end_close | forensic                │
│  ├─ month_end_close: runResultPipeline(pipelineInput) → step1CPA → step2CFA →    │
│  │   step3Supervisor → applySkepticGate(report)                                   │
│  └─ forensic: runSupervisor(message, context) [ReAct] → applySkepticGate(report)  │
└─────────────────────────────────────────────────────────────────────────────────┘
         │                              │                              │
         ▼                              ▼                              ▼
┌─────────────────┐  ┌─────────────────────────────┐  ┌──────────────────────────┐
│ DETERMINISTIC   │  │ AI (Claude 3.5 Sonnet)       │  │ SKEPTIC / AUDITOR        │
│ • trialBalance  │  │ • Supervisor (ReAct + tools) │  │ • runSkepticReview()     │
│   Parser        │  │ • Skeptic (review report)   │  │ • runDiscussion()        │
│ • financial     │  │ • Justification, export     │  │ • applySkepticGate()      │
│   Statements   │  │ • agentic_classifier, etc.   │  │ • HITL staging            │
│ • integrity_gate│  │                             │  │ • Python: Benford, round  │
│ • planExecute   │  │                             │  │   sum, unusual_time        │
│   Verify       │  │                             │  │                           │
└─────────────────┘  └─────────────────────────────┘  └──────────────────────────┘
         │                              │                              │
         └──────────────────────────────┼──────────────────────────────┘
                                        ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  POSTGRES (tenant_* tables)                                                       │
│  tenant_hitl_staging | tenant_supervisor_sessions (reasoning_logs JSONB) |       │
│  tenant_session_uploads | close_adjustments | revenue_recognition | ...           │
└─────────────────────────────────────────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│  PYTHON BACKEND (Flask, port 5000) — optional                                     │
│  accounting_engine.py | governance/integrity_gate, forensic_skeptic,              │
│  skepticism_agent | export/csv_formatter | ingestion pipeline                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### Core components and interactions

- **Unified entry**: `unified_orchestrator.runUnifiedSupervisor()`. Strategy is inferred from message (month-end close vs forensic) or overridden by `mode`.
- **Month-end close path**: `runResultPipeline()` → `step1CPA` (parse TB, build BS/P&L, Plan-Execute-Verify) → `step2CFA` (ratios) → `step3Supervisor` (memo) → **Skeptic gate** on the report; then response to user.
- **Forensic path**: `runSupervisor()` (ReAct loop with tools: `buildFinancialStatements`, `computeRatios`, `forensicRescan`, etc.) → **Skeptic gate** on report → optional Discussion if Skeptic finds an issue; user sees final consensus only.
- **Data grounding**: `buildFinancialStatements` accepts only `sessionId` + `tenantId`; trial balance is loaded from DB (session snapshot). Rejecting `entries` / `prior_entries` from the LLM prevents invented numbers from entering the pipeline.
- **Integrity gate**: After building statements, `runIntegrityGate()` checks Σ Debits = Σ Credits and A = L + E; on failure the tool returns an error to the agent and the user does not see an unbalanced output.

### Data flow: ingestion → classification → validation → output

1. **Ingestion**: Frontend upload → `POST /api/supervisor/chat` (with `raw_rows`) or ingestion routes (`/api/ingestion/agent`, `/api/trial-balance/ingest`). Raw rows (accountName, debit, credit) enter the pipeline as `PipelineInput` (type `raw_rows`).
2. **Classification**: **Deterministic**: `accountClassifier.classifyTrialBalanceDeterministic()` — keyword rules (e.g. "cash"→ASSET, "payable"→LIABILITY) + codification refs (ASC 210, IAS 1). **Agentic fallback**: `classifyAccountsAgentic()` (LLM) when deterministic classification is not used or for messy ledger; `agentic_ledger_to_tb` can extract accountName/debit/credit from raw lines via LLM.
3. **Validation**: **Trial balance**: `parseTrialBalance()` — Σ debits vs Σ credits within tolerance (0.01); `balances` flag and `errors` array. **Statements**: `runPlanExecuteVerify()` — V1: TB balances; V2: A = L + E within materiality; V3/V3b: P&L cross-foot; V4: codification. **Hard gate**: `runIntegrityGate()` — same math; if it fails, tool returns error and no BS is shown.
4. **Output**: Balance Sheet, P&L, (optional) Cash Flow, Equity, Notes; ratios; executive memo. If HITL thresholds are exceeded (e.g. amount ≥ $10k or critical policy change), the action is sent to `submitToStaging()` (pending) and the user must approve/reject via API.

---

## 2. THE DETERMINISTIC ENGINE

### Double-entry enforcement (A = L + E)

**TypeScript — `src/services/integrity_gate_service.ts`**

```typescript
export function runIntegrityGate(input: IntegrityGateInput): IntegrityGateResult {
  const tolerance = input.tolerance ?? DEFAULT_TOLERANCE;
  const { totalDebits, totalCredits } = getTrialBalanceTotals(input.trialBalance);
  const { totalAssets, totalLiabilities, totalEquity } = input.balanceSheet;

  const trialBalanceGapExceeds = absGt(totalDebits, totalCredits, tolerance);
  const trialBalanceBalances = !trialBalanceGapExceeds;

  const rhs = totalLiabilities + totalEquity;
  const balanceSheetGapExceeds = absGt(totalAssets, rhs, tolerance);
  const balanceSheetBalances = !balanceSheetGapExceeds;

  const passed = trialBalanceBalances && balanceSheetBalances;

  return {
    passed,
    error: passed ? undefined : INTEGRITY_GATE_CRITICAL_MESSAGE,
    checks: {
      trialBalanceBalances,
      balanceSheetBalances,
    },
  };
}
```

**Python — `backend/governance/integrity_gate.py`**

- `run_integrity_gate(total_debits, total_credits, total_assets, total_liabilities, total_equity, tolerance)` — deterministic check: trial_balance_balances = not (abs(d - c) > tol), balance_sheet_balances = not (abs(a - (l + e)) > tol); returns `IntegrityGateResult(passed, error, ...)`.

**Python — `backend/accounting_engine.py`**

- Balance sheet is built from trial balance; totals are summed from statement lines. Validation: `validate_balance_sheet(bs, tolerance)` raises `ValidationError` if `abs(bs.total_assets - (bs.total_liabilities + bs.total_equity)) > tolerance` (ASC 210-10-45, IAS 1.49).

### Journal entry validation (Debit = Credit)

**Trial balance (TS)** — `src/services/trialBalanceParser.ts`: `tolerance = 0.01`; `balances = Math.abs(totalDebits - totalCredits) < tolerance`; if not balanced, `errors.push(...)`.

**Python accounting_engine**: `trial_balance()` builds `total_d`, `total_c` from `balances_by_account`; `balances = abs(total_d - total_c) < tolerance`.

**Adjustments** — `src/services/push_close_to_gl_service.ts`: if `Math.abs(debitTotal - creditTotal) > 0.01` return `{ success: false, errors: ['Adjustment must balance (debits = credits)'] }`.

### Hardcoded accounting rules (ASC/IFRS)

- **Codification constants** — `src/constants/codification.ts`: BALANCE_SHEET (ASC 210-10-45), COMPREHENSIVE_INCOME (ASC 220), IAS 1.54/1.81, ASSET_REF, LIABILITY_REF, EQUITY_REF, REVENUE_REF, EXPENSE_REF.
- **Python** — `backend/accounting_engine.py`: ASC_210, ASC_220, ASC_230, ASC_350_40, ASC_360_35, ASC_606; used in Balance Sheet, Income Statement, depreciation (SL, DDB), revenue recognition.
- **Plan-Execute-Verify** — `src/services/planExecuteVerify.ts`: plan text references "FASB ASC 205, 210, 220; IAS 1"; checks V1–V4 (TB balance, A = L + E, P&L cross-foot, codification).

### Mathematical calculations — none done by AI

- **Trial balance totals**: `parseTrialBalance()` (TS) sums debit/credit in code.
- **BS/P&L totals**: `financialStatements.ts` uses `sumRound2()` / `sumLines()` (Decimal.js).
- **Ratios**: `computeRatios` → `computeLiquidityMetrics()` (currentRatio, quickRatio, DSO, DIO, DPO, CCC); ROE = netIncome/totalEquity; netMargin = netIncome/revenue; debtToEquity = totalLiabilities/totalEquity — all in TS.
- **Integrity gate**: `absGt`/`absLt` in `src/utils/decimal.ts` (Decimal.js).
- **Depreciation**: Python `depreciation_schedule_sl`, `depreciation_schedule_ddb` — formulas in code.
- **Python skeptic**: Benford's Law (chi-square), round-sum detection, unusual time/weekend — all deterministic.

**Conclusion**: All numeric outputs (TB totals, BS/P&L, ratios, integrity checks, depreciation, skeptic stats) are computed by deterministic code; the AI suggests actions and narrative, not the numbers.

---

## 3. THE AI INTEGRATION

### Where AI is called (files and functions)

| Location | Function / flow | Purpose |
|----------|------------------|---------|
| `src/agents/Supervisor.ts` | ReAct loop | Main agent: thought + tool calls (buildFinancialStatements, computeRatios, forensicRescan, etc.) |
| `src/agents/auditor_agent.ts` | `runSkepticReview()`, `runDiscussion()` | Skeptic: review report; mediator: consensus + final report |
| `src/llm/provider.ts` | `generateText()` | Single LLM call (Anthropic default; OpenAI/Mistral optional) |
| `src/services/justification_service.ts` | LLM call | Analysis and conclusion with FASB/IFRS citations (RAG) |
| `src/services/export_service.ts` | LLM | Export reasoning/narrative |
| `src/services/agentic_ledger_to_tb.ts` | LLM | Extract accountName, debit, credit from messy ledger lines |
| `src/services/agentic_plan_execute_verify.ts` | Optional LLM | Plan/verify narrative when API key present; else fixed plan |
| `src/services/agentic_account_classifier.ts` | Classification | Account type when deterministic classifier defers |
| `src/services/agentic_gap_analyzer.ts`, `policy_inference_agentic.ts` | Gaps / policy | Agentic gap analysis and policy proposals |
| `backend/ingestion/classification_agent.py` | Classification | File/jurisdiction classification (Python) |

### What AI is used for

- **Classification**: account type (asset/liability/equity/revenue/expense), ledger line → (accountName, debit, credit), file/jurisdiction.
- **Anomaly / forensic**: `forensicRescan` tool and forensic flows; narrative on "personal expense" or anomalies; Python skeptic (Benford, round-sum, unusual time) is deterministic; LLM adds interpretation.
- **Commentary**: executive memo, justification text, export narrative, Skeptic finding text, discussion/consensus text.
- **Orchestration**: which tool to call and with what arguments (e.g. sessionId/tenantId only for buildFinancialStatements); no numeric fabrication because tools reject invented entries.

### Prompt templates

- **Data grounding** (all LLM prompts): `DATA_GROUNDING_RULE` in `src/llm/guardrails.ts` — "Base your response only on the data provided… Do not invent facts, amounts, accounts…"
- **Skeptic**: `SCEPTIC_SYSTEM` in `auditor_agent.ts` — "Assume the Supervisor is wrong. Find one discrepancy… Output FINDING: or NO_ISSUE."
- **Discussion**: `DISCUSSION_SYSTEM` — "Produce CONSENSUS: and FINAL_REPORT:".
- **Agentic ledger extraction**: "You are a CPA-grade data extractor. Extract account name and debit/credit amounts… Return only a JSON array."
- **Justification**: system + RAG chunks; analysis and conclusion citing codifications.

### How AI outputs are validated before acceptance

- **Tool input**: `buildFinancialStatements` — Zod schema allows only `sessionId`, `tenantId`, `standard`, `lease`, `fullSet`; if `entries` or `prior_entries` are present → Grounding Violation; data is loaded from DB only.
- **Numeric outputs**: BS/P&L and ratios are produced by deterministic services (buildFinancialStatements, computeRatios), not by parsing LLM-generated numbers.
- **Integrity**: Every time statements are built, `runIntegrityGate()` and `runPlanExecuteVerify()` run; on failure the tool returns an error and the pipeline does not return unbalanced statements to the user.
- **Skeptic**: Second LLM reviews the report; if it finds an issue, `runDiscussion()` produces a consensus and final report; user sees only the final report.

### Fallback when AI fails

- **callWithFallback** (`src/llm/callWithFallback.ts`): `callLLMWithFallback({ parse, fallback })` — on `generateText` throw or parse failure, returns `fallback`. Used where integrated (e.g. agentic plan/verify returns fixed plan when LLM unavailable).
- **Supervisor**: If the ReAct loop hits an error (e.g. tool error), it can retry or eventually return "Reached maximum iterations" / error message; no silent use of bad numbers because tools load from DB and run the gate.
- **Agentic classifier**: Deterministic classifier runs first; agentic used when needed; if LLM fails, fallback behavior depends on caller (e.g. default type or error).
- **Skeptic**: If LLM is down, the flow that calls `runSkepticReview` would throw unless wrapped in try/catch and a fallback (e.g. "Skeptic unavailable, report not verified") is implemented.

---

## 4. THE SKEPTIC/AUDITOR LAYER

### How AI decisions are reviewed

- **Skeptic (TypeScript)** — `src/agents/auditor_agent.ts`: `runSkepticReview(report)` builds a report string (Supervisor response + tool results) and calls `generateText()` with `SCEPTIC_SYSTEM` ("Assume the Supervisor is wrong… Find one discrepancy in the P&L or a misapplied FASB rule"). Output is parsed for `NO_ISSUE` or `FINDING:` / `SUGGESTED_CORRECTION:`. If there is a finding, `runDiscussion()` is called to produce `CONSENSUS` and `FINAL_REPORT`; the user sees only `FINAL_REPORT`.
- **Unified orchestrator** — `src/services/unified_orchestrator.ts`: Both month-end-close and forensic paths call `applySkepticGate(report)` after the Supervisor (or pipeline) produces the report. So every user-facing report is passed through the Skeptic before being returned.

### What triggers human review (HITL)

- **Hitl orchestrator** — `src/services/hitl_orchestrator.ts`: `shouldEscalateToHuman({ amount, isCriticalAccountingPolicyChange })` — if `amount` (e.g. journal or adjustment) ≥ `amountThreshold` (default $10,000) or if `criticalPolicyChangeRequiresApproval` and the change is a critical accounting policy, the action is escalated. Escalated items are sent to `submitToStaging()` (pending); they appear in `tenant_hitl_staging` and must be approved/rejected via API (e.g. webhook or UI).
- **Guardrails** — `src/llm/guardrails.ts`: `shouldEscalateToHuman(confidence)` when confidence < 0.8 (e.g. for display/UX; exact wiring to staging may vary).

### How errors are caught before they reach the user

- **Integrity gate**: Unbalanced TB or A ≠ L+E → tool returns error to the agent; response is not sent as successful financial statements.
- **Plan-Execute-Verify**: If verification fails, `buildFinancialStatements` returns "Verification failed: …" and the pipeline does not return unverified statements.
- **Data grounding**: Rejecting `entries`/`prior_entries` in tools prevents the model from injecting fabricated trial balance into the engine.
- **Skeptic**: Second LLM pass; if it finds an issue, Discussion produces a corrected or qualified final report.
- **Pending HITL**: Pipeline can refuse to build statements while pending staging items exist (`buildFinancialStatements` returns an error when there are pending staging items for the tenant).

---

## 5. DATA ARCHITECTURE

### Database schema (relevant tables)

- **tenant_hitl_staging** (migration 062): id, tenant_id, proposed_action, justification, status (pending/approved/rejected), type (journal_entry, policy_change, adjustment, flag_override, other), amount, payload (JSONB), created_at, updated_at, approved_at, approved_by, rejected_at, rejected_reason.
- **tenant_supervisor_sessions** (062, 063): id, tenant_id, user_id, mode (chat/pipeline), status, pipeline_input_snapshot (JSONB), last_step, last_result_summary, message_history (JSONB), reasoning_logs (JSONB), created_at, updated_at, completed_at.
- **tenant_session_uploads**: id, tenant_id, session_id, filename, content_type, summary_text, metadata, uploaded_at.
- **Close adjustments, revenue recognition, period trial balance, etc.**: Various tenant_* and period tables (see migrations 001–063).

### How transactions are stored

- Trial balance input is either in memory in the pipeline or persisted in `pipeline_input_snapshot` (and optionally in period/trial balance tables depending on routes).
- Approved HITL adjustments are applied via `mergeAdjustmentsIntoEntries()`; adjustment payloads (debits/credits) live in `tenant_hitl_staging.payload`.
- Close adjustments and journal entries may be stored in close_adjustments and related tables; journal entry push goes through `accounting_integration_service.pushJournalEntry()`.

### How reasoning traces are stored

- **reasoning_logs** (JSONB on `tenant_supervisor_sessions`): Append-only list of steps. Each entry: stepType (thought | tool), timestamp, thought | toolName/toolInput/toolResult, rawDataSeen, ruleApplied, verificationResult (e.g. passed, checks[]).
- Populated by `appendReasoningLog()` from the Supervisor/context when a step is executed.
- **GET /api/supervisor/session/:sessionId/trace** returns `reasoningLogs` and `stagingItems` for that session's tenant.

### Multi-tenant isolation

- All main tables are tenant-scoped (`tenant_id`).
- APIs use `getTenantId(req)` and `getTenantPool(req)` (or equivalent) so queries and session/staging access are per-tenant.
- Sessions and HITL staging are keyed by tenant; trace endpoint loads session by id and then uses session.tenantId for staging items.

---

## 6. ERROR HANDLING & TESTING

### Test coverage

- **Unit**: e.g. `tests/unit/export_gate_service.test.ts` (export gate blocks when rounding gap exceeds materiality).
- **Integration**: `tests/integration/validation.test.ts` — API input validation (auth, stock comp, etc.); references `app.js` and test helpers.
- **Gaps**: No tests found in this repo for `runIntegrityGate`, `runPlanExecuteVerify`, or `integrity_gate_service`; no dedicated tests for the deterministic accounting engine (trial balance, BS/P&L, ratios).
- **Jest** is used (tests/package.json, describe/it/expect).

### Example test cases for critical logic

- **Export gate**: "blocks export when roundingGapExceedsMateriality" and "when aggregateRoundingExceedsMateriality" — ensures export is blocked and alert message is set.
- **Validation tests**: Invalid login payloads, missing required fields, invalid email format — ensure 400 and validation messages.

### Error handling for AI failures

- **callLLMWithFallback**: Returns `fallback` on throw or parse failure.
- **Supervisor**: Tool errors are returned to the agent; the loop can continue or exit; no silent use of bad data because tools validate and use DB + gate.
- **Skeptic**: If `runSkepticReview` or `runDiscussion` throws and is not caught, the request fails; a safe fallback would be to mark "Skeptic unavailable" and optionally still return the Supervisor report with a disclaimer.

### Logging/monitoring

- **Logger**: `src/lib/logger.ts` exists; usage is partial (e.g. console.error in result_generator).
- **Structured audit**: Reasoning steps and tool results are stored in `reasoning_logs`; HITL actions in `tenant_hitl_staging` with timestamps and status.
- **Python**: governance/audit dashboards and immutable log modules exist; extent of integration with the Node pipeline varies.

---

## 7. EXAMPLE TRANSACTION FLOW

**Example: "Received $10,000 payment for 12-month SaaS contract"**

- **Ingestion**: User sends a message (e.g. with trial balance rows or upload). Raw rows might include Cash +10,000, Deferred Revenue +10,000 (or similar). Data enters as `PipelineInput` (raw_rows) or via session snapshot.
- **Classification**: Accounts (e.g. "Cash", "Deferred Revenue") are classified by `classifyTrialBalanceDeterministic()` (keywords) or agentic classifier → ASSET, LIABILITY, etc. Codification refs (e.g. ASC 606 for revenue) come from constants and statement generator.
- **Validation**: `parseTrialBalance(rows)` ensures Σ debits = Σ credits. `buildFinancialStatements` (or `generateStatements`) builds BS and P&L from classified entries. `runPlanExecuteVerify()` runs V1–V4. `runIntegrityGate()` re-checks TB and A = L + E. If any check fails, the tool returns an error and the user does not see unbalanced statements.
- **Revenue (12-month SaaS)**: If the flow uses the statement generator with ASC 606, revenue recognition may be applied (e.g. from `listContracts` and contract/period data); exact path depends on `generateStatements` and standard (US_GAAP/IFRS). Ratios (e.g. from `step2CFA` or `computeRatios`) are computed from BS/P&L totals in code (no AI math).
- **Output**: Balance Sheet and P&L (and optional memo) are returned. If this $10,000 journal were proposed by the agent and exceeded the HITL threshold, it would be sent to `submitToStaging()` and require approval before being merged into the adjusted TB.

**Code path (concise)**  
`POST /api/supervisor/chat` → `runUnifiedSupervisor` → strategy (e.g. forensic) → `runSupervisor` (ReAct) → tool `buildFinancialStatements` with `sessionId`/`tenantId` only → `loadSessionSnapshot` → `entriesFromSnapshot` → `mergeAdjustmentsIntoEntries` (approved HITL) → `parseTrialBalance` → `generateStatements` / `buildFinancialStatements` → `runPlanExecuteVerify` → `runIntegrityGate` → on success return BS/P&L; on failure return tool error. Then `applySkepticGate` on the report → user sees final report or error.

---

## 8. CODE QUALITY METRICS

- **Scale**: Monorepo with `src/` (TypeScript, Express), `frontend/` (Next.js), `backend/` (Python), `migrations/`, `connectors/`, `mcp_server/`.
- **Rough size**: Hundreds of TS files under `src` (agents, services, routes, db, types); dozens of migrations; multiple Python modules. Exact total LOC not run here; structure suggests mid-to-large codebase.
- **Structure**: Clear separation: agents (Supervisor, auditor, tools), services (result_generator, persistence, integrity_gate, planExecuteVerify, hitl_orchestrator), routes, db repositories, constants, types.
- **Technical debt / TODOs**: TODO.md: .env.example, PDF/OCR pipeline (mock), CFA modules (equity research, Black–Scholes, CAPM) planned, Pinecone optional, production token/HTTPS. Some duplicate logic (e.g. integrity gate in TS and Python); Python backend is optional and some flows are Node-first.
- **Dependencies**: Core: @anthropic-ai/sdk, express, pg, zod, decimal.js, bcrypt, jsonwebtoken, multer, xlsx, pdf-lib, csv-parse. Optional: openai, @mistralai/mistralai, pdf-parse.

---

## 9. THE "MOAT" ANALYSIS

- **Domain logic that is hardcoded**: Double-entry and A = L + E in multiple places (integrity_gate, accounting_engine, planExecuteVerify, financialStatements, trialBalanceParser). Codification (ASC 210, 220, 230, 350-40, 360-35, 606; IAS 1) and statement layout. Depreciation (SL, DDB), revenue recognition hooks, and ratio formulas (current/quick, ROE, net margin, DSO/DIO/DPO). HITL thresholds and staging workflow. Deterministic account classification rules and Plan-Execute-Verify checks. Python: Benford's Law, round-sum, unusual time/weekend (forensic skeptic).
- **Differentiation from "just wrapping Claude"**: Data grounding: tools that only accept sessionId/tenantId and load from DB. No AI-generated numbers in the engine: BS/P&L and ratios are computed in code. Mandatory integrity and verification gates before any financial output. Second-model review (Skeptic) and optional Discussion. Persistent reasoning traces and HITL staging for audit and compliance.
- **What would be hard to replicate**: Correctly implementing and maintaining double-entry, materiality, and codification across TB, BS, P&L, and adjustments. Designing tool contracts and prompts so the model cannot inject fabricated entries. Integrating skeptic + discussion and HITL so that high-impact or policy changes are always reviewed. Audit trail (reasoning_logs, staging, and trace API) suitable for professional use.

---

## 10. HONEST ASSESSMENT

- **Implemented vs planned**: Implemented: Unified orchestrator, month-end close and forensic paths, integrity gate, Plan-Execute-Verify, Skeptic, HITL staging, session and reasoning persistence, trace API, deterministic TB/BS/P&L and ratios, codification refs, Python accounting engine and skeptic. Partially or planned: Full PDF/OCR pipeline (mock noted), CFA modules (DCF exists; equity research, Black–Scholes, CAPM noted as planned), optional Pinecone, production hardening.
- **Production-ready vs prototype**: Core accounting and gate logic are production-style (deterministic, testable). Test coverage for that core is thin (no integrity_gate or planExecuteVerify tests in repo). Auth and tenant context are present but production token/HTTPS and scaling are TODOs. Some duplication (TS vs Python) and optional backends suggest evolution and possible consolidation.
- **AI-generated vs hand-written**: Structure and naming look consistent; domain comments (ASC, IAS, double-entry) suggest hand-written or heavily edited core. No way to prove origin; the important point is that critical paths are deterministic and validated.
- **Limitations / risks**: Reliance on a single LLM provider (Anthropic) for core agent and Skeptic unless OpenAI/Mistral are configured. If Skeptic or Discussion fails without a fallback, the API could error instead of degrading gracefully. Test coverage for the deterministic engine and integrity gate is insufficient for high-stakes deployment. Python and Node both contain accounting logic; keeping them in sync is a maintenance burden.

---

**End of report.** Suitable for CTO/investor technical diligence; recommend adding targeted tests for the integrity gate and Plan-Execute-Verify and documenting a single source of truth for accounting rules (TS vs Python) for production.
