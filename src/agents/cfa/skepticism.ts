/**
 * Skepticism Layer (Auditor Mode): Flag accounts that grow faster than revenue as Potential Red Flag.
 */

import type { SkepticismRedFlag, SkepticismResult } from './types.js';

export interface AccountWithGrowth {
  accountCode?: string;
  accountName: string;
  currentAmount: number;
  priorAmount: number;
  /** YoY growth (e.g. 0.15 = 15%) */
  growthPercent?: number;
}

/**
 * If a specific account grows faster than revenue, flag as Potential Red Flag for audit.
 */
export function skepticismLayer(
  accounts: AccountWithGrowth[],
  revenueGrowthPercent: number,
  options?: { threshold?: number }
): SkepticismResult {
  const threshold = options?.threshold ?? 0;
  const redFlags: SkepticismRedFlag[] = [];

  for (const acc of accounts) {
    const growth =
      acc.growthPercent ??
      (acc.priorAmount !== 0
        ? ((acc.currentAmount - acc.priorAmount) / Math.abs(acc.priorAmount)) * 100
        : 0);

    if (!Number.isFinite(growth) || !Number.isFinite(revenueGrowthPercent)) continue;

    if (growth > revenueGrowthPercent + threshold) {
      const severity: SkepticismRedFlag['severity'] =
        growth > revenueGrowthPercent + 20 ? 'high' : 'medium';
      redFlags.push({
        accountCode: acc.accountCode,
        accountName: acc.accountName,
        accountGrowthPercent: growth,
        revenueGrowthPercent,
        message: `Account "${acc.accountName}" grew ${growth.toFixed(1)}% YoY vs revenue growth ${revenueGrowthPercent.toFixed(1)}% — Potential Red Flag for audit.`,
        severity,
      });
    }
  }

  const passed = redFlags.length === 0;
  const summary = passed
    ? 'No accounts grew materially faster than revenue; no skepticism flags.'
    : `${redFlags.length} Potential Red Flag(s): account(s) grew faster than revenue. Review for audit.`;

  return { passed, redFlags, summary };
}
