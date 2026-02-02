/**
 * Custom data catalog entries — tenant-scoped.
 */

import type { Pool } from 'pg';
import type { DataCatalogEntry, DataCatalogDatasetType } from '../../types/data_catalog.js';

function nextId(): string {
  return `cat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

export interface DataCatalogRow {
  id: string;
  tenant_id: string;
  name: string;
  type: string;
  schema: unknown;
  created_at: string;
  updated_at: string;
}

function rowToEntry(row: DataCatalogRow): DataCatalogEntry {
  const schema = Array.isArray(row.schema)
    ? (row.schema as { name: string; type: string }[])
    : [];
  return {
    id: row.id,
    name: row.name,
    type: row.type as DataCatalogDatasetType,
    schema,
  };
}

export async function listCustom(
  pool: Pool,
  tenantId: string
): Promise<DataCatalogEntry[]> {
  const r = await pool.query<DataCatalogRow>(
    'SELECT id, tenant_id, name, type, schema, created_at, updated_at FROM data_catalog WHERE tenant_id = $1 ORDER BY name',
    [tenantId]
  );
  return r.rows.map(rowToEntry);
}

export async function getById(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<DataCatalogEntry | null> {
  const r = await pool.query<DataCatalogRow>(
    'SELECT id, tenant_id, name, type, schema, created_at, updated_at FROM data_catalog WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  const row = r.rows[0];
  return row ? rowToEntry(row) : null;
}

export async function create(
  pool: Pool,
  tenantId: string,
  entry: { name: string; type: DataCatalogDatasetType; schema?: { name: string; type: string }[] }
): Promise<DataCatalogEntry> {
  const id = nextId();
  const now = new Date().toISOString();
  const schema = entry.schema ?? [];
  await pool.query(
    `INSERT INTO data_catalog (id, tenant_id, name, type, schema, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [id, tenantId, entry.name, entry.type, JSON.stringify(schema), now, now]
  );
  return { id, name: entry.name, type: entry.type, schema };
}

export async function update(
  pool: Pool,
  id: string,
  tenantId: string,
  update: { name?: string; type?: DataCatalogDatasetType; schema?: { name: string; type: string }[] }
): Promise<DataCatalogEntry | null> {
  const existing = await getById(pool, id, tenantId);
  if (!existing) return null;
  const now = new Date().toISOString();
  const name = update.name ?? existing.name;
  const type = (update.type ?? existing.type) as string;
  const schema = update.schema ?? existing.schema;
  await pool.query(
    'UPDATE data_catalog SET name = $1, type = $2, schema = $3, updated_at = $4 WHERE id = $5 AND tenant_id = $6',
    [name, type, JSON.stringify(schema), now, id, tenantId]
  );
  return { id, name, type: type as DataCatalogDatasetType, schema };
}

export async function remove(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<boolean> {
  const r = await pool.query(
    'DELETE FROM data_catalog WHERE id = $1 AND tenant_id = $2',
    [id, tenantId]
  );
  return (r.rowCount ?? 0) > 0;
}
