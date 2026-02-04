# Architecture Consolidation: Python → TypeScript High-Integrity Engine

This document maps Python financial math logic to the TypeScript backend, identifies gaps, compares `MathematicalIntegrityError` handling, and lists Python files that can be removed once logic is ported.

**Note:** There is no `src/services/rule-based/` directory in the repo. The “rule-based” / deterministic logic lives in existing TypeScript services under `src/services/` (e.g. `financialStatements.ts`, `statementGenerator.ts`, `integrity_gate_service.ts`, `rules_registry.ts`, `cashFlow.ts`, `fixed_asset_service.ts`, `fx_currency_service.ts`, `deferred_tax_service.ts`). This document treats those as the target “High-Integrity Engine.”

---

## 1. Python Math Functions vs TypeScript (Exact Mapping)

### 1.1 Trial balance balancing and balance sheet totals

| Python (backend) | TypeScript (src/services) | Status |
|------------------|---------------------------|--------|
| `accounting_engine.build_validated_statements(gl, as_of, coa, ...)` → (TB, BS, IS) | `financialStatements.buildValidatedStatements(trialBalanceResult, options)` → BS + P&L + classified entries | **Equivalent.** TS does not take a GeneralLedger; it takes a TrialBalanceResult (entries + totals). TS does not return IncomeStatement as a separate object; P&L is `profitAndLoss`. |
| `accounting_engine.build_validated_statements` Check A (Sum Debits == Sum Credits) | `financialStatements.buildValidatedStatements` → `absGt(totalDebits, totalCredits, tol)` then `throw new MathematicalIntegrityError('A', ...)` | **Same.** |
| `accounting_engine.build_validated_statements` Check B (Assets == L + E) | `financialStatements.buildValidatedStatements` → same check then `throw new MathematicalIntegrityError('B', ...)` | **Same.** |
| `accounting_engine.get_rounding_tolerance()` from `shared/config/financial_rules.json` | `rules_registry.getRoundingTolerance()` from same config | **Same.** |
| `accounting_engine.validate_balance_sheet(bs, tolerance)` → raises `ValidationError` | `financialStatements.validateTrialBalanceAndBalanceSheet(tb, balanceSheet, tolerance)` → throws `MathematicalIntegrityError` | **Different:** Python uses `ValidationError` for BS-only check; TS uses same kill-switch error type. |

### 1.2 Balance sheet equation (validate only)

| Python | TypeScript | Status |
|--------|-----------|--------|
| `app.api_validate_balance_sheet` POST body `assets`, `liabilities`, `equity`; hardcoded `tolerance = Decimal("0.02")` | No dedicated “validate balance sheet only” route. TS uses `validateTrialBalanceAndBalanceSheet` (TB + BS) and `getRoundingTolerance()` from config. | **Gap:** Python uses **0.02** here instead of shared config; TS always uses config. If you port this route to TS, use `getRoundingTolerance()` (or materiality from config) for consistency. |

### 1.3 Depreciation schedules

| Python | TypeScript | Status |
|--------|-----------|--------|
| `accounting_engine.depreciation_schedule_sl`, `depreciation_schedule_ddb`, `build_depreciation_schedule` (SL, DDB; ASC 360-10-35) | `fixed_asset_service.runDepreciation` + `computePeriodDepreciation` (straight_line, declining_balance); DB-backed runs. No standalone “schedule for one asset” API matching Python. | **Different:** Python exposes **standalone** `/api/depreciation/schedule` (single asset, no DB). TS has **tenant/period** depreciation runs and per-asset logic inside the service. Port: add a **pure function** in TS (e.g. in `fixed_asset_service` or a new `depreciation_schedule.ts`) that, given method/cost/salvage/useful_life/placed_in_service, returns schedule lines (no DB), and optionally an HTTP handler that calls it. |

### 1.4 Statement of cash flows (indirect)

| Python | TypeScript | Status |
|--------|-----------|--------|
| `accounting_engine.statement_of_cash_flows_indirect(gl, period_start, period_end, coa, beginning_cash, ending_cash)` — GL-based; operating (net income + D&A + WC), investing (PPE), financing (debt/equity) | `cashFlow.buildCashFlowStatement(trialBalance, profitAndLoss, priorTrialBalance)` — TB/P&L-based; same sections, regex-based account detection | **Equivalent in purpose.** TS does not use a GeneralLedger; it uses TB + P&L (and prior TB for deltas). Structure and ASC 230 alignment are comparable. |

### 1.5 FX (ASC 830)

| Python | TypeScript | Status |
|--------|-----------|--------|
| `tax.fx_engine.remeasure_to_functional(position, functional_currency, current_rate, as_of_date)` → FXResult (functional_amount, unrealized_gain_loss, rate_used) | `fx_currency_service.remeasureToFunctionalCurrency(positions, functionalCurrency, closingRates, asOfDate)` → RemeasurementResult with lines and remeasurementGainLoss | **Equivalent.** Both: monetary at current rate, nonmonetary at historical. |
| `tax.fx_engine.translate_to_reporting(functional_amount, functional_currency, reporting_currency, translation_rate)` | `fx_currency_service.translateToReportingCurrency(positions, reportingCurrency, translationRates)` | **Equivalent** (translation to reporting, CTA). |
| `tax.fx_engine.compute_unrealized_fx_gain_loss(positions, functional_currency, current_rates, prior_functional_amounts, as_of_date)` | `fx_currency_service` remeasurement result includes gain/loss; no separate “unrealized GL only” function in TS. | **Partial:** TS can derive unrealized from remeasurement; Python has a dedicated function. Port: add `computeUnrealizedFxGainLoss(positions, functionalCurrency, currentRates, priorFunctionalAmounts?)` in TS if you need the same API. |
| `tax.fx_engine.batch_remeasure_to_functional` | Same as calling remeasure in a loop; TS has batch via `remeasureToFunctionalCurrency` (array of positions). | **Same.** |

### 1.6 Deferred tax (ASC 740)

| Python | TypeScript | Status |
|--------|-----------|--------|
| `tax.tax_provisioning.compute_deferred_taxes(temporary_differences, tax_rate, report_date, beginning_dta, beginning_dtl)` → DeferredTaxRollforward (ending_dta, ending_dtl, net_dta, details) | `deferred_tax_service.calculateDeferredTax(pool, tenantId, periodLabel, taxRate, options)` → DeferredTaxResult (DTA/DTL gross/net, netDeferredTaxAsset, temporaryDifferences); uses DB for items when pool/tenantId exist | **Equivalent in math.** Python is stateless (list of temp diffs); TS can use DB-backed items. Port: ensure a **stateless** TS function exists that takes `temporary_differences[]` + tax_rate + beginning DTA/DTL and returns the same rollforward shape for parity with `/api/tax/deferred`. |

### 1.7 Nexus checker

| Python | TypeScript | Status |
|--------|-----------|--------|
| `tax.nexus_checker.check_nexus(invoice_address)` → NexusCheckResult (jurisdiction_country, jurisdiction_state, is_new_jurisdiction, alert_message) | No equivalent in `src/services/`. | **Missing in TS.** Port: add e.g. `nexus_checker_service.ts` with same semantics (parse address, compare to known nexus list, return alert if new). |
| `tax.nexus_checker.add_known_nexus`, `get_known_nexus` | No equivalent. | **Missing in TS.** |

### 1.8 Parser (PDF/CSV/Excel → Trial Balance / Transaction list)

| Python | TypeScript | Status |
|--------|-----------|--------|
| `parser.engine.extract(file_path, content, filename, mime_type)` → ExtractionResult (trial_balance, transaction_list, raw_cleaned_rows, detected_format) | `fileIngestion.ingestTrialBalanceFile` + `trialBalanceParser.parseTrialBalance` for CSV/XLSX; no PDF extraction in TS. | **Different:** Python parser uses `column_cleaner.standardize_columns`, `infer_format`, and `ocr_engine` for PDF. TS has CSV/XLSX TB parsing only. Port: either add PDF + column standardization in TS or keep calling Python `/api/parser/extract` until TS has feature parity. |

### 1.9 Integrity gate (hard gate after agentic adjustment)

| Python | TypeScript | Status |
|--------|-----------|--------|
| `governance.integrity_gate.run_integrity_gate(total_debits, total_credits, total_assets, total_liabilities, total_equity, tolerance)` from `financial_rules.json` | `integrity_gate_service.runIntegrityGate(input)` same checks, tolerance from `getToleranceForGate()` (rules_registry). | **Same.** Both read shared config. |

---

## 2. MathematicalIntegrityError: Python vs TypeScript

### 2.1 Definition

| Aspect | Python (`backend/accounting_engine.py`) | TypeScript (`src/services/financialStatements.ts`) |
|--------|----------------------------------------|----------------------------------------------------|
| Class | `class MathematicalIntegrityError(Exception)` | `export class MathematicalIntegrityError extends Error` |
| Attributes | `check` ("A" \| "B"), `imbalance_amount`, `total_debits`, `total_credits`, `total_assets`, `total_liabilities`, `total_equity` (all optional except check and amount) | `check` ('A' \| 'B'), `imbalanceAmount`, `details?: { totalDebits?, totalCredits?, totalAssets?, totalLiabilities?, totalEquity? }` |
| Message | Same wording: Check A = "Trial balance does not balance..."; Check B = "Balance sheet equation violated..." | Same wording. |

### 2.2 Where it is thrown

| Python | TypeScript |
|--------|------------|
| `accounting_engine.build_validated_statements`: after building TB, if `abs(tb.total_debits - tb.total_credits) > tol` → raise MathematicalIntegrityError("A", ...). After building BS, if `abs(bs.total_assets - (bs.total_liabilities + bs.total_equity)) > tol` → raise MathematicalIntegrityError("B", ...). | `financialStatements.buildValidatedStatements`: same two checks, same order; `validateTrialBalanceAndBalanceSheet`: same checks. `statementGenerator.generateStatements` calls `validateTrialBalanceAndBalanceSheet` before return, so it also throws. |

### 2.3 HTTP handling

| Python | TypeScript |
|--------|------------|
| `app.py`: no global `@app.errorhandler(MathematicalIntegrityError)`. Each route that can raise it catches explicitly: `api_math_trial_balance` and `api_gl_process` use `except MathematicalIntegrityError as e: return _math_integrity_422(e)`. `_math_integrity_422(e)` returns 422 and JSON: `error: "MathematicalIntegrityError"`, `message`, `check`, `imbalanceAmount` (float), `details` (totalDebits, totalCredits, totalAssets, totalLiabilities, totalEquity as floats). | **ingest:** `catch (buildErr)` → if `buildErr instanceof MathematicalIntegrityError` and `body.allowImbalance` → **200** with success + imbalance info; else rethrow. Top-level catch → 422 with error, message, check, imbalanceAmount, details. **parser:** catch → 422 same shape. **audit_shared:** `handleAuditOrIntegrityError` → if `err instanceof MathematicalIntegrityError` → 422 same shape. **buildFinancialStatements tool:** catch and handle/rethrow. |

### 2.4 Summary

- **Contract:** Both use 422 and the same JSON shape for integrity errors (except Python uses `imbalanceAmount` as float, TS same; Python has optional `details` from exception attributes, TS has `details` object).
- **Difference:** TS ingest has an **allowImbalance** path that returns **200** with imbalance info; Python has no such option. For a single High-Integrity Engine, decide whether to keep or remove the allowImbalance behavior in TS.

---

## 3. Python Files Safe to Delete After Port

Assumption: **All callers** of these modules are updated to use the TypeScript engine only (e.g. remove or repoint `pythonBridge` and any direct calls to Flask for math/tax/parser). After that, the following can be **removed** once the corresponding logic is implemented and wired in TS.

### 3.1 Core math engine (Node already has TB/BS/P&L; Python used via pythonBridge for `/api/math/trial-balance`)

| File | Dependencies | Safe to delete when |
|------|--------------|----------------------|
| `backend/accounting_engine.py` | `backend/models.py` | Node is the only path for trial balance → statements; `postTrialBalanceToPython` is removed or never called. TS has `buildValidatedStatements` + `generateStatements` + `validateTrialBalanceAndBalanceSheet`. |

### 3.2 Tax (FX + deferred tax + nexus)

| File | Safe to delete when |
|------|----------------------|
| `backend/tax/fx_engine.py` | TS `fx_currency_service` is used for all FX remeasure/translate; no routes or workers call Python FX. |
| `backend/tax/tax_provisioning.py` | TS `deferred_tax_service.calculateDeferredTax` (or a new stateless helper with same signature) is used for `/api/tax/deferred`-style behavior. |
| `backend/tax/nexus_checker.py` | TS has a nexus checker service and routes (or Python nexus routes are deprecated). |

### 3.3 Parser (extraction)

| File | Safe to delete when |
|------|----------------------|
| `backend/parser/engine.py` | TS has equivalent extraction (PDF/Excel → TB or transaction list) or the product no longer uses Python parser. |
| `backend/parser/column_cleaner.py` | Logic is in TS (column standardization + format inference). |
| `backend/parser/models.py` | Only used by parser engine; remove with parser. |
| `backend/parser/ocr_engine.py` | TS has OCR or parser no longer needs it. |

### 3.4 Integrity gate (Python)

| File | Safe to delete when |
|------|----------------------|
| `backend/governance/integrity_gate.py` | No Python code path calls `run_integrity_gate`; all gate checks go through TS `integrity_gate_service.runIntegrityGate`. |

### 3.5 Do not delete (yet) or only after broader cleanup

| File | Reason |
|------|--------|
| `backend/models.py` | Used by `accounting_engine`, `app.py` (e.g. TrialBalanceLine for consolidation), and others. Delete only after all Python routes that use these models are removed or refactored. |
| `backend/app.py` | Contains all Flask routes. Remove only the **routes** that call ported logic (e.g. `/api/math/trial-balance`, `/api/gl/process`, `/api/validate/balance-sheet`, `/api/depreciation/schedule`, `/api/tax/fx/remeasure`, `/api/tax/fx/unrealized-gl`, `/api/tax/deferred`, `/api/tax/nexus/*`, `/api/parser/extract`) and their imports; keep app.py for any remaining Python-only features (e.g. justification, compliance, governance, consolidation) until those are ported or retired. |

---

## 4. Checklist for Single High-Integrity Engine

1. **Trial balance / balance sheet**  
   - Use only TS: `buildValidatedStatements` / `generateStatements` and `validateTrialBalanceAndBalanceSheet`.  
   - Remove or repoint `postTrialBalanceToPython` so Node no longer calls `/api/math/trial-balance` or `/api/gl/process`.

2. **Validate balance-sheet-only route**  
   - If needed, add a TS route that accepts `{ assets, liabilities, equity }` and returns balance result using `getRoundingTolerance()` (not a hardcoded 0.02).

3. **Depreciation schedule**  
   - Add a pure TS function (and optional route) that mirrors Python’s standalone schedule (method, cost, salvage, useful_life, placed_in_service) → list of period lines.

4. **FX**  
   - Use only `fx_currency_service`; add `computeUnrealizedFxGainLoss` in TS if you need the same API as Python.

5. **Deferred tax**  
   - Expose a stateless TS function with the same inputs/outputs as `compute_deferred_taxes` for API parity if needed.

6. **Nexus**  
   - Port `nexus_checker` to TS (and optional routes) if the product still uses it.

7. **Parser**  
   - Either port PDF/Excel extraction and column cleaning to TS or keep calling Python until parity.

8. **Integrity gate**  
   - Use only TS `integrity_gate_service`; remove Python `governance.integrity_gate` usage.

9. **MathematicalIntegrityError**  
   - Keep a single definition in TS; ensure all routes (ingest, parser, audit) and the buildFinancialStatements tool use it and return 422 (and decide whether to keep `allowImbalance` on ingest).

10. **Python files to delete** (after steps above):  
    - `backend/accounting_engine.py`  
    - `backend/tax/fx_engine.py`  
    - `backend/tax/tax_provisioning.py`  
    - `backend/tax/nexus_checker.py`  
    - `backend/parser/engine.py`  
    - `backend/parser/column_cleaner.py`  
    - `backend/parser/models.py`  
    - `backend/parser/ocr_engine.py`  
    - `backend/governance/integrity_gate.py`  

    Then strip from `backend/app.py` the routes and imports that referenced these modules, and leave `backend/models.py` in place until no Python code depends on it.
