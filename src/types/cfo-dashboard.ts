/**
 * CFO Dashboard — MD&A narrative, KPIs, and Pointed Questions (sensitivity).
 */

/** Financial snapshot for MD&A and KPIs */
export interface CFOFinancialSnapshot {
  revenue: number;
  costOfGoodsSold?: number;
  operatingExpenses?: number;
  operatingIncome?: number;
  netIncome: number;
  totalAssets: number;
  totalLiabilities: number;
  totalEquity: number;
  cash: number;
  currentAssets?: number;
  currentLiabilities?: number;
  inventory?: number;
  accountsReceivable?: number;
  accountsPayable?: number;
  /** Prior period (e.g. prior year) for YoY and Rule of 40 growth */
  priorRevenue?: number;
  priorNetIncome?: number;
  /** Period label (e.g. "Q4 FY25") */
  periodLabel?: string;
}

/** MD&A style narrative sections */
export interface MDASection {
  title: string;
  content: string;
}

export interface MDANarrative {
  periodLabel: string;
  overview: string;
  sections: MDASection[];
  highlights: string[];
}

/** CFO Dashboard KPIs (Stage 4: burn, runway, margins, CCC, ROIC, rule of 40) */
export interface CFOKPIs {
  burnRate: number; // monthly net cash burn (positive = burn)
  runwayMonths: number; // cash / burn rate
  breakEvenRevenue?: number; // annual revenue at which net income = 0
  ruleOf40: number; // revenue growth % + profit margin % (SaaS)
  revenueGrowthPercent: number;
  profitMarginPercent: number;
  workingCapitalCycleDays: number; // CCC: DSO + DIO - DPO
  daysSalesOutstanding: number;
  daysInventoryOutstanding: number;
  daysPayablesOutstanding: number;
  grossMarginPercent: number;
  operatingMarginPercent: number;
  netMarginPercent: number;
  /** ROIC: return on invested capital (NOPAT / invested capital). Stage 4. */
  roicPercent?: number;
}

/** FW2: KPI target (e.g. runway 18 months, DSO 45 days) for variance to target */
export interface KPITarget {
  id: string;
  metric: 'runwayMonths' | 'daysSalesOutstanding' | 'daysPayablesOutstanding' | 'ruleOf40' | 'netMarginPercent' | string;
  targetValue: number;
  unit?: string; // e.g. "months", "days", "%"
  label?: string;
  createdAt: string;
}

/** Pointed-question sensitivity: e.g. "What if COGS increases by 15%?" */
export interface PointedQuestionSensitivityInput {
  question: string;
  snapshot: CFOFinancialSnapshot;
}

export interface MarginScenario {
  scenario: string;
  grossMarginPercent: number;
  operatingMarginPercent: number;
  netMarginPercent: number;
  revenue: number;
  cogs?: number;
  operatingExpenses?: number;
  netIncome?: number;
}

export interface PointedQuestionSensitivityResult {
  question: string;
  interpretedVariable: string; // e.g. "COGS"
  interpretedShock: string;   // e.g. "+15%"
  baseCase: MarginScenario;
  sensitivityCase: MarginScenario;
  delta: {
    grossMarginPercent: number;
    operatingMarginPercent: number;
    netMarginPercent: number;
  };
  narrative: string;
  chartData: { scenario: string; grossMargin: number; operatingMargin: number; netMargin: number }[];
}

// --- Budget vs Actual Variance (Stage 4) ---

/** Single budget line (category + planned amount) */
export interface BudgetLine {
  label: string;
  amount: number;
  /** Optional category for grouping (e.g. "Revenue", "COGS", "OpEx") */
  category?: 'Revenue' | 'COGS' | 'OpEx' | 'Other';
}

/** Single actual line (from TB/P&L) */
export interface ActualLine {
  label: string;
  amount: number;
  category?: 'Revenue' | 'COGS' | 'OpEx' | 'Other';
}

/** Driver attribution for a variance (volume vs price / mix) */
export interface VarianceDriver {
  type: 'volume' | 'price' | 'mix' | 'timing' | 'other';
  description: string;
  estimatedImpact?: number; // $ contribution to variance
}

/** One line-level variance with optional driver */
export interface VarianceLine {
  label: string;
  budget: number;
  actual: number;
  variance: number;       // actual - budget
  variancePercent: number; // (variance / |budget|) * 100, or 0 if budget = 0
  material: boolean;      // |variance| or |variancePercent| exceeds threshold
  drivers?: VarianceDriver[];
  category?: string;
}

export interface VarianceReport {
  periodLabel: string;
  generatedAt: string;    // ISO
  lines: VarianceLine[];
  totalBudget: number;
  totalActual: number;
  totalVariance: number;
  totalVariancePercent: number;
  materialCount: number;
  summaryNarrative: string;
  /** FW2: which budget this variance is "vs" */
  budgetVersionId?: string;
  budgetVersionLabel?: string;
  /** FW2: actuals source (e.g. TB as at period end) */
  actualsSource?: string;
  actualsPeriodLabel?: string;
}

// --- Sensitivity Report (structured what-if artifact, Stage 4) ---

export interface SensitivityScenarioSpec {
  /** Natural language (e.g. "What if COGS increases by 15%?") */
  question?: string;
  /** Strategic sandbox: revenue change % */
  revenueChangePercent?: number;
  /** Strategic sandbox: new hires */
  newEmployeeCount?: number;
  newEmployeeSalary?: number;
}

export interface SensitivityScenarioResult {
  name: string;
  assumption: string;
  baseKpis: { burnRate: number; runwayMonths: number; breakEvenRevenue?: number };
  scenarioKpis: { burnRate: number; runwayMonths: number; breakEvenRevenue?: number };
  delta: { burnRate: number; runwayMonths: number; breakEvenRevenue?: number };
  marginScenario?: MarginScenario;
  baseMargin?: MarginScenario;
}

export interface SensitivityReport {
  periodLabel: string;
  generatedAt: string;
  baseSnapshot: CFOFinancialSnapshot;
  scenarios: SensitivityScenarioResult[];
  summaryNarrative: string;
}

// --- Multi-period variance (period A vs period B actuals) ---

export interface MultiPeriodVarianceReport {
  periodALabel: string;
  periodBLabel: string;
  generatedAt: string;
  lines: VarianceLine[];
  totalPeriodA: number;
  totalPeriodB: number;
  totalVariance: number;
  totalVariancePercent: number;
  materialCount: number;
  summaryNarrative: string;
}

// --- HITL for material variances (confirm driver / add comment, store in semantic memory) ---

export interface VarianceHITLItem {
  label: string;
  budget: number;
  actual: number;
  variance: number;
  variancePercent: number;
  suggestedDriver?: VarianceDriver;
  /** Set when user confirms; stored in semantic memory */
  confirmedDriver?: string;
  confirmedComment?: string;
  confirmedAt?: string;
}

export interface VarianceHITLConfirmation {
  reportPeriodLabel: string;
  lineLabel: string;
  confirmedDriver?: string;
  confirmedComment?: string;
}

/** FW4: Saved scenario (Base, Upside, Downside) for side-by-side comparison */
export interface SavedScenario {
  id: string;
  name: string;
  periodLabel: string;
  snapshot: CFOFinancialSnapshot;
  kpis?: CFOKPIs;
  sensitivityResult?: unknown;
  createdAt: string;
}
