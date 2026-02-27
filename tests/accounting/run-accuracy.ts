#!/usr/bin/env npx tsx
// tests/accounting/run-accuracy.ts — Main entry point for 55 accounting accuracy scenarios

import * as fs from 'fs';
import * as path from 'path';
import Decimal from 'decimal.js';
import {
  ApiClient,
  TestRunner,
  runScenarioPipeline,
  runPriorPeriodPipeline,
  verifyStatementLines,
  buildGLCSV,
  computeExpectedTotals,
  generateAccuracyReport,
  d,
  toStr,
  round2,
  VerificationResult,
  PipelineOpts,
} from './lib';
import { ScenarioDef } from './scenarios/types';
import { getGroup1Scenarios } from './scenarios/group1-industries';
import { getGroup2Scenarios } from './scenarios/group2-aje';
import { getGroup3Scenarios } from './scenarios/group3-recon';
import { getGroup4Scenarios } from './scenarios/group4-variance';
import { getGroup5Scenarios } from './scenarios/group5-ties';
import { getGroup6Scenarios } from './scenarios/group6-precision';
import { getGroup7Scenarios } from './scenarios/group7-bad-data';

// ── Configuration ───────────────────────────────────────────────

const BASE_URL = process.env.UAT_API_URL || 'http://localhost:3000';
const RUN_ID = Date.now().toString(36);

// Use env vars for credentials or generate unique ones per run
const ADMIN_EMAIL = process.env.ACC_ADMIN_EMAIL || `acc-admin-${RUN_ID}@test.local`;
const ADMIN_PASSWORD = process.env.ACC_ADMIN_PASSWORD || 'TestPassword123!@#';
const APPROVER_EMAIL = process.env.ACC_APPROVER_EMAIL || `acc-approver-${RUN_ID}@test.local`;
const APPROVER_PASSWORD = process.env.ACC_APPROVER_PASSWORD || 'TestPassword456!@#';

// ── Main ────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(70));
  console.log('  ACCOUNTING ACCURACY TEST SUITE — 55 Scenarios');
  console.log(`  Target: ${BASE_URL}`);
  console.log(`  Run ID: ${RUN_ID}`);
  console.log('='.repeat(70));
  console.log();

  const api = new ApiClient(BASE_URL);
  const runner = new TestRunner();

  // ── Health Check ──────────────────────────────────────────
  console.log('[PREFLIGHT] Health check...');
  try {
    const healthRes = await api.get('/health');
    if (healthRes.status !== 200) {
      console.error(`Health check failed: ${healthRes.status}`);
      process.exit(1);
    }
    console.log('[PREFLIGHT] Server is healthy.\n');
  } catch (err) {
    console.error(`Cannot reach server at ${BASE_URL}:`, err);
    process.exit(1);
  }

  // ── Auth Setup ────────────────────────────────────────────
  console.log('[AUTH] Registering admin user...');
  let tenantId: string;
  let adminToken: string;
  let approverToken: string;

  // Register admin (use 'approver' role — 'admin' is not a valid registration role)
  const regRes = await registerWithRetry(api, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD,
    name: 'Accuracy Test Admin',
    role: 'approver',
    tenantName: `Accuracy Test Tenant ${RUN_ID}`,
  });
  tenantId = regRes.tenantId;
  adminToken = regRes.token;
  console.log(`[AUTH] Admin registered. Tenant: ${tenantId}`);

  // Register second user on same tenant (for SoD — different user must approve JEs)
  if (APPROVER_EMAIL === ADMIN_EMAIL) {
    // Same user — reuse admin token (SoD for JE approval will fail, documented)
    approverToken = adminToken;
    console.log('[AUTH] Approver is same as admin (SoD will use fallback).\n');
  } else {
    console.log('[AUTH] Registering approver user...');
    try {
      const approverRes = await registerWithRetry(api, {
        email: APPROVER_EMAIL,
        password: APPROVER_PASSWORD,
        name: 'Accuracy Test Approver',
        role: 'accountant',
        tenantId,
      }, adminToken);
      approverToken = approverRes.token;
      console.log('[AUTH] Approver registered.\n');
    } catch (err: any) {
      console.log(`[AUTH] Approver registration failed: ${err.message}. Using admin token.\n`);
      approverToken = adminToken;
    }
  }

  const pipelineOpts: PipelineOpts = {
    api,
    token: adminToken,
    tenantId,
    approverToken,
  };

  // ── Collect all scenarios ─────────────────────────────────
  const allScenarios: ScenarioDef[] = [
    ...getGroup1Scenarios(),
    ...getGroup2Scenarios(),
    ...getGroup3Scenarios(),
    ...getGroup4Scenarios(),
    ...getGroup5Scenarios(),
    ...getGroup6Scenarios(),
    ...getGroup7Scenarios(),
  ];

  console.log(`[SCENARIOS] Loaded ${allScenarios.length} scenarios across 7 groups.\n`);

  // ── Validate GL Balance ───────────────────────────────────
  console.log('[VALIDATE] Checking GL balance for all scenarios...');
  let balanceErrors = 0;
  for (const s of allScenarios) {
    if (s.skipReason || s.accounts.length === 0) continue;
    if (s.expected.expectError) continue; // bad data scenarios intentionally imbalanced

    let totalD = d(0);
    let totalC = d(0);
    for (const a of s.accounts) {
      totalD = totalD.plus(a.debit);
      totalC = totalC.plus(a.credit);
    }
    if (!totalD.equals(totalC)) {
      console.error(`  [IMBALANCED] S${String(s.id).padStart(2, '0')}: ${s.name} — D=${toStr(totalD)}, C=${toStr(totalC)}, diff=${toStr(totalD.minus(totalC))}`);
      balanceErrors++;
    }
  }
  if (balanceErrors > 0) {
    console.error(`\n[VALIDATE] ${balanceErrors} scenarios have imbalanced GLs! Fix before running.\n`);
  } else {
    console.log('[VALIDATE] All non-error scenarios have balanced GLs.\n');
  }

  // ── Execute scenarios ─────────────────────────────────────
  const results: VerificationResult[] = [];

  for (let si = 0; si < allScenarios.length; si++) {
    const scenario = allScenarios[si];
    const sLabel = `S${String(scenario.id).padStart(2, '0')}`;
    console.log(`[${sLabel}] ${scenario.name} (${scenario.group})...`);

    // Throttle: delay between scenarios to stay under 200 req/min API rate limit
    // AJE scenarios need longer delays to let connections drain
    if (si > 0 && !scenario.skipReason) {
      const hasAjes = scenario.ajes && scenario.ajes.length > 0;
      const hasPrior = !!scenario.priorPeriod;
      await sleep(hasAjes || hasPrior ? 1500 : 500);
    }

    const startTime = performance.now();

    // Skip if reason given
    if (scenario.skipReason) {
      console.log(`  [SKIP] ${scenario.skipReason}`);
      results.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        group: scenario.group,
        passed: false,
        skipped: true,
        skipReason: scenario.skipReason,
        totalChecks: 0,
        passedChecks: 0,
        failedChecks: 0,
        discrepancies: [],
        lineResults: [],
        crossTies: [],
        duration: performance.now() - startTime,
      });
      continue;
    }

    try {
      // Run prior period first (for variance scenarios)
      if (scenario.priorPeriod) {
        console.log(`  [PRIOR] Uploading prior period: ${scenario.priorPeriod.period}`);
        const priorResult = await runPriorPeriodPipeline(scenario, pipelineOpts);
        if (priorResult.error && !priorResult.lines) {
          console.log(`  [PRIOR] Warning: ${priorResult.error}`);
          // Continue anyway — might work without prior
        } else {
          console.log(`  [PRIOR] Prior period statements generated.`);
        }
      }

      // Run main pipeline
      const result = await runScenarioPipeline(scenario, pipelineOpts);

      if (result.error && !result.lines) {
        // Check if this was an expected error
        if (scenario.expected.expectError) {
          const expectedStatus = scenario.expected.expectError.status;
          const gotExpected = result.httpStatus === expectedStatus ||
                             (expectedStatus === 207 && result.httpStatus === 207);
          console.log(`  [${gotExpected ? 'PASS' : 'FAIL'}] Expected error ${expectedStatus}, got ${result.httpStatus || 'unknown'}`);
          results.push({
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            group: scenario.group,
            passed: gotExpected,
            skipped: false,
            totalChecks: 1,
            passedChecks: gotExpected ? 1 : 0,
            failedChecks: gotExpected ? 0 : 1,
            discrepancies: gotExpected ? [] : [{
              check: 'Expected Error',
              expected: String(expectedStatus),
              actual: String(result.httpStatus || 'unknown'),
              diff: 'N/A',
              severity: 'CRITICAL',
            }],
            lineResults: [],
            crossTies: [],
            error: result.error,
            duration: performance.now() - startTime,
          });
          continue;
        }

        // Unexpected error
        console.log(`  [ERROR] ${result.error}`);
        results.push({
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          group: scenario.group,
          passed: false,
          skipped: false,
          totalChecks: 1,
          passedChecks: 0,
          failedChecks: 1,
          discrepancies: [{
            check: 'Pipeline',
            expected: 'Success',
            actual: result.error!,
            diff: 'N/A',
            severity: 'CRITICAL',
          }],
          lineResults: [],
          crossTies: [],
          error: result.error,
          duration: performance.now() - startTime,
        });
        continue;
      }

      // If expectError but pipeline succeeded
      if (scenario.expected.expectError && result.lines) {
        // Pipeline succeeded when we expected failure — this is a finding
        console.log(`  [FINDING] Expected error ${scenario.expected.expectError.status} but pipeline succeeded. Verifying output anyway.`);
      }

      // Verify lines
      const lines = result.lines || [];
      console.log(`  [VERIFY] Got ${lines.length} statement lines. Checking...`);

      const verification = verifyStatementLines(
        lines,
        scenario.expected,
        scenario.id,
        scenario.name,
        scenario.group,
      );
      verification.duration = performance.now() - startTime;

      if (verification.passed) {
        console.log(`  [PASS] ${verification.passedChecks}/${verification.totalChecks} checks passed.`);
      } else {
        console.log(`  [FAIL] ${verification.failedChecks}/${verification.totalChecks} checks failed:`);
        for (const disc of verification.discrepancies) {
          console.log(`    - ${disc.check}: expected ${disc.expected}, got ${disc.actual} (diff: ${disc.diff})`);
        }
      }

      results.push(verification);

    } catch (err: any) {
      const duration = performance.now() - startTime;
      console.log(`  [ERROR] Unhandled: ${err.message}`);
      results.push({
        scenarioId: scenario.id,
        scenarioName: scenario.name,
        group: scenario.group,
        passed: false,
        skipped: false,
        totalChecks: 1,
        passedChecks: 0,
        failedChecks: 1,
        discrepancies: [{
          check: 'Unhandled Error',
          expected: 'No error',
          actual: err.message,
          diff: 'N/A',
          severity: 'CRITICAL',
        }],
        lineResults: [],
        crossTies: [],
        error: err.message,
        duration,
      });
    }
  }

  // ── Generate Report ───────────────────────────────────────
  console.log('\n' + '='.repeat(70));
  console.log('  GENERATING REPORT');
  console.log('='.repeat(70) + '\n');

  const report = generateAccuracyReport(results);
  const reportPath = path.resolve(process.cwd(), 'ACCOUNTING_ACCURACY_REPORT.md');
  fs.writeFileSync(reportPath, report, 'utf-8');
  console.log(`Report written to: ${reportPath}`);

  // Summary
  const passed = results.filter(r => r.passed && !r.skipped).length;
  const failed = results.filter(r => !r.passed && !r.skipped).length;
  const skipped = results.filter(r => r.skipped).length;

  console.log(`\n${'='.repeat(70)}`);
  console.log(`  RESULTS: ${passed} passed, ${failed} failed, ${skipped} skipped (${results.length} total)`);
  console.log(`${'='.repeat(70)}\n`);

  process.exit(failed > 0 ? 1 : 0);
}

// ── Auth Helpers ────────────────────────────────────────────────

interface RegisterOpts {
  email: string;
  password: string;
  name: string;
  role: string;
  tenantId?: string;
  tenantName?: string;
}

async function registerWithRetry(
  api: ApiClient,
  opts: RegisterOpts,
  adminToken?: string,
  maxRetries = 3,
): Promise<{ token: string; tenantId: string }> {
  // Try login first (in case user already exists from a previous run)
  const loginRes = await api.post('/api/auth/login', {
    email: opts.email,
    password: opts.password,
  });
  if (loginRes.status === 200) {
    const token = loginRes.body?.token || loginRes.body?.accessToken;
    const tid = loginRes.body?.tenantId || opts.tenantId;
    if (token && tid) {
      console.log(`  [AUTH] Logged in existing user: ${opts.email}`);
      return { token, tenantId: tid };
    }
  }

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const body: any = {
        email: opts.email,
        password: opts.password,
        name: opts.name,
        role: opts.role,
      };
      if (opts.tenantId) body.tenantId = opts.tenantId;
      if (opts.tenantName) body.tenantName = opts.tenantName;

      const headers: any = {};
      if (adminToken) {
        headers.token = adminToken;
        headers.tenantId = opts.tenantId;
      }

      const regRes = await api.post('/api/auth/register', body, adminToken ? { token: adminToken, tenantId: opts.tenantId } : undefined);

      if (regRes.status === 201 || regRes.status === 200) {
        const token = regRes.body?.token || regRes.body?.accessToken;
        const tid = regRes.body?.tenantId || opts.tenantId;
        if (token && tid) return { token, tenantId: tid };
      }

      if (regRes.status === 429) {
        // Parse retryAfter — could be seconds (number) or a string like "15 minutes"
        let waitSecs = 960; // default 16 min
        const ra = regRes.body?.retryAfter;
        if (typeof ra === 'number') waitSecs = ra;
        else if (typeof ra === 'string' && /\d+/.test(ra)) {
          const num = parseInt(ra.match(/\d+/)![0], 10);
          if (ra.includes('min')) waitSecs = num * 60;
          else waitSecs = num;
        }
        console.log(`  [RATE-LIMITED] Waiting ${waitSecs}s before retry ${attempt}/${maxRetries}...`);
        await sleep(waitSecs * 1000);
        continue;
      }

      if (regRes.status === 409) {
        // Already registered — try login
        const loginRes = await api.post('/api/auth/login', {
          email: opts.email,
          password: opts.password,
        });
        if (loginRes.status === 200) {
          const token = loginRes.body?.token || loginRes.body?.accessToken;
          const tid = loginRes.body?.tenantId || opts.tenantId;
          if (token) return { token, tenantId: tid! };
        }
      }

      // If registration fails, try logging in with previously created creds
      if (regRes.status >= 400) {
        const loginRes = await api.post('/api/auth/login', {
          email: opts.email,
          password: opts.password,
        });
        if (loginRes.status === 200) {
          const token = loginRes.body?.token || loginRes.body?.accessToken;
          const tid = loginRes.body?.tenantId || opts.tenantId;
          if (token && tid) return { token, tenantId: tid };
        }
      }

      throw new Error(`Register failed: ${regRes.status} - ${JSON.stringify(regRes.body)}`);
    } catch (err: any) {
      if (attempt === maxRetries) throw err;
      console.log(`  [RETRY] Attempt ${attempt} failed: ${err.message}`);
      await sleep(2000);
    }
  }
  throw new Error('Registration failed after all retries');
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Run ─────────────────────────────────────────────────────────
main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
