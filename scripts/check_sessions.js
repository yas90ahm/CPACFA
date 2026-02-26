const API = 'http://localhost:3001';

async function main() {
  // Register a known browser user
  const regRes = await fetch(API + '/api/auth/register', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      tenantId: 'demo-cloudmetrics',
      name: 'Browser User',
      email: 'browser@test.com',
      password: 'Test1234!',
      role: 'approver',
    }),
  });
  const regData = await regRes.json();
  let token = regData.token;

  if (!token) {
    // Already exists, login
    const loginRes = await fetch(API + '/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'browser@test.com', password: 'Test1234!' }),
    });
    const loginData = await loginRes.json();
    token = loginData.token;
    if (!token) {
      console.log('AUTH FAILED:', JSON.stringify(loginData));
      return;
    }
    console.log('Logged in as browser@test.com');
  } else {
    console.log('Registered browser@test.com');
  }

  console.log('\n=== Login Credentials for Browser ===');
  console.log('  Email:    browser@test.com');
  console.log('  Password: Test1234!');

  // List sessions
  const sessRes = await fetch(API + '/api/close/sessions', {
    headers: { 'Authorization': 'Bearer ' + token },
  });
  const sessData = await sessRes.json();
  console.log('\n=== Close Sessions ===');
  console.log('Status:', sessRes.status);

  if (Array.isArray(sessData)) {
    for (const s of sessData) {
      console.log('\n  Session:', s.id);
      console.log('    Entity:', s.entityId || s.entity_id);
      console.log('    Period:', s.periodStart || s.period_start, '→', s.periodEnd || s.period_end);
      console.log('    Status:', s.status);
      console.log('    URL:   http://localhost:3002/close/' + s.id + '/dashboard');
    }
  } else if (sessData.sessions) {
    for (const s of sessData.sessions) {
      console.log('\n  Session:', s.id);
      console.log('    Entity:', s.entityId || s.entity_id);
      console.log('    Period:', s.periodStart || s.period_start, '→', s.periodEnd || s.period_end);
      console.log('    Status:', s.status);
      console.log('    URL:   http://localhost:3002/close/' + s.id + '/dashboard');
    }
  } else {
    console.log(JSON.stringify(sessData, null, 2).substring(0, 1000));
  }

  // Check TB for the session
  const sessions = Array.isArray(sessData) ? sessData : (sessData.sessions || []);
  for (const s of sessions) {
    const tbRes = await fetch(API + '/api/close/sessions/' + s.id + '/trial-balance', {
      headers: { 'Authorization': 'Bearer ' + token },
    });
    const tbData = await tbRes.json();
    const rowCount = tbData.rows ? tbData.rows.length : 0;
    console.log('\n  TB for session', s.id.substring(0, 8) + '...:', rowCount, 'accounts, balanced:', tbData.balanced);
  }
}

main().catch(e => console.error('ERROR:', e));
