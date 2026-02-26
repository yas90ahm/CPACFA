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

/** AI-scoped pool for AI writes (ai_call_log, tenant_ai_proposals, HITL staging). Falls back to tenantPool when no separation. */
export function getTenantAiPool(req: Request): Pool | undefined {
  const authReq = req as AuthRequest;
  return authReq.tenantAiPool ?? authReq.tenantPool;
}
