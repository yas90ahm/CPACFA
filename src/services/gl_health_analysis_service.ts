/**
 * GL Health Analysis — 10-check automated quality analysis of uploaded GL data.
 * Runs against core.general_ledger for a given period, scores A-F, persists results.
 */

import type { Pool } from 'pg';

/* ── Interfaces ─────────────────────────────────────────────────── */

interface Finding {
  severity: 'info' | 'warning' | 'critical';
  message: string;
  entryId?: string;
  accountCode?: string;
  amount?: string;
}

interface HealthCheck {
  id: string;
  name: string;
  status: 'pass' | 'warn' | 'fail';
  score: number;
  weight: number;
  findingCount: number;
  findings: Finding[];
  description: string;
}

export interface HealthAnalysisResult {
  overallGrade: string;
  overallScore: number;
  checks: HealthCheck[];
  findingCount: number;
}

/* ── GL line type (from DB) ─────────────────────────────────────── */

interface GLRow {
  id: string;
  entry_id: string;
  line_number: number;
  entry_date: string;
  account_code: string;
  account_name: string | null;
  debit: string;
  credit: string;
  description: string | null;
}

const MAX_FINDINGS = 50;

function cap(findings: Finding[]): Finding[] {
  return findings.slice(0, MAX_FINDINGS);
}

/* ── Period parsing ─────────────────────────────────────────────── */

function parsePeriodBounds(periodLabel: string): { start: Date; end: Date } | null {
  // Formats: "2024-Q1", "2024-01", "Jan 2024", "2024-M03"
  const qMatch = periodLabel.match(/^(\d{4})-Q(\d)$/i);
  if (qMatch) {
    const year = parseInt(qMatch[1]!, 10);
    const q = parseInt(qMatch[2]!, 10);
    const startMonth = (q - 1) * 3;
    const start = new Date(year, startMonth, 1);
    const end = new Date(year, startMonth + 3, 0); // last day of quarter
    return { start, end };
  }

  const mMatch = periodLabel.match(/^(\d{4})-(?:M)?(\d{1,2})$/i);
  if (mMatch) {
    const year = parseInt(mMatch[1]!, 10);
    const month = parseInt(mMatch[2]!, 10) - 1;
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { start, end };
  }

  const namedMatch = periodLabel.match(/^(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s+(\d{4})$/i);
  if (namedMatch) {
    const months: Record<string, number> = {
      jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
      jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
    };
    const month = months[namedMatch[1]!.toLowerCase()]!;
    const year = parseInt(namedMatch[2]!, 10);
    const start = new Date(year, month, 1);
    const end = new Date(year, month + 1, 0);
    return { start, end };
  }

  return null;
}

/* ── Individual checks ──────────────────────────────────────────── */

function checkBalance(rows: GLRow[]): HealthCheck {
  const entryTotals = new Map<string, { debit: number; credit: number }>();
  for (const r of rows) {
    const t = entryTotals.get(r.entry_id) ?? { debit: 0, credit: 0 };
    t.debit += parseFloat(r.debit);
    t.credit += parseFloat(r.credit);
    entryTotals.set(r.entry_id, t);
  }

  const findings: Finding[] = [];
  for (const [entryId, t] of entryTotals) {
    const diff = Math.abs(Math.round((t.debit - t.credit) * 100) / 100);
    if (diff > 0.004) {
      findings.push({
        severity: 'critical',
        message: `Entry ${entryId} is imbalanced: debits=${t.debit.toFixed(2)}, credits=${t.credit.toFixed(2)}, diff=${diff.toFixed(2)}`,
        entryId,
        amount: diff.toFixed(2),
      });
    }
  }

  const score = findings.length === 0 ? 100 : 0;
  return {
    id: 'balance_check',
    name: 'Entry Balance Verification',
    status: findings.length === 0 ? 'pass' : 'fail',
    score,
    weight: 20,
    findingCount: findings.length,
    findings: cap(findings),
    description: findings.length === 0
      ? 'All entries balance (debits = credits).'
      : `${findings.length} entries have imbalanced debits and credits.`,
  };
}

function checkSuspenseAccounts(rows: GLRow[]): HealthCheck {
  const keywords = ['suspense', 'clearing', 'intercompany', 'due to', 'due from'];
  const accountBalances = new Map<string, { code: string; name: string; balance: number }>();

  for (const r of rows) {
    const code = r.account_code.toLowerCase();
    const name = (r.account_name ?? '').toLowerCase();
    const combined = `${code} ${name}`;
    if (keywords.some((kw) => combined.includes(kw))) {
      const key = r.account_code;
      const acct = accountBalances.get(key) ?? { code: r.account_code, name: r.account_name ?? '', balance: 0 };
      acct.balance += parseFloat(r.debit) - parseFloat(r.credit);
      accountBalances.set(key, acct);
    }
  }

  const findings: Finding[] = [];
  for (const [, acct] of accountBalances) {
    if (Math.abs(acct.balance) > 0.004) {
      findings.push({
        severity: 'warning',
        message: `Suspense/clearing account ${acct.code} (${acct.name}) has balance $${acct.balance.toFixed(2)}`,
        accountCode: acct.code,
        amount: acct.balance.toFixed(2),
      });
    }
  }

  const score = findings.length === 0 ? 100 : Math.max(0, 100 - findings.length * 25);
  return {
    id: 'suspense_accounts',
    name: 'Suspense Accounts',
    status: findings.length === 0 ? 'pass' : 'warn',
    score,
    weight: 10,
    findingCount: findings.length,
    findings: cap(findings),
    description: findings.length === 0
      ? 'No open suspense or clearing account balances.'
      : `${findings.length} suspense/clearing accounts have open balances.`,
  };
}

function checkRoundNumbers(rows: GLRow[]): HealthCheck {
  const threshold = 10000;
  const roundLines: Finding[] = [];

  for (const r of rows) {
    const debit = parseFloat(r.debit);
    const credit = parseFloat(r.credit);
    const amt = debit > 0 ? debit : credit;
    if (amt >= threshold && amt % 1000 === 0) {
      roundLines.push({
        severity: 'info',
        message: `Entry ${r.entry_id} line ${r.line_number}: $${amt.toFixed(2)} is a round number`,
        entryId: r.entry_id,
        accountCode: r.account_code,
        amount: amt.toFixed(2),
      });
    }
  }

  const pct = rows.length > 0 ? (roundLines.length / rows.length) * 100 : 0;
  const score = pct > 10 ? Math.max(0, 100 - (pct - 10) * 5) : 100;
  return {
    id: 'round_numbers',
    name: 'Round Number Detection',
    status: pct > 10 ? 'warn' : 'pass',
    score,
    weight: 5,
    findingCount: roundLines.length,
    findings: cap(roundLines),
    description: pct > 10
      ? `${roundLines.length} lines (${pct.toFixed(1)}%) have round numbers > $10,000.`
      : `Round numbers > $10,000 are within normal range (${pct.toFixed(1)}% of lines).`,
  };
}

function checkThresholdPatterns(rows: GLRow[]): HealthCheck {
  const ranges = [
    [4900, 4999],
    [9900, 9999],
    [24900, 24999],
  ] as const;

  const findings: Finding[] = [];
  for (const r of rows) {
    const debit = parseFloat(r.debit);
    const credit = parseFloat(r.credit);
    const amt = debit > 0 ? debit : credit;
    for (const [low, high] of ranges) {
      if (amt >= low && amt <= high) {
        findings.push({
          severity: 'warning',
          message: `Entry ${r.entry_id} line ${r.line_number}: $${amt.toFixed(2)} is just under approval threshold ($${high + 1})`,
          entryId: r.entry_id,
          accountCode: r.account_code,
          amount: amt.toFixed(2),
        });
        break;
      }
    }
  }

  const score = findings.length === 0 ? 100 : Math.max(0, 100 - findings.length * 15);
  return {
    id: 'threshold_patterns',
    name: 'Just-Under-Threshold',
    status: findings.length === 0 ? 'pass' : 'warn',
    score,
    weight: 10,
    findingCount: findings.length,
    findings: cap(findings),
    description: findings.length === 0
      ? 'No entries just under common approval thresholds.'
      : `${findings.length} entries are just under approval thresholds ($5K, $10K, $25K).`,
  };
}

function checkDuplicates(rows: GLRow[]): HealthCheck {
  const seen = new Map<string, GLRow[]>();
  for (const r of rows) {
    const debit = parseFloat(r.debit);
    const credit = parseFloat(r.credit);
    const amt = debit > 0 ? debit : credit;
    const key = `${r.entry_date}|${r.account_code}|${amt.toFixed(2)}`;
    const arr = seen.get(key) ?? [];
    arr.push(r);
    seen.set(key, arr);
  }

  const findings: Finding[] = [];
  for (const [, group] of seen) {
    if (group.length > 1) {
      const r = group[0]!;
      const debit = parseFloat(r.debit);
      const credit = parseFloat(r.credit);
      const amt = debit > 0 ? debit : credit;
      findings.push({
        severity: 'warning',
        message: `${group.length} lines with same date (${r.entry_date}), account (${r.account_code}), amount ($${amt.toFixed(2)})`,
        accountCode: r.account_code,
        amount: amt.toFixed(2),
      });
    }
  }

  const score = findings.length === 0 ? 100 : Math.max(0, 100 - findings.length * 10);
  return {
    id: 'duplicates',
    name: 'Duplicate Detection',
    status: findings.length === 0 ? 'pass' : 'warn',
    score,
    weight: 15,
    findingCount: findings.length,
    findings: cap(findings),
    description: findings.length === 0
      ? 'No duplicate entries detected.'
      : `${findings.length} potential duplicate groups found.`,
  };
}

function checkOutOfPeriod(rows: GLRow[], periodLabel: string): HealthCheck {
  const bounds = parsePeriodBounds(periodLabel);
  if (!bounds) {
    return {
      id: 'out_of_period',
      name: 'Out-of-Period Entries',
      status: 'pass',
      score: 100,
      weight: 10,
      findingCount: 0,
      findings: [],
      description: `Could not parse period bounds from "${periodLabel}". Check skipped.`,
    };
  }

  const findings: Finding[] = [];
  for (const r of rows) {
    const d = new Date(r.entry_date);
    if (d < bounds.start || d > bounds.end) {
      findings.push({
        severity: 'warning',
        message: `Entry ${r.entry_id} dated ${r.entry_date} is outside period ${periodLabel} (${bounds.start.toISOString().slice(0, 10)} to ${bounds.end.toISOString().slice(0, 10)})`,
        entryId: r.entry_id,
      });
    }
  }

  const uniqueEntries = new Set(findings.map((f) => f.entryId)).size;
  const score = uniqueEntries === 0 ? 100 : Math.max(0, 100 - uniqueEntries * 10);
  return {
    id: 'out_of_period',
    name: 'Out-of-Period Entries',
    status: findings.length === 0 ? 'pass' : 'warn',
    score,
    weight: 10,
    findingCount: findings.length,
    findings: cap(findings),
    description: findings.length === 0
      ? 'All entries fall within the expected period.'
      : `${uniqueEntries} entries have dates outside the period.`,
  };
}

function checkUnusualActivity(rows: GLRow[]): HealthCheck {
  const accountStats = new Map<string, { count: number; total: number; code: string; name: string }>();
  for (const r of rows) {
    const s = accountStats.get(r.account_code) ?? { count: 0, total: 0, code: r.account_code, name: r.account_name ?? '' };
    s.count++;
    s.total += parseFloat(r.debit) + parseFloat(r.credit);
    accountStats.set(r.account_code, s);
  }

  const accounts = Array.from(accountStats.values());
  if (accounts.length < 3) {
    return {
      id: 'unusual_activity',
      name: 'Unusual Account Activity',
      status: 'pass',
      score: 100,
      weight: 5,
      findingCount: 0,
      findings: [],
      description: 'Too few accounts to detect outliers.',
    };
  }

  const meanCount = accounts.reduce((s, a) => s + a.count, 0) / accounts.length;
  const stdCount = Math.sqrt(accounts.reduce((s, a) => s + (a.count - meanCount) ** 2, 0) / accounts.length);
  const meanTotal = accounts.reduce((s, a) => s + a.total, 0) / accounts.length;
  const stdTotal = Math.sqrt(accounts.reduce((s, a) => s + (a.total - meanTotal) ** 2, 0) / accounts.length);

  const findings: Finding[] = [];
  for (const a of accounts) {
    if (stdCount > 0 && (a.count - meanCount) / stdCount > 3) {
      findings.push({
        severity: 'info',
        message: `Account ${a.code} (${a.name}) has unusually high entry count: ${a.count} (mean: ${meanCount.toFixed(0)}, 3σ: ${(meanCount + 3 * stdCount).toFixed(0)})`,
        accountCode: a.code,
      });
    }
    if (stdTotal > 0 && (a.total - meanTotal) / stdTotal > 3) {
      findings.push({
        severity: 'info',
        message: `Account ${a.code} (${a.name}) has unusually high total amount: $${a.total.toFixed(2)} (mean: $${meanTotal.toFixed(2)})`,
        accountCode: a.code,
        amount: a.total.toFixed(2),
      });
    }
  }

  const score = findings.length === 0 ? 100 : Math.max(0, 100 - findings.length * 15);
  return {
    id: 'unusual_activity',
    name: 'Unusual Account Activity',
    status: findings.length === 0 ? 'pass' : 'warn',
    score,
    weight: 5,
    findingCount: findings.length,
    findings: cap(findings),
    description: findings.length === 0
      ? 'No accounts with statistically unusual activity.'
      : `${findings.length} accounts show activity > 3 standard deviations from the mean.`,
  };
}

function checkRelatedParty(rows: GLRow[]): HealthCheck {
  const keywords = ['related party', 'officer', 'director', 'shareholder', 'affiliate', 'management fee'];
  const findings: Finding[] = [];

  for (const r of rows) {
    const desc = (r.description ?? '').toLowerCase();
    if (desc && keywords.some((kw) => desc.includes(kw))) {
      const debit = parseFloat(r.debit);
      const credit = parseFloat(r.credit);
      const amt = debit > 0 ? debit : credit;
      findings.push({
        severity: 'warning',
        message: `Entry ${r.entry_id}: "${r.description}" — possible related party transaction`,
        entryId: r.entry_id,
        accountCode: r.account_code,
        amount: amt.toFixed(2),
      });
    }
  }

  const score = findings.length === 0 ? 100 : Math.max(0, 100 - findings.length * 10);
  return {
    id: 'related_party',
    name: 'Related Party Indicators',
    status: findings.length === 0 ? 'pass' : 'warn',
    score,
    weight: 10,
    findingCount: findings.length,
    findings: cap(findings),
    description: findings.length === 0
      ? 'No related party indicators found in descriptions.'
      : `${findings.length} entries contain related party keywords.`,
  };
}

function checkRevenueFlags(rows: GLRow[], periodLabel: string): HealthCheck {
  const bounds = parsePeriodBounds(periodLabel);
  const revenuePatterns = /^4|revenue|sales|income/i;
  const findings: Finding[] = [];

  for (const r of rows) {
    const isRevenue = revenuePatterns.test(r.account_code) || revenuePatterns.test(r.account_name ?? '');
    if (!isRevenue) continue;

    // Revenue reversal: credit side of a revenue account is normal; debit is reversal
    const debit = parseFloat(r.debit);
    if (debit > 0) {
      findings.push({
        severity: 'warning',
        message: `Revenue reversal: Entry ${r.entry_id}, account ${r.account_code}, debit $${debit.toFixed(2)}`,
        entryId: r.entry_id,
        accountCode: r.account_code,
        amount: debit.toFixed(2),
      });
    }

    // Last 3 days of period
    if (bounds) {
      const d = new Date(r.entry_date);
      const daysFromEnd = (bounds.end.getTime() - d.getTime()) / (1000 * 60 * 60 * 24);
      if (daysFromEnd >= 0 && daysFromEnd < 3) {
        const credit = parseFloat(r.credit);
        if (credit > 0) {
          findings.push({
            severity: 'info',
            message: `Late-period revenue: Entry ${r.entry_id}, account ${r.account_code}, $${credit.toFixed(2)} on ${r.entry_date} (last 3 days)`,
            entryId: r.entry_id,
            accountCode: r.account_code,
            amount: credit.toFixed(2),
          });
        }
      }
    }
  }

  const critCount = findings.filter((f) => f.severity === 'warning').length;
  const score = critCount === 0 ? 100 : Math.max(0, 100 - critCount * 15);
  return {
    id: 'revenue_flags',
    name: 'Revenue Recognition Red Flags',
    status: findings.length === 0 ? 'pass' : critCount > 0 ? 'warn' : 'pass',
    score,
    weight: 10,
    findingCount: findings.length,
    findings: cap(findings),
    description: findings.length === 0
      ? 'No revenue recognition red flags detected.'
      : `${findings.length} revenue entries flagged (${critCount} reversals, ${findings.length - critCount} late-period).`,
  };
}

function checkUnusualDescriptions(rows: GLRow[]): HealthCheck {
  const suspectWords = ['test', 'dummy', 'temp', 'fix', 'adjust'];
  const findings: Finding[] = [];

  for (const r of rows) {
    const desc = (r.description ?? '').trim();
    if (!desc) {
      findings.push({
        severity: 'warning',
        message: `Entry ${r.entry_id} line ${r.line_number}: empty description`,
        entryId: r.entry_id,
        accountCode: r.account_code,
      });
      continue;
    }
    if (!desc.includes(' ') && desc.length < 20) {
      findings.push({
        severity: 'info',
        message: `Entry ${r.entry_id} line ${r.line_number}: single-word description "${desc}"`,
        entryId: r.entry_id,
        accountCode: r.account_code,
      });
      continue;
    }
    const lower = desc.toLowerCase();
    for (const word of suspectWords) {
      if (lower.includes(word)) {
        findings.push({
          severity: 'info',
          message: `Entry ${r.entry_id} line ${r.line_number}: description contains "${word}" — "${desc.slice(0, 80)}"`,
          entryId: r.entry_id,
          accountCode: r.account_code,
        });
        break;
      }
    }
  }

  const warnCount = findings.filter((f) => f.severity === 'warning').length;
  const score = warnCount === 0 && findings.length < 5 ? 100 : Math.max(0, 100 - warnCount * 10 - (findings.length - warnCount) * 2);
  return {
    id: 'unusual_descriptions',
    name: 'Unusual Descriptions',
    status: findings.length === 0 ? 'pass' : warnCount > 0 ? 'warn' : 'pass',
    score,
    weight: 5,
    findingCount: findings.length,
    findings: cap(findings),
    description: findings.length === 0
      ? 'All entries have adequate descriptions.'
      : `${findings.length} entries have empty, single-word, or suspect descriptions.`,
  };
}

/* ── Scoring ────────────────────────────────────────────────────── */

function computeGrade(score: number): string {
  if (score >= 90) return 'A';
  if (score >= 80) return 'B';
  if (score >= 70) return 'C';
  if (score >= 60) return 'D';
  return 'F';
}

/* ── Main entry point ───────────────────────────────────────────── */

export async function runGLHealthAnalysis(
  pool: Pool,
  tenantId: string,
  sessionId: string,
  periodLabel: string
): Promise<HealthAnalysisResult> {
  // Fetch GL lines
  const { rows } = await pool.query<GLRow>(
    `SELECT id, entry_id, line_number, entry_date::text, account_code, account_name,
            debit::text, credit::text, description
     FROM core.general_ledger
     WHERE tenant_id = $1 AND period_label = $2
     ORDER BY entry_id, line_number`,
    [tenantId, periodLabel]
  );

  // Run all 10 checks
  const checks: HealthCheck[] = [
    checkBalance(rows),
    checkSuspenseAccounts(rows),
    checkRoundNumbers(rows),
    checkThresholdPatterns(rows),
    checkDuplicates(rows),
    checkOutOfPeriod(rows, periodLabel),
    checkUnusualActivity(rows),
    checkRelatedParty(rows),
    checkRevenueFlags(rows, periodLabel),
    checkUnusualDescriptions(rows),
  ];

  // Weighted average
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const overallScore = totalWeight > 0
    ? Math.round(checks.reduce((s, c) => s + c.score * c.weight, 0) / totalWeight * 10) / 10
    : 100;
  const overallGrade = computeGrade(overallScore);
  const findingCount = checks.reduce((s, c) => s + c.findingCount, 0);

  // Persist (upsert)
  await pool.query(
    `INSERT INTO core.gl_health_analysis (tenant_id, close_session_id, period_label, overall_grade, overall_score, checks, finding_count)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (tenant_id, close_session_id)
     DO UPDATE SET period_label = $3, overall_grade = $4, overall_score = $5, checks = $6, finding_count = $7, created_at = NOW()`,
    [tenantId, sessionId, periodLabel, overallGrade, overallScore, JSON.stringify(checks), findingCount]
  );

  return { overallGrade, overallScore, checks, findingCount };
}
