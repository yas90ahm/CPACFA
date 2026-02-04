## Coaching!

====================================================
1. CORE WORKING FLOWS (must be provable in code)
====================================================

### Workflow A — **Trial balance file upload → deterministic BS + P&L with hard math “kill switch”**
- **Input**
  - `POST /api/trial-balance/ingest` multipart upload (`file` = CSV/XLSX) + JSON body fields (e.g. `standard`, `fullSet`, `comparative`, `periodLabel`, etc.)
  - Implemented in `src/routes/trial-balance/ingest.ts` (`router.post('/ingest', ...)`).
- **Processing path (files/functions)**
  - File bytes → `ingestTrialBalanceFile()` in `src/services/fileIngestion.js` (imported) → rows
  - Rows → `parseTrialBalance()` in `src/services/trialBalanceParser.js`
  - Statements (deterministic totals) → either:
    - `generateStatements()` in `src/services/statementGenerator.js` **or**
    - `buildValidatedStatements()` in `src/services/financialStatements.ts`
      - Enforces:
        - Check A: \( \sum debits == \sum credits \) else throws `MathematicalIntegrityError('A', …)` (`buildValidatedStatements()`)
        - Check B: \( assets == liabilities + equity \) else throws `MathematicalIntegrityError('B', …)`
      - Uses deterministic classifier by default: `classifyTrialBalanceDeterministic()` (`src/services/accountClassifier.ts`, called from `buildFinancialStatements()`).
- **Output**
  - JSON response containing at minimum:
    - `trialBalance` (with classified entries)
    - `balanceSheet`
    - `profitAndLoss`
  - On failure: `422` with `{ error: 'MathematicalIntegrityError', check, imbalanceAmount, details }` (caught in `ingest.ts`).
- **Why this is production-real**
  - It is a real mounted Express route (`src/server.ts` mounts `app.use('/api/trial-balance', ...)`) with a deterministic computation core.
  - It has a hard invariant enforcement path that **throws** on illegal accounting states (not just warnings).
  - There are repo tests specifically targeting these kill-switch invariants (`tests/smoke/integrity_gate.test.ts` per test audit).

---

### Workflow B — **Trial balance JSON → validated statements via Python “math worker”**
- **Input**
  - `POST /api/math/trial-balance` JSON `{ coa: [...], entries: [...], as_of?: "YYYY-MM-DD" }`
  - Implemented in `backend/app.py` (`@app.route("/api/math/trial-balance", methods=["POST"])`).
- **Processing path (files/functions)**
  - Flask handler → `_run_trial_balance_math(body)` (in `backend/app.py`) → `accounting_engine` (per backend mapping)
  - Errors:
    - `MathematicalIntegrityError` → `_math_integrity_422()` returns `422` with explicit imbalance metadata
    - `ValidationError`/`ValueError` return `400`
- **Output**
  - JSON: `trial_balance`, `balance_sheet`, `validation` (per route docstring and response builder `_jsonify_trial_balance_response()`).
- **Why this is production-real**
  - It’s a concrete HTTP endpoint with explicit error handling paths and a consistent 422 “math integrity” contract.
  - It returns usable structured outputs (not just narrative).

---

### Workflow C — **Hard integrity gate function (reusable)**
- **Input**
  - `runIntegrityGate({ trialBalance, balanceSheet, tolerance? })`
  - Implemented in `src/services/integrity_gate_service.ts`.
- **Processing path (files/functions)**
  - Computes totals → compares with tolerance pulled from shared financial rules (`getFinancialRules()` via `rules_registry`)
  - Returns `{ passed, error, checks }` (does not silently pass failures).
- **Output**
  - Deterministic pass/fail result with check flags.
- **Why this is production-real**
  - It’s not an “LLM quality” check; it’s deterministic enforcement.
  - It is referenced by the codebase’s “kill switch” model and is tested (per test audit).

(Everything else in the repo may exist, but most does **not** meet the bar of “end-to-end route/service returning usable outputs without stubs/unwired validation.”)

====================================================
2. PARTIALLY IMPLEMENTED / FRAGILE FLOWS
====================================================

### Fragility 1 — **LLM-driven “messy TB cleanup” can silently fail and still proceed**
- **Where**
  - `src/routes/trial-balance/ingest.ts`: `isMessyTrialBalance()` then `agenticLedgerToTrialBalance(...)` inside `try { ... } catch { /* keep original rawRows */ }`
- **What’s missing**
  - No enforcement that the “agentic cleanup” output conforms to schema beyond later parsing.
  - Silent fallback masks extraction failure; you can get a “successful” ingest with garbage rows, only caught later if math breaks.

### Fragility 2 — **Agentic classification is allowed and not integrity-checked beyond math**
- **Where**
  - `src/routes/trial-balance/ingest.ts`: `useAgenticClassification` triggers `classifyTrialBalance()` (agentic) instead of deterministic.
- **What’s missing**
  - No invariant that classification is consistent with account types/COA rules (only the balance equations are enforced).
  - Misclassification can produce “balanced but wrong” financial statements.

### Fragility 3 — **`allowImbalance` returns HTTP 200 with illegal data**
- **Where**
  - `src/routes/trial-balance/ingest.ts`: if `allowImbalance` and `MathematicalIntegrityError`, it returns `200` with `success: true` plus imbalance info.
- **Why this is dangerous**
  - Downstream clients can treat 200 as “good enough” and proceed; you’ve explicitly built a footgun that undermines “deterministic correctness.”

### Fragility 4 — **Many “don’t fail ingest if X fails” blocks create silent compliance/audit gaps**
- **Where**
  - `src/routes/trial-balance/ingest.ts` has multiple `catch {}` patterns:
    - `runRulesAndPersistExceptions(...).catch(() => {})`
    - professional review wrapped in `try/catch` with “Do not fail ingest”
    - period financial state upsert wrapped in `try/catch` with “Do not fail ingest”
- **What’s missing**
  - If audit logging / exception persistence / professional review are “required controls,” they’re not enforced.
  - You need either: hard-fail, or explicit surfaced warnings that must be acknowledged (HITL) before export.

### Fragility 5 — **Auth posture is inconsistent and has explicit bypass paths**
- **Where**
  - `src/server.ts` defaults to `requireAuth` for `/api` but includes `DIAGNOSTICS_AUTH_BYPASS` for:
    - `/trial-balance/ingest`
    - `/supervisor/chat`
    - trace endpoint regex
- **What’s missing**
  - Strong tests proving bypass cannot be enabled accidentally in prod configs.
  - Route-level authorization coverage tests (per test audit: essentially absent).

### Fragility 6 — **Audit ledger chain verification exists but is not proven by tests**
- **Where**
  - Test audit found `audit_ledger_service.ts::verifyChain()` exists but not tested, and export gate doesn’t test chain verification.
- **What’s missing**
  - A failing-chain test that blocks export deterministically (this is a production trust blocker).

### Fragility 7 — **Frontend mixes “real” with sample/demo behavior**
- **Where**
  - Frontend analysis found pages that default to sample data and/or missing routes referenced by navigation.
- **What’s missing**
  - A coherent, production-only UI path for the core workflow (TB upload → review → export) without demo fallbacks.

====================================================
3. ASPIRATIONAL / DECORATIVE FEATURES
====================================================

### Decorative 1 — **Large surface area of “agentic_*” services that do not affect correctness**
- **Where**
  - `src/services/agentic_*` (dozens of modules per repo scan)
- **Why it’s decorative**
  - Most generate narratives/suggestions/assessments and do not change deterministic statement totals.
  - They add integration risk (LLM failures, prompt drift, costs) without strengthening invariant correctness.

### Decorative 2 — **“Plan-Execute-Verify (agentic)” reasoning chain**
- **Where**
  - `src/routes/trial-balance/ingest.ts` calls `runPlanExecuteVerifyAgentic(...)`
- **Why it’s decorative**
  - The statements are already built deterministically; the reasoning chain is basically a report artifact.
  - Unless you enforce that its outputs gate actions, it’s theater (and can be wrong without consequence).

### Decorative 3 — **Huge API namespace mounted in `src/server.ts` with unclear depth**
- **Where**
  - `src/server.ts` mounts ~40 routers: valuation, leases, DCF, comps, LBO, FX, etc.
- **Why it’s likely scope creep**
  - The repo contains “everything finance” endpoints, but only TB→statements has a clearly proven deterministic correctness kernel + tests.
  - This is classic “demo breadth” rather than production depth.

### Decorative 4 — **Frontend navigation routes that don’t exist**
- **Where**
  - Frontend shell references routes like `/dashboard`, `/close`, `/approvals`, `/valuation`, etc. that the scan indicates are missing.
- **Why it matters**
  - It’s evidence of presentation-first development; likely incomplete wiring.

====================================================
4. TRUE PRODUCT CORE (strip everything else)
====================================================

Minimum set to deliver **“Trial balance → validated financial statements with deterministic correctness and human review”**:

- **API entry + routing**
  - `src/server.ts`
  - `src/routes/trial-balance/index.ts`
  - `src/routes/trial-balance/ingest.ts`
- **Parsing + deterministic statement engine**
  - `src/services/fileIngestion.ts` (or `.js` compiled equivalent)
  - `src/services/trialBalanceParser.ts`
  - `src/services/financialStatements.ts` (**kill switch + statement build**)
  - `src/services/accountClassifier.ts` (**deterministic classification**)
  - `src/utils/decimal.ts`
  - `src/types/financial.ts`
  - `src/services/integrity_gate_service.ts` (plug detection + hard gate)
  - `shared/config/financial_rules.json` (tolerance/materiality knobs referenced by gates)
- **Human review (minimal)**
  - `src/services/hitl_orchestrator.ts` (for “submit to staging” behavior referenced by ingest)
  - `src/routes/hitl.js/ts` (router serving HITL staging endpoints; mounted in `src/server.ts`)

====================================================
5. WHAT IS MISSING FOR PRODUCTION TRUST
====================================================

### Blocker A — **End-to-end tests for the actual production route**
- Missing: a deterministic integration test for `POST /api/trial-balance/ingest` that uploads a file and asserts:
  - correct parsing
  - correct classification behavior (at least for a known COA subset)
  - kill-switch behavior on imbalance
  - stable totals across runs

### Blocker B — **Audit ledger integrity enforcement is not proven**
- Missing: tests proving `verifyChain()` failure blocks export and/or blocks serving an “audit binder.”
- Without this, your “audit trail” can be tampered with undetected.

### Blocker C — **AuthZ coverage + tenant isolation tests**
- Missing: route-by-route authorization tests (who can ingest/export/review).
- Missing: tenant isolation tests (no cross-tenant leakage).
- The presence of bypass toggles and “optionalAuth” paths means misconfig can become a breach.

### Blocker D — **No strict policy on when LLM output is allowed to affect accounting outputs**
- Missing: explicit invariant that LLM-produced classification/adjustments must be confirmed by a human (or reconciled deterministically) before becoming the numbers-of-record.
- Right now, math can pass while classification correctness fails.

### Blocker E — **Silent failure patterns in core ingest path**
- Missing: a required “control status” returned to client (audit logging ok? exceptions persisted? professional review ran?) that gates export.
- Current code deliberately suppresses failures in control subsystems.

====================================================
6. CODEBASE FOCUS SCORE
====================================================

- **Focus: 3/10**
  - The repo mounts an enormous product surface (close, approvals, valuation, M&A, leases, FX, etc.) but only a small fraction looks like hardened, tested core.
- **Correctness: 6/10**
  - The math kill switch is real and deterministic, and there are some strong integrity/export tests.
  - But correctness is mostly “equations balance,” not “classification and policy are correct,” and audit-chain verification isn’t proven.
- **Complexity: 8/10**
  - Too many routers/services, mixed TS + Python + MCP + frontend demos; lots of failure modes and config permutations.
- **Scope creep: 9/10**
  - Many decorative agentic/narrative modules and broad finance features dilute engineering attention from the TB→FS kernel.

====================================================
7. FINAL VERDICT (no hedging)
====================================================

⚠️ Technically sound but unfocused

You have a real deterministic TB→BS/P&L kernel with explicit invariant enforcement (that’s the good news). But the repo is bloated with wide, lightly proven feature claims and a frontend that mixes demo/sample behavior with real calls. Critical production trust controls (authZ coverage, tenant isolation, audit-chain verification tests, no-silent-failure control reporting) are not convincingly enforced. LLM features are allowed near the core path without strong guardrails beyond “it still balances.” This is not a prototype, but it is not production-trustworthy as a financial system yet.

