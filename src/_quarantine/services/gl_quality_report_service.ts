/**
 * GL Quality Report Service — unified report combining transaction-level health
 * analysis (gl_health_analysis_service) with account-level intelligence
 * (account_intelligence_service) into a single quality report.
 */

import type { Pool } from 'pg';
import type { HealthAnalysisResult } from './gl_health_analysis_service.js';
import type { AccountAnalysis, AccountFlag } from './account_intelligence_service.js';

/* ── Public interfaces ─────────────────────────────────────────── */

export interface GLQualityReport {
  healthAnalysis: HealthAnalysisResult | null;
  accountAnalysis: AccountAnalysis[];
  overallGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  summary: {
    totalAccounts: number;
    flaggedAccounts: number;
    cleanAccounts: number;
    excludedAccounts: number;
    criticalFlags: number;
    warningFlags: number;
    infoFlags: number;
    autoExcludableCount: number;
    requiresInvestigationCount: number;
  };
  flagsByType: Record<string, number>;
}

/* ── Helper: compute combined grade ────────────────────────────── */

function computeCombinedGrade(
  healthGrade: string | null,
  accountCritical: number,
  accountWarning: number,
): 'A' | 'B' | 'C' | 'D' | 'F' {
  // Account-level grade
  let accountGrade: 'A' | 'B' | 'C' | 'D' | 'F';
  if (accountCritical === 0 && accountWarning <= 2) accountGrade = 'A';
  else if (accountCritical === 0 && accountWarning <= 5) accountGrade = 'B';
  else if (accountCritical <= 2 || accountWarning <= 10) accountGrade = 'C';
  else if (accountCritical <= 5) accountGrade = 'D';
  else accountGrade = 'F';

  // If no health analysis, use account grade only
  if (!healthGrade) return accountGrade;

  const gradeOrder: Record<string, number> = { A: 4, B: 3, C: 2, D: 1, F: 0 };
  const healthScore = gradeOrder[healthGrade] ?? 2;
  const accountScore = gradeOrder[accountGrade] ?? 2;

  // Take the worse of the two grades
  const minScore = Math.min(healthScore, accountScore);
  const reverseMap: Record<number, 'A' | 'B' | 'C' | 'D' | 'F'> = {
    4: 'A', 3: 'B', 2: 'C', 1: 'D', 0: 'F',
  };
  return reverseMap[minScore] ?? 'C';
}

/* ── Main report generator ─────────────────────────────────────── */

export async function generateQualityReport(
  pool: Pool,
  tenantId: string,
  sessionId: string,
): Promise<GLQualityReport> {
  // 1. Fetch stored health analysis
  let healthAnalysis: HealthAnalysisResult | null = null;
  try {
    const { rows } = await pool.query(
      `SELECT overall_grade, overall_score, checks, finding_count
       FROM core.gl_health_analysis
       WHERE tenant_id = $1 AND close_session_id = $2`,
      [tenantId, sessionId],
    );
    if (rows.length > 0) {
      const row = rows[0];
      healthAnalysis = {
        overallGrade: row.overall_grade as string,
        overallScore: parseFloat(row.overall_score as string),
        checks: row.checks as HealthAnalysisResult['checks'],
        findingCount: row.finding_count as number,
      };
    }
  } catch {
    // Table may not exist; continue without health data
  }

  // 2. Fetch stored account analysis
  const accountAnalysis: AccountAnalysis[] = [];
  let excludedCount = 0;
  try {
    const { rows } = await pool.query(
      `SELECT account_code, account_name,
              balance_debit::text AS debit, balance_credit::text AS credit, balance_net::text AS net,
              flags, clean_name, duplicate_of, suggested_contra_of, action_taken
       FROM core.gl_account_analysis
       WHERE tenant_id = $1 AND close_session_id = $2
       ORDER BY account_code`,
      [tenantId, sessionId],
    );
    for (const r of rows) {
      if (r.action_taken === 'excluded') excludedCount++;
      accountAnalysis.push({
        accountCode: r.account_code as string,
        accountName: r.account_name as string,
        balance: {
          debit: r.debit as string,
          credit: r.credit as string,
          net: r.net as string,
        },
        flags: r.flags as AccountFlag[],
        cleanName: r.clean_name as string | undefined,
        duplicateOf: r.duplicate_of as string | undefined,
        suggestedContraOf: r.suggested_contra_of as string | undefined,
      });
    }
  } catch {
    // Table may not exist; continue without account data
  }

  // 3. Compute summary statistics
  let criticalFlags = 0;
  let warningFlags = 0;
  let infoFlags = 0;
  let autoExcludableCount = 0;
  let requiresInvestigationCount = 0;
  const flagsByType: Record<string, number> = {};

  const flaggedAccounts = accountAnalysis.filter((a) => a.flags.length > 0);
  const cleanAccounts = accountAnalysis.filter((a) => a.flags.length === 0);

  for (const account of accountAnalysis) {
    for (const flag of account.flags) {
      if (flag.severity === 'critical') criticalFlags++;
      else if (flag.severity === 'warning') warningFlags++;
      else infoFlags++;

      if (flag.autoExcludable) autoExcludableCount++;
      if (flag.suggestedAction === 'investigate') requiresInvestigationCount++;

      flagsByType[flag.type] = (flagsByType[flag.type] ?? 0) + 1;
    }
  }

  // 4. Compute overall grade (worst of health + account)
  const overallGrade = computeCombinedGrade(
    healthAnalysis?.overallGrade ?? null,
    criticalFlags,
    warningFlags,
  );

  return {
    healthAnalysis,
    accountAnalysis,
    overallGrade,
    summary: {
      totalAccounts: accountAnalysis.length,
      flaggedAccounts: flaggedAccounts.length,
      cleanAccounts: cleanAccounts.length,
      excludedAccounts: excludedCount,
      criticalFlags,
      warningFlags,
      infoFlags,
      autoExcludableCount,
      requiresInvestigationCount,
    },
    flagsByType,
  };
}
