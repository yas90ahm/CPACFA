/**
 * Human-readable text report for precheck board-ready verdict.
 * Deterministic: derived only from the verdict object (no new business logic).
 */

export interface PrecheckVerdictForReport {
  contractVersion: string;
  status: 'ready' | 'not_ready';
  blockers: Array<{
    code: string;
    message: string;
    details: Record<string, unknown>;
    remediation?: string;
  }>;
  warnings: Array<{
    code: string;
    message: string;
    details: Record<string, unknown>;
    remediation?: string;
  }>;
  proofSummary: {
    trialBalanceBalanced: boolean;
    balanceSheetEquationBalanced: boolean;
    plugDetected: boolean;
    roundingToleranceUsed: number;
    computedTotalsSummary: {
      totalDebits: number;
      totalCredits: number;
      totalAssets: number;
      totalLiabilities: number;
      totalEquity: number;
    };
  };
}

/**
 * Renders a short human-readable report from a board-ready verdict.
 * @param verdict - The same object returned as JSON for format=json
 * @param periodLabel - Optional period label (from request) for the header
 */
export function precheckVerdictToText(
  verdict: PrecheckVerdictForReport,
  periodLabel?: string
): string {
  const lines: string[] = [];

  const header = [
    periodLabel != null && periodLabel !== '' ? `Period: ${periodLabel}` : null,
    `Status: ${verdict.status}`,
  ]
    .filter(Boolean)
    .join('  ');
  if (header) lines.push(header);
  lines.push('');

  lines.push('Blockers:');
  if (verdict.blockers.length === 0) {
    lines.push('  None');
  } else {
    for (const b of verdict.blockers) {
      const guidance = b.remediation ?? b.message;
      lines.push(`  - ${b.code}: ${guidance}`);
    }
  }
  lines.push('');

  lines.push('Warnings:');
  if (verdict.warnings.length === 0) {
    lines.push('  None');
  } else {
    for (const w of verdict.warnings) {
      lines.push(`  - ${w.code}: ${w.message}`);
    }
  }
  lines.push('');

  const ps = verdict.proofSummary;
  const tot = ps.computedTotalsSummary ?? {};
  lines.push('Proof summary:');
  lines.push(`  Trial balance balanced: ${ps.trialBalanceBalanced}`);
  lines.push(`  Balance sheet equation balanced: ${ps.balanceSheetEquationBalanced}`);
  lines.push(`  Plug detected: ${ps.plugDetected}`);
  lines.push(`  Rounding tolerance used: ${ps.roundingToleranceUsed}`);
  lines.push(
    `  Totals: Debits ${tot.totalDebits ?? 0}  Credits ${tot.totalCredits ?? 0}  Assets ${tot.totalAssets ?? 0}  Liabilities ${tot.totalLiabilities ?? 0}  Equity ${tot.totalEquity ?? 0}`
  );

  return lines.join('\n');
}
