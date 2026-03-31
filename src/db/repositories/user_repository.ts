/**
 * Users — DB repository (for auth).
 */

import { queryControl } from '../index.js';

export interface UserRow {
  id: string;
  tenant_id: string;
  email: string;
  password_hash: string | null;
  role: string;
  name: string | null;
  created_at: string;
  updated_at: string;
}

export async function getUserByEmail(tenantId: string, email: string): Promise<UserRow | null> {
  const r = await queryControl<UserRow>(
    'SELECT id, tenant_id, email, password_hash, role, name, created_at, updated_at FROM users WHERE tenant_id = $1 AND email = $2',
    [tenantId, email]
  );
  return r.rows[0] ?? null;
}

/**
 * Find user by email (first match). Use when tenantId is not provided (e.g. wedge login).
 * Intentional: No tenant_id filter for wedge login.
 */
export async function getUserByEmailOnly(email: string): Promise<UserRow | null> {
  const r = await queryControl<UserRow>(
    'SELECT id, tenant_id, email, password_hash, role, name, created_at, updated_at FROM users WHERE email = $1 LIMIT 1',
    [email]
  );
  return r.rows[0] ?? null;
}

export async function getUserById(id: string, tenantId?: string): Promise<UserRow | null> {
  if (tenantId != null) {
    const r = await queryControl<UserRow>(
      'SELECT id, tenant_id, email, password_hash, role, name, created_at, updated_at FROM users WHERE id = $1 AND tenant_id = $2',
      [id, tenantId]
    );
    return r.rows[0] ?? null;
  }
  const r = await queryControl<UserRow>(
    'SELECT id, tenant_id, email, password_hash, role, name, created_at, updated_at FROM users WHERE id = $1',
    [id]
  );
  return r.rows[0] ?? null;
}

export async function createUser(
  tenantId: string,
  email: string,
  passwordHash: string,
  role: string = 'controller',
  name?: string
): Promise<UserRow> {
  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  await queryControl(
    'INSERT INTO users (id, tenant_id, email, password_hash, role, name, created_at, updated_at) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)',
    [id, tenantId, email, passwordHash, role, name ?? null, now, now]
  );
  const row = await getUserById(id, tenantId);
  if (!row) throw new Error('Failed to create user');
  return row;
}
