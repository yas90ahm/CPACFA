/**
 * Single source of truth for GL account pattern matching.
 * Used by: coa_mapping_service, mapping_completeness_gate, session_trial_balance_service,
 *          gl_investigation_service, pe_reporting_service, ai_classification_service.
 *
 * Pattern syntax: SQL ILIKE style — % is wildcard, case-insensitive.
 */

/** Convert SQL ILIKE pattern (% wildcards) to a case-insensitive RegExp. */
export function patternToRegExp(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*');
  return new RegExp(`^${escaped}$`, 'i');
}

/** Check if a COA mapping rule matches an account (name + optional code pattern). */
export function ruleMatchesAccount(
  rule: { sourceAccountNamePattern: string; sourceAccountNumberPattern?: string | null },
  accountName: string,
  accountCode?: string
): boolean {
  const nameRe = patternToRegExp(rule.sourceAccountNamePattern);
  if (!nameRe.test((accountName ?? '').trim())) return false;
  if (rule.sourceAccountNumberPattern != null && rule.sourceAccountNumberPattern !== '') {
    const numRe = patternToRegExp(rule.sourceAccountNumberPattern);
    if (!numRe.test((accountCode ?? '').trim())) return false;
  }
  return true;
}
