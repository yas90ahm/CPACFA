/**
 * Immutable audit log (append-only) for core app — who did what when.
 * In-memory store; when context (pool, tenantId) is provided, also persists to tenant DB.
 */

import type { Pool } from 'pg';
import type { AuditLogEntry } from '../types/close_and_controls.js';
import {
  insertAuditLog as insertAuditLogDb,
  queryAuditLogDb,
  deleteAuditLogOlderThan,
} from '../db/repositories/audit_log_repository.js';
import { log as logMessage } from '../lib/logger.js';

const inMemoryLog: AuditLogEntry[] = [];
const MAX_ENTRIES = 50_000;

const AUDIT_LOG_RETENTION_YEARS = Number(process.env.AUDIT_LOG_RETENTION_YEARS) || 7;

export type AuditLogContext = { pool: Pool; tenantId: string };

function nextId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Append an audit log entry (immutable). When context is provided, also writes to tenant DB.
 * Returns the created entry.
 */
export function appendAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>,
  context?: AuditLogContext
): AuditLogEntry {
  const full: AuditLogEntry = {
    ...entry,
    id: nextId(),
    timestamp: new Date().toISOString(),
  };
  inMemoryLog.push(full);
  if (inMemoryLog.length > MAX_ENTRIES) inMemoryLog.splice(0, inMemoryLog.length - MAX_ENTRIES);
  if (context) {
    insertAuditLogDb(context.pool, context.tenantId, entry).catch((err) =>
      logMessage('error', 'Audit log DB insert failed', { err: String(err) })
    );
  }
  return full;
}

/**
 * Query audit log by actor, action, or resource (optional filters). Returns recent first.
 * When context is provided and DB is used, returns from tenant DB; otherwise in-memory.
 */
export async function queryAuditLog(
  filters: {
    actor?: string;
    action?: string;
    resource?: string;
    since?: string; // ISO
    limit?: number;
  },
  context?: AuditLogContext
): Promise<AuditLogEntry[]> {
  if (context) {
    try {
      return await queryAuditLogDb(context.pool, context.tenantId, filters);
    } catch (err) {
      logMessage('error', 'Audit log DB query failed', { err: String(err) });
      // fall through to in-memory
    }
  }
  let result = [...inMemoryLog].reverse();
  if (filters.actor) result = result.filter((e) => e.actor === filters.actor);
  if (filters.action) result = result.filter((e) => e.action === filters.action);
  if (filters.resource) result = result.filter((e) => e.resource === filters.resource);
  if (filters.since) {
    const sinceMs = new Date(filters.since).getTime();
    result = result.filter((e) => new Date(e.timestamp).getTime() >= sinceMs);
  }
  const limit = filters.limit ?? 100;
  return result.slice(0, limit);
}

/**
 * Purge audit log rows older than retention period (e.g. 7 years). Returns count deleted.
 */
export async function purgeRetention(context: AuditLogContext): Promise<{ deleted: number }> {
  const beforeDate = new Date();
  beforeDate.setFullYear(beforeDate.getFullYear() - AUDIT_LOG_RETENTION_YEARS);
  const beforeTimestamp = beforeDate.toISOString();
  const deleted = await deleteAuditLogOlderThan(context.pool, context.tenantId, beforeTimestamp);
  return { deleted };
}
