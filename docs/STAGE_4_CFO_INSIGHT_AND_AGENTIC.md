# Stage 4: CFO Insight Layer — Implementation & Agentic AI

## Implemented (Stage 4)

### 1. KPIs (incl. ROIC)
- **Type**: `CFOKPIs` in `src/types/cfo-dashboard.ts` includes `roicPercent`.
- **Service**: `computeCFOKPIs` in `src/services/executive_summarizer.ts` computes ROIC as Net Income / (Total Equity + Total Liabilities) × 100.
- **API**: `POST /api/cfo-dashboard/kpis` — returns burn rate, runway, Rule of 40, working capital cycle, margins, ROIC.

### 2. Variance Analysis (Budget vs Actual + Drivers)
- **Types**: `BudgetLine`, `ActualLine`, `VarianceLine`, `VarianceReport`, `VarianceDriver` in `src/types/cfo-dashboard.ts`.
- **Service**: `src/services/variance_analysis_service.ts`
  - `buildVarianceAnalysis(budgetLines, actualLines, options)` — line-level variance $ and %, material flag (threshold % or $), optional driver attribution (volume/price/mix/timing/other).
  - `snapshotToLines(snapshot)` — build budget/actual lines from CFO snapshots (revenue, COGS, OpEx).
- **API**: `POST /api/cfo-dashboard/variance`
  - Body: `{ budget, actual }` (arrays of `{ label, amount, category? }`) or `{ budgetSnapshot, actualSnapshot }` plus optional `options` (`materialThresholdPercent`, `materialThresholdAmount`, `periodLabel`).
  - Optional `explain: true` — returns `{ report, narrative }` with LLM-generated explanation.

- **API**: `POST /api/cfo-dashboard/variance/explain` — agentic narrative for an existing variance report (body: full `VarianceReport`).

### 3. Sensitivity Report (Structured What-If Artifact)
- **Types**: `SensitivityScenarioSpec`, `SensitivityScenarioResult`, `SensitivityReport` in `src/types/cfo-dashboard.ts`.
- **Service**: `src/services/sensitivity_report_service.ts`
  - `buildSensitivityReport(baseSnapshot, scenarioSpecs, options)` — runs each spec: pointed question (e.g. "What if COGS +15%?") or strategic sandbox (revenue change %, new hires); aggregates into one report with base vs scenario KPIs and deltas.
- **API**: `POST /api/cfo-dashboard/sensitivity-report`
  - Body: `{ snapshot, scenarios: [ { question? } | { revenueChangePercent?, newEmployeeCount?, newEmployeeSalary? } ], periodLabel?, explain? }`.
  - Optional `explain: true` — returns `{ report, narrative }` with LLM interpretation.
- **API**: `POST /api/cfo-dashboard/sensitivity-report/interpret` — agentic narrative for an existing sensitivity report.

### 4. Agentic MD&A Narrative
- **Service**: `src/services/agentic_mda_service.ts`
  - `generateMDANarrativeAgentic({ snapshot, kpis, templateNarrative?, periodLabel })` — calls LLM to produce/enrich MD&A (overview, sections, highlights); falls back to rule-based `generateMDANarrative` if LLM fails.
- **API**: `POST /api/cfo-dashboard/narrative/agentic` — body: `{ snapshot, templateNarrative?, periodLabel }`; returns `{ narrative, kpis }`.

### 5. Agentic Variance Explanation & Scenario Interpretation
- **Service**: `src/services/agentic_variance_explainer.ts`
  - `explainVarianceAgentic(report)` — short narrative for budget vs actual (material lines + drivers).
  - `explainScenarioAgentic(result)` — interpretation of a single pointed-question sensitivity result.
  - `explainSensitivityReportAgentic(report)` — interpretation of full sensitivity report (multiple scenarios).
- **APIs**:
  - `POST /api/cfo-dashboard/variance/explain` — body: variance `report`.
  - `POST /api/cfo-dashboard/pointed-question/interpret` — body: pointed-question `result`.
  - `POST /api/cfo-dashboard/sensitivity-report/interpret` — body: sensitivity `report`.

---

## Where Agentic AI Is Used (Stage 4)

| Area | What | Fallback |
|------|------|----------|
| MD&A | LLM generates/enriches overview, sections, highlights | Rule-based `generateMDANarrative` |
| Variance | LLM explains material variances and drivers | `report.summaryNarrative` |
| Pointed question | LLM interprets single sensitivity result | `result.narrative` |
| Sensitivity report | LLM summarizes multi-scenario takeaways | `report.summaryNarrative` |

All agentic calls use `generateText` from `src/llm/provider.js` (Anthropic/OpenAI/Mistral). No tool use in these flows; output is narrative or JSON (MD&A) parsed with a safe fallback.

---

## Implemented: All 8 Agentic AI Recommendations

1. **Variance driver refinement**  
   - **Service**: `src/services/agentic_variance_drivers.ts` — `refineVarianceDriversAgentic(report.lines)`, `mergeRefinedDriversIntoLines(lines, refined)`.  
   - **API**: `POST /api/cfo-dashboard/variance/drivers/refine` (body: variance report); `POST /api/cfo-dashboard/variance` with `useAgenticDrivers: true` to refine drivers in-line.

2. **Sensitivity question parsing**  
   - **Service**: `src/services/agentic_sensitivity_parser.ts` — `parsePointedQuestionAgentic(question)`.  
   - **Integration**: `runPointedQuestionSensitivityAsync({ question, snapshot, useAgenticParser: true })`; tries LLM first, falls back to regex.  
   - **API**: `POST /api/cfo-dashboard/pointed-question` with `useAgenticParser: true`.

3. **KPI commentary**  
   Add an optional agentic “KPI commentary” that explains why burn/runway/Rule of 40 changed vs prior period, using snapshot + prior snapshot.

4. **Scenario recommendation**  
   Given snapshot and goals (e.g. “reach 18 months runway”), an agent could propose scenario specs (revenue uplift %, hiring freeze) and call `buildSensitivityReport` to show impact.

5. **Board-ready one-pager**  
   - **Service**: `src/services/agentic_board_one_pager.ts` — `generateBoardOnePagerAgentic({ snapshot, kpis, mdaNarrative?, varianceReport?, sensitivityReport? })`.  
   - **API**: `POST /api/cfo-dashboard/board-one-pager`.

6. **Human-in-the-loop for material variances**  
   For variances above a threshold, trigger HITL (e.g. “Confirm driver” or “Add comment”) and store in semantic memory; agentic narrative could later reference “management confirmed …”.

7. **Multi-period variance**  
   - **Service**: `buildMultiPeriodVariance(periodALines, periodBLines, options)`; `explainMultiPeriodVarianceAgentic(report)`.  
   - **API**: `POST /api/cfo-dashboard/variance/multi-period` (optional `explain`).

8. **Integration with Lead Partner**  
   - **Service**: `buildCfoViewFromSnapshotAndReports` in `src/services/lead_partner_cfo_view_service.ts` builds `cfoView` (narrative, varianceSummary, sensitivitySummary) from snapshot and optional variance/sensitivity reports.  
   - **API**: `POST /api/cfo-dashboard/lead-partner-view` — one-call: body `{ query, snapshot, varianceReport?, sensitivityReport?, periodLabel? }`; builds cfoView and calls Lead Partner CoT; returns unified board narrative (CFO view + CPA/CFA).  
   - The orchestrator `POST /api/orchestrator/lead-partner` still accepts `cfoView` directly when the client has pre-built narrative/summaries.  
   (Removed duplicate: Feed CFO narrative + variance + sensitivity into the Lead Partner CoT so conflict/variance notes can reference “CFO view” vs “CPA/CFA view” and produce a unified board narrative.

---

## Additional agentic enhancements (close, bank rec, covenants)

| Area | What | Fallback |
|------|------|----------|
| JE suggestions | LLM narrative summarizing suggested adjustments from gaps/reconciliation | Short rule-based sentence |
| Bank reconciliation | LLM summary of matched/unmatched/difference for close file | Rule-based one-liner |
| Covenant monitoring | LLM interpretation of headroom and breach for board/lender | Rule-based compliance/breach sentence |

- **APIs**: `POST /api/close/je-suggestions/explain` (body: `{ suggestions }`); `POST /api/pipelines/bank-rec` with `explain: true` or `POST /api/pipelines/bank-rec/explain`; `POST /api/enterprise/covenants` with `explain: true` or `POST /api/enterprise/covenants/explain`.
