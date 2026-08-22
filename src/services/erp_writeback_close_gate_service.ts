import type { Pool, PoolClient } from 'pg';

type Queryable = Pool | PoolClient;

export interface UnresolvedErpWriteback {
  journalEntryId: string;
  status: 'missing' | 'pending' | 'posting' | 'failed' | 'reconciliation_required' | 'cancelled';
}

export interface ErpWritebackCloseGate {
  enabled: boolean;
  unresolved: UnresolvedErpWriteback[];
}

/**
 * A close cannot treat an internal JE status as proof of an external posting.
 * When approved writeback is enabled, every approved/postable JE needs a
 * conclusive posted receipt from the configured ERP gateway.
 */
export async function evaluateErpWritebackCloseGate(
  db: Queryable,
  tenantId: string,
  entityId: string,
  closeSessionId: string
): Promise<ErpWritebackCloseGate> {
  const config = await db.query<{ approved_erp_writeback_enabled: boolean }>(
    `SELECT approved_erp_writeback_enabled
     FROM tenant_close_calendar_config
     WHERE tenant_id = $1 AND entity_id = $2`,
    [tenantId, entityId]
  );
  if (config.rows[0]?.approved_erp_writeback_enabled !== true) {
    return { enabled: false, unresolved: [] };
  }

  const result = await db.query<{ id: string; writeback_status: UnresolvedErpWriteback['status'] }>(
    `SELECT je.id, COALESCE(w.status, 'missing') AS writeback_status
     FROM journal_entries je
     LEFT JOIN journal_entry_erp_writebacks w
       ON w.journal_entry_id = je.id AND w.tenant_id = je.tenant_id
     WHERE je.tenant_id = $1
       AND je.close_session_id = $2
       AND je.status IN ('approved', 'posted', 'exported')
       AND (w.status IS NULL OR w.status <> 'posted')
     ORDER BY je.created_at, je.id`,
    [tenantId, closeSessionId]
  );
  return {
    enabled: true,
    unresolved: result.rows.map((row) => ({
      journalEntryId: row.id,
      status: row.writeback_status,
    })),
  };
}

export function summarizeUnresolvedErpWritebacks(
  unresolved: UnresolvedErpWriteback[]
): string {
  const counts = unresolved.reduce<Record<string, number>>((byStatus, item) => {
    byStatus[item.status] = (byStatus[item.status] ?? 0) + 1;
    return byStatus;
  }, {});
  return Object.entries(counts)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([status, count]) => `${status}: ${count}`)
    .join(', ');
}
