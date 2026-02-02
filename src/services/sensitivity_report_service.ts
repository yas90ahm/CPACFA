/**
 * CFO Dashboard — Structured sensitivity report (what-if artifact, Stage 4).
 * Aggregates pointed-question and strategic-sandbox scenarios into one report.
 */

import { computeCFOKPIs, runPointedQuestionSensitivity } from './executive_summarizer.js';
import type {
  CFOFinancialSnapshot,
  SensitivityReport,
  SensitivityScenarioSpec,
  SensitivityScenarioResult,
} from '../types/cfo-dashboard.js';

function buildScenarioSnapshot(
  snapshot: CFOFinancialSnapshot,
  opts: { revenueChangePercent?: number; newEmployeeCount?: number; newEmployeeSalary?: number }
): CFOFinancialSnapshot {
  const revenueChangePercent = Number(opts.revenueChangePercent) || 0;
  const newEmployeeCount = Math.max(0, Math.floor(Number(opts.newEmployeeCount) || 0));
  const newEmployeeSalary = Math.max(0, Number(opts.newEmployeeSalary) || 0);
  const revenue = (snapshot.revenue ?? 0) * (1 + revenueChangePercent / 100);
  const extraOpEx = newEmployeeCount * newEmployeeSalary;
  const operatingExpenses = (snapshot.operatingExpenses ?? 0) + extraOpEx;
  const costOfGoodsSold = snapshot.costOfGoodsSold ?? 0;
  const operatingIncome =
    (snapshot.operatingIncome ?? 0) - extraOpEx + (revenue - (snapshot.revenue ?? 0));
  const netIncome =
    (snapshot.netIncome ?? 0) - extraOpEx + (revenue - (snapshot.revenue ?? 0));
  return {
    ...snapshot,
    revenue,
    costOfGoodsSold,
    operatingExpenses,
    operatingIncome: Number.isFinite(operatingIncome)
      ? operatingIncome
      : revenue - costOfGoodsSold - operatingExpenses,
    netIncome: Number.isFinite(netIncome)
      ? netIncome
      : revenue - costOfGoodsSold - operatingExpenses,
  };
}

/**
 * Build a structured sensitivity report from base snapshot and list of scenario specs.
 * Each spec can be a pointed question (e.g. "What if COGS increases by 15%?") or strategic sandbox params (revenue change, new hires).
 */
export function buildSensitivityReport(
  baseSnapshot: CFOFinancialSnapshot,
  scenarioSpecs: SensitivityScenarioSpec[],
  options: { periodLabel?: string } = {}
): SensitivityReport {
  const periodLabel = options.periodLabel ?? baseSnapshot.periodLabel ?? 'Current Period';
  const baseKpis = computeCFOKPIs(baseSnapshot);
  const scenarios: SensitivityScenarioResult[] = [];

  for (const spec of scenarioSpecs) {
    if (spec.question && spec.question.trim()) {
      const pq = runPointedQuestionSensitivity({
        question: spec.question.trim(),
        snapshot: baseSnapshot,
      });
      scenarios.push({
        name: pq.sensitivityCase.scenario,
        assumption: `${pq.interpretedVariable} ${pq.interpretedShock}`,
        baseKpis: {
          burnRate: baseKpis.burnRate,
          runwayMonths: baseKpis.runwayMonths >= 999 ? 999 : baseKpis.runwayMonths,
          breakEvenRevenue: baseKpis.breakEvenRevenue,
        },
        scenarioKpis: {
          burnRate: baseKpis.burnRate,
          runwayMonths: baseKpis.runwayMonths >= 999 ? 999 : baseKpis.runwayMonths,
          breakEvenRevenue: baseKpis.breakEvenRevenue,
        },
        delta: { burnRate: 0, runwayMonths: 0, breakEvenRevenue: 0 },
        marginScenario: pq.sensitivityCase,
        baseMargin: pq.baseCase,
      });
      continue;
    }

    const hasScenario =
      spec.revenueChangePercent != null ||
      (spec.newEmployeeCount != null && spec.newEmployeeCount > 0);
    if (!hasScenario) continue;

    const adjusted = buildScenarioSnapshot(baseSnapshot, {
      revenueChangePercent: spec.revenueChangePercent,
      newEmployeeCount: spec.newEmployeeCount,
      newEmployeeSalary: spec.newEmployeeSalary,
    });
    const scenarioKpis = computeCFOKPIs(adjusted);
    const parts: string[] = [];
    if (spec.revenueChangePercent != null && spec.revenueChangePercent !== 0) {
      parts.push(`Revenue ${spec.revenueChangePercent >= 0 ? '+' : ''}${spec.revenueChangePercent}%`);
    }
    if (spec.newEmployeeCount != null && spec.newEmployeeCount > 0 && spec.newEmployeeSalary != null) {
      parts.push(`${spec.newEmployeeCount} new hire(s) @ $${spec.newEmployeeSalary.toLocaleString()}`);
    }
    const assumption = parts.length > 0 ? parts.join('; ') : 'Custom scenario';

    scenarios.push({
      name: assumption,
      assumption,
      baseKpis: {
        burnRate: baseKpis.burnRate,
        runwayMonths: baseKpis.runwayMonths >= 999 ? 999 : baseKpis.runwayMonths,
        breakEvenRevenue: baseKpis.breakEvenRevenue,
      },
      scenarioKpis: {
        burnRate: scenarioKpis.burnRate,
        runwayMonths: scenarioKpis.runwayMonths >= 999 ? 999 : scenarioKpis.runwayMonths,
        breakEvenRevenue: scenarioKpis.breakEvenRevenue,
      },
      delta: {
        burnRate: scenarioKpis.burnRate - baseKpis.burnRate,
        runwayMonths: (scenarioKpis.runwayMonths >= 999 ? 999 : scenarioKpis.runwayMonths) - (baseKpis.runwayMonths >= 999 ? 999 : baseKpis.runwayMonths),
        breakEvenRevenue:
          (scenarioKpis.breakEvenRevenue ?? 0) - (baseKpis.breakEvenRevenue ?? 0),
      },
    });
  }

  const summaryNarrative =
    scenarios.length === 0
      ? 'No scenarios run.'
      : `Sensitivity report for ${periodLabel}: ${scenarios.length} scenario(s) run. ` +
        scenarios
          .map(
            (s) =>
              `${s.name}: runway ${s.scenarioKpis.runwayMonths.toFixed(1)} mo, burn $${(s.scenarioKpis.burnRate / 1000).toFixed(1)}k/mo`
          )
          .join('; ') +
        '.';

  return {
    periodLabel,
    generatedAt: new Date().toISOString(),
    baseSnapshot,
    scenarios,
    summaryNarrative,
  };
}
