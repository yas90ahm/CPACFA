/**
 * Evidence policy routes — tenant-level GET/PUT.
 * Default when no policy: enforcement_mode = 'off'.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import {
  getEvidencePolicy,
  upsertEvidencePolicy,
} from '../../db/repositories/evidence_policy_repository.js';
import type { AuthRequest } from '../../auth/middleware.js';
import { getCloseRoleFromReq } from '../../lib/closeRole.js';

const router = Router();
const VALID_MODES = ['off', 'warn_only', 'hard_block'];

/** GET /api/close/evidence-policy — get tenant evidence policy (null = off) */
router.get('/evidence-policy', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const policy = await getEvidencePolicy(pool, tenantId);
    if (!policy) {
      res.json({ enforcementMode: 'off', materialityThreshold: null, requiredAssertionTypes: null });
      return;
    }
    res.json(policy);
  } catch (e) {
    send500(res, e, 'Get evidence policy failed');
  }
});

/** PUT /api/close/evidence-policy — upsert tenant evidence policy (requires approver role) */
router.put('/evidence-policy', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const role = getCloseRoleFromReq(req as AuthRequest);
    if (role !== 'approver') {
      res.status(403).json({ error: 'Insufficient permissions to update evidence policy. Approver role required.' });
      return;
    }
    const body = req.body as {
      enforcementMode?: string;
      materialityThreshold?: string;
      requiredAssertionTypes?: Record<string, string[]>;
    };
    const mode = body?.enforcementMode ?? 'off';
    if (!VALID_MODES.includes(mode)) {
      res.status(400).json({ error: `enforcementMode must be one of: ${VALID_MODES.join(', ')}` });
      return;
    }
    const policy = await upsertEvidencePolicy(pool, {
      tenantId,
      enforcementMode: mode as 'off' | 'warn_only' | 'hard_block',
      materialityThreshold: body.materialityThreshold,
      requiredAssertionTypes: body.requiredAssertionTypes,
    });
    res.json(policy);
  } catch (e) {
    send500(res, e, 'Upsert evidence policy failed');
  }
});

export default router;
