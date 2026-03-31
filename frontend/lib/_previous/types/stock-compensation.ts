export interface VestingScheduleEntry {
  date: string;
  shares: number;
  vested: boolean;
}

export interface StockGrant {
  id: string;
  grantDate: string;
  grantType: 'rsu' | 'option' | 'espp' | 'sar';
  recipientId?: string;
  recipientName?: string;
  sharesGranted: number;
  grantPrice?: string;
  fairValuePerShare?: string;
  vestingType: 'time' | 'performance' | 'market';
  vestingSchedule: VestingScheduleEntry[];
  expirationDate?: string;
  status: 'active' | 'vested' | 'forfeited' | 'exercised';
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface StockValuation {
  id: string;
  grantId: string;
  valuationDate: string;
  method: 'black_scholes' | 'grant_date_price' | 'monte_carlo';
  fairValuePerShare: string;
  parameters?: { volatility?: number; riskFreeRate?: number; expectedTerm?: number; dividendYield?: number };
  createdAt: string;
}

export interface StockExpense {
  id: string;
  grantId: string;
  periodLabel: string;
  expenseAmount: string;
  cumulativeExpense: string;
  sharesVested: number;
  createdAt: string;
}

export interface CompensationSummary {
  periodLabel: string;
  totalExpense: string;
  byGrantType: Record<string, string>;
  grantCount: number;
}
