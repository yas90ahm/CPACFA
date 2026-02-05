/**
 * Storage adapter and config enforcement tests.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';
import type { Storage } from '../../src/storage/types.js';
import { localDiskStorage } from '../../src/storage/local_disk_storage.js';
import { disallowMemoryStoreInProduction, isProduction } from '../../src/lib/env.js';

describe('Storage — LocalDiskStorage', () => {
  let baseDir: string;
  let storage: Storage;

  beforeEach(() => {
    baseDir = mkdtempSync(join(tmpdir(), 'storage-test-'));
    storage = {
      async putObject(key: string, body: Buffer): Promise<string> {
        const path = join(baseDir, key);
        const { mkdir, writeFile } = await import('fs/promises');
        await mkdir(join(path, '..'), { recursive: true });
        await writeFile(path, body);
        return key;
      },
      async getObject(key: string): Promise<Buffer | null> {
        try {
          const path = join(baseDir, key);
          return readFileSync(path);
        } catch {
          return null;
        }
      },
      async deleteObject(key: string): Promise<void> {
        const { unlink } = await import('fs/promises');
        try {
          await unlink(join(baseDir, key));
        } catch (_) {
          /* ENOENT ok */
        }
      },
    };
  });

  afterEach(() => {
    if (baseDir && existsSync(baseDir)) rmSync(baseDir, { recursive: true });
  });

  it('putObject and getObject round-trip', async () => {
    const key = 'tenant1/attachments/je/j1/abc.pdf';
    const body = Buffer.from('test content');
    const outKey = await storage.putObject(key, body);
    expect(outKey).toBe(key);
    const got = await storage.getObject(key);
    expect(got).not.toBeNull();
    expect(Buffer.from(got!).toString()).toBe('test content');
  });

  it('getObject returns null for missing key', async () => {
    const got = await storage.getObject('missing/key');
    expect(got).toBeNull();
  });

  it('deleteObject removes file', async () => {
    const key = 'tenant1/x.txt';
    await storage.putObject(key, Buffer.from('x'));
    expect(await storage.getObject(key)).not.toBeNull();
    await storage.deleteObject(key);
    expect(await storage.getObject(key)).toBeNull();
  });
});

describe('LocalDiskStorage — path traversal', () => {
  it('rejects key containing path traversal', async () => {
    await expect(localDiskStorage.putObject('x..y/z', Buffer.from('x'))).rejects.toThrow(
      /path traversal|must not/
    );
  });
});

describe('Env — config enforcement', () => {
  const origEnv = process.env.NODE_ENV;

  afterEach(() => {
    process.env.NODE_ENV = origEnv;
  });

  it('disallowMemoryStoreInProduction does not throw when hasDurableContext is true', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      disallowMemoryStoreInProduction({ storeName: 'test', hasDurableContext: true })
    ).not.toThrow();
  });

  it('disallowMemoryStoreInProduction throws in production when hasDurableContext is false', () => {
    process.env.NODE_ENV = 'production';
    expect(() =>
      disallowMemoryStoreInProduction({ storeName: 'HITL staging', hasDurableContext: false })
    ).toThrow(/Production.*in-memory.*not allowed|HITL staging/);
  });

  it('disallowMemoryStoreInProduction does not throw in development when hasDurableContext is false', () => {
    process.env.NODE_ENV = 'development';
    expect(() =>
      disallowMemoryStoreInProduction({ storeName: 'test', hasDurableContext: false })
    ).not.toThrow();
  });

  it('isProduction returns true when NODE_ENV=production', () => {
    process.env.NODE_ENV = 'production';
    expect(isProduction()).toBe(true);
  });

  it('isProduction returns false when NODE_ENV=development', () => {
    process.env.NODE_ENV = 'development';
    expect(isProduction()).toBe(false);
  });
});
