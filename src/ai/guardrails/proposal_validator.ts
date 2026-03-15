/**
 * Guardrail validators for AI-generated resolution proposals.
 * Each assertion returns { passed, errors } — the resolution agent
 * re-plans when any assertion fails (max 3 retries).
 */

import type { Pool } from 'pg';
import { queryGlobal } from '../../knowledge_base/index.js';

export interface ValidationResult {
  passed: boolean;
  errors: string[];
}

export interface ResolutionProposal {
  proposalType: string;
  title: string;
  description: string;
  irac: {
    issue: string;
    rule: string;
    analysis: string;
    conclusion: string;
  };
  citations: string[];
  accountCodes: string[];
  confidence: number;
  sourceEventType: string;
  sourceEventId: string;
}

// --- Individual assertions ---

/**
 * AI must never output numeric dollar amounts — all amounts come
 * from the deterministic engine. This function detects:
 *
 *   1. Dollar amounts with $ sign: $1,234.56, $1234
 *   2. Plain large numbers with commas: 1,234,567.89 (thousands+)
 *   3. Spelled-out currency amounts: "one million dollars", "fifty thousand USD"
 *   4. Non-USD currency symbols: EUR, GBP, JPY, INR, RUB amounts
 *   5. Accounting-format parenthetical negatives: (1,234.56)
 *
 * Exceptions (NOT flagged):
 *   - Percentages: 50%, 12.3%
 *   - Small standalone numbers without commas: "3 items", "step 2"
 *   - Account codes: "Account 4010", "ASC 606"
 *   - Date-like patterns: "2024-01-15", "March 2024"
 */
export function assertNoNumericAmountsInAgentOutput(proposal: ResolutionProposal): ValidationResult {
  const errors: string[] = [];

  // Collect ALL text fields from the proposal, including title and nested fields
  const text = [
    proposal.title,
    proposal.description,
    proposal.irac.issue,
    proposal.irac.rule,
    proposal.irac.analysis,
    proposal.irac.conclusion,
  ].join(' ');

  // 1. Dollar amounts: $1,234.56 or $1234
  const dollarPattern = /\$[\d,]+\.?\d*/g;
  const dollarMatches = text.match(dollarPattern);
  if (dollarMatches && dollarMatches.length > 0) {
    errors.push(`Agent output contains dollar amounts: ${dollarMatches.join(', ')}. AI must not produce numeric amounts.`);
  }

  // 2. Plain large numbers with commas (thousands+): 1,234 or 1,234,567.89
  //    Exclude if preceded by $ (already caught above), or followed by %
  const largeNumberPattern = /(?<!\$)\b\d{1,3}(,\d{3})+(\.\d{2})?\b/g;
  const largeNumberCandidates = text.match(largeNumberPattern);
  if (largeNumberCandidates) {
    // Filter out numbers followed by % (percentages)
    const realAmounts = largeNumberCandidates.filter((m) => {
      const idx = text.indexOf(m);
      const after = text.slice(idx + m.length, idx + m.length + 2).trim();
      return after[0] !== '%';
    });
    if (realAmounts.length > 0) {
      errors.push(`Agent output contains large numeric amounts: ${realAmounts.join(', ')}. AI must not produce numeric amounts.`);
    }
  }

  // 3. Spelled-out currency amounts: "one million dollars", "fifty thousand USD"
  const spelledOutPattern = /\b(one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|thirteen|fourteen|fifteen|sixteen|seventeen|eighteen|nineteen|twenty|thirty|forty|fifty|sixty|seventy|eighty|ninety|hundred|thousand|million|billion)\s+(dollars?|USD)\b/i;
  const spelledOutMatch = text.match(spelledOutPattern);
  if (spelledOutMatch) {
    errors.push(`Agent output contains spelled-out currency amount: "${spelledOutMatch[0]}". AI must not produce numeric amounts.`);
  }

  // 4. Non-USD currency symbols followed by digits
  const foreignCurrencyPattern = /[€£¥₹₽]\s?\d/g;
  const foreignMatches = text.match(foreignCurrencyPattern);
  if (foreignMatches && foreignMatches.length > 0) {
    errors.push(`Agent output contains non-USD currency amounts: ${foreignMatches.join(', ')}. AI must not produce numeric amounts.`);
  }

  // 5. Accounting-format parenthetical amounts: (1,234.56) or ( 1,234,567.89 )
  const parenPattern = /\(\s?\d{1,3}(,\d{3})+(\.\d{2})?\s?\)/g;
  const parenMatches = text.match(parenPattern);
  if (parenMatches && parenMatches.length > 0) {
    errors.push(`Agent output contains parenthetical amounts: ${parenMatches.join(', ')}. AI must not produce numeric amounts.`);
  }

  return { passed: errors.length === 0, errors };
}

/**
 * Check that all referenced account codes exist in the entity's Chart of Accounts.
 */
export async function assertAccountCodesExist(
  pool: Pool,
  tenantId: string,
  proposal: ResolutionProposal
): Promise<ValidationResult> {
  const errors: string[] = [];
  if (proposal.accountCodes.length === 0) {
    return { passed: true, errors };
  }

  try {
    const placeholders = proposal.accountCodes.map((_, i) => `$${i + 2}`).join(', ');
    const { rows } = await pool.query<{ account_code: string }>(
      `SELECT DISTINCT account_code FROM core.trial_balance_rows
       WHERE tenant_id = $1 AND account_code IN (${placeholders})`,
      [tenantId, ...proposal.accountCodes]
    );
    const found = new Set(rows.map((r) => r.account_code));
    for (const code of proposal.accountCodes) {
      if (!found.has(code)) {
        errors.push(`Account code "${code}" does not exist in entity's Chart of Accounts.`);
      }
    }
  } catch (err) {
    errors.push(`Could not verify account codes: ${err instanceof Error ? err.message : String(err)}`);
  }

  return { passed: errors.length === 0, errors };
}

/**
 * Check that cited GAAP/IFRS standards exist in Tier 1 Knowledge Base.
 */
export async function assertValidGAAPCitation(proposal: ResolutionProposal): Promise<ValidationResult> {
  const errors: string[] = [];
  if (proposal.citations.length === 0) {
    return { passed: true, errors };
  }

  try {
    for (const citation of proposal.citations) {
      const results = await queryGlobal(citation, { topK: 1 });
      if (results.length === 0) {
        errors.push(`Citation "${citation}" not found in Tier 1 Knowledge Base (FASB/IFRS/Tax standards).`);
      }
    }
  } catch {
    // KB unavailable — don't block, but warn
    errors.push('Could not validate citations: Knowledge Base unavailable.');
  }

  return { passed: errors.length === 0, errors };
}

/**
 * Ensure proposal type is valid for the originating event type.
 */
const VALID_PROPOSAL_TYPES: Record<string, string[]> = {
  VARIANCE_DETECTED: ['variance_explanation', 'reclassification', 'adjustment_recommendation', 'investigation'],
  RECON_OVER_TOLERANCE: ['reconciliation_action', 'adjustment_recommendation', 'investigation', 'evidence_request'],
  JE_POLICY_VIOLATION: ['policy_remediation', 'reversal_recommendation', 'disclosure_note', 'investigation'],
  SUSPICIOUS_PLUG: ['reclassification', 'investigation', 'adjustment_recommendation'],
  GL_HEALTH_ANOMALY: ['data_correction', 'investigation', 'disclosure_note', 'process_improvement'],
};

export function assertProposalTypeValid(proposal: ResolutionProposal): ValidationResult {
  const errors: string[] = [];
  const validTypes = VALID_PROPOSAL_TYPES[proposal.sourceEventType];
  if (!validTypes) {
    errors.push(`Unknown source event type: ${proposal.sourceEventType}`);
    return { passed: false, errors };
  }
  if (!validTypes.includes(proposal.proposalType)) {
    errors.push(
      `Proposal type "${proposal.proposalType}" is not valid for event "${proposal.sourceEventType}". ` +
      `Valid types: ${validTypes.join(', ')}`
    );
  }
  return { passed: errors.length === 0, errors };
}

// --- Composite validator ---

export async function validateProposal(
  pool: Pool,
  tenantId: string,
  proposal: ResolutionProposal
): Promise<ValidationResult> {
  const allErrors: string[] = [];

  const noAmounts = assertNoNumericAmountsInAgentOutput(proposal);
  allErrors.push(...noAmounts.errors);

  const typeValid = assertProposalTypeValid(proposal);
  allErrors.push(...typeValid.errors);

  const accountsExist = await assertAccountCodesExist(pool, tenantId, proposal);
  allErrors.push(...accountsExist.errors);

  const citationsValid = await assertValidGAAPCitation(proposal);
  allErrors.push(...citationsValid.errors);

  return { passed: allErrors.length === 0, errors: allErrors };
}
