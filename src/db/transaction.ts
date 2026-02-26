/**
 * Transaction helper: run a callback within BEGIN/COMMIT/ROLLBACK.
 * Use for multi-step writes that must be atomic (e.g. certify, advance).
 */

import type { Pool, PoolClient } from 'pg';

/**
 * Execute a callback within a database transaction.
 * On success: COMMIT and return the callback result.
 * On failure: ROLLBACK and rethrow.
 */
export async function withTransaction<T>(
  pool: Pool,
  fn: (client: PoolClient) => Promise<T>
): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}
