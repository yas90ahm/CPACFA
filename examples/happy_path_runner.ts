/**
 * Minimal reference integration: V2 happy path end-to-end.
 * Uses: ensure → board-ready-pack → advance (until certified) → pbc-index → trust tokens & binder URLs.
 *
 * Env: BASE_URL (default http://localhost:3000), TENANT_ID (optional), AUTH_TOKEN (optional).
 * Run: npm run example:happy-path
 */

const BASE_URL = (process.env.BASE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
const TENANT_ID = process.env.TENANT_ID ?? '';
const AUTH_TOKEN = process.env.AUTH_TOKEN ?? '';

const entityId = `example-entity-${Date.now()}`;
const periodLabel = '2025-09';
const trialBalance = [
  { accountName: 'Cash', debit: 1000, credit: 0 },
  { accountName: 'Retained Earnings', debit: 0, credit: 1000 },
];

const FETCH_TIMEOUT_MS = 15_000;

function headers(): Record<string, string> {
  const h: Record<string, string> = { 'Content-Type': 'application/json' };
  if (TENANT_ID) h['x-tenant-id'] = TENANT_ID;
  if (AUTH_TOKEN) h['Authorization'] = `Bearer ${AUTH_TOKEN}`;
  return h;
}

async function fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    return await fetch(url, { ...init, signal: ctrl.signal });
  } catch (e) {
    if (e instanceof Error && e.name === 'AbortError') throw new Error(`Request timed out. Is the server running at ${BASE_URL}?`);
    throw e;
  } finally {
    clearTimeout(t);
  }
}

function fail(msg: string, res?: { status: number; body?: unknown }): never {
  const extra = res ? ` (${res.status} ${JSON.stringify(res.body ?? '')})` : '';
  throw new Error(msg + extra);
}

async function ensureSession(): Promise<string> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/close/sessions/ensure`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ entityId, periodLabel }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) fail('Unauthorized: set AUTH_TOKEN (and optionally TENANT_ID)', { status: res.status, body });
  if (res.status === 403) fail('Forbidden: check tenant and role', { status: res.status, body });
  if (res.status === 400) fail('Bad request: ' + (body?.message ?? body?.error ?? 'validation failed'), { status: res.status, body });
  if (!res.ok) fail('Ensure session failed', { status: res.status, body });
  const closeSessionId = body?.closeSessionId ?? body?.id;
  if (!closeSessionId) fail('Ensure response missing closeSessionId');
  return closeSessionId;
}

async function boardReadyPack(closeSessionId: string): Promise<{ status?: string; blockersCount: number }> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/precheck/board-ready-pack`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({
      periodLabel,
      trialBalance,
      closeSessionId,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) fail('Unauthorized', { status: res.status, body });
  if (res.status === 403) fail('Forbidden', { status: res.status, body });
  if (res.status === 400) fail('Board-ready-pack validation failed', { status: res.status, body });
  if (!res.ok) fail('Board-ready-pack failed', { status: res.status, body });
  const blockers = Array.isArray(body?.blockers) ? body.blockers : [];
  return { status: body?.status, blockersCount: blockers.length };
}

async function advance(closeSessionId: string): Promise<{ statusAfter: string; actionTaken: string; result?: unknown; code?: string; blockers?: unknown[] }> {
  const res = await fetchWithTimeout(`${BASE_URL}/api/close/sessions/${closeSessionId}/advance`, {
    method: 'POST',
    headers: headers(),
    body: JSON.stringify({ certifiedBy: 'example-user' }),
  });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) fail('Unauthorized', { status: res.status, body });
  if (res.status === 403) fail('Forbidden (e.g. approver role required to certify)', { status: res.status, body });
  if (res.status === 404) fail('Close session not found', { status: res.status, body });
  if (res.status === 422) {
    return {
      statusAfter: body?.statusAfter ?? 'unknown',
      actionTaken: body?.actionTaken ?? 'none',
      result: body?.result,
      code: body?.code,
      blockers: body?.blockers,
    };
  }
  if (!res.ok) fail('Advance failed', { status: res.status, body });
  return {
    statusAfter: body?.statusAfter ?? 'unknown',
    actionTaken: body?.actionTaken ?? 'none',
    result: body?.result,
  };
}

async function pbcIndex(closeSessionId: string): Promise<{
  evidence?: { binder?: { endpoints?: { json?: string; zip?: string; pdf?: string } }; snapshot?: { snapshotId?: string; snapshotHash?: string; hashVersion?: string } };
  status?: { certifiedSnapshotId?: string };
}> {
  const url = `${BASE_URL}/api/audit/pbc-index?closeSessionId=${encodeURIComponent(closeSessionId)}`;
  const res = await fetchWithTimeout(url, { method: 'GET', headers: headers() });
  const body = await res.json().catch(() => ({}));
  if (res.status === 401) fail('Unauthorized', { status: res.status, body });
  if (res.status === 403) fail('Forbidden', { status: res.status, body });
  if (res.status === 404) fail('Close session not found for PBC index', { status: res.status, body });
  if (!res.ok) fail('PBC index failed', { status: res.status, body });
  return body;
}

function resolveUrl(pathOrUrl: string): string {
  if (pathOrUrl.startsWith('http')) return pathOrUrl;
  return BASE_URL + (pathOrUrl.startsWith('/') ? pathOrUrl : '/' + pathOrUrl);
}

async function main(): Promise<void> {
  console.log('Happy path runner — BASE_URL=%s', BASE_URL);
  console.log('entityId=%s periodLabel=%s', entityId, periodLabel);

  const closeSessionId = await ensureSession();
  console.log('1) Ensure session: closeSessionId=%s', closeSessionId);

  const precheck = await boardReadyPack(closeSessionId);
  console.log('2) Board-ready-pack: status=%s blockers=%d', precheck.status ?? 'ok', precheck.blockersCount);

  let statusAfter = 'draft';
  for (let i = 0; i < 10 && statusAfter !== 'certified'; i++) {
    const out = await advance(closeSessionId);
    statusAfter = out.statusAfter;
    console.log('3) Advance #%d: statusAfter=%s actionTaken=%s', i + 1, statusAfter, out.actionTaken);
    if (out.code === 'NOT_READY' && Array.isArray(out.blockers) && out.blockers.length) {
      console.log('   Blockers: %s', (out.blockers as { message?: string }[]).map((b) => b.message).join('; '));
    }
  }
  if (statusAfter !== 'certified') {
    console.warn('   Stopped after 10 iterations; statusAfter=%s (certification may require ingest + checklist)', statusAfter);
  }

  const pbc = await pbcIndex(closeSessionId);
  const snap = pbc.evidence?.snapshot;
  const certifiedSource = (pbc.evidence as { certifiedStatements?: { source?: string } })?.certifiedStatements?.source ?? 'none';
  const trust = {
    certifiedSnapshotId: pbc.status?.certifiedSnapshotId ?? snap?.snapshotId ?? null,
    snapshotHash: snap?.snapshotHash ?? null,
    hashVersion: snap?.hashVersion ?? null,
    certifiedSource,
  };
  console.log('5) Trust tokens: certifiedSnapshotId=%s snapshotHash=%s hashVersion=%s certifiedSource=%s',
    trust.certifiedSnapshotId ?? 'null',
    trust.snapshotHash ?? 'null',
    trust.hashVersion ?? 'null',
    trust.certifiedSource);

  const binder = pbc.evidence?.binder?.endpoints;
  if (binder) {
    console.log('6) Binder endpoints (do NOT download):');
    if (binder.json) console.log('   json: %s', resolveUrl(binder.json));
    if (binder.zip) console.log('   zip:  %s', resolveUrl(binder.zip));
    if (binder.pdf) console.log('   pdf:  %s', resolveUrl(binder.pdf));
  } else {
    console.log('6) Binder endpoints: (none — session not certified or no certified source)');
  }

  console.log('Done.');
}

main().catch((e) => {
  const msg = e instanceof Error ? e.message : String(e);
  if (msg.includes('fetch') || msg.includes('ECONNREFUSED') || msg.includes('ENOTFOUND')) {
    console.error('Connection failed. Is the server running? Set BASE_URL if needed (default http://localhost:3000).');
  }
  console.error(msg);
  process.exit(1);
});
