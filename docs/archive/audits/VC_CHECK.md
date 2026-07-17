# VC Check — Technical Diligence Report

**Label:** VC Check  
**Subject:** CPACFA — Early-stage accounting + AI system  
**Scope:** Codebase and architecture as it exists today. No credit for intent or future work.

---

## 1. SYSTEM COMPREHENSION (FAIL IF WRONG)

**What the system actually does today**

- **Core:** Ingest trial balance (CSV/XLSX or JSON entries) → parse (and optionally re-parse via LLM for messy ledgers) → classify accounts (deterministic keyword rules or optional LLM) → build Balance Sheet and P&L by standard (ASPE, IFRS, FRS102, US GAAP) → optionally Cash Flow, Equity Changes, Notes → return statements plus a “reasoning chain” (plan–execute–verify) and codification refs.
- **Close:** Checklist, close adjustments (create/approve/reject/post), push posted adjustments to GL (with balance check), period lock, HITL staging for agent-proposed JEs.
- **Agent path:** User asks for statements → `buildFinancialStatements` tool (sessionId + tenantId only) → load session snapshot from DB → merge approved HITL adjustments → parse TB → build statements → **hard gate** (TB totals + A=L+E) → return or error. No raw entries/numbers from the LLM; data is DB-backed.
- **Valuation/audit:** DCF, comps, LBO, audit binder, professional review, sampling, etc., exist as routes and services; many depend on LLM for narratives/suggestions.

**Single core workflow that works end-to-end**

**Trial balance → financial statements (direct API):** Upload TB file or POST entries → `parseTrialBalance` (or agentic ledger parse if messy) → `generateStatements` / `buildFinancialStatements` → BS + P&L (+ optional cash flow, etc.) → response includes `balanceSheet`, `profitAndLoss`, `reasoningChain` (with verification passed/failed). No hard block when the TB or BS is unbalanced; the response can still return statements and `reasoningChain.verification.passed: false`.

**Implemented vs aspirational**

- **Implemented:** TB ingest (file + JSON), parse (deterministic + optional agentic ledger parse), account classification (deterministic + optional agentic), statement build (BS, P&L, optional cash flow/equity/notes), Plan–Execute–Verify (programmatic V1–V4), close adjustments and push-to-GL (with debit=credit check), HITL staging, agent tool `buildFinancialStatements` with DB-only input and a **hard** integrity gate (D=C and A=L+E) before return, `result_generator` throwing when TB does not balance on its raw_rows path.
- **Aspirational / broken:** “Integrity gate” for **TB revenue vs contract revenue** is **not** correctly wired: `types/integrity.ts` defines `IntegrityGateInput` with `trialBalanceEntries` and `contracts` and `IntegrityGateViolation`, but `integrity_gate_service.runIntegrityGate()` only implements **D=C and A=L+E** and expects `trialBalance` (totals or entries with debit/credit) and `balanceSheet`. `statementGenerator.ts` and `audit_professional_review.ts` call that same `runIntegrityGate` with `trialBalanceEntries` and `contracts`. So they pass the **wrong shape**; at runtime this would either throw (e.g. when contracts exist in `generateStatements`) or never run the intended TB-vs-contract check. The TB-vs-contract “integrity gate” is defined in types and referenced in docs but not correctly implemented in the statement/audit path.

**Verdict:** The system is comprehensible. The core workflow is “TB in → statements out”; the agent path adds DB-backed statements plus a real hard gate. The TB-vs-contract integrity concept is incoherent in implementation (wrong function, wrong args).

---

## 2. HALLUCINATION & DATA INTEGRITY RISK

**Where the LLM influences financial outputs**

| Touchpoint | Can the LLM inject fabricated numbers? | What prevents that? | What happens on failure? |
|------------|----------------------------------------|--------------------|---------------------------|
| **Agent `buildFinancialStatements`** | No. Tool accepts only sessionId/tenantId; TB is loaded from DB. | Input validation rejects entries/prior_entries; snapshot from DB; after build, `runIntegrityGate` (D=C, A=L+E) and `runPlanExecuteVerify`; gate failure → error, no response. | Tool returns error; user does not get statements. |
| **Agentic ledger → TB** (`agentic_ledger_to_tb.ts`) | Yes. LLM parses messy lines into `accountName`, `debit`, `credit`. | Downstream `parseTrialBalance` checks D=C (tolerance 0.01); if unbalanced, `balances: false` and `errors` set. **Routes do not block** on `!trialBalance.balances` before building statements. | Unbalanced TB can still be passed into statement build; response can include BS with `balanceSheet.balances: false` and `reasoningChain.verification.passed: false`. |
| **Agentic JE suggestions** (`agentic_je_suggestions.ts`) | Yes. LLM returns debits/credits; no check that sum(debits)=sum(credits). | Suggestions go to HITL; on approval, merged in agent tool path then `parseTrialBalance`; if merged TB unbalanced, tool returns error. Push to GL (`pushAdjustmentToGL`) checks \|debit−credit\| ≤ 0.01. | Unbalanced JEs can be suggested and approved; caught at statement build or at push-to-GL. |
| **Agentic account classification** (optional) | Indirect. LLM assigns accountType; wrong type moves amounts between BS/P&L lines. | Deterministic path is default; A=L+E still holds if TB balances. | Misclassification can produce wrong line items (e.g. expense in equity) without breaking A=L+E. |
| **Direct API (ingest / POST statements)** | User/upload supplies numbers; no LLM for the numbers. Optional agentic ledger parse can inject numbers. | `parseTrialBalance` sets `balances` and `errors`. **No hard gate**: routes do not throw or 400 when `!trialBalance.balances`; `buildBalanceSheet` returns `balances: true/false` but still returns the BS. | Unbalanced TB can be accepted; statements are built and returned with `balanceSheet.balances: false` and verification failed in reasoning chain. |

**Paths where AI output could bypass deterministic validation**

- **Direct API (trial balance ingest, POST /statements):** After `parseTrialBalance` (and optional agentic ledger parse), the code calls `generateStatements` or `buildFinancialStatements` **without** checking `trialBalance.balances`. So unbalanced TB is allowed through. `generateStatements` does **not** call the D=C / A=L+E `runIntegrityGate` from `integrity_gate_service` (it only calls the same function with the wrong TB-vs-contract shape, which is broken). So the direct API never runs the hard gate that blocks an unbalanced BS.
- **Statement generator:** Builds BS from classified entries; `buildBalanceSheet` computes `balances` (A=L+E within materiality) but does not throw; it always returns the BS. So unbalanced BS can be returned.

**Can this system ever produce an unbalanced balance sheet without throwing an error?**

**Yes.**  
Via direct API (trial balance ingest or POST statements): if the client sends unbalanced entries (or agentic ledger parse produces them), the server still builds and returns statements. The response will include `balanceSheet` (possibly with `balanceSheet.balances: false`) and `reasoningChain.verification.passed: false`, but no error is thrown and no 4xx is returned for “TB/BS unbalanced.” Only the **agent tool** path (and `result_generator` raw_rows path) enforces a hard gate and refuses to return statements when the ledger is unbalanced.

---

## 3. ACCOUNTING CORRECTNESS & EDGE CASES

**Double-entry enforced everywhere?**

- **Enforced:** In `parseTrialBalance` (tolerance 0.01); in `pushAdjustmentToGL` and `accounting_integration_service.pushJournalEntry` (|debit−credit| ≤ 0.01); in the agent tool before returning statements (via `parseTrialBalance` then gate).
- **Not enforced on input:** Direct API does not reject unbalanced TB before building statements. `mergeAdjustmentsIntoEntries` does **not** check that each adjustment balances; it only merges. So multiple approved adjustments could be individually unbalanced; they are caught only when the merged TB is parsed or at push-to-GL.

**A = L + E enforced everywhere?**

- **Checked:** In `buildBalanceSheet` (materiality 0.01) and stored as `balanceSheet.balances`; in `runPlanExecuteVerify` (V2); in `integrity_gate_service.runIntegrityGate` (used only on the agent tool path). So A=L+E is **enforced as a hard block** only on the agent path; on direct API it is only reported.
- **Not enforced as block on direct API:** Routes do not throw or 400 when `!balanceSheet.balances`; they still return the BS.

**Adjustments and journal entries validated?**

- **Validated:** When pushing to GL (debit=credit within 0.01). When building statements in the agent tool, merged TB is parsed and gate run.
- **Not validated at creation:** Close adjustments and HITL-approved JEs are not required to balance at insert/approval time; validation happens at merge+parse or at push.

**Edge cases that would silently break correctness**

- **Rounding:** Multiple places use 0.01 (or 0.02 in historical snapshot). Salami-slicing across many lines could keep within tolerance while still wrong.
- **Classification ambiguity:** Deterministic classifier is keyword-based; odd account names can misclassify (e.g. “Deferred revenue” as revenue vs liability). Agentic classification can do the same. A=L+E can still hold while line items (and disclosures) are wrong.
- **Timing:** Adjusted TB merges **all** posted close adjustments for the period; no per-adjustment date or ordering guarantee in the merge. Period lock is checked in some flows but not uniformly before every statement build.
- **Integrity gate mismatch:** When `generateStatements` is called with contracts, it calls `runIntegrityGate({ trialBalanceEntries, contracts, tolerance })`. The service expects `trialBalance` and `balanceSheet`. So `input.trialBalance`/`input.balanceSheet` are undefined → likely runtime error in `getTrialBalanceTotals` or wrong behavior. So the “TB vs contract” check does not run as intended and can crash when contracts exist.
- **Adversarial/messy input:** Negative debits/credits (except parentheses) are rejected by parser. But malformed rows (e.g. missing accountName) are skipped; totals can still balance. Agentic ledger parse can invent numbers; only downstream D=C check would flag imbalance, and only in reasoning chain / balances flag on direct API, not as a hard error.

---

## 4. TRUST & LIABILITY ASSESSMENT

**If this system is wrong, who would realistically catch it? At what stage?**

- **Agent path:** If TB or BS is unbalanced, the tool returns an error and does not return statements. The user sees an error message. So the **agent path** is “user gets an error” when the gate fails.
- **Direct API:** Unbalanced TB/BS is still returned with statements plus `reasoningChain.verification.passed: false` and `balanceSheet.balances: false`. Detection depends on the **client or user** reading those fields. There is no server-side block or mandatory warning in the response contract.
- **Push to GL:** Unbalanced adjustment is rejected with an error; posting is blocked.
- **JE suggestions:** Unbalanced JEs can be suggested and approved; they are caught when building statements (agent path) or when pushing to GL.

**Would the user know it was wrong?**

- **Agent path:** Yes for imbalance — they get an error and no statements.
- **Direct API:** Only if they check `reasoningChain.verification.passed` and `balanceSheet.balances`. Nothing forces attention to these; a UI could show statements and hide or de-emphasize verification. So **operationally**, the user might not know.
- **Misclassification (wrong line, correct A=L+E):** No automatic signal; would require human review of statement lines vs TB.

**Is the human-in-the-loop model sufficient for professional use?**

- HITL exists for agent-proposed JEs (approve/reject before merge). So numbers that reach the adjusted TB from the agent are at least “approved” by a human. That is sufficient only if: (1) the human actually checks balance and correctness, and (2) all statement-building paths that serve production use the same gate as the agent (today they do not). As long as direct API can return unbalanced statements without failing, HITL alone is **not** sufficient for “professional use” for those paths, because the system can present invalid statements as if they were valid.

---

## 5. DIFFERENTIATION TEST

**Could a competent team reproduce this in 90 days using: an LLM, a database, and basic accounting rules?**

**Mostly yes.**

- **Reproducible:** TB ingest and parse; keyword-based account classification; BS/P&L build from classified TB; D=C and A=L+E checks; Plan–Execute–Verify; close checklist and adjustments; push to GL with balance check; agent that only calls a “build statements” tool with sessionId/tenantId and enforces a hard gate; HITL for suggested JEs; LLM for narratives, JE-from-text, and messy-ledger parsing.
- **Differentiation:** The breadth of modules (close, audit, valuation, controls, multi-tenant, BYOD, conflict CPA/CFA) and the **intent** to keep statement numbers deterministic and gate the agent path. But the **implementation** has gaps: direct API does not enforce the same gate, and the TB-vs-contract “integrity gate” is not correctly implemented. So the **idea** (deterministic books + gated agent) is differentiated; the **current codebase** does not fully deliver that everywhere and is reproducible in spirit by a focused team with an LLM, DB, and accounting rules.

**Answer: Yes** — a competent team could reproduce the **working, safe subset** (TB → statements with hard gate on one path, close adjustments, push to GL, HITL) and avoid the current inconsistencies. The main differentiator would be product and domain depth, not unique technical moat.

---

## 6. FAILURE MODE ANALYSIS (MOST IMPORTANT)

**Top 5 ways this system fails in production**

1. **Unbalanced balance sheet returned without error (direct API)**  
   - **How:** Client sends unbalanced TB (or agentic ledger parse produces it); routes do not check `trialBalance.balances` before building; no D=C/A=L+E gate on this path; response includes `balanceSheet` and 200.  
   - **Loud vs silent:** **Silent** from the server’s perspective (200, body includes `balances: false` and verification failed). **Dangerous** if downstream systems or users treat the BS as valid.

2. **TB-vs-contract “integrity gate” wrong or crashing**  
   - **How:** `statementGenerator` and `audit_professional_review` call `runIntegrityGate` with `trialBalanceEntries` and `contracts`; the service expects `trialBalance` and `balanceSheet`. When contracts exist, this can throw (e.g. in `getTrialBalanceTotals(undefined)`).  
   - **Loud vs silent:** **Loud** (5xx or 4xx) when it throws; **silent** in the sense that the intended TB-vs-contract check never runs.

3. **LLM-suggested JEs approved without checking balance**  
   - **How:** `suggestJEsFromTextAgentic` returns JEs with no sum(debits)=sum(credits) check. User approves in HITL; merge can produce unbalanced TB.  
   - **Loud vs silent:** **Loud** when they hit the agent statement build (error) or push-to-GL (rejected). **Silent** only if there is another path that merges and uses adjusted TB without ever building statements or pushing (e.g. reporting from adjusted TB without re-running the gate).

4. **Misclassification (deterministic or agentic)**  
   - **How:** Wrong accountType moves amounts to wrong BS/P&L lines; A=L+E can still hold.  
   - **Loud vs silent:** **Silent** — no automatic error; wrong line items and potentially wrong disclosures.

5. **Agentic ledger parse injects wrong numbers**  
   - **How:** Messy ledger parsed by LLM to debit/credit; errors flow into TB and then statements.  
   - **Loud vs silent:** If totals still balance, **silent** (wrong line items). If unbalanced, **silent** on direct API (statements still returned with verification failed); **loud** on agent path (tool errors).

**Silent failures that are disqualifying**

- **Returning an unbalanced balance sheet with 200 and no server-side block** (direct API) is a **silent, dangerous** failure for any “professional accounting” use. The system **can** do this today.

---

## 7. VERDICT (NO HEDGING)

**⚠️ Technically sound but too risky for production**

The architecture is coherent: TB → classify → build statements, with deterministic math and an agent path that uses DB-only input and a real hard gate. So it is **not** “incoherent.” But **direct API paths can return an unbalanced balance sheet without throwing or returning 4xx**, and the TB-vs-contract integrity gate is both unimplemented (wrong args) and not the same as the D=C/A=L+E gate. So for production use in professional accounting, **trust is not there yet**: one path is safe (agent + gate), others are not. That is **too risky** to treat as “investable as a production accounting system” without fixing the gate and applying a single standard (no unbalanced BS ever returned) across all entry points.

---

## 8. ONE-PERSON FOUNDER REALITY CHECK

**What must be deleted or frozen immediately?**

- **Do not use** the “integrity gate” that takes `trialBalanceEntries` and `contracts` in production until it is implemented correctly (either a dedicated TB-vs-contract function that throws `IntegrityGateViolation`, or removal of that call from `statementGenerator` and audit route so they don’t call the D=C/A=L+E gate with the wrong shape). Today that call is wrong and can throw when contracts exist.
- **Freeze or restrict** direct API statement build (trial balance ingest, POST statements) to internal/demo use until they **either** (a) check `trialBalance.balances` and `balanceSheet.balances` and return 4xx when false, **or** (b) run the same `runIntegrityGate` (D=C and A=L+E) and refuse to return statements when the gate fails. Right now these paths can return an unbalanced BS with 200.

**What one workflow should be perfected?**

- **“TB in → statements out” with a single contract: no unbalanced BS ever returned.**  
  One code path (e.g. a shared `buildAndValidateStatements`) that: loads or accepts TB → parse → build BS/P&L → run `runIntegrityGate` (D=C + A=L+E) → return statements **only** if the gate passes; otherwise return a clear error. Wire **all** entry points (ingest, POST statements, agent tool) through this path so that no caller can get a BS when the ledger is unbalanced.

**What would a VC require before a seed check?**

- **Single, enforced rule:** “This system never returns an unbalanced balance sheet.” Implemented in code (all statement-returning paths use the same gate and fail the request when the gate fails).
- **Fix or remove** the TB-vs-contract integrity gate (correct implementation or remove the broken calls and document that contract-revenue check is future work).
- **Explicit contract:** API responses that can include a balance sheet must document `balanceSheet.balances` and `reasoningChain.verification` and recommend that UIs block or warn when verification fails.
- **Minimal test suite:** At least: (1) unbalanced TB → 4xx or error, no BS in success body; (2) balanced TB → 200, `balanceSheet.balances: true` and verification passed; (3) agent tool with unbalanced snapshot → error, no statements.

---

*End of VC Check document.*
