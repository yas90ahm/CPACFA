/**
 * Ingestion fetchers scaffolding (email/drive).
 */

import { getIntegration } from './integration_store.js';
import { runIngestionAgent } from './ingestion_agent.js';
import { buildIngestionPipeline } from './ingestion_pipeline.js';
import { isDuplicate, markSeen } from './ingestion_dedup_store.js';
import { refreshGoogleAccessToken } from './google_oauth.js';
import { recordFetcherRun, getQuota, getUsage } from './fetcher_run_tracker.js';

export interface FetcherResult {
  source: 'email' | 'drive';
  fetchedCount: number;
  documents: Array<{ filename: string; receivedAt?: string; uri?: string }>;
}

export interface IngestedResultSummary {
  source: 'email' | 'drive';
  filename: string;
  classification: string;
  confidence: number;
  jurisdiction?: { country?: string; jurisdiction?: string; currency?: string; taxId?: string; businessNumber?: string };
  pipeline: ReturnType<typeof buildIngestionPipeline>;
  skipped?: boolean;
}

export async function fetchFromEmail(tenantId?: string): Promise<FetcherResult> {
  const token = tenantId ? await getGoogleAccessToken(tenantId) : process.env.GMAIL_ACCESS_TOKEN;
  if (!token) {
    return { source: 'email', fetchedCount: 0, documents: [] };
  }
  const query = encodeURIComponent(process.env.GMAIL_QUERY ?? 'has:attachment');
  const maxResults = Number(process.env.GMAIL_MAX_RESULTS ?? 10);
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${maxResults}`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    return { source: 'email', fetchedCount: 0, documents: [] };
  }
  const listJson = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = listJson.messages?.map((m) => m.id) ?? [];
  const documents: FetcherResult['documents'] = [];
  for (const id of ids) {
    const msgRes = await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=metadata`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!msgRes.ok) continue;
    const msg = (await msgRes.json()) as {
      internalDate?: string;
      snippet?: string;
      payload?: { headers?: Array<{ name: string; value: string }> };
    };
    const subject = msg.payload?.headers?.find((h) => h.name.toLowerCase() === 'subject')?.value;
    documents.push({
      filename: subject ? `gmail:${subject}` : 'gmail:message',
      receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : undefined,
      uri: `gmail://message/${id}`,
    });
  }
  return { source: 'email', fetchedCount: documents.length, documents };
}

export async function fetchFromDrive(tenantId?: string): Promise<FetcherResult> {
  const token = tenantId ? await getGoogleAccessToken(tenantId) : process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (!token) {
    return { source: 'drive', fetchedCount: 0, documents: [] };
  }
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const q = folderId ? encodeURIComponent(`'${folderId}' in parents and trashed=false`) : encodeURIComponent('trashed=false');
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=20&fields=files(id,name,modifiedTime,mimeType)`;
  const listRes = await fetch(listUrl, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!listRes.ok) {
    return { source: 'drive', fetchedCount: 0, documents: [] };
  }
  const listJson = (await listRes.json()) as { files?: Array<{ id: string; name: string; modifiedTime?: string }> };
  const files = listJson.files ?? [];
  const documents = files.map((f) => ({
    filename: f.name,
    receivedAt: f.modifiedTime,
    uri: `gdrive://file/${f.id}`,
  }));
  return { source: 'drive', fetchedCount: documents.length, documents };
}

export async function runAllFetchers(tenantId?: string): Promise<FetcherResult[]> {
  const [email, drive] = await Promise.all([fetchFromEmail(tenantId), fetchFromDrive(tenantId)]);
  return [email, drive];
}

export async function runAllFetchersAndIngest(tenantId?: string): Promise<{
  fetched: FetcherResult[];
  ingested: IngestedResultSummary[];
  usage?: ReturnType<typeof getUsage>;
  quota?: ReturnType<typeof getQuota>;
}> {
  const tenant = tenantId ?? 'default-tenant';
  const quota = getQuota(tenant);
  const [emailDocs, driveDocs] = await Promise.all([
    fetchEmailAttachments(tenantId),
    fetchDriveFiles(tenantId),
  ]);
  recordFetcherRun(tenant, emailDocs.length + driveDocs.length);
  const ingested: IngestedResultSummary[] = [];
  for (const doc of [...emailDocs, ...driveDocs]) {
    const result = await runIngestionAgent(doc.buffer, { filename: doc.filename });
    const pipeline = buildIngestionPipeline(result.parsed, doc.filename);
    const t = tenantId ?? 'default-tenant';
    const allSeen = pipeline.documents.every((d) => isDuplicate(t, d.semanticHash));
    if (!allSeen) {
      pipeline.documents.forEach((d) => markSeen(t, d.semanticHash));
    }
    ingested.push({
      source: doc.source,
      filename: doc.filename,
      classification: result.classification,
      confidence: result.confidence,
      jurisdiction: result.jurisdiction,
      pipeline,
      skipped: allSeen,
    });
  }
  const fetched: FetcherResult[] = [
    { source: 'email', fetchedCount: emailDocs.length, documents: emailDocs.map((d) => ({ filename: d.filename, receivedAt: d.receivedAt, uri: d.uri })) },
    { source: 'drive', fetchedCount: driveDocs.length, documents: driveDocs.map((d) => ({ filename: d.filename, receivedAt: d.receivedAt, uri: d.uri })) },
  ];
  return { fetched, ingested, usage: getUsage(tenant), quota };
}

async function getGoogleAccessToken(tenantId: string): Promise<string | undefined> {
  const record = getIntegration(tenantId, 'google');
  const token = record?.tokens.accessToken;
  const expiresAt = record?.tokens.expiresAt ? Date.parse(record.tokens.expiresAt) : undefined;
  if (token && (!expiresAt || Date.now() < expiresAt - 60_000)) {
    return token;
  }
  const refreshed = await refreshGoogleAccessToken(tenantId);
  return refreshed ?? token;
}

async function fetchEmailAttachments(tenantId?: string): Promise<Array<{ source: 'email'; filename: string; buffer: Buffer; receivedAt?: string; uri?: string }>> {
  const token = tenantId ? await getGoogleAccessToken(tenantId) : process.env.GMAIL_ACCESS_TOKEN;
  if (!token) return [];
  const query = encodeURIComponent(process.env.GMAIL_QUERY ?? 'has:attachment');
  const maxResults = Number(process.env.GMAIL_MAX_RESULTS ?? 5);
  const listUrl = `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${query}&maxResults=${maxResults}`;
  const listRes = await withRetry(() => fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } }));
  if (!listRes.ok) return [];
  const listJson = (await listRes.json()) as { messages?: Array<{ id: string }> };
  const ids = listJson.messages?.map((m) => m.id) ?? [];
  const out: Array<{ source: 'email'; filename: string; buffer: Buffer; receivedAt?: string; uri?: string }> = [];
  for (const id of ids) {
    const msgRes = await withRetry(() =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}?format=full`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    if (!msgRes.ok) continue;
    const msg = (await msgRes.json()) as {
      internalDate?: string;
      payload?: { parts?: Array<{ filename?: string; body?: { attachmentId?: string; data?: string } }> };
    };
    const parts = msg.payload?.parts ?? [];
    for (const p of parts) {
      if (!p.filename) continue;
      const attachmentId = p.body?.attachmentId;
      if (!attachmentId) continue;
      if (!isSupportedFilename(p.filename)) continue;
      await throttle();
      const attRes = await withRetry(() =>
        fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${id}/attachments/${attachmentId}`, {
          headers: { Authorization: `Bearer ${token}` },
        })
      );
      if (!attRes.ok) continue;
      const attJson = (await attRes.json()) as { data?: string };
      if (!attJson.data) continue;
      const buffer = Buffer.from(attJson.data.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
      out.push({
        source: 'email',
        filename: p.filename,
        buffer,
        receivedAt: msg.internalDate ? new Date(Number(msg.internalDate)).toISOString() : undefined,
        uri: `gmail://message/${id}`,
      });
    }
  }
  return out;
}

async function fetchDriveFiles(tenantId?: string): Promise<Array<{ source: 'drive'; filename: string; buffer: Buffer; receivedAt?: string; uri?: string }>> {
  const token = tenantId ? await getGoogleAccessToken(tenantId) : process.env.GOOGLE_DRIVE_ACCESS_TOKEN;
  if (!token) return [];
  const folderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  const q = folderId ? encodeURIComponent(`'${folderId}' in parents and trashed=false`) : encodeURIComponent('trashed=false');
  const listUrl = `https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=10&fields=files(id,name,modifiedTime,mimeType)`;
  const listRes = await withRetry(() => fetch(listUrl, { headers: { Authorization: `Bearer ${token}` } }));
  if (!listRes.ok) return [];
  const listJson = (await listRes.json()) as { files?: Array<{ id: string; name: string; modifiedTime?: string }> };
  const files = listJson.files ?? [];
  const out: Array<{ source: 'drive'; filename: string; buffer: Buffer; receivedAt?: string; uri?: string }> = [];
  for (const f of files) {
    if (!isSupportedFilename(f.name)) continue;
    await throttle();
    const fileRes = await withRetry(() =>
      fetch(`https://www.googleapis.com/drive/v3/files/${f.id}?alt=media`, {
        headers: { Authorization: `Bearer ${token}` },
      })
    );
    if (!fileRes.ok) continue;
    const arrayBuffer = await fileRes.arrayBuffer();
    out.push({
      source: 'drive',
      filename: f.name,
      buffer: Buffer.from(arrayBuffer),
      receivedAt: f.modifiedTime,
      uri: `gdrive://file/${f.id}`,
    });
  }
  return out;
}

function isSupportedFilename(name: string): boolean {
  const ext = name.toLowerCase().split('.').pop() ?? '';
  return ['pdf', 'csv', 'xlsx', 'xls', 'json', 'png', 'jpg', 'jpeg', 'webp'].includes(ext);
}

async function withRetry<T>(fn: () => Promise<T>, retries = 3, baseDelayMs = 500): Promise<T> {
  let attempt = 0;
  let lastError: unknown;
  while (attempt <= retries) {
    try {
      const res = await fn();
      if (isRateLimitResponse(res)) {
        const delay = retryAfterMs(res) ?? baseDelayMs * Math.pow(2, attempt);
        await sleep(delay + Math.floor(Math.random() * 200));
        attempt += 1;
        continue;
      }
      return res;
    } catch (err) {
      lastError = err;
      if (attempt === retries) break;
      const delay = baseDelayMs * Math.pow(2, attempt) + Math.floor(Math.random() * 200);
      await sleep(delay);
      attempt += 1;
    }
  }
  throw lastError;
}

async function throttle(): Promise<void> {
  const delay = Number(process.env.INGESTION_FETCH_THROTTLE_MS ?? 200);
  if (delay > 0) await sleep(delay);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitResponse(value: unknown): value is Response {
  return typeof value === 'object' && value !== null && 'status' in value && (value as Response).status === 429;
}

function retryAfterMs(res: Response): number | null {
  const h = res.headers.get('retry-after');
  if (!h) return null;
  const seconds = Number(h);
  if (!Number.isFinite(seconds)) return null;
  return seconds * 1000;
}
