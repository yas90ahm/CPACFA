/**
 * Accounting standard selector — infer standard from jurisdiction metadata.
 * Standard is determined by reporting country (jurisdiction); where a country
 * allows two frameworks (e.g. Canada: IFRS for publicly accountable, ASPE for private),
 * entity type (e.g. publiclyAccountable) refines the choice.
 * When periodLabel/fiscalYear and pool/tenantId are provided, policy is read for that period (period-scoped).
 */

import type { Pool } from 'pg';
import type { AccountingStandard } from '../constants/accounting/index.js';
import { getPolicyMemory } from '../memory/index.js';

export interface StandardSelectionInput {
  standard?: AccountingStandard;
  entityId?: string;
  country?: string;
  jurisdiction?: string;
  currency?: string;
  taxId?: string;
  businessNumber?: string;
  /** When reporting country is Canada: true → IFRS (publicly accountable), false/omit → ASPE. */
  publiclyAccountable?: boolean;
  /** Period label (e.g. 2024-Q3) for period-scoped policy lookup; fiscal year is derived when possible. */
  periodLabel?: string;
  /** Fiscal year (e.g. 2024) for policy lookup; when periodLabel is set, derived from it if not provided. */
  fiscalYear?: string;
  /** Tenant pool and id for DB-backed policy memory (period-scoped). */
  pool?: Pool;
  tenantId?: string;
}

/** Derive fiscal year from period label (e.g. 2024-Q3 → 2024, 2024-01 → 2024). */
export function fiscalYearFromPeriodLabel(periodLabel: string | undefined): string | undefined {
  if (!periodLabel || !periodLabel.trim()) return undefined;
  const trimmed = periodLabel.trim();
  const match = trimmed.match(/^(\d{4})/);
  return match ? match[1]! : undefined;
}

export async function inferAccountingStandard(input: StandardSelectionInput): Promise<AccountingStandard | undefined> {
  if (input.standard) return input.standard;

  const fiscalYear = input.fiscalYear ?? fiscalYearFromPeriodLabel(input.periodLabel);
  const options = input.pool && input.tenantId ? { pool: input.pool, tenantId: input.tenantId } : undefined;

  if (input.entityId) {
    const memPeriod = fiscalYear != null ? await getPolicyMemory(input.entityId, fiscalYear, options) : null;
    const memDefault = await getPolicyMemory(input.entityId, undefined, options);
    const mem = memPeriod ?? memDefault;
    if (mem?.standard) return mem.standard;
    const merged: StandardSelectionInput = {
      ...input,
      country: input.country ?? mem?.country,
      jurisdiction: input.jurisdiction ?? mem?.jurisdiction,
      currency: input.currency ?? mem?.currency,
      taxId: input.taxId ?? mem?.taxId,
      businessNumber: input.businessNumber ?? mem?.businessNumber,
      publiclyAccountable: input.publiclyAccountable ?? (mem as { publiclyAccountable?: boolean })?.publiclyAccountable,
    };
    input = merged;
  }

  const region = normalize([input.country, input.jurisdiction].join(' '));
  // Canada: publicly accountable entities use IFRS; private use ASPE. If omitted, default to ASPE.
  if (includesAny(region, ['canada', 'ca', 'can'])) {
    return input.publiclyAccountable === true ? 'IFRS' : 'ASPE';
  }
  if (includesAny(region, ['united kingdom', 'uk', 'great britain', 'england', 'scotland', 'wales', 'northern ireland', 'gb'])) {
    return 'FRS102';
  }
  if (includesAny(region, ['united states', 'us', 'usa', 'u.s.'])) return 'US_GAAP';
  if (includesAny(region, ['ifrs', 'international'])) return 'IFRS';

  const currency = normalize(input.currency ?? '');
  if (currency === 'cad') return 'ASPE';
  if (currency === 'gbp') return 'FRS102';
  if (currency === 'usd') return 'US_GAAP';
  if (currency === 'eur') return 'IFRS';

  const taxId = normalize(input.taxId ?? '');
  if (taxId.includes('ein') || taxId.includes('tin') || taxId.includes('ssn')) return 'US_GAAP';
  if (input.businessNumber) return 'ASPE';

  return undefined;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}

function includesAny(value: string, needles: string[]): boolean {
  return needles.some((n) => value.includes(n));
}
