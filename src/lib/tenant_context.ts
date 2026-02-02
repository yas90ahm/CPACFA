/**
 * Centralized tenant context: read tenantId and tenantPool from request.
 * Set by auth middleware (optionalAuth/requireAuth + attachTenantPool).
 */

import type { Request } from 'express';
import type { Pool } from 'pg';
import type { AuthRequest } from '../auth/middleware.js';

export function getTenantId(req: Request): string | undefined {
  return (req as AuthRequest).tenantId;
}

export function getTenantPool(req: Request): Pool | undefined {
  return (req as AuthRequest).tenantPool;
}
