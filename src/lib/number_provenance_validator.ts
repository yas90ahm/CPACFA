/**
 * Number Provenance Validator (Layer 3) — enforcement.
 *
 * Every number in an AI response must trace back to the investigation data.
 * Handles formatting differences: $1,234.56, $1.2M, 12.5%, sign flips, sums.
 */

import { from } from '../utils/decimal.js';
import type {
  InvestigationResult,
  AccountDrilldownResult,
  NumberReference,
  ProvenanceResult,
} from '../types/investigation.js';

/* ── Number extraction ────────────────────────────────────────── */

/**
 * Extract all number-like tokens from text:
 *  - Dollar amounts: $1,234.56, $1.2M, $500K, $2B
 *  - Percentages: 12.5%, +15%, -3.2%
 *  - Plain numbers in financial context: 1,234, 50000
 */
function extractNumbers(text: string): string[] {
  const patterns = [
    /\$[\d,]+(?:\.\d+)?(?:\s*[KMBkmb])?/g,          // $1,234.56, $1.2M
    /[+-]?[\d,]+(?:\.\d+)?%/g,                        // 12.5%, -3.2%
    /(?<!\w)[\d,]+(?:\.\d+)?(?:\s*[KMBkmb])(?!\w)/g,  // 1.2M, 500K (no $ prefix)
    /(?<!\w)[\d,]{2,}(?:\.\d+)?(?!\w|%)/g,            // 1,234, 50000 (2+ digits, no unit)
  ];

  const found = new Set<string>();
  for (const pattern of patterns) {
    const matches = text.matchAll(pattern);
    for (const m of matches) {
      found.add(m[0].trim());
    }
  }
  return Array.from(found);
}

/**
 * Normalize a number token to a canonical numeric value (string).
 * Strips $, commas, handles K/M/B suffixes, sign.
 */
function normalizeToValue(token: string): string | null {
  let cleaned = token.replace(/[$,]/g, '').replace(/%$/, '').trim();

  // Handle K/M/B abbreviations
  const abbrevMatch = cleaned.match(/^([+-]?[\d.]+)\s*([KMBkmb])$/);
  if (abbrevMatch) {
    const base = parseFloat(abbrevMatch[1]);
    const suffix = abbrevMatch[2].toUpperCase();
    const multiplier = suffix === 'K' ? 1_000 : suffix === 'M' ? 1_000_000 : 1_000_000_000;
    const value = base * multiplier;
    if (!Number.isFinite(value)) return null;
    return from(value).toDecimalPlaces(2).toFixed(2);
  }

  // Strip leading +
  if (cleaned.startsWith('+')) cleaned = cleaned.slice(1);

  const num = parseFloat(cleaned);
  if (!Number.isFinite(num)) return null;
  return from(num).toDecimalPlaces(2).toFixed(2);
}

/* ── Lookup set builder ───────────────────────────────────────── */

/** Build a set of all valid numeric values (as canonical strings) from investigation data. */
function buildLookupSet(
  investigation: InvestigationResult,
  drilldown?: AccountDrilldownResult,
): Set<string> {
  const values = new Set<string>();

  function add(v: string | number | undefined | null): void {
    if (v == null) return;
    const s = String(v);
    const normalized = from(s).toDecimalPlaces(2).toFixed(2);
    values.add(normalized);
    // Also add absolute value (for sign-flip handling)
    const abs = from(s).abs().toDecimalPlaces(2).toFixed(2);
    values.add(abs);
  }

  // Line-level totals
  add(investigation.currentTotal);
  add(investigation.priorTotal);
  add(investigation.changeAmount);
  add(investigation.changePercent);

  // Metadata
  add(investigation.metadata.accountsAnalyzed);

  // Contributing accounts
  for (const acct of investigation.contributingAccounts) {
    add(acct.currentBalance);
    add(acct.priorBalance);
    add(acct.changeAmount);
    add(acct.changePercent);
    add(acct.percentOfTotalChange);
    if (acct.transactionCount != null) add(acct.transactionCount);
  }

  // Account drilldown
  if (drilldown) {
    add(drilldown.currentBalance);
    add(drilldown.priorBalance);
    add(drilldown.changeAmount);
    add(drilldown.summary.totalEntries);
    add(drilldown.summary.totalDebits);
    add(drilldown.summary.totalCredits);
    add(drilldown.summary.uniqueJournalEntries);
    for (const entry of drilldown.entries) {
      add(entry.debit);
      add(entry.credit);
    }
  }

  // Analytical signals
  if (investigation.analyticalSignals) {
    const sig = investigation.analyticalSignals;
    add(sig.recurringChangeAmount);
    add(sig.nonRecurringChangeAmount);
    add(sig.newAccountCount);
    add(sig.eliminatedAccountCount);
    add(sig.accountsMovingWithTotal);
    add(sig.accountsMovingAgainstTotal);
    for (const r of sig.relatedLineChanges) {
      add(r.changeAmount);
      add(r.changePercent);
    }
  }

  // Pre-compute common sums: top N contributing accounts combined
  const accounts = investigation.contributingAccounts;
  for (let n = 2; n <= Math.min(accounts.length, 5); n++) {
    let sum = from(0);
    for (let i = 0; i < n; i++) {
      sum = sum.plus(accounts[i].changeAmount);
    }
    const sumStr = sum.toDecimalPlaces(2).toFixed(2);
    values.add(sumStr);
    values.add(sum.abs().toDecimalPlaces(2).toFixed(2));
  }

  return values;
}

/* ── Abbreviation tolerance check ─────────────────────────────── */

/**
 * Check if a value matches any lookup value within abbreviation rounding tolerance.
 * e.g., $1.2M for 1,234,567 — the abbreviated value is 1,200,000 which is
 * "close enough" given the abbreviation precision.
 */
function matchesWithAbbreviationTolerance(
  normalizedToken: string,
  lookupSet: Set<string>,
): { matched: boolean; source: string } {
  // Exact match first
  if (lookupSet.has(normalizedToken)) {
    return { matched: true, source: normalizedToken };
  }

  // Check if the token might be an abbreviation of a value in the set
  const tokenNum = parseFloat(normalizedToken);
  if (!Number.isFinite(tokenNum)) return { matched: false, source: '' };

  for (const candidate of lookupSet) {
    const candNum = parseFloat(candidate);
    if (!Number.isFinite(candNum) || candNum === 0) continue;

    // Tolerance: within 5% for large numbers (abbreviation rounding)
    const diff = Math.abs(tokenNum - candNum);
    const pct = diff / Math.abs(candNum);
    if (pct < 0.05 && diff > 0.005) {
      return { matched: true, source: candidate };
    }
  }

  return { matched: false, source: '' };
}

/* ── Main validator ───────────────────────────────────────────── */

export function validateNumberProvenance(
  response: string,
  investigationResult: InvestigationResult,
  accountDrilldown?: AccountDrilldownResult,
): ProvenanceResult {
  const extractedTokens = extractNumbers(response);
  const lookupSet = buildLookupSet(investigationResult, accountDrilldown);

  const numbersFound: NumberReference[] = [];
  const numbersUnverified: string[] = [];

  for (const token of extractedTokens) {
    const normalized = normalizeToValue(token);
    if (normalized === null) {
      // Could not parse — skip non-numeric tokens
      continue;
    }

    // Skip trivially small numbers (1, 2, 3...) that are likely ordinals or counts
    const numVal = Math.abs(parseFloat(normalized));
    if (numVal < 1 && numVal > 0) {
      // Sub-dollar amounts like "0.50" — check provenance
    } else if (numVal < 10 && !token.includes('$') && !token.includes('%')) {
      // Small integers without $ or % are likely prose references ("3 accounts")
      // Still verify if present in lookup
      if (!lookupSet.has(normalized)) {
        continue; // Skip — not a financial figure
      }
    }

    const match = matchesWithAbbreviationTolerance(normalized, lookupSet);
    if (match.matched) {
      numbersFound.push({ value: token, source: match.source, verified: true });
    } else {
      numbersUnverified.push(token);
    }
  }

  return {
    valid: numbersUnverified.length === 0,
    numbersFound,
    numbersUnverified,
    totalNumbersInResponse: numbersFound.length + numbersUnverified.length,
  };
}

/* ── Attribution validator ───────────────────────────────────────── */

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractContextAroundMatch(text: string, needle: string, windowChars: number): string {
  const idx = text.toLowerCase().indexOf(needle.toLowerCase());
  if (idx === -1) return '';
  const start = Math.max(0, idx - windowChars);
  const end = Math.min(text.length, idx + needle.length + windowChars);
  return text.slice(start, end);
}

/**
 * Validate that when AI mentions an account name with a percentage, the percentage
 * matches the actual changePercent or percentOfTotalChange for that account.
 * Catches misattribution (right numbers, wrong account).
 */
export function validateAttribution(
  response: string,
  investigation: InvestigationResult,
): { valid: boolean; issues: string[] } {
  const issues: string[] = [];

  for (const account of investigation.contributingAccounts) {
    const namePattern = new RegExp(escapeRegex(account.accountName), 'i');
    if (!namePattern.test(response)) continue;

    // Extract percentages near the account name mention
    const context = extractContextAroundMatch(response, account.accountName, 120);
    const pctMatches = context.match(/[\d.]+%/g);
    if (!pctMatches) continue;

    for (const pctStr of pctMatches) {
      const pctVal = parseFloat(pctStr);
      if (isNaN(pctVal)) continue;
      const actualPct = Math.abs(parseFloat(account.changePercent));
      const actualShare = Math.abs(parseFloat(account.percentOfTotalChange));
      // Allow if it matches either the change% or the share% (within 0.5% tolerance)
      if (Math.abs(pctVal - actualPct) > 0.5 && Math.abs(pctVal - actualShare) > 0.5) {
        issues.push(
          `${account.accountName}: AI mentioned ${pctStr} but actual change is ${account.changePercent}% ` +
          `and share of total is ${account.percentOfTotalChange}%`
        );
      }
    }
  }

  return { valid: issues.length === 0, issues };
}
