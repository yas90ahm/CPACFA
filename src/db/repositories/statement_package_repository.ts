/**
 * Statement packages — versioned packages, lines, diffs.
 */

import type { Pool } from 'pg';
import type {
  StatementPackage,
  StatementLine,
  StatementDiffRecord,
  StatementPackageStatus,
  StatementDiffJson,
} from '../../types/statement_package.js';

interface PackageRow {
  id: string;
  close_session_id: string;
  version: number;
  input_hash: string;
  generated_at: string;
  generated_by: string | null;
  status: string;
  engine_version: string | null;
  rule_versions_snapshot: unknown;
}

interface LineRow {
  package_id: string;
  fs_line_id: string;
  amount: string;
  statement: string;
  metadata: unknown;
}

const PKG_COLS = `id, close_session_id, version, input_hash, generated_at, generated_by, status, engine_version, rule_versions_snapshot`;
const LINE_COLS = `package_id, fs_line_id, amount, statement, metadata`;

function rowToPackage(row: PackageRow): StatementPackage {
  return {
    id: row.id,
    closeSessionId: row.close_session_id,
    version: row.version,
    inputHash: row.input_hash,
    generatedAt: row.generated_at,
    generatedBy: row.generated_by ?? undefined,
    status: row.status as StatementPackageStatus,
    engineVersion: row.engine_version ?? undefined,
    ruleVersionsSnapshot: row.rule_versions_snapshot != null && typeof row.rule_versions_snapshot === 'object'
      ? (row.rule_versions_snapshot as Record<string, unknown>)
      : undefined,
  };
}

function rowToLine(row: LineRow): StatementLine {
  return {
    packageId: row.package_id,
    fsLineId: row.fs_line_id,
    amount: Number(row.amount),
    statement: row.statement as 'balance_sheet' | 'profit_and_loss',
    metadata: row.metadata != null && typeof row.metadata === 'object' ? (row.metadata as Record<string, unknown>) : undefined,
  };
}

export async function insertStatementPackage(
  pool: Pool,
  id: string,
  input: {
    closeSessionId: string;
    version: number;
    inputHash: string;
    generatedBy?: string;
    status?: StatementPackageStatus;
    engineVersion?: string;
    ruleVersionsSnapshot?: Record<string, unknown>;
  }
): Promise<StatementPackage> {
  await pool.query(
    `INSERT INTO statement_packages (id, close_session_id, version, input_hash, generated_by, status, engine_version, rule_versions_snapshot)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
    [
      id,
      input.closeSessionId,
      input.version,
      input.inputHash,
      input.generatedBy ?? null,
      input.status ?? 'draft',
      input.engineVersion ?? null,
      input.ruleVersionsSnapshot != null ? JSON.stringify(input.ruleVersionsSnapshot) : null,
    ]
  );
  const r = await pool.query<PackageRow>(`SELECT ${PKG_COLS} FROM statement_packages WHERE id = $1`, [id]);
  return rowToPackage(r.rows[0]);
}

export async function getStatementPackageById(pool: Pool, id: string): Promise<StatementPackage | null> {
  const r = await pool.query<PackageRow>(`SELECT ${PKG_COLS} FROM statement_packages WHERE id = $1`, [id]);
  const row = r.rows[0];
  if (!row) return null;
  return rowToPackage(row);
}

export async function getMaxVersionByCloseSessionId(pool: Pool, closeSessionId: string): Promise<number> {
  const r = await pool.query<{ max: string | null }>(
    `SELECT MAX(version)::text AS max FROM statement_packages WHERE close_session_id = $1`,
    [closeSessionId]
  );
  const max = r.rows[0]?.max;
  if (max == null) return 0;
  const n = parseInt(max, 10);
  return Number.isNaN(n) ? 0 : n;
}

export async function listStatementPackagesByCloseSessionId(
  pool: Pool,
  closeSessionId: string,
  limit?: number
): Promise<StatementPackage[]> {
  let sql = `SELECT ${PKG_COLS} FROM statement_packages WHERE close_session_id = $1 ORDER BY version DESC`;
  const params: unknown[] = [closeSessionId];
  if (limit != null && limit > 0) {
    sql += ` LIMIT $2`;
    params.push(limit);
  }
  const r = await pool.query<PackageRow>(sql, params);
  return r.rows.map(rowToPackage);
}

export async function insertStatementLine(
  pool: Pool,
  input: {
    packageId: string;
    fsLineId: string;
    amount: number;
    statement: 'balance_sheet' | 'profit_and_loss';
    metadata?: Record<string, unknown>;
  }
): Promise<void> {
  await pool.query(
    `INSERT INTO statement_lines (package_id, fs_line_id, amount, statement, metadata)
     VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT (package_id, fs_line_id) DO UPDATE SET amount = $3, statement = $4, metadata = $5`,
    [
      input.packageId,
      input.fsLineId,
      input.amount,
      input.statement,
      input.metadata != null ? JSON.stringify(input.metadata) : null,
    ]
  );
}

export async function listStatementLinesByPackageId(pool: Pool, packageId: string): Promise<StatementLine[]> {
  const r = await pool.query<LineRow>(
    `SELECT ${LINE_COLS} FROM statement_lines WHERE package_id = $1 ORDER BY statement, fs_line_id`,
    [packageId]
  );
  return r.rows.map(rowToLine);
}

export async function upsertStatementDiff(
  pool: Pool,
  fromPackageId: string,
  toPackageId: string,
  diffJson: StatementDiffJson
): Promise<StatementDiffRecord> {
  await pool.query(
    `INSERT INTO statement_diffs (from_package_id, to_package_id, diff_json)
     VALUES ($1, $2, $3)
     ON CONFLICT (from_package_id, to_package_id) DO UPDATE SET diff_json = $3`,
    [fromPackageId, toPackageId, JSON.stringify(diffJson)]
  );
  const r = await pool.query<{ from_package_id: string; to_package_id: string; diff_json: unknown; created_at: string }>(
    `SELECT from_package_id, to_package_id, diff_json, created_at FROM statement_diffs WHERE from_package_id = $1 AND to_package_id = $2`,
    [fromPackageId, toPackageId]
  );
  const row = r.rows[0];
  return {
    fromPackageId: row.from_package_id,
    toPackageId: row.to_package_id,
    diffJson: row.diff_json as StatementDiffJson,
    createdAt: row.created_at,
  };
}

export async function getStatementDiff(
  pool: Pool,
  fromPackageId: string,
  toPackageId: string
): Promise<StatementDiffRecord | null> {
  const r = await pool.query<{ from_package_id: string; to_package_id: string; diff_json: unknown; created_at: string }>(
    `SELECT from_package_id, to_package_id, diff_json, created_at FROM statement_diffs WHERE from_package_id = $1 AND to_package_id = $2`,
    [fromPackageId, toPackageId]
  );
  const row = r.rows[0];
  if (!row) return null;
  return {
    fromPackageId: row.from_package_id,
    toPackageId: row.to_package_id,
    diffJson: row.diff_json as StatementDiffJson,
    createdAt: row.created_at,
  };
}
