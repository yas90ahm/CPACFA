/**
 * Settings Team API: list members, invite, change role, deactivate, reactivate.
 * Mounted at /api/settings/team.
 * Uses control pool for user table; tenant pool for audit ledger.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { getControlPool } from '../db/index.js';
import { send500 } from '../lib/errorHandler.js';
import * as teamService from '../services/team_service.js';
import { recordAuditLogAction } from '../services/audit_service.js';
import type { AuthRequest } from '../auth/middleware.js';

const router = Router();

function getAuthReq(req: Request): AuthRequest {
  return req as AuthRequest;
}

/** GET /api/settings/team — list team members */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const controlPool = getControlPool();
    const members = await teamService.listTeamMembers(controlPool, tenantId);
    const roles = [...teamService.VALID_ROLES];
    res.json({
      members: members.map((m) => ({
        id: m.id,
        name: m.name,
        email: m.email,
        role: m.role,
        status: m.status,
        lastActiveAt: m.last_active_at,
        invitedAt: m.invited_at,
        createdAt: m.created_at,
      })),
      roles,
    });
  } catch (e) {
    send500(res, e, 'List team failed');
  }
});

/** POST /api/settings/team/invite — invite a new user */
router.post('/invite', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const authReq = getAuthReq(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!teamService.canInvite(authReq.role)) {
      res.status(403).json({ error: 'Only admins and certifiers can invite team members' });
      return;
    }
    const body = req.body as { email?: string; name?: string; role?: string };
    const { email, name, role } = body;
    if (!email || !role) {
      res.status(400).json({ error: 'email and role are required' });
      return;
    }
    const controlPool = getControlPool();
    const result = await teamService.inviteUser(
      controlPool,
      tenantId,
      authReq.userId ?? 'api',
      email,
      (name ?? email).toString(),
      role
    );
    await recordAuditLogAction(pool, tenantId, {
      actor: authReq.userId ?? 'api',
      action: 'user_invited',
      resource: result.id,
      payload: { email: result.email, name: result.name, role: result.role },
    });
    res.status(201).json({
      user: {
        id: result.id,
        name: result.name,
        email: result.email,
        role: result.role,
        status: result.status,
        invitedAt: result.invited_at,
      },
      invitationLink: `/accept-invite?token=${result.invitationToken}`,
    });
  } catch (e) {
    if (e instanceof Error && e.message.includes('already exists')) {
      res.status(400).json({ error: e.message });
      return;
    }
    if (e instanceof Error && e.message.includes('deactivated')) {
      res.status(400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Invite failed');
  }
});

/** PUT /api/settings/team/:userId/role — change a user's role */
router.put('/:userId/role', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const authReq = getAuthReq(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!teamService.canManageTeam(authReq.role)) {
      res.status(403).json({ error: 'Only admins can change roles' });
      return;
    }
    const userId = req.params.userId ?? '';
    const body = req.body as { role?: string };
    if (!body?.role) {
      res.status(400).json({ error: 'role is required' });
      return;
    }
    const controlPool = getControlPool();
    const result = await teamService.changeUserRole(
      controlPool,
      tenantId,
      userId,
      body.role,
      authReq.userId ?? 'api'
    );
    await recordAuditLogAction(pool, tenantId, {
      actor: authReq.userId ?? 'api',
      action: 'user_role_changed',
      resource: userId,
      payload: { beforeState: { role: result.oldRole }, afterState: { role: result.newRole } },
    });
    res.json(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('Cannot change your own') || e.message.includes('User not found') || e.message.includes('deactivated') || e.message.includes('last certifier')) {
        res.status(400).json({ error: e.message });
        return;
      }
    }
    send500(res, e, 'Change role failed');
  }
});

/** PUT /api/settings/team/:userId/deactivate */
router.put('/:userId/deactivate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const authReq = getAuthReq(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!teamService.canManageTeam(authReq.role)) {
      res.status(403).json({ error: 'Only admins can deactivate users' });
      return;
    }
    const userId = req.params.userId ?? '';
    const controlPool = getControlPool();
    const result = await teamService.deactivateUser(
      controlPool,
      tenantId,
      userId,
      authReq.userId ?? 'api'
    );
    await recordAuditLogAction(pool, tenantId, {
      actor: authReq.userId ?? 'api',
      action: 'user_deactivated',
      resource: userId,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('Cannot deactivate your own') || e.message.includes('User not found') || e.message.includes('already deactivated') || e.message.includes('last admin')) {
        res.status(400).json({ error: e.message });
        return;
      }
    }
    send500(res, e, 'Deactivate failed');
  }
});

/** PUT /api/settings/team/:userId/reactivate */
router.put('/:userId/reactivate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const authReq = getAuthReq(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!teamService.canManageTeam(authReq.role)) {
      res.status(403).json({ error: 'Only admins can reactivate users' });
      return;
    }
    const userId = req.params.userId ?? '';
    const controlPool = getControlPool();
    const result = await teamService.reactivateUser(controlPool, tenantId, userId);
    await recordAuditLogAction(pool, tenantId, {
      actor: authReq.userId ?? 'api',
      action: 'user_reactivated',
      resource: userId,
    });
    res.json(result);
  } catch (e) {
    if (e instanceof Error && e.message.includes('not found')) {
      res.status(404).json({ error: e.message });
      return;
    }
    send500(res, e, 'Reactivate failed');
  }
});

/** DELETE /api/settings/team/:userId — soft delete (deactivate) */
router.delete('/:userId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const authReq = getAuthReq(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!teamService.canManageTeam(authReq.role)) {
      res.status(403).json({ error: 'Only admins can remove users' });
      return;
    }
    const userId = req.params.userId ?? '';
    const controlPool = getControlPool();
    const result = await teamService.deactivateUser(
      controlPool,
      tenantId,
      userId,
      authReq.userId ?? 'api'
    );
    res.json(result);
  } catch (e) {
    if (e instanceof Error) {
      if (e.message.includes('Cannot deactivate your own') || e.message.includes('User not found') || e.message.includes('already deactivated') || e.message.includes('last admin')) {
        res.status(400).json({ error: e.message });
        return;
      }
    }
    send500(res, e, 'Remove user failed');
  }
});

export default router;
