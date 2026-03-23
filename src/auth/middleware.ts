/**
 * Auth middleware: validate JWT and attach userId, tenantId, role, tenantPool to req.
 */

import type { Pool } from 'pg';
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './index.js';
import { isDbConfigured, getTenantPoolWithMigrations, getTenantAiPoolWithMigrations, isAiBoundaryDbRolesEnabled, createTenantScopedPool } from '../db/index.js';
import { requireTenantContext as configRequireTenantContext } from '../lib/runtime_mode.js';

export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string;
  role?: string;
  tenantPool?: Pool;
  /** AI-scoped pool (ai_writer) when AI_BOUNDARY_DB_ROLES=true; else same as tenantPool. */
  tenantAiPool?: Pool;
}

function extractBearerToken(req: Request): string | undefined {
  const authHeader = req.headers.authorization;
  return authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  // Check HttpOnly cookie first, then fall back to Authorization header
  const token = (req as any).cookies?.cpa_session || extractBearerToken(req);
  if (!token) {
    res.status(401).json({ error: 'Unauthorized', message: 'Missing or invalid Authorization header' });
    return;
  }
  const payload = verifyToken(token);
  if (!payload) {
    res.status(401).json({ error: 'Unauthorized', message: 'Invalid or expired token' });
    return;
  }
  req.userId = payload.userId;
  req.tenantId = payload.tenantId;
  req.role = payload.role;
  if (isDbConfigured() && payload.userId) {
    import('../services/team_service.js').then(({ updateLastActive }) =>
      import('../db/index.js').then(({ getControlPool }) => {
        updateLastActive(getControlPool(), payload.userId!).catch(() => {});
      })
    );
  }
  next();
}

/** Optional auth: if token present, attach user; otherwise continue (for dev without auth). */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  // Check HttpOnly cookie first, then fall back to Authorization header
  const token = (req as any).cookies?.cpa_session || extractBearerToken(req);
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.userId = payload.userId;
      req.tenantId = payload.tenantId;
      req.role = payload.role;
      if (isDbConfigured() && payload.userId) {
        import('../services/team_service.js').then(({ updateLastActive }) =>
          import('../db/index.js').then(({ getControlPool }) => {
            updateLastActive(getControlPool(), payload.userId!).catch(() => {});
          })
        );
      }
    }
  }
  next();
}

/** Attach tenant DB pool for BYOD (run after optionalAuth). Also attaches tenantAiPool when AI_BOUNDARY_DB_ROLES. */
export function attachTenantPool(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!isDbConfigured() || !req.tenantId) {
    next();
    return;
  }
  const loadCore = getTenantPoolWithMigrations(req.tenantId);
  const loadAi = isAiBoundaryDbRolesEnabled()
    ? getTenantAiPoolWithMigrations(req.tenantId)
    : loadCore;
  Promise.all([loadCore, loadAi])
    .then(([pool, aiPool]) => {
      // Wrap pools with tenant-scoped proxies that SET app.current_tenant_id
      // on every connection checkout, enabling Row-Level Security (RLS) policies.
      req.tenantPool = createTenantScopedPool(pool, req.tenantId!);
      req.tenantAiPool = createTenantScopedPool(aiPool, req.tenantId!);
      next();
    })
    .catch(next);
}

/** In prod/staging/demo (or when REQUIRE_TENANT_CONTEXT=true in dev), require tenantId and tenantPool so in-memory fallbacks are not used. */
export function requireTenantContext(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!configRequireTenantContext()) {
    next();
    return;
  }
  if (!req.tenantId || !req.tenantPool) {
    res.status(503).json({
      error: 'Tenant context required',
      message:
        'Configure DATABASE_URL and authenticate with a valid token so the tenant database is attached. In-memory fallbacks are disabled in production.',
    });
    return;
  }
  next();
}
