/**
 * General Ledger repository — CRUD for uploaded journal entries.
 * GL stores all journal entries per tenant+period; aggregated to derive Trial Balance.
 */

import type { Pool } from 'pg';
import type { GeneralLedgerLine, JournalEntry } from '../../types/general_ledger.js';

interface GLLineRow {
  id: string;
  tenant_id: string;
  period_label: string;
  entry_id: string;
  line_number: number;
  entry_date: string;
  account_code: string;
  account_name: string | null;
  debit: string;
  credit: string;
  description: string | null;
  amount_provenance: string | null;
  source: string;
  created_at: string;
  created_by: string | null;
}

function rowToLine(row: GLLineRow): GeneralLedgerLine {
  return {
    id: row.id,
    tenant_id: row.tenant_id,
    period_label: row.period_label,
    entry_id: row.entry_id,
    line_number: row.line_number,
    entry_date: row.entry_date,
    account_code: row.account_code,
    account_name: row.account_name ?? undefined,
    debit: Number(row.debit ?? '0'),
    credit: Number(row.credit ?? '0'),
    description: row.description ?? undefined,
    amount_provenance: row.amount_provenance ?? undefined,
    source: row.source,
    created_at: row.created_at,
    created_by: row.created_by ?? undefined,
  };
}

const GL_BATCH_SIZE = 1000;

/**
 * Replace GL for a period (delete existing, insert new).
 * Uses transaction for atomicity. Batch inserts for performance (10x-50x faster).
 */
export async function upsertGLForPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  lines: GeneralLedgerLine[],
  options?: { createdBy?: string }
): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    await client.query(
      'DELETE FROM core.general_ledger WHERE tenant_id = $1 AND period_label = $2',
      [tenantId, periodLabel]
    );

    if (lines.length > 0) {
      const createdBy = options?.createdBy ?? null;
      const source = 'upload';

      for (let i = 0; i < lines.length; i += GL_BATCH_SIZE) {
        const batch = lines.slice(i, i + GL_BATCH_SIZE);
        const valuesClauses: string[] = [];
        const params: unknown[] = [];

        batch.forEach((line, idx) => {
          const debit = String(line.debit ?? 0);
          const credit = String(line.credit ?? 0);
          const desc = line.description?.trim() || null;
          const prov = line.amount_provenance?.trim() || null;
          const entryDate =
            line.entry_date instanceof Date
              ? line.entry_date.toISOString().slice(0, 10)
              : String(line.entry_date ?? '').slice(0, 10);

          const acctName = line.account_name?.trim() || null;
          const offset = idx * 13;
          valuesClauses.push(
            `($${offset + 1}, $${offset + 2}, $${offset + 3}, $${offset + 4}, $${offset + 5}, $${offset + 6}, $${offset + 7}, $${offset + 8}, $${offset + 9}, $${offset + 10}, $${offset + 11}, $${offset + 12}, $${offset + 13})`
          );
          params.push(
            tenantId,
            periodLabel,
            line.entry_id,
            line.line_number,
            entryDate,
            line.account_code,
            acctName,
            debit,
            credit,
            desc,
            prov,
            source,
            createdBy
          );
        });

        await client.query(
          `INSERT INTO core.general_ledger (
            tenant_id, period_label, entry_id, line_number, entry_date,
            account_code, account_name, debit, credit, description, amount_provenance, source, created_by
          ) VALUES ${valuesClauses.join(', ')}`,
          params
        );
      }
    }

    await client.query('COMMIT');
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

/**
 * Get all GL lines for a tenant+period.
 */
export async function getGLForPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<GeneralLedgerLine[]> {
  const r = await pool.query<GLLineRow>(
    `SELECT id, tenant_id, period_label, entry_id, line_number, entry_date::text,
            account_code, account_name, debit::text, credit::text, description, amount_provenance,
            source, created_at::text, created_by
     FROM core.general_ledger
     WHERE tenant_id = $1 AND period_label = $2
     ORDER BY entry_id, line_number`,
    [tenantId, periodLabel]
  );
  return r.rows.map(rowToLine);
}

/**
 * Get GL lines for a specific entry_id.
 */
export async function getGLEntry(
  pool: Pool,
  tenantId: string,
  periodLabel: string,
  entryId: string
): Promise<GeneralLedgerLine[]> {
  const r = await pool.query<GLLineRow>(
    `SELECT id, tenant_id, period_label, entry_id, line_number, entry_date::text,
            account_code, account_name, debit::text, credit::text, description, amount_provenance,
            source, created_at::text, created_by
     FROM core.general_ledger
     WHERE tenant_id = $1 AND period_label = $2 AND entry_id = $3
     ORDER BY line_number`,
    [tenantId, periodLabel, entryId]
  );
  return r.rows.map(rowToLine);
}

/**
 * Get all unique entry_ids for a period.
 */
export async function getEntryIds(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<string[]> {
  const r = await pool.query<{ entry_id: string }>(
    `SELECT DISTINCT entry_id FROM core.general_ledger
     WHERE tenant_id = $1 AND period_label = $2
     ORDER BY entry_id`,
    [tenantId, periodLabel]
  );
  return r.rows.map((row) => row.entry_id);
}

/**
 * Delete all GL for a period.
 */
export async function deleteGLForPeriod(
  pool: Pool,
  tenantId: string,
  periodLabel: string
): Promise<void> {
  await pool.query(
    'DELETE FROM core.general_ledger WHERE tenant_id = $1 AND period_label = $2',
    [tenantId, periodLabel]
  );
}

/**
 * Group GL lines by entry_id into JournalEntry objects.
 */
export function groupLinesByEntry(lines: GeneralLedgerLine[]): JournalEntry[] {
  const entriesMap = new Map<string, GeneralLedgerLine[]>();

  for (const line of lines) {
    const arr = entriesMap.get(line.entry_id) ?? [];
    arr.push(line);
    entriesMap.set(line.entry_id, arr);
  }

  const entries: JournalEntry[] = [];
  entriesMap.forEach((entryLines, entryId) => {
    const sorted = [...entryLines].sort((a, b) => a.line_number - b.line_number);
    entries.push({
      entry_id: entryId,
      entry_date: sorted[0]!.entry_date,
      description: sorted[0]!.description,
      lines: sorted,
    });
  });

  return entries;
}
