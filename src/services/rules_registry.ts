/**
 * RulesRegistry — reads shared/config/financial_rules.json.
 * Single source of truth for rounding tolerance and materiality; both Node and Python load this file.
 * Values are read from disk on each access so changing the JSON is respected instantly.
 */

import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

export interface FinancialRules {
  roundingTolerance: number;
  materiality: { defaultThreshold: number; description?: string };
  equations?: Record<string, { description?: string; toleranceKey?: string }>;
}

const DEFAULT_ROUNDING_TOLERANCE = 0.01;
const DEFAULT_MATERIALITY_THRESHOLD = 0.01;

function getConfigPath(): string {
  const envPath = process.env.RULES_CONFIG_PATH;
  if (envPath) return envPath;
  return join(process.cwd(), 'shared', 'config', 'financial_rules.json');
}

/**
 * Load financial_rules.json from disk. No caching — each call re-reads so edits take effect immediately.
 */
export function getFinancialRules(): FinancialRules {
  const path = getConfigPath();
  if (!existsSync(path)) {
    return {
      roundingTolerance: DEFAULT_ROUNDING_TOLERANCE,
      materiality: { defaultThreshold: DEFAULT_MATERIALITY_THRESHOLD },
    };
  }
  try {
    const raw = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<FinancialRules>;
    return {
      roundingTolerance:
        typeof parsed.roundingTolerance === 'number' && Number.isFinite(parsed.roundingTolerance)
          ? parsed.roundingTolerance
          : DEFAULT_ROUNDING_TOLERANCE,
      materiality: {
        defaultThreshold:
          typeof parsed.materiality?.defaultThreshold === 'number' &&
          Number.isFinite(parsed.materiality.defaultThreshold)
            ? parsed.materiality.defaultThreshold
            : DEFAULT_MATERIALITY_THRESHOLD,
        description: parsed.materiality?.description,
      },
      equations: parsed.equations,
    };
  } catch {
    return {
      roundingTolerance: DEFAULT_ROUNDING_TOLERANCE,
      materiality: { defaultThreshold: DEFAULT_MATERIALITY_THRESHOLD },
    };
  }
}

/**
 * Rounding tolerance for Debits = Credits and Assets = Liabilities + Equity.
 * Used by integrity gate and any strict equation checks.
 */
export function getRoundingTolerance(): number {
  return getFinancialRules().roundingTolerance;
}

/**
 * Default materiality threshold (e.g. 0.01) for balance and variance checks.
 */
export function getDefaultMateriality(): number {
  return getFinancialRules().materiality.defaultThreshold;
}
