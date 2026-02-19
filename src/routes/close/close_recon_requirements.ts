/**
 * Recon requirements API: which accounts require reconciliation per entity.
 * GET/POST /recon-requirements, PUT/DELETE /recon-requirements/:id, POST /recon-requirements/auto-generate
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import * as reqRepo from '../../db/repositories/recon_requirements_repository.js';
import { randomUUID } from 'crypto';
import type { ReconExpectedSource, ReconToleranceType } from '../../types/period_reconciliation.js';
import { autoGenerateReconRequirements } from '../../services/recon_requirements_auto_generate.js';

const router = Router();

/** GET /api/close/recon-requirements?entity_id=X */
router.get('/recon-requirements', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const entityId = (req.query as { entity_id?: string }).entity_id;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!entityId) {
      res.status(400).json({ error: 'entity_id query required' });
      return;
    }
    const list = await reqRepo.listRequirements(pool, tenantId, entityId);
    res.json({ requirements: list });
  } catch (e) {
    send500(res, e, 'List recon requirements failed');
  }
});

/** POST /api/close/recon-requirements */
router.post('/recon-requirements', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body as {
      entity_id?: string;
      account_code?: string;
      account_name?: string;
      is_required?: boolean;
      tolerance_amount?: number;
      tolerance_type?: ReconToleranceType;
      tolerance_percentage?: number | null;
      expected_source?: ReconExpectedSource;
      requires_reviewer_approval?: boolean;
    };
    if (!tenantId || !pool || !body?.entity_id || !body?.account_code) {
      res.status(400).json({ error: 'Tenant context, entity_id, and account_code required' });
      return;
    }
    const id = randomUUID();
    const created = await reqRepo.insertRequirement(pool, id, {
      tenantId,
      entityId: body.entity_id,
      accountCode: body.account_code,
      accountName: body.account_name ?? null,
      isRequired: body.is_required ?? true,
      toleranceAmount: body.tolerance_amount ?? 0,
      toleranceType: body.tolerance_type ?? 'absolute',
      tolerancePercentage: body.tolerance_percentage ?? null,
      expectedSource: body.expected_source ?? 'other',
      requiresReviewerApproval: body.requires_reviewer_approval ?? false,
      createdBy: (req as { userId?: string }).userId ?? null,
    });
    res.status(201).json(created);
  } catch (e) {
    send500(res, e, 'Create recon requirement failed');
  }
});

/** PUT /api/close/recon-requirements/:id */
router.put('/recon-requirements/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    const body = req.body as {
      account_name?: string;
      is_required?: boolean;
      tolerance_amount?: number;
      tolerance_type?: ReconToleranceType;
      tolerance_percentage?: number | null;
      expected_source?: ReconExpectedSource;
      requires_reviewer_approval?: boolean;
    };
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and id required' });
      return;
    }
    const updated = await reqRepo.updateRequirement(pool, tenantId, id, {
      accountName: body.account_name,
      isRequired: body.is_required,
      toleranceAmount: body.tolerance_amount,
      toleranceType: body.tolerance_type,
      tolerancePercentage: body.tolerance_percentage,
      expectedSource: body.expected_source,
      requiresReviewerApproval: body.requires_reviewer_approval,
    });
    if (!updated) {
      res.status(404).json({ error: 'Requirement not found' });
      return;
    }
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Update recon requirement failed');
  }
});

/** DELETE /api/close/recon-requirements/:id */
router.delete('/recon-requirements/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id ?? '';
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and id required' });
      return;
    }
    const deleted = await reqRepo.deleteRequirement(pool, tenantId, id);
    if (!deleted) {
      res.status(404).json({ error: 'Requirement not found' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    send500(res, e, 'Delete recon requirement failed');
  }
});

/** POST /api/close/recon-requirements/auto-generate — body: entity_id, materiality_threshold */
router.post('/recon-requirements/auto-generate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body as { entity_id?: string; materiality_threshold?: number };
    if (!tenantId || !pool || !body?.entity_id) {
      res.status(400).json({ error: 'Tenant context and entity_id required' });
      return;
    }
    const threshold = body.materiality_threshold ?? 0;
    const created = await autoGenerateReconRequirements(pool, tenantId, body.entity_id, threshold);
    res.status(201).json({ requirements: created });
  } catch (e) {
    send500(res, e, 'Auto-generate recon requirements failed');
  }
});

export default router;
