/**
 * Statutory vs management view and reconciliation.
 */

import type {
  StatutoryReconciliationInput,
  StatutoryReconciliationResult,
  ManagementStatutoryLine,
} from '../types/statutory_view.js';

export function buildStatutoryReconciliation(
  input: StatutoryReconciliationInput
): StatutoryReconciliationResult {
  const { periodLabel, managementLines, statutoryLines } = input;
  const statutoryByLabel = new Map(statutoryLines.map((l) => [l.label, l.amount]));
  const lines: ManagementStatutoryLine[] = [];
  let totalManagement = 0;
  let totalStatutory = 0;

  for (const m of managementLines) {
    const statAmount = statutoryByLabel.get(m.label) ?? 0;
    const diff = m.amount - statAmount;
    const diffPct = statAmount !== 0 ? (diff / Math.abs(statAmount)) * 100 : undefined;
    lines.push({
      label: m.label,
      managementAmount: m.amount,
      statutoryAmount: statAmount,
      difference: diff,
      differencePercent: diffPct,
    });
    totalManagement += m.amount;
    totalStatutory += statAmount;
  }
  for (const s of statutoryLines) {
    if (!managementLines.some((m) => m.label === s.label)) {
      lines.push({
        label: s.label,
        managementAmount: 0,
        statutoryAmount: s.amount,
        difference: -s.amount,
        differencePercent: -100,
      });
      totalStatutory += s.amount;
    }
  }

  return {
    periodLabel,
    lines,
    totalManagement,
    totalStatutory,
    totalDifference: totalManagement - totalStatutory,
    narrative: undefined,
  };
}
