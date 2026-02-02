# Audit and Controls (Zero-Trust)

This document summarizes key behavioral controls implemented to support auditability, defensibility, and regulatory deposition.

## 1. Statement totals: deterministic and user-confirmed only

Statement totals (Balance Sheet and P&L) are driven **only** by:

- **Deterministic classification** — keyword-based account type (Asset, Liability, Equity, Revenue, Expense) with codification references (ASC 210, IAS 1).
- **User-confirmed overrides** — when a user explicitly applies classification overrides via `POST /api/trial-balance/apply-classification`, those overrides are used for the subsequent statement build.

Raw LLM (agentic) classification **never** drives statement totals. Agentic suggestions are available via `POST /api/trial-balance/classification-suggestions` for review; they are applied only after the user confirms via the apply-classification API.

## 2. Policy is period-scoped when resolving standard

When generating statements, the accounting standard (ASPE, IFRS, FRS102, US_GAAP) is resolved using **period-scoped policy memory** when `periodLabel` (or `fiscalYear`) is provided. The system first looks up policy for that period/fiscal year; if none exists, it falls back to the default (empty period) policy. Changing policy for a future period does not alter already-generated statements for past periods unless the user explicitly re-runs those periods.

## 3. Decimal arithmetic and cross-footing

- **BS/P&L build**: Balance Sheet and P&L use decimal arithmetic (`decimal.js`) for line amounts (round to 2 dp) and for totals (`sumRound2`). Balance check (Assets = Liabilities + Equity) uses a configurable materiality tolerance.
- **Verification (Plan-Execute-Verify)**: V2 uses decimal comparison for the balance sheet gap vs materiality. V3b adds a **P&L cross-foot** check: sum of revenue line amounts vs `totalRevenue`, and sum of expense line amounts vs `totalExpenses`, within materiality. Failures are reported in the reasoning chain.

## 4. Prior-period comparison: temporal validation

The prior-period comparison endpoint (`POST /api/audit/prior-period-comparison`) validates that `priorPeriodLabel` is **temporally before** `currentPeriodLabel`. Supported formats include `YYYY-Qn`, `YYYY-MM`, and `YYYY`. If the prior period is not before the current period (or labels are unparseable), the request is rejected with 400 to avoid look-ahead or misuse.

## 5. Line-level and lease/revenue rationales (deposition-ready trace)

- **Classification rationale**: Each trial balance and financial statement line can carry `classificationSource` (deterministic, agentic, or user_confirmed) and `classificationRationale` (e.g. "Keyword match: 'revenue' in account name (ASC 210-10-45)."). These are set by the classifier and copied to the audit binder/export.
- **Lease classification basis**: Lease classification (operating vs finance) is computed with an auditable basis (term, economic life, PV vs FV test). The basis is persisted (e.g. `classification_basis` on leases) and can be appended to the reasoning chain or close audit trail when lease data is used in a run.
- **Revenue allocation rationale**: When contract allocation is set via `setContractAllocation`, an optional allocation rationale (e.g. "SSP-based", "Equal split confirmed by user") is persisted. This can be included in the reasoning chain or close audit trail for runs that use revenue recognition.

These controls support a deposition-ready trace: every classification and key judgment (lease, revenue) can be tied to a short, auditable rationale and citation.

---

## Optional: Legacy and GAAP consistency

**useAgenticClassification flag (backward compatibility)**  
Ingest and statements endpoints accept an optional body/query flag `useAgenticClassification: true`. When set, the system uses agentic (LLM) classification for that run instead of deterministic-only, so legacy clients can keep the previous behavior. Default is `false` (deterministic-first).

**Orchestrator**  
The task-decomposition orchestrator (e.g. “Prepare the Q4 Financials”) uses deterministic classification only (`classifyTrialBalanceDeterministic`) for reconciliation and statement build, so agentic output never drives its totals.

**Policy change record on confirm-standard**  
When the user confirms the reporting standard via `POST /api/trial-balance/confirm-standard`, the system records an accounting policy change (effective date from fiscal year or today, policy area “Reporting standard”, event type “accounting_policy_change”). That record is included in the GAAP Consistency Report so “policy as of date X” is auditable.
