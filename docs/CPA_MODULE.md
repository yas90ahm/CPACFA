# CPA Module — Plug-in Surface

The CPA module groups CPA-focused API routes under a single namespace when enabled. All existing `/api/*` routes remain available; the module adds an optional `/api/cpa/*` prefix for clarity and product surface.

## Config

| Env | Description |
|-----|-------------|
| `CPA_ENABLED` | Set to `true` to mount the CPA route group at `/api/cpa`. When unset or `false`, only the standard `/api/*` routes are available (no breaking change). |

## CPA Module Endpoints (when `CPA_ENABLED=true`)

When enabled, the following routes are also available under `/api/cpa`:

| Path under `/api/cpa` | Description |
|-----------------------|-------------|
| `/trial-balance` | Trial balance ingest, statements (BS, P&L, cash flow, notes), standard inference |
| `/close` | Month-end close checklist, JEs, period lock, audit log, disclosure checklist, exceptions |
| `/audit` | Audit binder, GAAP consistency report, policy changes, sampling, controls |
| `/knowledge-base` | Global/Firm/Session memory, precedent, invoice consistency |
| `/vector-store` | RAG ingestion, precedent search, citation |
| `/pipelines` | Bank rec, AP/AR aging, payroll (including bank-rec suggest-adjustments) |
| `/revenue-recognition` | Contracts, POBs, allocation/schedule, footnote (agentic) |
| `/leases` | Lease register, classification, schedule, position (ASC 842 / IFRS 16), agentic |
| `/fixed-assets` | PP&E register, depreciation runs, agentic useful life/method, footnote |
| `/eps` | Basic/diluted EPS (ASC 260), agentic weighted shares/footnote |
| `/fx` | Current-rate translation (CTA), temporal remeasurement (ASC 830 / IAS 21), agentic |
| `/deferred-tax` | Temporary differences, DTA/DTL, valuation allowance (ASC 740 / IAS 12), agentic |
| `/impairment` | CGUs, goodwill, value-in-use (ASC 350 / IAS 36), agentic |
| `/segments` | Operating segments, 10% test, reconciliation (ASC 280 / IFRS 8), agentic |
| `/consolidation` | Multi-entity, NCI, elimination JEs, agentic eliminations/footnote |
| `/statutory` | Management vs statutory reconciliation, agentic adjustment suggestions |
| `/acquisitions` | Business combinations (ASC 805 / IFRS 3), PPA, goodwill, agentic |
| `/equity-investments` | Equity method (ASC 323 / IAS 28), share of profit, basis differences, agentic |
| `/stock-comp` | Stock-based compensation (ASC 718 / IFRS 2), grants, expense, dilution |
| `/justification` | RAG justification (IRAC, [Source]), FASB/IFRS handbooks |

## Behaviors

- **Every GAAP first-class:** US GAAP, IFRS, ASPE, and FRS 102 are supported in the standards registry, statement generator (including lease liability for US_GAAP and IFRS), disclosure checklist (per-GAAP default topics), and topic-to-standard mapping (leases, revenue, EPS, FX).
- **Lease / topic standard:** Lease (and related) APIs accept either topic-level `standard` (e.g. `asc842`, `ifrs16`) or `accountingStandard` (e.g. `US_GAAP`, `IFRS`); the app resolves to the topic-level standard internally when only `accountingStandard` is provided.

See [CPA_CFA_CAPABILITY.md](CPA_CFA_CAPABILITY.md) for the full capability summary.
