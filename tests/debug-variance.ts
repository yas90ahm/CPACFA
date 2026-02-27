#!/usr/bin/env npx tsx
// Minimal reproduction of variance 500 error

const BASE = process.env.UAT_API_URL || 'http://localhost:3001';

async function go() {
  // Login
  let loginRes = await fetch(BASE + '/api/auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'acc-admin-test@test.local', password: 'TestPassword123!@#' }),
  });
  let loginData: any = await loginRes.json().catch(() => ({}));
  let token = loginData.token || loginData.accessToken;
  let tenantId = loginData.tenantId;

  if (!token) {
    const regRes = await fetch(BASE + '/api/auth/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'acc-admin-test@test.local', password: 'TestPassword123!@#', name: 'Var Test', role: 'approver', tenantName: 'Var Test Tenant' }),
    });
    const regData: any = await regRes.json().catch(() => ({}));
    token = regData.token || regData.accessToken;
    tenantId = regData.tenantId;
    console.log('Registered:', regRes.status);
  } else {
    console.log('Logged in. Tenant:', tenantId);
  }

  if (!token) {
    console.error('No token!');
    process.exit(1);
  }

  const h = { 'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json' };
  const ah = { 'Authorization': 'Bearer ' + token };

  // Upload prior GL
  const priorCSV = `entry_id,date,account_code,account_name,debit,credit,memo
JE-P1,2099-01-15,1000,Cash at Bank,50000.00,0.00,Prior
JE-P1,2099-01-15,3000,Common Stock Equity,0.00,30000.00,Prior
JE-P1,2099-01-15,4000,Service Revenue,0.00,30000.00,Prior
JE-P1,2099-01-15,5000,Salary Expense,10000.00,0.00,Prior`;

  const fd1 = new FormData();
  fd1.append('file', new Blob([priorCSV], { type: 'text/csv' }), 'gl.csv');
  let r = await fetch(BASE + '/api/gl/ingest?period=2099-01', { method: 'POST', headers: ah, body: fd1 });
  let j: any = await r.json().catch(() => ({}));
  console.log('Prior GL:', r.status, JSON.stringify(j).slice(0, 150));

  // Create prior session
  r = await fetch(BASE + '/api/close/sessions', {
    method: 'POST', headers: h,
    body: JSON.stringify({ entityId: 'var-dbg6', periodStart: '2099-01-01', periodEnd: '2099-01-31' }),
  });
  const s1: any = await r.json();
  console.log('Prior session:', r.status, s1.id);
  if (!s1.id) { console.log('ERR:', JSON.stringify(s1)); return; }

  // Advance
  r = await fetch(BASE + `/api/close/sessions/${s1.id}/status`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ status: 'in_progress' }),
  });
  console.log('Advance prior:', r.status);

  // Generate prior statements
  r = await fetch(BASE + `/api/close/sessions/${s1.id}/statement-packages/generate`, {
    method: 'POST', headers: h, body: '{}',
  });
  j = await r.json().catch(() => ({}));
  console.log('Prior gen:', r.status, j.id ? 'OK' : JSON.stringify(j).slice(0, 200));

  // Upload current GL
  const currCSV = `entry_id,date,account_code,account_name,debit,credit,memo
JE-C1,2099-02-15,1000,Cash at Bank,60000.00,0.00,Current
JE-C1,2099-02-15,3000,Common Stock Equity,0.00,35000.00,Current
JE-C1,2099-02-15,4000,Service Revenue,0.00,40000.00,Current
JE-C1,2099-02-15,5000,Salary Expense,15000.00,0.00,Current`;

  const fd2 = new FormData();
  fd2.append('file', new Blob([currCSV], { type: 'text/csv' }), 'gl.csv');
  r = await fetch(BASE + '/api/gl/ingest?period=2099-02', { method: 'POST', headers: ah, body: fd2 });
  console.log('Current GL:', r.status);

  // Create current session
  r = await fetch(BASE + '/api/close/sessions', {
    method: 'POST', headers: h,
    body: JSON.stringify({ entityId: 'var-dbg6', periodStart: '2099-02-01', periodEnd: '2099-02-28' }),
  });
  const s2: any = await r.json();
  console.log('Current session:', r.status, s2.id);
  if (!s2.id) { console.log('ERR:', JSON.stringify(s2)); return; }

  // Advance
  r = await fetch(BASE + `/api/close/sessions/${s2.id}/status`, {
    method: 'PATCH', headers: h,
    body: JSON.stringify({ status: 'in_progress' }),
  });
  console.log('Advance current:', r.status);

  // Generate current statements (triggers variance)
  r = await fetch(BASE + `/api/close/sessions/${s2.id}/statement-packages/generate`, {
    method: 'POST', headers: h, body: '{}',
  });
  const body = await r.text();
  console.log('Current gen HTTP:', r.status);
  console.log('Body:', body.slice(0, 800));
}

go().catch(e => { console.error('FATAL:', e); process.exit(1); });
