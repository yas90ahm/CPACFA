# Roadmap Status — Where We Are and What’s Left

Based on **cpa_to_cfo_roadmap_f06c9b05.plan.md** and the current codebase (no README used).

---

## Option A — Staged Implementation

| Stage | Name | Status | Notes |
|-------|------|--------|--------|
| **Stage 1** | Core Agent Infrastructure | **Done** | LLM provider (Anthropic/OpenAI/Mistral), tool registry + schema, policy/semantic memory, guardrails, HITL staging. |
| **Stage 2** | CPA Statement Engine | **Done** | Full statement set (BS, P&L, Cash Flow, Equity Changes, Notes/Policies). Standards registry (ASPE, IFRS, FRS102, US GAAP). Evidence graph: line → source + codification. |
| **Stage 3** | CPA Controls & Auditability | **Done** | Gap analysis (agentic), reconciliation (TB/BS/CF/equity), audit binder (BS/P&L/CF/equity + line-level links), reconciliation summary, urgent To-Dos from gaps, HITL (staging, approval webhook, variance HITL confirm → semantic memory). |
| **Stage 4** | CFO Insight Layer | **Done** | KPIs (burn, runway, Rule of 40, ROIC, CCC, margins), MD&A (rule + agentic), variance (budget vs actual + multi-period + drivers + agentic refinement), sensitivity/scenario (pointed question + sandbox + report), scenario recommendation, board one-pager, KPI commentary, Lead Partner + CFO view. |
| **Stage 5** | Commercial Hardening | **Skipped** | Multi-tenant roles/permissions, SOC2/ISO audit logs, billing/usage metering. MCP server has RBAC; frontend has mock SOC2 audit log; core backend has no multi-tenant or billing. |

---

## Phases (Human CPA → Human CFO)

### Phase 0 — Foundation (Data & Compliance)

| Item | Status | Notes |
|------|--------|--------|
| Ingestion core | **Done** | xlsx/csv/pdf/json parsers, OCR, classification (bank/tax/TB/GL/AP/AR/payroll), routing, data cleaning. Bank transaction-level pipeline → TB cash + balance; AP/AR aging and payroll accrual pipelines. |
| Chart of Accounts mapping | **Done** | Account classifier, configurable mapping. |
| Standard selection | **Done** | ASPE/IFRS/FRS102 (and US_GAAP in registry); standard selector + policy memory. |
| Data quality checks | **Done** | Balancing, reconciliation; duplicate/outlier checks exist in quality_checks / ingestion. |

### Phase 1 — CPA Baseline (Statements + Compliance)

| Workstream | Status | Notes |
|------------|--------|--------|
| **W1 — Ingestion & normalization** | **Done** | GL/TB ✅. Bank: transaction-level → TB + balance ✅. AP/AR: aging pipelines ✅. Payroll: accrual-ready pipeline ✅. |
| **W2 — Standards inference (agentic)** | **Done** | Standard inference, confidence, policy memory; statements tagged with standard. |
| **W3 — Statement engine (full set)** | **Done** | BS, P&L, CF, Equity, Notes; cross-statement checks; standard-specific logic in registry/tools. |
| **W4 — CPA controls & evidence** | **Done** | Line-item provenance, audit binder, gap list → urgent To-Dos. |
| **W5 — Human-in-the-loop** | **Done** | Staging, approval webhook, variance HITL confirm; corrections in policy memory. |

**Phase 1 MVP success criteria:** Full statement set for ASPE/IFRS/FRS102 ✅. Standard chosen without hard-coding ✅. Audit trail + gap analysis ✅.

### Phase 2 — CPA Advanced (Close, Assurance, Governance)

| Item | Status | Notes |
|------|--------|--------|
| Month-end close automation | **Done** | Reconciliations + approval workflow ✅. JE suggestions, close checklist, period lock ✅. |
| Lease accounting | **Done** | IFRS 16 / lease liability (leaseLiabilityCalc, tools). |
| Revenue recognition | **Done** | Rules in registry (IFRS 15, ASPE, FRS102); applied via standard selector. |
| Controls | **Done** | HITL + staging ✅. Segregation of duties + immutable audit log in core ✅. |

### Phase 3 — CFO Baseline (Insights & KPIs)

| Item | Status |
|------|--------|
| KPI engine | **Done** |
| Narrative generation | **Done** |
| Budget vs actual | **Done** |

### Phase 4 — CFO Advanced (Planning & What-If)

| Item | Status | Notes |
|------|--------|--------|
| Scenario planning | **Done** | Revenue/cost/hiring; sensitivity report; scenario recommendation. |
| Forecasting | **Done** | Monte Carlo liquidity ✅. Rolling 13-week cash, quarterly/annual projections ✅. |
| Sensitivity & stress testing | **Done** | WACC/growth sensitivity; CFO what-if + sensitivity report. |
| Capital allocation | **Done** | DCF ✅. ROI, payback, portfolio ✅. |

### Phase 5 — CFO Enterprise (Advisory + Strategy)

| Item | Status |
|------|--------|
| M&A readiness (QoE, WC adjustments) | **Done** | QoE, WC adjustment APIs. |
| Financing packages (lender-ready, covenants) | **Done** | Covenant monitoring API. |
| Tax strategy & compliance | **Done** | Tax strategy API (jurisdictions, suggestions). |
| Advisory workflows (multi-client, SOC2) | **Partial** | SOC2 mock only; multi-tenant in Stage 5. |

---

## Plan frontmatter todos (in the .plan.md file)

The roadmap file’s YAML todos are still **pending** in the file; implementation is ahead of that:

| Todo ID | Content | Implementation status |
|---------|---------|------------------------|
| baseline-standards | Define ASPE/IFRS/FRS102 rule coverage per phase | **Done** — standards_registry + per-standard principles. |
| inputs-pipeline | Finalize input ingestion for Bank/GL/AP/AR/Payroll | **Partial** — GL/TB full; bank as balance only; AP/AR/Payroll classification + types, full pipelines TBD. |
| statements-core | Implement full statement set incl. Cash Flow & Equity | **Done**. |
| close-controls | Month-end close, reconciliation, HITL approvals | **Done** (reconciliation + HITL); month-end close automation partial. |
| cfo-insights | Build KPI, forecasting, and scenario modules | **Done** (KPI + scenario); forecasting partial. |

---

## Summary: What’s left

1. **Stage 5 / Commercial hardening** *(skipped per product scope)*  
   Multi-tenant roles and permissions, SOC2/ISO audit logs, billing/usage metering in the **core** product (MCP RBAC and frontend mock SOC2 are separate).

2. **Phase 0 / Phase 1 W1 — Bank and AP/AR/Payroll pipelines** — **Done**  
   - **Bank:** Transaction-level bank ingestion → normalized transactions + TB cash + balance (`bank_pipeline_service`, `POST /api/pipelines/bank`).  
   - **AP/AR/Payroll:** Canonical pipelines: AP/AR aging (`ap_ar_aging_service`, `/api/pipelines/ap-aging`, `/api/pipelines/ar-aging`), payroll accrual (`payroll_accrual_service`, `/api/pipelines/payroll-accrual`).

3. **Phase 2 — Month-end close and controls** — **Done**  
   - **Month-end close:** JE suggestions, close checklist, period lock (`month_end_close_service`, `period_lock_service`; `/api/close/je-suggestions`, `/api/close/checklist`, `/api/close/period-lock`).  
   - **Controls:** Segregation of duties and immutable audit log (`segregation_service`, `audit_log_service`; `/api/close/can-perform`, `/api/close/perform-action`, `/api/close/audit-log`).

4. **Phase 4 — Forecasting and capital allocation** — **Done**  
   - **Forecasting:** Rolling 13-week cash, quarterly/annual projections (`forecasting_service`; `/api/forecasting/13-week-cash`, `/api/forecasting/quarterly-annual`).  
   - **Capital allocation:** ROI, payback, portfolio (`capital_allocation_service`; `/api/capital/project-metrics`, `/api/capital/portfolio`).

5. **Phase 5 — Enterprise/advisory** — **Done**  
   M&A readiness (QoE, WC adjustment), covenant monitoring, tax strategy (`enterprise_m_and_a_financing_service`, `tax_strategy_service`; `/api/enterprise/quality-of-earnings`, `/api/enterprise/working-capital-adjustment`, `/api/enterprise/covenants`, `/api/enterprise/tax-strategy`).

---

## Agentic enhancements (post–Stage 4)

| Area | Enhancement | API / Service |
|------|-------------|--------------|
| Lead Partner + CFO | One-call unified board narrative (snapshot + variance/sensitivity → cfoView → Lead Partner CoT) | `POST /api/cfo-dashboard/lead-partner-view`; `lead_partner_cfo_view_service.ts` |
| Close | Agentic narrative for JE suggestions (gaps/reconciliation) | `POST /api/close/je-suggestions/explain`; `agentic_je_suggestions.ts` |
| Bank rec | Agentic summary for reconciliation result | `POST /api/pipelines/bank-rec` with `explain: true`; `POST /api/pipelines/bank-rec/explain`; `agentic_bank_rec_service.ts` |
| Covenants | Agentic commentary for debt/EBITDA and interest coverage headroom | `POST /api/enterprise/covenants` with `explain: true`; `POST /api/enterprise/covenants/explain`; `agentic_covenant_commentary.ts` |

---

## Where we are (one sentence)

**Option A Stages 1–4 are done; Phase 0–5 are done except Stage 5 (Commercial hardening) and multi-tenant/SOC2 in core, which are skipped.**

---

## Efficiency & Structure Plan (Implemented)

| Phase | What | Status |
|-------|------|--------|
| **A** | Dead code: remove duplicate control catalogue | **Done** — `control_catalogue_service.ts` removed; `close_controls_service.ts` is the single control catalogue. |
| **B** | In-memory store factory | **Done** — `src/lib/inMemoryStore.ts` (`createInMemoryStore`); migrated `pbc_service`, `close_controls_service`. |
| **C** | Route layer: async error middleware + validation helper | **Done** — `src/lib/asyncHandler.ts`, `src/lib/validateBody.ts`; HITL router uses `asyncHandler`. |
| **D** | LLM fallback abstraction | **Done** — `src/llm/callWithFallback.ts` (`callLLMWithFallback`); all agentic services migrated. |
| **E** | Request validation (Zod) | **Done** — `src/schemas/closeSchemas.ts` (e.g. `periodLockBodySchema`); period-lock route uses Zod. |
| **F** | Frontend API client | **Done** — `frontend/lib/apiClient.ts` (`apiJson`, `apiBlob`); `api.ts` uses it for JSON/Blob calls. |
| **G** | Service layout & naming | **Doc only** — Recommended layout below; no file moves to avoid import churn. |

### Recommended Service Layout (Phase G — future refactor)

- **close/** — period lock, checklist, JE suggestions, accruals, controls, reconciliation resolution, close adjustments, close calendar.
- **audit/** — binder, PBC, sampling, DRL, GAAP consistency, prior-period.
- **cfo/** — KPIs, variance, sensitivity, narrative, board one-pager, scenarios, KPI history/targets, narrative versions.
- **agentic/** — all `agentic_*` services (JE, covenant, bank rec, variance, MD&A, etc.).
- **pipelines/** — bank, AP/AR, payroll, bank rec by period.
- **forecasting/** — 13-week, cash flow forecast.
- **enterprise/** — M&A, covenants, tax, filing calendar.
- **ingestion/** — ingestion agent, classifier, file ingestion.
- Shared/domain-agnostic services stay at `src/services/` (e.g. `audit_log_service`, `hitl_orchestrator`).
- Naming: one concept, one name (e.g. control catalogue = `close_controls_service` only). Prefix by domain (`close_*`, `audit_*`, `agentic_*`).
