#!/usr/bin/env npx tsx
// Reproduce Bug 2: stacked AJE creation 500 (AI boundary leak)

const BASE = process.env.UAT_API_URL || 'http://localhost:3001';

async function go() {
  // Login or register
  let loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'je-test-admin@test.local', password: 'TestPassword123!@#' }),
  });
  let loginData: any = await loginRes.json().catch(() => ({}));
  let token = loginData.token || loginData.accessToken;
  let tenantId = loginData.tenantId;

  if (!token) {
    const regRes = await fetch(BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'je-test-admin@test.local', password: 'TestPassword123!@#', name: 'JE Admin', role: 'approver', tenantName: 'JE Test Tenant' }),
    });
    const regData: any = await regRes.json().catch(() => ({}));
    token = regData.token || regData.accessToken;
    tenantId = regData.tenantId;
    console.log('Registered:', regRes.status, 'tenantId:', tenantId);
  } else {
    console.log('Logged in. Tenant:', tenantId);
  }

  if (!token) { console.error('No token!'); process.exit(1); }

  // Register approver
  const regRes2 = await fetch(BASE + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'je-test-approver@test.local', password: 'TestPassword123!@#', name: 'JE Approver', role: 'approver', tenantName: 'JE Test Tenant' }),
  });
  let approverToken = token; // fallback
  if (regRes2.ok) {
    const rd: any = await regRes2.json().catch(() => ({}));
    if (rd.token || rd.accessToken) approverToken = rd.token || rd.accessToken;
  } else {
    // Try login
    const lr = await fetch(BASE + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'je-test-approver@test.local', password: 'TestPassword123!@#' }),
    });
    const ld: any = await lr.json().catch(() => ({}));
    if (ld.token || ld.accessToken) approverToken = ld.token || ld.accessToken;
  }

  const h = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  const ah = { 'Authorization': 'Bearer ' + token };
  const approverH = { 'Authorization': 'Bearer ' + approverToken, 'Content-Type': 'application/json' };

  // Upload GL
  const csv = `entry_id,date,account_code,account_name,debit,credit,memo
JE-001,2098-06-15,1000,Cash at Bank,100000.00,0.00,Opening
JE-001,2098-06-15,3000,Common Stock Equity,0.00,100000.00,Opening`;
  const fd = new FormData();
  fd.append('file', new Blob([csv], { type: 'text/csv' }), 'gl.csv');
  let r = await fetch(BASE + '/api/gl/ingest?period=2098-06', { method: 'POST', headers: ah, body: fd });
  console.log('GL ingest:', r.status);

  // Create session
  r = await fetch(BASE + '/api/close/sessions', {
    method: 'POST', headers: h,
    body: JSON.stringify({ entityId: 'je-stacked-test', periodStart: '2098-06-01', periodEnd: '2098-06-30' }),
  });
  const session: any = await r.json();
  console.log('Session:', r.status, session.id);
  if (!session.id) { console.log('ERR:', JSON.stringify(session)); return; }

  // Advance to in_progress
  r = await fetch(BASE + `/api/close/sessions/${session.id}/status`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ status: 'in_progress' }),
  });
  console.log('Advance:', r.status);

  // Create 5 stacked JEs with full lifecycle
  const ALLOW_SAME = process.env.ALLOW_SAME_USER_APPROVE === '1';
  for (let i = 1; i <= 5; i++) {
    console.log(`\n--- JE ${i} ---`);

    // CREATE
    r = await fetch(BASE + '/api/close/journal-entries', {
      method: 'POST', headers: h,
      body: JSON.stringify({
        closeSessionId: session.id,
        memo: `Test stacked AJE #${i}`,
        source: 'manual',
        lines: [
          { accountRef: '5100', debit: 1000 * i, credit: 0, description: `Expense ${i}`, amountProvenance: { kind: 'human_entered', enteredBy: 'test' } },
          { accountRef: '2100', debit: 0, credit: 1000 * i, description: `Payable ${i}`, amountProvenance: { kind: 'human_entered', enteredBy: 'test' } },
        ],
      }),
    });
    const je: any = await r.json().catch(() => ({}));
    console.log(`  Create: ${r.status} ${je.id ?? JSON.stringify(je).slice(0, 200)}`);
    if (r.status !== 201 || !je.id) { console.log('  FAILED at create'); continue; }

    // PROPOSE
    r = await fetch(BASE + `/api/close/journal-entries/${je.id}/propose`, {
      method: 'POST', headers: h, body: '{}',
    });
    console.log(`  Propose: ${r.status}`);
    if (r.status >= 400) { const t = await r.text(); console.log('  ERR:', t.slice(0, 200)); continue; }

    // APPROVE (use approver token for SoD)
    r = await fetch(BASE + `/api/close/journal-entries/${je.id}/approve`, {
      method: 'POST', headers: ALLOW_SAME ? h : approverH,
      body: JSON.stringify({ approvedBy: 'je-test-approver@test.local' }),
    });
    console.log(`  Approve: ${r.status}`);
    if (r.status >= 400) { const t = await r.text(); console.log('  ERR:', t.slice(0, 200)); continue; }

    // POST
    r = await fetch(BASE + `/api/close/journal-entries/${je.id}/post`, {
      method: 'POST', headers: h, body: '{}',
    });
    const postBody = await r.text();
    console.log(`  Post: ${r.status} ${postBody.slice(0, 200)}`);
  }

  console.log('\nDone!');
}

go().catch(e => { console.error('FATAL:', e); process.exit(1); });
