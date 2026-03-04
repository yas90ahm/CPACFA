/**
 * Storage: abstraction for attachments and export packages.
 * Default: LocalDiskStorage. Later: S3 adapter via STORAGE_ADAPTER=s3.
 */

import type { Storage } from './types.js';
import { localDiskStorage } from './local_disk_storage.js';

let _storage: Storage = localDiskStorage;

export function getStorage(): Storage {
  return _storage;
}

export function setStorage(s: Storage): void {
  _storage = s;
}

export type { Storage } from './types.js';
export { localDiskStorage } from './local_disk_storage.js';
