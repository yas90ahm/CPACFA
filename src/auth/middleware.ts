/**
 * Auth middleware: validate JWT and attach userId, tenantId, role, tenantPool to req.
 */

import type { Pool } from 'pg';
import { Request, Response, NextFunction } from 'express';
import { verifyToken } from './index.js';
import { isDbConfigured, getTenantPoolWithMigrations } from '../db/index.js';
import { requireTenantContext as configRequireTenantContext } from '../lib/runtime_mode.js';

export interface AuthRequest extends Request {
  userId?: string;
  tenantId?: string;
  role?: string;
  tenantPool?: Pool;
}

export function requireAuth(req: AuthRequest, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
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
  next();
}

/** Optional auth: if token present, attach user; otherwise continue (for dev without auth). */
export function optionalAuth(req: AuthRequest, _res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization;
  const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined;
  if (token) {
    const payload = verifyToken(token);
    if (payload) {
      req.userId = payload.userId;
      req.tenantId = payload.tenantId;
      req.role = payload.role;
    }
  }
  next();
}

/** Attach tenant DB pool for BYOD (run after optionalAuth). */
export function attachTenantPool(req: AuthRequest, res: Response, next: NextFunction): void {
  if (!isDbConfigured() || !req.tenantId) {
    next();
    return;
  }
  getTenantPoolWithMigrations(req.tenantId)
    .then((pool) => {
      req.tenantPool = pool;
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
