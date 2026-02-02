/**
 * Tenant-scoped integration credential store with optional encryption.
 * Uses a local encrypted file for persistence (replace with Vault/DB in prod).
 */

import fs from 'fs';
import path from 'path';
import { createHash, createCipheriv, createDecipheriv, randomBytes } from 'crypto';

export interface OAuthTokens {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: string;
}

export interface IntegrationRecord {
  tenantId: string;
  provider: 'google';
  tokens: OAuthTokens;
  connectedAt: string;
}

const store = new Map<string, IntegrationRecord>();
const STORE_PATH = path.join(process.cwd(), '.integrations.enc');
const STORE_KEY = process.env.INTEGRATION_STORE_KEY ?? '';

/** In production, INTEGRATION_STORE_KEY must be set when using the store. */
function requireStoreKey(): void {
  if (process.env.NODE_ENV === 'production' && (!STORE_KEY || !STORE_KEY.trim())) {
    throw new Error('INTEGRATION_STORE_KEY must be set in production to use the integration store.');
  }
}

function key(tenantId: string, provider: 'google'): string {
  return `${tenantId}::${provider}`;
}

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

function saveStore(): void {
  if (!STORE_KEY) return;
  const payload = JSON.stringify(Array.from(store.entries()));
  const enc = encrypt(payload, STORE_KEY);
  fs.writeFileSync(STORE_PATH, enc, { encoding: 'utf8' });
}

function loadStore(): void {
  if (!STORE_KEY) return;
  if (!fs.existsSync(STORE_PATH)) return;
  try {
    const enc = fs.readFileSync(STORE_PATH, 'utf8');
    const json = decrypt(enc, STORE_KEY);
    const entries = JSON.parse(json) as Array<[string, IntegrationRecord]>;
    entries.forEach(([k, v]) => store.set(k, v));
  } catch {
    // ignore corrupt store
  }
}

loadStore();

export function setIntegration(record: IntegrationRecord): void {
  requireStoreKey();
  store.set(key(record.tenantId, record.provider), record);
  saveStore();
}

export function updateIntegrationTokens(tenantId: string, tokens: Partial<OAuthTokens>): void {
  requireStoreKey();
  const existing = getIntegration(tenantId, 'google');
  if (!existing) return;
  const updated: IntegrationRecord = {
    ...existing,
    tokens: { ...existing.tokens, ...tokens },
  };
  store.set(key(tenantId, 'google'), updated);
  saveStore();
}

export function getIntegration(tenantId: string, provider: 'google'): IntegrationRecord | null {
  return store.get(key(tenantId, provider)) ?? null;
}

export function listIntegrations(tenantId: string): IntegrationRecord[] {
  return Array.from(store.values()).filter((r) => r.tenantId === tenantId);
}

export function listTenantIds(): string[] {
  return Array.from(store.values()).map((r) => r.tenantId);
}
