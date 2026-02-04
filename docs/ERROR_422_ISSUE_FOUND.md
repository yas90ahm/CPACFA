# Error 422 Issue Found

This document records the investigation that confirmed **POST /api/trial-balance/ingest** is the only route being called when the Diagnostic HUD runs, that it returns **422** for imbalanced trial balance files, and that **POST /api/supervisor/chat** is never reached because the frontend returns early on 422. It identifies the exact kill switch path and the logic that stops data from reaching the AI.

---

## Summary

- **Observed behavior:** Terminal logs show only `POST /api/trial-balance/ingest` is hit; it returns 422. `POST /api/supervisor/chat` is never called.
- **Root cause:** The ingest route runs a full statement build and, when the trial balance does not balance (or Assets ≠ L+E), the service throws `MathematicalIntegrityError`. The route catches it and returns **422**. The HUD treats 422 as a terminal outcome and **returns without calling the Supervisor**, so the AI never gets a chance to suggest fixes.
- **No silent middleware:** There is no global middleware or Zod schema that validates trial balance integrity before the route. The integrity check happens **inside the route** when it calls `buildValidatedStatements()` / `generateStatements()` in `src/services/financialStatements.ts`.

---

## 1. Kill Switch — Where 422 Is Returned

**File:** `src/routes/trial-balance/ingest.ts`  
**Lines:** 510–517 (in the route’s `catch` block)

```ts
if (err instanceof MathematicalIntegrityError) {
  return res.status(422).json({
    error: 'MathematicalIntegrityError',
    message: err.message,
    check: err.check,
    imbalanceAmount: err.imbalanceAmount,
    details: err.details,
  });
}
```

This is the **exact snippet** that sends 422 to the client when the ingest flow hits a math integrity failure.

---

## 2. Where the Error Is Thrown (Data Stopped Before Reaching the AI)

**File:** `src/services/financialStatements.ts`  
**Function:** `buildValidatedStatements()` (and related validation)

**Check A — Trial balance does not balance (Sum(Debits) ≠ Sum(Credits)):**  
**Lines:** 241–243

```ts
if (absGt(totalDebits, totalCredits, tol)) {
  const imbalanceAmount = round2(Math.abs(totalDebits - totalCredits));
  throw new MathematicalIntegrityError('A', imbalanceAmount, { totalDebits, totalCredits });
}
```

**Check B — Balance sheet equation violated (Assets ≠ L+E):**  
**Lines:** 248–254

```ts
if (absGt(result.balanceSheet.totalAssets, rhs, tol)) {
  const imbalanceAmount = round2(Math.abs(result.balanceSheet.totalAssets - rhs));
  throw new MathematicalIntegrityError('B', imbalanceAmount, {
    totalAssets: result.balanceSheet.totalAssets,
    totalLiabilities: result.balanceSheet.totalLiabilities,
    totalEquity: result.balanceSheet.totalEquity,
  });
}
```

**Where the ingest route invokes this:**  
**File:** `src/routes/trial-balance/ingest.ts`  
**Lines:** 284–293 (and 300–302 for prior period) — the handler calls `buildValidatedStatements(trialBalanceForBuild, ...)` or `generateStatements(...)`, which triggers the checks above.

**Path of the kill switch:**  
Ingest handler → `buildValidatedStatements()` (or `generateStatements()` → same checks) in **`src/services/financialStatements.ts`** → `throw new MathematicalIntegrityError(...)` at lines 243 or 250 → caught in **`src/routes/trial-balance/ingest.ts`** at 510 → **422** returned. The integrity check that stops the data from reaching the AI is these two `throw` blocks in `financialStatements.ts`, plus the ingest route’s catch that converts them to 422.

---

## 3. HUD Logic — Why Supervisor Is Never Called on 422

**File:** `frontend/app/diagnostics/page.tsx`  
**Function:** `triggerIngestThenSupervisor`

**Logic that handles the transition from Ingest to Chat:**

1. Ingest request is sent to `POST /api/trial-balance/ingest`.
2. If the response status is **422**, the frontend sets `integrity` to `self_healing` and **returns immediately**. It does **not** build `raw_rows` from the response and does **not** call `POST /api/supervisor/chat`.

**Snippet (lines 69–78):**

```ts
if (ingestRes.status === 422) {
  setUploadStatus('ok');
  setUploadError(null);
  setIntegrity({
    status: 'self_healing',
    imbalanceAmount: ingestJson.imbalanceAmount,
    message: ingestJson.message ?? 'Trial balance does not balance',
    sessionId: null,
  });
  return;
}
```

3. Any other non-OK response (`if (!ingestRes.ok)`) also returns without calling the Supervisor (lines 81–86).
4. Only when ingest returns **2xx** does the HUD build `raw_rows` from `ingestJson.trialBalance` and call **`POST /api/supervisor/chat`**.

So the HUD **explicitly prevents** calling the Supervisor when ingest returns 422. The “error 422 issue” from the user’s perspective is: **ingest returns 422 → HUD returns → Supervisor never runs → AI never gets a chance to suggest fixes.**

---

## 4. No “Silent” Middleware or Guard

- **Global middleware:** No middleware in `src/middleware` validates trial balance balance (debits vs credits) or balance sheet equation.
- **Ingest route stack:** `upload.single('file')`, `injectTenantFromBody`, `requireValidTenantId`, `validateBody(ingestBodySchema)`. None of these check trial balance integrity.
- **`ingestBodySchema`** (`src/schemas/request/trialBalance.ts`): Validates only body fields (e.g. `tenantId`, `sessionId`, `standard`, `fullSet`). It does **not** validate that debits = credits or Assets = L+E.

The **integrity check** is performed **only inside the ingest route** when it calls `buildValidatedStatements()` / `generateStatements()` in **`src/services/financialStatements.ts`**. There is no earlier “guard” that rejects imbalanced files before the route logic.

---

## 5. What Needs to Change (Direction Only)

To allow the AI to suggest fixes before the integrity check kills the flow:

- **Option A — Ingest:** Do not run the full statement build (and thus do not run the kill switch) on initial upload; return parsed/raw trial balance to the client and let the Supervisor run with that data. Run the integrity check only after the AI has had a chance to propose adjustments (e.g. after `proposeTrialBalanceAdjustment` and re-build).
- **Option B — HUD:** On 422 from ingest, do not return immediately; still call the Supervisor with whatever data is available (e.g. raw rows from the file or from a non-fatal parse), so the AI can suggest fixes and the user can re-submit or approve adjustments.

Implementation details are left to a follow-up change; this document only records the **error 422 issue found** and the exact code paths involved.
