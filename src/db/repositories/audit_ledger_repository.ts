/**
 * Immutable audit ledger — append-only, hash-chained. No UPDATE/DELETE.
 *
 * Hash versions (hash_version column):
 * - v1 (legacy): raw JSON key order, createdAt as stored.
 * - v2 (canonical): sorted keys + normalized ISO timestamps for deterministic verification.
 * Missing hash_version is treated as v1 for backward compatibility.
 */

import type { Pool, PoolClient } from 'pg';

/** Pool or client (for transactional writes). Both expose .query(). */
type Queryable = Pool | PoolClient;
import { createHash } from 'crypto';
import type {
  AuditLedgerEntryInput,
  AuditLedgerEntry,
  AuditLedgerEventType,
  AuditLedgerVerifyResult,
} from '../../types/audit_ledger.js';

const HASH_VERSION_V1 = 1;
const HASH_VERSION_V2 = 2;

function nextId(): string {
  return `al-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

/** Canonicalize for v2 hashing: sorted keys + normalized values so DB round-trip does not change hash. */
function canonicalizeForHash(obj: unknown): unknown {
  if (obj === null || obj === undefined) return obj;
  if (Array.isArray(obj)) return obj.map(canonicalizeForHash);
  if (typeof obj === 'object') {
    const sorted: Record<string, unknown> = {};
    for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
      sorted[key] = canonicalizeForHash((obj as Record<string, unknown>)[key]);
    }
    return sorted;
  }
  return obj;
}

type HashPayload = {
  tenantId: string;
  periodLabel: string | null;
  eventType: AuditLedgerEventType;
  deterministicFlagSnapshot: Record<string, unknown>;
  agentDissentSnapshot: Record<string, unknown> | null;
  userPromptRationale: string;
  previousEntryHash: string | null;
  createdAt: string;
};

/** v1: raw payload (legacy). */
function computeEntryHashV1(payload: HashPayload): string {
  const canonical = JSON.stringify({
    tenantId: payload.tenantId,
    periodLabel: payload.periodLabel,
    eventType: payload.eventType,
    deterministicFlagSnapshot: payload.deterministicFlagSnapshot,
    agentDissentSnapshot: payload.agentDissentSnapshot,
    userPromptRationale: payload.userPromptRationale,
    previousEntryHash: payload.previousEntryHash,
    createdAt: payload.createdAt,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

/** v2: canonical (sorted keys + normalized dates). */
function computeEntryHashV2(payload: HashPayload): string {
  const canonical = JSON.stringify({
    tenantId: payload.tenantId,
    periodLabel: payload.periodLabel,
    eventType: payload.eventType,
    deterministicFlagSnapshot: canonicalizeForHash(payload.deterministicFlagSnapshot),
    agentDissentSnapshot: canonicalizeForHash(payload.agentDissentSnapshot),
    userPromptRationale: payload.userPromptRationale,
    previousEntryHash: payload.previousEntryHash,
    createdAt: payload.createdAt,
  });
  return createHash('sha256').update(canonical, 'utf8').digest('hex');
}

export async function getLatestHash(client: Queryable, tenantId: string): Promise<string | null> {
  const r = await client.query<{ entry_hash: string }>(
    'SELECT entry_hash FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 1',
    [tenantId]
  );
  return r.rows[0]?.entry_hash ?? null;
}

/**
 * L2 fix: Serialize getLatestHash + INSERT to prevent hash chain race conditions.
 * When a Pool is passed (not already in a transaction), wraps in BEGIN/COMMIT with
 * a pg_advisory_xact_lock to serialize concurrent appends per tenant.
 * When a PoolClient is passed (already in a transaction), acquires the advisory lock
 * within the existing transaction.
 */
export async function appendEntry(
  client: Queryable,
  input: Omit<AuditLedgerEntryInput, 'previousEntryHash' | 'entryHash'> & {
    createdBy?: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
  }
): Promise<AuditLedgerEntry> {
  // Detect if caller passed a Pool (has connect method) vs PoolClient (already transactional)
  const isPool = 'connect' in client && typeof (client as Pool).connect === 'function'
    && !('release' in client); // PoolClient has release, Pool does not at instance level

  if (isPool) {
    // Wrap in a transaction to serialize the read-then-write
    const txClient = await (client as Pool).connect();
    try {
      await txClient.query('BEGIN');
      const result = await appendEntryInternal(txClient, input);
      await txClient.query('COMMIT');
      return result;
    } catch (err) {
      await txClient.query('ROLLBACK').catch(() => {});
      throw err;
    } finally {
      txClient.release();
    }
  } else {
    // Already in a transaction — just acquire advisory lock and proceed
    return appendEntryInternal(client, input);
  }
}

async function appendEntryInternal(
  client: Queryable,
  input: Omit<AuditLedgerEntryInput, 'previousEntryHash' | 'entryHash'> & {
    createdBy?: string;
    beforeState?: Record<string, unknown> | null;
    afterState?: Record<string, unknown> | null;
  }
): Promise<AuditLedgerEntry> {
  // Acquire advisory lock keyed on tenant to serialize concurrent appends
  // Use a hash of the tenantId as the lock key (bigint)
  const lockKey = hashTenantIdToLockKey(input.tenantId);
  await client.query('SELECT pg_advisory_xact_lock($1)', [lockKey]);

  const id = nextId();
  const createdAt = new Date().toISOString();
  const previousEntryHash = await getLatestHash(client, input.tenantId);
  const payload: HashPayload = {
    tenantId: input.tenantId,
    periodLabel: input.periodLabel ?? null,
    eventType: input.eventType,
    deterministicFlagSnapshot: input.deterministicFlagSnapshot,
    agentDissentSnapshot: input.agentDissentSnapshot ?? null,
    userPromptRationale: input.userPromptRationale,
    previousEntryHash,
    createdAt,
  };
  const entryHash = computeEntryHashV2(payload);

  const beforeState = input.beforeState != null ? JSON.stringify(input.beforeState) : null;
  const afterState = input.afterState != null ? JSON.stringify(input.afterState) : null;

  await client.query(
    `INSERT INTO audit_ledger (
      id, tenant_id, period_label, event_type, deterministic_flag_snapshot,
      agent_dissent_snapshot, user_prompt_rationale, previous_entry_hash, entry_hash,
      created_at, created_by, hash_version, before_state, after_state
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
    [
      id,
      input.tenantId,
      input.periodLabel ?? null,
      input.eventType,
      JSON.stringify(input.deterministicFlagSnapshot),
      input.agentDissentSnapshot != null ? JSON.stringify(input.agentDissentSnapshot) : null,
      input.userPromptRationale,
      previousEntryHash,
      entryHash,
      createdAt,
      input.createdBy ?? null,
      HASH_VERSION_V2,
      beforeState,
      afterState,
    ]
  );

  return {
    id,
    tenantId: input.tenantId,
    periodLabel: input.periodLabel ?? null,
    eventType: input.eventType,
    deterministicFlagSnapshot: input.deterministicFlagSnapshot,
    agentDissentSnapshot: input.agentDissentSnapshot ?? null,
    userPromptRationale: input.userPromptRationale,
    previousEntryHash,
    entryHash,
    createdAt,
    createdBy: input.createdBy ?? null,
  };
}

/** Convert tenantId string to a deterministic bigint for pg_advisory_xact_lock. */
function hashTenantIdToLockKey(tenantId: string): string {
  // Use a simple hash to create a stable numeric lock key
  // Namespace 0x41554449 = 'AUDI' to avoid collisions with other advisory locks
  let hash = 0x41554449;
  for (let i = 0; i < tenantId.length; i++) {
    hash = ((hash << 5) - hash + tenantId.charCodeAt(i)) | 0;
  }
  return String(hash);
}

/** List ledger entries for tenant and period (session-scoped). */
export async function listByTenantAndPeriod(
  pool: Queryable,
  tenantId: string,
  periodLabel: string,
  opts?: { eventType?: string; createdBy?: string; dateFrom?: string; dateTo?: string; limit?: number; offset?: number }
): Promise<
  Array<{
    id: string;
    eventType: string;
    description: string;
    userId: string | null;
    timestamp: string;
    beforeState: unknown;
    afterState: unknown;
    hash: string;
    previousHash: string | null;
  }>
> {
  let sql = `SELECT id, event_type, user_prompt_rationale, created_by, created_at,
       deterministic_flag_snapshot, before_state, after_state, entry_hash, previous_entry_hash
     FROM audit_ledger
     WHERE tenant_id = $1 AND period_label = $2`;
  const params: unknown[] = [tenantId, periodLabel];
  let i = 3;
  if (opts?.eventType) {
    sql += ` AND event_type = $${i++}`;
    params.push(opts.eventType);
  }
  if (opts?.createdBy) {
    sql += ` AND created_by = $${i++}`;
    params.push(opts.createdBy);
  }
  if (opts?.dateFrom) {
    sql += ` AND created_at >= $${i++}`;
    params.push(opts.dateFrom);
  }
  if (opts?.dateTo) {
    sql += ` AND created_at <= $${i++}`;
    params.push(opts.dateTo);
  }
  sql += ` ORDER BY created_at DESC`;
  if (opts?.limit != null) {
    sql += ` LIMIT $${i}`;
    params.push(opts.limit);
    i++;
  }
  if (opts?.offset != null) {
    sql += ` OFFSET $${i}`;
    params.push(opts.offset);
  }
  const r = await pool.query<{
    id: string;
    event_type: string;
    user_prompt_rationale: string;
    created_by: string | null;
    created_at: string | Date;
    before_state: unknown;
    after_state: unknown;
    entry_hash: string;
    previous_entry_hash: string | null;
  }>(sql, params);
  return r.rows.map((row) => ({
    id: row.id,
    eventType: row.event_type,
    description: row.user_prompt_rationale ?? row.event_type,
    userId: row.created_by,
    timestamp: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date).toISOString(),
    beforeState: row.before_state,
    afterState: row.after_state,
    hash: row.entry_hash,
    previousHash: row.previous_entry_hash,
  }));
}

/** Count ledger entries for tenant/period (for pagination total). */
export async function countByTenantAndPeriod(
  pool: Queryable,
  tenantId: string,
  periodLabel: string,
  opts?: { eventType?: string; createdBy?: string; dateFrom?: string; dateTo?: string }
): Promise<number> {
  let sql = `SELECT COUNT(*)::text AS c FROM audit_ledger
     WHERE tenant_id = $1 AND period_label = $2`;
  const params: unknown[] = [tenantId, periodLabel];
  let i = 3;
  if (opts?.eventType) {
    sql += ` AND event_type = $${i++}`;
    params.push(opts.eventType);
  }
  if (opts?.createdBy) {
    sql += ` AND created_by = $${i++}`;
    params.push(opts.createdBy);
  }
  if (opts?.dateFrom) {
    sql += ` AND created_at >= $${i++}`;
    params.push(opts.dateFrom);
  }
  if (opts?.dateTo) {
    sql += ` AND created_at <= $${i++}`;
    params.push(opts.dateTo);
  }
  const r = await pool.query<{ c: string }>(sql, params);
  return parseInt(r.rows[0]?.c ?? '0', 10);
}

/** Count ledger entries for tenant/period and event type (for integrity check). */
export async function countByTenantPeriodAndEventType(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  eventType: string
): Promise<number> {
  const r = await pool.query<{ count: string }>(
    'SELECT COUNT(*) AS count FROM audit_ledger WHERE tenant_id = $1 AND period_label = $2 AND event_type = $3',
    [tenantId, periodLabel, eventType]
  );
  return Number(r.rows[0]?.count ?? 0);
}

type VerifyRow = {
  id: string;
  tenant_id: string;
  period_label: string | null;
  event_type: string;
  deterministic_flag_snapshot: unknown;
  agent_dissent_snapshot: unknown;
  user_prompt_rationale: string;
  previous_entry_hash: string | null;
  entry_hash: string;
  created_at: string | Date;
  hash_version: number;
};

/**
 * Verify the full audit chain from the beginning (ignoring checkpoints).
 * Use for periodic full audits or when checkpoint integrity is suspect.
 */
export async function verifyFullChain(pool: Queryable, tenantId: string): Promise<AuditLedgerVerifyResult> {
  return verifyChainInternal(pool, tenantId, { useCheckpoint: false });
}

/**
 * Verify the audit chain with checkpoint support for incremental verification.
 * On success, saves/updates the checkpoint for future incremental runs.
 */
export async function verifyChain(pool: Queryable, tenantId: string): Promise<AuditLedgerVerifyResult> {
  return verifyChainInternal(pool, tenantId, { useCheckpoint: true });
}

interface CheckpointRow {
  last_verified_entry_id: string;
  last_verified_hash: string;
  entries_verified: number;
}

async function verifyChainInternal(
  pool: Queryable,
  tenantId: string,
  opts: { useCheckpoint: boolean }
): Promise<AuditLedgerVerifyResult> {
  const verifiedAt = new Date().toISOString();
  const baseSelect = `id, tenant_id, period_label, event_type, deterministic_flag_snapshot, agent_dissent_snapshot,
    user_prompt_rationale, previous_entry_hash, entry_hash, created_at`;

  // Check for existing checkpoint
  let checkpoint: CheckpointRow | null = null;
  let checkpointEntriesVerified = 0;
  if (opts.useCheckpoint) {
    try {
      const cpResult = await pool.query<CheckpointRow>(
        `SELECT last_verified_entry_id, last_verified_hash, entries_verified
         FROM audit_chain_checkpoints WHERE tenant_id = $1`,
        [tenantId]
      );
      if (cpResult.rows.length > 0) {
        checkpoint = cpResult.rows[0];
        checkpointEntriesVerified = checkpoint.entries_verified;
      }
    } catch {
      // Table may not exist yet — fall through to full verification
    }
  }

  let rows: VerifyRow[];
  let prevHash: string | null = null;

  if (checkpoint) {
    // Incremental: fetch only entries after the checkpoint
    prevHash = checkpoint.last_verified_hash;
    try {
      // Get the created_at of the checkpoint entry to filter subsequent rows
      const cpEntryResult = await pool.query<{ created_at: string | Date }>(
        `SELECT created_at FROM audit_ledger WHERE id = $1 AND tenant_id = $2`,
        [checkpoint.last_verified_entry_id, tenantId]
      );
      if (cpEntryResult.rows.length === 0) {
        // Checkpoint entry no longer exists — fall through to full verification
        checkpoint = null;
        checkpointEntriesVerified = 0;
        prevHash = null;
      } else {
        const cpCreatedAt = cpEntryResult.rows[0].created_at;
        try {
          const r = await pool.query<VerifyRow>(
            `SELECT ${baseSelect}, COALESCE(hash_version, 1) AS hash_version
             FROM audit_ledger WHERE tenant_id = $1 AND created_at > $2 ORDER BY created_at ASC`,
            [tenantId, cpCreatedAt]
          );
          rows = r.rows;
        } catch (err: unknown) {
          const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
          if (code === '42703') {
            const r = await pool.query<Omit<VerifyRow, 'hash_version'>>(
              `SELECT ${baseSelect} FROM audit_ledger WHERE tenant_id = $1 AND created_at > $2 ORDER BY created_at ASC`,
              [tenantId, cpCreatedAt]
            );
            rows = r.rows.map((row) => ({ ...row, hash_version: HASH_VERSION_V1 }));
          } else {
            throw err;
          }
        }
      }
    } catch {
      // Fall through to full verification
      checkpoint = null;
      checkpointEntriesVerified = 0;
      prevHash = null;
    }
  }

  // Full verification (no checkpoint or checkpoint invalid)
  if (!checkpoint) {
    try {
      const r = await pool.query<VerifyRow>(
        `SELECT ${baseSelect}, COALESCE(hash_version, 1) AS hash_version
         FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at ASC`,
        [tenantId]
      );
      rows = r.rows;
    } catch (err: unknown) {
      const code = err && typeof err === 'object' && 'code' in err ? (err as { code: string }).code : '';
      if (code === '42703') {
        const r = await pool.query<Omit<VerifyRow, 'hash_version'>>(
          `SELECT ${baseSelect} FROM audit_ledger WHERE tenant_id = $1 ORDER BY created_at ASC`,
          [tenantId]
        );
        rows = r.rows.map((row) => ({ ...row, hash_version: HASH_VERSION_V1 }));
      } else {
        throw err;
      }
    }
  }

  const totalEntries = checkpointEntriesVerified + rows!.length;

  for (const row of rows!) {
    const version = row.hash_version === HASH_VERSION_V2 ? HASH_VERSION_V2 : HASH_VERSION_V1;
    const createdAtRaw = row.created_at;
    const createdAt =
      typeof createdAtRaw === 'object' && createdAtRaw instanceof Date
        ? createdAtRaw.toISOString()
        : String(createdAtRaw ?? '');
    const payload: HashPayload = {
      tenantId: row.tenant_id,
      periodLabel: row.period_label,
      eventType: row.event_type as AuditLedgerEventType,
      deterministicFlagSnapshot: (row.deterministic_flag_snapshot as Record<string, unknown>) ?? {},
      agentDissentSnapshot: (row.agent_dissent_snapshot as Record<string, unknown>) ?? null,
      userPromptRationale: row.user_prompt_rationale ?? '',
      previousEntryHash: row.previous_entry_hash,
      createdAt,
    };
    const computed = version === HASH_VERSION_V2 ? computeEntryHashV2(payload) : computeEntryHashV1(payload);
    if (computed !== row.entry_hash) {
      return { valid: false, brokenAtEntryId: row.id, message: 'Hash mismatch', entryCount: totalEntries, verifiedAt };
    }
    if (row.previous_entry_hash !== prevHash) {
      return { valid: false, brokenAtEntryId: row.id, message: 'Chain link broken (previous_entry_hash)', entryCount: totalEntries, verifiedAt };
    }
    prevHash = row.entry_hash;
  }

  const allRows = rows!;
  const last = allRows.length > 0 ? allRows[allRows.length - 1] : null;
  const lastEntryId = last?.id ?? checkpoint?.last_verified_entry_id;
  const lastEntryHash = last?.entry_hash ?? checkpoint?.last_verified_hash;

  // Save/update checkpoint on successful verification
  if (opts.useCheckpoint && lastEntryId && lastEntryHash) {
    try {
      await pool.query(
        `INSERT INTO audit_chain_checkpoints (tenant_id, last_verified_entry_id, last_verified_hash, entries_verified, verified_at)
         VALUES ($1, $2::uuid, $3, $4, $5)
         ON CONFLICT (tenant_id) DO UPDATE SET
           last_verified_entry_id = $2::uuid,
           last_verified_hash = $3,
           entries_verified = $4,
           verified_at = $5`,
        [tenantId, lastEntryId, lastEntryHash, totalEntries, verifiedAt]
      );
    } catch {
      // Checkpoint table may not exist yet — non-fatal, verification result is still valid
    }
  }

  return {
    valid: true,
    entryCount: totalEntries,
    verifiedAt,
    ...(lastEntryHash ? { latestEntryHash: lastEntryHash } : {}),
    ...(lastEntryId ? { latestEntryId: lastEntryId } : {}),
  };
}

/** List all audit ledger entries for a tenant (no period filter). Used as fallback for audit-log queries. */
export async function listAllForTenant(
  pool: Queryable,
  tenantId: string,
  opts?: { limit?: number }
): Promise<Array<{
  id: string;
  event_type: string;
  created_by: string | null;
  created_at: string;
  period_label: string | null;
  user_prompt_rationale: string | null;
}>> {
  const limit = Math.min(opts?.limit ?? 100, 500);
  const r = await pool.query<{
    id: string;
    event_type: string;
    created_by: string | null;
    created_at: string | Date;
    period_label: string | null;
    user_prompt_rationale: string | null;
  }>(
    `SELECT id, event_type, created_by, created_at, period_label, user_prompt_rationale
     FROM audit_ledger WHERE tenant_id = $1
     ORDER BY created_at DESC LIMIT $2`,
    [tenantId, limit]
  );
  return r.rows.map((row) => ({
    id: row.id,
    event_type: row.event_type,
    created_by: row.created_by,
    created_at: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date).toISOString(),
    period_label: row.period_label,
    user_prompt_rationale: row.user_prompt_rationale,
  }));
}
