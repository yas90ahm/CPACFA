/**
 * CFA Brain — Proactive Advice module for individuals/SMEs.
 * 1. Tax Planning: high tax liability → suggest common deductions (e.g. Section 179).
 * 2. Cash Buffer: Survival Metric (months if revenue drops to zero) + Ideal Cash Reserve.
 * 3. Spending Anomaly: Top 3 outlier expenses this month vs previous month average.
 */

// --- Tax Planning ---

export interface TaxPlanningAdvice {
  highTaxDetected: boolean;
  effectiveRate?: number;
  suggestions: string[];
  message: string;
}

const HIGH_TAX_RATE_THRESHOLD = 0.25; // 25% of net income
const HIGH_TAX_REVENUE_THRESHOLD = 0.15; // 15% of revenue

const COMMON_DEDUCTIONS = [
  {
    name: 'Section 179',
    description: 'Immediate expensing of qualifying equipment (machinery, software, vehicles under limits). Consider Section 179 for qualifying equipment purchases to reduce taxable income in the current year.',
  },
  {
    name: 'Retirement contributions (SEP-IRA, Solo 401(k))',
    description: 'Reduce taxable income and build retirement savings. Contributions are typically deductible.',
  },
  {
    name: 'Health Savings Account (HSA)',
    description: 'If you have an eligible high-deductible health plan, HSA contributions are tax-deductible and grow tax-free.',
  },
  {
    name: 'Home office deduction',
    description: 'For sole proprietors and SMEs with a dedicated home office, a portion of rent, utilities, and insurance may be deductible.',
  },
  {
    name: 'R&D / innovation credits',
    description: 'Qualified research expenses may qualify for federal (and state) R&D credits (e.g. Form 6765).',
  },
  {
    name: 'Bonus depreciation',
    description: 'When available, bonus depreciation allows accelerated deduction for new qualifying assets.',
  },
];

export function computeTaxPlanningAdvice(
  taxLiability: number,
  revenue?: number,
  netIncome?: number
): TaxPlanningAdvice {
  const suggestions: string[] = [];
  let effectiveRate: number | undefined;
  let highTaxDetected = false;

  if (netIncome != null && netIncome > 0 && taxLiability > 0) {
    effectiveRate = taxLiability / netIncome;
    if (effectiveRate >= HIGH_TAX_RATE_THRESHOLD) {
      highTaxDetected = true;
    }
  }
  if (revenue != null && revenue > 0 && taxLiability > 0 && !highTaxDetected) {
    const rateOnRevenue = taxLiability / revenue;
    if (rateOnRevenue >= HIGH_TAX_REVENUE_THRESHOLD) {
      highTaxDetected = true;
      effectiveRate = rateOnRevenue;
    }
  }

  if (highTaxDetected) {
    suggestions.push(
      ...COMMON_DEDUCTIONS.slice(0, 4).map((d) => `${d.name}: ${d.description}`)
    );
  } else if (taxLiability > 0) {
    suggestions.push(
      COMMON_DEDUCTIONS[0].name + ': ' + COMMON_DEDUCTIONS[0].description
    );
  }

  const message =
    highTaxDetected && effectiveRate != null
      ? `High tax liability detected (effective rate ${(effectiveRate * 100).toFixed(1)}%). Consider the deductions above to reduce taxable income.`
      : taxLiability > 0
        ? 'Review common deductions (e.g. Section 179, retirement contributions) to optimize tax position.'
        : 'No tax liability data provided; upload statements to get tax planning suggestions.';

  return {
    highTaxDetected,
    effectiveRate,
    suggestions,
    message,
  };
}

// --- Cash Buffer (Survival Metric + Ideal Reserve) ---

export interface CashBufferAdvice {
  survivalMonths: number | null;
  monthlyBurn: number;
  idealReserveAmount: number;
  idealReserveMonths: number;
  currentCash: number;
  shortfall: number | null;
  message: string;
}

const DEFAULT_IDEAL_RESERVE_MONTHS = 6;

export function computeCashBufferAdvice(
  cash: number,
  monthlyBurn: number,
  idealMonths: number = DEFAULT_IDEAL_RESERVE_MONTHS
): CashBufferAdvice {
  const survivalMonths =
    monthlyBurn > 0 && cash >= 0 ? cash / monthlyBurn : null;
  const idealReserveAmount = monthlyBurn * idealMonths;
  const shortfall =
    cash < idealReserveAmount ? idealReserveAmount - cash : null;

  let message: string;
  if (monthlyBurn <= 0) {
    message =
      'No monthly burn (positive cash flow). Consider maintaining an ideal cash reserve of 3–6 months of typical operating expenses for contingencies.';
  } else if (survivalMonths != null) {
    message = `Survival metric: you can operate for approximately ${survivalMonths.toFixed(1)} months if revenue drops to zero (cash ÷ monthly burn). `;
    if (shortfall != null && shortfall > 0) {
      message += `Ideal cash reserve (${idealMonths} months of expenses): $${formatNum(idealReserveAmount)}. Shortfall: $${formatNum(shortfall)}. Consider building reserves.`;
    } else {
      message += `Ideal cash reserve (${idealMonths} months): $${formatNum(idealReserveAmount)}. You are at or above the suggested reserve.`;
    }
  } else {
    message =
      'Insufficient data for survival metric. Provide cash and monthly burn (operating expenses) for a cash buffer assessment.';
  }

  return {
    survivalMonths,
    monthlyBurn,
    idealReserveAmount,
    idealReserveMonths: idealMonths,
    currentCash: cash,
    shortfall,
    message,
  };
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(2) + 'k';
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}

// --- Spending Anomaly (Top 3 Outliers) ---

export interface ExpenseLine {
  label: string;
  amount: number;
}

export interface SpendingOutlier {
  label: string;
  amountThisMonth: number;
  amountPriorMonth: number;
  variance: number;
  variancePercent: number;
  message: string;
}

export interface SpendingAnomalyAdvice {
  topOutliers: SpendingOutlier[];
  summary: string;
}

function _normalizeLabel(label: string): string {
  return (label || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

function _groupByLabel(
  lines: ExpenseLine[]
): Map<string, { total: number; displayLabel: string }> {
  const out = new Map<string, { total: number; displayLabel: string }>();
  for (const { label, amount } of lines) {
    const n = _normalizeLabel(label);
    const existing = out.get(n);
    if (existing) {
      existing.total += amount;
    } else {
      out.set(n, { total: amount, displayLabel: label.trim() || n });
    }
  }
  return out;
}

export function computeSpendingAnomalies(
  expensesThisMonth: ExpenseLine[],
  expensesPriorMonth: ExpenseLine[]
): SpendingAnomalyAdvice {
  const thisMonth = _groupByLabel(expensesThisMonth);
  const priorMonth = _groupByLabel(expensesPriorMonth);

  const candidates: SpendingOutlier[] = [];
  const allKeys = new Set([...thisMonth.keys(), ...priorMonth.keys()]);

  for (const key of allKeys) {
    const thisEntry = thisMonth.get(key);
    const priorEntry = priorMonth.get(key);
    const amountThis = thisEntry?.total ?? 0;
    const amountPrior = priorEntry?.total ?? 0;
    const variance = amountThis - amountPrior;
    if (variance <= 0) continue;
    const variancePercent =
      amountPrior !== 0 ? (variance / amountPrior) * 100 : (amountThis > 0 ? 100 : 0);
    const displayLabel = thisEntry?.displayLabel ?? priorEntry?.displayLabel ?? key;
    candidates.push({
      label: displayLabel,
      amountThisMonth: amountThis,
      amountPriorMonth: amountPrior,
      variance,
      variancePercent,
      message: `Spending on "${displayLabel}" increased by $${formatNum(variance)} (${variancePercent.toFixed(0)}%) vs prior month.`,
    });
  }

  const topOutliers = candidates
    .sort((a, b) => b.variance - a.variance)
    .slice(0, 3);

  const summary =
    topOutliers.length === 0
      ? 'No significant spending increases vs prior month.'
      : `Top ${topOutliers.length} outlier expense(s) this month vs prior: ${topOutliers.map((o) => o.label).join(', ')}. Review for one-time vs recurring items.`;

  return { topOutliers, summary };
}

// --- Combined Proactive Advice ---

export interface ProactiveAdviceInput {
  cash: number;
  monthlyBurn: number;
  taxLiability?: number;
  revenue?: number;
  netIncome?: number;
  expensesThisMonth?: ExpenseLine[];
  expensesPriorMonth?: ExpenseLine[];
  idealReserveMonths?: number;
}

export interface ProactiveAdviceOutput {
  taxPlanning: TaxPlanningAdvice;
  cashBuffer: CashBufferAdvice;
  spendingAnomaly: SpendingAnomalyAdvice;
}

export function runProactiveAdvice(input: ProactiveAdviceInput): ProactiveAdviceOutput {
  const taxPlanning = computeTaxPlanningAdvice(
    input.taxLiability ?? 0,
    input.revenue,
    input.netIncome
  );
  const cashBuffer = computeCashBufferAdvice(
    input.cash,
    input.monthlyBurn,
    input.idealReserveMonths ?? DEFAULT_IDEAL_RESERVE_MONTHS
  );
  const spendingAnomaly = computeSpendingAnomalies(
    input.expensesThisMonth ?? [],
    input.expensesPriorMonth ?? []
  );

  return {
    taxPlanning,
    cashBuffer,
    spendingAnomaly,
  };
}
