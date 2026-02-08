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

export async function appendEntry(
  client: Queryable,
  input: Omit<AuditLedgerEntryInput, 'previousEntryHash' | 'entryHash'> & { createdBy?: string }
): Promise<AuditLedgerEntry> {
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

  await client.query(
    `INSERT INTO audit_ledger (
      id, tenant_id, period_label, event_type, deterministic_flag_snapshot,
      agent_dissent_snapshot, user_prompt_rationale, previous_entry_hash, entry_hash,
      created_at, created_by, hash_version
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
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

export async function verifyChain(pool: Queryable, tenantId: string): Promise<AuditLedgerVerifyResult> {
  const verifiedAt = new Date().toISOString();
  const baseSelect = `id, tenant_id, period_label, event_type, deterministic_flag_snapshot, agent_dissent_snapshot,
    user_prompt_rationale, previous_entry_hash, entry_hash, created_at`;
  let rows: VerifyRow[];
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
  let prevHash: string | null = null;
  for (const row of rows) {
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
      return { valid: false, brokenAtEntryId: row.id, message: 'Hash mismatch', entryCount: rows.length, verifiedAt };
    }
    if (row.previous_entry_hash !== prevHash) {
      return { valid: false, brokenAtEntryId: row.id, message: 'Chain link broken (previous_entry_hash)', entryCount: rows.length, verifiedAt };
    }
    prevHash = row.entry_hash;
  }
  const last = rows[rows.length - 1];
  return {
    valid: true,
    entryCount: rows.length,
    verifiedAt,
    ...(last ? { latestEntryHash: last.entry_hash, latestEntryId: last.id } : {}),
  };
}
