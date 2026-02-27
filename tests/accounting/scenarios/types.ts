// tests/accounting/scenarios/types.ts — Interfaces for accounting accuracy test scenarios

export interface AccountSpec {
  code: string;
  name: string;           // keyword-aware name for classifier
  category: 'asset' | 'liability' | 'equity' | 'revenue' | 'expense';
  debit: string;          // Decimal string, e.g. "50000.00"
  credit: string;         // Decimal string
}

export interface AJELineSpec {
  accountRef: string;     // account code
  debit: number;
  credit: number;
  description?: string;
}

export interface AJESpec {
  memo: string;
  lines: AJELineSpec[];
}

export interface ExpectedLineItem {
  name: string;           // case-insensitive match
  amount: string;         // exact Decimal string match
  statement: 'balance_sheet' | 'income_statement' | 'cash_flow' | 'equity_changes';
}

export interface ExpectedTotals {
  totalAssets: string;
  totalLiabilities: string;
  totalEquity: string;
  totalRevenue: string;
  totalExpenses: string;
  netIncome: string;
}

export interface ExpectedCashFlow {
  endingCash?: string;
  netChangeInCash?: string;
}

export interface ExpectedVariances {
  lines: { fsLineId: string; changeAmount: string; changePercent: string | null }[];
}

export interface ExpectedOutputs {
  totals: ExpectedTotals;
  lineItems?: ExpectedLineItem[];
  cashFlow?: ExpectedCashFlow;
  variances?: ExpectedVariances;
  balanceSheetEquation?: boolean;  // if true, verify A = L + E
  expectError?: { status: number; code?: string };
}

export interface ScenarioDef {
  id: number;
  name: string;
  group: string;
  entityId: string;
  period: string;         // YYYY-MM
  accounts: AccountSpec[];
  ajes?: AJESpec[];
  priorPeriod?: {
    period: string;
    accounts: AccountSpec[];
  };
  expected: ExpectedOutputs;
  skipReason?: string;
}
