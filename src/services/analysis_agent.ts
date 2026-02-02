/**
 * FinOS CFA Analyst — Pointed financial interrogation.
 * Auditor Mode (YoY variances, round-sum, Benford); DCF & Sensitivity;
 * Liquidity risk (Current/Quick Ratio, CCC); Python/MCP tool for regressions.
 */

import type {
  AuditEntry,
  AuditCheckResult,
  AuditFlag,
  BenfordResult,
  YoYVariance,
  RoundSumEntry,
  DCFInputs,
  DCFResult,
  SensitivityAnalysisResult,
  LiquidityInputs,
  LiquidityMetrics,
  LiquidityAssessment,
  PythonInterpreterTool,
} from '../types/analysis.js';
import { BENFORD_EXPECTED } from '../types/analysis.js';

// --- Constants ---
const DEFAULT_YOY_THRESHOLD_PERCENT = 10;
const ROUND_UNITS = [1_000_000, 500_000, 100_000, 50_000, 10_000, 5_000, 1_000, 500, 100];

// --- Auditor Mode ---

/**
 * Get first digit (1–9) from a positive number for Benford's Law.
 */
function firstDigit(n: number): number {
  if (n <= 0 || !Number.isFinite(n)) return 0;
  let x = Math.abs(n);
  while (x >= 10) x = Math.floor(x / 10);
  return Math.floor(x) || 1;
}

/**
 * Benford's Law: compare observed first-digit distribution to expected.
 * Returns deviation score (0–1) and digit counts; high deviation may suggest manipulation.
 */
function benfordAnalysis(amounts: number[]): BenfordResult {
  const digitCounts: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0, 6: 0, 7: 0, 8: 0, 9: 0 };
  const valid = amounts.filter((a) => a > 0 && Number.isFinite(a));
  for (const a of valid) {
    const d = firstDigit(a);
    if (d >= 1 && d <= 9) digitCounts[d]++;
  }
  const n = valid.length;
  const observedProportions: Record<number, number> = {};
  let chiSquare = 0;
  for (let d = 1; d <= 9; d++) {
    const obs = digitCounts[d] / n;
    observedProportions[d] = n > 0 ? obs : 0;
    const exp = BENFORD_EXPECTED[d];
    if (n > 0 && exp > 0) chiSquare += ((digitCounts[d] - n * exp) ** 2) / (n * exp);
  }
  // Normalize deviation: chi-square critical value for 8 df at 0.05 is ~15.5; scale to 0–1
  const deviationScore = Math.min(1, chiSquare / 20);
  return { digitCounts, observedProportions, chiSquare, deviationScore };
}

/**
 * Flag entries that are "round sums" (exact multiples of 1000, 10000, etc.) — often associated with fabricated data.
 */
function findRoundSumEntries(entries: AuditEntry[]): RoundSumEntry[] {
  const flagged: RoundSumEntry[] = [];
  for (const e of entries) {
    const a = Math.abs(e.amount);
    if (a < 100) continue;
    for (const unit of ROUND_UNITS) {
      if (Math.abs(a - Math.round(a / unit) * unit) < 0.01) {
        flagged.push({ label: e.label, amount: e.amount, roundUnit: unit, accountCode: e.accountCode });
        break;
      }
    }
  }
  return flagged;
}

/**
 * Perform audit check: flags unusual YoY variances (>10%), round-sum entries, and Benford's Law deviations.
 */
export function perform_audit_check(
  entries: AuditEntry[],
  options?: { yoyThresholdPercent?: number; benfordFlagThreshold?: number }
): AuditCheckResult {
  const yoyThreshold = options?.yoyThresholdPercent ?? DEFAULT_YOY_THRESHOLD_PERCENT;
  const benfordFlagThreshold = options?.benfordFlagThreshold ?? 0.35;
  const flags: AuditFlag[] = [];

  // 1. YoY variances
  const yoyVariances: YoYVariance[] = [];
  for (const e of entries) {
    if (e.priorYearAmount == null || !Number.isFinite(e.priorYearAmount) || e.priorYearAmount === 0) continue;
    const current = e.amount;
    const prior = e.priorYearAmount;
    const percentChange = ((current - prior) / Math.abs(prior)) * 100;
    const flagged = Math.abs(percentChange) > yoyThreshold;
    yoyVariances.push({
      label: e.label,
      current,
      prior,
      percentChange,
      flagged,
      thresholdPercent: yoyThreshold,
    });
    if (flagged) {
      flags.push({
        type: 'YOY_VARIANCE',
        severity: Math.abs(percentChange) > 25 ? 'high' : 'medium',
        message: `YoY variance exceeds ${yoyThreshold}%: ${e.label}`,
        detail: `Current ${current.toLocaleString()} vs Prior ${prior.toLocaleString()} (${percentChange.toFixed(1)}%)`,
      });
    }
  }

  // 2. Round-sum entries
  const roundSumEntries = findRoundSumEntries(entries);
  if (roundSumEntries.length > 0) {
    const highRound = roundSumEntries.filter((r) => r.roundUnit >= 10_000);
    flags.push({
      type: 'ROUND_SUM',
      severity: highRound.length > 3 ? 'high' : roundSumEntries.length > 5 ? 'medium' : 'low',
      message: `${roundSumEntries.length} round-sum entries detected (may suggest fabrication)`,
      detail: roundSumEntries.slice(0, 5).map((r) => `${r.label}: ${r.amount}`).join('; '),
    });
  }

  // 3. Benford's Law
  const amounts = entries.map((e) => e.amount).filter((a) => a !== 0);
  const benford = amounts.length >= 10 ? benfordAnalysis(amounts) : undefined;
  if (benford && benford.deviationScore >= benfordFlagThreshold) {
    flags.push({
      type: 'BENFORD',
      severity: benford.deviationScore >= 0.6 ? 'high' : 'medium',
      message: `First-digit distribution deviates from Benford's Law (score ${benford.deviationScore.toFixed(2)})`,
      detail: 'Natural data typically follows Benford; significant deviation can indicate manipulation.',
    });
  }

  const passed = flags.filter((f) => f.severity === 'high').length === 0;
  let summary =
    flags.length === 0
      ? 'No material audit flags. YoY variances within threshold; no significant round-sum or Benford deviation.'
      : `Found ${flags.length} flag(s): ${flags.map((f) => f.type).join(', ')}. ${passed ? 'Review recommended.' : 'High-severity items require follow-up.'}`;

  return {
    passed,
    flags,
    summary,
    benford,
    yoyVariances: yoyVariances.length > 0 ? yoyVariances : undefined,
    roundSumEntries: roundSumEntries.length > 0 ? roundSumEntries : undefined,
  };
}

// --- DCF & Sensitivity ---

/**
 * Present value of a single cash flow at period t, discount rate r.
 */
function pv(cf: number, t: number, r: number): number {
  return cf / (1 + r) ** t;
}

/**
 * DCF: explicit forecast FCFs + terminal value (perpetuity growth).
 * Enterprise Value = PV(explicit FCFs) + PV(terminal value).
 */
export function dcfValue(inputs: DCFInputs): DCFResult {
  const { freeCashFlows, wacc, terminalGrowthRate } = inputs;
  const r = wacc;
  const g = terminalGrowthRate;
  let pvExplicit = 0;
  for (let t = 1; t <= freeCashFlows.length; t++) {
    pvExplicit += pv(freeCashFlows[t - 1], t, r);
  }
  const lastFcf = freeCashFlows[freeCashFlows.length - 1] ?? 0;
  const terminalFcf = lastFcf * (1 + g);
  const terminalValue = r > g ? terminalFcf / (r - g) : 0;
  const pvTerminal = terminalValue / (1 + r) ** freeCashFlows.length;
  const enterpriseValue = pvExplicit + pvTerminal;
  return {
    enterpriseValue,
    presentValueExplicit: pvExplicit,
    terminalValue,
    presentValueTerminal: pvTerminal,
    assumptions: inputs,
  };
}

/**
 * Sensitivity Analysis: vary WACC and/or Terminal Growth Rate; return grid of enterprise values.
 */
export function sensitivityAnalysis(
  baseInputs: DCFInputs,
  options: {
    waccRange?: { min: number; max: number; steps: number };
    growthRange?: { min: number; max: number; steps: number };
  }
): SensitivityAnalysisResult {
  const baseCase = dcfValue(baseInputs);
  const scenarios: SensitivityAnalysisResult['scenarios'] = [];
  const waccRange = options.waccRange ?? { min: 0.08, max: 0.14, steps: 4 };
  const growthRange = options.growthRange ?? { min: 0.01, max: 0.05, steps: 4 };

  const waccSteps: number[] = [];
  for (let i = 0; i < waccRange.steps; i++) {
    waccSteps.push(
      waccRange.min + (i * (waccRange.max - waccRange.min)) / Math.max(1, waccRange.steps - 1)
    );
  }
  const growthSteps: number[] = [];
  for (let i = 0; i < growthRange.steps; i++) {
    growthSteps.push(
      growthRange.min + (i * (growthRange.max - growthRange.min)) / Math.max(1, growthRange.steps - 1)
    );
  }

  const grid: { wacc: number[]; growth: number[]; values: number[][] } = {
    wacc: waccSteps,
    growth: growthSteps,
    values: growthSteps.map(() => waccSteps.map(() => 0)),
  };

  growthSteps.forEach((g, gi) => {
    waccSteps.forEach((w, wi) => {
      const modified: DCFInputs = {
        ...baseInputs,
        wacc: w,
        terminalGrowthRate: g,
      };
      const result = dcfValue(modified);
      grid.values[gi][wi] = result.enterpriseValue;
      scenarios.push({
        name: `WACC=${(w * 100).toFixed(1)}%, g=${(g * 100).toFixed(1)}%`,
        wacc: w,
        terminalGrowthRate: g,
        enterpriseValue: result.enterpriseValue,
      });
    });
  });

  return { baseCase, scenarios, grid };
}

// --- Liquidity Risk (Pointed Questions) ---

/**
 * Compute Current Ratio, Quick Ratio, and Cash Conversion Cycle from balance sheet inputs.
 */
export function computeLiquidityMetrics(inputs: LiquidityInputs): LiquidityMetrics {
  const {
    currentAssets,
    inventory,
    currentLiabilities,
    revenue,
    accountsReceivable,
    accountsPayable,
    costOfGoodsSold,
    averageInventory,
  } = inputs;

  const currentRatio = currentLiabilities > 0 ? currentAssets / currentLiabilities : 0;
  const quickAssets = currentAssets - inventory;
  const quickRatio = currentLiabilities > 0 ? quickAssets / currentLiabilities : 0;

  const daysSalesOutstanding = revenue > 0 ? (accountsReceivable / revenue) * 365 : 0;
  const invForDIO = averageInventory ?? inventory;
  const cogs = costOfGoodsSold ?? revenue * 0.6; // rough fallback
  const daysInventoryOutstanding = cogs > 0 ? (invForDIO / cogs) * 365 : 0;
  const daysPayablesOutstanding = cogs > 0 ? (accountsPayable / cogs) * 365 : 0;

  const cashConversionCycleDays =
    daysSalesOutstanding + daysInventoryOutstanding - daysPayablesOutstanding;

  return {
    currentRatio,
    quickRatio,
    cashConversionCycleDays,
    daysInventoryOutstanding,
    daysSalesOutstanding,
    daysPayablesOutstanding,
  };
}

/**
 * Assess liquidity risk: compute metrics and return CFA-level qualitative summary.
 * Triggered by questions like "Assess the liquidity risk."
 */
export function assessLiquidityRisk(inputs: LiquidityInputs): LiquidityAssessment {
  const metrics = computeLiquidityMetrics(inputs);
  const bulletPoints: string[] = [];
  let riskLevel: LiquidityAssessment['riskLevel'] = 'low';

  // Current ratio: typically >1.5 healthy, 1–1.5 watch, <1 concern
  if (metrics.currentRatio >= 1.5) {
    bulletPoints.push(
      `Current Ratio of ${metrics.currentRatio.toFixed(2)} indicates adequate short-term coverage (benchmark >1.5).`
    );
  } else if (metrics.currentRatio >= 1) {
    bulletPoints.push(
      `Current Ratio of ${metrics.currentRatio.toFixed(2)} is borderline; monitor working capital (benchmark >1.5).`
    );
    if (riskLevel === 'low') riskLevel = 'moderate';
  } else {
    bulletPoints.push(
      `Current Ratio of ${metrics.currentRatio.toFixed(2)} is below 1.0 — insufficient current assets to cover current liabilities; liquidity risk elevated.`
    );
    riskLevel = metrics.currentRatio < 0.8 ? 'critical' : 'high';
  }

  // Quick ratio: excludes inventory; >1 preferred
  if (metrics.quickRatio >= 1) {
    bulletPoints.push(
      `Quick Ratio of ${metrics.quickRatio.toFixed(2)} suggests ability to meet obligations without relying on inventory liquidation.`
    );
  } else {
    bulletPoints.push(
      `Quick Ratio of ${metrics.quickRatio.toFixed(2)} is below 1.0 — reliance on inventory conversion to meet obligations; less cushion for demand shocks.`
    );
    if (riskLevel === 'low') riskLevel = 'moderate';
  }

  // Cash conversion cycle: shorter = less capital tied up
  bulletPoints.push(
    `Cash Conversion Cycle of ${metrics.cashConversionCycleDays.toFixed(0)} days (DSO ${metrics.daysSalesOutstanding.toFixed(0)} + DIO ${metrics.daysInventoryOutstanding.toFixed(0)} − DPO ${metrics.daysPayablesOutstanding.toFixed(0)}).`
  );
  if (metrics.cashConversionCycleDays > 90) {
    bulletPoints.push(
      'Extended CCC indicates capital tied in working capital; consider receivables and inventory management.'
    );
    if (riskLevel === 'low') riskLevel = 'moderate';
  }

  const summary =
    riskLevel === 'critical'
      ? 'Liquidity risk is critical: current and quick ratios are weak. Immediate focus on cash preservation and refinancing may be required.'
      : riskLevel === 'high'
        ? 'Liquidity risk is high. Current ratio below 1.0 and/or weak quick ratio suggest vulnerability to rollover or demand shocks. Recommend stress-testing and contingency funding.'
        : riskLevel === 'moderate'
          ? 'Liquidity risk is moderate. Ratios are adequate but not strong; monitor working capital and covenant headroom.'
          : 'Liquidity risk is low. Current and quick ratios and cash conversion cycle support a comfortable short-term liquidity position.';

  return { metrics, summary, riskLevel, bulletPoints };
}

// --- Pointed question router ---

export interface PointedQuestionContext {
  liquidityInputs?: LiquidityInputs;
  auditEntries?: AuditEntry[];
  dcfInputs?: DCFInputs;
}

/**
 * Route a natural-language question to the appropriate CFA analysis and return a structured response.
 * E.g. "Assess the liquidity risk" → liquidity metrics + CFA summary.
 */
export function answerPointedQuestion(
  question: string,
  context: PointedQuestionContext
): { answer: string; metrics?: LiquidityMetrics; assessment?: LiquidityAssessment; audit?: AuditCheckResult; dcf?: DCFResult } {
  const q = question.toLowerCase().trim();

  if (/liquidity|current ratio|quick ratio|cash conversion|ccc|working capital/i.test(q) && context.liquidityInputs) {
    const assessment = assessLiquidityRisk(context.liquidityInputs);
    const answer = [
      assessment.summary,
      '',
      ...assessment.bulletPoints,
      '',
      `Risk level: ${assessment.riskLevel.toUpperCase()}.`,
    ].join('\n');
    return { answer, metrics: assessment.metrics, assessment };
  }

  if (/audit|variance|benford|round|fraud|unusual/i.test(q) && context.auditEntries && context.auditEntries.length > 0) {
    const audit = perform_audit_check(context.auditEntries);
    const answer = [
      audit.summary,
      audit.flags.length > 0 ? '\nFlags: ' + audit.flags.map((f) => f.message).join('\n') : '',
    ].join('\n');
    return { answer, audit };
  }

  if (/dcf|valuation|enterprise value|wacc|sensitivity/i.test(q) && context.dcfInputs) {
    const dcf = dcfValue(context.dcfInputs);
    const answer = [
      `DCF Enterprise Value: ${dcf.enterpriseValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
      `PV (explicit): ${dcf.presentValueExplicit.toLocaleString('en-US', { maximumFractionDigits: 0 })}; PV (terminal): ${dcf.presentValueTerminal.toLocaleString('en-US', { maximumFractionDigits: 0 })}.`,
      `Assumptions: WACC ${(context.dcfInputs.wacc * 100).toFixed(1)}%, terminal g ${(context.dcfInputs.terminalGrowthRate * 100).toFixed(1)}%.`,
    ].join('\n');
    return { answer, dcf };
  }

  return {
    answer:
      'Provide context for the analysis: for liquidity risk, pass liquidityInputs (current assets, inventory, current liabilities, revenue, AR, AP, etc.); for audit, pass auditEntries; for DCF, pass dcfInputs. Then re-ask (e.g. "Assess the liquidity risk").',
  };
}

// --- Python / MCP tool for regressions ---

let pythonTool: PythonInterpreterTool | null = null;

/**
 * Register the Python interpreter tool (e.g. via MCP). When set, the CFA Analyst can run
 * complex statistical regressions on historical data. Wire your MCP Python server to
 * implement PythonInterpreterTool: execute(code) and optionally runRegression(x, y).
 */
export function setPythonInterpreterTool(tool: PythonInterpreterTool | null): void {
  pythonTool = tool;
}

/**
 * Run a simple linear regression on historical data. Uses built-in OLS if no Python tool; otherwise delegates to Python/MCP.
 */
export async function runRegression(
  x: number[],
  y: number[]
): Promise<{ slope: number; intercept: number; rSquared: number }> {
  if (pythonTool?.runRegression) {
    return pythonTool.runRegression(x, y);
  }
  if (pythonTool?.execute) {
    const code = `
import json
n = len(x)
if n < 2:
    print(json.dumps({"slope": 0, "intercept": 0, "rSquared": 0}))
else:
    x_mean = sum(x)/n
    y_mean = sum(y)/n
    num = sum((x[i]-x_mean)*(y[i]-y_mean) for i in range(n))
    den = sum((x[i]-x_mean)**2 for i in range(n))
    slope = num/den if den else 0
    intercept = y_mean - slope*x_mean
    ss_res = sum((y[i] - (intercept+slope*x[i]))**2 for i in range(n))
    ss_tot = sum((y[i]-y_mean)**2 for i in range(n))
    r_sq = 1 - ss_res/ss_tot if ss_tot else 0
    print(json.dumps({"slope": slope, "intercept": intercept, "rSquared": r_sq}))
`;
    const payload = `x = ${JSON.stringify(x)}\ny = ${JSON.stringify(y)}\n${code}`;
    const out = await pythonTool.execute(payload);
    try {
      const line = (out.stdout || '').trim().split('\n').pop() || '{}';
      return JSON.parse(line) as { slope: number; intercept: number; rSquared: number };
    } catch {
      return builtInRegression(x, y);
    }
  }
  return builtInRegression(x, y);
}

/** Built-in OLS regression (no Python required). */
function builtInRegression(x: number[], y: number[]): { slope: number; intercept: number; rSquared: number } {
  const n = x.length;
  if (n < 2) return { slope: 0, intercept: 0, rSquared: 0 };
  const xMean = x.reduce((a, b) => a + b, 0) / n;
  const yMean = y.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (x[i] - xMean) * (y[i] - yMean);
    den += (x[i] - xMean) ** 2;
  }
  const slope = den !== 0 ? num / den : 0;
  const intercept = yMean - slope * xMean;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const fit = intercept + slope * x[i];
    ssRes += (y[i] - fit) ** 2;
    ssTot += (y[i] - yMean) ** 2;
  }
  const rSquared = ssTot !== 0 ? 1 - ssRes / ssTot : 0;
  return { slope, intercept, rSquared };
}

/**
 * Check whether the Python/MCP tool is available for complex regressions.
 */
export function hasPythonTool(): boolean {
  return pythonTool != null;
}
