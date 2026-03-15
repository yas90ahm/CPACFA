/**
 * XBRL Context Builder — format XBRL search results for inclusion in AI classifier prompts.
 * Used by the classifier prompt to provide XBRL element context alongside COA taxonomy.
 */

import type { XBRLSearchResult } from '../../services/xbrl_search_service.js';

/**
 * Build a human-readable XBRL context block from search results.
 * Designed for inclusion in the classifier user prompt to help the AI
 * select the correct XBRL element for an account.
 */
export function buildXBRLContext(searchResults: XBRLSearchResult[]): string {
  if (searchResults.length === 0) return 'No XBRL matches found.';

  const lines = searchResults.map((r, i) => {
    const docSnippet = r.documentation
      ? r.documentation.substring(0, 200) + (r.documentation.length > 200 ? '...' : '')
      : 'No documentation';
    return `${i + 1}. ${r.id} — "${r.label}" (${r.balanceType}, ${r.statement}) [${(r.similarity * 100).toFixed(0)}% match]\n   ${docSnippet}`;
  });

  return `Top XBRL US GAAP matches for this account:\n${lines.join('\n')}\n\nSelect the best XBRL element. If the top match has >90% similarity, confirm it. For ambiguous accounts, use the XBRL documentation to disambiguate.`;
}

/**
 * Build a compact XBRL context for batch classification (multiple accounts).
 * Returns a shorter format suitable for inclusion in batch prompts.
 */
export function buildXBRLContextCompact(
  accountName: string,
  searchResults: XBRLSearchResult[]
): string {
  if (searchResults.length === 0) return `  "${accountName}": no XBRL matches`;

  const top = searchResults[0];
  const alts = searchResults.slice(1, 3).map((r) => r.id).join(', ');
  return `  "${accountName}": best=${top.id} "${top.label}" (${(top.similarity * 100).toFixed(0)}%)${alts ? ` alts=[${alts}]` : ''}`;
}
