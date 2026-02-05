# Experimental — Quarantined / Out-of-Scope Code

**Sovereign CPA Engine scope:** Deterministic accounting only. AI limited to Classifier, Advisor (no amounts), Shadow Auditor, Justifier.

Code that was **quarantined** (removed from production build) can be restored from **git history**. This folder documents what was removed and why.

## Quarantined (removed from `src/`)

- **Routes (unmounted then deleted):** forecasting, capital, budget, orchestrator, supervisor, reporting, access, entities, intercompany, ar_ap_workflows, invoice_to_books, bank_feed_matching, revenue_recognition, stock_compensation, deferred_tax, impairment, segment_reporting, consolidation, statutory, business_combination, equity_method, leases, fixed_assets, eps, fx_currency.
- **Services / agents:** Remain in `src/` but are not mounted or called by production routes; Phase 3 may remove dead service/agent files that have zero refs.

## Restore

To restore a quarantined file: `git show <commit>:src/routes/forecasting.ts > experimental/src/routes/forecasting.ts` (or use git checkout from a prior commit).

## No production imports

Production code must **not** import from `experimental/`. All production entrypoints use only in-scope routes and services.
