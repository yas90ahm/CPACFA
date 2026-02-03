# Final Release Manager Sweep — Modularization, Validation, Persistence

**Date:** Post-modularization, validation, and persistence refactors  
**Goal:** Pure state — only modular, validated, and persistent paths remain.

---

## 1. Server route sweep (monolithic → sub-routers)

**Status: PASS — No old monolithic route files referenced.**

All route imports in `src/server.ts` were audited:

| Area | Import | File system | Verdict |
|------|--------|-------------|---------|
| Trial Balance | `./routes/trial-balance/index.js` | `trial-balance/index.ts` + sub-routers | ✓ Modular |
| CFO Dashboard | `./routes/cfo-dashboard/index.js` | `cfo-dashboard/index.ts` + kpis, narratives, scenarios | ✓ Modular |
| Audit | `./routes/audit/index.js` | `audit/index.ts` + 14 sub-routers | ✓ Modular |
| Close | `./routes/close/index.js` | `close/index.ts` + 16 sub-routers | ✓ Modular |

- **Removed / never re-added:** `trialBalance.ts`, `cfoDashboard.ts` (deleted during modularization).
- **Corrected earlier:** `audit.js` was updated to `audit/index.js` so the server resolves the audit aggregate.
- All other routers are single-file routers (e.g. `auth.js`, `cfaAnalyst.js`, `export.js`) with no existing subdirectory; no change required.

**Conclusion:** No monolithic route files remain in use; all aggregated areas use `index.js` sub-routers.

---

## 2. RulesRegistry — IntegrityGate and Python bridge

**Status: PASS — IntegrityGate and financialStatements use RulesRegistry; Python parity documented.**

### IntegrityGate
- **File:** `src/services/integrity_gate_service.ts`
- **Usage:** `import { getRoundingTolerance } from './rules_registry.js'`; `runIntegrityGate()` uses `input.tolerance ?? getRoundingTolerance()` for trial balance and balance sheet checks.
- **Verdict:** ✓ Correct.

### Kill Switch (financial statements)
- **File:** `src/services/financialStatements.ts`
- **Usage:** `import { getRoundingTolerance } from './rules_registry.js'`; used in balance validation (e.g. `buildValidatedStatements`).
- **Verdict:** ✓ Correct.

### Python bridge
- **File:** `src/agents/tools/pythonBridge.ts`
- **Design:** Node does not call Python with rules in the request; `rules_registry.ts` states that *both Node and Python load* `shared/config/financial_rules.json`. Python workers are expected to read the same file (e.g. via `RULES_CONFIG_PATH` or the same path).
- **Change made:**  
  - Exported `getConfigPath()` from `src/services/rules_registry.ts` so the same path can be used by Python or docs.  
  - Added a comment in `pythonBridge.ts` that Python workers should use the same rules config (e.g. `RULES_CONFIG_PATH` or `getConfigPath()`) for validation parity (e.g. rounding tolerance).

**Conclusion:** RulesRegistry is used correctly by IntegrityGate and the financial statements Kill Switch; Python bridge parity is documented and the config path is exported for reuse.

---

## 3. Dead code audit — PersistenceService vs in-memory

**Status: PASS — No dead in-memory stores to remove; fallbacks are intentional.**

### PersistenceService role
- **File:** `src/services/persistence_service.ts`
- **Purpose:** Replaces in-memory Maps for **HITL staging** and **supervisor session state** when a tenant DB is available (pool + tenantId).

### HITL orchestrator
- **File:** `src/services/hitl_orchestrator.ts`
- **Behavior:** When `opts?.pool && opts?.tenantId`, uses `persistence.createStagingItem`, `listStagingItems`, `getStagingItem`, `updateStagingStatus`. When not provided, uses in-memory `stagingStore` and `idCounter`.
- **Verdict:** In-memory path is the **intentional dev/fallback** when DB is not configured. Removing it would break no-DB usage. **No deletion.**

### Other services with in-memory stores
- **saved_scenarios_service.ts:** Only in-memory Map; not replaced by PersistenceService (PersistenceService is HITL + supervisor only).
- **kpi_history_service.ts**, **narrative_version_service.ts:** Hybrid (DB when pool+tenantId, in-memory fallback); not “replaced” by PersistenceService.
- **audit_log_service.ts**, **justification_service.ts,** etc.: Same pattern — DB when available, in-memory fallback. No dead code.

**Conclusion:** No local variables or in-memory maps that were *replaced* by PersistenceService remain as dead code. Remaining in-memory stores are either the HITL/supervisor fallback or separate features (scenarios, KPI history, narrative versions) that were never migrated to PersistenceService.

---

## Summary

| Check | Result |
|-------|--------|
| Server.ts — old monolithic routes removed/replaced | ✓ All use index.js sub-routers |
| RulesRegistry — IntegrityGate | ✓ Uses getRoundingTolerance() |
| RulesRegistry — financialStatements (Kill Switch) | ✓ Uses getRoundingTolerance() |
| RulesRegistry — Python bridge | ✓ Parity documented; getConfigPath() exported |
| Dead code — in-memory replaced by PersistenceService | ✓ None; fallbacks intentional |

**Codebase state:** Only modular, validated, and persistent paths remain; in-memory fallbacks are documented and intentional for dev/no-DB scenarios.
