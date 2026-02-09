/**
 * Approval workflows and requests API.
 */

import { Router, type Request, type Response } from 'express';
import { send500 } from '../lib/errorHandler.js';
import {
  createWorkflowDef,
  getWorkflowForResourceType,
  listWorkflowsForTenant,
} from '../services/approval_workflow_service.js';
import {
  createRequest,
  getRequest,
  getRequestByResource,
  listRequests,
  approveOrReject,
} from '../services/approval_request_service.js';
import { generateApprovalSummaryAgentic } from '../services/agentic_approval_summary.js';
import { updateAdjustmentStatus } from '../services/close_adjustments_service.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { validateBody, validateParams } from '../middleware/validationMiddleware.js';
import {
  createWorkflowBodySchema,
  submitApprovalBodySchema,
  approveRejectBodySchema,
  requestIdParamSchema,
} from '../schemas/approvalSchemas.js';

const router = Router();

/** GET /api/approvals/workflows — List workflows */
router.get('/workflows', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.json({ workflows: [] });
      return;
    }
    const workflows = await listWorkflowsForTenant(pool, tenantId);
    res.json({ workflows });
  } catch (e) {
    send500(res, e, 'List approval workflows failed');
  }
});

/** POST /api/approvals/workflows — Create workflow (body: name, resourceType, steps: [{ order, requiredRole, namedApprover? }]) */
router.post('/workflows', validateBody(createWorkflowBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const body = req.body;
    const workflow = await createWorkflowDef(pool, tenantId, {
      tenantId,
      name: body.name,
      resourceType: body.resourceType,
    }, body.steps);
    res.status(201).json(workflow);
  } catch (e) {
    send500(res, e, 'Create approval workflow failed');
  }
});

/** POST /api/approvals/submit — Submit resource for approval (creates approval request) */
router.post('/submit', validateBody(submitApprovalBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const body = req.body;
    const workflow = await getWorkflowForResourceType(pool, tenantId, body.resourceType);
    if (!workflow) {
      res.status(403).json({
        error: 'No approval workflow for this resource type',
        code: 'WORKFLOW_NOT_CONFIGURED',
        message: 'Approval workflow is not configured for this resource type. Create a workflow first.',
      });
      return;
    }
    const existing = await getRequestByResource(pool, tenantId, body.resourceType, body.resourceId);
    if (existing && existing.status === 'pending') {
      res.json({ request: existing, approvalRequestId: existing.id, message: 'Already pending approval' });
      return;
    }
    const request = await createRequest(
      pool,
      tenantId,
      workflow.id,
      body.resourceType,
      body.resourceId
    );
    res.status(201).json({ ...request, approvalRequestId: request.id });
  } catch (e) {
    send500(res, e, 'Submit for approval failed');
  }
});

/** GET /api/approvals/requests — List requests (optional resourceType, resourceId, status) */
router.get('/requests', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.json({ requests: [] });
      return;
    }
    const resourceType = req.query.resourceType as string | undefined;
    const resourceId = req.query.resourceId as string | undefined;
    const status = req.query.status as import('../types/approval_workflow.js').ApprovalRequestStatus | undefined;
    const list = await listRequests(pool, tenantId, { resourceType, resourceId, status });
    res.json({ requests: list });
  } catch (e) {
    send500(res, e, 'List approval requests failed');
  }
});

/** GET /api/approvals/requests/:id — Get request; ?summarize=true for agentic summary (requires resource payload) */
router.get('/requests/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const request = await getRequest(pool, req.params.id, tenantId);
    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    const summarize = req.query.summarize === 'true' || req.query.summarize === '1';
    if (summarize && request.resourceType === 'close_adjustment') {
      const { getAdjustment } = await import('../services/close_adjustments_service.js');
      const adj = await getAdjustment(pool, request.resourceId, tenantId);
      if (adj) {
        const summary = await generateApprovalSummaryAgentic(adj);
        res.json({ ...request, summary });
        return;
      }
    }
    res.json(request);
  } catch (e) {
    send500(res, e, 'Get approval request failed');
  }
});

/** GET /api/approvals/requests/:id/summary — Agentic approval summary (for close_adjustment, fetches adjustment) */
router.get('/requests/:id/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const request = await getRequest(pool, req.params.id, tenantId);
    if (!request) {
      res.status(404).json({ error: 'Request not found' });
      return;
    }
    if (request.resourceType === 'close_adjustment') {
      const { getAdjustment } = await import('../services/close_adjustments_service.js');
      const adj = await getAdjustment(pool, request.resourceId, tenantId);
      if (adj) {
        const summary = await generateApprovalSummaryAgentic(adj);
        res.json({ summary });
        return;
      }
    }
    res.json({ summary: `Approval request for ${request.resourceType} ${request.resourceId}.` });
  } catch (e) {
    send500(res, e, 'Approval summary failed');
  }
});

/** PATCH /api/approvals/requests/:id — Approve or reject (body: action: 'approved' | 'rejected', actor?, comment?) */
router.patch('/requests/:id', validateParams(requestIdParamSchema), validateBody(approveRejectBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const body = req.body;
    const actor = body.actor ?? (req as Request & { userId?: string }).userId ?? 'unknown';
    const result = await approveOrReject(pool, req.params.id, tenantId, actor, body.action, body.comment);
    if (!result) {
      res.status(404).json({ error: 'Request not found or not pending' });
      return;
    }
    if (result.workflowComplete && result.request.resourceType === 'close_adjustment') {
      await updateAdjustmentStatus(
        result.request.resourceId,
        'approved',
        actor,
        tenantId,
        pool
      );
    }
    res.json(result);
  } catch (e) {
    send500(res, e, 'Approve/reject failed');
  }
});

export default router;
