/**
 * Unit tests: evidence storage service — store, retrieve, integrity verification.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, existsSync, writeFileSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import {
  localDiskEvidenceStorage,
  getEvidenceStorageAdapter,
  resetEvidenceStorageAdapter,
  computeSha256,
  verifyEvidenceIntegrity,
} from '../../src/services/evidence_storage_service.js';

describe('Evidence storage service — LocalDiskStorage', () => {
  let baseDir: string;
  const origPath = process.env.EVIDENCE_STORAGE_PATH;
  const origAdapter = process.env.STORAGE_ADAPTER;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'evidence-storage-test-'));
    process.env.EVIDENCE_STORAGE_PATH = baseDir;
    process.env.STORAGE_ADAPTER = 'local';
    resetEvidenceStorageAdapter();
  });

  afterEach(() => {
    process.env.EVIDENCE_STORAGE_PATH = origPath;
    process.env.STORAGE_ADAPTER = origAdapter;
    resetEvidenceStorageAdapter();
    if (baseDir && existsSync(baseDir)) rmSync(baseDir, { recursive: true });
  });

  it('store and retrieve file — content matches', async () => {
    const tenantId = 'tenant-1';
    const evidenceId = 'ev-001';
    const content = Buffer.from('test evidence content for round-trip');
    const { storagePath } = await localDiskEvidenceStorage.store(
      tenantId,
      evidenceId,
      content,
      { mimeType: 'application/pdf', originalFilename: 'doc.pdf' }
    );
    expect(storagePath).toBeDefined();
    expect(storagePath).toContain(tenantId);
    expect(storagePath).toContain(evidenceId);

    const retrieved = await localDiskEvidenceStorage.retrieve(tenantId, evidenceId);
    expect(retrieved).not.toBeNull();
    expect(retrieved!.buffer.equals(content)).toBe(true);
    expect(retrieved!.metadata.mimeType).toBe('application/pdf');
    expect(retrieved!.metadata.originalFilename).toContain('ev-001');
  });

  it('retrieve returns null for missing evidence', async () => {
    const retrieved = await localDiskEvidenceStorage.retrieve('tenant-1', 'nonexistent');
    expect(retrieved).toBeNull();
  });

  it('verifyEvidenceIntegrity — valid when hash matches', async () => {
    const content = Buffer.from('integrity test content');
    const hash = computeSha256(content);
    await localDiskEvidenceStorage.store('t1', 'ev-ok', content, {
      originalFilename: 'x.bin',
    });
    const result = await verifyEvidenceIntegrity(
      localDiskEvidenceStorage,
      't1',
      'ev-ok',
      hash
    );
    expect(result.valid).toBe(true);
    expect(result.mismatch).toBe(false);
    expect(result.computedHash).toBe(hash);
    expect(result.storedHash).toBe(hash);
  });

  it('verifyEvidenceIntegrity — catches tampering', async () => {
    const content = Buffer.from('original content');
    const hash = computeSha256(content);
    await localDiskEvidenceStorage.store('t1', 'ev-tamper', content, {
      originalFilename: 'x.bin',
    });
    const { readdir } = await import('fs/promises');
    const dir = join(process.env.EVIDENCE_STORAGE_PATH!, 't1');
    const files = await readdir(dir);
    const filePath = join(dir, files[0]);
    writeFileSync(filePath, Buffer.from('tampered content'));

    const result = await verifyEvidenceIntegrity(
      localDiskEvidenceStorage,
      't1',
      'ev-tamper',
      hash
    );
    expect(result.valid).toBe(false);
    expect(result.mismatch).toBe(true);
    expect(result.computedHash).not.toBe(hash);
    expect(result.storedHash).toBe(hash);
  });

  it('getEvidenceStorageAdapter returns local adapter when STORAGE_ADAPTER=local', () => {
    const adapter = getEvidenceStorageAdapter();
    expect(adapter).toBe(localDiskEvidenceStorage);
  });
});
