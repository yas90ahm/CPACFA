/**
 * Agentic narratives for forecasting (forecast vs actual) and capital (payback, ROI).
 * Optional narratives; fallback empty string when LLM unavailable or parse fails.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';

const SYSTEM_FORECAST = [
  'You are an FP&A specialist. Given actual results and a forecast for a period,',
  'write a short narrative (2–4 sentences) comparing forecast vs actual and explaining key drivers or variances.',
  'Return plain text only, no JSON. Be concise.',
].join(' ');

const SYSTEM_CAPITAL = [
  'You are a capital allocation specialist. Given project metrics (payback, ROI, project name),',
  'write a short narrative (1–3 sentences) on payback or ROI suitable for a board or management summary.',
  'Return plain text only, no JSON. Be concise.',
].join(' ');

/**
 * Generate short "forecast vs actual" or driver narrative when actuals exist.
 */
export async function generateForecastVsActualNarrativeAgentic(
  actuals: object,
  forecast: object,
  periodLabel?: string
): Promise<string> {
  const prompt = [
    periodLabel ? `Period: ${periodLabel}.` : '',
    'Actuals (summary): ' + JSON.stringify(actuals),
    'Forecast (summary): ' + JSON.stringify(forecast),
    'Write a short narrative comparing forecast vs actual and key drivers.',
  ]
    .filter(Boolean)
    .join('\n');

  return callLLMWithFallback({
    system: SYSTEM_FORECAST,
    prompt,
    maxTokens: 384,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 1000) || '',
    fallback: '',
  });
}

/**
 * Generate short payback or ROI narrative for a capital project.
 */
export async function generateCapitalProjectNarrativeAgentic(metrics: {
  paybackYears?: number;
  roi?: number;
  projectName?: string;
}): Promise<string> {
  if (
    (metrics.paybackYears == null || Number.isNaN(metrics.paybackYears)) &&
    (metrics.roi == null || Number.isNaN(metrics.roi))
  ) {
    return '';
  }

  const parts: string[] = [];
  if (metrics.projectName) parts.push(`Project: ${metrics.projectName}.`);
  if (metrics.paybackYears != null && !Number.isNaN(metrics.paybackYears)) {
    parts.push(`Payback: ${metrics.paybackYears} year(s).`);
  }
  if (metrics.roi != null && !Number.isNaN(metrics.roi)) {
    parts.push(`ROI: ${metrics.roi}%.`);
  }
  const prompt = parts.join(' ') + '\n\nWrite a short narrative on payback/ROI for management.';

  return callLLMWithFallback({
    system: SYSTEM_CAPITAL,
    prompt,
    maxTokens: 256,
    parse: (raw) => (raw?.trim() ?? '').slice(0, 800) || '',
    fallback: '',
  });
}
