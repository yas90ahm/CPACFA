/**
 * CFO Dashboard — Scenario recommendation agent (propose specs to hit target runway/break-even).
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { computeCFOKPIs } from './executive_summarizer.js';
import { buildSensitivityReport } from './sensitivity_report_service.js';
import type {
  CFOFinancialSnapshot,
  SensitivityScenarioSpec,
  SensitivityReport,
} from '../types/cfo-dashboard.js';

export interface ScenarioRecommendationTarget {
  /** Target runway in months */
  runwayMonths?: number;
  /** Target break-even revenue (optional) */
  breakEvenRevenue?: number;
  /** Optional: max new hires to consider */
  maxNewHires?: number;
  /** Optional: max revenue change % to suggest */
  maxRevenueChangePercent?: number;
}

export interface ScenarioRecommendationResult {
  targetRunwayMonths?: number;
  targetBreakEvenRevenue?: number;
  currentRunwayMonths: number;
  currentBreakEvenRevenue: number;
  suggestedScenarios: SensitivityScenarioSpec[];
  interpretation: string;
  report?: SensitivityReport;
}

const SYSTEM = [
  'You are a CFO analyst recommending what-if scenarios to hit a target (e.g. runway in months, or break-even).',
  'Given current snapshot (revenue, expenses, cash, burn, runway), suggest 2–4 concrete scenarios.',
  'Return ONLY valid JSON: { "scenarios": [ { "revenueChangePercent": number or null, "newEmployeeCount": number or null, "newEmployeeSalary": number or null, "label": string } ], "interpretation": string }.',
  'Use revenueChangePercent for revenue uplift/cut; use newEmployeeCount and newEmployeeSalary for hiring (positive) or layoffs (negative count as 0).',
  'label: short description e.g. "Revenue +10%" or "Freeze hiring".',
].join(' ');

/**
 * Recommend scenario specs to approach target runway or break-even; optionally build sensitivity report.
 */
export async function recommendScenariosAgentic(
  snapshot: CFOFinancialSnapshot,
  target: ScenarioRecommendationTarget,
  options: { buildReport?: boolean; periodLabel?: string } = {}
): Promise<ScenarioRecommendationResult> {
  const kpis = computeCFOKPIs(snapshot);
  const currentRunway = kpis.runwayMonths >= 999 ? 0 : kpis.runwayMonths;
  const currentBreakEven = kpis.breakEvenRevenue ?? 0;

  const prompt = [
    `Current: revenue ${snapshot.revenue}, net income ${snapshot.netIncome}, cash ${snapshot.cash}, burn rate ${kpis.burnRate}/mo, runway ${currentRunway} mo, break-even revenue ${currentBreakEven}.`,
    target.runwayMonths != null ? `Target runway: ${target.runwayMonths} months.` : '',
    target.breakEvenRevenue != null ? `Target break-even revenue: ${target.breakEvenRevenue}.` : '',
    `Constraints: max revenue change ${target.maxRevenueChangePercent ?? 30}%, max new hires ${target.maxNewHires ?? 20}.`,
    'Suggest 2–4 scenarios (revenue change and/or hiring change) to move toward the target. Return JSON only.',
  ].join('\n');

  const fallbackScenarios: SensitivityScenarioSpec[] = [
    { revenueChangePercent: 10, question: 'Scenario: Revenue +10%' },
    { revenueChangePercent: -10, question: 'Scenario: Revenue -10%' },
    { newEmployeeCount: 0, newEmployeeSalary: 0, question: 'Scenario: Hiring freeze' },
  ];
  const fallbackInterpretation = 'Generic scenarios suggested; refine targets for custom recommendations.';

  const { suggestedScenarios, interpretation } = await callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 600,
    parse: (raw) => {
      const parsed = parseScenarioRecommendation(raw);
      let suggestedScenarios: SensitivityScenarioSpec[] = [];
      let interpretation = fallbackInterpretation;
      if (parsed.scenarios?.length) {
        suggestedScenarios = parsed.scenarios.map((s: { revenueChangePercent?: number; newEmployeeCount?: number; newEmployeeSalary?: number; label?: string }) => ({
          revenueChangePercent: s.revenueChangePercent ?? undefined,
          newEmployeeCount: s.newEmployeeCount ?? undefined,
          newEmployeeSalary: s.newEmployeeSalary ?? undefined,
          question: s.label ? `Scenario: ${s.label}` : undefined,
        }));
        interpretation = parsed.interpretation ?? interpretation;
      }
      return { suggestedScenarios, interpretation };
    },
    fallback: { suggestedScenarios: fallbackScenarios, interpretation: fallbackInterpretation },
  });

  let report: SensitivityReport | undefined;
  if (options.buildReport && suggestedScenarios.length > 0) {
    report = buildSensitivityReport(snapshot, suggestedScenarios, {
      periodLabel: options.periodLabel ?? snapshot.periodLabel,
    });
  }

  return {
    targetRunwayMonths: target.runwayMonths,
    targetBreakEvenRevenue: target.breakEvenRevenue,
    currentRunwayMonths: currentRunway,
    currentBreakEvenRevenue: currentBreakEven,
    suggestedScenarios,
    interpretation,
    report,
  };
}

function parseScenarioRecommendation(raw: string): {
  scenarios?: Array<{ revenueChangePercent?: number; newEmployeeCount?: number; newEmployeeSalary?: number; label?: string }>;
  interpretation?: string;
} {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    if (start < 0 || end <= start) return {};
    return JSON.parse(raw.slice(start, end + 1)) as {
      scenarios?: Array<{ revenueChangePercent?: number; newEmployeeCount?: number; newEmployeeSalary?: number; label?: string }>;
      interpretation?: string;
    };
  } catch {
    return {};
  }
}
