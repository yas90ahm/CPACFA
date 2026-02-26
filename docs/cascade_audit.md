# Cascade Implementation Audit — Part 1

## 1. Mutations That Already Trigger Downstream Recalculation

### After AJE Posted (`journal_entry_service.postJE`)
- **runCascade** (HITL): Yes — runs `runCascade` with `aje_posted` after posting
- **refreshGLBalances**: Yes — called directly after runCascade for the close session
- **Adjusted TB**: NO explicit recalculation — adjusted TB is computed **on-demand** when consumers call `getAdjustedTrialBalance` or `getTrialBalanceForCertification`; it reads from unadjusted TB + posted JEs each time
- **Statements**: NO invalidation — statement packages remain as-is; no stale flag
- **Validation**: NO re-run — `computeReadiness` is called on-demand by API/state machine when advancing
- **Readiness**: NO pre-compute — `computeReadiness` is always computed fresh on request

### After Reconciliation Completed / Approved (`period_reconciliation_service`)
- **runCascade** (HITL): Yes — both `completeReconciliation` and `approveReconciliation` call `runCascade` with `recon_completed`
- **refreshGLBalances**: NO — reconciliation completion does NOT refresh GL balances (recon completion only affects recon status; GL balance refresh happens after AJE posting)
- **Adjusted TB**: NO — same as above
- **Statements**: NO invalidation
- **Validation**: NO re-run
- **Readiness**: NO pre-compute

### After Mapping Changed (`coa_mapping_service.upsertCoaRules`)
- **runCascade** (HITL): NO — not wired
- **refreshGLBalances**: NO
- **Adjusted TB**: NO — mapping affects statement classification, not TB numbers; TB is per-account
- **Statements**: NO invalidation — but mapping change DOES affect statement line grouping; existing packages become inconsistent
- **Validation**: NO re-run
- **Readiness**: NO pre-compute

### After TB Reingested
- **runCascade** (HITL): NO — not wired (would need to find TB ingest entry point)
- **refreshGLBalances**: NO
- **Adjusted TB**: N/A — reingestion replaces the base TB; adjusted TB recomputes on next read
- **Statements**: NO invalidation
- **Validation**: NO re-run
- **Readiness**: NO pre-compute

### After Variance Explanation Saved
- **runCascade** (HITL): NO — not wired
- **Validation**: NO re-run (variance explanation affects recon completeness check)
- **Readiness**: NO pre-compute

---

## 2. Mutations That DON'T Trigger But Should

| Mutation              | Currently Triggers        | Should Trigger                                      |
|-----------------------|---------------------------|-----------------------------------------------------|
| AJE posted            | runCascade, refreshGLBalances | ✓ (partial) — add statement invalidation, validation |
| AJE reversed          | (if exists) — N/A         | Full cascade                                        |
| Recon completed       | runCascade                | ✓ (partial) — no TB/statement/validation cascade    |
| Recon approved        | runCascade                | Same                                                |
| Mapping changed       | audit event only          | Full cascade (statement invalidation critical)      |
| TB reingested         | Nothing                   | Full cascade                                        |
| Variance explained    | Nothing                   | runCascade + validation re-run                      |

---

## 3. Where runCascade (Step 4 HITL) Is Called

| Location                               | Trigger Type      | When                         |
|----------------------------------------|-------------------|------------------------------|
| `journal_entry_service.postJE`         | aje_posted        | After JE successfully posted |
| `period_reconciliation_service.completeReconciliation` | recon_completed | After recon marked completed |
| `period_reconciliation_service.approveReconciliation`  | recon_completed | After recon approved         |

**Not wired:**
- Mapping changed
- TB reingested
- Variance explained
- AJE reversed (if that flow exists)

---

## 4. Adjusted TB: On-Demand vs Cached

**Adjusted TB is computed ON-DEMAND.** There is no storage/cache of the adjusted TB.

- `getAdjustedTrialBalance(tenantId, periodLabel, pool, closeSessionId)`:
  1. Gets unadjusted TB from `getUnadjustedOrRollup` or GL-derived
  2. Gets posted close adjustments from `listAdjustments`
  3. Gets postable JEs from `getPostableJEAdjustments` (when closeSessionId provided)
  4. Merges via `mergeAdjustmentsIntoEntries` (uses Decimal.js `plus`)
  5. Returns the result — **does not persist**

- `getTrialBalanceForCertification`:
  - If GL data exists: derives TB from GL (on-demand)
  - Otherwise: calls `getAdjustedTrialBalance` (on-demand)

**Implication:** No need to "recalculate" adjusted TB in the cascade — it is always computed fresh. The cascade only needs to ensure that downstream consumers (recon, validation, readiness) see the new state. Since there's no cache, the main cascade steps are:
1. **Recon GL refresh** — already called after AJE post; pulls from `getTrialBalanceForCertification` which gets fresh adjusted TB
2. **Statement invalidation** — need to add; statement packages have versions and input_hash; we need a "stale" concept
3. **Validation re-run** — readiness/validation are on-demand; no storage. Cascade could optionally pre-compute and store, or we keep on-demand (simpler)
4. **HITL runCascade** — already wired for AJE and recon

---

## 5. Statements: On-Demand vs Cached

**Statements are CACHED.** `generateStatements` creates a new `statement_packages` record with lines. Multiple versions can exist per close session.

- `statement_packages` table: id, close_session_id, version, input_hash, generated_at, status, etc.
- `statement_lines` table: package_id, fs_line_id, amount, statement, metadata
- No `stale` or `valid` flag in the schema — packages are immutable versions
- When TB/GL changes, existing packages are NOT invalidated; they remain as historical snapshots
- The "latest" package is fetched by version; there is no concept of "stale"

**Implication:** The target says "invalidate statements" — options:
- **Option A:** Add a `stale_since` or `invalidated_at` column to `statement_packages` (or a separate `statement_package_validity` table) and set it when TB changes
- **Option B:** Treat "latest package" as potentially stale; add a `tb_input_hash_at_generation` and compare to current TB hash; if different, mark as stale in API response
- **Option C:** Don't add schema — cascade sets a "period_statement_stale" flag somewhere (e.g. `period_export_checks` or new table) that the dashboard reads

Simplest: Add a lightweight `period_financial_state` or use `period_export_checks` to store `statements_stale_since` timestamp. When cascade runs and TB changed, set that. Dashboard reads it.

---

## 6. Validation Results: Stored vs Computed

**Validation is COMPUTED ON-DEMAND.** No storage of validation results.

- `computeReadiness` in `close_checklist_readiness_service` runs all checks each time:
  - Checklist completion
  - Cash rec (bank recon sign-off)
  - Critical issues
  - Draft/proposed JEs
  - Integrity (D=C, etc.)
  - Evidence policy
  - Recon completeness gate
  - Export checks (rounding, materiality)

- `finalIntegrityCheck` in `integrity_check` — used at certify/export
- `runIntegrityGate` in `integrity_gate_service` — D=C, A=L+E

**Implication:** Validation doesn't need "re-run" in the cascade — it's always fresh when requested. The cascade could skip a dedicated "run validation" step if we're OK with validation being computed on the next API call. The prompt wants "validation checks re-run" — that could mean: ensure the next `computeReadiness` call sees current data (it will, since TB is on-demand). So we may not need to store validation results; we just need to ensure no stale caches. There are no validation caches today.

---

## 7. Order of Operations (Current vs Target)

**Current AJE post flow:**
1. postJE (update status, record event, run justifier, create justification)
2. runCascade (HITL: detect issues, auto-verify)
3. refreshGLBalances (recon: update GL balance, revert status if over tolerance, create issue)

**Target cascade (from prompt):**
1. Adjusted TB recalculates — **N/A** (on-demand)
2. Recon GL balances refresh — **DONE** (refreshGLBalances)
3. Statements invalidated — **NOT DONE**
4. Validation re-run — **N/A** (on-demand; no storage)
5. HITL issues update — **DONE** (runCascade)
6. Close readiness refresh — **N/A** (on-demand)

**Gap:** Statement invalidation. That's the main missing piece for the cascade. The rest is largely already there or naturally on-demand.

---

## 8. Deduplication Notes

- `refreshGLBalances` is called directly in `postJE`, not via a cascade engine
- `runCascade` is called directly in `postJE` and in `completeReconciliation` / `approveReconciliation`
- There is no single `executeCascade` orchestrator; each trigger does its own thing

**For Step 6:** Create `cascade_engine.executeCascade` as the single entry point. It will:
1. Refresh recon GL balances (for TB-affecting triggers)
2. Invalidate statements (for TB-affecting triggers)
3. Call `runCascade` (HITL) — reuse existing
4. Optionally pre-compute readiness (or leave on-demand)
5. Log performance

Wire all mutation points to call `executeCascade` instead of calling `refreshGLBalances` and `runCascade` directly. Remove direct calls from journal_entry_service and period_reconciliation_service.
