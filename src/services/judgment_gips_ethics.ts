/**
 * GIPS and ethics protocol: audit portfolio performance for period gaps and cherry-picking.
 * Flag-only; no auto-execute.
 */

import type { Pool } from 'pg';
import type { ProfessionalReviewInput } from '../types/professional_review.js';
import type { CreateProfessionalAuditFlagInput } from '../db/repositories/professional_audit_flags_repository.js';

const MIN_QUARTERS_FOR_GIPS = 4;

/** Parse period label to year and quarter index (1–4). Returns null if not quarterly format. */
function parseQuarterLabel(label: string): { year: number; quarter: number } | null {
  const trimmed = label.trim();
  const match = trimmed.match(/^(\d{4})[-]?Q([1-4])$/i) ?? trimmed.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    const year = parseInt(match[1], 10);
    let quarter = parseInt(match[2], 10);
    if (quarter >= 1 && quarter <= 4) return { year, quarter };
    if (quarter >= 1 && quarter <= 12) return { year, quarter: Math.ceil(quarter / 3) };
  }
  return null;
}

/** Returns true if sorted period labels suggest a gap (e.g. missing quarter in same year). */
function detectPeriodGap(sortedLabels: string[]): boolean {
  const byYear = new Map<number, number[]>();
  for (const label of sortedLabels) {
    const q = parseQuarterLabel(label);
    if (q) {
      let arr = byYear.get(q.year);
      if (!arr) {
        arr = [];
        byYear.set(q.year, arr);
      }
      if (!arr.includes(q.quarter)) arr.push(q.quarter);
    }
  }
  for (const quarters of byYear.values()) {
    quarters.sort((a, b) => a - b);
    for (let i = 1; i < quarters.length; i++) {
      if (quarters[i]! - quarters[i - 1]! > 1) return true;
    }
  }
  return false;
}

/**
 * Run GIPS/ethics protocol: detect gaps in period sequence and short history.
 * Returns flags only.
 */
export async function runGipsEthics(
  input: ProfessionalReviewInput,
  _pool: Pool
): Promise<Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[]> {
  const flags: Omit<CreateProfessionalAuditFlagInput, 'tenantId' | 'periodLabel' | 'runId'>[] = [];

  const byPortfolio = input.portfolioPerformanceByPortfolio;
  if (!byPortfolio || Object.keys(byPortfolio).length === 0) return flags;

  for (const [portfolioId, periods] of Object.entries(byPortfolio)) {
    if (!periods?.length) continue;
    const sorted = [...periods].sort((a, b) => a.periodLabel.localeCompare(b.periodLabel));
    if (sorted.length < MIN_QUARTERS_FOR_GIPS) {
      flags.push({
        category: 'gips_ethics',
        severity: 'medium',
        message: `Portfolio ${portfolioId} has fewer than ${MIN_QUARTERS_FOR_GIPS} periods; may not comply with GIPS.`,
        recommendation: 'Provide full period history and composite definition; avoid survivorship bias.',
        citationStandard: 'GIPS 1.A.4',
      });
    }
    // Detect gaps in period sequence (e.g. missing quarters)
    if (sorted.length >= 2) {
      const hasGap = detectPeriodGap(sorted.map((p) => p.periodLabel));
      if (hasGap) {
        flags.push({
          category: 'gips_ethics',
          severity: 'medium',
          message: `Portfolio ${portfolioId} has gaps in period sequence; may indicate cherry-picking or incomplete history.`,
          recommendation: 'Provide full period history and composite definition per GIPS.',
          citationStandard: 'GIPS 1.A.4',
        });
      }
    }
  }

  return flags;
}
