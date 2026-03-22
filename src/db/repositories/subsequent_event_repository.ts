/**
 * Repository: subsequent_events table CRUD.
 */
import { randomUUID } from 'crypto';
import type { Pool } from 'pg';
import type {
  SubsequentEvent,
  SubsequentEventDisposition,
  CreateSubsequentEventInput,
  UpdateSubsequentEventInput,
} from '../../types/subsequent_event.js';

interface SubsequentEventRow {
  id: string;
  tenant_id: string;
  close_session_id: string;
  event_date: string | Date;
  description: string;
  impact_assessment: string | null;
  disposition: string | null;
  reviewed_by: string | null;
  reviewed_at: string | Date | null;
  created_by: string;
  created_at: string | Date;
  updated_at: string | Date;
}

function rowToEvent(row: SubsequentEventRow): SubsequentEvent {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    closeSessionId: row.close_session_id,
    eventDate: typeof row.event_date === 'string' ? row.event_date.slice(0, 10) : (row.event_date as Date).toISOString().slice(0, 10),
    description: row.description,
    impactAssessment: row.impact_assessment,
    disposition: row.disposition as SubsequentEventDisposition | null,
    reviewedBy: row.reviewed_by,
    reviewedAt: row.reviewed_at != null
      ? (typeof row.reviewed_at === 'string' ? row.reviewed_at : (row.reviewed_at as Date).toISOString())
      : null,
    createdBy: row.created_by,
    createdAt: typeof row.created_at === 'string' ? row.created_at : (row.created_at as Date).toISOString(),
    updatedAt: typeof row.updated_at === 'string' ? row.updated_at : (row.updated_at as Date).toISOString(),
  };
}

export async function createSubsequentEvent(
  pool: Pool,
  input: CreateSubsequentEventInput
): Promise<SubsequentEvent> {
  const id = randomUUID();
  const now = new Date().toISOString();
  await pool.query(
    `INSERT INTO subsequent_events (id, tenant_id, close_session_id, event_date, description, impact_assessment, created_by, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
    [id, input.tenantId, input.closeSessionId, input.eventDate, input.description, input.impactAssessment ?? null, input.createdBy, now]
  );
  const r = await pool.query<SubsequentEventRow>(
    'SELECT * FROM subsequent_events WHERE id = $1 AND tenant_id = $2',
    [id, input.tenantId]
  );
  return rowToEvent(r.rows[0]);
}

export async function listBySession(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<SubsequentEvent[]> {
  const r = await pool.query<SubsequentEventRow>(
    'SELECT * FROM subsequent_events WHERE tenant_id = $1 AND close_session_id = $2 ORDER BY event_date, created_at',
    [tenantId, closeSessionId]
  );
  return r.rows.map(rowToEvent);
}

export async function getById(
  pool: Pool,
  tenantId: string,
  id: string
): Promise<SubsequentEvent | null> {
  const r = await pool.query<SubsequentEventRow>(
    'SELECT * FROM subsequent_events WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return r.rows[0] ? rowToEvent(r.rows[0]) : null;
}

export async function updateDisposition(
  pool: Pool,
  tenantId: string,
  id: string,
  input: UpdateSubsequentEventInput
): Promise<SubsequentEvent | null> {
  const now = new Date().toISOString();
  const r = await pool.query(
    `UPDATE subsequent_events
     SET disposition = $1, impact_assessment = COALESCE($2, impact_assessment),
         reviewed_by = $3, reviewed_at = $4, updated_at = $4
     WHERE id = $5 AND tenant_id = $6`,
    [input.disposition, input.impactAssessment ?? null, input.reviewedBy, now, id, tenantId]
  );
  if (r.rowCount === 0) return null;
  return getById(pool, tenantId, id);
}
