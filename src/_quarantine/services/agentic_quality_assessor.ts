/**
 * Agentic assessor for quality checks and data gaps.
 * Converts deterministic signals into AI-recommended severity and remediation.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { QualityCheck, QualitySeverity } from './quality_checks.js';
import type { DataGap } from '../agents/cpa_brain.js';

export interface AgenticAssessmentItem {
  id: string;
  type: 'quality' | 'gap';
  severity: QualitySeverity;
  rationale: string;
  recommendedAction: string;
}

export interface AgenticQualityAssessment {
  overallSeverity: QualitySeverity;
  summary: string;
  recommendedActions: string[];
  items: AgenticAssessmentItem[];
}

const SYSTEM = [
  'You are a CPA-grade reviewer.',
  'Given deterministic quality checks and data gaps, provide an assessment.',
  'Return ONLY JSON with fields:',
  '{ overallSeverity, summary, recommendedActions, items }.',
  'items = array of { id, type, severity, rationale, recommendedAction }.',
  'Use severity: info|warning|critical.',
  'No extra text.',
].join(' ');

export async function assessAgenticQuality(params: {
  qualityChecks: QualityCheck[];
  dataGaps: DataGap[];
  standard?: string;
}): Promise<AgenticQualityAssessment | null> {
  const prompt = buildPrompt(params);
  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 600,
    parse: parseAssessment,
    fallback: null,
  });
}

function buildPrompt(params: {
  qualityChecks: QualityCheck[];
  dataGaps: DataGap[];
  standard?: string;
}): string {
  const qc = params.qualityChecks.map((c) => ({
    id: c.id,
    severity: c.severity,
    title: c.title,
    message: c.message,
    metric: c.metric,
  }));
  const gaps = params.dataGaps.map((g) => ({
    id: g.id,
    type: g.type,
    title: g.title,
    description: g.description,
    urgency: g.urgency,
    suggestion: g.suggestion,
  }));
  return [
    `Standard: ${params.standard ?? 'unknown'}`,
    `QualityChecks: ${JSON.stringify(qc)}`,
    `DataGaps: ${JSON.stringify(gaps)}`,
    'Return JSON only.',
  ].join('\n');
}

function parseAssessment(raw: string): AgenticQualityAssessment | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const parsed = JSON.parse(slice) as AgenticQualityAssessment;
    if (!parsed || typeof parsed !== 'object') return null;
    if (!parsed.items || !Array.isArray(parsed.items)) return null;
    return parsed;
  } catch {
    return null;
  }
}
