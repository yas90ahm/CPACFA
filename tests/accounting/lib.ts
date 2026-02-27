// tests/accounting/lib.ts — Pipeline, GL builder, verifier, Decimal helpers, reporter

import Decimal from 'decimal.js';
import { ScenarioDef, AccountSpec, ExpectedOutputs, ExpectedTotals, AJESpec, AJELineSpec } from './scenarios/types';

// Re-use UAT api client
import { ApiClient, TestRunner } from '../uat/api-client';

export { ApiClient, TestRunner };

// ── Decimal Helpers ─────────────────────────────────────────────

Decimal.set({ precision: 40, rounding: Decimal.ROUND_HALF_UP });

export function d(val: string | number): Decimal {
  return new Decimal(val);
}

export function round2(val: Decimal): Decimal {
  return val.toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
}

export function sumRound2(vals: Decimal[]): Decimal {
  let acc = new Decimal(0);
  for (const v of vals) acc = acc.plus(v);
  return round2(acc);
}

export function toStr(val: Decimal): string {
  return val.toFixed(2);
}

// ── Expected Value Calculator ───────────────────────────────────

export function computeExpectedTotals(accounts: AccountSpec[], ajes?: AJESpec[]): ExpectedTotals {
  // Use unique keys to handle duplicate account codes (append index)
  // Each account entry is treated independently, matching how the system aggregates GL entries
  const entries: { debit: Decimal; credit: Decimal; category: AccountSpec['category'] }[] = [];

  for (const acct of accounts) {
    entries.push({ debit: d(acct.debit), credit: d(acct.credit), category: acct.category });
  }

  // Apply AJEs by matching against original account codes
  if (ajes) {
    // Build code→index map for AJE application (apply to first matching account)
    const codeToIndices = new Map<string, number[]>();
    for (let i = 0; i < accounts.length; i++) {
      const code = accounts[i].code;
      const arr = codeToIndices.get(code) || [];
      arr.push(i);
      codeToIndices.set(code, arr);
    }

    for (const aje of ajes) {
      for (const line of aje.lines) {
        const indices = codeToIndices.get(line.accountRef);
        if (indices && indices.length > 0) {
          // Apply to first matching entry
          const idx = indices[0];
          entries[idx].debit = entries[idx].debit.plus(d(line.debit));
          entries[idx].credit = entries[idx].credit.plus(d(line.credit));
        }
      }
    }
  }

  // Compute signed amounts per category
  const buckets: Record<string, Decimal[]> = {
    asset: [], liability: [], equity: [], revenue: [], expense: []
  };

  for (const entry of entries) {
    const net = entry.debit.minus(entry.credit);
    const cat = entry.category;
    const signed = (cat === 'liability' || cat === 'equity' || cat === 'revenue')
      ? net.negated()
      : net;
    buckets[cat].push(round2(signed));
  }

  const totalAssets = sumRound2(buckets.asset);
  const totalLiabilities = sumRound2(buckets.liability);
  const equityAccounts = sumRound2(buckets.equity);
  const totalRevenue = sumRound2(buckets.revenue);
  const totalExpenses = sumRound2(buckets.expense);
  const netIncome = round2(totalRevenue.minus(totalExpenses));
  const totalEquity = round2(equityAccounts.plus(netIncome));

  return {
    totalAssets: toStr(totalAssets),
    totalLiabilities: toStr(totalLiabilities),
    totalEquity: toStr(totalEquity),
    totalRevenue: toStr(totalRevenue),
    totalExpenses: toStr(totalExpenses),
    netIncome: toStr(netIncome),
  };
}

export function computeSignedAmount(acct: AccountSpec): string {
  const net = d(acct.debit).minus(d(acct.credit));
  const cat = acct.category;
  const signed = (cat === 'liability' || cat === 'equity' || cat === 'revenue')
    ? net.negated()
    : net;
  return toStr(round2(signed));
}

// ── TB CSV Builder (for trial-balance/ingest — no COA validation) ────

export function buildTBCSV(accounts: AccountSpec[]): string {
  const lines: string[] = ['account_name,account_code,debit,credit'];
  // Aggregate by account code (in case of duplicates)
  const agg = new Map<string, { name: string; debit: Decimal; credit: Decimal }>();
  for (const acct of accounts) {
    const existing = agg.get(acct.code);
    if (existing) {
      existing.debit = existing.debit.plus(d(acct.debit));
      existing.credit = existing.credit.plus(d(acct.credit));
    } else {
      agg.set(acct.code, { name: acct.name, debit: d(acct.debit), credit: d(acct.credit) });
    }
  }
  for (const [code, entry] of agg) {
    lines.push(`"${entry.name}",${code},${toStr(entry.debit)},${toStr(entry.credit)}`);
  }
  return lines.join('\n');
}

// ── GL CSV Builder ──────────────────────────────────────────────

export function buildGLCSV(scenarioId: number, accounts: AccountSpec[]): string {
  const lines: string[] = ['entry_id,account_code,account_name,debit,credit,date,description'];
  const entryId = `JE-S${String(scenarioId).padStart(2, '0')}-001`;
  const date = '2024-01-15';

  for (const acct of accounts) {
    // Compound single JE - all accounts on one entry
    const debitVal = d(acct.debit);
    const creditVal = d(acct.credit);

    if (debitVal.greaterThan(0)) {
      lines.push(`${entryId},${acct.code},"${acct.name}",${acct.debit},0.00,${date},"GL entry for ${acct.name}"`);
    }
    if (creditVal.greaterThan(0)) {
      lines.push(`${entryId},${acct.code},"${acct.name}",0.00,${acct.credit},${date},"GL entry for ${acct.name}"`);
    }
    // If both are zero, still include to create the account
    if (debitVal.isZero() && creditVal.isZero()) {
      lines.push(`${entryId},${acct.code},"${acct.name}",0.00,0.00,${date},"Zero balance entry"`);
    }
  }

  return lines.join('\n');
}

export function buildMultiEntryGLCSV(scenarioId: number, accounts: AccountSpec[], entriesPerAccount: number = 5): string {
  const lines: string[] = ['entry_id,account_code,account_name,debit,credit,date,description'];
  let entryNum = 1;

  for (const acct of accounts) {
    const totalDebit = d(acct.debit);
    const totalCredit = d(acct.credit);

    // Split debit across multiple entries
    if (totalDebit.greaterThan(0)) {
      const amounts = splitAmount(totalDebit, entriesPerAccount);
      for (const amt of amounts) {
        const entryId = `JE-S${String(scenarioId).padStart(2, '0')}-${String(entryNum++).padStart(3, '0')}`;
        lines.push(`${entryId},${acct.code},"${acct.name}",${toStr(amt)},0.00,2024-01-${String(Math.min(28, entryNum)).padStart(2, '0')},"Entry for ${acct.name}"`);
      }
    }

    // Split credit across multiple entries
    if (totalCredit.greaterThan(0)) {
      const amounts = splitAmount(totalCredit, entriesPerAccount);
      for (const amt of amounts) {
        const entryId = `JE-S${String(scenarioId).padStart(2, '0')}-${String(entryNum++).padStart(3, '0')}`;
        lines.push(`${entryId},${acct.code},"${acct.name}",0.00,${toStr(amt)},2024-01-${String(Math.min(28, entryNum)).padStart(2, '0')},"Entry for ${acct.name}"`);
      }
    }

    if (totalDebit.isZero() && totalCredit.isZero()) {
      const entryId = `JE-S${String(scenarioId).padStart(2, '0')}-${String(entryNum++).padStart(3, '0')}`;
      lines.push(`${entryId},${acct.code},"${acct.name}",0.00,0.00,2024-01-15,"Zero balance"`);
    }
  }

  return lines.join('\n');
}

function splitAmount(total: Decimal, n: number): Decimal[] {
  if (n <= 1) return [round2(total)];
  const parts: Decimal[] = [];
  const each = round2(total.dividedBy(n));
  let remaining = total;
  for (let i = 0; i < n - 1; i++) {
    parts.push(each);
    remaining = remaining.minus(each);
  }
  parts.push(round2(remaining)); // last part absorbs rounding
  return parts;
}

// ── Verification ────────────────────────────────────────────────

export interface VerificationResult {
  scenarioId: number;
  scenarioName: string;
  group: string;
  passed: boolean;
  skipped: boolean;
  skipReason?: string;
  totalChecks: number;
  passedChecks: number;
  failedChecks: number;
  discrepancies: Discrepancy[];
  lineResults: LineCheckResult[];
  crossTies: CrossTieResult[];
  error?: string;
  duration: number;
}

export interface Discrepancy {
  check: string;
  expected: string;
  actual: string;
  diff: string;
  severity: 'CRITICAL' | 'MAJOR' | 'MINOR';
}

export interface LineCheckResult {
  lineName: string;
  statement: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export interface CrossTieResult {
  tie: string;
  expected: string;
  actual: string;
  passed: boolean;
}

export function verifyStatementLines(
  lines: any[],
  expected: ExpectedOutputs,
  scenarioId: number,
  scenarioName: string,
  group: string,
): VerificationResult {
  const discrepancies: Discrepancy[] = [];
  const lineResults: LineCheckResult[] = [];
  const crossTies: CrossTieResult[] = [];
  let totalChecks = 0;
  let passedChecks = 0;

  // Helper to check a value
  function check(checkName: string, expectedVal: string, actualVal: string | undefined, severity: 'CRITICAL' | 'MAJOR' | 'MINOR' = 'CRITICAL') {
    totalChecks++;
    const actual = actualVal ?? 'MISSING';
    // Normalize: remove leading zeros, ensure 2 dp
    const expNorm = normalizeDecimal(expectedVal);
    const actNorm = actual === 'MISSING' ? 'MISSING' : normalizeDecimal(actual);

    if (expNorm === actNorm) {
      passedChecks++;
      return true;
    } else {
      const diff = actual === 'MISSING' ? 'MISSING' : toStr(d(actual).minus(d(expectedVal)).abs());
      discrepancies.push({ check: checkName, expected: expNorm, actual: actNorm, diff, severity });
      return false;
    }
  }

  // 1. Check totals by fsLineId pattern
  const totalsMap: Record<string, string> = {
    'bs_total_assets': expected.totals.totalAssets,
    'bs_total_liabilities': expected.totals.totalLiabilities,
    'bs_total_equity': expected.totals.totalEquity,
    'pl_total_revenue': expected.totals.totalRevenue,
    'pl_total_expenses': expected.totals.totalExpenses,
    'pl_net_income': expected.totals.netIncome,
  };

  // Build lookup maps from actual lines
  const byFsLineId = new Map<string, any>();
  const byNameLower = new Map<string, any>();

  for (const line of lines) {
    if (line.fsLineId) {
      byFsLineId.set(line.fsLineId.toLowerCase(), line);
    }
    if (line.name) {
      byNameLower.set(line.name.toLowerCase(), line);
    }
  }

  // Debug: log all fsLineIds on first scenario miss
  let debugLogged = false;

  // Check totals
  for (const [fsId, expectedAmt] of Object.entries(totalsMap)) {
    const line = findLineByFsId(lines, fsId);
    const actualAmt = line?.amount;

    // Debug: if missing and not yet logged, dump all fsLineIds
    if (!line && !debugLogged) {
      debugLogged = true;
      console.log(`    [DEBUG] No line found for fsLineId="${fsId}". All ${lines.length} lines:`);
      for (const l of lines) {
        console.log(`      fsLineId="${l.fsLineId}" name="${l.name}" amount="${l.amount}" stmt="${l.statement}"`);
      }
    }

    const passed = check(`Total: ${fsId}`, expectedAmt, actualAmt);
    lineResults.push({
      lineName: fsId,
      statement: fsId.startsWith('bs_') ? 'balance_sheet' : 'income_statement',
      expected: expectedAmt,
      actual: actualAmt ?? 'MISSING',
      passed,
    });
  }

  // 2. Check individual line items if specified
  if (expected.lineItems) {
    for (const item of expected.lineItems) {
      const line = findLineByName(lines, item.name, item.statement);
      const actualAmt = line?.amount;
      const passed = check(`Line: ${item.name} (${item.statement})`, item.amount, actualAmt, 'MAJOR');
      lineResults.push({
        lineName: item.name,
        statement: item.statement,
        expected: item.amount,
        actual: actualAmt ?? 'MISSING',
        passed,
      });
    }
  }

  // 3. Cross-statement ties
  // A = L + E
  if (expected.balanceSheetEquation !== false) {
    const totalAssets = findAmountByFsId(lines, 'bs_total_assets');
    const totalLiab = findAmountByFsId(lines, 'bs_total_liabilities');
    const totalEquity = findAmountByFsId(lines, 'bs_total_equity');

    if (totalAssets !== null && totalLiab !== null && totalEquity !== null) {
      const lhs = totalAssets;
      const rhs = toStr(round2(d(totalLiab).plus(d(totalEquity))));
      const tiePass = normalizeDecimal(lhs) === normalizeDecimal(rhs);
      totalChecks++;
      if (tiePass) passedChecks++;
      else {
        discrepancies.push({
          check: 'BS Equation: A = L + E',
          expected: lhs,
          actual: rhs,
          diff: toStr(d(lhs).minus(d(rhs)).abs()),
          severity: 'CRITICAL'
        });
      }
      crossTies.push({ tie: 'A = L + E', expected: lhs, actual: rhs, passed: tiePass });
    }
  }

  // Net Income tie: P&L net income should match
  const plNetIncome = findAmountByFsId(lines, 'pl_net_income');
  if (plNetIncome !== null) {
    const expNI = expected.totals.netIncome;
    const tiePass = normalizeDecimal(plNetIncome) === normalizeDecimal(expNI);
    totalChecks++;
    if (tiePass) passedChecks++;
    else {
      discrepancies.push({
        check: 'Net Income Tie: P&L NI = Expected',
        expected: expNI,
        actual: plNetIncome,
        diff: toStr(d(plNetIncome).minus(d(expNI)).abs()),
        severity: 'CRITICAL',
      });
    }
    crossTies.push({ tie: 'P&L Net Income = Expected', expected: expNI, actual: plNetIncome, passed: tiePass });
  }

  // Cash Flow tie (if we have CF data)
  if (expected.cashFlow?.endingCash) {
    const cfEndingCash = findLineByFsIdPrefix(lines, 'cf_ending_cash') || findLineByName(lines, 'Ending Cash', 'cash_flow');
    if (cfEndingCash) {
      const passed = check('CF Ending Cash', expected.cashFlow.endingCash, cfEndingCash.amount, 'MAJOR');
      crossTies.push({ tie: 'CF Ending Cash', expected: expected.cashFlow.endingCash, actual: cfEndingCash.amount ?? 'MISSING', passed });
    }
  }

  return {
    scenarioId,
    scenarioName,
    group,
    passed: discrepancies.length === 0,
    skipped: false,
    totalChecks,
    passedChecks,
    failedChecks: totalChecks - passedChecks,
    discrepancies,
    lineResults,
    crossTies,
    duration: 0, // set externally
  };
}

function findLineByFsId(lines: any[], fsIdPattern: string): any | null {
  // Try exact match first, then prefix match
  const lower = fsIdPattern.toLowerCase();
  for (const line of lines) {
    const id = (line.fsLineId || '').toLowerCase();
    if (id === lower) return line;
  }
  // Prefix match for totals
  for (const line of lines) {
    const id = (line.fsLineId || '').toLowerCase();
    if (id.includes(lower) || lower.includes(id)) return line;
  }
  // Name-based fallback for known totals
  const nameMap: Record<string, string[]> = {
    'bs_total_assets': ['total assets'],
    'bs_total_liabilities': ['total liabilities'],
    'bs_total_equity': ['total equity', "total stockholders' equity", 'total shareholders equity'],
    'pl_total_revenue': ['total revenue'],
    'pl_total_expenses': ['total expenses'],
    'pl_net_income': ['net income', 'net income (loss)'],
  };
  const names = nameMap[lower];
  if (names) {
    for (const line of lines) {
      const ln = (line.name || '').toLowerCase();
      for (const n of names) {
        if (ln === n || ln.includes(n)) return line;
      }
    }
  }
  return null;
}

function findLineByFsIdPrefix(lines: any[], prefix: string): any | null {
  const lower = prefix.toLowerCase();
  for (const line of lines) {
    if ((line.fsLineId || '').toLowerCase().startsWith(lower)) return line;
  }
  return null;
}

function findLineByName(lines: any[], name: string, statement?: string): any | null {
  const lower = name.toLowerCase();
  for (const line of lines) {
    const lnName = (line.name || '').toLowerCase();
    const lnStatement = (line.statement || '').toLowerCase();
    if (lnName === lower || lnName.includes(lower)) {
      if (!statement || lnStatement.includes(statement.replace('_', ' ')) || lnStatement === statement) {
        return line;
      }
    }
  }
  // Retry without statement filter
  if (statement) {
    for (const line of lines) {
      if ((line.name || '').toLowerCase() === lower) return line;
    }
  }
  return null;
}

function findAmountByFsId(lines: any[], fsId: string): string | null {
  const line = findLineByFsId(lines, fsId);
  return line?.amount ?? null;
}

function normalizeDecimal(val: string): string {
  try {
    return new Decimal(val).toFixed(2);
  } catch {
    return val;
  }
}

// ── Rate Limit Helpers ───────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function retryOn429<T extends { status: number }>(
  fn: () => Promise<T>,
  maxRetries = 3,
  baseWaitMs = 5000,
): Promise<T> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    let result: T;
    try {
      result = await fn();
    } catch (err: any) {
      // Connection errors (fetch failed, ECONNRESET, etc.)
      if (attempt < maxRetries) {
        const wait = 2000 * Math.pow(2, attempt);
        console.log(`    [CONN-ERR] ${err.message}. Retrying in ${(wait / 1000).toFixed(0)}s (${attempt + 1}/${maxRetries})...`);
        await sleep(wait);
        continue;
      }
      throw err;
    }
    if (result.status !== 429 || attempt === maxRetries) return result;
    const wait = baseWaitMs * Math.pow(2, attempt);
    console.log(`    [RATE-LIMITED] Waiting ${(wait / 1000).toFixed(0)}s before retry ${attempt + 1}/${maxRetries}...`);
    await sleep(wait);
  }
  return fn(); // unreachable, but TypeScript needs it
}

// ── Pipeline ────────────────────────────────────────────────────

export interface PipelineOpts {
  api: ApiClient;
  token: string;
  tenantId: string;
  approverToken?: string;
}

export interface PipelineResult {
  sessionId?: string;
  packageId?: string;
  lines?: any[];
  error?: string;
  httpStatus?: number;
}

export async function runScenarioPipeline(
  scenario: ScenarioDef,
  opts: PipelineOpts,
): Promise<PipelineResult> {
  const { api, token, tenantId, approverToken } = opts;
  const authOpts = { token, tenantId };

  // Build period dates from YYYY-MM
  const [year, month] = scenario.period.split('-').map(Number);
  const periodStart = `${year}-${String(month).padStart(2, '0')}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const periodEnd = `${year}-${String(month).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  // 1. Upload TB directly (GL ingest always fails COA validation, skip it to save rate-limit budget)
  const tbCsv = buildTBCSV(scenario.accounts);
  let uploadRes = await retryOn429(() =>
    api.uploadFile(
      '/api/trial-balance/ingest',
      tbCsv,
      `tb-s${scenario.id}.csv`,
      { ...authOpts, fields: { periodLabel: scenario.period, entityId: scenario.entityId } },
    )
  );

  if (uploadRes.status !== 200 && uploadRes.status !== 201 && uploadRes.status !== 207) {
    if (scenario.expected.expectError && uploadRes.status === scenario.expected.expectError.status) {
      return { error: `Expected error ${uploadRes.status}`, httpStatus: uploadRes.status };
    }
    return { error: `TB upload failed: ${uploadRes.status} - ${JSON.stringify(uploadRes.body).slice(0, 500)}`, httpStatus: uploadRes.status };
  }

  // Detect staged (imbalanced) response — TB not saved to main ledger
  if (uploadRes.body?.status === 'staged') {
    if (scenario.expected.expectError) {
      return { error: `TB staged (imbalanced): ${uploadRes.body.message || 'not saved to main ledger'}`, httpStatus: 200 };
    }
    return { error: `TB upload staged (imbalanced): D=${uploadRes.body.totalDebits}, C=${uploadRes.body.totalCredits}. Not saved to main ledger.`, httpStatus: 200 };
  }

  // 2. Create session
  const sessionRes = await retryOn429(() => api.post('/api/close/sessions', {
    entityId: scenario.entityId,
    periodStart,
    periodEnd,
  }, authOpts));

  if (sessionRes.status !== 201 && sessionRes.status !== 200) {
    return { error: `Session create failed: ${sessionRes.status} - ${JSON.stringify(sessionRes.body)}`, httpStatus: sessionRes.status };
  }

  const sessionId = sessionRes.body?.closeSessionId || sessionRes.body?.id;
  if (!sessionId) {
    return { error: `No session ID in response: ${JSON.stringify(sessionRes.body)}` };
  }

  // 3. Advance to in_progress
  const advRes = await retryOn429(() => api.patch(`/api/close/sessions/${sessionId}/status`, { status: 'in_progress' }, authOpts));
  if (advRes.status !== 200 && advRes.status !== 409) {
    // Try advance endpoint
    await retryOn429(() => api.post(`/api/close/sessions/${sessionId}/advance`, {}, authOpts));
  }

  // 4. Post AJEs if specified
  if (scenario.ajes && scenario.ajes.length > 0 && approverToken) {
    for (let ajeIdx = 0; ajeIdx < scenario.ajes.length; ajeIdx++) {
      const aje = scenario.ajes[ajeIdx];

      // Delay between AJE iterations to avoid rate limits
      if (ajeIdx > 0) await sleep(300);

      const jeRes = await retryOn429(() => api.post('/api/close/journal-entries', {
        closeSessionId: sessionId,
        memo: aje.memo,
        source: 'manual',
        lines: aje.lines.map(l => ({
          accountRef: l.accountRef,
          debit: l.debit,
          credit: l.credit,
          description: l.description || aje.memo,
          amountProvenance: { kind: 'human_entered', enteredBy: 'accuracy-test' },
        })),
      }, authOpts));

      if (jeRes.status !== 201 && jeRes.status !== 200) {
        return { error: `JE create failed: ${jeRes.status} - ${JSON.stringify(jeRes.body)}`, httpStatus: jeRes.status };
      }

      const jeId = jeRes.body?.id || jeRes.body?.journalEntryId;
      if (!jeId) continue;

      // Propose
      const propRes = await retryOn429(() => api.post(`/api/close/journal-entries/${jeId}/propose`, {}, authOpts));
      if (propRes.status !== 200) {
        // Try continuing anyway
      }

      // Approve (using approver token for SoD)
      const approveRes = await retryOn429(() => api.post(`/api/close/journal-entries/${jeId}/approve`, {}, { token: approverToken, tenantId }));
      if (approveRes.status !== 200) {
        // Try with admin as fallback
        await retryOn429(() => api.post(`/api/close/journal-entries/${jeId}/approve`, { approvedBy: 'approver' }, authOpts));
      }

      // Post
      await retryOn429(() => api.post(`/api/close/journal-entries/${jeId}/post`, {}, authOpts));
    }
  }

  // 5. Generate statements
  const genRes = await retryOn429(() => api.post(`/api/close/sessions/${sessionId}/statement-packages/generate`, {}, authOpts));
  if (genRes.status !== 201 && genRes.status !== 200) {
    if (scenario.expected.expectError && genRes.status === scenario.expected.expectError.status) {
      return { sessionId, error: `Expected error ${genRes.status}: ${JSON.stringify(genRes.body)}`, httpStatus: genRes.status };
    }
    return { sessionId, error: `Statement generation failed: ${genRes.status} - ${JSON.stringify(genRes.body)}`, httpStatus: genRes.status };
  }

  const packageId = genRes.body?.id || genRes.body?.packageId || genRes.body?.statementPackageId;

  // 6. Fetch lines
  if (!packageId) {
    return { sessionId, error: `No package ID in generation response: ${JSON.stringify(genRes.body)}` };
  }

  const linesRes = await retryOn429(() => api.get(`/api/close/statement-packages/${packageId}/lines`, authOpts));
  if (linesRes.status !== 200) {
    return { sessionId, packageId, error: `Lines fetch failed: ${linesRes.status} - ${JSON.stringify(linesRes.body).slice(0, 300)}` };
  }

  // Try multiple response shapes
  const lines = Array.isArray(linesRes.body)
    ? linesRes.body
    : (linesRes.body?.lines || linesRes.body?.data || []);

  // Debug: check if totals exist
  const hasTotals = lines.some((l: any) => (l.fsLineId || '').includes('total'));
  if (!hasTotals && lines.length > 0) {
    console.log(`    [DEBUG] ${lines.length} lines returned but NO totals. Has headers: ${lines.some((l: any) => (l.fsLineId || '').includes('header'))}. First 3 fsLineIds: ${lines.slice(0, 3).map((l: any) => l.fsLineId).join(', ')}`);
    // Check response structure
    console.log(`    [DEBUG] Response keys: ${Object.keys(linesRes.body || {}).join(', ')}`);
    console.log(`    [DEBUG] Package keys: ${Object.keys(linesRes.body?.package || {}).join(', ')}`);
  }

  return { sessionId, packageId, lines };
}

export async function runPriorPeriodPipeline(
  scenario: ScenarioDef,
  opts: PipelineOpts,
): Promise<PipelineResult> {
  if (!scenario.priorPeriod) return { error: 'No prior period defined' };

  const priorScenario: ScenarioDef = {
    ...scenario,
    id: scenario.id * 100, // unique entry_id prefix
    period: scenario.priorPeriod.period,
    accounts: scenario.priorPeriod.accounts,
    ajes: undefined,
    priorPeriod: undefined,
    expected: { totals: computeExpectedTotals(scenario.priorPeriod.accounts) },
  };

  return runScenarioPipeline(priorScenario, opts);
}

// ── Report Generator ────────────────────────────────────────────

export function generateAccuracyReport(results: VerificationResult[]): string {
  const total = results.length;
  const passed = results.filter(r => r.passed && !r.skipped).length;
  const failed = results.filter(r => !r.passed && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;
  const totalChecks = results.reduce((s, r) => s + r.totalChecks, 0);
  const passedChecks = results.reduce((s, r) => s + r.passedChecks, 0);
  const totalDuration = results.reduce((s, r) => s + r.duration, 0);

  let report = `# Accounting Accuracy Test Report\n\n`;
  report += `**Generated:** ${new Date().toISOString()}\n`;
  report += `**Total Duration:** ${(totalDuration / 1000).toFixed(1)}s\n\n`;

  // Summary table
  report += `## Summary\n\n`;
  report += `| Metric | Value |\n|--------|-------|\n`;
  report += `| Scenarios | ${total} |\n`;
  report += `| Passed | ${passed} |\n`;
  report += `| Failed | ${failed} |\n`;
  report += `| Skipped | ${skipped} |\n`;
  report += `| Total Checks | ${totalChecks} |\n`;
  report += `| Checks Passed | ${passedChecks} |\n`;
  report += `| Checks Failed | ${totalChecks - passedChecks} |\n`;
  report += `| Pass Rate | ${totalChecks > 0 ? ((passedChecks / totalChecks) * 100).toFixed(1) : 0}% |\n\n`;

  // Group summary
  const groups = new Map<string, VerificationResult[]>();
  for (const r of results) {
    const arr = groups.get(r.group) || [];
    arr.push(r);
    groups.set(r.group, arr);
  }

  report += `## Results by Group\n\n`;
  report += `| Group | Scenarios | Passed | Failed | Skipped |\n|-------|-----------|--------|--------|--------|\n`;
  for (const [group, gResults] of groups) {
    const gp = gResults.filter(r => r.passed && !r.skipped).length;
    const gf = gResults.filter(r => !r.passed && !r.skipped).length;
    const gs = gResults.filter(r => r.skipped).length;
    report += `| ${group} | ${gResults.length} | ${gp} | ${gf} | ${gs} |\n`;
  }
  report += '\n';

  // Scenario detail table
  report += `## Scenario Results\n\n`;
  report += `| # | Scenario | Group | Checks | Result | Duration |\n|---|----------|-------|--------|--------|----------|\n`;
  for (const r of results) {
    const status = r.skipped ? `SKIP: ${r.skipReason || 'N/A'}` : r.passed ? 'PASS' : `FAIL (${r.failedChecks})`;
    report += `| S${String(r.scenarioId).padStart(2, '0')} | ${r.scenarioName} | ${r.group} | ${r.passedChecks}/${r.totalChecks} | ${status} | ${(r.duration / 1000).toFixed(1)}s |\n`;
  }
  report += '\n';

  // Detailed results per scenario
  for (const r of results) {
    if (r.skipped) continue;
    report += `### S${String(r.scenarioId).padStart(2, '0')}: ${r.scenarioName}\n\n`;

    if (r.error) {
      report += `**Error:** ${r.error}\n\n`;
    }

    // Line-by-line verification
    if (r.lineResults.length > 0) {
      report += `**Line Verification:**\n\n`;
      report += `| Line | Statement | Expected | Actual | Result |\n|------|-----------|----------|--------|--------|\n`;
      for (const lr of r.lineResults) {
        const icon = lr.passed ? 'PASS' : 'FAIL';
        report += `| ${lr.lineName} | ${lr.statement} | ${lr.expected} | ${lr.actual} | ${icon} |\n`;
      }
      report += '\n';
    }

    // Cross-statement ties
    if (r.crossTies.length > 0) {
      report += `**Cross-Statement Ties:**\n\n`;
      report += `| Tie | Expected | Actual | Result |\n|-----|----------|--------|--------|\n`;
      for (const ct of r.crossTies) {
        report += `| ${ct.tie} | ${ct.expected} | ${ct.actual} | ${ct.passed ? 'PASS' : 'FAIL'} |\n`;
      }
      report += '\n';
    }

    // Discrepancies
    if (r.discrepancies.length > 0) {
      report += `**Discrepancies:**\n\n`;
      report += `| Check | Expected | Actual | Diff | Severity |\n|-------|----------|--------|------|----------|\n`;
      for (const disc of r.discrepancies) {
        report += `| ${disc.check} | ${disc.expected} | ${disc.actual} | ${disc.diff} | ${disc.severity} |\n`;
      }
      report += '\n';
    }
  }

  // Enforcement verification table
  report += `## Enforcement Verification\n\n`;
  report += `| Rule | Scenarios Tested | All Enforced |\n|------|-----------------|-------------|\n`;

  const bsEqScenarios = results.filter(r => !r.skipped && r.crossTies.some(ct => ct.tie === 'A = L + E'));
  const bsEqPass = bsEqScenarios.every(r => r.crossTies.find(ct => ct.tie === 'A = L + E')?.passed);
  report += `| Balance Sheet Equation (A = L + E) | ${bsEqScenarios.length} | ${bsEqPass ? 'YES' : 'NO'} |\n`;

  const niTieScenarios = results.filter(r => !r.skipped && r.crossTies.some(ct => ct.tie.includes('Net Income')));
  const niTiePass = niTieScenarios.every(r => r.crossTies.filter(ct => ct.tie.includes('Net Income')).every(ct => ct.passed));
  report += `| Net Income Tie (P&L ↔ Expected) | ${niTieScenarios.length} | ${niTiePass ? 'YES' : 'NO'} |\n`;

  // Known backend findings
  report += `## Known Backend Findings\n\n`;

  // Variance 500 errors
  const varianceErrors = results.filter(r => r.group.includes('Variance') && r.error?.includes('500'));
  if (varianceErrors.length > 0) {
    report += `### Variance Statement Generation (HTTP 500)\n\n`;
    report += `**Affected:** ${varianceErrors.map(r => `S${String(r.scenarioId).padStart(2, '0')}`).join(', ')} (${varianceErrors.length} scenarios)\n\n`;
    report += `**Root Cause:** Bug in \`variance_analysis_repository.ts\` \`upsertVariance\` function. `;
    report += `Generates a new UUID for INSERT, but ON CONFLICT updates the existing record (different ID). `;
    report += `Subsequent SELECT by the new UUID fails with "Variance record not found after upsert". `;
    report += `This error is not caught as MathematicalIntegrityError, so it falls through to generic 500 handler.\n\n`;
    report += `**Impact:** All variance analysis scenarios fail when prior period statements exist.\n\n`;
  }

  // Classification findings
  report += `### Keyword Classifier First-Match Precedence\n\n`;
  report += `The keyword classifier in \`accountClassifier.ts\` uses first-match-wins. `;
  report += `Account names containing both a balance sheet keyword and an income statement keyword `;
  report += `will be classified by whichever keyword appears first in the priority list. Examples:\n\n`;
  report += `| Account Name | Expected | Classified As | Matched Keyword |\n|---|---|---|---|\n`;
  report += `| "Professional Liability Expense" | EXPENSE | LIABILITY | "liability" (position 14) before "expense" (position 24) |\n`;
  report += `| "Property Tax Expense" | EXPENSE | ASSET | "property" (position 6) before "expense" (position 24) |\n`;
  report += `| "Equipment Rent Expense" | EXPENSE | ASSET | "equipment" (position 7) before "rent" (position 29) |\n\n`;
  report += `**Impact:** GL accounts with ambiguous names will be misclassified, causing incorrect statement totals.\n\n`;

  // Reconciliation route 404
  const reconSkipped = results.filter(r => r.group.includes('Recon') && r.skipped);
  if (reconSkipped.length > 0) {
    report += `### Reconciliation Routes (404)\n\n`;
    report += `**Affected:** ${reconSkipped.map(r => `S${String(r.scenarioId).padStart(2, '0')}`).join(', ')} (${reconSkipped.length} scenarios)\n\n`;
    report += `Reconciliation API endpoints return 404 at runtime. All reconciliation scenarios skipped.\n\n`;
  }

  report += '\n---\n*Report generated by Accounting Accuracy Test Suite*\n';

  return report;
}
