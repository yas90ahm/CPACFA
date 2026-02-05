/**
 * Immutable audit log (append-only) for core app — who did what when.
 * When REQUIRE_AUDIT_DB_CONTEXT is set or NODE_ENV=production: context (pool, tenantId) is required;
 * in-memory-only paths are disabled for accounting-grade immutability.
 */

import type { Pool } from 'pg';
import type { AuditLogEntry } from '../types/close_and_controls.js';
import {
  insertAuditLog as insertAuditLogDb,
  queryAuditLogDb,
  deleteAuditLogOlderThan,
} from '../db/repositories/audit_log_repository.js';
import { log as logMessage } from '../lib/logger.js';

const REQUIRE_AUDIT_DB_CONTEXT =
  process.env.REQUIRE_AUDIT_DB_CONTEXT === '1' ||
  process.env.REQUIRE_AUDIT_DB_CONTEXT === 'true' ||
  process.env.NODE_ENV === 'production';

const inMemoryLog: AuditLogEntry[] = [];
const MAX_ENTRIES = 50_000;

const AUDIT_LOG_RETENTION_YEARS = Number(process.env.AUDIT_LOG_RETENTION_YEARS) || 7;

export type AuditLogContext = { pool: Pool; tenantId: string };

function nextId(): string {
  return `audit-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/**
 * Append an audit log entry (immutable). When context is provided, writes to tenant DB.
 * In production (or when REQUIRE_AUDIT_DB_CONTEXT), context is required; in-memory-only is disabled.
 */
export function appendAuditLog(
  entry: Omit<AuditLogEntry, 'id' | 'timestamp'>,
  context?: AuditLogContext
): AuditLogEntry {
  if (REQUIRE_AUDIT_DB_CONTEXT && !context) {
    throw new Error('Audit log requires DB context (pool, tenantId) in production; in-memory-only disabled.');
  }
  const full: AuditLogEntry = {
    ...entry,
    id: nextId(),
    timestamp: new Date().toISOString(),
  };
  if (!REQUIRE_AUDIT_DB_CONTEXT) {
    inMemoryLog.push(full);
    if (inMemoryLog.length > MAX_ENTRIES) inMemoryLog.splice(0, inMemoryLog.length - MAX_ENTRIES);
  }
  if (context) {
    insertAuditLogDb(context.pool, context.tenantId, entry).catch((err) =>
      logMessage('error', 'Audit log DB insert failed', { err: String(err) })
    );
  }
  return full;
}

/**
 * Query audit log by actor, action, or resource (optional filters). Returns recent first.
 * In production (or when REQUIRE_AUDIT_DB_CONTEXT), context is required; in-memory fallback disabled.
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
  if (REQUIRE_AUDIT_DB_CONTEXT && !context) {
    throw new Error('Audit log query requires DB context (pool, tenantId) in production; in-memory-only disabled.');
  }
  if (context) {
    try {
      return await queryAuditLogDb(context.pool, context.tenantId, filters);
    } catch (err) {
      logMessage('error', 'Audit log DB query failed', { err: String(err) });
      if (REQUIRE_AUDIT_DB_CONTEXT) throw err;
      // fall through to in-memory only when not in production
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
