import type { RequestHandler } from 'express';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { normalizeAccountingStandard } from '../constants/accounting/presentation_references.js';
import type { AccountingStandard } from '../constants/accounting/standards_registry.js';
import { getTenantId, getTenantPool } from './tenant_context.js';

/**
 * Fail closed when a session-scoped calculator has not been implemented for
 * the close's reporting framework. Recording source schedules may remain
 * framework-neutral; recognition and measurement engines may not.
 */
export function requireSessionAccountingFramework(
  allowed: readonly AccountingStandard[],
  capabilityName: string
): RequestHandler {
  return async (req, res, next) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      const sessionId = req.params.sessionId;
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required.' });
        return;
      }
      if (!sessionId) {
        res.status(400).json({ error: 'Close session ID required.' });
        return;
      }
      const session = await getCloseSessionById(pool, tenantId, sessionId);
      if (!session) {
        res.status(404).json({ error: 'Close session not found.' });
        return;
      }
      const standard = normalizeAccountingStandard(session.standard);
      if (!allowed.includes(standard)) {
        res.status(409).json({
          error: `${capabilityName} is not implemented for ${standard}; use the approved runbook and a reviewer-supported workpaper instead.`,
          code: 'FRAMEWORK_CAPABILITY_MISMATCH',
          accountingStandard: standard,
          supportedStandards: allowed,
        });
        return;
      }
      next();
    } catch {
      res.status(500).json({
        error: 'Unable to verify the close session accounting framework.',
        code: 'FRAMEWORK_VERIFICATION_FAILED',
      });
    }
  };
}
