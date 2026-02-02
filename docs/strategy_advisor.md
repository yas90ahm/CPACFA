# CFA Brain — Proactive Advice Module (Individuals / SMEs)

The **Proactive Advice** module equips the CFA Brain with three pillars for individuals and small-to-medium enterprises (SMEs): **Tax Planning**, **Cash Buffer**, and **Spending Anomaly**. These run automatically or on demand to surface actionable recommendations.

---

## 1. Tax Planning

**Trigger:** When a **high tax liability** is detected (e.g. tax liability as a % of revenue or net income exceeds a threshold), the bot suggests common deductions to reduce taxable income.

**Logic:**
- **Detection:** Compare estimated tax liability (or current tax expense) to revenue and/or net income. Flag when effective rate is above a typical range (e.g. > 25–30% of net income for SMEs) or when absolute liability is material.
- **Suggestions:** Return a short list of common deductions and credits, with brief applicability:
  - **Section 179 (equipment / machinery):** Immediate expensing of qualifying equipment (e.g. machinery, software, vehicles under limits). "Consider Section 179 for qualifying equipment purchases to reduce taxable income in the current year."
  - **Home office deduction:** If applicable for sole proprietors / remote SMEs.
  - **Retirement contributions (SEP-IRA, Solo 401(k)):** Reduce taxable income and build retirement savings.
  - **Health savings account (HSA)** for eligible high-deductible plans.
  - **R&D / innovation credits** where applicable (e.g. Form 6765).
  - **Bonus depreciation** (when available) for new equipment.

**Output:** `{ highTaxDetected: boolean, effectiveRate?: number, suggestions: string[] }`

**Integration:** `proactive_advice.ts` — `computeTaxPlanningAdvice(taxLiability, revenue, netIncome)`.

---

## 2. Cash Buffer — Survival Metric & Ideal Cash Reserve

**Survival Metric:** Number of **months the user can last if revenue drops to zero**, using current cash and average monthly operating expenses (burn).

- **Formula:** `Survival Months = Cash / Monthly Burn`, where **Monthly Burn** = (Operating Expenses − Non-cash items) or simplified: total operating expenses per month.
- If monthly burn ≤ 0 (e.g. profitable and no burn), survival is reported as "N/A (positive cash flow)" or a large number; the module can still suggest an **Ideal Cash Reserve**.

**Ideal Cash Reserve:** Recommended minimum cash to hold (e.g. **3–6 months of operating expenses** for SMEs). The bot suggests a target amount and, if current cash is below it, a shortfall.

- **Formula:** `Ideal Reserve = Months × Monthly Burn` (e.g. 6 × monthly burn).
- **Output:** `idealReserveAmount`, `currentCash`, `shortfall` (if any), `suggestedMonths` (e.g. 6).

**Output:** `{ survivalMonths: number | null, monthlyBurn: number, idealReserveAmount: number, idealReserveMonths: number, currentCash: number, shortfall: number | null, message: string }`

**Integration:** `proactive_advice.ts` — `computeCashBufferAdvice(cash, monthlyBurn, idealMonths?)`.

---

## 3. Spending Anomaly — Top 3 Outlier Expenses

**Trigger:** Compare **this month's expenses by category** to the **previous month's average** (or prior month single period). Flag the **Top 3 outlier expenses** (largest positive variance vs. prior).

**Logic:**
- **Input:** Two lists of expense line items: `expensesThisMonth: { label, amount }[]`, `expensesPriorMonth: { label, amount }[]` (or prior-month average by category).
- **Match** line items by label/category (normalize labels for matching). For each category, compute:
  - **This month:** sum of amounts for that category.
  - **Prior month (or average):** sum of amounts for that category.
  - **Variance:** this month − prior; **Variance %:** (this − prior) / prior when prior ≠ 0.
- **Sort** by absolute variance (or by variance % above a threshold) and take the **Top 3** positive outliers (categories where spending increased the most).
- **Output:** List of 3 items: `{ label, amountThisMonth, amountPriorMonth, variance, variancePercent, message }`.

**Output:** `{ topOutliers: Array<{ label, amountThisMonth, amountPriorMonth, variance, variancePercent, message }>, summary?: string }`

**Integration:** `proactive_advice.ts` — `computeSpendingAnomalies(expensesThisMonth, expensesPriorMonth)`.

---

## 4. Combined Proactive Advice API

**Endpoint:** `POST /api/cfa/proactive-advice`

**Request body:**
- `cash`: number (current cash balance)
- `monthlyBurn`: number (average monthly operating expenses / burn)
- `taxLiability?`: number (current or estimated tax liability)
- `revenue?`: number (for effective rate)
- `netIncome?`: number (for effective rate)
- `expensesThisMonth`: `{ label: string, amount: number }[]`
- `expensesPriorMonth`: `{ label: string, amount: number }[]` (or prior-month average by category)

**Response:** `{ taxPlanning, cashBuffer, spendingAnomaly }` — each pillar’s output as above.

---

## 5. Summary Table

| Pillar            | Inputs                          | Outputs                                                                 |
|-------------------|----------------------------------|-------------------------------------------------------------------------|
| **Tax Planning**  | taxLiability, revenue, netIncome | highTaxDetected, suggestions (e.g. Section 179, retirement, HSA)        |
| **Cash Buffer**   | cash, monthlyBurn                | survivalMonths, idealReserveAmount, shortfall, message                  |
| **Spending Anomaly** | expensesThisMonth, expensesPriorMonth | topOutliers (top 3), summary                                          |

---

## 6. Integration with Codebase

- **Service:** `src/services/proactive_advice.ts` — `computeTaxPlanningAdvice()`, `computeCashBufferAdvice()`, `computeSpendingAnomalies()`, `runProactiveAdvice()`.
- **Route:** `src/routes/cfaAnalyst.ts` (or dedicated route) — `POST /api/cfa/proactive-advice` calling `runProactiveAdvice()`.
- **CFA Brain:** The Investment and Strategy Specialist (see `docs/cfa_specialist_brain.md`) can invoke Proactive Advice when the user uploads statements or asks for "advice", "tax tips", "cash buffer", or "spending review".

This document is the **governing logic** for the Proactive Advice module: **Tax Planning** (high tax → deductions), **Cash Buffer** (survival metric + ideal reserve), and **Spending Anomaly** (top 3 outlier expenses).
