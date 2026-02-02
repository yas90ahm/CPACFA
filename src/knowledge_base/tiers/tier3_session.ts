/**
 * Financial Memory — Tier 3 (Session): Files and content uploaded in the current conversation.
 */

import type { MemoryEntry, SessionUpload } from '../types.js';

/** Session-scoped uploads (keyed by sessionId for multi-session support). */
const sessionUploads = new Map<string, SessionUpload[]>();

/** Add an uploaded file/content for a session. */
export function addSessionUpload(sessionId: string, upload: Omit<SessionUpload, 'id' | 'uploadedAt'>): SessionUpload {
  const list = sessionUploads.get(sessionId) ?? [];
  const id = `session-${sessionId}-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const uploadedAt = new Date().toISOString();
  const record: SessionUpload = { ...upload, id, uploadedAt };
  list.push(record);
  sessionUploads.set(sessionId, list);
  return record;
}

/** Get all uploads for a session. */
export function getSessionUploads(sessionId: string): SessionUpload[] {
  return [...(sessionUploads.get(sessionId) ?? [])];
}

/** Clear session uploads (e.g. when conversation ends). */
export function clearSession(sessionId: string): void {
  sessionUploads.delete(sessionId);
}

/** Convert Tier 3 (session) data to MemoryEntry[] for hybrid search. */
export function getSessionEntries(sessionId: string): MemoryEntry[] {
  const uploads = getSessionUploads(sessionId);
  return uploads.map((u) => ({
    id: u.id,
    tier: 'session',
    source: 'upload',
    text: `${u.filename} ${u.summaryText}`.trim(),
    payload: { filename: u.filename, contentType: u.contentType, metadata: u.metadata },
    storedAt: u.uploadedAt,
  }));
}
