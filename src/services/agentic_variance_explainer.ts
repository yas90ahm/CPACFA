/**
 * CFO Dashboard — Agentic variance explanation and scenario interpretation (Stage 4).
 * LLM-generated narrative for variance reports and sensitivity/scenario results.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type {
  VarianceReport,
  PointedQuestionSensitivityResult,
  SensitivityReport,
  MultiPeriodVarianceReport,
} from '../types/cfo-dashboard.js';

const VARIANCE_SYSTEM = [
  'You are a CFO analyst explaining budget vs actual variances to management.',
  'Use the provided variance report. Be concise (2–5 sentences).',
  'Highlight the most material variances and possible drivers. Return plain text only, no JSON.',
].join(' ');

const SCENARIO_SYSTEM = [
  'You are a CFO analyst interpreting sensitivity and what-if scenario results.',
  'Summarize what the scenario implies for runway, burn, and margins. Be concise (2–4 sentences). Return plain text only.',
].join(' ');

/**
 * Generate a short narrative explaining the variance report (material lines and drivers).
 */
export async function explainVarianceAgentic(report: VarianceReport): Promise<string> {
  const prompt = [
    `Period: ${report.periodLabel}. Summary: ${report.summaryNarrative}`,
    'Line-level variances (material only):',
    report.lines
      .filter((l) => l.material)
      .slice(0, 15)
      .map(
        (l) =>
          `${l.label}: budget $${l.budget.toLocaleString()}, actual $${l.actual.toLocaleString()}, variance $${l.variance.toLocaleString()} (${l.variancePercent.toFixed(1)}%)${l.drivers?.length ? `; drivers: ${l.drivers.map((d) => d.description).join('; ')}` : ''}`
      )
      .join('\n'),
    'Explain the key variances in plain language for management.',
  ].join('\n');

  return callLLMWithFallback({
    system: VARIANCE_SYSTEM,
    prompt,
    maxTokens: 512,
    parse: (raw) => (raw?.trim() ?? '') || report.summaryNarrative,
    fallback: report.summaryNarrative,
  });
}

/**
 * Generate a short narrative interpreting a single pointed-question sensitivity result.
 */
export async function explainScenarioAgentic(
  result: PointedQuestionSensitivityResult
): Promise<string> {
  const prompt = [
    `Question: ${result.question}`,
    `Interpreted: ${result.interpretedVariable} ${result.interpretedShock}.`,
    `Base case margins: gross ${result.baseCase.grossMarginPercent.toFixed(1)}%, operating ${result.baseCase.operatingMarginPercent.toFixed(1)}%, net ${result.baseCase.netMarginPercent.toFixed(1)}%.`,
    `Scenario margins: gross ${result.sensitivityCase.grossMarginPercent.toFixed(1)}%, operating ${result.sensitivityCase.operatingMarginPercent.toFixed(1)}%, net ${result.sensitivityCase.netMarginPercent.toFixed(1)}%.`,
    'Interpret the impact in plain language for the CFO.',
  ].join('\n');

  return callLLMWithFallback({
    system: SCENARIO_SYSTEM,
    prompt,
    maxTokens: 384,
    parse: (raw) => (raw?.trim() ?? '') || result.narrative,
    fallback: result.narrative,
  });
}

/**
 * Generate a short narrative interpreting a full sensitivity report (multiple scenarios).
 */
export async function explainSensitivityReportAgentic(report: SensitivityReport): Promise<string> {
  const prompt = [
    `Period: ${report.periodLabel}. ${report.summaryNarrative}`,
    'Scenarios:',
    report.scenarios
      .map(
        (s) =>
          `${s.name}: assumption ${s.assumption}; runway ${s.scenarioKpis.runwayMonths.toFixed(1)} mo, burn $${(s.scenarioKpis.burnRate / 1000).toFixed(1)}k/mo`
      )
      .join('\n'),
    'Summarize what management should take away from this sensitivity report.',
  ].join('\n');

  return callLLMWithFallback({
    system: SCENARIO_SYSTEM,
    prompt,
    maxTokens: 512,
    parse: (raw) => (raw?.trim() ?? '') || report.summaryNarrative,
    fallback: report.summaryNarrative,
  });
}

/**
 * Generate a short narrative explaining multi-period variance (period A vs period B actuals).
 */
export async function explainMultiPeriodVarianceAgentic(
  report: MultiPeriodVarianceReport
): Promise<string> {
  const prompt = [
    `Period A (${report.periodALabel}): total $${report.totalPeriodA.toLocaleString()}.`,
    `Period B (${report.periodBLabel}): total $${report.totalPeriodB.toLocaleString()}.`,
    `Variance: $${report.totalVariance.toLocaleString()} (${report.totalVariancePercent.toFixed(1)}%).`,
    'Material line variances:',
    report.lines
      .filter((l) => l.material)
      .slice(0, 12)
      .map(
        (l) =>
          `${l.label}: ${report.periodALabel} $${l.budget.toLocaleString()} → ${report.periodBLabel} $${l.actual.toLocaleString()} (${l.variance >= 0 ? '+' : ''}$${l.variance.toLocaleString()})`
      )
      .join('\n'),
    'Explain the period-over-period moves in plain language for management.',
  ].join('\n');

  const system =
    'You are a CFO analyst explaining period-over-period variance (e.g. Q1 vs Q2 actuals). Be concise (2–5 sentences). Return plain text only.';

  return callLLMWithFallback({
    system,
    prompt,
    maxTokens: 512,
    parse: (raw) => (raw?.trim() ?? '') || report.summaryNarrative,
    fallback: report.summaryNarrative,
  });
}
