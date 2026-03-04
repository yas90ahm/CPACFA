/**
 * E2E Test Helpers — HTTP wrappers and workflow orchestrators.
 * Talks to a live server via HTTP (no imports from src/).
 */

import http from 'http';
import https from 'https';
import fs from 'fs';
import path from 'path';

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

export const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';
const VERBOSE = process.env.E2E_VERBOSE === '1';
const MAX_429_RETRIES = 3;
const RETRY_BACKOFF_MS = 2000; // 2s, 4s, 8s

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Record<string, string | string[] | undefined>;
  ok: boolean;
  elapsed: number;
}

export interface TestUser {
  token: string;
  userId: string;
  tenantId: string;
  email: string;
  role: string;
  name: string | null;
}

export interface TestSession {
  id: string;
  entityId: string;
  status: string;
  periodStart: string;
  periodEnd: string;
  periodLabel?: string;
}

// ---------------------------------------------------------------------------
// Core HTTP helper
// ---------------------------------------------------------------------------

async function apiFetchOnce<T = any>(
  method: string,
  url: URL,
  bodyStr: string | undefined,
  headers: Record<string, string>,
  urlPath: string,
): Promise<ApiResponse<T>> {
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const req = lib.request(url, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () => {
        const elapsed = Date.now() - start;
        const raw = Buffer.concat(chunks).toString('utf8');
        let parsed: any;
        try { parsed = JSON.parse(raw); } catch { parsed = raw; }
        const status = res.statusCode ?? 0;
        if (VERBOSE) {
          console.log(`  ${method} ${urlPath} → ${status} (${elapsed}ms)`);
        }
        resolve({
          status,
          body: parsed as T,
          headers: res.headers as Record<string, string | string[] | undefined>,
          ok: status >= 200 && status < 300,
          elapsed,
        });
      });
    });
    req.on('error', reject);
    if (bodyStr) req.write(bodyStr);
    req.end();
  });
}

export async function apiFetch<T = any>(
  method: string,
  urlPath: string,
  body?: any,
  token?: string,
  extraHeaders?: Record<string, string>,
): Promise<ApiResponse<T>> {
  const url = new URL(urlPath, BASE_URL);
  const headers: Record<string, string> = {
    'Accept': 'application/json',
    ...extraHeaders,
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  let bodyStr: string | undefined;
  if (body !== undefined && body !== null) {
    if (typeof body === 'string') {
      bodyStr = body;
      if (!headers['Content-Type']) headers['Content-Type'] = 'text/plain';
    } else {
      bodyStr = JSON.stringify(body);
      headers['Content-Type'] = 'application/json';
    }
  }

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await apiFetchOnce<T>(method, url, bodyStr, headers, urlPath);
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      const wait = RETRY_BACKOFF_MS * Math.pow(2, attempt);
      if (VERBOSE) console.log(`  ⏳ 429 on ${method} ${urlPath}, retry in ${wait}ms...`);
      await sleep(wait);
      continue;
    }
    return res;
  }
  // unreachable, but TypeScript needs it
  return apiFetchOnce<T>(method, url, bodyStr, headers, urlPath);
}

/**
 * Detect MIME type from file extension.
 */
function mimeFromExt(filePath: string): string {
  const ext = path.extname(filePath).toLowerCase();
  switch (ext) {
    case '.csv': return 'text/csv';
    case '.xlsx': return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    case '.xls': return 'application/vnd.ms-excel';
    case '.pdf': return 'application/pdf';
    case '.json': return 'application/json';
    case '.txt': return 'text/plain';
    default: return 'application/octet-stream';
  }
}

/**
 * Multipart form upload.
 */
export async function apiUpload<T = any>(
  urlPath: string,
  fields: Record<string, string>,
  fileField: string,
  filePath: string,
  token?: string,
): Promise<ApiResponse<T>> {
  const url = new URL(urlPath, BASE_URL);
  const boundary = `----e2ebound${Date.now()}`;
  const isHttps = url.protocol === 'https:';
  const lib = isHttps ? https : http;

  const parts: Buffer[] = [];
  for (const [k, v] of Object.entries(fields)) {
    parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${k}"\r\n\r\n${v}\r\n`));
  }
  const fileContent = fs.readFileSync(filePath);
  const fileName = path.basename(filePath);
  const fileMime = mimeFromExt(filePath);
  parts.push(Buffer.from(
    `--${boundary}\r\nContent-Disposition: form-data; name="${fileField}"; filename="${fileName}"\r\nContent-Type: ${fileMime}\r\n\r\n`
  ));
  parts.push(fileContent);
  parts.push(Buffer.from(`\r\n--${boundary}--\r\n`));
  const bodyBuf = Buffer.concat(parts);

  const headers: Record<string, string> = {
    'Content-Type': `multipart/form-data; boundary=${boundary}`,
    'Content-Length': String(bodyBuf.length),
    'Accept': 'application/json',
  };
  if (token) headers['Authorization'] = `Bearer ${token}`;

  async function doUpload(): Promise<ApiResponse<T>> {
    const start = Date.now();
    return new Promise((resolve, reject) => {
      const req = lib.request(url, { method: 'POST', headers }, (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (c: Buffer) => chunks.push(c));
        res.on('end', () => {
          const elapsed = Date.now() - start;
          const raw = Buffer.concat(chunks).toString('utf8');
          let parsed: any;
          try { parsed = JSON.parse(raw); } catch { parsed = raw; }
          resolve({
            status: res.statusCode ?? 0,
            body: parsed as T,
            headers: res.headers as Record<string, string | string[] | undefined>,
            ok: (res.statusCode ?? 0) >= 200 && (res.statusCode ?? 0) < 300,
            elapsed,
          });
        });
      });
      req.on('error', reject);
      req.write(bodyBuf);
      req.end();
    });
  }

  for (let attempt = 0; attempt <= MAX_429_RETRIES; attempt++) {
    const res = await doUpload();
    if (res.status === 429 && attempt < MAX_429_RETRIES) {
      const wait = RETRY_BACKOFF_MS * Math.pow(2, attempt);
      if (VERBOSE) console.log(`  ⏳ 429 on upload ${urlPath}, retry in ${wait}ms...`);
      await sleep(wait);
      continue;
    }
    return res;
  }
  return doUpload();
}

// ---------------------------------------------------------------------------
// Auth helpers
// ---------------------------------------------------------------------------

let _userCounter = 0;
function uniqueEmail(prefix: string): string {
  _userCounter++;
  return `${prefix}-${Date.now()}-${_userCounter}@e2etest.com`;
}

export async function registerUser(
  overrides: { email?: string; password?: string; name?: string; role?: string; tenantId?: string; tenantName?: string } = {}
): Promise<TestUser> {
  const email = overrides.email ?? uniqueEmail('user');
  const password = overrides.password ?? 'Test@Pass1234';
  const body: Record<string, any> = {
    email,
    password,
    name: overrides.name ?? 'E2E User',
    role: overrides.role ?? 'preparer',
  };
  if (overrides.tenantId) body.tenantId = overrides.tenantId;
  if (overrides.tenantName) body.tenantName = overrides.tenantName;

  const res = await apiFetch<any>('POST', '/api/auth/register', body);
  if (!res.ok) throw new Error(`Register failed (${res.status}): ${JSON.stringify(res.body)}`);
  return {
    token: res.body.token,
    userId: res.body.userId,
    tenantId: res.body.tenantId,
    email: res.body.email,
    role: res.body.role,
    name: res.body.name,
  };
}

export async function loginUser(email: string, password: string, tenantId?: string): Promise<TestUser> {
  const body: Record<string, any> = { email, password };
  if (tenantId) body.tenantId = tenantId;
  const res = await apiFetch<any>('POST', '/api/auth/login', body);
  if (!res.ok) throw new Error(`Login failed (${res.status}): ${JSON.stringify(res.body)}`);
  return {
    token: res.body.token,
    userId: res.body.userId,
    tenantId: res.body.tenantId,
    email: res.body.email,
    role: res.body.role,
    name: res.body.name,
  };
}

export async function registerAndLogin(
  email?: string, password?: string, name?: string, role?: string
): Promise<TestUser> {
  const e = email ?? uniqueEmail('user');
  const p = password ?? 'Test@Pass1234';
  const u = await registerUser({ email: e, password: p, name: name ?? 'E2E User', role });
  return u; // register returns token already
}

// ---------------------------------------------------------------------------
// Entity helpers
// ---------------------------------------------------------------------------

export async function createEntity(token: string, name: string): Promise<string> {
  // Entities are created implicitly via settings or sessions.
  // Upsert entity settings to ensure entity exists.
  const res = await apiFetch('PUT', `/api/settings/general?entityId=${encodeURIComponent(name)}`, {
    entityName: name,
  }, token);
  return name;
}

// ---------------------------------------------------------------------------
// Session helpers
// ---------------------------------------------------------------------------

export async function createSession(
  token: string,
  entityId: string,
  periodStart: string,
  periodEnd: string,
  periodLabel?: string
): Promise<TestSession> {
  const body: Record<string, any> = { entityId, periodStart, periodEnd };
  if (periodLabel) body.description = periodLabel;
  const res = await apiFetch<any>('POST', '/api/close/sessions', body, token);
  if (!res.ok) throw new Error(`Create session failed (${res.status}): ${JSON.stringify(res.body)}`);
  return {
    id: res.body.id,
    entityId: res.body.entityId,
    status: res.body.status,
    periodStart: res.body.periodStart,
    periodEnd: res.body.periodEnd,
    periodLabel: res.body.periodLabel ?? periodLabel,
  };
}

export async function getSession(token: string, sessionId: string): Promise<any> {
  const res = await apiFetch('GET', `/api/close/sessions/${sessionId}`, undefined, token);
  if (!res.ok) throw new Error(`Get session failed (${res.status}): ${JSON.stringify(res.body)}`);
  return res.body;
}

// ---------------------------------------------------------------------------
// GL upload helpers
// ---------------------------------------------------------------------------

export async function uploadGL(
  token: string,
  sessionId: string,
  csvContent: string,
): Promise<any> {
  // Write CSV to temp file
  const tmpDir = path.join(__dirname, 'fixtures', '.tmp');
  if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
  const tmpFile = path.join(tmpDir, `gl_${Date.now()}.csv`);
  fs.writeFileSync(tmpFile, csvContent, 'utf8');
  try {
    // Get session to find periodLabel — always use YYYY-MM from periodEnd to match GET /trial-balance
    const session = await getSession(token, sessionId);
    const periodLabel = (session.periodEnd ?? session.periodStart ?? '').slice(0, 7);

    // Upload via trial-balance/ingest
    const fields: Record<string, string> = {
      periodLabel,
      sessionId,
      standard: 'US_GAAP',
      fullSet: 'true',
      currency: 'USD',
    };
    if (session.entityId) fields.entityId = session.entityId;

    const res = await apiUpload(
      '/api/trial-balance/ingest',
      fields,
      'file',
      tmpFile,
      token,
    );

    // Advance session if still OPEN (frontend does this after upload)
    const currentSession = await apiFetch('GET', `/api/close/sessions/${sessionId}`, undefined, token);
    const st = (currentSession.body?.status ?? currentSession.body?.state ?? '').toLowerCase();
    if (st === 'open') {
      const advRes = await apiFetch('POST', `/api/close/sessions/${sessionId}/advance`, {}, token);
      if (!advRes.ok && advRes.status !== 422) {
        throw new Error(`Advance after upload failed (${advRes.status}): ${JSON.stringify(advRes.body).slice(0, 300)}`);
      }
    }

    return { ...res.body, _status: res.status, _ok: res.ok };
  } finally {
    try { fs.unlinkSync(tmpFile); } catch {}
  }
}

// ---------------------------------------------------------------------------
// Mapping helpers
// ---------------------------------------------------------------------------

export async function getTaxonomy(token: string): Promise<any[]> {
  const res = await apiFetch('GET', '/api/coa-mapping/taxonomy', undefined, token);
  if (!res.ok) throw new Error(`Get taxonomy failed: ${JSON.stringify(res.body)}`);
  return res.body.lines ?? res.body;
}

export async function mapAllAccounts(
  token: string,
  sessionId: string,
  entityId?: string
): Promise<void> {
  // Get TB accounts
  const tbRes = await apiFetch('GET', `/api/close/sessions/${sessionId}/trial-balance`, undefined, token);
  const accounts = tbRes.body?.accounts ?? tbRes.body?.entries ?? tbRes.body?.rows ?? [];

  // Get taxonomy
  const taxonomy = await getTaxonomy(token);

  // Simple mapping: map each account to a taxonomy line based on keywords
  const mappings: Array<{ accountCode: string; fsLineId: string }> = [];
  for (const acct of accounts) {
    const code = acct.accountCode ?? acct.account_code ?? acct.accountNumber ?? '';
    const name = (acct.accountName ?? acct.account_name ?? acct.name ?? '').toLowerCase();
    let fsLineId = taxonomy[0]?.fsLineId ?? taxonomy[0]?.id; // fallback

    // Try to match by name
    for (const line of taxonomy) {
      const lineName = (line.fsLineName ?? line.name ?? '').toLowerCase();
      if (name.includes('cash') && lineName.includes('cash')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('revenue') && lineName.includes('revenue')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('cogs') && (lineName.includes('cost') || lineName.includes('cogs'))) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('receivable') && lineName.includes('receivable')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('payable') && lineName.includes('payable')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('equity') && lineName.includes('equity')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('expense') && lineName.includes('expense')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('salary') && (lineName.includes('salary') || lineName.includes('expense'))) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('rent') && (lineName.includes('rent') || lineName.includes('expense'))) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('inventory') && lineName.includes('inventor')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('depreciation') && lineName.includes('depreci')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('interest') && lineName.includes('interest')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('tax') && lineName.includes('tax')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('retained') && lineName.includes('retain')) { fsLineId = line.fsLineId ?? line.id; break; }
      if (name.includes('prepaid') && lineName.includes('prepaid')) { fsLineId = line.fsLineId ?? line.id; break; }
    }
    if (code && fsLineId) {
      mappings.push({ accountCode: code, fsLineId });
    }
  }

  if (mappings.length > 0) {
    const eid = entityId ?? (await getSession(token, sessionId)).entityId;
    const mapRes = await apiFetch('POST', '/api/coa-mapping/map', {
      entityId: eid,
      mappings,
    }, token);
    if (!mapRes.ok) {
      // Retry one-by-one if bulk fails
      for (const m of mappings) {
        await apiFetch('POST', '/api/coa-mapping/rules', {
          entityId: eid,
          sourceAccountNamePattern: '%',
          sourceAccountNumberPattern: m.accountCode,
          mappedFsLineId: m.fsLineId,
          confidenceDefault: 1,
          effectiveFrom: '2000-01-01',
        }, token);
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Reconciliation helpers
// ---------------------------------------------------------------------------

export async function initializeReconciliations(
  token: string,
  sessionId: string,
): Promise<any[]> {
  const res = await apiFetch('POST', `/api/close/sessions/${sessionId}/reconciliations/initialize`, {}, token);
  return res.body?.reconciliations ?? [];
}

export async function reconcileAccount(
  token: string,
  sessionId: string,
  reconId: string,
  supportingBalance: string,
  reviewerToken?: string,
): Promise<void> {
  // Set supporting balance
  const sbRes = await apiFetch('POST',
    `/api/close/sessions/${sessionId}/reconciliations/${reconId}/supporting-balance`,
    { amount: supportingBalance },
    token,
  );
  if (!sbRes.ok) throw new Error(`supporting-balance failed (${sbRes.status}): ${JSON.stringify(sbRes.body).slice(0,200)}`);

  // Upload evidence
  const evidencePath = path.join(__dirname, 'fixtures', 'sample_evidence.pdf');
  if (fs.existsSync(evidencePath)) {
    await apiUpload(
      `/api/close/sessions/${sessionId}/reconciliations/${reconId}/evidence`,
      { description: 'E2E test evidence' },
      'file',
      evidencePath,
      token,
    );
  }

  // Complete
  const cmpRes = await apiFetch('POST',
    `/api/close/sessions/${sessionId}/reconciliations/${reconId}/complete`,
    { variance_explanation: 'Reconciled via E2E test — amounts verified against source documents.' },
    token,
  );
  if (!cmpRes.ok) throw new Error(`complete failed (${cmpRes.status}): ${JSON.stringify(cmpRes.body).slice(0,200)}`);

  // Approve with different user
  if (reviewerToken) {
    const apRes = await apiFetch('POST',
      `/api/close/sessions/${sessionId}/reconciliations/${reconId}/approve`,
      {},
      reviewerToken,
    );
    if (!apRes.ok) throw new Error(`approve failed (${apRes.status}): ${JSON.stringify(apRes.body).slice(0,200)}`);
  }
}

// ---------------------------------------------------------------------------
// Journal Entry helpers
// ---------------------------------------------------------------------------

export async function createAndPostJE(
  token: string,
  sessionId: string,
  lines: Array<{ accountRef: string; debit?: string | number; credit?: string | number; description?: string }>,
  memo: string,
  approverToken: string,
): Promise<any> {
  // Add amountProvenance to every line with non-zero amounts (required by server)
  const enrichedLines = lines.map(l => ({
    ...l,
    debit: typeof l.debit === 'string' ? parseFloat(l.debit) : (l.debit ?? 0),
    credit: typeof l.credit === 'string' ? parseFloat(l.credit) : (l.credit ?? 0),
    amountProvenance: { kind: 'human_entered' as const, enteredBy: 'e2e-test' },
  }));

  // Create draft
  const draftRes = await apiFetch('POST', '/api/close/journal-entries', {
    closeSessionId: sessionId,
    memo,
    source: 'manual',
    lines: enrichedLines,
  }, token);
  if (!draftRes.ok) throw new Error(`Create JE failed: ${JSON.stringify(draftRes.body)}`);
  const jeId = draftRes.body.id;

  // Propose
  await apiFetch('POST', `/api/close/journal-entries/${jeId}/propose`, {}, token);

  // Approve with different user
  await apiFetch('POST', `/api/close/journal-entries/${jeId}/approve`, {}, approverToken);

  // Post
  const postRes = await apiFetch('POST', `/api/close/journal-entries/${jeId}/post`, {}, token);
  return postRes.body;
}

// ---------------------------------------------------------------------------
// Statement helpers
// ---------------------------------------------------------------------------

export async function generateStatements(token: string, sessionId: string): Promise<any> {
  const res = await apiFetch('POST', `/api/close/sessions/${sessionId}/statement-packages/generate`, {}, token);
  if (!res.ok) throw new Error(`Generate statements failed: ${JSON.stringify(res.body)}`);
  return res.body;
}

// ---------------------------------------------------------------------------
// Variance helpers
// ---------------------------------------------------------------------------

export async function explainAllVariances(token: string, sessionId: string): Promise<number> {
  const res = await apiFetch<any>('GET', `/api/close/sessions/${sessionId}/variances`, undefined, token);
  const variances = res.body?.variances ?? res.body ?? [];
  let explained = 0;
  for (const v of variances) {
    // Compute materiality the same way the gate does:
    // - If priorAmount is 0, material if |changeAmount| > 0.01
    // - Otherwise, material if |changePercentage| >= materialThresholdPct
    const priorAmt = parseFloat(v.priorAmount ?? v.prior_amount ?? '0');
    const changeAmt = parseFloat(v.changeAmount ?? v.change_amount ?? '0');
    const changePct = parseFloat(v.changePercentage ?? v.change_percentage ?? '0');
    const threshold = parseFloat(v.materialThresholdPct ?? v.material_threshold_pct ?? '5');
    const isMaterial = priorAmt === 0
      ? Math.abs(changeAmt) > 0.01
      : Math.abs(changePct) >= threshold;
    const hasExplanation = v.explanation && String(v.explanation).trim().length > 0;
    if (isMaterial && !hasExplanation) {
      await apiFetch('POST', `/api/close/variances/${v.id}/explain`, {
        explanation: `E2E automated explanation: variance of ${changeAmt.toFixed(2)} (${changePct.toFixed(1)}%) due to normal business operations in the period.`,
        explanation_source: 'manual',
      }, token);
      explained++;
    }
  }
  return explained;
}

// ---------------------------------------------------------------------------
// Readiness helpers
// ---------------------------------------------------------------------------

export async function getReadiness(token: string, sessionId: string): Promise<any> {
  const res = await apiFetch('GET', `/api/close/sessions/${sessionId}/readiness?format=gates`, undefined, token);
  return res.body;
}

// ---------------------------------------------------------------------------
// Full-workflow helpers
// ---------------------------------------------------------------------------

export async function fullCloseToReview(
  preparer: TestUser,
  reviewer: TestUser,
  sessionId: string,
  glCsv: string,
): Promise<void> {
  // 1. Upload GL
  await uploadGL(preparer.token, sessionId, glCsv);

  // 2. Map all accounts
  await mapAllAccounts(preparer.token, sessionId);

  // 3. Init reconciliations
  const recons = await initializeReconciliations(preparer.token, sessionId);

  // 4. Get adjusted TB for reconciliation (must match glBalance which uses adjusted TB)
  const tbRes = await apiFetch('GET', `/api/close/sessions/${sessionId}/trial-balance?type=adjusted`, undefined, preparer.token);
  const accounts = tbRes.body?.accounts ?? tbRes.body?.entries ?? tbRes.body?.rows ?? [];

  // 5. Reconcile each account — re-fetch each recon to get latest glBalance + reconcilingItemsTotal
  //    unexplained_variance = (gl - supporting) + items, so supporting = gl + items for zero variance
  const reconListRes = await apiFetch('GET', `/api/close/sessions/${sessionId}/reconciliations`, undefined, preparer.token);
  const latestRecons = reconListRes.body?.reconciliations ?? recons;
  for (const recon of latestRecons) {
    const rid = recon.id ?? recon.recon_id ?? recon.reconId;
    const code = recon.accountCode ?? recon.account_code;
    const glBal = Number(recon.glBalance ?? recon.gl_balance ?? 0);
    const itemsTotal = Number(recon.reconcilingItemsTotal ?? recon.reconciling_items_total ?? 0);
    // supporting = gl + items => unexplained = (gl - (gl+items)) + items = 0
    const balance = String(glBal + itemsTotal);
    await reconcileAccount(preparer.token, sessionId, rid, balance, reviewer.token);
  }

  // 6. Propose/resolve templates
  const tmplRes = await apiFetch('POST', '/api/close/templates/propose', { closeSessionId: sessionId }, preparer.token);
  const proposals = tmplRes.body?.proposed ?? tmplRes.body?.proposedApplications ?? tmplRes.body?.applications ?? [];
  for (const app of proposals) {
    if (app.status === 'proposed') {
      const skipRes = await apiFetch('POST', '/api/close/templates/skip', {
        applicationId: app.applicationId ?? app.id,
        closeSessionId: sessionId,
        reason: 'Skipped for E2E test',
      }, preparer.token);
      if (!skipRes.ok) {
        console.log(`  [tmpl-diag] Skip failed for app ${app.id}: ${skipRes.status} ${JSON.stringify(skipRes.body).slice(0, 200)}`);
      }
    }
  }
  // Double-check: re-propose to catch any that weren't returned the first time
  const tmplRes2 = await apiFetch('POST', '/api/close/templates/propose', { closeSessionId: sessionId }, preparer.token);
  const proposals2 = tmplRes2.body?.proposed ?? [];
  for (const app of proposals2) {
    if (app.status === 'proposed') {
      await apiFetch('POST', '/api/close/templates/skip', {
        applicationId: app.applicationId ?? app.id,
        closeSessionId: sessionId,
        reason: 'Skipped for E2E test (retry)',
      }, preparer.token);
    }
  }

  // 7. Generate statements
  await generateStatements(preparer.token, sessionId);

  // 8. Explain variances
  await explainAllVariances(preparer.token, sessionId);

  // 9. Initialize close checklist and complete all items
  const checklistInitRes = await apiFetch('POST', `/api/close/sessions/${sessionId}/checklist/initialize`, {}, preparer.token);
  if (checklistInitRes.ok || checklistInitRes.status === 200 || checklistInitRes.status === 201) {
    const checklistRes = await apiFetch('GET', `/api/close/sessions/${sessionId}/checklist`, undefined, preparer.token);
    const checkItems = checklistRes.body?.items ?? [];
    for (const item of checkItems) {
      if (item.status === 'pending' || item.status === 'in_progress') {
        await apiFetch('POST', `/api/close/checklist-items/${item.id}/complete`, {
          completedBy: preparer.userId ?? preparer.email ?? 'e2e-preparer',
          notes: 'Completed by E2E test pipeline',
        }, preparer.token);
      }
    }
  }

  // 10. Resolve and verify any open blocking issues
  const issueListRes = await apiFetch('GET', `/api/close/issues?closeSessionId=${sessionId}`, undefined, preparer.token);
  const openIssues = issueListRes.body?.issues ?? [];
  for (const issue of openIssues) {
    const iid = issue.id ?? issue.issueId;
    const st = (issue.status ?? '').toLowerCase();
    if (!iid || st === 'verified' || st === 'waived') continue;
    // Resolve first (if not already resolved)
    if (st !== 'resolved') {
      await apiFetch('POST', `/api/close/issues/${iid}/resolve`, {
        resolutionType: 'acknowledged_with_justification',
        resolutionDescription: 'Auto-resolved by E2E test pipeline',
      }, preparer.token);
    }
    // Then verify to make it terminal
    await apiFetch('POST', `/api/close/issues/${iid}/verify`, {
      method: 'manual_review',
    }, preparer.token);
  }

  // 11. Advance to UNDER_REVIEW (with retry + auto-fix, up to 3 rounds)
  let advRes1 = await apiFetch('POST', `/api/close/sessions/${sessionId}/advance`, {}, preparer.token);
  for (let attempt = 0; attempt < 3 && !advRes1.ok; attempt++) {
    // Diagnose failing gates and attempt to fix them
    const readinessRes = await apiFetch('GET', `/api/close/sessions/${sessionId}/readiness?format=gates`, undefined, preparer.token);
    const gates = readinessRes.body?.gates ?? [];
    const failing = gates.filter((g: any) => g.status === 'fail' || g.passing === false);

    for (const gate of failing) {
      const gn = (gate.name ?? gate.gate ?? '').toLowerCase();
      if (gn.includes('recon') || gn.includes('reconcil')) {
        // Re-reconcile any incomplete recons — use GL balance as supporting to zero out variance
        const reconList = await apiFetch('GET', `/api/close/sessions/${sessionId}/reconciliations`, undefined, preparer.token);
        const reconArr = reconList.body?.reconciliations ?? [];
        console.log(`  [recon-fix] Found ${reconArr.length} recons, statuses: ${reconArr.map((r: any) => `${r.accountCode ?? r.account_code ?? '?'}=${r.status}(gl=${r.glBalance ?? r.gl_balance ?? 'null'})`).join(', ')}`);
        for (const r of reconArr) {
          const s = (r.status ?? '').toLowerCase();
          if (s === 'approved') continue;
          const rid = r.id ?? r.recon_id ?? r.reconId;
          if (!rid) continue;
          // supporting = gl + reconcilingItemsTotal => unexplained_variance = (gl - supporting) + items = 0
          const glVal = Number(r.glBalance ?? r.gl_balance ?? r.balance ?? 0);
          const itemsVal = Number(r.reconcilingItemsTotal ?? r.reconciling_items_total ?? 0);
          const bal = String(glVal + itemsVal);
          console.log(`  [recon-fix] Reconciling ${r.accountCode ?? r.account_code ?? rid}: status=${s}, gl=${glVal}, items=${itemsVal}, supporting=${bal}`);
          try {
            await reconcileAccount(preparer.token, sessionId, rid, bal, reviewer.token);
            console.log(`  [recon-fix] ✓ ${r.accountCode ?? rid} reconciled OK`);
          } catch (e: any) {
            console.log(`  [recon-fix] ✗ ${r.accountCode ?? rid} reconcileAccount failed: ${e.message?.slice(0, 200)}`);
            // If reconcile fails, try step-by-step with better error reporting
            try {
              const sbRes = await apiFetch('POST', `/api/close/sessions/${sessionId}/reconciliations/${rid}/supporting-balance`,
                { amount: bal }, preparer.token);
              console.log(`  [recon-fix]   supporting-balance: ${sbRes.status}`);
              const cmpRes = await apiFetch('POST', `/api/close/sessions/${sessionId}/reconciliations/${rid}/complete`,
                { variance_explanation: 'Auto-reconciled by E2E test pipeline — amounts verified.' }, preparer.token);
              console.log(`  [recon-fix]   complete: ${cmpRes.status} ${JSON.stringify(cmpRes.body).slice(0,150)}`);
              const apRes = await apiFetch('POST', `/api/close/sessions/${sessionId}/reconciliations/${rid}/approve`,
                {}, reviewer.token);
              console.log(`  [recon-fix]   approve: ${apRes.status} ${JSON.stringify(apRes.body).slice(0,150)}`);
            } catch (e2: any) {
              console.log(`  [recon-fix]   fallback also failed: ${e2.message?.slice(0, 200)}`);
            }
          }
        }
      } else if (gn.includes('template') || gn.includes('aje') || gn.includes('recurring')) {
        // First, propose any new templates
        await apiFetch('POST', '/api/close/templates/propose', { closeSessionId: sessionId }, preparer.token);
        // Then use template-status to find ALL pending applications and skip them
        const statusRes = await apiFetch('GET', `/api/close/sessions/${sessionId}/template-status`, undefined, preparer.token);
        const apps = statusRes.body?.applications ?? [];
        for (const a of apps) {
          if (a.status === 'proposed') {
            const skipRes = await apiFetch('POST', '/api/close/templates/skip', {
              applicationId: a.applicationId ?? a.id, closeSessionId: sessionId, reason: 'Auto-skipped by E2E auto-fix',
            }, preparer.token);
            if (!skipRes.ok) {
              console.log(`  [tmpl-fix] Skip app ${a.id} failed: ${skipRes.status} ${JSON.stringify(skipRes.body).slice(0,150)}`);
            }
          }
        }
      } else if (gn.includes('statement') || gn.includes('stale')) {
        await generateStatements(preparer.token, sessionId);
        await explainAllVariances(preparer.token, sessionId);
      } else if (gn.includes('variance')) {
        await explainAllVariances(preparer.token, sessionId);
      } else if (gn.includes('mapping') || gn.includes('account')) {
        await mapAllAccounts(preparer.token, sessionId);
      } else if (gn.includes('issue') || gn.includes('hitl') || gn.includes('blocking')) {
        // Resolve AND verify ALL non-terminal issues
        const issRes = await apiFetch('GET', `/api/close/issues?closeSessionId=${sessionId}`, undefined, preparer.token);
        const issues = issRes.body?.issues ?? [];
        for (const issue of issues) {
          const iid = issue.id ?? issue.issueId;
          const st = (issue.status ?? '').toLowerCase();
          if (!iid || st === 'verified' || st === 'waived') continue;
          if (st !== 'resolved') {
            await apiFetch('POST', `/api/close/issues/${iid}/resolve`, {
              resolutionType: 'acknowledged_with_justification',
              resolutionDescription: 'Auto-resolved by E2E auto-fix',
            }, preparer.token);
          }
          await apiFetch('POST', `/api/close/issues/${iid}/verify`, {
            method: 'manual_review',
          }, preparer.token);
        }
      } else if (gn.includes('checklist')) {
        // Re-initialize and complete checklist
        await apiFetch('POST', `/api/close/sessions/${sessionId}/checklist/initialize`, {}, preparer.token);
        const clRes = await apiFetch('GET', `/api/close/sessions/${sessionId}/checklist`, undefined, preparer.token);
        const items = clRes.body?.items ?? [];
        for (const item of items) {
          if (item.status === 'pending' || item.status === 'in_progress') {
            await apiFetch('POST', `/api/close/checklist-items/${item.id}/complete`, {
              completedBy: preparer.userId ?? preparer.email ?? 'e2e-preparer',
              notes: 'Completed by E2E auto-fix',
            }, preparer.token);
          }
        }
      } else if (gn.includes('evidence')) {
        // Re-upload evidence to any recons missing it
        const reconList2 = await apiFetch('GET', `/api/close/sessions/${sessionId}/reconciliations`, undefined, preparer.token);
        const reconArr2 = reconList2.body?.reconciliations ?? [];
        for (const r of reconArr2) {
          const rid = r.id ?? r.recon_id ?? r.reconId;
          if (!rid) continue;
          const evidencePath = path.join(__dirname, 'fixtures', 'sample_evidence.pdf');
          if (fs.existsSync(evidencePath)) {
            await apiUpload(
              `/api/close/sessions/${sessionId}/reconciliations/${rid}/evidence`,
              { description: 'E2E evidence upload' },
              'file', evidencePath, preparer.token,
            );
          }
        }
      } else if (gn.includes('je') || gn.includes('journal')) {
        // Approve/reject any draft or proposed JEs
        const jeRes = await apiFetch('GET', `/api/close/journal-entries?closeSessionId=${sessionId}`, undefined, preparer.token);
        const jes = jeRes.body?.journalEntries ?? jeRes.body?.entries ?? jeRes.body ?? [];
        for (const je of jes) {
          const jeStatus = (je.status ?? '').toLowerCase();
          const jeId = je.id ?? je.jeId;
          if (!jeId) continue;
          if (jeStatus === 'draft') {
            await apiFetch('POST', `/api/close/journal-entries/${jeId}/propose`, {}, preparer.token);
            await apiFetch('POST', `/api/close/journal-entries/${jeId}/approve`, {}, reviewer.token);
          } else if (jeStatus === 'proposed') {
            await apiFetch('POST', `/api/close/journal-entries/${jeId}/approve`, {}, reviewer.token);
          }
        }
      }
    }

    // Retry advance after fixes
    advRes1 = await apiFetch('POST', `/api/close/sessions/${sessionId}/advance`, {}, preparer.token);
  }
  if (!advRes1.ok) {
    // Final diagnostics
    const r2 = await apiFetch('GET', `/api/close/sessions/${sessionId}/readiness?format=gates`, undefined, preparer.token);
    const g2 = r2.body?.gates ?? [];
    const f2 = g2.filter((g: any) => g.status === 'fail' || g.passing === false);
    const failNames = f2.map((g: any) => `${g.name ?? g.gate}: ${g.detail ?? g.reason ?? g.status}`).join('; ');
    throw new Error(`Advance to UNDER_REVIEW failed after auto-fix (${advRes1.status}): failing gates=[${failNames}]`);
  }
  // May need a second advance depending on current state
  const session = await getSession(preparer.token, sessionId);
  if (session.status === 'in_progress' || session.state === 'IN_PROGRESS') {
    const advRes2 = await apiFetch('POST', `/api/close/sessions/${sessionId}/advance`, {}, preparer.token);
    if (!advRes2.ok) {
      throw new Error(`Second advance failed (${advRes2.status}): ${JSON.stringify(advRes2.body).slice(0, 500)}`);
    }
  }
}

export async function fullCloseToCertified(
  preparer: TestUser,
  reviewer: TestUser,
  sessionId: string,
  glCsv: string,
  approver?: TestUser,
): Promise<void> {
  await fullCloseToReview(preparer, reviewer, sessionId, glCsv);
  // Certify — use approver if provided (server requires approver role), fall back to reviewer
  const certifier = approver ?? reviewer;
  const res = await apiFetch('POST', `/api/close/sessions/${sessionId}/certify`, {
    confirmation: 'CERTIFY',
    certifiedBy: certifier.userId ?? certifier.email ?? 'e2e-reviewer',
  }, certifier.token);
  if (!res.ok) throw new Error(`Certify failed: ${JSON.stringify(res.body)}`);
}

// ---------------------------------------------------------------------------
// Assertions
// ---------------------------------------------------------------------------

export function expectStatus(res: ApiResponse, expected: number, label?: string): void {
  if (res.status !== expected) {
    throw new Error(
      `${label ?? 'Status'}: expected ${expected}, got ${res.status}\nBody: ${JSON.stringify(res.body, null, 2).slice(0, 500)}`
    );
  }
}

export function expectField(obj: any, field: string, expected: any, label?: string): void {
  const val = field.split('.').reduce((o, k) => o?.[k], obj);
  if (val !== expected) {
    throw new Error(
      `${label ?? field}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(val)}`
    );
  }
}

export function expectFieldExists(obj: any, field: string, label?: string): void {
  const val = field.split('.').reduce((o, k) => o?.[k], obj);
  if (val === undefined || val === null) {
    throw new Error(`${label ?? field}: expected to exist, got ${val}`);
  }
}

export function expectFieldIncludes(obj: any, field: string, substr: string, label?: string): void {
  const val = field.split('.').reduce((o, k) => o?.[k], obj);
  if (typeof val !== 'string' || !val.includes(substr)) {
    throw new Error(`${label ?? field}: expected to include "${substr}", got ${JSON.stringify(val)}`);
  }
}

export function expectTrue(condition: boolean, label: string): void {
  if (!condition) throw new Error(`Assertion failed: ${label}`);
}

export function money(amount: string | number): string {
  return typeof amount === 'number' ? amount.toFixed(2) : String(amount);
}

/**
 * Coerce JE line amounts from strings to numbers and add amountProvenance.
 * Wraps raw lines arrays so direct apiFetch JE creation calls match the
 * server's Zod schema (z.number() for debit/credit).
 */
export function enrichJELines(lines: any[]): any[] {
  return lines.map(l => ({
    ...l,
    debit: typeof l.debit === 'string' ? parseFloat(l.debit) : (l.debit ?? 0),
    credit: typeof l.credit === 'string' ? parseFloat(l.credit) : (l.credit ?? 0),
    amountProvenance: l.amountProvenance ?? { kind: 'human_entered' as const, enteredBy: 'e2e-test' },
  }));
}

export function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// ---------------------------------------------------------------------------
// Fixture paths
// ---------------------------------------------------------------------------

export const FIXTURES = {
  minimalGL: path.join(__dirname, 'fixtures', 'minimal_gl.csv'),
  largeGL: path.join(__dirname, 'fixtures', 'large_gl.csv'),
  unbalancedGL: path.join(__dirname, 'fixtures', 'unbalanced_gl.csv'),
  duplicateGL: path.join(__dirname, 'fixtures', 'duplicate_gl.csv'),
  outOfPeriodGL: path.join(__dirname, 'fixtures', 'out_of_period_gl.csv'),
  glJan2026: path.join(__dirname, 'fixtures', 'gl_jan_2026.csv'),
  glFeb2026: path.join(__dirname, 'fixtures', 'gl_feb_2026.csv'),
  glMar2026: path.join(__dirname, 'fixtures', 'gl_mar_2026.csv'),
  sampleEvidence: path.join(__dirname, 'fixtures', 'sample_evidence.pdf'),
  sampleInvoice: path.join(__dirname, 'fixtures', 'sample_invoice.pdf'),
};

export function readFixture(name: keyof typeof FIXTURES): string {
  return fs.readFileSync(FIXTURES[name], 'utf8');
}
