/**
 * Deterministic Pattern Detection Engine
 *
 * Analyzes imbalanced journal entries using rule-based logic.
 * NO AI, NO cost, INSTANT results.
 *
 * Detects ~80% of common patterns:
 * - Single-line entries (missing offset)
 * - Small typos (<10% imbalance)
 * - Round number imbalances (missing lines)
 * - Duplicates or wrong signs
 * - Decimal place errors
 */

import type {
  DetectedPattern,
  ImbalancedEntry,
  PatternDetectionResult,
  PatternId,
} from '../types/pattern_detection.js';

const ROUND_NUMBERS = [10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000, 25000, 50000, 100000];
const SMALL_IMBALANCE_THRESHOLD = 0.1; // 10% of entry total
const MAGNITUDE_MISMATCH_RATIO = 0.1; // Small line < 10% of large line

const UNKNOWN_PATTERN: DetectedPattern = {
  pattern_id: 'unknown',
  confidence: 'low',
  description:
    'No recognized pattern detected. Complex multi-line error or unusual transaction type.',
  likely_cause: 'Complex error requiring manual review',
  suggested_fix_type: 'manual_review',
};

/**
 * Main entry point: Detect patterns in imbalanced entry
 */
export function detectPatterns(entry: ImbalancedEntry): PatternDetectionResult {
  const detectedPatterns: DetectedPattern[] = [];

  const singleLine = detectSingleLine(entry);
  if (singleLine) detectedPatterns.push(singleLine);

  const smallTypo = detectSmallTypo(entry);
  if (smallTypo) detectedPatterns.push(smallTypo);

  const roundImbalance = detectRoundImbalance(entry);
  if (roundImbalance) detectedPatterns.push(roundImbalance);

  const duplicateOrSign = detectDuplicateOrWrongSign(entry);
  if (duplicateOrSign) detectedPatterns.push(duplicateOrSign);

  const magnitudeMismatch = detectMagnitudeMismatch(entry);
  if (magnitudeMismatch) detectedPatterns.push(magnitudeMismatch);

  const primary = selectPrimaryPattern(detectedPatterns);
  const requiresAI = primary.confidence === 'low' || primary.pattern_id === 'unknown';

  return {
    entry,
    patterns: detectedPatterns,
    primary_pattern: primary,
    requires_ai: requiresAI,
  };
}

/**
 * Pattern 1: Single-line entry (missing offsetting entry)
 */
function detectSingleLine(entry: ImbalancedEntry): DetectedPattern | null {
  if (entry.lines.length !== 1) return null;

  const line = entry.lines[0]!;
  const amount = line.debit > 0 ? line.debit : line.credit;
  const side = line.debit > 0 ? 'debit' : 'credit';
  const neededSide = side === 'debit' ? 'credit' : 'debit';
  const absImbalance = Math.abs(entry.imbalance);

  return {
    pattern_id: 'single_line',
    confidence: 'high',
    description: `Entry has only one line (${side} $${amount.toLocaleString()}). Journal entries require offsetting entries.`,
    likely_cause: 'Incomplete entry - missing offsetting line',
    suggested_fix_type: 'add_line',
    metadata: {
      existing_side: side,
      needed_side: neededSide,
      needed_amount: absImbalance,
    },
  };
}

/**
 * Pattern 2: Small imbalance (<10% of entry total - likely data entry typo)
 */
function detectSmallTypo(entry: ImbalancedEntry): DetectedPattern | null {
  const entryTotal = entry.lines.reduce((sum, l) => sum + (l.debit ?? 0) + (l.credit ?? 0), 0);
  if (entryTotal < 0.01) return null;

  const absImbalance = Math.abs(entry.imbalance);
  const imbalanceRatio = absImbalance / entryTotal;

  if (imbalanceRatio >= SMALL_IMBALANCE_THRESHOLD) return null;

  let suspectLine: number | undefined;
  let smallestDiff = Infinity;

  for (const line of entry.lines) {
    const lineAmount = (line.debit ?? 0) + (line.credit ?? 0);
    if (lineAmount < 0.01) continue;
    const diff = Math.abs(lineAmount - absImbalance);
    const diffRatio = diff / lineAmount;

    if (diffRatio < 0.5 && diff < smallestDiff) {
      smallestDiff = diff;
      suspectLine = line.line_number;
    }
  }

  return {
    pattern_id: 'small_typo',
    confidence: 'high',
    description: `Imbalance of $${absImbalance.toLocaleString()} is only ${(imbalanceRatio * 100).toFixed(1)}% of total entry. This suggests a data entry typo.`,
    likely_cause: 'Data entry typo in amount',
    suggested_fix_type: 'correct_amount',
    suspect_line: suspectLine,
    metadata: {
      imbalance_ratio: imbalanceRatio,
      entry_total: entryTotal,
    },
  };
}

/**
 * Pattern 3: Round number imbalance (likely systematic error or missing line)
 */
function detectRoundImbalance(entry: ImbalancedEntry): DetectedPattern | null {
  const absImbalance = Math.abs(entry.imbalance);

  const isRound = ROUND_NUMBERS.some((n) => Math.abs(absImbalance - n) < 0.01);

  if (!isRound) return null;

  const signedImbalance = entry.totalDebits - entry.totalCredits;
  const neededSide = signedImbalance > 0 ? 'credit' : 'debit';

  return {
    pattern_id: 'round_imbalance',
    confidence: 'medium',
    description: `Imbalance is a round number ($${absImbalance.toLocaleString()}). This often indicates a missing line or systematic error.`,
    likely_cause: 'Missing line with round amount',
    suggested_fix_type: 'add_line',
    metadata: {
      round_amount: absImbalance,
      needed_side: neededSide,
    },
  };
}

/**
 * Pattern 4: Imbalance matches one of the line amounts (duplicate or wrong sign)
 */
function detectDuplicateOrWrongSign(entry: ImbalancedEntry): DetectedPattern | null {
  const absImbalance = Math.abs(entry.imbalance);

  for (const line of entry.lines) {
    const lineAmount = (line.debit ?? 0) + (line.credit ?? 0);

    if (Math.abs(lineAmount - absImbalance) < 0.01) {
      return {
        pattern_id: 'duplicate_or_wrong_sign',
        confidence: 'medium',
        description: `Imbalance ($${absImbalance.toLocaleString()}) exactly matches line ${line.line_number} amount. This suggests either a duplicate line or wrong debit/credit side.`,
        likely_cause: 'Duplicate line or incorrect debit/credit classification',
        suggested_fix_type: entry.lines.length > 2 ? 'remove_line' : 'swap_debit_credit',
        suspect_line: line.line_number,
        metadata: {
          matching_line: line.line_number,
          matching_amount: lineAmount,
        },
      };
    }
  }

  return null;
}

/**
 * Pattern 5: Magnitude mismatch (one line much larger - possible decimal place error)
 */
function detectMagnitudeMismatch(entry: ImbalancedEntry): DetectedPattern | null {
  if (entry.lines.length !== 2) return null;

  const amounts = entry.lines.map((l) => (l.debit ?? 0) + (l.credit ?? 0));
  const [small, large] = amounts.sort((a, b) => a - b);
  if (large < 0.01) return null;
  const ratio = small / large;

  if (ratio >= MAGNITUDE_MISMATCH_RATIO) return null;

  const isDecimalError = [0.01, 0.1, 10, 100].some(
    (factor) => Math.abs(small * factor - large) < 0.01
  );

  return {
    pattern_id: 'magnitude_mismatch',
    confidence: 'low',
    description: `One line is ${(1 / ratio).toFixed(0)}x larger than the other. This may indicate a decimal place error.`,
    likely_cause: 'Possible decimal place error',
    suggested_fix_type: 'check_decimal',
    metadata: {
      small_amount: small,
      large_amount: large,
      ratio,
      is_decimal_error: isDecimalError,
    },
  };
}

/** Priority order for same-confidence patterns (more specific first). */
const PATTERN_PRIORITY: Record<PatternId, number> = {
  single_line: 10,
  small_typo: 9,
  duplicate_or_wrong_sign: 8,
  round_imbalance: 7,
  magnitude_mismatch: 6,
  missing_offset: 5,
  multi_line_complex: 4,
  unknown: 0,
};

/**
 * Select primary pattern based on confidence and priority
 */
function selectPrimaryPattern(patterns: DetectedPattern[]): DetectedPattern {
  if (patterns.length === 0) return UNKNOWN_PATTERN;

  const confidenceOrder: Record<'high' | 'medium' | 'low', number> = {
    high: 3,
    medium: 2,
    low: 1,
  };
  const sorted = [...patterns].sort((a, b) => {
    const confDiff = confidenceOrder[b.confidence] - confidenceOrder[a.confidence];
    if (confDiff !== 0) return confDiff;
    return (PATTERN_PRIORITY[b.pattern_id] ?? 0) - (PATTERN_PRIORITY[a.pattern_id] ?? 0);
  });

  return sorted[0]!;
}

/**
 * Get human-readable summary for UI display
 */
export function getSummary(result: PatternDetectionResult): string {
  const p = result.primary_pattern;
  return `${p.description} ${p.likely_cause}.`;
}

/**
 * Get suggested questions to ask user based on pattern
 */
export function getSuggestedQuestions(result: PatternDetectionResult): string[] {
  const p = result.primary_pattern;
  const questions: string[] = [];

  switch (p.pattern_id) {
    case 'single_line':
      questions.push('What type of transaction is this?');
      questions.push('What account should offset this entry?');
      break;

    case 'small_typo':
      if (p.suspect_line != null) {
        questions.push(`Is line ${p.suspect_line} amount correct?`);
      }
      questions.push('Should one of the amounts be different?');
      break;

    case 'round_imbalance':
      questions.push('Is there a missing line in this entry?');
      questions.push('What account and amount is missing?');
      break;

    case 'duplicate_or_wrong_sign':
      if (p.suspect_line != null) {
        questions.push(`Is line ${p.suspect_line} a duplicate?`);
        questions.push(`Should line ${p.suspect_line} be debit instead of credit (or vice versa)?`);
      }
      break;

    case 'magnitude_mismatch':
      questions.push('Is one of the amounts missing a zero?');
      questions.push('Is one of the amounts off by a decimal place?');
      break;

    default:
      questions.push('What happened with this entry?');
      questions.push('Which line has the error?');
  }

  return questions;
}
