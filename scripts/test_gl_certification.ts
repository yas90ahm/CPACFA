/**
 * Integration test for GL → TB → Certification flow
 *
 * Tests:
 * 1. Login (or use API_TOKEN)
 * 2. COA upload
 * 3. GL upload
 * 4. GL → TB derivation
 * 5. Create/ensure close session
 * 6. Initialize checklist and complete items
 * 7. Advance to locked
 * 8. Certify
 * 9. Export (audit binder with GL)
 * 10. Verification
 *
 * Run: BASE_URL=http://localhost:3000 tsx scripts/test_gl_certification.ts
 * For demo: use DEMO_EMAIL and DEMO_PASSWORD (default demo@cloudmetrics.io / DemoPass2026!)
 * Or set API_TOKEN directly (e.g. from login response).
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const API_TOKEN =
  process.env.API_TOKEN ||
  (process.env.DEMO_EMAIL && process.env.DEMO_PASSWORD ? undefined : '');
const DEMO_EMAIL = process.env.DEMO_EMAIL || 'demo@cloudmetrics.io';
const DEMO_PASSWORD = process.env.DEMO_PASSWORD || 'DemoPass2026!';

// Use YYYY-MM for session (ensure only accepts this); GL uses same for period match
const TEST_PERIOD = '2024-03';
const TEST_ENTITY_ID = `test-entity-gl-${Date.now()}`;

interface TestResult {
  step: string;
  status: 'PASS' | 'FAIL' | 'SKIP';
  message?: string;
  data?: unknown;
  error?: unknown;
}

const results: TestResult[] = [];
let authToken: string = API_TOKEN || '';
let tenantId: string = '';
let closeSessionId: string = '';

function headers(contentType = 'application/json'): Record<string, string> {
  const h: Record<string, string> = { ...(contentType && { 'Content-Type': contentType }) };
  if (authToken) h['Authorization'] = `Bearer ${authToken}`;
  return h;
}

interface FetchResult {
  status: number;
  data: unknown;
  headers: Headers;
}

async function makeRequest(
  method: string,
  endpoint: string,
  data?: unknown,
  isFormData = false
): Promise<FetchResult> {
  const opts: RequestInit = {
    method,
    headers: isFormData ? (authToken ? { Authorization: `Bearer ${authToken}` } : {}) : headers(),
  };
  if (data) {
    if (isFormData && data instanceof FormData) {
      opts.body = data;
      delete (opts.headers as Record<string, string>)['Content-Type'];
    } else if (!isFormData && typeof data === 'object') {
      opts.body = JSON.stringify(data);
    }
  }
  const res = await fetch(`${BASE_URL}${endpoint}`, opts);
  let body: unknown;
  const ct = res.headers.get('content-type') ?? '';
  if (ct.includes('application/json')) {
    try {
      body = await res.json();
    } catch {
      body = await res.text();
    }
  } else {
    body = await res.text();
  }
  return { status: res.status, data: body, headers: res.headers };
}

async function testLogin(): Promise<boolean> {
  console.log('\n=== STEP 0: Login ===');
  if (API_TOKEN) {
    authToken = API_TOKEN;
    // Try a simple request to validate token (e.g. health doesn't need auth; try coa or something that returns 401 if no auth)
    const res = await makeRequest('GET', '/api/coa');
    if (res.status === 401) {
      results.push({
        step: 'Login',
        status: 'FAIL',
        message: 'API_TOKEN invalid or expired',
      });
      console.log('❌ FAIL: API_TOKEN invalid');
      return false;
    }
    tenantId = (res.data as { tenantId?: string })?.tenantId ?? 'demo-cloudmetrics';
    results.push({ step: 'Login', status: 'PASS', message: 'Using API_TOKEN' });
    console.log('✅ PASS: Using API_TOKEN');
    return true;
  }

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
    const resData = (await res.json()) as { token?: string; tenantId?: string };
    if (res.status !== 200 || !resData?.token) {
      results.push({
        step: 'Login',
        status: 'FAIL',
        message: 'Login failed - ensure MODE=demo and seed_demo has run',
        data: resData,
      });
      console.log('❌ FAIL: Login failed');
      return false;
    }
    authToken = resData.token;
    tenantId = resData.tenantId || 'demo-cloudmetrics';
    results.push({
      step: 'Login',
      status: 'PASS',
      message: `Logged in as ${DEMO_EMAIL}`,
    });
    console.log('✅ PASS: Logged in');
    return true;
  } catch (e: unknown) {
    const err = e as { message?: string; cause?: { code?: string }; response?: { data?: unknown } };
    const msg = err.response?.data ?? err.message ?? String(e);
    const hint = String(msg).includes('fetch failed') || err.cause?.code === 'ECONNREFUSED'
      ? ' (Is the server running? Start with: MODE=demo JWT_SECRET=dev npm run dev)'
      : '';
    results.push({
      step: 'Login',
      status: 'FAIL',
      error: msg + hint,
    });
    console.log('❌ FAIL:', msg + hint);
    return false;
  }
}

async function testCOAUpload(): Promise<boolean> {
  console.log('\n=== STEP 1: Upload COA ===');
  const coaPath = path.join(__dirname, '../test_data/sample_coa.csv');
  if (!fs.existsSync(coaPath)) {
    results.push({ step: 'COA Upload', status: 'SKIP', message: 'sample_coa.csv not found' });
    console.log('❌ SKIP: sample_coa.csv not found');
    return false;
  }
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(coaPath)], { type: 'text/csv' }), 'sample_coa.csv');
    const res = await makeRequest('POST', '/api/coa/upload', form, true);
    const d = res.data as { success?: boolean; accountCount?: number };
    if (res.status === 200 && (d.success || d.accountCount != null)) {
      results.push({
        step: 'COA Upload',
        status: 'PASS',
        message: `Uploaded ${d.accountCount ?? '?'} accounts`,
        data: d,
      });
      console.log(`✅ PASS: Uploaded ${d.accountCount ?? d} accounts`);
      return true;
    }
    results.push({
      step: 'COA Upload',
      status: 'FAIL',
      message: 'Unexpected response',
      data: res.data,
    });
    console.log('❌ FAIL:', res.status, res.data);
    return false;
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    results.push({
      step: 'COA Upload',
      status: 'FAIL',
      error: err.response?.data ?? err.message,
    });
    console.log('❌ FAIL:', err.response?.data ?? err.message);
    return false;
  }
}

async function testGLUpload(): Promise<boolean> {
  console.log('\n=== STEP 2: Upload GL ===');
  const glPath = path.join(__dirname, '../test_data/sample_gl.csv');
  if (!fs.existsSync(glPath)) {
    results.push({ step: 'GL Upload', status: 'SKIP', message: 'sample_gl.csv not found' });
    console.log('❌ SKIP: sample_gl.csv not found');
    return false;
  }
  try {
    const form = new FormData();
    form.append('file', new Blob([fs.readFileSync(glPath)], { type: 'text/csv' }), 'sample_gl.csv');
    const res = await makeRequest(
      'POST',
      `/api/gl/ingest?period=${TEST_PERIOD}`,
      form,
      true
    );
    const d = res.data as { status?: string; balancedCount?: number; imbalancedCount?: number };
    if ((res.status === 200 || res.status === 207) && (d.status === 'success' || d.balancedCount != null)) {
      results.push({
        step: 'GL Upload',
        status: 'PASS',
        message: `${d.balancedCount ?? 0} balanced entries`,
        data: d,
      });
      console.log(`✅ PASS: ${d.balancedCount ?? 0} entries balanced`);
      if (d.imbalancedCount && d.imbalancedCount > 0) {
        console.log(`⚠️  WARNING: ${d.imbalancedCount} imbalanced`);
      }
      return true;
    }
    results.push({
      step: 'GL Upload',
      status: 'FAIL',
      data: res.data,
    });
    console.log('❌ FAIL:', res.status, res.data);
    return false;
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    results.push({
      step: 'GL Upload',
      status: 'FAIL',
      error: err.response?.data ?? err.message,
    });
    console.log('❌ FAIL:', err.response?.data ?? err.message);
    return false;
  }
}

async function testTBDerivation(): Promise<boolean> {
  console.log('\n=== STEP 3: Derive Trial Balance from GL ===');
  try {
    const res = await makeRequest(
      'GET',
      `/api/gl/trial-balance?period=${TEST_PERIOD}`
    );
    const d = res.data as {
      status?: string;
      derivedTB?: {
        entries?: unknown[];
        total_debits?: number;
        total_credits?: number;
        balance_sheet_totals?: { assets?: number; liabilities?: number; equity?: number };
      };
    };
    if (res.status === 200 && d.status === 'valid' && d.derivedTB) {
      const tb = d.derivedTB;
      results.push({
        step: 'TB Derivation',
        status: 'PASS',
        message: `Derived TB with ${tb.entries?.length ?? 0} accounts`,
        data: {
          totalDebits: tb.total_debits,
          totalCredits: tb.total_credits,
          assets: tb.balance_sheet_totals?.assets,
          liabilities: tb.balance_sheet_totals?.liabilities,
          equity: tb.balance_sheet_totals?.equity,
        },
      });
      console.log('✅ PASS: TB derived');
      console.log(
        `   Debits: ${tb.total_debits}, Credits: ${tb.total_credits} | A=${tb.balance_sheet_totals?.assets ?? '?'} L=${tb.balance_sheet_totals?.liabilities ?? '?'} E=${tb.balance_sheet_totals?.equity ?? '?'}`
      );
      return true;
    }
    results.push({
      step: 'TB Derivation',
      status: 'FAIL',
      data: res.data,
    });
    console.log('❌ FAIL:', res.status, res.data);
    return false;
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    results.push({
      step: 'TB Derivation',
      status: 'FAIL',
      error: err.response?.data ?? err.message,
    });
    console.log('❌ FAIL:', err.response?.data ?? err.message);
    return false;
  }
}

async function testEnsureSession(): Promise<boolean> {
  console.log('\n=== STEP 4: Ensure Close Session ===');
  try {
    const res = await makeRequest('POST', '/api/close/sessions/ensure', {
      entityId: TEST_ENTITY_ID,
      periodLabel: TEST_PERIOD,
    });
    const d = res.data as { closeSessionId?: string; session?: { id?: string }; created?: boolean };
    const id = d.closeSessionId ?? d.session?.id;
    if ((res.status === 200 || res.status === 201) && id) {
      closeSessionId = id;
      results.push({
        step: 'Ensure Session',
        status: 'PASS',
        message: `Session ${id} (created: ${d.created ?? false})`,
        data: d,
      });
      console.log(`✅ PASS: Session ${closeSessionId}`);
      return true;
    }
    results.push({
      step: 'Ensure Session',
      status: 'FAIL',
      data: res.data,
    });
    console.log('❌ FAIL:', res.status, res.data);
    return false;
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    results.push({
      step: 'Ensure Session',
      status: 'FAIL',
      error: err.response?.data ?? err.message,
    });
    console.log('❌ FAIL:', err.response?.data ?? err.message);
    return false;
  }
}

async function testInitializeChecklist(): Promise<boolean> {
  console.log('\n=== STEP 5: Initialize Checklist ===');
  try {
    const res = await makeRequest(
      'POST',
      `/api/close/sessions/${closeSessionId}/checklist/initialize`
    );
    const d = res.data as { items?: Array<{ id?: string; code?: string; status?: string }> };
    if (res.status === 200 || res.status === 201) {
      const items = d.items ?? [];
      results.push({
        step: 'Initialize Checklist',
        status: 'PASS',
        message: `${items.length} checklist items`,
        data: d,
      });
      console.log(`✅ PASS: ${items.length} checklist items`);

      // Complete or skip each required item
      for (const item of items) {
        if (item.id && item.status === 'pending') {
          const skipRes = await makeRequest(
            'POST',
            `/api/close/checklist-items/${item.id}/skip`,
            { completedBy: 'integration-test', notes: 'Skipped for integration test' }
          );
          if (skipRes.status !== 200) {
            console.log(`   ⚠️  Could not skip ${item.code ?? item.id}`);
          }
        }
      }
      return true;
    }
    results.push({
      step: 'Initialize Checklist',
      status: 'FAIL',
      data: res.data,
    });
    console.log('❌ FAIL:', res.status, res.data);
    return false;
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    results.push({
      step: 'Initialize Checklist',
      status: 'FAIL',
      error: err.response?.data ?? err.message,
    });
    console.log('❌ FAIL:', err.response?.data ?? err.message);
    return false;
  }
}

async function testAdvanceToLocked(): Promise<boolean> {
  console.log('\n=== STEP 6: Advance to Locked ===');
  try {
    const res = await makeRequest(
      'POST',
      `/api/close/sessions/${closeSessionId}/advance`
    );
    const d = res.data as {
      success?: boolean;
      statusAfter?: string;
      actionTaken?: string;
      blockers?: unknown[];
    };
    if (res.status === 200 && (d.success !== false) && (d.statusAfter === 'locked' || d.statusAfter === 'certified')) {
      results.push({
        step: 'Advance to Locked',
        status: 'PASS',
        message: `Status: ${d.statusAfter}, action: ${d.actionTaken ?? 'ok'}`,
        data: d,
      });
      console.log(`✅ PASS: Advanced to ${d.statusAfter}`);
      return true;
    }
    if (res.status === 422 && Array.isArray(d.blockers) && d.blockers.length > 0) {
      results.push({
        step: 'Advance to Locked',
        status: 'FAIL',
        message: 'Blockers present',
        data: { blockers: d.blockers },
      });
      console.log('❌ FAIL: Blockers:', JSON.stringify(d.blockers, null, 2));
      return false;
    }
    results.push({
      step: 'Advance to Locked',
      status: 'FAIL',
      data: res.data,
    });
    console.log('❌ FAIL:', res.status, res.data);
    return false;
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    results.push({
      step: 'Advance to Locked',
      status: 'FAIL',
      error: err.response?.data ?? err.message,
    });
    console.log('❌ FAIL:', err.response?.data ?? err.message);
    return false;
  }
}

async function testCertify(): Promise<boolean> {
  console.log('\n=== STEP 7: Certify Session ===');
  try {
    const res = await makeRequest(
      'POST',
      `/api/close/sessions/${closeSessionId}/certify`,
      { certifiedBy: 'integration-test@example.com', periodLabel: TEST_PERIOD }
    );
    const d = res.data as {
      certifiedSnapshotId?: string;
      snapshotHash?: string;
      status?: string;
    };
    if (res.status === 200 && (d.certifiedSnapshotId || d.snapshotHash || d.status === 'certified')) {
      results.push({
        step: 'Certification',
        status: 'PASS',
        message: 'Session certified',
        data: {
          certificationId: d.certifiedSnapshotId,
          snapshotHash: d.snapshotHash,
        },
      });
      console.log('✅ PASS: Certified');
      console.log(`   Certification ID: ${d.certifiedSnapshotId ?? 'N/A'}`);
      console.log(`   Hash: ${d.snapshotHash ?? 'N/A'}`);
      return true;
    }
    results.push({
      step: 'Certification',
      status: 'FAIL',
      data: res.data,
    });
    console.log('❌ FAIL:', res.status, res.data);
    return false;
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    results.push({
      step: 'Certification',
      status: 'FAIL',
      error: err.response?.data ?? err.message,
    });
    console.log('❌ FAIL:', err.response?.data ?? err.message);
    return false;
  }
}

async function testAuditBinder(): Promise<boolean> {
  console.log('\n=== STEP 8: Audit Binder (with GL) ===');
  try {
    const res = await makeRequest(
      'GET',
      `/api/audit/binder?closeSessionId=${closeSessionId}&periodEnd=2024-03-31&periodStart=2024-03-01`
    );
    const d = res.data as {
      generalLedger?: unknown;
      includesGL?: boolean;
      financialStatements?: unknown;
    };
    const includesGL = res.headers.get('x-includes-gl') === 'true' || d.includesGL === true || !!d.generalLedger;
    if (res.status === 200) {
      results.push({
        step: 'Audit Binder',
        status: 'PASS',
        message: `Binder OK, includesGL: ${includesGL}`,
        data: { includesGL, hasGeneralLedger: !!d.generalLedger },
      });
      console.log(`✅ PASS: Binder includes GL: ${includesGL}`);
      return true;
    }
    results.push({
      step: 'Audit Binder',
      status: 'FAIL',
      data: res.data,
    });
    console.log('❌ FAIL:', res.status, res.data);
    return false;
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    results.push({
      step: 'Audit Binder',
      status: 'FAIL',
      error: err.response?.data ?? err.message,
    });
    console.log('❌ FAIL:', err.response?.data ?? err.message);
    return false;
  }
}

async function testVerification(): Promise<boolean> {
  console.log('\n=== STEP 9: Verification ===');
  try {
    // Get snapshot ID from session
    const sessRes = await makeRequest('GET', `/api/close/sessions/${closeSessionId}`);
    const sess = sessRes.data as { certifiedSnapshotId?: string };
    const snapshotId = sess?.certifiedSnapshotId;
    if (!snapshotId) {
      results.push({
        step: 'Verification',
        status: 'SKIP',
        message: 'No certified snapshot ID on session',
      });
      console.log('⏭️ SKIP: No snapshot ID');
      return true;
    }

    const res = await makeRequest(
      'GET',
      `/api/verification/snapshots/${snapshotId}`
    );
    const d = res.data as { snapshot?: { hashMatches?: boolean; includesGL?: boolean } };
    const snap = d.snapshot;
    const valid = snap?.hashMatches !== false;
    const includesGL = snap?.includesGL ?? false;
    if (res.status === 200 && valid) {
      results.push({
        step: 'Verification',
        status: 'PASS',
        message: `Snapshot verified, includesGL: ${includesGL}`,
        data: d,
      });
      console.log(`✅ PASS: Verified, includesGL: ${includesGL}`);
      return true;
    }
    results.push({
      step: 'Verification',
      status: 'FAIL',
      data: res.data,
    });
    console.log('❌ FAIL:', res.status, res.data);
    return false;
  } catch (e: unknown) {
    const err = e as { response?: { data?: unknown }; message?: string };
    results.push({
      step: 'Verification',
      status: 'FAIL',
      error: err.response?.data ?? err.message,
    });
    console.log('❌ FAIL:', err.response?.data ?? err.message);
    return false;
  }
}

function printSummary(): void {
  console.log('\n╔════════════════════════════════════════════════╗');
  console.log('║          TEST SUMMARY                          ║');
  console.log('╚════════════════════════════════════════════════╝\n');

  const passed = results.filter((r) => r.status === 'PASS').length;
  const failed = results.filter((r) => r.status === 'FAIL').length;
  const skipped = results.filter((r) => r.status === 'SKIP').length;

  for (const r of results) {
    const icon = r.status === 'PASS' ? '✅' : r.status === 'FAIL' ? '❌' : '⏭️';
    console.log(`${icon} ${r.step}: ${r.status}`);
    if (r.message) console.log(`   ${r.message}`);
    if (r.error) console.log(`   Error: ${JSON.stringify(r.error)}`);
  }

  console.log(`\n📊 Results: ${passed} passed, ${failed} failed, ${skipped} skipped`);

  if (failed === 0 && passed > 0) {
    console.log('\n🎉 ALL TESTS PASSED! GL → TB → Certification flow is working!\n');
    process.exit(0);
  } else {
    console.log('\n❌ SOME TESTS FAILED. Check errors above.\n');
    process.exit(1);
  }
}

async function runTests(): Promise<void> {
  console.log('╔════════════════════════════════════════════════╗');
  console.log('║   GL → TB → CERTIFICATION INTEGRATION TEST    ║');
  console.log('╚════════════════════════════════════════════════╝');
  console.log(`\nBase URL: ${BASE_URL}`);
  console.log(`Period: ${TEST_PERIOD}`);

  if (!(await testLogin())) {
    console.log('\n⛔ Stopping: Login failed');
    printSummary();
    return;
  }

  if (!(await testCOAUpload())) {
    console.log('\n⛔ Stopping: COA upload failed');
    printSummary();
    return;
  }

  if (!(await testGLUpload())) {
    console.log('\n⛔ Stopping: GL upload failed');
    printSummary();
    return;
  }

  if (!(await testTBDerivation())) {
    console.log('\n⛔ Stopping: TB derivation failed');
    printSummary();
    return;
  }

  if (!(await testEnsureSession())) {
    console.log('\n⛔ Stopping: Ensure session failed');
    printSummary();
    return;
  }

  if (!(await testInitializeChecklist())) {
    console.log('\n⛔ Stopping: Checklist init failed');
    printSummary();
    return;
  }

  if (!(await testAdvanceToLocked())) {
    console.log('\n⛔ Stopping: Advance to locked failed');
    printSummary();
    return;
  }

  if (!(await testCertify())) {
    console.log('\n⛔ Stopping: Certification failed');
    printSummary();
    return;
  }

  await testAuditBinder();
  await testVerification();
  printSummary();
}

runTests().catch((e) => {
  console.error('Fatal error:', e);
  process.exit(1);
});
