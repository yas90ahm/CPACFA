/**
 * Triage service: materiality threshold, risk score, top risk drivers.
 * Deterministic: same TB + issues => same output.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type { TrialBalanceEntry } from '../types/financial.js';
import type { IssueItem } from '../types/issue_item.js';
import type {
  MaterialityMethod,
  MaterialityOptions,
  MaterialityResult,
  RiskDriver,
  RiskScoreResult,
  TbSummary,
  TriageAssessment,
  TriageSummaryJson,
} from '../types/triage.js';
import * as repo from '../db/repositories/triage_assessment_repository.js';

const REVENUE = 'REVENUE';
const EXPENSE = 'EXPENSE';

/** Derive revenue/expense/debit/credit totals from TB entries. Deterministic. */
export function deriveTbSummary(entries: TrialBalanceEntry[]): TbSummary {
  let totalRevenue = 0;
  let totalExpenses = 0;
  let totalDebits = 0;
  let totalCredits = 0;
  for (const e of entries) {
    const debit = e.debit ?? 0;
    const credit = e.credit ?? 0;
    totalDebits += debit;
    totalCredits += credit;
    const type = e.accountType ?? '';
    if (type === REVENUE) totalRevenue += Math.max(0, credit - debit);
    if (type === EXPENSE) totalExpenses += Math.max(0, debit - credit);
  }
  return { totalRevenue, totalExpenses, totalDebits, totalCredits };
}

/** Compute materiality threshold from TB summary and method. Deterministic. */
export function computeMateriality(
  tbSummary: TbSummary,
  method: MaterialityMethod,
  options: MaterialityOptions
): MaterialityResult {
  const pct = options.percentage ?? 0.05;
  const fixed = options.fixedAmount ?? 0;
  if (method === 'fixed') {
    return {
      materialityThreshold: Math.max(0, fixed),
      basisUsed: `fixed:${fixed}`,
    };
  }
  if (method === 'pct_revenue') {
    const base = Math.max(0, tbSummary.totalRevenue);
    const threshold = base * pct;
    return {
      materialityThreshold: threshold,
      basisUsed: `pct_revenue:${pct * 100}% of ${base}`,
    };
  }
  if (method === 'pct_expenses') {
    const base = Math.max(0, tbSummary.totalExpenses);
    const threshold = base * pct;
    return {
      materialityThreshold: threshold,
      basisUsed: `pct_expenses:${pct * 100}% of ${base}`,
    };
  }
  return { materialityThreshold: 0, basisUsed: 'none' };
}

/** Severity weight for risk score (0–100). Deterministic. */
const SEVERITY_WEIGHT: Record<string, number> = {
  low: 10,
  med: 25,
  high: 45,
  critical: 70,
};

const RESOLVED_STATUSES = ['resolved', 'wont_fix'];

/** Compute risk score 0–100 from issues (severity + impact + unresolved count). Deterministic. */
export function computeRiskScore(
  issues: IssueItem[],
  tbSummary?: TbSummary
): RiskScoreResult {
  const unresolved = issues.filter((i) => !RESOLVED_STATUSES.includes(i.status));
  const drivers: RiskDriver[] = [];
  let rawScore = 0;

  // Severity contribution (max ~50 points from severity)
  let severitySum = 0;
  for (const i of unresolved) {
    const w = SEVERITY_WEIGHT[i.severity] ?? 25;
    severitySum += w;
  }
  const maxSeverity = 50;
  const severityScore = Math.min(maxSeverity, (severitySum / Math.max(1, unresolved.length)) * (unresolved.length / 5));
  rawScore += severityScore;
  if (unresolved.length > 0) {
    drivers.push({
      driver: 'unresolved_issues',
      contribution: Math.round(severityScore),
      detail: `${unresolved.length} unresolved (severity-weighted)`,
    });
  }

  // Impact contribution (max ~35 points): sum of |impactPl|, |impactBs|, |impactCash| relative to materiality or TB size
  let impactSum = 0;
  for (const i of unresolved) {
    const imp = Math.abs(i.impactPl ?? 0) + Math.abs(i.impactBs ?? 0) + Math.abs(i.impactCash ?? 0);
    impactSum += imp;
  }
  const denominator = tbSummary
    ? Math.max(1, tbSummary.totalRevenue + tbSummary.totalExpenses) * 0.01
    : Math.max(1, impactSum);
  const impactRatio = impactSum / denominator;
  const impactScore = Math.min(35, impactRatio * 100);
  rawScore += impactScore;
  if (impactSum > 0) {
    drivers.push({
      driver: 'aggregate_impact',
      contribution: Math.round(impactScore),
      detail: `total impact ${impactSum.toFixed(0)}`,
    });
  }

  // Count penalty (max ~15 points): more unresolved => higher
  const countScore = Math.min(15, unresolved.length * 3);
  rawScore += countScore;
  if (unresolved.length > 0 && !drivers.some((d) => d.driver === 'unresolved_issues')) {
    drivers.push({ driver: 'issue_count', contribution: countScore, detail: `${unresolved.length} open` });
  }

  const riskScore = Math.min(100, Math.round(rawScore));
  drivers.sort((a, b) => b.contribution - a.contribution);
  const topRiskDrivers = drivers.slice(0, 5);

  return { riskScore, topRiskDrivers };
}

/** Get or compute triage for close session; optionally persist. */
export async function getOrComputeTriage(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  opts: {
    tbSummary?: TbSummary;
    issues?: IssueItem[];
    materialityMethod?: MaterialityMethod;
    materialityOptions?: MaterialityOptions;
    persist?: boolean;
  }
): Promise<{ assessment: TriageAssessment; materiality: MaterialityResult; risk: RiskScoreResult }> {
  const tbSummary = opts.tbSummary ?? { totalRevenue: 0, totalExpenses: 0, totalDebits: 0, totalCredits: 0 };
  const issues = opts.issues ?? [];
  const method = opts.materialityMethod ?? 'pct_revenue';
  const materialityOptions = opts.materialityOptions ?? { percentage: 0.05 };

  const materiality = computeMateriality(tbSummary, method, materialityOptions);
  const risk = computeRiskScore(issues, tbSummary);

  const summaryJson: TriageSummaryJson = {
    materiality,
    risk,
    issueCount: issues.length,
    unresolvedCount: issues.filter((i) => !RESOLVED_STATUSES.includes(i.status)).length,
  };

  const assessment: TriageAssessment = {
    id: randomUUID(),
    closeSessionId,
    riskScore: risk.riskScore,
    materialityThreshold: materiality.materialityThreshold,
    basisUsed: materiality.basisUsed,
    summaryJson,
    createdAt: new Date().toISOString(),
  };

  if (opts.persist) {
    await repo.insertTriageAssessment(pool, {
      id: assessment.id,
      closeSessionId,
      riskScore: assessment.riskScore,
      materialityThreshold: assessment.materialityThreshold,
      basisUsed: assessment.basisUsed,
      summaryJson,
    });
  }

  return { assessment, materiality, risk };
}

/** Get latest stored triage assessment for close session. */
export async function getLatestTriage(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<TriageAssessment | null> {
  return repo.getLatestTriageByCloseSessionId(pool, closeSessionId);
}
