/**
 * CFO Dashboard — Executive Summarizer (MD&A narrative engine).
 * 1. Strategic Narrative: MD&A style commentary (Management Discussion and Analysis).
 * 2. KPIs: Burn Rate, Runway, Rule of 40 (SaaS), Working Capital cycles.
 * 3. Pointed Questions: Sensitivity model (e.g. COGS +15% → margin impact) for real-time dashboard update.
 */

import type {
  CFOFinancialSnapshot,
  MDANarrative,
  MDASection,
  CFOKPIs,
  PointedQuestionSensitivityResult,
  MarginScenario,
} from '../types/cfo-dashboard.js';

// --- KPI calculations ---

/**
 * Burn Rate: monthly net cash burn. Negative operating cash flow = burn.
 * Simplified: (Operating expenses - Operating income) or (Net income < 0 ? |Net income| : 0) / 12 for annual.
 */
function computeBurnRate(snapshot: CFOFinancialSnapshot): number {
  const opEx = snapshot.operatingExpenses ?? 0;
  const opInc = snapshot.operatingIncome ?? 0;
  const netIncome = snapshot.netIncome ?? 0;
  // If profitable, burn rate = 0 (or we could use FCF). If loss, monthly burn = |net income|/12.
  if (netIncome >= 0) return 0;
  return Math.abs(netIncome) / 12;
}

/**
 * Runway: months of cash at current burn rate. Cash / monthly burn.
 */
function computeRunway(cash: number, burnRate: number): number {
  if (burnRate <= 0) return Number.POSITIVE_INFINITY;
  return cash / burnRate;
}

/**
 * Break-even revenue: annual revenue at which net income = 0 (total costs = revenue).
 * Simplified: COGS + Operating Expenses (annual).
 */
function computeBreakEvenRevenue(snapshot: CFOFinancialSnapshot): number {
  const cogs = snapshot.costOfGoodsSold ?? 0;
  const opEx = snapshot.operatingExpenses ?? 0;
  return cogs + opEx;
}

/**
 * Rule of 40 (SaaS): Revenue Growth % + Profit Margin %. >= 40 is healthy.
 */
function computeRuleOf40(snapshot: CFOFinancialSnapshot): { ruleOf40: number; growth: number; margin: number } {
  const revenue = snapshot.revenue || 0;
  const priorRevenue = snapshot.priorRevenue ?? revenue;
  const growth = priorRevenue > 0 ? ((revenue - priorRevenue) / priorRevenue) * 100 : 0;
  const margin = revenue > 0 ? (snapshot.netIncome / revenue) * 100 : 0;
  return { ruleOf40: growth + margin, growth, margin };
}

/**
 * ROIC: Return on Invested Capital. NOPAT / Invested Capital.
 * Simplified: Net income / (Total equity + interest-bearing debt). If no debt, Net income / Total equity.
 */
function computeROIC(snapshot: CFOFinancialSnapshot): number {
  const netIncome = snapshot.netIncome ?? 0;
  const totalEquity = snapshot.totalEquity ?? 0;
  const totalLiabilities = snapshot.totalLiabilities ?? 0;
  const investedCapital = totalEquity + totalLiabilities;
  if (investedCapital <= 0) return 0;
  return (netIncome / investedCapital) * 100;
}

/**
 * Working capital cycle: DSO + DIO - DPO (days).
 */
function computeWorkingCapitalCycle(snapshot: CFOFinancialSnapshot): {
  daysSalesOutstanding: number;
  daysInventoryOutstanding: number;
  daysPayablesOutstanding: number;
  cycleDays: number;
} {
  const revenue = snapshot.revenue || 0;
  const cogs = snapshot.costOfGoodsSold ?? revenue * 0.5;
  const ar = snapshot.accountsReceivable ?? 0;
  const inv = snapshot.inventory ?? 0;
  const ap = snapshot.accountsPayable ?? 0;
  const dso = revenue > 0 ? (ar / revenue) * 365 : 0;
  const dio = cogs > 0 ? (inv / cogs) * 365 : 0;
  const dpo = cogs > 0 ? (ap / cogs) * 365 : 0;
  return {
    daysSalesOutstanding: dso,
    daysInventoryOutstanding: dio,
    daysPayablesOutstanding: dpo,
    cycleDays: dso + dio - dpo,
  };
}

// --- KPI aggregation ---

export function computeCFOKPIs(snapshot: CFOFinancialSnapshot): CFOKPIs {
  const burnRate = computeBurnRate(snapshot);
  const runway = computeRunway(snapshot.cash ?? 0, burnRate);
  const { ruleOf40, growth: revenueGrowthPercent, margin: profitMarginPercent } = computeRuleOf40(snapshot);
  const wc = computeWorkingCapitalCycle(snapshot);

  const revenue = snapshot.revenue || 0;
  const cogs = snapshot.costOfGoodsSold ?? 0;
  const opEx = snapshot.operatingExpenses ?? 0;
  const netIncome = snapshot.netIncome ?? 0;
  const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0;
  const operatingMargin = revenue > 0 && snapshot.operatingIncome != null
    ? (snapshot.operatingIncome / revenue) * 100
    : revenue > 0 ? ((revenue - cogs - opEx) / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;

  const breakEvenRevenue = computeBreakEvenRevenue(snapshot);
  const roicPercent = computeROIC(snapshot);
  return {
    burnRate,
    runwayMonths: Number.isFinite(runway) ? runway : 0,
    breakEvenRevenue,
    ruleOf40,
    revenueGrowthPercent,
    profitMarginPercent,
    workingCapitalCycleDays: wc.cycleDays,
    daysSalesOutstanding: wc.daysSalesOutstanding,
    daysInventoryOutstanding: wc.daysInventoryOutstanding,
    daysPayablesOutstanding: wc.daysPayablesOutstanding,
    grossMarginPercent: grossMargin,
    operatingMarginPercent: operatingMargin,
    netMarginPercent: netMargin,
    roicPercent,
  };
}

// --- MD&A narrative ---

export function generateMDANarrative(snapshot: CFOFinancialSnapshot, kpis: CFOKPIs): MDANarrative {
  const period = snapshot.periodLabel ?? 'Current Period';
  const revenue = snapshot.revenue || 0;
  const netIncome = snapshot.netIncome ?? 0;
  const equity = snapshot.totalEquity ?? 0;
  const cash = snapshot.cash ?? 0;

  const overview =
    `Management's Discussion and Analysis for ${period} reflects revenue of $${formatNum(revenue)}, ` +
    `net income of $${formatNum(netIncome)}, and total equity of $${formatNum(equity)}. ` +
    (kpis.runwayMonths > 0 && kpis.runwayMonths < Number.POSITIVE_INFINITY
      ? `Cash and equivalents of $${formatNum(cash)} support approximately ${kpis.runwayMonths.toFixed(1)} months of runway at current burn. `
      : '') +
    (kpis.ruleOf40 >= 40
      ? `The Rule of 40 (revenue growth + profit margin) stands at ${kpis.ruleOf40.toFixed(1)}%, indicating strong SaaS performance. `
      : kpis.ruleOf40 > 0
        ? `The Rule of 40 is ${kpis.ruleOf40.toFixed(1)}%; management is focused on balancing growth and profitability. `
        : '');

  const sections: MDASection[] = [];

  sections.push({
    title: 'Results of Operations',
    content:
      `Revenue for the period was $${formatNum(revenue)} ` +
      (snapshot.priorRevenue != null
        ? `(prior period: $${formatNum(snapshot.priorRevenue)}; YoY growth ${kpis.revenueGrowthPercent.toFixed(1)}%). `
        : '. ') +
      `Gross margin was ${kpis.grossMarginPercent.toFixed(1)}%, operating margin ${kpis.operatingMarginPercent.toFixed(1)}%, and net margin ${kpis.netMarginPercent.toFixed(1)}%. ` +
      (netIncome >= 0
        ? 'The company reported positive net income, reflecting operational efficiency and revenue traction.'
        : 'The company reported a net loss; management is prioritizing path to profitability and cost discipline.'),
  });

  sections.push({
    title: 'Liquidity and Capital Resources',
    content:
      `Cash and equivalents totaled $${formatNum(cash)}. ` +
      (kpis.burnRate > 0
        ? `Monthly net cash burn (burn rate) was approximately $${formatNum(kpis.burnRate)}; runway is ${kpis.runwayMonths >= 999 ? 'N/A (profitable)' : kpis.runwayMonths.toFixed(1)} months. `
        : 'The company is cash-flow positive; burn rate and runway are not applicable. ') +
      `Working capital cycle (DSO + DIO − DPO) was ${kpis.workingCapitalCycleDays.toFixed(0)} days (DSO ${kpis.daysSalesOutstanding.toFixed(0)}, DIO ${kpis.daysInventoryOutstanding.toFixed(0)}, DPO ${kpis.daysPayablesOutstanding.toFixed(0)}). ` +
      'Management monitors liquidity and covenant compliance and may consider equity or debt financing to support growth.',
  });

  const highlights: string[] = [];
  if (kpis.ruleOf40 >= 40) highlights.push(`Rule of 40 at ${kpis.ruleOf40.toFixed(1)}% (growth + margin).`);
  if (kpis.runwayMonths > 0 && kpis.runwayMonths < 24 && kpis.burnRate > 0)
    highlights.push(`Runway of ${kpis.runwayMonths.toFixed(1)} months at current burn.`);
  if (kpis.grossMarginPercent >= 70) highlights.push(`Strong gross margin of ${kpis.grossMarginPercent.toFixed(1)}%.`);
  if (kpis.workingCapitalCycleDays < 60) highlights.push(`Efficient working capital cycle (${kpis.workingCapitalCycleDays.toFixed(0)} days).`);

  return { periodLabel: period, overview, sections, highlights };
}

function formatNum(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1) + 'k';
  return n.toFixed(0);
}

// --- Pointed Questions: sensitivity (e.g. COGS +15% → margins) ---

const COGS_PATTERNS = [
  /cogs?\s+(?:increases?|goes? up|rise|rises?)\s+by\s*(\d+(?:\.\d+)?)\s*%?/i,
  /(?:if|when)\s+cogs?\s+(?:increases?|)\s+by\s*(\d+(?:\.\d+)?)\s*%?/i,
  /(?:increase|raise)\s+cogs?\s+by\s*(\d+(?:\.\d+)?)\s*%?/i,
  /(\d+(?:\.\d+)?)\s*%\s*(?:increase|rise)\s+in\s+cogs?/i,
];
const OPEX_PATTERNS = [
  /(?:operating\s+)?expenses?\s+(?:increases?|goes? up)\s+by\s*(\d+(?:\.\d+)?)\s*%?/i,
  /(?:if|when)\s+(?:opex|operating\s+expenses?)\s+(?:increases?|)\s+by\s*(\d+(?:\.\d+)?)\s*%?/i,
  /(\d+(?:\.\d+)?)\s*%\s*(?:increase|rise)\s+in\s+(?:opex|operating\s+expenses?)/i,
];
const REVENUE_PATTERNS = [
  /revenue\s+(?:decreases?|drops?|falls?)\s+by\s*(\d+(?:\.\d+)?)\s*%?/i,
  /(\d+(?:\.\d+)?)\s*%\s*(?:decrease|drop)\s+in\s+revenue/i,
];

export function parsePointedQuestion(question: string): { variable: 'COGS' | 'OPEX' | 'REVENUE'; shockPercent: number } | null {
  for (const re of COGS_PATTERNS) {
    const m = question.match(re);
    if (m) return { variable: 'COGS', shockPercent: parseFloat(m[1]) };
  }
  for (const re of OPEX_PATTERNS) {
    const m = question.match(re);
    if (m) return { variable: 'OPEX', shockPercent: parseFloat(m[1]) };
  }
  for (const re of REVENUE_PATTERNS) {
    const m = question.match(re);
    if (m) return { variable: 'REVENUE', shockPercent: -parseFloat(m[1]) }; // decrease
  }
  // Default: "margins if COGS increases by X%" — try last number
  const anyPercent = question.match(/(\d+(?:\.\d+)?)\s*%?/);
  if (anyPercent) return { variable: 'COGS', shockPercent: parseFloat(anyPercent[1]) };
  return null;
}

/**
 * Run pointed-question sensitivity with optional agentic parsing (try LLM first, fall back to regex).
 */
export async function runPointedQuestionSensitivityAsync(input: {
  question: string;
  snapshot: CFOFinancialSnapshot;
  useAgenticParser?: boolean;
}): Promise<PointedQuestionSensitivityResult> {
  const { question, snapshot, useAgenticParser } = input;
  let parsed = parsePointedQuestion(question);
  if (useAgenticParser && !parsed) {
    try {
      const { parsePointedQuestionAgentic } = await import('./agentic_sensitivity_parser.js');
      const agentic = await parsePointedQuestionAgentic(question);
      if (agentic) parsed = { variable: agentic.variable, shockPercent: agentic.shockPercent };
    } catch {
      /* keep regex result or null */
    }
  }
  return runPointedQuestionSensitivityWithParsed({ question, snapshot, parsed });
}

function buildMarginScenario(
  label: string,
  revenue: number,
  cogs: number,
  opEx: number,
  netIncome: number
): MarginScenario {
  const grossMargin = revenue > 0 ? ((revenue - cogs) / revenue) * 100 : 0;
  const operatingIncome = revenue - cogs - opEx;
  const operatingMargin = revenue > 0 ? (operatingIncome / revenue) * 100 : 0;
  const netMargin = revenue > 0 ? (netIncome / revenue) * 100 : 0;
  return {
    scenario: label,
    grossMarginPercent: grossMargin,
    operatingMarginPercent: operatingMargin,
    netMarginPercent: netMargin,
    revenue,
    cogs,
    operatingExpenses: opEx,
    netIncome,
  };
}

/** Internal: run sensitivity given optional parsed variable + shock. */
export function runPointedQuestionSensitivityWithParsed(input: {
  question: string;
  snapshot: CFOFinancialSnapshot;
  parsed: { variable: 'COGS' | 'OPEX' | 'REVENUE'; shockPercent: number } | null;
}): PointedQuestionSensitivityResult {
  const { question, snapshot, parsed } = input;
  const revenue = snapshot.revenue || 0;
  let cogs = snapshot.costOfGoodsSold ?? revenue * 0.5;
  let opEx = snapshot.operatingExpenses ?? revenue * 0.3;
  let netIncome = snapshot.netIncome ?? revenue - cogs - opEx;

  const baseCase = buildMarginScenario('Base case', revenue, cogs, opEx, netIncome);

  let sensitivityCase: MarginScenario;
  let interpretedVariable = 'Unknown';
  let interpretedShock = '0%';

  if (parsed) {
    interpretedVariable = parsed.variable;
    interpretedShock = (parsed.shockPercent >= 0 ? '+' : '') + parsed.shockPercent + '%';
    const factor = 1 + parsed.shockPercent / 100;
    if (parsed.variable === 'COGS') {
      cogs = cogs * factor;
      netIncome = revenue - cogs - opEx;
      sensitivityCase = buildMarginScenario(`COGS ${interpretedShock}`, revenue, cogs, opEx, netIncome);
    } else if (parsed.variable === 'OPEX') {
      opEx = opEx * factor;
      netIncome = revenue - cogs - opEx;
      sensitivityCase = buildMarginScenario(`OpEx ${interpretedShock}`, revenue, cogs, opEx, netIncome);
    } else {
      const newRevenue = revenue * (1 + parsed.shockPercent / 100);
      netIncome = newRevenue - cogs - opEx;
      sensitivityCase = buildMarginScenario(`Revenue ${interpretedShock}`, newRevenue, cogs, opEx, netIncome);
    }
  } else {
    sensitivityCase = baseCase;
  }

  const delta = {
    grossMarginPercent: sensitivityCase.grossMarginPercent - baseCase.grossMarginPercent,
    operatingMarginPercent: sensitivityCase.operatingMarginPercent - baseCase.operatingMarginPercent,
    netMarginPercent: sensitivityCase.netMarginPercent - baseCase.netMarginPercent,
  };

  const narrative =
    `If ${interpretedVariable} moves ${interpretedShock}, gross margin would be ${sensitivityCase.grossMarginPercent.toFixed(1)}% (${delta.grossMarginPercent >= 0 ? '+' : ''}${delta.grossMarginPercent.toFixed(1)} pp), ` +
    `operating margin ${sensitivityCase.operatingMarginPercent.toFixed(1)}% (${delta.operatingMarginPercent >= 0 ? '+' : ''}${delta.operatingMarginPercent.toFixed(1)} pp), ` +
    `and net margin ${sensitivityCase.netMarginPercent.toFixed(1)}% (${delta.netMarginPercent >= 0 ? '+' : ''}${delta.netMarginPercent.toFixed(1)} pp). ` +
    'Dashboard visuals updated to reflect sensitivity scenario.';

  const chartData = [
    { scenario: baseCase.scenario, grossMargin: baseCase.grossMarginPercent, operatingMargin: baseCase.operatingMarginPercent, netMargin: baseCase.netMarginPercent },
    { scenario: sensitivityCase.scenario, grossMargin: sensitivityCase.grossMarginPercent, operatingMargin: sensitivityCase.operatingMarginPercent, netMargin: sensitivityCase.netMarginPercent },
  ];

  return {
    question,
    interpretedVariable,
    interpretedShock,
    baseCase,
    sensitivityCase,
    delta,
    narrative,
    chartData,
  };
}

/**
 * Pointed Question: run sensitivity (e.g. COGS +15%) and return base vs. sensitivity margins for real-time dashboard update.
 */
export function runPointedQuestionSensitivity(input: {
  question: string;
  snapshot: CFOFinancialSnapshot;
}): PointedQuestionSensitivityResult {
  return runPointedQuestionSensitivityWithParsed({
    question: input.question,
    snapshot: input.snapshot,
    parsed: parsePointedQuestion(input.question),
  });
}
