/**
 * End-to-end test: clean DB, register user, create session, upload GL, verify persistence.
 */
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) { console.error('DATABASE_URL not set'); process.exit(1); }

const API = 'http://localhost:3001';

async function main() {
  const pool = new Pool({ connectionString: DB_URL });

  // ── Step 1: Clean the database using TRUNCATE CASCADE ──
  console.log('\n======================================');
  console.log('STEP 1: Clean database tables');
  console.log('======================================');

  // Get all tables in core schema
  const tablesRes = await pool.query(
    "SELECT tablename FROM pg_tables WHERE schemaname = 'core' ORDER BY tablename"
  );
  console.log('  Tables in core schema:', tablesRes.rows.map(r => r.tablename).join(', '));

  // Disable all triggers, truncate everything, re-enable
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    // Disable triggers on all core tables
    for (const row of tablesRes.rows) {
      await client.query('ALTER TABLE core.' + row.tablename + ' DISABLE TRIGGER ALL');
    }
    // Truncate the tables we care about (keep users)
    const toTruncate = [
      'certification_artifacts',
      'close_checklist_items',
      'tenant_close_issues',
      'statement_packages',
      'recon_items',
      'intercompany_reconciliation_results',
      'budget_version_lines',
      'issue_items',
      'journal_entry_lines',
      'journal_entries',
      'period_trial_balance',
      'general_ledger',
      'close_sessions',
      'tenant_chart_of_accounts',
    ];
    for (const t of toTruncate) {
      try {
        await client.query('TRUNCATE TABLE core.' + t + ' CASCADE');
        console.log('  TRUNCATED: core.' + t);
      } catch (e) {
        console.log('  SKIP: core.' + t + ' -> ' + e.message.split('\n')[0]);
      }
    }
    // Re-enable triggers
    for (const row of tablesRes.rows) {
      await client.query('ALTER TABLE core.' + row.tablename + ' ENABLE TRIGGER ALL');
    }
    await client.query('COMMIT');
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('  Cleanup transaction failed:', e.message);
  } finally {
    client.release();
  }

  // Verify clean
  for (const t of ['general_ledger', 'period_trial_balance', 'close_sessions', 'tenant_chart_of_accounts']) {
    const r = await pool.query('SELECT COUNT(*) FROM core.' + t);
    console.log('  Verify:', t, '=', r.rows[0].count, 'rows');
  }

  // ── Step 2: Register a fresh test user and login ──
  console.log('\n======================================');
  console.log('STEP 2: Register + Login');
  console.log('======================================');

  // Tenants table is in public schema, not core
  let tenantId;
  for (const schema of ['public', 'core']) {
    try {
      const r = await pool.query('SELECT id FROM ' + schema + '.tenants LIMIT 1');
      if (r.rows.length > 0) { tenantId = r.rows[0].id; break; }
    } catch (e) { /* try next */ }
  }
  // Also try without schema
  if (!tenantId) {
    try {
      const r = await pool.query('SELECT id FROM tenants LIMIT 1');
      if (r.rows.length > 0) tenantId = r.rows[0].id;
    } catch (e) {
      // Find tenants table location
      const loc = await pool.query("SELECT schemaname, tablename FROM pg_tables WHERE tablename = 'tenants'");
      console.log('  Tenants table location:', JSON.stringify(loc.rows));
    }
  }
  console.log('  Tenant ID:', tenantId || '(not found)');

  // Register a fresh user
  const regRes = await fetch(API + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId,
      name: 'E2E Tester',
      email: 'e2e-test-' + Date.now() + '@test.com',
      password: 'TestPass123!',
      role: 'approver',
    }),
  });
  const regData = await regRes.json();
  console.log('  Register status:', regRes.status);

  let token;
  if (regRes.ok && regData.token) {
    token = regData.token;
    console.log('  Got token from registration');
  } else {
    console.log('  Register response:', JSON.stringify(regData).substring(0, 300));
  }

  if (!token) {
    console.error('\n  FATAL: Cannot authenticate. Aborting.');
    await pool.end();
    return;
  }

  const authHeaders = { 'Authorization': 'Bearer ' + token };

  // ── Step 3: Create close session ──
  console.log('\n======================================');
  console.log('STEP 3: Create close session for Jan 2026');
  console.log('======================================');
  const sessionRes = await fetch(API + '/api/close/sessions', {
    method: 'POST',
    headers: { ...authHeaders, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      entityId: 'default',
      periodStart: '2026-01-01',
      periodEnd: '2026-01-31',
    }),
  });
  const sessionData = await sessionRes.json();
  console.log('  Status:', sessionRes.status);
  console.log('  Response:', JSON.stringify(sessionData, null, 2).substring(0, 500));
  const sessionId = sessionData.id || sessionData.session?.id || sessionData.sessionId || '';
  console.log('  Session ID:', sessionId);

  // ── Step 4: Upload GL CSV ──
  console.log('\n======================================');
  console.log('STEP 4: Upload GL CSV for period 2026-01');
  console.log('======================================');
  const csvPath = path.join(__dirname, '..', 'test_data', 'sample_gl.csv');
  if (!fs.existsSync(csvPath)) {
    console.error('  CSV not found at:', csvPath);
    await pool.end();
    return;
  }
  const csvBuffer = fs.readFileSync(csvPath);
  console.log('  CSV file:', csvPath, '(' + csvBuffer.length + ' bytes)');

  const boundary = '----FormBoundary' + Date.now();
  const body = Buffer.concat([
    Buffer.from('--' + boundary + '\r\n'),
    Buffer.from('Content-Disposition: form-data; name="file"; filename="sample_gl.csv"\r\n'),
    Buffer.from('Content-Type: text/csv\r\n\r\n'),
    csvBuffer,
    Buffer.from('\r\n--' + boundary + '--\r\n'),
  ]);

  const glRes = await fetch(API + '/api/gl/ingest?period=2026-01', {
    method: 'POST',
    headers: {
      ...authHeaders,
      'Content-Type': 'multipart/form-data; boundary=' + boundary,
    },
    body,
  });
  const glData = await glRes.json();
  console.log('  Status:', glRes.status);
  console.log('  Response:', JSON.stringify(glData, null, 2).substring(0, 1000));

  // ── Step 5: Verify database ──
  console.log('\n======================================');
  console.log('STEP 5: Verify data persisted in DB');
  console.log('======================================');

  const q1 = await pool.query('SELECT COUNT(*) as count FROM core.general_ledger');
  console.log('  general_ledger rows:', q1.rows[0].count);

  const q2 = await pool.query("SELECT COUNT(*) as count FROM core.period_trial_balance WHERE period_label = '2026-01'");
  console.log('  period_trial_balance (2026-01):', q2.rows[0].count);

  const q3 = await pool.query('SELECT period_label, COUNT(*) as lines FROM core.general_ledger GROUP BY period_label');
  console.log('  GL by period:', JSON.stringify(q3.rows));

  const q4 = await pool.query("SELECT period_label, source, jsonb_array_length(entries) as entry_count FROM core.period_trial_balance WHERE period_label = '2026-01'");
  console.log('  TB detail:', JSON.stringify(q4.rows));

  if (parseInt(q1.rows[0].count) > 0) {
    const q5 = await pool.query('SELECT entry_id, account_code, debit, credit FROM core.general_ledger ORDER BY entry_id, line_number LIMIT 20');
    console.log('  GL entries:');
    console.table(q5.rows);
  }

  // ── Step 6: Verify via API ──
  console.log('\n======================================');
  console.log('STEP 6: Verify via trial-balance API');
  console.log('======================================');
  if (sessionId) {
    const tbRes = await fetch(API + '/api/close/sessions/' + sessionId + '/trial-balance', {
      headers: authHeaders,
    });
    const tbData = await tbRes.json();
    console.log('  Status:', tbRes.status);
    const preview = JSON.stringify(tbData, null, 2);
    console.log('  Response:', preview.substring(0, 1200));
  } else {
    console.log('  SKIPPED (no session ID)');
  }

  // ── Summary ──
  console.log('\n======================================');
  console.log('SUMMARY');
  console.log('======================================');
  const glCount = parseInt(q1.rows[0].count);
  const tbCount = parseInt(q2.rows[0].count);
  console.log('  GL rows:', glCount, glCount > 0 ? 'PASS' : 'FAIL');
  console.log('  TB rows:', tbCount, tbCount > 0 ? 'PASS' : 'FAIL');
  console.log('  Session:', sessionId ? 'CREATED' : 'FAILED');

  await pool.end();
}

main().catch(e => { console.error('FATAL:', e); process.exit(1); });
