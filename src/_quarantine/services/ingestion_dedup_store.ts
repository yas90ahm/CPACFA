/**
 * Dedup store for ingested semantic hashes (tenant-scoped).
 */

import fs from 'fs';
import path from 'path';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

const STORE_PATH = path.join(process.cwd(), '.dedup.enc');
const STORE_KEY = process.env.INGESTION_DEDUP_KEY ?? '';

/** In production, INGESTION_DEDUP_KEY must be set when persisting the dedup store. */
function requireDedupKey(): void {
  if (process.env.NODE_ENV === 'production' && (!STORE_KEY || !STORE_KEY.trim())) {
    throw new Error('INGESTION_DEDUP_KEY must be set in production to use the ingestion dedup store.');
  }
}

const store = new Set<string>();

function deriveKey(secret: string): Buffer {
  return createHash('sha256').update(secret).digest();
}

function encrypt(payload: string, secret: string): string {
  const keyBuf = deriveKey(secret);
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);
  const enc = Buffer.concat([cipher.update(payload, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return JSON.stringify({
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64'),
  });
}

function decrypt(payload: string, secret: string): string {
  const parsed = JSON.parse(payload) as { iv: string; tag: string; data: string };
  const keyBuf = deriveKey(secret);
  const iv = Buffer.from(parsed.iv, 'base64');
  const tag = Buffer.from(parsed.tag, 'base64');
  const data = Buffer.from(parsed.data, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(tag);
  const dec = Buffer.concat([decipher.update(data), decipher.final()]);
  return dec.toString('utf8');
}

function loadStore(): void {
  if (!STORE_KEY) return;
  if (!fs.existsSync(STORE_PATH)) return;
  try {
    const enc = fs.readFileSync(STORE_PATH, 'utf8');
    const json = decrypt(enc, STORE_KEY);
    const values = JSON.parse(json) as string[];
    values.forEach((v) => store.add(v));
  } catch {
    // ignore corrupt store
  }
}

function saveStore(): void {
  if (!STORE_KEY) return;
  const payload = JSON.stringify(Array.from(store.values()));
  const enc = encrypt(payload, STORE_KEY);
  fs.writeFileSync(STORE_PATH, enc, { encoding: 'utf8' });
}

loadStore();

export function isDuplicate(tenantId: string, semanticHash: string): boolean {
  return store.has(`${tenantId}::${semanticHash}`);
}

export function markSeen(tenantId: string, semanticHash: string): void {
  requireDedupKey();
  store.add(`${tenantId}::${semanticHash}`);
  saveStore();
}
