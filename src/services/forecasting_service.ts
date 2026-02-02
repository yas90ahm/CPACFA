/**
 * Rolling 13-week cash forecast and quarterly/annual projections.
 */

export interface CashFlowItem {
  weekIndex?: number;
  periodLabel?: string;
  inflow: number;
  outflow: number;
  netFlow: number;
  openingBalance: number;
  closingBalance: number;
}

export interface Rolling13WeekInput {
  /** Opening cash balance (e.g. from latest bank or GL) */
  openingCashBalance: number;
  /** Known or estimated weekly inflows (length 1–13; pad with 0) */
  weeklyInflows?: number[];
  /** Known or estimated weekly outflows */
  weeklyOutflows?: number[];
  /** Start date (ISO) for period labels */
  startDate?: string;
}

export interface Rolling13WeekResult {
  periods: CashFlowItem[];
  openingBalance: number;
  closingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  minBalance: number;
  minBalanceWeekIndex?: number;
}

/**
 * Build rolling 13-week cash forecast.
 */
export function buildRolling13WeekCash(input: Rolling13WeekInput): Rolling13WeekResult {
  const opening = input.openingCashBalance ?? 0;
  const inflows = input.weeklyInflows ?? Array(13).fill(0);
  const outflows = input.weeklyOutflows ?? Array(13).fill(0);
  const start = input.startDate ? new Date(input.startDate) : new Date();
  const periods: CashFlowItem[] = [];
  let balance = opening;
  let totalIn = 0;
  let totalOut = 0;
  let minBalance = balance;
  let minBalanceWeekIndex = 0;

  for (let w = 0; w < 13; w++) {
    const inflow = inflows[w] ?? 0;
    const outflow = outflows[w] ?? 0;
    const net = inflow - outflow;
    totalIn += inflow;
    totalOut += outflow;
    const openingBal = balance;
    balance = balance + net;
    if (balance < minBalance) {
      minBalance = balance;
      minBalanceWeekIndex = w;
    }
    const weekStart = new Date(start);
    weekStart.setDate(weekStart.getDate() + w * 7);
    periods.push({
      weekIndex: w + 1,
      periodLabel: `Week ${w + 1} (${weekStart.toISOString().slice(0, 10)})`,
      inflow,
      outflow,
      netFlow: net,
      openingBalance: openingBal,
      closingBalance: balance,
    });
  }

  return {
    periods,
    openingBalance: opening,
    closingBalance: balance,
    totalInflows: totalIn,
    totalOutflows: totalOut,
    minBalance,
    minBalanceWeekIndex,
  };
}

export interface QuarterlyAnnualProjectionInput {
  /** Revenue assumption: base + growth % per period */
  baseRevenue: number;
  revenueGrowthPercentPerPeriod?: number;
  /** Operating expense (fixed + variable % of revenue) */
  fixedOpEx: number;
  variableOpExPercentOfRevenue?: number;
  /** Number of quarters to project */
  numQuarters?: number;
}

export interface QuarterlyAnnualProjectionResult {
  periods: { periodLabel: string; revenue: number; opEx: number; netIncome: number }[];
  totalRevenue: number;
  totalOpEx: number;
  totalNetIncome: number;
}

/**
 * Simple quarterly P&L projection (revenue growth, fixed + variable OpEx).
 */
export function buildQuarterlyAnnualProjection(
  input: QuarterlyAnnualProjectionInput
): QuarterlyAnnualProjectionResult {
  const numQuarters = input.numQuarters ?? 4;
  const growth = (input.revenueGrowthPercentPerPeriod ?? 0) / 100;
  const variablePct = (input.variableOpExPercentOfRevenue ?? 0) / 100;
  const periods: { periodLabel: string; revenue: number; opEx: number; netIncome: number }[] = [];
  let rev = input.baseRevenue ?? 0;
  let totalRevenue = 0;
  let totalOpEx = 0;

  for (let q = 0; q < numQuarters; q++) {
    const opEx = input.fixedOpEx + rev * variablePct;
    const netIncome = rev - opEx;
    periods.push({
      periodLabel: `Q${q + 1}`,
      revenue: rev,
      opEx,
      netIncome,
    });
    totalRevenue += rev;
    totalOpEx += opEx;
    rev = rev * (1 + growth);
  }

  return {
    periods,
    totalRevenue,
    totalOpEx,
    totalNetIncome: totalRevenue - totalOpEx,
  };
}
