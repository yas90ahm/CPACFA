# Precheck board-ready — "balanced TB => status ready" investigation

## 1. HTTP status and full JSON response body

**HTTP status:** `200`

**Full response body (JSON):**
```json
{
  "status": "not_ready",
  "blockers": [
    {
      "code": "BALANCE_SHEET_EQUATION_FAILED",
      "message": "Blocked until resolved: Assets do not equal Liabilities + Equity within tolerance.",
      "details": {
        "totalAssets": 1000,
        "totalLiabilities": 0,
        "totalEquity": 0,
        "tolerance": 0.01
      }
    }
  ],
  "warnings": [],
  "proofSummary": {
    "trialBalanceBalanced": true,
    "balanceSheetEquationBalanced": false,
    "plugDetected": false,
    "roundingToleranceUsed": 0.01,
    "computedTotalsSummary": {
      "totalDebits": 1000,
      "totalCredits": 1000,
      "totalAssets": 1000,
      "totalLiabilities": 0,
      "totalEquity": 0
    }
  }
}
```

---

## 2. Exact payload used in the test

```json
{
  "periodLabel": "2025-01",
  "trialBalance": [
    { "accountName": "Cash", "debit": 1000, "credit": 0 },
    { "accountName": "Revenue", "debit": 0, "credit": 1000 }
  ]
}
```

Request: `POST /api/precheck/board-ready` with `Content-Type: application/json` and `Authorization: Bearer <token>`.

---

## 3. Precheck handler logic (file path + relevant function)

- **Route handler:** `src/routes/precheck.ts`  
  - **Function:** `router.post('/board-ready', ...)` (lines 25–57).  
  - Validates `periodLabel` (required non-empty string), `trialBalance` (must be array), optional `journalEntries` (if present, must be array). Then calls `runPrecheckBoardReady({ periodLabel, trialBalance, journalEntries })` and returns its result as JSON.

- **Service (where status/blockers are set):** `src/services/precheck_board_ready_service.ts`  
  - **Function:** `runPrecheckBoardReady(input: PrecheckBoardReadyInput): PrecheckBoardReadyVerdict` (lines 85–210).  
  - Flow:
    1. Map `input.trialBalance` to raw rows, parse with `parseTrialBalance`, optionally add hypothetical `journalEntries` to entries and totals.
    2. Build balance sheet: `buildFinancialStatements(trialBalanceResult)` (line 147). On throw, sets `balanceSheet = {0,0,0}`; otherwise uses `built.balanceSheet.totalAssets/totalLiabilities/totalEquity`.
    3. Run `finalIntegrityCheck({ trialBalance: { totalDebits, totalCredits }, balanceSheet, entriesForPlugDetection, tolerance })` (lines 156–162).
    4. Set `trialBalanceBalanced = finalCheck.checks?.trialBalanceBalances`, `balanceSheetEquationBalanced = finalCheck.checks?.balanceSheetBalances`, `plugDetected = finalCheck.plugSuspicious`.
    5. Push blockers for: `!trialBalanceBalanced` → `TRIAL_BALANCE_IMBALANCED`; `!balanceSheetEquationBalanced` → `BALANCE_SHEET_EQUATION_FAILED`; `plugDetected` → `PLUG_ACCOUNTS_DETECTED`.
    6. `status = blockers.length === 0 ? 'ready' : 'not_ready'` (line 190).

`finalIntegrityCheck` lives in `src/services/integrity_check.ts` and delegates to `runIntegrityGate` in `src/services/integrity_gate_service.js`; the gate compares `balanceSheet.totalAssets` to `totalLiabilities + totalEquity` within tolerance and sets `checks.balanceSheetBalances` accordingly.

---

## 4. Which condition caused status = "not_ready"

The only blocker returned is **`BALANCE_SHEET_EQUATION_FAILED`**.

- **Condition:** `!balanceSheetEquationBalanced` is true.  
- **Source:** `balanceSheetEquationBalanced = finalCheck.checks?.balanceSheetBalances ?? false` (precheck_board_ready_service.ts line 164). The integrity gate sets `balanceSheetBalances` to false when **Assets ≠ Liabilities + Equity** within tolerance.  
- **Computed totals:** totalDebits = 1000, totalCredits = 1000 (trial balance balances). totalAssets = 1000, totalLiabilities = 0, totalEquity = 0. So **1000 ≠ 0 + 0** → equation fails.  
- **Reason:** The trial balance has only **Cash** (asset) and **Revenue** (income). Classification puts Cash in Assets (1000) and Revenue in P&amp;L; Equity is 0 (revenue is not closed to equity in this pre-close TB). So the balance sheet equation (Assets = L + E) is correctly reported as failed.

**Conclusion:** `status = "not_ready"` is caused by the **balance sheet equation check** (Assets = Liabilities + Equity), which fails because the payload has no equity (or liability) line; Revenue does not appear in equity until closing.

---

## 5. A vs B

**A) The test payload violates V2 invariants (e.g., missing equity line, provenance, equation issue).**

The precheck (and the rest of the stack) enforces the **balance sheet equation** as a V2 invariant: Assets must equal Liabilities + Equity within tolerance. The test payload is:

- Trial balance: debits = credits = 1000 ✓  
- Balance sheet: Assets = 1000, Liabilities = 0, Equity = 0 → **Assets ≠ L + E** ✗  

So the payload violates the **balance sheet equation** (missing equity line; Revenue is income, not equity). This is the same situation as the previous full_close_flow ingest test: a two-line TB (Cash + Revenue) is arithmetically balanced but does not satisfy A = L + E.

**B) The precheck logic is too strict for intended scope.**

No. The precheck is a structural “board-ready” check that explicitly validates (1) trial balance balanced, (2) balance sheet equation, (3) no material plug accounts. The comment in the service states it “Reuses integrity_gate_service.runIntegrityGate and integrity_check.finalIntegrityCheck.” Requiring the balance sheet equation is intentional and aligned with ingest and export behavior.

---

## Summary

| Item | Value |
|------|--------|
| HTTP status | 200 |
| Response status | not_ready |
| Blocker | BALANCE_SHEET_EQUATION_FAILED (Assets 1000 ≠ L+E 0) |
| Payload | periodLabel + trialBalance: [Cash 1000/0, Revenue 0/1000] |
| Handler | src/routes/precheck.ts (POST /board-ready) → src/services/precheck_board_ready_service.ts `runPrecheckBoardReady` |
| Condition for not_ready | `!balanceSheetEquationBalanced` (integrity gate: Assets ≠ L+E) |
| Verdict | **A)** Test payload violates V2 invariant (balance sheet equation; missing equity). Precheck logic is correct and not overly strict. |

**Update:** The test payload was updated to represent a post-close board-ready TB (Cash debit 1000, Retained Earnings credit 1000) so that Assets = Liabilities + Equity and the "balanced TB => ready" and "optional journalEntries" tests pass without changing precheck logic or invariants.

**Minimal fix (for later):** Update the “balanced TB => status ready” test payload to a trial balance that satisfies the balance sheet equation (e.g. Cash + Equity, or Cash + Liability + Equity), so that the precheck correctly returns `status: 'ready'` with no blockers. Do not relax the precheck’s balance sheet equation requirement.
