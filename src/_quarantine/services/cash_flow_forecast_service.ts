/**
 * FW3: Cash flow forecast (first-class) — opening + receipts − disbursements by period with optional source breakdown.
 */

export interface CashFlowForecastPeriod {
  periodLabel: string;
  openingBalance: number;
  receipts: number;
  disbursements: number;
  netFlow: number;
  closingBalance: number;
  /** Optional source breakdown (e.g. AR collections, AP payments, payroll) */
  receiptSources?: Record<string, number>;
  disbursementSources?: Record<string, number>;
}

export interface CashFlowForecast {
  id: string;
  periodLabel: string; // e.g. "2025-Q1" or "Jan 2025"
  periods: CashFlowForecastPeriod[];
  openingBalance: number;
  totalReceipts: number;
  totalDisbursements: number;
  closingBalance: number;
  createdAt: string;
}

export interface CashFlowForecastInput {
  openingBalance: number;
  periods: {
    periodLabel: string;
    receipts: number;
    disbursements: number;
    receiptSources?: Record<string, number>;
    disbursementSources?: Record<string, number>;
  }[];
}

const store = new Map<string, CashFlowForecast>();

function nextId(): string {
  return `cff-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export function createCashFlowForecast(input: CashFlowForecastInput): CashFlowForecast {
  const id = nextId();
  const now = new Date().toISOString();
  let balance = input.openingBalance;
  const periods: CashFlowForecastPeriod[] = [];
  let totalReceipts = 0;
  let totalDisbursements = 0;

  for (const p of input.periods) {
    const receipts = p.receipts ?? 0;
    const disbursements = p.disbursements ?? 0;
    const netFlow = receipts - disbursements;
    totalReceipts += receipts;
    totalDisbursements += disbursements;
    const openingBal = balance;
    balance = balance + netFlow;
    periods.push({
      periodLabel: p.periodLabel,
      openingBalance: openingBal,
      receipts,
      disbursements,
      netFlow,
      closingBalance: balance,
      receiptSources: p.receiptSources,
      disbursementSources: p.disbursementSources,
    });
  }

  const forecast: CashFlowForecast = {
    id,
    periodLabel: input.periods[0]?.periodLabel ?? 'Current',
    periods,
    openingBalance: input.openingBalance,
    totalReceipts,
    totalDisbursements,
    closingBalance: balance,
    createdAt: now,
  };
  store.set(id, forecast);
  return { ...forecast };
}

export function getCashFlowForecast(id: string): CashFlowForecast | undefined {
  const f = store.get(id);
  return f ? { ...f } : undefined;
}

export function listCashFlowForecasts(params?: { periodLabel?: string; limit?: number }): CashFlowForecast[] {
  let list = Array.from(store.values());
  if (params?.periodLabel) list = list.filter((f) => f.periodLabel === params.periodLabel);
  list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const limit = params?.limit ?? 50;
  return list.slice(0, limit).map((f) => ({ ...f }));
}
