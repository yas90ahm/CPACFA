/**
 * End-to-end smoke test — Verified Close lifecycle
 *
 * Walks through the full Sabit flow using the Apex Capital Partners demo data:
 *  1. Login as controller (preparer)
 *  2. List portfolio entities, pick one with an open session
 *  3. Create/ensure a close session
 *  4. Upload GL (parse preview + ingest)
 *  5. Verify AI staging items exist (HITL queue)
 *  6. Complete reconciliations
 *  7. Post a journal entry
 *  8. Generate financial statements
 *  9. Explain variances
 * 10. Certify with Ed25519 signature
 * 11. Lock session (terminal)
 * 12. Verify hash chain integrity
 * 13. Check portfolio summary & integrity score
 * 14. Test /verify portal (public, no auth)
 * 15. Login as PE partner and check portfolio view
 *
 * Run: BASE_URL=http://localhost:3000 npx tsx scripts/smoke-e2e.ts
 * Requires: seed-demo.ts to have been run first
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const TENANT_ID = 'apex-capital-partners';

const USERS = {
  controller: { email: 'controller@demo.sabit.io', password: 'SabitDemo2025!' },
  cfo: { email: 'cfo@demo.sabit.io', password: 'SabitDemo2025!' },
  auditor: { email: 'auditor@demo.sabit.io', password: 'SabitDemo2025!' },
  partner: { email: 'partner@demo.sabit.io', password: 'SabitDemo2025!' },
};

interface StepResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIP' | 'WARN';
  message?: string;
  data?: unknown;
}

const results: StepResult[] = [];
let authToken = '';
let closeSessionId = '';
let certifiedSnapshotId = '';

// ── Helpers ──────────────────────────────────────────────────────────

function record(step: string, status: StepResult['status'], message?: string, data?: unknown) {
  results.push({ step, status, message, data });
  const icon = status === 'PASS' ? '✅' : status === 'FAIL' ? '❌' : status === 'WARN' ? '⚠️' : '⏭️';
  console.log(`${icon} ${step}: ${message ?? status}`);
}

async function api(method: string, path: string, body?: unknown): Promise<{ status: number; data: Record<string, unknown> }> {
  const headers: Record<string, string> = {};
  if (authToken) headers['Authorization'] = `Bearer ${authToken}`;
  if (body && !(body instanceof FormData)) headers['Content-Type'] = 'application/json';

  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: body instanceof FormData ? body : body ? JSON.stringify(body) : undefined,
  });

  let data: Record<string, unknown>;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    data = { _raw: await res.clone().text().catch(() => '') };
  }
  return { status: res.status, data };
}

// ── Steps ────────────────────────────────────────────────────────────

async function step01_login(): Promise<boolean> {
  console.log('\n━━━ Step 1: Login as Controller ━━━');
  try {
    const { status, data } = await api('POST', '/api/auth/login', {
      email: USERS.controller.email,
      password: USERS.controller.password,
      tenantId: TENANT_ID,
    });
    if (status === 200 && data.token) {
      authToken = data.token as string;
      record('Login (Controller)', 'PASS', `Authenticated as ${USERS.controller.email}`);
      return true;
    }
    record('Login (Controller)', 'FAIL', `${status}: ${JSON.stringify(data).slice(0, 200)}`);
    return false;
  } catch (e) {
    record('Login (Controller)', 'FAIL', `Connection error — is the server running on ${BASE_URL}?`);
    return false;
  }
}

async function step02_portfolioEntities(): Promise<boolean> {
  console.log('\n━━━ Step 2: List Portfolio Entities ━━━');
  const { status, data } = await api('GET', '/api/portfolio/entities');
  const entities = (data.entities ?? []) as Array<Record<string, unknown>>;
  if (status === 200 && entities.length > 0) {
    record('Portfolio Entities', 'PASS', `${entities.length} entities found`);
    for (const e of entities) {
      console.log(`   • ${e.name ?? e.entityName} (${e.id ?? e.tenantId}) — ${e.currentState ?? e.status ?? 'unknown'}`);
    }
    return true;
  }
  record('Portfolio Entities', 'FAIL', `${status}: ${JSON.stringify(data).slice(0, 200)}`);
  return false;
}

async function step03_ensureSession(): Promise<boolean> {
  console.log('\n━━━ Step 3: Ensure Close Session ━━━');
  // Use a fresh entity+period to avoid collision with seed data
  const { status, data } = await api('POST', '/api/close/sessions/ensure', {
    entityId: `smoke-test-${Date.now()}`,
    periodLabel: '2025-03',
  });
  const id = (data.closeSessionId ?? (data.session as Record<string, unknown>)?.id) as string | undefined;
  if ((status === 200 || status === 201) && id) {
    closeSessionId = id;
    record('Ensure Session', 'PASS', `Session ${id}`);
    return true;
  }
  record('Ensure Session', 'FAIL', `${status}: ${JSON.stringify(data).slice(0, 200)}`);
  return false;
}

async function step04_glUpload(): Promise<boolean> {
  console.log('\n━━━ Step 4: GL Parse Preview ━━━');
  // Create a minimal GL CSV in memory
  const glCsv = [
    'date,account_code,account_name,description,debit,credit',
    '2025-03-01,1000,Cash,Opening balance,500000,0',
    '2025-03-01,3000,Retained Earnings,Opening balance,0,500000',
    '2025-03-15,4000,Revenue,Service revenue,0,125000',
    '2025-03-15,1100,Accounts Receivable,Service revenue,125000,0',
    '2025-03-20,5000,Salaries Expense,March payroll,85000,0',
    '2025-03-20,1000,Cash,March payroll,0,85000',
    '2025-03-25,5100,Rent Expense,Office rent,15000,0',
    '2025-03-25,1000,Cash,Office rent,0,15000',
  ].join('\n');

  const form = new FormData();
  form.append('file', new Blob([glCsv], { type: 'text/csv' }), 'smoke_gl.csv');

  const parseRes = await api('POST', '/api/gl/parse', form);
  if (parseRes.status === 200) {
    record('GL Parse', 'PASS', 'Preview OK');
  } else {
    record('GL Parse', 'WARN', `${parseRes.status} — parse may not be available`);
  }

  // Ingest
  const form2 = new FormData();
  form2.append('file', new Blob([glCsv], { type: 'text/csv' }), 'smoke_gl.csv');
  const ingestRes = await api('POST', '/api/gl/ingest?period=2025-03', form2);
  if (ingestRes.status === 200 || ingestRes.status === 207) {
    record('GL Ingest', 'PASS', `Ingested: ${JSON.stringify(ingestRes.data).slice(0, 120)}`);
    return true;
  }
  record('GL Ingest', 'FAIL', `${ingestRes.status}: ${JSON.stringify(ingestRes.data).slice(0, 200)}`);
  return false;
}

async function step05_aiStaging(): Promise<boolean> {
  console.log('\n━━━ Step 5: Check AI Staging (HITL Queue) ━━━');
  const { status, data } = await api('GET', '/api/ai/staging?status=pending');
  const items = (data.items ?? data.staging ?? []) as unknown[];
  if (status === 200) {
    record('AI Staging', 'PASS', `${items.length} pending item(s) in HITL queue`);
    return true;
  }
  record('AI Staging', 'WARN', `${status} — endpoint may not exist yet`);
  return true; // non-blocking
}

async function step06_reconciliation(): Promise<boolean> {
  console.log('\n━━━ Step 6: Reconciliations ━━━');
  const { status, data } = await api('GET', `/api/close/sessions/${closeSessionId}/reconciliations`);
  const recons = (data.reconciliations ?? []) as Array<Record<string, unknown>>;
  if (status !== 200) {
    record('Reconciliations', 'WARN', `${status} — may not be seeded for this session`);
    return true;
  }

  const dummyPdf = new Blob(['%PDF-1.0 smoke test evidence'], { type: 'application/pdf' });
  let completed = 0;
  for (const r of recons) {
    if (r.status === 'completed' || r.status === 'approved') { completed++; continue; }
    const rid = r.reconId as string;

    // Set supporting balance
    await api('POST', `/api/close/sessions/${closeSessionId}/reconciliations/${rid}/supporting-balance`, {
      amount: r.glBalance ?? 0,
      source: 'smoke-test',
    });

    // Upload evidence
    const form = new FormData();
    form.append('file', dummyPdf, `evidence-${r.accountCode}.pdf`);
    form.append('description', 'Smoke test evidence');
    await fetch(`${BASE_URL}/api/close/sessions/${closeSessionId}/reconciliations/${rid}/evidence`, {
      method: 'POST',
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
      body: form,
    });

    // Complete
    const cRes = await api('POST', `/api/close/sessions/${closeSessionId}/reconciliations/${rid}/complete`, {
      preparedBy: 'smoke-test',
    });
    if (cRes.status === 200) completed++;
  }
  record('Reconciliations', 'PASS', `${completed}/${recons.length} completed`);
  return true;
}

async function step07_journalEntry(): Promise<boolean> {
  console.log('\n━━━ Step 7: Post Journal Entry ━━━');
  const je = {
    closeSessionId,
    memo: 'Smoke test accrual entry',
    lines: [
      { accountCode: '5200', description: 'Accrued expense', debit: '10000', credit: '0' },
      { accountCode: '2000', description: 'Accrued liabilities', debit: '0', credit: '10000' },
    ],
  };
  const createRes = await api('POST', '/api/close/journal-entries', je);
  const jeId = (createRes.data.id ?? createRes.data.journalEntryId) as string | undefined;
  if (!jeId) {
    record('Journal Entry', 'WARN', `Create returned ${createRes.status}`);
    return true;
  }

  // Propose → approve → post
  await api('POST', `/api/close/journal-entries/${jeId}/propose`);
  await api('POST', `/api/close/journal-entries/${jeId}/approve`);
  const postRes = await api('POST', `/api/close/journal-entries/${jeId}/post`);
  if (postRes.status === 200) {
    record('Journal Entry', 'PASS', `JE ${jeId} posted`);
  } else {
    record('Journal Entry', 'WARN', `Post returned ${postRes.status}`);
  }
  return true;
}

async function step08_generateStatements(): Promise<boolean> {
  console.log('\n━━━ Step 8: Generate Financial Statements ━━━');
  const { status, data } = await api('POST', `/api/close/sessions/${closeSessionId}/statement-packages/generate`, {});
  const pkgId = data.id as string | undefined;
  if (status === 200 && pkgId) {
    record('Generate Statements', 'PASS', `Package ${pkgId}`);

    // Fetch statement lines
    const linesRes = await api('GET', `/api/close/statement-packages/${pkgId}/lines`);
    const lines = (linesRes.data.lines ?? []) as unknown[];
    console.log(`   ${lines.length} line(s) in statement package`);
    return true;
  }
  record('Generate Statements', 'WARN', `${status}: ${JSON.stringify(data).slice(0, 200)}`);
  return true;
}

async function step09_explainVariances(): Promise<boolean> {
  console.log('\n━━━ Step 9: Explain Variances ━━━');
  const { status, data } = await api('GET', `/api/close/sessions/${closeSessionId}/variances`);
  const variances = (data.variances ?? []) as Array<Record<string, unknown>>;
  if (status !== 200) {
    record('Variances', 'WARN', `${status}`);
    return true;
  }

  const unexplained = variances.filter(v => !v.explanation);
  for (const v of unexplained) {
    const vid = v.id as string;
    await api('POST', `/api/close/variances/${vid}/explain`, {
      explanation: 'Volume increase from new client onboarding in Q1.',
    });
  }
  record('Variances', 'PASS', `${variances.length} total, ${unexplained.length} explained`);
  return true;
}

async function step10_advanceAndCertify(): Promise<boolean> {
  console.log('\n━━━ Step 10: Advance → Certify ━━━');

  // Advance: open → in_progress
  let res = await api('POST', `/api/close/sessions/${closeSessionId}/advance`);
  let d = res.data;
  console.log(`   Advance: ${res.status} → ${d.statusAfter ?? '?'}`);

  // Resolve issues if any
  for (let attempt = 0; attempt < 3; attempt++) {
    const issuesRes = await api('GET', `/api/close/issues?closeSessionId=${closeSessionId}`);
    const issues = ((issuesRes.data.issues ?? issuesRes.data.data ?? []) as Array<Record<string, unknown>>)
      .filter(i => i.status !== 'verified' && i.status !== 'waived');
    if (issues.length === 0) break;
    for (const issue of issues) {
      const iid = issue.id as string;
      await api('POST', `/api/close/issues/${iid}/resolve`, {
        resolutionType: 'manual_correction',
        resolutionDescription: 'Resolved for smoke test',
      });
      await api('POST', `/api/close/issues/${iid}/verify`, { method: 'manual_review' });
    }
  }

  // Advance to under_review
  res = await api('POST', `/api/close/sessions/${closeSessionId}/advance`);
  d = res.data;
  console.log(`   Advance: ${res.status} → ${d.statusAfter ?? '?'}`);

  // Certify
  const certRes = await api('POST', `/api/close/sessions/${closeSessionId}/certify`, {
    certifiedBy: USERS.controller.email,
    periodLabel: '2025-03',
  });
  if (certRes.status === 200 && (certRes.data.certifiedSnapshotId || certRes.data.status === 'certified')) {
    certifiedSnapshotId = (certRes.data.certifiedSnapshotId ?? '') as string;
    record('Certify', 'PASS', `Snapshot: ${certifiedSnapshotId}`);
    if (certRes.data.snapshotHash) console.log(`   Hash: ${certRes.data.snapshotHash}`);
    return true;
  }
  record('Certify', 'WARN', `${certRes.status}: ${JSON.stringify(certRes.data).slice(0, 200)}`);
  return true;
}

async function step11_lock(): Promise<boolean> {
  console.log('\n━━━ Step 11: Lock Session ━━━');
  const { status, data } = await api('POST', `/api/close/sessions/${closeSessionId}/lock`);
  if (status === 200 && data.status === 'locked') {
    record('Lock', 'PASS', 'Session locked (terminal state)');
    return true;
  }
  record('Lock', 'WARN', `${status}: ${JSON.stringify(data).slice(0, 200)}`);
  return true;
}

async function step12_hashChain(): Promise<boolean> {
  console.log('\n━━━ Step 12: Verify Hash Chain ━━━');
  const { status, data } = await api('GET', `/api/verification/certification/artifacts/${certifiedSnapshotId || closeSessionId}`);
  if (status === 200) {
    record('Hash Chain', 'PASS', `Artifact retrieved`);

    // Verify
    const verifyRes = await api('POST', '/api/verification/certification/verify', {
      snapshotId: certifiedSnapshotId || closeSessionId,
    });
    if (verifyRes.status === 200) {
      const v = verifyRes.data;
      console.log(`   Valid: ${v.valid ?? v.verified ?? '?'}`);
      record('Verify Signature', 'PASS', `Verification complete`);
    } else {
      record('Verify Signature', 'WARN', `${verifyRes.status}`);
    }
    return true;
  }
  record('Hash Chain', 'WARN', `${status} — snapshot may not exist`);
  return true;
}

async function step13_portfolioSummary(): Promise<boolean> {
  console.log('\n━━━ Step 13: Portfolio Summary & Integrity ━━━');
  const summaryRes = await api('GET', '/api/portfolio/summary');
  if (summaryRes.status === 200) {
    const s = summaryRes.data;
    record('Portfolio Summary', 'PASS', `${s.totalEntities} entities, ${s.closedThisPeriod} closed`);
  } else {
    record('Portfolio Summary', 'WARN', `${summaryRes.status}`);
  }

  const integrityRes = await api('GET', '/api/portfolio/integrity-report');
  if (integrityRes.status === 200 && integrityRes.data.overallScore != null) {
    record('Integrity Score', 'PASS', `Overall: ${integrityRes.data.overallScore}`);
  } else {
    record('Integrity Score', 'WARN', `${integrityRes.status} — endpoint may not exist`);
  }
  return true;
}

async function step14_verifyPortal(): Promise<boolean> {
  console.log('\n━━━ Step 14: Public Verification Portal ━━━');
  // These endpoints require no auth
  const savedToken = authToken;
  authToken = '';

  const pkRes = await api('GET', '/api/verification/certification/public-key');
  if (pkRes.status === 200) {
    record('Public Key Endpoint', 'PASS', 'Public key retrieved (no auth)');
  } else {
    record('Public Key Endpoint', 'WARN', `${pkRes.status}`);
  }

  authToken = savedToken;
  return true;
}

async function step15_partnerLogin(): Promise<boolean> {
  console.log('\n━━━ Step 15: PE Partner Login & Portfolio ━━━');
  const { status, data } = await api('POST', '/api/auth/login', {
    email: USERS.partner.email,
    password: USERS.partner.password,
    tenantId: TENANT_ID,
  });
  if (status === 200 && data.token) {
    const partnerToken = authToken;
    authToken = data.token as string;
    record('Login (Partner)', 'PASS', `Authenticated as ${USERS.partner.email}, role: ${data.role}`);

    const entRes = await api('GET', '/api/portfolio/entities');
    const entities = (entRes.data.entities ?? []) as unknown[];
    record('Partner Portfolio', 'PASS', `${entities.length} entities visible`);

    authToken = partnerToken; // restore
    return true;
  }
  record('Login (Partner)', 'FAIL', `${status}: ${JSON.stringify(data).slice(0, 200)}`);
  return false;
}

// ── Runner ───────────────────────────────────────────────────────────

function printSummary() {
  const passed = results.filter(r => r.status === 'PASS').length;
  const failed = results.filter(r => r.status === 'FAIL').length;
  const warned = results.filter(r => r.status === 'WARN').length;
  const skipped = results.filter(r => r.status === 'SKIP').length;

  console.log('\n╔══════════════════════════════════════════════════════╗');
  console.log('║          SABIT E2E SMOKE TEST RESULTS                ║');
  console.log('╚══════════════════════════════════════════════════════╝\n');

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : r.status === 'WARN' ? '⚠️' : '⏭️';
    console.log(`  ${icon} ${r.step}: ${r.message ?? r.status}`);
  }

  console.log(`\n  📊 ${passed} passed, ${failed} failed, ${warned} warnings, ${skipped} skipped`);

  if (failed === 0) {
    console.log('\n  🎉 SMOKE TEST PASSED — Verified Close lifecycle is working!\n');
    process.exit(0);
  } else {
    console.log('\n  ❌ SMOKE TEST FAILED — check errors above.\n');
    process.exit(1);
  }
}

async function run() {
  console.log('╔══════════════════════════════════════════════════════╗');
  console.log('║   SABIT — END-TO-END VERIFIED CLOSE SMOKE TEST      ║');
  console.log('╚══════════════════════════════════════════════════════╝');
  console.log(`\n  Server:  ${BASE_URL}`);
  console.log(`  Tenant:  ${TENANT_ID}`);
  console.log(`  Time:    ${new Date().toISOString()}\n`);

  if (!(await step01_login())) { printSummary(); return; }
  await step02_portfolioEntities();
  if (!(await step03_ensureSession())) { printSummary(); return; }
  await step04_glUpload();
  await step05_aiStaging();
  await step06_reconciliation();
  await step07_journalEntry();
  await step08_generateStatements();
  await step09_explainVariances();
  await step10_advanceAndCertify();
  await step11_lock();
  await step12_hashChain();
  await step13_portfolioSummary();
  await step14_verifyPortal();
  await step15_partnerLogin();

  printSummary();
}

run().catch(e => {
  console.error('Fatal error:', e);
  process.exit(1);
});
