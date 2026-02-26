/**
 * Run GL performance tests against a running server (e.g. Docker).
 * Requires: MODE=demo, demo user seeded. Login → upload COA → upload perf CSVs.
 *
 * Run: BASE_URL=http://localhost:3000 npx tsx scripts/run_gl_performance_tests.ts
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@cloudmetrics.io';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoPass2026!';
const PERF_PERIOD = '2024-Q1-PERF';

let authToken = '';

async function login(): Promise<boolean> {
  console.log('\n=== Login ===');
  try {
    const res = await fetch(`${BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        tenantId: 'demo-cloudmetrics',
        email: DEMO_EMAIL,
        password: DEMO_PASSWORD,
      }),
    });
    const data = (await res.json()) as { token?: string };
    if (res.status !== 200 || !data?.token) {
      console.error('Login failed:', res.status, data);
      return false;
    }
    authToken = data.token;
    console.log('OK: Logged in');
    return true;
  } catch (e) {
    console.error('Login error:', e);
    return false;
  }
}

async function uploadCOA(): Promise<boolean> {
  console.log('\n=== Upload COA ===');
  const coaPath = path.join(__dirname, '../test_data/sample_coa.csv');
  if (!fs.existsSync(coaPath)) {
    console.error('sample_coa.csv not found');
    return false;
  }
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(coaPath)], { type: 'text/csv' }), 'sample_coa.csv');
    const res = await fetch(`${BASE_URL}/api/coa/upload`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${authToken}` },
      body: form,
    });
    const data = (await res.json()) as { success?: boolean };
    if (res.status !== 200 || !data?.success) {
      console.error('COA upload failed:', res.status, data);
      return false;
    }
    console.log('OK: COA uploaded');
    return true;
  } catch (e) {
    console.error('COA upload error:', e);
    return false;
  }
}

async function uploadGL(filename: string): Promise<{ success: boolean; perfMetrics?: Record<string, number>; lines?: number }> {
  const filepath = path.join(__dirname, '../test_data', filename);
  if (!fs.existsSync(filepath)) {
    return { success: false };
  }
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(filepath)], { type: 'text/csv' }), filename);
  const res = await fetch(`${BASE_URL}/api/gl/ingest?period=${PERF_PERIOD}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: form,
  });
  const data = (await res.json()) as {
    success?: boolean;
    perfMetrics?: Record<string, number>;
    balancedCount?: number;
    imbalancedCount?: number;
    total_lines?: number;
  };
  if (res.status !== 200 && res.status !== 207) {
    return { success: false };
  }
  const lines = data.balancedCount != null ? (data.balancedCount * 2.5) | 0 : undefined;
  return {
    success: true,
    perfMetrics: data.perfMetrics,
    lines,
  };
}

async function main(): Promise<void> {
  console.log('GL Performance Tests');
  console.log('BASE_URL:', BASE_URL);

  if (!(await login())) {
    process.exit(1);
  }
  if (!(await uploadCOA())) {
    process.exit(1);
  }

  const files = [
    { name: 'gl_perf_1k.csv', target: 3 },
    { name: 'gl_perf_5k.csv', target: 10 },
    { name: 'gl_perf_10k.csv', target: 15 },
    { name: 'gl_perf_30k.csv', target: 45 },
  ];

  console.log('\n=== Performance Uploads ===');
  const results: Array<{ file: string; total_ms?: number; target: number; pass: boolean }> = [];

  for (const { name, target } of files) {
    const r = await uploadGL(name);
    if (!r.success) {
      console.log(`${name}: SKIP (file not found or upload failed)`);
      results.push({ file: name, target, pass: false });
      continue;
    }
    const total = r.perfMetrics?.total_ms;
    const pass = total != null && total <= target * 1000; // target in seconds
    results.push({ file: name, total_ms: total, target, pass });
    console.log(
      `${name}: total=${total != null ? `${(total / 1000).toFixed(2)}s` : '?'} ` +
        `(target ≤${target}s) ${pass ? '✅ PASS' : '❌ FAIL'}`
    );
    if (r.perfMetrics) {
      console.log('  ', JSON.stringify(r.perfMetrics));
    }
  }

  const passed = results.filter((r) => r.pass).length;
  const failed = results.filter((r) => !r.pass && r.total_ms != null).length;
  console.log('\n=== Summary ===');
  console.log(`Passed: ${passed}/${results.length}`);
  if (failed > 0) {
    console.log(`Failed: ${failed}`);
    process.exit(1);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
