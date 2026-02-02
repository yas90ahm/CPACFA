# FinOS Agent (CPACFA)

Enterprise backend for **financial close, reporting, audit support, and valuation** in one place. Valuation and export run only on closed, reviewed data; CPA (books) and CFA (valuation) conflicts are flagged and can block export.

---

## What it is

- **Close-gated valuation:** DCF, comps, LBO consume data only after period close and controls (checklist, lock) are satisfied.
- **Conflict enforcement:** If the books say one thing (e.g. going-concern risk) and valuation another (e.g. perpetual growth), the system records a **CPA–CFA conflict** and can block export until resolved or acknowledged.
- **Deterministic books, optional AI:** Balance Sheet and P&L totals are driven only by deterministic classification and user-confirmed overrides. LLM is used for narratives, suggestions, and analysis—not for the numbers that define the financial statements.

---

## CPA (financial reporting, close, audit)

- **Trial balance → financials:** Ingest CSV/XLSX; validate balance; classify accounts (Asset/Liability/Equity/Revenue/Expense) with FASB ASC / IASB refs; produce Balance Sheet and P&L with codification. Plan–Execute–Verify loop (V1–V4: TB balance, Assets = L+E, P&L ties to equity, codification).
- **Month-end close:** Checklist, JE suggestions (rule-based + optional agentic), accrual/deferral suggestions, period lock (approver-only), close adjustments (approve/reject/post), **push posted adjustments to GL** (QuickBooks/Xero/NetSuite), audit log (append-only), segregation (preparer/reviewer/approver).
- **Audit support:** Binder, justification chat (IRAC + RAG + citations), audit-defense PDF, GAAP consistency report, prior-period comparison, sampling, controls catalogue.
- **Standards:** Period-scoped policy; GAAP/IFRS by jurisdiction (US GAAP, IFRS, ASPE, FRS 102); policy change log.
- **Major topics (US GAAP / IFRS):** Leases (ASC 842 / IFRS 16), Revenue (ASC 606 / IFRS 15), EPS (ASC 260), FX (ASC 830 / IAS 21), Deferred tax (ASC 740 / IAS 12), Impairment (ASC 350 / IAS 36), Segment reporting (ASC 280 / IFRS 8), Business combinations (ASC 805 / IFRS 3), Equity method (ASC 323 / IAS 28), Stock compensation (ASC 718 / IFRS 2), Fixed assets, Consolidation, Statutory. Bank rec, AR/AP workflows, invoice-to-books, revenue recognition, intercompany, data quality, approvals, onboarding.

---

## CFA (valuation, corporate finance, portfolio)

- **Valuation:** DCF (WACC, terminal value, sensitivity), Comparable companies, Precedent transactions, LBO (sources/uses, debt schedule, IRR/MOIC).
- **Analysis:** Liquidity and ratios (current/quick, CCC), Capital allocation (ROI, payback), CFO dashboard (MD&A, burn rate, runway, Rule of 40, variance, sensitivity).
- **Portfolio:** Allocation, Sharpe/Sortino, attribution, rebalancing; performance with hash-chained corrections.
- **Agents:** CFA Analyst (audit checks, DCF, liquidity, sensitivity, pointed questions). CFA Agent (DuPont, benchmarking, Monte Carlo, skepticism). **Supervisor** coordinates CPA + CFA and runs **reconcileCPAwithCFA**; unresolved conflicts are stored and can block export.

---

## Platform

- **Multi-tenant:** JWT auth, tenant-scoped data, roles (accountant, preparer, reviewer, approver).
- **BYOD:** Optional per-tenant Postgres; business data can live in the customer’s DB (`tenants.database_url`). Shared DB by default; database-per-tenant when set.
- **Integrations:** QuickBooks, Xero, NetSuite—sync TB, push JEs (e.g. posted close adjustments), pull transactions.
- **Security:** Structured logging (secret redaction), audit log retention (configurable purge), JWT 24h default, production auth lock, password complexity, request-id; see `docs/PRODUCTION_AND_SOC2_CHECKLIST.md`.

---

## Agentic features (LLM-powered)

The app uses LLM (Anthropic/OpenAI/Mistral) for **narratives, suggestions, parsing, and interpretation** only. Statement totals and lock/export logic remain **deterministic**. Below is where “agentic” is used.

### Close and month-end

| Feature | What the LLM does |
|--------|---------------------|
| Accrual/deferral suggestions | Suggests accruals/deferrals from open AR/AP, payroll, text; rule-based fallback. |
| JE suggestions from text | Turns free-text into journal entry suggestions. |
| JE suggestions explain | Narrative explaining suggested JEs for close docs. |
| Materiality / disclosure suggest | Suggests materiality threshold; suggests missing disclosures; evidence for disclosure items. |
| Controls suggest assertions | Suggests control assertions for a control. |
| Close exceptions / readiness / tie-out / package narrative | Narratives and next actions for open items, readiness, tie-out, close package. |

### CFO dashboard and reporting

| Feature | What the LLM does |
|--------|---------------------|
| MD&A narrative (agentic) | LLM-enhanced management discussion; fallback to rule-based. |
| Variance explain / drivers refine | Explains budget vs actual; refines volume/price/mix drivers. |
| Pointed-question / sensitivity | Parses free-form sensitivity questions; scenario interpretation. |
| KPI commentary / Board one-pager / Board deck | Commentary on KPIs; executive one-pager; slide-ready JSON. |
| Sensitivity report interpret | Interprets sensitivity report output. |

### Valuation (DCF, comps, precedent, LBO)

| Feature | What the LLM does |
|--------|---------------------|
| DCF | Revenue/margin forecast, WACC, terminal growth, beta, valuation summary. |
| Comps / Precedent | Memo and outlier commentary. |
| LBO | Exit multiple, debt capacity, LBO memo. |

### Audit and quality

| Feature | What the LLM does |
|--------|---------------------|
| Prior-period / bank rec / sampling / reconciliation narrative | Narratives for prior-period, bank rec, sampling, reconciliation. |
| Plan–Execute–Verify (agentic) | Optional LLM-generated plan; verification (V1–V4) stays programmatic. |
| Account classification (agentic) | Optional LLM classification suggestion; applied only after user confirm. |
| Gap analyzer / Quality assessor | Anomaly and gap analysis; data quality assessment. |

### Judgments (flag-only, no auto-apply)

| Feature | What the LLM does |
|--------|---------------------|
| Revenue: POB vs marketing | Distinguishes performance obligation (ASC 606) vs marketing incentive. |
| Substance over form (embedded lease) | Semantic “control of identified asset” (IFRS 16/ASC 842). |

### Enterprise, pipelines, operations

| Feature | What the LLM does |
|--------|---------------------|
| Covenants / Statutory | Commentary on covenants; narrative for management vs statutory. |
| Budget reforecast | Reforecast from actuals + prior budget. |
| AR/AP / Invoice-to-books / Bank feed | Collections, payment run, cash application; invoice coding; bank match suggestions. |
| Revenue recognition / Intercompany / Data quality / Approvals / Catalog | Allocation/timing suggestions; variance explain; remediation suggestions; approval summary; query intent/summary. |

### Technical accounting narratives

Leases, fixed assets, deferred tax, impairment, segment reporting, business combinations, equity method, consolidation, statutory, FX, stock comp, tax tie-out, cash flow/equity/notes narrative, reporting commentary—all have **agentic footnote or narrative** options.

### Supervisor and conflict check

**Supervisor** coordinates CPA (build statements) and CFA (ratios, valuation) via tool-calling. **Reconcile CPA with CFA** compares books vs valuation/ratios, surfaces conflicts (e.g. going concern vs DCF terminal growth); conflicts are stored and can block export.

**Summary:** 57+ agentic service modules. Every one is suggestion, narrative, or interpretation. None drive BS/P&L totals, period lock, or export gates—those remain rule-based and user-confirmed.

---

## In scope / Out of scope

**In scope:** Full path from trial balance and close through financials, audit support, and valuation, with conflict checks and close-gated export. Deterministic statement totals; agentic for narratives, suggestions, and analysis.

**Out of scope:** SEC/XBRL or 10-K/10-Q builder. Full AR/AP subledger as general-ledger replacement. Bond pricing, credit spread, CDS, or full derivatives beyond Black–Scholes.

---

## Quick start

```bash
npm install
npm run dev
```

- **Upload:** `POST http://localhost:3001/api/trial-balance/ingest` with `file` (CSV or XLSX).
- **JSON:** `POST http://localhost:3001/api/trial-balance/statements` with body:
  ```json
  {
    "entries": [
      { "accountName": "Cash", "debit": 10000, "credit": 0 },
      { "accountName": "Revenue", "debit": 0, "credit": 10000 }
    ]
  }
  ```

Requires `DATABASE_URL` for persistence; see `.env.example` for production-related variables.

---

## Project structure

```
CPACFA/
├── docs/                    # REASONING_CHAIN, BYOD_ARCHITECTURE, CPA_CFA_CAPABILITY, AUDIT_AND_CONTROLS, PRODUCTION_AND_SOC2_CHECKLIST, etc.
├── migrations/              # Control + tenant SQL migrations
├── src/
│   ├── auth/                # JWT, bcrypt, middleware (requireAuth, attachTenantPool)
│   ├── db/                   # Control + tenant pools, repositories, migrate
│   ├── lib/                  # logger, errorHandler, tenant_context, closeRole
│   ├── middleware/           # requestId, validateRequest
│   ├── routes/               # trialBalance, close, cfa, cfo-dashboard, audit, valuation, etc.
│   ├── services/             # 50+ agentic_* services + rule-based services
│   ├── agents/               # Supervisor, CPA/CFA brains, tools
│   ├── llm/                  # provider, tool schema, callWithFallback
│   └── server.ts
├── scripts/                 # purge_audit_log, generateOpenAPI
├── frontend/                # Next.js (optional)
├── .env.example
├── package.json
└── README.md
```

---

## Docs

- `docs/REASONING_CHAIN.md` — Plan–Execute–Verify + codification
- `docs/CPA_CFA_CAPABILITY.md` — CPA/CFA capability matrix
- `docs/BYOD_ARCHITECTURE.md` — Bring Your Own Database
- `docs/AUDIT_AND_CONTROLS.md` — Zero-trust controls, deterministic totals
- `docs/PRODUCTION_AND_SOC2_CHECKLIST.md` — Deployment and SOC 2 checklist
