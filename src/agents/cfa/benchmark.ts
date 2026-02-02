/**
 * Competitor Benchmarking: Web Search for 10-K / financials, relative valuation (P/E, EV/EBITDA).
 */

import type { RelativeValuation } from './types.js';

export type WebSearchFn = (query: string) => Promise<string>;

/**
 * Fetch competitor valuation (P/E, EV/EBITDA) using Web Search for latest 10-K / financials.
 * Returns structured relative valuation; actual data may be parsed from search snippets or mocked if unavailable.
 */
export async function benchmarkCompetitor(
  ticker: string,
  webSearch: WebSearchFn
): Promise<RelativeValuation> {
  const query = `${ticker} 10-K P/E ratio EV EBITDA latest annual`;
  const searchResult = await webSearch(query);

  const result: RelativeValuation = {
    ticker: ticker.toUpperCase(),
    asOfDate: new Date().toISOString().slice(0, 10),
    source: 'Web Search (10-K / financials)',
  };

  const text = (searchResult || '').toLowerCase();
  const peMatch = text.match(/(?:p\/e|pe ratio|price[- ]to[- ]earnings)[:\s]*(\d+\.?\d*)/i)
    || text.match(/(\d+\.?\d*)\s*[x×]\s*(?:earnings|eps)/i);
  if (peMatch) {
    result.peRatio = parseFloat(peMatch[1]);
  }

  const evMatch = text.match(/(?:ev\/ebitda|enterprise value\/ebitda)[:\s]*(\d+\.?\d*)/i)
    || text.match(/(\d+\.?\d*)\s*[x×]\s*ebitda/i);
  if (evMatch) {
    result.evEbitda = parseFloat(evMatch[1]);
  }

  const nameMatch = text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*\(?\s*NASDAQ|NYSE|ticker/i);
  if (nameMatch) {
    result.companyName = nameMatch[1].trim();
  }

  return result;
}
