# “Ingests trial balance” — Single-test failure report

## 1. Exact HTTP status and response body

- **Status code:** `400`
- **Response body (JSON):**
```json
{
  "error": "Ingestion error",
  "message": "Balance sheet equation violated: Total Assets != Total Liabilities + Total Equity. Imbalance: 1000. Data is illegal for a CPA."
}
```

---

## 2. Endpoint and handler

- **Route path:** `POST /api-dev/trial-balance/ingest` (test uses `/api-dev` because `NODE_ENV === 'test'`).
- **Handler file:** `src/routes/trial-balance/ingest.ts`
- **Handler:** Single route on the trial-balance router: `router.post('/ingest', upload.single('file'), injectTenantFromBody, requireValidTenantId, validateBody(ingestBodySchema), async (req, res) => { ... })` (line 90).
- **Mount:** `/api-dev` → `src/routes/dev_diagnostics.ts` (optionalAuth, attachTenantPool, requireTenantContext) → `trialBalanceRouter` from `src/routes/trial-balance/index.js` → `ingest.ts` router at `/ingest`.

---

## 3. Validation path that produced 400

This is **not** schema validation. The request passes:

- Multer (file present)
- `injectTenantFromBody` (tenantId from body)
- `requireValidTenantId` (tenantId non-empty)
- `validateBody(ingestBodySchema)` (body valid)

The failure is **business logic**:

1. Ingest parses the CSV and builds a trial balance (debits = credits = 1000).
2. It calls `buildValidatedStatements(trialBalanceForBuild, ...)` in `src/routes/trial-balance/ingest.ts` (around line 441).
3. **Throw location:** `src/services/financialStatements.ts` **line 271**:
   - After building the balance sheet, the code checks (B) Total Assets === Total Liabilities + Total Equity.
   - With the test data (Cash 1000, Revenue 1000), classification gives: Assets = 1000, Liabilities = 0, Equity = 0 (revenue is in P&L, not yet closed to equity).
   - So `Assets (1000) != L+E (0)` → `MathematicalIntegrityError('B', 1000, details)` is thrown at **line 271** in `src/services/financialStatements.ts`.

4. **Response path:** The error is caught by the outer `catch (err)` in **`src/routes/trial-balance/ingest.ts` at line 673**. The handler is written to return **422** for `MathematicalIntegrityError` (lines 684–727), but the response actually sent is **400**. So the code path that runs is the **generic** catch at **lines 729–730** in `src/routes/trial-balance/ingest.ts`:
   - `res.status(400).json({ error: 'Ingestion error', message });`
   - So the **return/throw that leads to the 400** is the `res.status(400).json(...)` at **file `src/routes/trial-balance/ingest.ts`, line 730**.

Reason the 422 branch is skipped: `err instanceof MathematicalIntegrityError` is false in this run (e.g. different module/class identity under Jest/ESM), so the specific `MathematicalIntegrityError` branch is never taken and the generic catch is used.

---

## 4. Test payload vs endpoint requirements

- **Test payload:**  
  - Fields: `tenantId`, `periodLabel`, `file` (CSV).  
  - CSV content:
    ```text
    Account Name,Debit,Credit
    Cash,1000,0
    Revenue,0,1000
    ```
- **Schema:** No required fields are missing; `ingestBodySchema` has `tenantId` and `periodLabel` optional, and the file is present.
- **Business rule:** The endpoint enforces (A) Sum(Debits) === Sum(Credits) and (B) Total Assets === Total Liabilities + Total Equity. The test TB satisfies (A) but fails (B) because Revenue is classified to P&L and Equity stays 0, so Assets (1000) ≠ L+E (0). So the payload is **valid for schema** but **invalid for the balance-sheet equation** (no equity/retained earnings to balance the sheet).

---

## 5. Conclusion

- **A) Test payload missing required fields?** No. Required fields for the route are present; the failure is not schema.
- **B) Endpoint incorrectly rejecting a previously valid payload (regression)?** Partly:
  - The **business rule** (reject when A ≠ L+E) is applied correctly; the payload really does violate the balance sheet equation.
  - There is a **separate bug**: the handler is designed to return **422** for `MathematicalIntegrityError` (see comment at top of `ingest.ts`: “MathematicalIntegrityError always returns 422”), but in this test run the error is not recognized as `MathematicalIntegrityError`, so the response is **400** instead of **422**.

So:

- **Root cause of “rejection”:** Business logic correctly rejects the TB because it violates the balance sheet equation (no equity, so A ≠ L+E).
- **Root cause of “400”:** The catch block that returns 422 for `MathematicalIntegrityError` is not used (likely `instanceof` failure), so the generic catch returns 400.

---

## 6. Summary table

| Item | Value |
|------|--------|
| **Status code** | 400 |
| **Response body** | `{ "error": "Ingestion error", "message": "Balance sheet equation violated: Total Assets != Total Liabilities + Total Equity. Imbalance: 1000. Data is illegal for a CPA." }` |
| **File + line of throw** | `src/services/financialStatements.ts` line 271 (`throw new MathematicalIntegrityError('B', imbalanceAmount, { ... })`) |
| **File + line of response** | `src/routes/trial-balance/ingest.ts` line 730 (`res.status(400).json({ error: 'Ingestion error', message });`) |

---

## 7. Minimal change options (do not apply yet)

- **Option 1 (test):** Update the test so the TB satisfies the balance sheet equation (e.g. add an equity/retained-earnings line so Total Equity = 1000), **and/or** allow **422** in the accepted statuses (e.g. `expect([200, 401, 503, 422]).toContain(res.status)` if the test is meant to cover “ingest either succeeds or returns a defined error”).
- **Option 2 (code):** In `src/routes/trial-balance/ingest.ts`, make the 422 branch robust when `instanceof` fails (e.g. treat as integrity error when `err?.name === 'MathematicalIntegrityError'` or when `err instanceof Error && err.message?.includes('Balance sheet equation violated')`), then return 422 with the same body shape as the existing 422 branch so the API contract is correct (422 for integrity failures).
- **Option 3 (both):** Do Option 2 so 422 is always returned for this error, and Option 1 so the test either uses a TB that satisfies A=L+E (expect 200) or explicitly accepts 422 for equation violations.

No changes have been applied; report only.
