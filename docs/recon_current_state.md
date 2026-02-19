# Reconciliation Current State (Step 5 — Part A)

## 1. Recon tables

| Migration | Table | Purpose |
|-----------|--------|---------|
| 071 | recon_runs | One run per (close_session_id, type). type: bank, ar, ap, interco. status: draft → in_progress → ready_for_review → signed_off. No tenant_id in table; joined via close_sessions. |
| 071 | recon_items | Line items in a run. source: bank, gl, subledger; amount, item_date, description, ref. |
| 071 | recon_match_groups | Proposed/confirmed/rejected match groups; match_confidence, decision_record_id. |
| 071 | recon_match_group_items | Links match_group_id to recon_item_id. |
| 071 | recon_exceptions | reason, status open/resolved/wont_fix, linked_issue_id. |
| 071 | recon_signoffs | recon_run_id PK, signed_by, signed_at, notes. |
| 020 | reconciliation_resolutions | Tenant-level. period_label, reconciliation_type (trial_balance, balance_sheet_equation, bank_reconciliation), passed, status (open, in_progress, resolved, re_run_pending, waived). Coarse pass/fail per period per type. |
| 014 | reconciliation_todos | Gap-derived tasks; tenant_id, gap_id, title, action, status, urgency. Not period-account recons. |

There is **no** table that tracks per-account per-period: GL balance, supporting balance, variance, tolerance, status. The new design adds `tenant_recon_requirements`, `tenant_period_reconciliations`, and `tenant_recon_items` for that.

## 2. Current recon workflow

- **Recon runs (recon_service + close_recon_runs):** User creates a recon run (type bank/ar/ap/interco) for a close session. Items are ingested (bank/gl/subledger). Match groups are proposed/confirmed/rejected. Exceptions (e.g. timing difference) can be created. Sign-off on run → status signed_off. No GL balance vs supporting balance; it’s item-level matching.
- **Reconciliation resolutions (reconciliation_resolution_service + close_reconciliation):** Create/list/patch resolution records by period_label and reconciliation_type (trial_balance, balance_sheet_equation, bank_reconciliation). Pass/fail and status (open, resolved, waived). No account-level detail.

## 3. Recon status per account per period

- **Not tracked.** recon_runs are per (close_session, type), not per account. So there is no “this account’s recon is not_started / in_progress / completed” per period.

## 4. Tolerance

- **recon_service:** `emitIssuesForUnmatchedAboveMateriality` uses a materiality threshold (from triage or param) to emit issues for unmatched items above that amount. No per-account tolerance or “within tolerance” flag on a recon record.

## 5. Bank pipeline

- **bank_pipeline_service.ts**, **bank_reconciliation_service.ts**, **agentic_bank_rec_service.ts** exist. Pipelines and bank rec are specialized flows; they are not yet wired into a single “period reconciliation completeness” gate. The readiness check (see below) only looks at bank recon **sign-off** if a bank run exists.

## 6. Existing “recon completeness” check

- **close_checklist_readiness_service.computeReadiness:**  
  - If there is at least one **bank** recon run for the close session, at least one of them must have a sign-off; otherwise hard blocker: “Cash reconciliation not complete; bank recon run(s) require sign-off.”  
  - No check for AR/AP/interco. No check for “all required accounts reconciled.” No tolerance or variance check.  
- **canAdvanceToUnderReview** (close_session_service): Calls `computeReadiness`; if `ready && hardBlockers.length === 0` then allowed. So the only recon-related gate is the bank sign-off when a bank run exists.

## 7. Summary

- **recon_runs** = item-level matching (bank/ar/ap/interco) per close session; sign-off required for bank when run exists.  
- **reconciliation_resolutions** = coarse pass/fail per period per type.  
- **No** per-account, per-period recon with GL balance, supporting balance, variance, tolerance, or “all required recons complete” gate.  
- Step 5 adds: requirements config, period reconciliations (with DB-computed variance/tolerance), completeness gate, and wiring into the state machine and HITL.
