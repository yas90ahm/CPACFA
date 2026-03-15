/**
 * Budget versioning, reforecast workflow, and driver-based planning.
 */

export type BudgetStatus = 'draft' | 'locked' | 'archived';

export interface BudgetVersion {
  id: string;
  name: string; // e.g. "Board approved FY25", "Q2 reforecast"
  periodLabel: string; // e.g. "FY25", "Q2 FY25"
  status: BudgetStatus;
  lines: BudgetVersionLine[];
  createdAt: string; // ISO
  updatedAt: string;
  lockedAt?: string;
  lockedBy?: string;
}

export interface BudgetVersionLine {
  label: string;
  amount: string;
  category?: 'Revenue' | 'COGS' | 'OpEx' | 'Other';
  driverRef?: string; // optional link to driver (e.g. "headcount", "price")
}

export interface ReforecastInput {
  /** Latest actuals (snapshot or lines) */
  actualSnapshot: { revenue: number; costOfGoodsSold?: number; operatingExpenses?: number; netIncome: number; cash: number };
  /** Prior forecast or budget to re-base */
  priorBudgetVersionId?: string;
  priorBudgetLines?: { label: string; amount: number; category?: string }[];
  /** Period we're reforecasting (e.g. "Q3 FY25") */
  periodLabel: string;
  /** Optional driver overrides for agentic reforecast */
  driverOverrides?: Record<string, number>;
}

export interface ReforecastResult {
  periodLabel: string;
  lines: { label: string; amount: number; category?: string }[];
  narrative: string;
  driverAssumptions?: Record<string, number>;
}

export interface DriverInput {
  id: string;
  name: string; // e.g. "headcount", "price_per_unit", "volume"
  value: number;
  unit?: string; // e.g. "FTE", "USD"
}

export interface DriverBasedPlanInput {
  drivers: DriverInput[];
  /** Mapping: P&L line label → formula (e.g. "headcount * 120000" or "volume * price_per_unit") */
  formulas: Record<string, string>;
  periodLabel?: string;
}

export interface DriverBasedPlanResult {
  periodLabel: string;
  lines: { label: string; amount: number; source: string }[];
  driverValues: Record<string, number>;
}
