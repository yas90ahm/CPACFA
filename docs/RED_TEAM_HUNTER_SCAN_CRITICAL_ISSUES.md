# Red Team Hunter Scan — Critical Issues

**Scope:** Raw implementation only (no .md trust). Pre-production audit.

---

## 1. Invisible Logic Mismatch (Deterministic Math vs Agentic Tools)

### CRITICAL-1.1 — Python tolerance hardcoded; Node uses config

| Item | Detail |
|------|--------|
| **File** | `backend/accounting_engine.py` |
| **Lines** | 143, 254, 263, 303 |
| **Issue** | Python uses **hardcoded** `Decimal("0.01")` for trial balance and `build_validated_statements`, but **`Decimal("0.02")`** for `validate_balance_sheet`. Node uses `getRoundingTolerance()` from `rules_registry` (financial_rules.json). So: (1) Python has two different tolerances (0.01 vs 0.02) in the same engine; (2) Python never reads financial_rules.json; (3) Agentic tools in Node use rules_registry, so a change in financial_rules.json affects Node only. |
| **Fix Plan** | In Python, read rounding tolerance from shared/config/financial_rules.json (same as backend/governance/integrity_gate.py does via `_get_rounding_tolerance_from_config()`). Use a single tolerance for trial_balance, build_validated_statements, and validate_balance_sheet. Consider importing/calling the same helper as integrity_gate.py or centralizing in one module. |

### CRITICAL-1.2 — Python accounting_engine trial_balance uses 0.01; validate_balance_sheet uses 0.02

| Item | Detail |
|------|--------|
| **File** | `backend/accounting_engine.py` |
| **Lines** | 143 (`tolerance = Decimal("0.01")`), 303 (`tolerance: Decimal = Decimal("0.02")`) |
| **Issue** | Same codebase: TB balance check uses 0.01, BS balance check uses 0.02. A gap of 0.015 could pass BS validation but fail TB (or vice versa). |
| **Fix Plan** | Use one constant or one config reader for both. Prefer reading from financial_rules.json (align with Node and backend governance/integrity_gate.py). |

### CRITICAL-1.3 — Rounding: Node 2 decimals (round2) vs Python Decimal

| Item | Detail |
|------|--------|
| **File** | `src/utils/decimal.ts` (round2, DP=2); `backend/accounting_engine.py` (Decimal, no explicit decimal places in comparisons) |
| **Issue** | Node uses `round2` (2 decimal places) for currency and `round4` for ratios. Python uses `Decimal` without a consistent decimal-place policy in accounting_engine (e.g. trial_balance totals are raw Decimal). If Node sends rounded numbers and Python compares unrounded, or vice versa, edge cases can diverge. |
| **Fix Plan** | Document and enforce: (1) All currency/totals use 2 decimal places in both stacks; (2) When Node calls Python (e.g. /api/math/trial-balance), agree on rounding before compare. Prefer Python using the same 2dp for totals when returning to Node. |

---

## 2. Silent Failure Audit (Swallowed Errors)

### CRITICAL-2.1 — Supervisor persistence errors swallowed

| Item | Detail |
|------|--------|
| **File** | `src/agents/Supervisor.ts` |
| **Lines** | 278–282, 285–289, 292–296 |
| **Issue** | `fireReasoningStep`, `fireObservationPersisted`, `fireMessageHistoryPersisted` wrap `onReasoningStep` / `onObservationPersisted` / `onMessageHistoryPersisted` in try/catch with empty catch: "// Log but do not fail the loop". If `appendReasoningLog` or `updateSession` throws (DB down, constraint violation), the error is swallowed and the loop continues. User gets a successful response while reasoning/steps were not persisted. |
| **Fix Plan** | (1) At minimum: log the error with request/session context and rethrow or call a shared error handler so the HTTP layer can return 500. (2) Prefer: await persistence, and on failure either retry once or return a 503/500 with a clear message that the response was generated but audit trail could not be saved, so the client can retry or alert. |

### CRITICAL-2.2 — Python forensic_skeptic: persistence failure silent; API still returns success

| Item | Detail |
|------|--------|
| **File** | `backend/governance/forensic_skeptic.py` |
| **Lines** | 235–239 |
| **Issue** | `try: persisted = persist_forensic_anomalies(...) except Exception: persisted = 0`. Persistence failure sets `persisted = 0` but the API still returns the scan result and summary. Caller cannot distinguish "anomalies found and saved" from "anomalies found but DB save failed". |
| **Fix Plan** | Re-raise after logging, or include in the response a field such as `persistence_failed: true` and/or HTTP 207/503 when persistence fails so the Node caller or UI can alert and retry. |

### CRITICAL-2.3 — Python forensic_skeptic: datetime parse failure returns None

| Item | Detail |
|------|--------|
| **File** | `backend/governance/forensic_skeptic.py` |
| **Lines** | 78–83 (`_parse_datetime`) |
| **Issue** | `except Exception: return None`. Invalid datetime string is silently converted to None. Downstream logic may treat None as "no date" and skip time-based checks, potentially missing unusual-time flags. |
| **Fix Plan** | Log the invalid value and exception; either re-raise or return a sentinel and document behavior. Prefer failing noisily for malformed input so clients fix data. |

### CRITICAL-2.4 — Python agent_orchestrator: broad except pass

| Item | Detail |
|------|--------|
| **File** | `backend/agent_orchestrator.py` |
| **Lines** | 217–218, 328–329, 377–378, 382–383, 389–390 |
| **Issue** | Multiple `except Exception: pass` blocks when parsing CPA/CFA output or extracting numbers. A corrupted or unexpected response can be silently ignored and replaced with defaults; the pipeline can still return a "success" result with wrong or missing data. |
| **Fix Plan** | Log each exception with context (e.g. which field/step). For critical paths (e.g. balance sheet totals), prefer failing or returning a structured error instead of defaulting. |

### CRITICAL-2.5 — Python skepticism_agent: any exception returns None

| Item | Detail |
|------|--------|
| **File** | `backend/governance/skepticism_agent.py` |
| **Lines** | 136–137 |
| **Issue** | `except Exception: return None`. Any error in the skepticism flow returns None. Caller may interpret None as "no skepticism findings" and treat the ledger as clean. |
| **Fix Plan** | Log and re-raise, or return a result type that indicates failure (e.g. `{ error: true, message: "..." }`) so the caller does not treat "skeptic failed" as "skeptic passed". |

---

## 3. Dead Code & Orphaned Logic

### CRITICAL-3.1 — In-memory Maps not replaced by PersistenceService (by design)

| Item | Detail |
|------|--------|
| **Files** | `src/services/hitl_orchestrator.ts` (stagingStore, idCounter), `src/services/saved_scenarios_service.ts` (store), `src/services/narrative_version_service.ts` (store), `src/services/kpi_history_service.ts` (store when no pool) |
| **Lines** | hitl_orchestrator 87–88, 97; saved_scenarios 7; narrative_version 14; kpi_history 14 |
| **Issue** | These remain as intentional fallbacks when pool/tenantId are not provided. PersistenceService explicitly replaces HITL/supervisor session state only when DB is present. So these are not "dead" but are **dual paths**. Risk: production could misconfigure and use in-memory path, losing data on restart. |
| **Fix Plan** | (1) In production, require pool and tenantId so in-memory path is never used; enforce in middleware or startup check. (2) Add a warning log when falling back to in-memory (e.g. "HITL staging in-memory; persistence not available"). (3) Optionally deprecate in-memory for saved_scenarios and narrative_version and require DB for those features. |

### CRITICAL-3.2 — Services not referenced by modular routers (sample)

| Item | Detail |
|------|--------|
| **Files** | Many under `src/services/` are only used by non-modular routes (e.g. dcf.ts, cfaAnalyst.ts, ingestion.ts) or by agents/supervisor. None of the four modular router trees (trial-balance, cfo-dashboard, audit, close) import every service. |
| **Issue** | "Dead" in the sense of "not used by the new modular routers" is expected: other routers (dcf, portfolio, etc.) still use their own services. No single service was found that is **never** imported anywhere; the earlier release sweep already confirmed no leftover monolithic route file. |
| **Fix Plan** | No change required for modularity. Optional: run a static "unused export" check (e.g. ts-prune) and remove or document truly unused exports. |

---

## 4. Race Conditions & Await Gaps

### CRITICAL-4.1 — Persistence callbacks are awaited but errors swallowed

| Item | Detail |
|------|--------|
| **File** | `src/agents/Supervisor.ts` |
| **Lines** | 279, 286, 293 |
| **Issue** | `await Promise.resolve(context?.onReasoningStep?.(ts))` etc. **are** awaited, so there is no race where the next Thought runs before the previous persist completes. However, the surrounding try/catch swallows errors (see CRITICAL-2.1), so a failed persist does not fail the request. |
| **Fix Plan** | Same as CRITICAL-2.1: do not swallow; log and rethrow or return 503 so the client knows persistence failed. |

### CRITICAL-4.2 — unified_orchestrator: callbacks return Promises; Supervisor awaits them

| Item | Detail |
|------|--------|
| **File** | `src/services/unified_orchestrator.ts` |
| **Lines** | 211–222 |
| **Issue** | `onReasoningStep` is `(entry) => appendReasoningLog(...)` (returns Promise). `onObservationPersisted` is `(lastStep, lastResultSummary) => updateSession(...)` (returns Promise). Supervisor calls these and awaits via `Promise.resolve(...)`. So **no missing await**: the next step does not run until the previous callback's Promise settles. |
| **Fix Plan** | No code change for ordering. Only fix the swallow in Supervisor (CRITICAL-2.1). |

---

## 5. Financial Edge Cases (buildValidatedStatements)

### CRITICAL-5.1 — totalAssets exactly zero

| Item | Detail |
|------|--------|
| **File** | `src/services/financialStatements.ts` |
| **Lines** | 220–234 (buildValidatedStatements), 191–198 (validateTrialBalanceAndBalanceSheet) |
| **Issue** | When `totalAssets === 0` and `totalLiabilities + totalEquity === 0`, `absGt(0, 0, tol)` is false (0 > tol is false). So the function does **not** throw and returns the result. Zero balance sheet is mathematically valid (e.g. pre-operations company). |
| **Fix Plan** | No change. Document that zero totals are allowed. If business rules require "at least one asset/liability/equity line", enforce that in validation or schema, not in the Kill Switch. |

### CRITICAL-5.2 — Imbalance smaller than rounding_tolerance

| Item | Detail |
|------|--------|
| **File** | `src/services/financialStatements.ts`, `src/utils/decimal.ts` (absGt) |
| **Lines** | financialStatements 220–224, 228–234; decimal 71–73 |
| **Issue** | Check is `absGt(totalDebits, totalCredits, tol)`. So we throw only when `|a - b| > tol`. If imbalance is **smaller than or equal to** rounding_tolerance, we do **not** throw. This is correct: within-tolerance gap is treated as balanced. |
| **Fix Plan** | No change. Ensure financial_rules.json roundingTolerance is set appropriately (e.g. 0.01 or 0.02) and that both Node and Python use the same value (see CRITICAL-1.1, 1.2). |

### CRITICAL-5.3 — "Miscellaneous" plug account can balance ledger

| Item | Detail |
|------|--------|
| **File** | `src/services/financialStatements.ts` (buildValidatedStatements, buildFinancialStatements), `src/services/accountClassifier.ts` |
| **Lines** | buildValidatedStatements 206–235; accountClassifier default ASSET |
| **Issue** | The Kill Switch only enforces (A) Sum(Debits)==Sum(Credits) and (B) Assets==Liabilities+Equity. It does **not** validate account names or forbid plug accounts. An agent (or user) could add a line "Miscellaneous" / "Suspense" with the exact imbalance amount and pass the gate. So a malicious or buggy agent could "balance" a ledger with a plug. |
| **Fix Plan** | (1) Policy: prohibit or flag accounts with names matching "Miscellaneous", "Suspense", "Plug", "Rounding" in production; run as a separate validation or data-quality rule. (2) Optionally: in buildValidatedStatements or in the route layer, run a heuristic check (e.g. single line exactly equal to totalDebits - totalCredits before that line) and return 422 with a "suspicious plug" message. (3) Document in audit/risk that the Kill Switch is mathematical only; plug detection is a separate control. |

---

## Summary Table

| ID | Severity | Area | File | Line(s) |
|----|----------|------|------|---------|
| CRITICAL-1.1 | High | Logic mismatch | backend/accounting_engine.py | 143, 254, 263, 303 |
| CRITICAL-1.2 | High | Logic mismatch | backend/accounting_engine.py | 143, 303 |
| CRITICAL-1.3 | Medium | Rounding | src/utils/decimal.ts, backend | N/A |
| CRITICAL-2.1 | High | Silent failure | src/agents/Supervisor.ts | 278–296 |
| CRITICAL-2.2 | High | Silent failure | backend/governance/forensic_skeptic.py | 235–239 |
| CRITICAL-2.3 | Medium | Silent failure | backend/governance/forensic_skeptic.py | 78–83 |
| CRITICAL-2.4 | High | Silent failure | backend/agent_orchestrator.py | 217–218, 328–329, 377–383, 389–390 |
| CRITICAL-2.5 | High | Silent failure | backend/governance/skepticism_agent.py | 136–137 |
| CRITICAL-3.1 | Medium | Orphaned/dual path | hitl_orchestrator, saved_scenarios, narrative_version, kpi_history | 87–88, 7, 14, 14 |
| CRITICAL-3.2 | Low | Dead code | N/A | N/A |
| CRITICAL-4.1 | High | Await/error | src/agents/Supervisor.ts | 279, 286, 293 |
| CRITICAL-4.2 | Info | No race | unified_orchestrator.ts | 211–222 |
| CRITICAL-5.1 | Info | Edge case | financialStatements.ts | 220–234 |
| CRITICAL-5.2 | Info | Edge case | financialStatements.ts, decimal.ts | 220–234, 71–73 |
| CRITICAL-5.3 | High | Plug account | financialStatements, accountClassifier | 206–235 |

---

*End of Red Team Hunter Scan — Critical Issues.*
