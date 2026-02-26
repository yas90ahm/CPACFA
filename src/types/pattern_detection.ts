/**
 * Types for deterministic pattern detection of imbalanced journal entries.
 */

export type PatternId =
  | 'single_line'
  | 'small_typo'
  | 'round_imbalance'
  | 'duplicate_or_wrong_sign'
  | 'magnitude_mismatch'
  | 'missing_offset'
  | 'multi_line_complex'
  | 'unknown';

export type Confidence = 'high' | 'medium' | 'low';

export interface DetectedPattern {
  pattern_id: PatternId;
  confidence: Confidence;
  description: string;
  likely_cause: string;
  suggested_fix_type:
    | 'correct_amount'
    | 'add_line'
    | 'remove_line'
    | 'swap_debit_credit'
    | 'check_decimal'
    | 'manual_review';
  suspect_line?: number;
  metadata?: Record<string, unknown>;
}

export interface ImbalancedEntry {
  entry_id: string;
  entry_date: string | Date;
  lines: Array<{
    line_number: number;
    account_code: string;
    account_name?: string;
    debit: number;
    credit: number;
    description?: string;
  }>;
  totalDebits: number;
  totalCredits: number;
  imbalance: number;
}

export interface PatternDetectionResult {
  entry: ImbalancedEntry;
  patterns: DetectedPattern[];
  primary_pattern: DetectedPattern;
  requires_ai: boolean;
}
