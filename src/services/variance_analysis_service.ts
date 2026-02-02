/**
 * CFO Dashboard — Budget vs Actual variance analysis with optional driver attribution (Stage 4).
 * Computes line-level variances, flags material items, and assigns simple drivers (volume/price/timing).
 */

import type {
  BudgetLine,
  ActualLine,
  VarianceReport,
  VarianceLine,
  VarianceDriver,
  MultiPeriodVarianceReport,
} from '../types/cfo-dashboard.js';

export interface VarianceAnalysisOptions {
  /** Flag variance as material if |variancePercent| >= this (default 5) */
  materialThresholdPercent?: number;
  /** Flag variance as material if |variance| >= this (optional $ threshold) */
  materialThresholdAmount?: number;
  /** Match budget and actual lines by normalized label (default true) */
  matchByLabel?: boolean;
  /** Include simple driver attribution when possible (default true) */
  includeDrivers?: boolean;
  /** Use LLM to refine/classify drivers (async; set useAgenticDrivers and call refineDriversAndMerge separately if needed) */
  useAgenticDrivers?: boolean;
  periodLabel?: string;
  /** FW2: which budget version this variance is "vs" */
  budgetVersionId?: string;
  budgetVersionLabel?: string;
  /** FW2: actuals source (e.g. "TB as at 31 Jan") */
  actualsSource?: string;
  actualsPeriodLabel?: string;
}

function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[^\w\s]/g, '')
    .trim();
}

function inferDriver(variance: number, budget: number, label: string): VarianceDriver | undefined {
  if (variance === 0) return undefined;
  const category = label.toLowerCase();
  if (/revenue|sales/i.test(category)) {
    return {
      type: 'volume',
      description: 'Variance likely driven by volume or pricing change.',
      estimatedImpact: variance,
    };
  }
  if (/cogs|cost of goods|direct cost/i.test(category)) {
    return {
      type: variance > 0 ? 'price' : 'volume',
      description: variance > 0 ? 'Higher cost per unit or input prices.' : 'Lower volume or cost savings.',
      estimatedImpact: variance,
    };
  }
  if (/opex|operating expense|salary|payroll|rent/i.test(category)) {
    return {
      type: 'timing',
      description: 'Timing of accruals or one-time items may explain variance.',
      estimatedImpact: variance,
    };
  }
  return {
    type: 'other',
    description: 'Review line item for specific drivers.',
    estimatedImpact: variance,
  };
}

/**
 * Build a variance report from budget and actual line items.
 * Matches lines by normalized label; unmatched lines appear as single-line variances (budget 0 or actual 0).
 */
export function buildVarianceAnalysis(
  budgetLines: BudgetLine[],
  actualLines: ActualLine[],
  options: VarianceAnalysisOptions = {}
): VarianceReport {
  const {
    materialThresholdPercent = 5,
    materialThresholdAmount,
    matchByLabel = true,
    includeDrivers = true,
    periodLabel = 'Current Period',
    budgetVersionId,
    budgetVersionLabel,
    actualsSource,
    actualsPeriodLabel,
  } = options;

  const budgetMap = new Map<string, BudgetLine>();
  for (const b of budgetLines) {
    const key = matchByLabel ? normalizeLabel(b.label) : b.label;
    if (!budgetMap.has(key)) budgetMap.set(key, { ...b, amount: 0 });
    const existing = budgetMap.get(key)!;
    existing.amount += b.amount;
  }

  const actualMap = new Map<string, ActualLine>();
  for (const a of actualLines) {
    const key = matchByLabel ? normalizeLabel(a.label) : a.label;
    if (!actualMap.has(key)) actualMap.set(key, { ...a, amount: 0 });
    const existing = actualMap.get(key)!;
    existing.amount += a.amount;
  }

  const allKeys = new Set([...budgetMap.keys(), ...actualMap.keys()]);
  const lines: VarianceLine[] = [];

  for (const key of allKeys) {
    const budget = budgetMap.get(key);
    const actual = actualMap.get(key);
    const budgetAmount = budget?.amount ?? 0;
    const actualAmount = actual?.amount ?? 0;
    const label = budget?.label ?? actual?.label ?? key;
    const category = budget?.category ?? actual?.category;

    const variance = actualAmount - budgetAmount;
    const variancePercent =
      budgetAmount !== 0 ? (variance / Math.abs(budgetAmount)) * 100 : (actualAmount !== 0 ? 100 : 0);

    const materialByPercent = Math.abs(variancePercent) >= materialThresholdPercent;
    const materialByAmount =
      materialThresholdAmount != null && Math.abs(variance) >= materialThresholdAmount;
    const material = materialByPercent || materialByAmount;

    const drivers: VarianceDriver[] | undefined =
      includeDrivers && variance !== 0 ? [inferDriver(variance, budgetAmount, label)!].filter(Boolean) : undefined;

    lines.push({
      label,
      budget: budgetAmount,
      actual: actualAmount,
      variance,
      variancePercent,
      material,
      drivers,
      category,
    });
  }

  // Sort by absolute variance descending
  lines.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));

  const totalBudget = lines.reduce((s, l) => s + l.budget, 0);
  const totalActual = lines.reduce((s, l) => s + l.actual, 0);
  const totalVariance = totalActual - totalBudget;
  const totalVariancePercent = totalBudget !== 0 ? (totalVariance / Math.abs(totalBudget)) * 100 : 0;
  const materialCount = lines.filter((l) => l.material).length;

  const summaryNarrative =
    `Budget vs actual for ${periodLabel}: total budget $${formatNum(totalBudget)}, actual $${formatNum(totalActual)} ` +
    `(variance ${totalVariance >= 0 ? '+' : ''}$${formatNum(totalVariance)}, ${totalVariancePercent >= 0 ? '+' : ''}${totalVariancePercent.toFixed(1)}%). ` +
    (materialCount > 0
      ? `${materialCount} line(s) exceed materiality threshold (${materialThresholdPercent}%${materialThresholdAmount != null ? ` or $${formatNum(materialThresholdAmount)}` : ''}).`
      : 'No material variances flagged.');

  return {
    periodLabel,
    generatedAt: new Date().toISOString(),
    lines,
    totalBudget,
    totalActual,
    totalVariance,
    totalVariancePercent,
    materialCount,
    summaryNarrative,
    budgetVersionId,
    budgetVersionLabel,
    actualsSource,
    actualsPeriodLabel,
  };
}

/**
 * Build budget and actual line arrays from CFO snapshots (prior = budget, current = actual).
 * Useful when budget is last year's actuals or a prior snapshot.
 */
export function snapshotToLines(snapshot: {
  revenue?: number;
  costOfGoodsSold?: number;
  operatingExpenses?: number;
}): BudgetLine[] {
  const lines: BudgetLine[] = [];
  if (snapshot.revenue != null && snapshot.revenue !== 0) {
    lines.push({ label: 'Revenue', amount: snapshot.revenue, category: 'Revenue' });
  }
  if (snapshot.costOfGoodsSold != null && snapshot.costOfGoodsSold !== 0) {
    lines.push({ label: 'Cost of Goods Sold', amount: snapshot.costOfGoodsSold, category: 'COGS' });
  }
  if (snapshot.operatingExpenses != null && snapshot.operatingExpenses !== 0) {
    lines.push({ label: 'Operating Expenses', amount: snapshot.operatingExpenses, category: 'OpEx' });
  }
  return lines;
}

function formatNum(n: number): string {
  if (Math.abs(n) >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (Math.abs(n) >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toFixed(0);
}

// --- Multi-period variance (period A vs period B actuals) ---

export interface MultiPeriodVarianceOptions {
  materialThresholdPercent?: number;
  materialThresholdAmount?: number;
  matchByLabel?: boolean;
  includeDrivers?: boolean;
}

/**
 * Build multi-period variance (e.g. Q1 actual vs Q2 actual). Same line matching as budget vs actual.
 */
export function buildMultiPeriodVariance(
  periodALines: ActualLine[],
  periodBLines: ActualLine[],
  options: {
    periodALabel?: string;
    periodBLabel?: string;
  } & MultiPeriodVarianceOptions = {}
): MultiPeriodVarianceReport {
  const {
    periodALabel = 'Period A',
    periodBLabel = 'Period B',
    materialThresholdPercent = 5,
    materialThresholdAmount,
    matchByLabel = true,
    includeDrivers = true,
  } = options;

  const normalizeLabel = (s: string) =>
    s
      .toLowerCase()
      .replace(/\s+/g, ' ')
      .replace(/[^\w\s]/g, '')
      .trim();

  const mapA = new Map<string, number>();
  for (const a of periodALines) {
    const key = matchByLabel ? normalizeLabel(a.label) : a.label;
    mapA.set(key, (mapA.get(key) ?? 0) + a.amount);
  }
  const mapB = new Map<string, number>();
  for (const b of periodBLines) {
    const key = matchByLabel ? normalizeLabel(b.label) : b.label;
    mapB.set(key, (mapB.get(key) ?? 0) + b.amount);
  }
  const allKeys = new Set([...mapA.keys(), ...mapB.keys()]);
  const lines: VarianceLine[] = [];

  for (const key of allKeys) {
    const amountA = mapA.get(key) ?? 0;
    const amountB = mapB.get(key) ?? 0;
    const variance = amountB - amountA;
    const variancePercent = amountA !== 0 ? (variance / Math.abs(amountA)) * 100 : (amountB !== 0 ? 100 : 0);
    const materialByPercent = Math.abs(variancePercent) >= materialThresholdPercent;
    const materialByAmount =
      materialThresholdAmount != null && Math.abs(variance) >= materialThresholdAmount;
    const material = materialByPercent || materialByAmount;
    const drivers: VarianceDriver[] | undefined =
      includeDrivers && variance !== 0 ? [inferDriver(variance, amountA, key)!].filter(Boolean) : undefined;
    lines.push({
      label: key,
      budget: amountA,
      actual: amountB,
      variance,
      variancePercent,
      material,
      drivers,
    });
  }

  lines.sort((a, b) => Math.abs(b.variance) - Math.abs(a.variance));
  const totalA = lines.reduce((s, l) => s + l.budget, 0);
  const totalB = lines.reduce((s, l) => s + l.actual, 0);
  const totalVariance = totalB - totalA;
  const totalVariancePercent = totalA !== 0 ? (totalVariance / Math.abs(totalA)) * 100 : 0;
  const materialCount = lines.filter((l) => l.material).length;

  return {
    periodALabel,
    periodBLabel,
    generatedAt: new Date().toISOString(),
    lines,
    totalPeriodA: totalA,
    totalPeriodB: totalB,
    totalVariance,
    totalVariancePercent,
    materialCount,
    summaryNarrative: `Multi-period: ${periodALabel} total $${formatNum(totalA)}, ${periodBLabel} total $${formatNum(totalB)} (variance $${formatNum(totalVariance)}, ${totalVariancePercent.toFixed(1)}%). ${materialCount} material line(s).`,
  };
}
