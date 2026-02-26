const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }
const API = 'http://localhost:3001';

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  // Get auth token
  const loginRes = await fetch(API + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'browser@test.com', password: 'Test1234!' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  if (!token) { console.error('Auth failed:', loginData); await pool.end(); return; }
  console.log('Auth OK');

  // Skip manual cleanup — the API's upsert handles this internally.
  console.log('Skipping manual cleanup (API upserts handle it)');

  // ── Upload 96-entry CSV ──
  console.log('\n======================================');
  console.log('Upload 96-entry CSV (no columnMapping — tests auto-detect)');
  console.log('======================================');
  const csvPath = path.join('C:', 'Users', 'yasir', 'Downloads', 'sample-gl-january-2026.csv');
  const csvBuffer = fs.readFileSync(csvPath);
  console.log('  File: ' + csvPath + ' (' + csvBuffer.length + ' bytes, ' +
    csvBuffer.toString().split('\n').filter(l => l.trim()).length + ' lines)');

  const boundary = '----FormBoundary' + Date.now();
  const body = Buffer.concat([
    Buffer.from('--' + boundary + '\r\n'),
    Buffer.from('Content-Disposition: form-data; name="file"; filename="sample-gl-january-2026.csv"\r\n'),
    Buffer.from('Content-Type: text/csv\r\n\r\n'),
    csvBuffer,
    Buffer.from('\r\n--' + boundary + '--\r\n'),
  ]);

  const glRes = await fetch(API + '/api/gl/ingest?period=2026-01', {
    method: 'POST',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
    },
    body,
  });
  const glData = await glRes.json();
  console.log('  HTTP Status:', glRes.status);
  console.log('  Response:', JSON.stringify(glData, null, 2));

  // ── Verify GL ──
  console.log('\n======================================');
  console.log('Verify GL rows');
  console.log('======================================');
  const q1 = await pool.query("SELECT COUNT(*) as count FROM core.general_ledger WHERE period_label = '2026-01'");
  console.log('  GL total rows:', q1.rows[0].count);

  const q2 = await pool.query("SELECT account_code, COUNT(*) as lines FROM core.general_ledger WHERE period_label = '2026-01' GROUP BY account_code ORDER BY account_code");
  console.log('  Distinct accounts:', q2.rows.length);
  console.table(q2.rows);

  // ── Verify TB ──
  console.log('\n======================================');
  console.log('Verify Trial Balance');
  console.log('======================================');
  const q3 = await pool.query("SELECT period_label, source, jsonb_array_length(entries) as account_count FROM core.period_trial_balance WHERE period_label = '2026-01'");
  console.log('  TB rows:', JSON.stringify(q3.rows));

  const q4 = await pool.query("SELECT entries FROM core.period_trial_balance WHERE period_label = '2026-01' AND source = 'gl_derived'");
  if (q4.rows.length > 0) {
    const entries = q4.rows[0].entries;
    console.log('  TB accounts:', entries.length);

    // Sum debits and credits
    let totalD = 0, totalC = 0;
    for (const e of entries) {
      totalD += parseFloat(e.debit || e.total_debits || 0);
      totalC += parseFloat(e.credit || e.total_credits || 0);
    }
    console.log('  Total Debits:', totalD.toFixed(2));
    console.log('  Total Credits:', totalC.toFixed(2));
    console.log('  Balanced:', Math.abs(totalD - totalC) < 0.01 ? 'YES' : 'NO (diff=' + Math.abs(totalD - totalC).toFixed(2) + ')');

    // Show first 10 accounts
    console.log('\n  First 10 accounts:');
    console.table(entries.slice(0, 10).map(e => ({
      code: e.accountCode || e.account_code,
      name: e.accountName || e.account_name,
      debit: e.debit || e.total_debits,
      credit: e.credit || e.total_credits,
    })));
  } else {
    console.log('  NO gl_derived TB found');
  }

  // ── Verify via API ──
  console.log('\n======================================');
  console.log('Verify via TB API');
  console.log('======================================');
  const sessions = await (await fetch(API + '/api/close/sessions', {
    headers: { 'Authorization': 'Bearer ' + token },
  })).json();
  const jan = Array.isArray(sessions) ? sessions.find(s => (s.periodEnd || s.period_end || '').includes('2026-01')) : null;
  if (jan) {
    const tbRes = await fetch(API + '/api/close/sessions/' + jan.id + '/trial-balance', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const tbData = await tbRes.json();
    console.log('  API Status:', tbRes.status);
    console.log('  Accounts:', tbData.rows ? tbData.rows.length : 0);
    console.log('  Balanced:', tbData.balanced);
    console.log('  Total Debits:', tbData.totalDebits);
    console.log('  Total Credits:', tbData.totalCredits);
  } else {
    console.log('  No January 2026 session found');
  }

  // ── Summary ──
  const glCount = parseInt(q1.rows[0].count);
  const tbAccounts = q3.rows.length > 0 ? q3.rows.find(r => r.source === 'gl_derived')?.account_count || 0 : 0;
  console.log('\n======================================');
  console.log('SUMMARY');
  console.log('======================================');
  console.log('  GL rows:', glCount, glCount >= 96 ? 'PASS' : 'FAIL (expected >= 96)');
  console.log('  GL accounts:', q2.rows.length, q2.rows.length >= 24 ? 'PASS' : 'FAIL (expected >= 24)');
  console.log('  TB accounts:', tbAccounts, tbAccounts >= 24 ? 'PASS' : 'FAIL (expected >= 24)');

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
