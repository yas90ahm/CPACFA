#!/usr/bin/env npx ts-node
/**
 * Sabit E2E Test Suite Runner
 *
 * Runs all test groups in sequence against a live server.
 * Usage: BASE_URL=http://localhost:3000 npx ts-node tests/e2e/run_all.ts
 */

import { BASE_URL, apiFetch } from './helpers';

// Import all test groups
import { group01_auth } from './groups/group01_auth';
import { group02_entity_sessions } from './groups/group02_entity_sessions';
import { group03_gl_trial_balance } from './groups/group03_gl_trial_balance';
import { group04_mapping } from './groups/group04_mapping';
import { group05_reconciliation } from './groups/group05_reconciliation';
import { group06_journal_entries } from './groups/group06_journal_entries';
import { group07_statements } from './groups/group07_statements';
import { group08_variance } from './groups/group08_variance';
import { group09_review_certification } from './groups/group09_review_certification';
import { group10_audit_trail } from './groups/group10_audit_trail';
import { group11_cascade } from './groups/group11_cascade';
import { group12_evidence } from './groups/group12_evidence';
import { group13_hitl_issues } from './groups/group13_hitl_issues';
import { group14_tenant_isolation } from './groups/group14_tenant_isolation';
import { group15_segregation } from './groups/group15_segregation';
import { group16_ai_boundary } from './groups/group16_ai_boundary';
import { group17_edge_cases } from './groups/group17_edge_cases';
import { group18_multi_period } from './groups/group18_multi_period';
import { group19_modules } from './groups/group19_modules';
import { group20_board_package } from './groups/group20_board_package';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TestScenario {
  id: string;
  name: string;
  fn: () => Promise<void>;
}

export interface TestGroup {
  name: string;
  scenarios: TestScenario[];
}

export type TestResult = {
  id: string;
  name: string;
  status: 'pass' | 'fail' | 'skip';
  elapsed: number;
  error?: string;
};

// ---------------------------------------------------------------------------
// Shared state that accumulates across groups
// ---------------------------------------------------------------------------

export interface SharedState {
  preparerToken?: string;
  reviewerToken?: string;
  approverToken?: string;
  preparerUser?: any;
  reviewerUser?: any;
  approverUser?: any;
  tenantId?: string;
  entityId?: string;
  sessionId?: string;
  // Multi-period
  janSessionId?: string;
  febSessionId?: string;
  marSessionId?: string;
  // Tenant B for isolation tests
  tenantBToken?: string;
  tenantBId?: string;
  // Entities for various tests
  [key: string]: any;
}

export const state: SharedState = {};

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

const SLOW_THRESHOLD_MS = 5000;

async function runGroup(group: TestGroup): Promise<TestResult[]> {
  const results: TestResult[] = [];
  for (const scenario of group.scenarios) {
    const start = Date.now();
    try {
      await scenario.fn();
      const elapsed = Date.now() - start;
      results.push({ id: scenario.id, name: scenario.name, status: 'pass', elapsed });
      const slow = elapsed > SLOW_THRESHOLD_MS ? ' [SLOW]' : '';
      process.stdout.write(`  \u2713 ${scenario.id} ${scenario.name} (${elapsed}ms)${slow}\n`);
    } catch (err: any) {
      const elapsed = Date.now() - start;
      const msg = err?.message ?? String(err);
      if (msg.startsWith('SKIP:')) {
        results.push({ id: scenario.id, name: scenario.name, status: 'skip', elapsed, error: msg.replace('SKIP: ', '') });
        process.stdout.write(`  \u25CB ${scenario.id} ${scenario.name} — SKIPPED: ${msg.replace('SKIP: ', '')}\n`);
      } else {
        results.push({ id: scenario.id, name: scenario.name, status: 'fail', elapsed, error: msg });
        process.stdout.write(`  \u2717 ${scenario.id} ${scenario.name} — FAIL: ${msg.slice(0, 200)}\n`);
      }
    }
  }
  return results;
}

async function main() {
  const startTime = Date.now();
  console.log('============================================================');
  console.log('         SABIT E2E TEST SUITE');
  console.log('============================================================');
  console.log(`Server: ${BASE_URL}`);
  console.log(`Date:   ${new Date().toISOString().slice(0, 10)}`);
  console.log('');

  // Health check
  try {
    const health = await apiFetch('GET', '/health');
    if (health.status !== 200) {
      console.error(`Server health check failed (${health.status}). Is the server running at ${BASE_URL}?`);
      process.exit(1);
    }
    console.log(`Server health: OK\n`);
  } catch (err: any) {
    console.error(`Cannot reach server at ${BASE_URL}: ${err.message}`);
    process.exit(1);
  }

  const allGroups: TestGroup[] = [
    group01_auth(),
    group02_entity_sessions(),
    group03_gl_trial_balance(),
    group04_mapping(),
    group05_reconciliation(),
    group06_journal_entries(),
    group07_statements(),
    group08_variance(),
    group09_review_certification(),
    group10_audit_trail(),
    group11_cascade(),
    group12_evidence(),
    group13_hitl_issues(),
    group14_tenant_isolation(),
    group15_segregation(),
    group16_ai_boundary(),
    group17_edge_cases(),
    group18_multi_period(),
    group19_modules(),
    group20_board_package(),
  ];

  const allResults: TestResult[] = [];
  const groupSummaries: Array<{ name: string; pass: number; fail: number; skip: number; total: number; failures: TestResult[] }> = [];

  for (const group of allGroups) {
    console.log(`\nGROUP: ${group.name}`);
    console.log('-'.repeat(60));
    const results = await runGroup(group);
    allResults.push(...results);

    const pass = results.filter((r) => r.status === 'pass').length;
    const fail = results.filter((r) => r.status === 'fail').length;
    const skip = results.filter((r) => r.status === 'skip').length;
    const failures = results.filter((r) => r.status === 'fail');
    groupSummaries.push({ name: group.name, pass, fail, skip, total: results.length, failures });
  }

  // Summary
  const totalElapsed = Date.now() - startTime;
  const totalPass = allResults.filter((r) => r.status === 'pass').length;
  const totalFail = allResults.filter((r) => r.status === 'fail').length;
  const totalSkip = allResults.filter((r) => r.status === 'skip').length;
  const total = allResults.length;
  const rate = total > 0 ? ((totalPass / (total - totalSkip)) * 100).toFixed(1) : '0';
  const minutes = Math.floor(totalElapsed / 60000);
  const seconds = Math.floor((totalElapsed % 60000) / 1000);

  console.log('\n\n============================================================');
  console.log('         SABIT E2E TEST SUITE — RESULTS');
  console.log('============================================================');
  console.log(`\nServer: ${BASE_URL}`);
  console.log(`Date:   ${new Date().toISOString().slice(0, 10)}\n`);

  for (const g of groupSummaries) {
    const statusLabel = g.fail > 0 ? 'FAIL' : 'PASS';
    const pad = 50 - g.name.length;
    console.log(`${g.name}${' '.repeat(Math.max(1, pad))}${g.pass}/${g.total}  ${statusLabel}`);
    for (const f of g.failures) {
      console.log(`  \u2717 ${f.id} ${f.name} — ${f.error?.slice(0, 120)}`);
    }
  }

  console.log('\n============================================================');
  console.log(`  TOTAL:   ${totalPass}/${total} passed  |  ${totalFail} failed  |  ${totalSkip} skipped`);
  console.log(`  RATE:    ${rate}%`);
  console.log(`  TIME:    ${minutes}m ${seconds}s`);
  console.log('============================================================');

  if (totalFail > 0) {
    console.log('\nFAILURES:');
    for (const r of allResults.filter((r) => r.status === 'fail')) {
      console.log(`  ${r.id}  ${r.name}`);
      console.log(`        ${r.error?.slice(0, 300)}`);
    }
  }

  if (totalSkip > 0) {
    console.log('\nSKIPPED:');
    for (const r of allResults.filter((r) => r.status === 'skip')) {
      console.log(`  ${r.id}  ${r.name} — ${r.error}`);
    }
  }

  console.log('============================================================\n');

  // Slow tests
  const slowTests = allResults.filter((r) => r.elapsed > SLOW_THRESHOLD_MS);
  if (slowTests.length > 0) {
    console.log('SLOW TESTS (> 5s):');
    for (const r of slowTests) {
      console.log(`  ${r.id}  ${r.name}  (${r.elapsed}ms)`);
    }
    console.log('');
  }

  process.exit(totalFail > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('Runner crash:', err);
  process.exit(1);
});
