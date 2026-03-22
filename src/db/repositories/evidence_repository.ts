/**
 * Evidence Anchoring — DB repository (tenant-scoped).
 * Stores proof + reference metadata only; evidence files stay in external systems.
 * Phase 2A: assertion_type (required), claimed_amount (canonical money), etc.
 */

import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type {
  EvidenceRecord,
  EvidenceLink,
  CreateEvidenceRecordInput,
  LinkEvidenceInput,
  AssertionType,
} from '../../types/evidence.js';
import { normalizeMoney } from '../../utils/decimal.js';

interface EvidenceRecordRow {
  id: string;
  tenant_id: string;
  hash_sha256: string;
  size_bytes: string;
  mime_type: string | null;
  external_uri: string | null;
  external_provider: string | null;
  label: string | null;
  attached_by: string;
  attached_at: string;
  integrity_version: string;
  storage_path: string | null;
  original_filename: string | null;
}

interface EvidenceLinkRow {
  id: string;
  tenant_id: string;
  evidence_id: string;
  object_type: string;
  object_id: string;
  role: string | null;
  requiredness: string;
  created_by: string;
  created_at: string;
  assertion_type: string | null;
  claimed_amount: string | null;
  claimed_currency: string | null;
  claimed_period: string | null;
  note: string | null;
}

function rowToRecord(row: EvidenceRecordRow): EvidenceRecord {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    hashSha256: row.hash_sha256,
    sizeBytes: parseInt(row.size_bytes, 10) || 0,
    mimeType: row.mime_type ?? undefined,
    externalUri: row.external_uri ?? undefined,
    externalProvider: row.external_provider ?? undefined,
    label: row.label ?? undefined,
    attachedBy: row.attached_by,
    attachedAt: row.attached_at,
    integrityVersion: row.integrity_version,
    storagePath: row.storage_path ?? undefined,
    originalFilename: row.original_filename ?? undefined,
  };
}

function rowToLink(row: EvidenceLinkRow): EvidenceLink {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    evidenceId: row.evidence_id,
    objectType: row.object_type,
    objectId: row.object_id,
    role: row.role ?? undefined,
    requiredness: row.requiredness as 'optional' | 'required',
    createdBy: row.created_by,
    createdAt: row.created_at,
    assertionType: (row.assertion_type as AssertionType) ?? undefined,
    claimedAmount: row.claimed_amount ?? undefined,
    claimedCurrency: row.claimed_currency ?? undefined,
    claimedPeriod: row.claimed_period ?? undefined,
    note: row.note ?? undefined,
  };
}

export async function createEvidenceRecord(
  pool: Pool,
  tenantId: string,
  input: CreateEvidenceRecordInput,
  options?: { id?: string }
): Promise<EvidenceRecord> {
  const id = options?.id ?? randomUUID();
  await pool.query(
    `INSERT INTO evidence_records (
      id, tenant_id, hash_sha256, size_bytes, mime_type, external_uri, external_provider,
      label, attached_by, attached_at, integrity_version, storage_path, original_filename
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), 'v1', $10, $11)`,
    [
      id,
      tenantId,
      input.hashSha256,
      input.sizeBytes,
      input.mimeType ?? null,
      input.externalUri ?? null,
      input.externalProvider ?? null,
      input.label ?? null,
      input.attachedBy,
      input.storagePath ?? null,
      input.originalFilename ?? null,
    ]
  );
  const r = await pool.query<EvidenceRecordRow>(
    `SELECT id, tenant_id, hash_sha256, size_bytes::text, mime_type, external_uri, external_provider,
            label, attached_by, attached_at, integrity_version, storage_path, original_filename
     FROM evidence_records WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return rowToRecord(r.rows[0]);
}

/** Validate claimed_amount is canonical money if present. */
function validateClaimedAmount(claimedAmount?: string): void {
  if (claimedAmount == null || claimedAmount === '') return;
  const n = Number(claimedAmount);
  if (!Number.isFinite(n)) {
    throw new Error('claimed_amount must be a valid canonical money value');
  }
}

export async function linkEvidenceToJournalEntry(
  pool: Pool,
  tenantId: string,
  input: Omit<LinkEvidenceInput, 'objectType'> & { objectType?: 'journal_entry' }
): Promise<EvidenceLink> {
  return linkEvidenceToObject(pool, tenantId, { ...input, objectType: input.objectType ?? 'journal_entry' });
}

/** Link evidence to any supported object (journal_entry, reconciliation). For reconciliation, assertionType defaults to reconciliation. */
export async function linkEvidenceToObject(
  pool: Pool,
  tenantId: string,
  input: LinkEvidenceInput
): Promise<EvidenceLink> {
  const assertionType = input.assertionType ?? (input.objectType === 'reconciliation' ? 'reconciliation' : undefined);
  if (!assertionType) {
    throw new Error('assertionType is required for journal_entry; defaults to reconciliation for reconciliation targets');
  }
  validateClaimedAmount(input.claimedAmount);
  const claimedAmountCanonical =
    input.claimedAmount != null && input.claimedAmount !== '' ? normalizeMoney(input.claimedAmount) : null;

  const id = randomUUID();
  const objectType = input.objectType;
  const requiredness = input.requiredness ?? 'optional';
  await pool.query(
    `INSERT INTO evidence_links (
      id, tenant_id, evidence_id, object_type, object_id, role, requiredness, created_by, created_at,
      assertion_type, claimed_amount, claimed_currency, claimed_period, note
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, NOW(), $9, $10, $11, $12, $13)`,
    [
      id,
      tenantId,
      input.evidenceId,
      objectType,
      input.objectId,
      input.role ?? null,
      requiredness,
      input.createdBy,
      assertionType,
      claimedAmountCanonical,
      input.claimedCurrency ?? null,
      input.claimedPeriod ?? null,
      input.note ?? null,
    ]
  );
  const r = await pool.query<EvidenceLinkRow>(
    `SELECT id, tenant_id, evidence_id, object_type, object_id, role, requiredness, created_by, created_at,
            assertion_type, claimed_amount, claimed_currency, claimed_period, note
     FROM evidence_links WHERE id = $1 AND tenant_id = $2`,
    [id, tenantId]
  );
  return rowToLink(r.rows[0]);
}

function mapRowToLink(
  row: {
    link_id: string;
    link_evidence_id: string;
    link_object_type: string;
    link_object_id: string;
    link_role: string | null;
    link_requiredness: string;
    link_created_by: string;
    link_created_at: string;
    link_assertion_type?: string | null;
    link_claimed_amount?: string | null;
    link_claimed_currency?: string | null;
    link_claimed_period?: string | null;
    link_note?: string | null;
  },
  tenantId: string
): EvidenceLink {
  return {
    id: row.link_id,
    tenantId,
    evidenceId: row.link_evidence_id,
    objectType: row.link_object_type,
    objectId: row.link_object_id,
    role: row.link_role ?? undefined,
    requiredness: row.link_requiredness as 'optional' | 'required',
    createdBy: row.link_created_by,
    createdAt: row.link_created_at,
    assertionType: (row.link_assertion_type as AssertionType) ?? undefined,
    claimedAmount: row.link_claimed_amount ?? undefined,
    claimedCurrency: row.link_claimed_currency ?? undefined,
    claimedPeriod: row.link_claimed_period ?? undefined,
    note: row.link_note ?? undefined,
  };
}

/** Get evidence record by id and tenant. Returns null if not found. */
export async function getEvidenceById(
  pool: Pool,
  tenantId: string,
  evidenceId: string
): Promise<EvidenceRecord | null> {
  const r = await pool.query<EvidenceRecordRow>(
    `SELECT id, tenant_id, hash_sha256, size_bytes::text, mime_type, external_uri, external_provider,
            label, attached_by, attached_at, integrity_version, storage_path, original_filename
     FROM evidence_records WHERE id = $1 AND tenant_id = $2`,
    [evidenceId, tenantId]
  );
  if (r.rows.length === 0) return null;
  return rowToRecord(r.rows[0]);
}

/** Check if evidence is linked to the given journal entry (tenant-scoped). */
export async function isEvidenceLinkedToJournalEntry(
  pool: Pool,
  tenantId: string,
  evidenceId: string,
  journalEntryId: string
): Promise<boolean> {
  const r = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text FROM evidence_links
     WHERE tenant_id = $1 AND evidence_id = $2 AND object_type = 'journal_entry' AND object_id = $3`,
    [tenantId, evidenceId, journalEntryId]
  );
  return parseInt(r.rows[0]?.count ?? '0', 10) > 0;
}

/** List evidence for any object type (journal_entry, reconciliation). */
export async function listEvidenceForObject(
  pool: Pool,
  tenantId: string,
  objectType: import('../../types/evidence.js').EvidenceObjectType,
  objectId: string
): Promise<Array<EvidenceRecord & { link: EvidenceLink }>> {
  const r = await pool.query<
    EvidenceRecordRow & {
      link_id: string;
      link_evidence_id: string;
      link_object_type: string;
      link_object_id: string;
      link_role: string | null;
      link_requiredness: string;
      link_created_by: string;
      link_created_at: string;
      link_assertion_type?: string | null;
      link_claimed_amount?: string | null;
      link_claimed_currency?: string | null;
      link_claimed_period?: string | null;
      link_note?: string | null;
    }
  >(
    `SELECT er.id, er.tenant_id, er.hash_sha256, er.size_bytes::text, er.mime_type, er.external_uri,
            er.external_provider, er.label, er.attached_by, er.attached_at, er.integrity_version,
            er.storage_path, er.original_filename,
            el.id AS link_id, el.evidence_id AS link_evidence_id, el.object_type AS link_object_type,
            el.object_id AS link_object_id, el.role AS link_role, el.requiredness AS link_requiredness,
            el.created_by AS link_created_by, el.created_at AS link_created_at,
            el.assertion_type AS link_assertion_type, el.claimed_amount AS link_claimed_amount,
            el.claimed_currency AS link_claimed_currency, el.claimed_period AS link_claimed_period,
            el.note AS link_note
     FROM evidence_links el
     JOIN evidence_records er ON er.id = el.evidence_id AND er.tenant_id = el.tenant_id
     WHERE el.tenant_id = $1 AND el.object_type = $2 AND el.object_id = $3
     ORDER BY el.created_at`,
    [tenantId, objectType, objectId]
  );
  return r.rows.map((row) => ({
    ...rowToRecord(row),
    link: mapRowToLink(row, tenantId),
  }));
}

/**
 * Batch check: which object IDs (of a given type) have at least one evidence attachment?
 * Returns a Set of object IDs that have evidence.
 */
export async function getObjectIdsWithEvidence(
  pool: Pool,
  tenantId: string,
  objectType: import('../../types/evidence.js').EvidenceObjectType,
  objectIds: string[]
): Promise<Set<string>> {
  if (objectIds.length === 0) return new Set();
  const r = await pool.query<{ object_id: string }>(
    `SELECT DISTINCT el.object_id
     FROM evidence_links el
     WHERE el.tenant_id = $1 AND el.object_type = $2 AND el.object_id = ANY($3)`,
    [tenantId, objectType, objectIds]
  );
  return new Set(r.rows.map((row) => row.object_id));
}

export async function listEvidenceForJournalEntry(
  pool: Pool,
  tenantId: string,
  journalEntryId: string
): Promise<Array<EvidenceRecord & { link: EvidenceLink }>> {
  return listEvidenceForObject(pool, tenantId, 'journal_entry', journalEntryId);
}

export async function listEvidenceForCloseSession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<Array<EvidenceRecord & { link: EvidenceLink }>> {
  const r = await pool.query<
    EvidenceRecordRow & {
      link_id: string;
      link_evidence_id: string;
      link_object_type: string;
      link_object_id: string;
      link_role: string | null;
      link_requiredness: string;
      link_created_by: string;
      link_created_at: string;
      link_assertion_type?: string | null;
      link_claimed_amount?: string | null;
      link_claimed_currency?: string | null;
      link_claimed_period?: string | null;
      link_note?: string | null;
    }
  >(
    `SELECT er.id, er.tenant_id, er.hash_sha256, er.size_bytes::text, er.mime_type, er.external_uri,
            er.external_provider, er.label, er.attached_by, er.attached_at, er.integrity_version,
            er.storage_path, er.original_filename,
            el.id AS link_id, el.evidence_id AS link_evidence_id, el.object_type AS link_object_type,
            el.object_id AS link_object_id, el.role AS link_role, el.requiredness AS link_requiredness,
            el.created_by AS link_created_by, el.created_at AS link_created_at,
            el.assertion_type AS link_assertion_type, el.claimed_amount AS link_claimed_amount,
            el.claimed_currency AS link_claimed_currency, el.claimed_period AS link_claimed_period,
            el.note AS link_note
     FROM evidence_links el
     JOIN evidence_records er ON er.id = el.evidence_id AND er.tenant_id = el.tenant_id
     JOIN journal_entries je ON je.id = el.object_id AND je.tenant_id = el.tenant_id
     WHERE el.tenant_id = $1 AND el.object_type = 'journal_entry' AND je.close_session_id = $2
     ORDER BY el.created_at`,
    [tenantId, closeSessionId]
  );
  return r.rows.map((row) => ({
    ...rowToRecord(row),
    link: mapRowToLink(row, tenantId),
  }));
}

/** List evidence records with storage_path linked to JEs in close sessions for the given period (YYYY-MM). */
export async function listStoredEvidenceForPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<EvidenceRecord[]> {
  const r = await pool.query<EvidenceRecordRow>(
    `SELECT DISTINCT er.id, er.tenant_id, er.hash_sha256, er.size_bytes::text, er.mime_type,
            er.external_uri, er.external_provider, er.label, er.attached_by, er.attached_at,
            er.integrity_version, er.storage_path, er.original_filename
     FROM evidence_records er
     JOIN evidence_links el ON el.evidence_id = er.id AND el.tenant_id = er.tenant_id
     JOIN journal_entries je ON je.id = el.object_id AND je.tenant_id = el.tenant_id
     JOIN close_sessions cs ON cs.id = je.close_session_id AND cs.tenant_id = je.tenant_id
     WHERE er.tenant_id = $1
       AND er.storage_path IS NOT NULL AND er.storage_path != ''
       AND (cs.period_end::text LIKE $2 OR cs.period_start::text LIKE $2)`,
    [tenantId, `${periodLabel}%`]
  );
  return r.rows.map(rowToRecord);
}

/** Returns mapping of journal entry ID -> assertion types of linked evidence. */
export async function listAssertionTypesByJournalEntryForSession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<Map<string, string[]>> {
  const r = await pool.query<{ object_id: string; assertion_type: string | null }>(
    `SELECT el.object_id, el.assertion_type
     FROM evidence_links el
     JOIN journal_entries je ON je.id = el.object_id AND je.tenant_id = el.tenant_id
     WHERE el.tenant_id = $1 AND el.object_type = 'journal_entry' AND je.close_session_id = $2`,
    [tenantId, closeSessionId]
  );
  const map = new Map<string, string[]>();
  for (const row of r.rows) {
    const existing = map.get(row.object_id) ?? [];
    if (row.assertion_type && !existing.includes(row.assertion_type)) {
      existing.push(row.assertion_type);
    }
    map.set(row.object_id, existing);
  }
  return map;
}
