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

  // ── STEP 1: Upload the actual CSV via API and capture FULL response ──
  console.log('\n======================================');
  console.log('STEP 1: Upload 96-entry CSV via curl equivalent');
  console.log('======================================');
  const csvPath = path.join('C:', 'Users', 'yasir', 'Downloads', 'sample-gl-january-2026.csv');
  const csvBuffer = fs.readFileSync(csvPath);
  console.log('  File:', csvPath, '(' + csvBuffer.length + ' bytes)');
  console.log('  Line count:', csvBuffer.toString().split('\n').filter(l => l.trim()).length);

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
  console.log('  FULL RESPONSE:');
  console.log(JSON.stringify(glData, null, 2));

  // ── STEP 2: Check what landed in the database ──
  console.log('\n======================================');
  console.log('STEP 2: Check database');
  console.log('======================================');
  const q1 = await pool.query("SELECT COUNT(*) as total_rows FROM core.general_ledger WHERE period_label = '2026-01'");
  console.log('  GL total rows:', q1.rows[0].total_rows);

  const q2 = await pool.query("SELECT account_code, COUNT(*) as entry_count FROM core.general_ledger WHERE period_label = '2026-01' GROUP BY account_code ORDER BY account_code");
  if (q2.rows.length > 0) {
    console.log('  GL by account:');
    console.table(q2.rows);
  } else {
    console.log('  GL: (no rows)');
  }

  // ── STEP 3: Check trial balance ──
  console.log('\n======================================');
  console.log('STEP 3: Check trial balance');
  console.log('======================================');
  const q3 = await pool.query("SELECT period_label, source, jsonb_array_length(entries) as account_count FROM core.period_trial_balance WHERE period_label = '2026-01'");
  console.log('  TB rows:', JSON.stringify(q3.rows));

  const q4 = await pool.query("SELECT entries FROM core.period_trial_balance WHERE period_label = '2026-01' AND source = 'gl_derived'");
  if (q4.rows.length > 0) {
    const entries = q4.rows[0].entries;
    console.log('  TB entries (gl_derived):');
    console.log(JSON.stringify(entries, null, 2));
  }

  // ── STEP 4+5+6: Analyze the parsing ──
  console.log('\n======================================');
  console.log('STEP 4-6: Parsing analysis');
  console.log('======================================');
  // Show what the parser does with this CSV
  console.log('  CSV headers: Account Code,Account Name,Date,Description,Debit,Credit,Reference');
  console.log('  Has entry_id column? NO — "Reference" does not match entry_id patterns');
  console.log('  Each row gets ENTRY-{i+1} as entry_id');
  console.log('  Each entry has exactly 1 line');
  console.log('  Balance check per entry: debit vs credit on THAT SINGLE LINE');
  console.log('');

  // Show the breakdown
  const lines = csvBuffer.toString().trim().split('\n').slice(1); // skip header
  let balanced = 0;
  let imbalanced = 0;
  const balancedAccounts = new Set();
  const imbalancedAccounts = new Set();
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const accountCode = parts[0];
    const debit = parseFloat(parts[4]) || 0;
    const credit = parseFloat(parts[5]) || 0;
    if (Math.abs(debit - credit) <= 0.01) {
      balanced++;
      balancedAccounts.add(accountCode);
    } else {
      imbalanced++;
      imbalancedAccounts.add(accountCode);
    }
  }
  console.log('  Total data rows:', lines.length);
  console.log('  "Balanced" entries (debit==credit on single line):', balanced);
  console.log('  "Imbalanced" entries (debit!=credit):', imbalanced);
  console.log('  Balanced accounts:', [...balancedAccounts].join(', '));
  console.log('  Imbalanced accounts:', [...imbalancedAccounts].join(', '));

  // Show the balanced rows
  console.log('\n  Rows where debit == credit (the only ones that pass validation):');
  for (let i = 0; i < lines.length; i++) {
    const parts = lines[i].split(',');
    const debit = parseFloat(parts[4]) || 0;
    const credit = parseFloat(parts[5]) || 0;
    if (Math.abs(debit - credit) <= 0.01) {
      console.log('    Row', i+2, ':', parts[0], parts[1], 'debit=' + debit, 'credit=' + credit, parts[6]);
    }
  }

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
