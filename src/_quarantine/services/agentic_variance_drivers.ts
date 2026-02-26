/**
 * CFO Dashboard — Agentic variance driver refinement (volume/price/mix from LLM).
 * Classifies or suggests drivers for variance lines from labels and context.
 */

import { callLLMWithFallback } from '../llm/callWithFallback.js';
import type { VarianceLine, VarianceDriver } from '../types/cfo-dashboard.js';

const SYSTEM = [
  'You are a CFO analyst classifying budget vs actual variance drivers.',
  'For each line, choose the primary driver: volume (quantity/units), price (rate/unit cost), mix (product/customer mix), timing (accruals/one-time), or other.',
  'Return ONLY a JSON array of objects: { "label": string (exact line label), "type": "volume"|"price"|"mix"|"timing"|"other", "description": string (one short sentence) }.',
  'One object per line; label must match the input line label exactly.',
].join(' ');

export interface RefinedDriver {
  label: string;
  type: VarianceDriver['type'];
  description: string;
}

/**
 * Call LLM to refine or classify drivers for variance lines. Returns refined drivers keyed by label.
 * Falls back to existing drivers on parse/LLM failure.
 */
export async function refineVarianceDriversAgentic(
  lines: VarianceLine[]
): Promise<Map<string, RefinedDriver>> {
  const materialOrNonZero = lines.filter((l) => l.material || l.variance !== 0);
  if (materialOrNonZero.length === 0) return new Map();

  const prompt = [
    'Variance lines (label, budget, actual, variance, variancePercent):',
    materialOrNonZero
      .slice(0, 25)
      .map(
        (l) =>
          `"${l.label}" budget=${l.budget} actual=${l.actual} variance=${l.variance} (${l.variancePercent.toFixed(1)}%)`
      )
      .join('\n'),
    'Return JSON array only.',
  ].join('\n');

  return callLLMWithFallback({
    system: SYSTEM,
    prompt,
    maxTokens: 1024,
    parse: (raw) => {
      const parsed = parseDriverResponse(raw);
      const map = new Map<string, RefinedDriver>();
      for (const d of parsed) {
        if (d.label && d.type && d.description) map.set(d.label.trim(), d as RefinedDriver);
      }
      return map;
    },
    fallback: new Map(),
  });
}

/**
 * Merge LLM-refined drivers into variance lines. Returns new lines with drivers updated.
 */
export function mergeRefinedDriversIntoLines(
  lines: VarianceLine[],
  refined: Map<string, RefinedDriver>
): VarianceLine[] {
  return lines.map((line) => {
    const r = refined.get(line.label);
    if (!r || line.variance === 0) return line;
    const drivers: VarianceDriver[] = [
      {
        type: r.type,
        description: r.description,
        estimatedImpact: line.variance,
      },
    ];
    return { ...line, drivers };
  });
}

function parseDriverResponse(raw: string): Array<{ label: string; type: string; description: string }> {
  try {
    const start = raw.indexOf('[');
    const end = raw.lastIndexOf(']');
    if (start < 0 || end <= start) return [];
    const parsed = JSON.parse(raw.slice(start, end + 1)) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (x): x is { label: string; type: string; description: string } =>
        x != null && typeof (x as { label?: unknown }).label === 'string'
    );
  } catch {
    return [];
  }
}
