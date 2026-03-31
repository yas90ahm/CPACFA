/**
 * Team Management Service
 *
 * Manages users within a tenant: list, invite, role changes, deactivation.
 * Uses control pool (users table lives in control DB).
 * Works with existing auth and segregation_service for role enforcement.
 */

import type { Pool } from 'pg';
import { randomBytes } from 'crypto';

/** Roles valid for team members (persona-based). */
export const VALID_ROLES = [
  'controller',
  'senior_accountant',
  'cfo',
  'reviewer',
  'internal_auditor',
  'pe_operating_partner',
  'external_auditor',
  'system_admin',
] as const;

export type TeamMemberRole = (typeof VALID_ROLES)[number];

/** Roles that can invite others (system_admin, controller, and cfo). */
const ROLES_CAN_INVITE: string[] = ['system_admin', 'controller', 'cfo'];

/** Roles that can change roles and deactivate (system_admin only). */
const ROLES_CAN_MANAGE_TEAM: string[] = ['system_admin'];

export interface TeamMember {
  id: string;
  name: string | null;
  email: string;
  role: string;
  status: string;
  last_active_at: string | null;
  invited_at: string | null;
  created_at: string;
}

export async function listTeamMembers(pool: Pool, tenantId: string): Promise<TeamMember[]> {
  const r = await pool.query<{
    id: string;
    name: string | null;
    email: string;
    role: string;
    status: string;
    last_active_at: string | null;
    invited_at: string | null;
    created_at: string;
  }>(
    `SELECT id, COALESCE(name, email) AS name, email, role, status,
            last_active_at, invited_at, created_at
     FROM users
     WHERE tenant_id = $1
     ORDER BY
       CASE status WHEN 'active' THEN 1 WHEN 'invited' THEN 2 WHEN 'deactivated' THEN 3 END,
       COALESCE(name, email)`
  ,
    [tenantId]
  );
  return r.rows.map((row) => ({
    id: row.id,
    name: row.name,
    email: row.email,
    role: row.role,
    status: row.status,
    last_active_at: row.last_active_at,
    invited_at: row.invited_at,
    created_at: row.created_at,
  }));
}

function generateInvitationToken(): string {
  return randomBytes(32).toString('hex');
}

export interface InviteResult {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  invited_at: string;
  invitationToken: string;
}

export async function inviteUser(
  pool: Pool,
  tenantId: string,
  invitedBy: string,
  email: string,
  name: string,
  role: string
): Promise<InviteResult> {
  if (!VALID_ROLES.includes(role as TeamMemberRole)) {
    throw new Error(`Invalid role: ${role}. Valid roles: ${VALID_ROLES.join(', ')}`);
  }

  const emailNorm = email.toLowerCase().trim();
  const nameTrim = name.trim();

  const existing = await pool.query<{ id: string; status: string }>(
    'SELECT id, status FROM users WHERE email = $1 AND tenant_id = $2',
    [emailNorm, tenantId]
  );

  if (existing.rows[0]) {
    if (existing.rows[0].status === 'deactivated') {
      throw new Error('This email belongs to a deactivated user. Reactivate them instead of re-inviting.');
    }
    throw new Error('A user with this email already exists for this organization.');
  }

  const id = `user-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
  const now = new Date().toISOString();
  const invitationToken = generateInvitationToken();

  await pool.query(
    `INSERT INTO users (
      id, tenant_id, name, email, password_hash, role, status,
      invited_by, invited_at, created_at, updated_at
    ) VALUES ($1, $2, $3, $4, NULL, $5, 'invited', $6, $7, $8, $9)`,
    [id, tenantId, nameTrim || emailNorm, emailNorm, role, invitedBy, now, now, now]
  );

  await pool.query('UPDATE users SET invitation_token = $1 WHERE id = $2', [invitationToken, id]);

  return {
    id,
    name: nameTrim || emailNorm,
    email: emailNorm,
    role,
    status: 'invited',
    invited_at: now,
    invitationToken,
  };
}

export async function changeUserRole(
  pool: Pool,
  tenantId: string,
  userId: string,
  newRole: string,
  changedBy: string
): Promise<{ userId: string; oldRole: string; newRole: string }> {
  if (!VALID_ROLES.includes(newRole as TeamMemberRole)) {
    throw new Error(`Invalid role: ${newRole}. Valid roles: ${VALID_ROLES.join(', ')}`);
  }

  if (userId === changedBy) {
    throw new Error('Cannot change your own role.');
  }

  const user = await pool.query<{ id: string; role: string; status: string }>(
    'SELECT id, role, status FROM users WHERE id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );

  if (!user.rows[0]) throw new Error('User not found');
  if (user.rows[0].status === 'deactivated') {
    throw new Error('Cannot change role of deactivated user');
  }

  const oldRole = user.rows[0].role;

  if (oldRole === 'cfo' && newRole !== 'cfo') {
    const cfoCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text FROM users
       WHERE tenant_id = $1 AND role = 'cfo' AND status = 'active'`,
      [tenantId]
    );
    if (parseInt(cfoCount.rows[0].count, 10) <= 1) {
      throw new Error('Cannot remove the last CFO. At least one CFO is required.');
    }
  }

  await pool.query(
    'UPDATE users SET role = $1, updated_at = NOW() WHERE id = $2 AND tenant_id = $3',
    [newRole, userId, tenantId]
  );

  return { userId, oldRole, newRole };
}

export async function deactivateUser(
  pool: Pool,
  tenantId: string,
  userId: string,
  deactivatedBy: string
): Promise<{ userId: string; status: string }> {
  if (userId === deactivatedBy) {
    throw new Error('Cannot deactivate your own account.');
  }

  const user = await pool.query<{ id: string; role: string; status: string }>(
    'SELECT id, role, status FROM users WHERE id = $1 AND tenant_id = $2',
    [userId, tenantId]
  );

  if (!user.rows[0]) throw new Error('User not found');
  if (user.rows[0].status === 'deactivated') throw new Error('User is already deactivated');

  if (user.rows[0].role === 'system_admin') {
    const adminCount = await pool.query<{ count: string }>(
      `SELECT COUNT(*)::text FROM users
       WHERE tenant_id = $1 AND role = 'system_admin' AND status = 'active'`,
      [tenantId]
    );
    if (parseInt(adminCount.rows[0].count, 10) <= 1) {
      throw new Error('Cannot deactivate the last system admin.');
    }
  }

  await pool.query(
    `UPDATE users SET status = 'deactivated', deactivated_at = NOW(), updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2`,
    [userId, tenantId]
  );

  return { userId, status: 'deactivated' };
}

export async function reactivateUser(
  pool: Pool,
  tenantId: string,
  userId: string
): Promise<{ userId: string; status: string }> {
  const r = await pool.query(
    `UPDATE users SET status = 'active', deactivated_at = NULL, updated_at = NOW()
     WHERE id = $1 AND tenant_id = $2 AND status = 'deactivated'
     RETURNING id`,
    [userId, tenantId]
  );
  if (r.rowCount === 0) throw new Error('User not found or not deactivated');
  return { userId, status: 'active' };
}

/** Call on authenticated requests to update last_active_at (fire-and-forget). */
export async function updateLastActive(pool: Pool, userId: string): Promise<void> {
  await pool.query('UPDATE users SET last_active_at = NOW() WHERE id = $1', [userId]);
}

export function canInvite(role: string | undefined): boolean {
  return ROLES_CAN_INVITE.includes(role ?? '');
}

export function canManageTeam(role: string | undefined): boolean {
  return ROLES_CAN_MANAGE_TEAM.includes(role ?? '');
}
