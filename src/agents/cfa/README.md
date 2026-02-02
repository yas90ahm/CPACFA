# Investment Analysis Agent (CFA)

DuPont Analysis, Competitor Benchmarking (Web Search), Monte Carlo liquidity, Skepticism Layer.

## 1. Analysis Framework — DuPont

- **ROE** = Net Profit Margin × Asset Turnover × Equity Multiplier  
  - Net Profit Margin = Net Income / Revenue  
  - Asset Turnover = Revenue / Total Assets  
  - Equity Multiplier = Total Assets / Shareholders' Equity  

Use `dupontAnalysis({ netIncome, revenue, totalAssets, shareholdersEquity })` or POST `/api/agents/cfa/analyze` with those fields.

## 2. Competitor Benchmarking

- If the user provides a **competitor ticker**, use the **Web Search** tool to pull latest 10-K / financials and perform **relative valuation (P/E, EV/EBITDA)**.
- The API accepts optional **`webSearchResult`**: the client (or another agent) runs Web Search for `{ticker} 10-K P/E EV EBITDA` and passes the result string; we parse P/E and EV/EBITDA from it.
- Alternatively inject a `webSearch` function that returns search result text (e.g. from a search API).

## 3. Risk Assessment — Monte Carlo

- **Monte Carlo simulation** for cash flow / liquidity forecasting.
- Inputs: `currentLiquidity`, `expectedGrowthRate`, `volatility`, optional `numSimulations` (default 10,000).
- Output: **Confidence Interval** for next year's liquidity (e.g. 5th, 50th, 95th percentile) and point estimate.

## 4. Auditor Mode — Skepticism Layer

- If a **specific account grows faster than revenue**, flag as **Potential Red Flag** for audit.
- Inputs: `accounts[]` (currentAmount, priorAmount or growthPercent), `revenueGrowthPercent`.
- Output: `skepticism.redFlags[]` with account name, account growth %, revenue growth %, message, severity (high/medium).

## API

**POST /api/agents/cfa/analyze**

Body (all optional; include what you need):

- `netIncome`, `revenue`, `totalAssets`, `shareholdersEquity` → DuPont
- `competitorTicker`, `webSearchResult` (or inject `webSearch`) → P/E, EV/EBITDA
- `currentLiquidity`, `expectedGrowthRate`, `volatility` → Monte Carlo liquidity CI
- `accounts`, `revenueGrowthPercent` → Skepticism Layer

Response: `dupont`, `competitorValuation`, `monteCarloLiquidity`, `skepticism`, `summary`.
