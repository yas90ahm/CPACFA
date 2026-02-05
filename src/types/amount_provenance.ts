/**
 * Amount provenance for Advisor JE suggestions.
 * Scope: Advisor may propose amounts ONLY if provably sourced from (A) ledger/TB exact match,
 * (B) deterministic TS engine calculation with stored rule/version + inputs, or (C) human-entered.
 * AI is forbidden from inventing or estimating monetary amounts.
 */

/** Provenance for a single monetary amount on a JE line. */
export type AmountProvenance =
  | { kind: 'ledger_exact'; sourceTbRowId?: string; sourceLedgerLineId?: string }
  | { kind: 'engine_calculation'; ruleId: string; ruleVersion: string; inputs?: Record<string, unknown> }
  | { kind: 'human_entered'; enteredBy: string; enteredAt?: string };

/** One debit or credit line with optional provenance. Required for Advisor output to be accepted. */
export interface DebitCreditLineWithProvenance {
  account: string;
  amount: number;
  amountProvenance?: AmountProvenance;
}

export interface ProvenanceValidationResult {
  valid: boolean;
  errors: string[];
}

function isValidProvenance(p: AmountProvenance): boolean {
  if (p.kind === 'ledger_exact') return true;
  if (p.kind === 'engine_calculation') return Boolean(p.ruleId && p.ruleVersion);
  if (p.kind === 'human_entered') return Boolean(p.enteredBy);
  return false;
}

/**
 * Validate that every line with a non-zero amount has valid amountProvenance.
 * Rejects AI output that invents amounts without (A) ledger exact, (B) engine calculation, or (C) human_entered.
 */
export function validateDebitCreditLines(
  lines: DebitCreditLineWithProvenance[],
  lineLabel: string
): ProvenanceValidationResult {
  const errors: string[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const amount = line?.amount;
    if (amount == null || typeof amount !== 'number') continue;
    if (amount === 0) continue;
    const prov = line?.amountProvenance;
    if (!prov || !isValidProvenance(prov)) {
      errors.push(`${lineLabel}[${i}]: amount ${amount} (${line?.account ?? 'unknown'}) has no valid amountProvenance (required: ledger_exact | engine_calculation | human_entered).`);
    }
  }
  return { valid: errors.length === 0, errors };
}

/** JE suggestion shape with debits/credits that may include amountProvenance. */
export interface JESuggestionWithProvenance {
  debits?: DebitCreditLineWithProvenance[];
  credits?: DebitCreditLineWithProvenance[];
}

/**
 * Validate a full JE suggestion: every non-zero amount must have valid provenance.
 */
export function validateJEProvenance(suggestion: JESuggestionWithProvenance): ProvenanceValidationResult {
  const errors: string[] = [];
  const debitsResult = validateDebitCreditLines(suggestion.debits ?? [], 'debits');
  const creditsResult = validateDebitCreditLines(suggestion.credits ?? [], 'credits');
  errors.push(...debitsResult.errors, ...creditsResult.errors);
  return { valid: errors.length === 0, errors };
}

/**
 * Convert HITL adjustment proposals (one debit or credit per item) to lines and validate provenance.
 * Reject AI output without valid amountProvenance for each non-zero amount.
 */
export function validateAdjustmentProposals(
  proposals: Array<{ accountName: string; debit?: number; credit?: number; amountProvenance?: AmountProvenance }>
): ProvenanceValidationResult {
  const lines: DebitCreditLineWithProvenance[] = [];
  for (const p of proposals) {
    if (p.debit != null && p.debit !== 0) {
      lines.push({ account: p.accountName, amount: p.debit, amountProvenance: p.amountProvenance });
    }
    if (p.credit != null && p.credit !== 0) {
      lines.push({ account: p.accountName, amount: p.credit, amountProvenance: p.amountProvenance });
    }
  }
  return validateDebitCreditLines(lines, 'adjustment');
}
