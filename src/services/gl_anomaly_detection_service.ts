/**
 * GL Anomaly Detection Service
 *
 * Proactively detects anomalies in uploaded General Ledger data
 * BEFORE the controller has to manually review. Purely deterministic
 * rules — no AI needed for detection.
 *
 * Runs automatically on GL upload and surfaces alerts on the dashboard.
 *
 * Anomaly types:
 * 1. NEW_ACCOUNT — account exists in current but not prior period
 * 2. REVERSED_BALANCE — account has opposite normal balance (e.g., negative AR)
 * 3. UNUSUAL_ACTIVITY — account activity >3x prior period (volume spike)
 * 4. SUSPENSE_BALANCE — suspense/clearing/intercompany accounts with remaining balance
 * 5. DUPLICATE_PATTERN — identical amount + description appearing multiple times
 * 6. ROUND_NUMBER — large round-number entries (potential estimates, not actuals)
 * 7. STALE_ACCOUNT — account had balance in prior but zero in current (closed account?)
 */

import type { Pool } from 'pg';

export type AnomalyType =
  | 'NEW_ACCOUNT'
  | 'REVERSED_BALANCE'
  | 'UNUSUAL_ACTIVITY'
  | 'SUSPENSE_BALANCE'
  | 'DUPLICATE_PATTERN'
  | 'ROUND_NUMBER'
  | 'STALE_ACCOUNT';

export type AnomalySeverity = 'critical' | 'warning' | 'info';

export interface GLAnomaly {
  type: AnomalyType;
  severity: AnomalySeverity;
  accountCode: string;
  accountName: string;
  message: string;
  details: Record<string, unknown>;
}

export interface AnomalyDetectionResult {
  anomalies: GLAnomaly[];
  summary: {
    total: number;
    critical: number;
    warning: number;
    info: number;
  };
  accountsScanned: number;
  priorPeriodAvailable: boolean;
}

interface TBEntry {
  accountCode: string;
  accountName: string;
  accountType?: string;
  debit: number;
  credit: number;
}

/** Patterns that identify suspense/clearing accounts */
const SUSPENSE_PATTERNS = [
  /suspense/i, /clearing/i, /inter.?company/i, /due.?(?:to|from)/i,
  /wash/i, /holding/i, /temporary/i, /contra.*(?:revenue|expense)/i,
];

/** Normal balance direction by account type */
const NORMAL_BALANCE: Record<string, 'debit' | 'credit'> = {
  ASSET: 'debit',
  CURRENT_ASSET: 'debit',
  NON_CURRENT_ASSET: 'debit',
  LIABILITY: 'credit',
  CURRENT_LIABILITY: 'credit',
  NON_CURRENT_LIABILITY: 'credit',
  EQUITY: 'credit',
  REVENUE: 'credit',
  EXPENSE: 'debit',
};

/**
 * Detect anomalies in the current period's trial balance compared to prior period.
 * Runs deterministic rules only — no AI, no external calls.
 */
export async function detectAnomalies(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  currentTB: TBEntry[],
  priorTB: TBEntry[] | null
): Promise<AnomalyDetectionResult> {
  const anomalies: GLAnomaly[] = [];
  const priorByCode = new Map<string, TBEntry>();
  if (priorTB) {
    for (const entry of priorTB) {
      priorByCode.set(entry.accountCode, entry);
    }
  }

  for (const entry of currentTB) {
    const net = entry.debit - entry.credit;
    const absNet = Math.abs(net);
    const prior = priorByCode.get(entry.accountCode);

    // 1. NEW_ACCOUNT — not in prior period
    if (priorTB && !prior && absNet > 0) {
      anomalies.push({
        type: 'NEW_ACCOUNT',
        severity: absNet > 100000 ? 'warning' : 'info',
        accountCode: entry.accountCode,
        accountName: entry.accountName,
        message: `New account not present in prior period`,
        details: { netBalance: net },
      });
    }

    // 2. REVERSED_BALANCE — opposite normal balance
    const accountType = (entry.accountType ?? '').toUpperCase();
    const expected = NORMAL_BALANCE[accountType];
    if (expected && absNet > 0) {
      const isReversed =
        (expected === 'debit' && net < -100) ||
        (expected === 'credit' && net > 100);
      if (isReversed) {
        anomalies.push({
          type: 'REVERSED_BALANCE',
          severity: 'warning',
          accountCode: entry.accountCode,
          accountName: entry.accountName,
          message: `${accountType} account has ${net > 0 ? 'debit' : 'credit'} balance (expected ${expected})`,
          details: { netBalance: net, expectedDirection: expected, accountType },
        });
      }
    }

    // 3. UNUSUAL_ACTIVITY — >3x prior period activity
    if (prior) {
      const priorNet = Math.abs(prior.debit - prior.credit);
      if (priorNet > 0 && absNet > priorNet * 3 && absNet > 10000) {
        const multiplier = Math.round(absNet / priorNet * 10) / 10;
        anomalies.push({
          type: 'UNUSUAL_ACTIVITY',
          severity: multiplier > 10 ? 'critical' : 'warning',
          accountCode: entry.accountCode,
          accountName: entry.accountName,
          message: `Activity is ${multiplier}x prior period`,
          details: { currentNet: net, priorNet: prior.debit - prior.credit, multiplier },
        });
      }
    }

    // 4. SUSPENSE_BALANCE — suspense/clearing accounts with balance
    const isSuspense = SUSPENSE_PATTERNS.some((p) => p.test(entry.accountName));
    if (isSuspense && absNet > 1) {
      anomalies.push({
        type: 'SUSPENSE_BALANCE',
        severity: absNet > 50000 ? 'critical' : 'warning',
        accountCode: entry.accountCode,
        accountName: entry.accountName,
        message: `Suspense/clearing account has remaining balance`,
        details: { netBalance: net },
      });
    }

    // 6. ROUND_NUMBER — large round-number entries (potential estimates)
    if (absNet >= 100000 && absNet % 10000 === 0) {
      anomalies.push({
        type: 'ROUND_NUMBER',
        severity: 'info',
        accountCode: entry.accountCode,
        accountName: entry.accountName,
        message: `Large round-number balance may indicate an estimate rather than actual`,
        details: { netBalance: net },
      });
    }

    // 7. STALE_ACCOUNT — had balance in prior, zero now
    if (prior && absNet === 0) {
      const priorAbs = Math.abs(prior.debit - prior.credit);
      if (priorAbs > 10000) {
        anomalies.push({
          type: 'STALE_ACCOUNT',
          severity: 'info',
          accountCode: entry.accountCode,
          accountName: entry.accountName,
          message: `Account had balance in prior period but is now zero — verify closure is intentional`,
          details: { priorNetBalance: prior.debit - prior.credit },
        });
      }
    }
  }

  // 5. DUPLICATE_PATTERN — look for identical amounts appearing 3+ times
  const amountCounts = new Map<string, { count: number; accounts: string[] }>();
  for (const entry of currentTB) {
    const net = entry.debit - entry.credit;
    if (Math.abs(net) < 1000) continue;
    const key = net.toFixed(2);
    const existing = amountCounts.get(key);
    if (existing) {
      existing.count++;
      existing.accounts.push(entry.accountCode);
    } else {
      amountCounts.set(key, { count: 1, accounts: [entry.accountCode] });
    }
  }
  for (const [amount, data] of amountCounts) {
    if (data.count >= 3) {
      anomalies.push({
        type: 'DUPLICATE_PATTERN',
        severity: 'warning',
        accountCode: data.accounts[0],
        accountName: `${data.count} accounts`,
        message: `${data.count} accounts share the same balance — possible duplicate or template error`,
        details: { sharedBalance: Number(amount), accountCodes: data.accounts },
      });
    }
  }

  // Sort: critical first, then warning, then info
  const severityOrder: Record<AnomalySeverity, number> = { critical: 0, warning: 1, info: 2 };
  anomalies.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return {
    anomalies,
    summary: {
      total: anomalies.length,
      critical: anomalies.filter((a) => a.severity === 'critical').length,
      warning: anomalies.filter((a) => a.severity === 'warning').length,
      info: anomalies.filter((a) => a.severity === 'info').length,
    },
    accountsScanned: currentTB.length,
    priorPeriodAvailable: priorTB !== null,
  };
}
