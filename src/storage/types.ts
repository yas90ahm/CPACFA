/**
 * Storage abstraction for attachments and export packages.
 * Implementations: LocalDiskStorage (default), S3 later.
 */

export interface Storage {
  /** Store buffer; key is path-like (e.g. tenantId/attachments/je-123/abc.pdf). Returns the key used. */
  putObject(key: string, body: Buffer, options?: { contentType?: string }): Promise<string>;
  /** Retrieve by key. Returns null if not found. */
  getObject(key: string): Promise<Buffer | null>;
  /** Delete by key. No-op if not found. */
  deleteObject(key: string): Promise<void>;
}
