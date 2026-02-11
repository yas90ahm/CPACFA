/**
 * Evidence file storage service — stores and retrieves evidence file blobs.
 * Two adapters: LocalDiskStorage and S3Storage.
 * Selection via STORAGE_ADAPTER=local|s3 (default: local).
 * Path structure: {base}/{tenant_id}/{evidence_id} for tenant isolation.
 */

import { createHash } from 'crypto';
import { mkdir, readFile, writeFile } from 'fs/promises';
import { join, dirname } from 'path';

export interface EvidenceStorageMetadata {
  mimeType?: string;
  originalFilename?: string;
}

export interface StoreResult {
  storagePath: string;
}

export interface RetrieveResult {
  buffer: Buffer;
  metadata: EvidenceStorageMetadata;
}

export interface EvidenceStorageAdapter {
  store(
    tenantId: string,
    evidenceId: string,
    buffer: Buffer,
    metadata: EvidenceStorageMetadata
  ): Promise<StoreResult>;
  retrieve(
    tenantId: string,
    evidenceId: string
  ): Promise<RetrieveResult | null>;
}

const ADAPTER = (process.env.STORAGE_ADAPTER ?? 'local').toLowerCase();

function getEvidenceStoragePath(): string {
  return process.env.EVIDENCE_STORAGE_PATH ?? join(process.cwd(), 'data', 'evidence');
}

function sanitizeId(id: string): string {
  if (!/^[a-zA-Z0-9\-_]+$/.test(id)) {
    throw new Error('Invalid tenant or evidence ID for storage path');
  }
  return id;
}

/** Local disk storage: ./data/evidence/{tenant_id}/{evidence_id} */
export const localDiskEvidenceStorage: EvidenceStorageAdapter = {
  async store(
    tenantId: string,
    evidenceId: string,
    buffer: Buffer,
    metadata: EvidenceStorageMetadata
  ): Promise<StoreResult> {
    const base = getEvidenceStoragePath();
    const tid = sanitizeId(tenantId);
    const eid = sanitizeId(evidenceId);
    const ext = metadata.originalFilename?.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'bin';
    const storagePath = join(base, tid, `${eid}.${ext}`);
    const dir = dirname(storagePath);
    await mkdir(dir, { recursive: true });
    await writeFile(storagePath, buffer);
    return { storagePath };
  },

  async retrieve(tenantId: string, evidenceId: string): Promise<RetrieveResult | null> {
    const base = getEvidenceStoragePath();
    const tid = sanitizeId(tenantId);
    const dir = join(base, tid);
    try {
      const { readdir } = await import('fs/promises');
      const files = await readdir(dir);
      const prefix = `${sanitizeId(evidenceId)}.`;
      const match = files.find((f) => f === evidenceId || f.startsWith(prefix));
      if (!match) return null;
      const fullPath = join(dir, match);
      const buffer = await readFile(fullPath);
      const ext = match.split('.').pop() ?? '';
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const mimeType = mimeMap[ext.toLowerCase()] ?? 'application/octet-stream';
      return {
        buffer,
        metadata: { mimeType, originalFilename: match },
      };
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  },
};

/** S3 storage: uses AWS SDK v3. Requires EVIDENCE_S3_BUCKET, EVIDENCE_S3_REGION. */
async function createS3Adapter(): Promise<EvidenceStorageAdapter> {
  const { S3Client, PutObjectCommand, GetObjectCommand, ListObjectsV2Command } = await import(
    '@aws-sdk/client-s3'
  );
  const bucket = process.env.EVIDENCE_S3_BUCKET?.trim();
  const region = process.env.EVIDENCE_S3_REGION?.trim() ?? 'us-east-1';
  const prefix = (process.env.EVIDENCE_S3_PREFIX ?? '').trim().replace(/\/$/, '');

  if (!bucket) {
    throw new Error('EVIDENCE_S3_BUCKET is required when STORAGE_ADAPTER=s3');
  }

  const client = new S3Client({ region });

  function buildKey(tenantId: string, evidenceId: string, ext?: string): string {
    const tid = sanitizeId(tenantId);
    const eid = sanitizeId(evidenceId);
    const suf = ext ? `.${ext}` : '';
    const key = prefix ? `${prefix}/${tid}/${eid}${suf}` : `${tid}/${eid}${suf}`;
    return key;
  }

  return {
    async store(
      tenantId: string,
      evidenceId: string,
      buffer: Buffer,
      metadata: EvidenceStorageMetadata
    ): Promise<StoreResult> {
      const ext = metadata.originalFilename?.match(/\.([a-zA-Z0-9]+)$/)?.[1] ?? 'bin';
      const key = buildKey(tenantId, evidenceId, ext);
      await client.send(
        new PutObjectCommand({
          Bucket: bucket,
          Key: key,
          Body: buffer,
          ContentType: metadata.mimeType ?? 'application/octet-stream',
        })
      );
      return { storagePath: `s3://${bucket}/${key}` };
    },

    async retrieve(tenantId: string, evidenceId: string): Promise<RetrieveResult | null> {
      const tid = sanitizeId(tenantId);
      const baseKey = prefix ? `${prefix}/${tid}/${sanitizeId(evidenceId)}` : `${tid}/${sanitizeId(evidenceId)}`;
      const list = await client.send(
        new ListObjectsV2Command({
          Bucket: bucket,
          Prefix: baseKey,
          MaxKeys: 2,
        })
      );
      const obj = list.Contents?.[0];
      if (!obj?.Key) return null;
      const getRes = await client.send(
        new GetObjectCommand({ Bucket: bucket, Key: obj.Key })
      );
      const body = getRes.Body;
      if (!body) return null;
      const chunks: Uint8Array[] = [];
      for await (const chunk of body as AsyncIterable<Uint8Array>) {
        chunks.push(chunk);
      }
      const buffer = Buffer.concat(chunks);
      const ext = obj.Key.split('.').pop() ?? '';
      const mimeMap: Record<string, string> = {
        pdf: 'application/pdf',
        png: 'image/png',
        jpg: 'image/jpeg',
        jpeg: 'image/jpeg',
        csv: 'text/csv',
        xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      };
      const mimeType = (getRes.ContentType as string) ?? mimeMap[ext.toLowerCase()] ?? 'application/octet-stream';
      const originalFilename = obj.Key.split('/').pop() ?? undefined;
      return {
        buffer,
        metadata: { mimeType, originalFilename },
      };
    },
  };
}

let _adapter: EvidenceStorageAdapter | null = null;

export function getEvidenceStorageAdapter(): EvidenceStorageAdapter {
  if (_adapter) return _adapter;
  if (ADAPTER === 's3') {
    throw new Error('S3 evidence storage requires async init. Use getEvidenceStorageAdapterAsync().');
  }
  _adapter = localDiskEvidenceStorage;
  return _adapter;
}

let _adapterPromise: Promise<EvidenceStorageAdapter> | null = null;

export async function getEvidenceStorageAdapterAsync(): Promise<EvidenceStorageAdapter> {
  if (_adapter) return _adapter;
  if (_adapterPromise) return _adapterPromise;
  _adapterPromise = (async () => {
    if (ADAPTER === 's3') {
      _adapter = await createS3Adapter();
    } else {
      _adapter = localDiskEvidenceStorage;
    }
    return _adapter;
  })();
  return _adapterPromise;
}

/** Reset adapter (for tests). */
export function resetEvidenceStorageAdapter(): void {
  _adapter = null;
  _adapterPromise = null;
}

/** Compute SHA-256 of buffer. */
export function computeSha256(buffer: Buffer): string {
  return createHash('sha256').update(buffer).digest('hex');
}

export interface VerifyEvidenceIntegrityResult {
  valid: boolean;
  storedHash: string;
  computedHash: string;
  mismatch: boolean;
}

/**
 * Verify evidence file integrity: retrieve from storage, recompute SHA-256, compare with stored hash.
 * Returns valid: true only when file exists and hash matches.
 */
export async function verifyEvidenceIntegrity(
  adapter: EvidenceStorageAdapter,
  tenantId: string,
  evidenceId: string,
  storedHash: string
): Promise<VerifyEvidenceIntegrityResult> {
  const retrieved = await adapter.retrieve(tenantId, evidenceId);
  if (!retrieved) {
    return {
      valid: false,
      storedHash,
      computedHash: '',
      mismatch: true,
    };
  }
  const computedHash = computeSha256(retrieved.buffer);
  const mismatch = computedHash.toLowerCase() !== storedHash.toLowerCase();
  return {
    valid: !mismatch,
    storedHash,
    computedHash,
    mismatch,
  };
}
