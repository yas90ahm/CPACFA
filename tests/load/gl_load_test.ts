/**
 * GL Load Test: upload 50K-entry CSV and measure timing.
 * Prerequisites: run generate_50k_gl.ts first, then start the backend server.
 * Run: npx tsx tests/load/gl_load_test.ts
 */

import fs from 'fs';
import path from 'path';

const BASE_URL = process.env.API_URL ?? 'http://localhost:3000';
const CSV_PATH = path.join(__dirname, 'gl_50k.csv');

async function login(): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'admin@test.com', password: 'password123' }),
  });
  if (!res.ok) throw new Error(`Login failed: ${res.status}`);
  const data = await res.json() as { token: string };
  return data.token;
}

async function createSession(token: string): Promise<string> {
  const res = await fetch(`${BASE_URL}/api/close/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({
      entityName: 'Load Test Entity',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
      periodLabel: 'Jan 2026 Load Test',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Create session failed: ${res.status} ${err}`);
  }
  const data = await res.json() as { id: string };
  return data.id;
}

async function uploadGL(token: string, sessionId: string): Promise<{ parseMs: number; ingestMs: number; rowCount: number }> {
  if (!fs.existsSync(CSV_PATH)) {
    throw new Error(`CSV not found at ${CSV_PATH}. Run: npx tsx tests/load/generate_50k_gl.ts`);
  }

  const csvBuffer = fs.readFileSync(CSV_PATH);
  const fileSizeMB = (csvBuffer.length / 1024 / 1024).toFixed(2);
  console.log(`CSV file size: ${fileSizeMB} MB`);

  // Step 1: Parse (preview)
  const formParse = new FormData();
  formParse.append('file', new Blob([csvBuffer], { type: 'text/csv' }), 'gl_50k.csv');

  const parseStart = Date.now();
  const parseRes = await fetch(`${BASE_URL}/api/gl/parse`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formParse,
  });
  const parseMs = Date.now() - parseStart;

  if (!parseRes.ok) {
    const err = await parseRes.text();
    throw new Error(`Parse failed: ${parseRes.status} ${err}`);
  }
  const parseData = await parseRes.json() as { rowCount?: number; totalRows?: number; rows?: unknown[] };
  const rowCount = parseData.rowCount ?? parseData.totalRows ?? (parseData.rows as unknown[])?.length ?? 0;
  console.log(`Parse: ${parseMs}ms — ${rowCount} rows detected`);

  // Step 2: Ingest (commit)
  const formIngest = new FormData();
  formIngest.append('file', new Blob([csvBuffer], { type: 'text/csv' }), 'gl_50k.csv');
  formIngest.append('closeSessionId', sessionId);

  const ingestStart = Date.now();
  const ingestRes = await fetch(`${BASE_URL}/api/gl/ingest`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: formIngest,
  });
  const ingestMs = Date.now() - ingestStart;

  if (!ingestRes.ok) {
    const err = await ingestRes.text();
    throw new Error(`Ingest failed: ${ingestRes.status} ${err}`);
  }
  console.log(`Ingest: ${ingestMs}ms`);

  return { parseMs, ingestMs, rowCount };
}

async function main() {
  console.log('=== GL Load Test: 50,000 entries ===\n');

  const token = await login();
  console.log('Logged in.\n');

  const sessionId = await createSession(token);
  console.log(`Created session: ${sessionId}\n`);

  const totalStart = Date.now();
  const result = await uploadGL(token, sessionId);
  const totalMs = Date.now() - totalStart;

  console.log('\n=== Results ===');
  console.log(`Rows:    ${result.rowCount}`);
  console.log(`Parse:   ${result.parseMs}ms`);
  console.log(`Ingest:  ${result.ingestMs}ms`);
  console.log(`Total:   ${totalMs}ms`);
  console.log(`Target:  <60,000ms`);
  console.log(`Status:  ${totalMs < 60000 ? 'PASS' : 'FAIL — exceeds 60s target'}`);
}

main().catch((err) => {
  console.error('Load test failed:', err);
  process.exit(1);
});
