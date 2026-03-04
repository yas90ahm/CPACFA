/**
 * Local disk storage adapter: putObject/getObject/deleteObject using a base directory.
 * Key is path-like; we sanitize to avoid path traversal. Base dir from STORAGE_LOCAL_BASE_PATH or ./storage.
 */

import { mkdir, readFile, writeFile, unlink } from 'fs/promises';
import { join, normalize } from 'path';
import type { Storage } from './types.js';

const BASE = process.env.STORAGE_LOCAL_BASE_PATH ?? join(process.cwd(), 'storage');

function sanitizeKey(key: string): string {
  const normalized = normalize(key).replace(/^(\.\.(\/|\\))+/, '');
  if (normalized.includes('..')) {
    throw new Error('Storage key must not contain path traversal');
  }
  return normalized;
}

function keyToPath(key: string): string {
  return join(BASE, sanitizeKey(key));
}

export const localDiskStorage: Storage = {
  async putObject(key: string, body: Buffer, _options?: { contentType?: string }): Promise<string> {
    const path = keyToPath(key);
    await mkdir(join(path, '..'), { recursive: true });
    await writeFile(path, body);
    return key;
  },

  async getObject(key: string): Promise<Buffer | null> {
    try {
      const path = keyToPath(key);
      return await readFile(path);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOENT') return null;
      throw err;
    }
  },

  async deleteObject(key: string): Promise<void> {
    try {
      const path = keyToPath(key);
      await unlink(path);
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code;
      if (code === 'ENOENT') return;
      throw err;
    }
  },
};
