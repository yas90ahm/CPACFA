/**
 * HITL (Human-in-the-Loop) API — High-Value Escalation.
 * Staging Area (proposed action + justification), approval webhook (HumanApproved), feedback loop (Context Memory).
 */

import { Router, type Request, type Response } from 'express';
import { asyncHandler } from '../lib/asyncHandler.js';
import {
  getThresholds,
  setThresholds,
  shouldEscalateToHuman,
  submitToStaging,
  getStagingArea,
  getStagingItem,
  handleApprovalWebhook,
  receiveHumanApproval,
  receiveHumanRejection,
  getContextMemory,
  type StagingItemType,
} from '../services/hitl_orchestrator.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { recordOverride } from '../services/audit_ledger_service.js';

const router = Router();

const OVERRIDE_TYPES: StagingItemType[] = ['policy_change', 'flag_override'];

/** POST /api/hitl/resolve — In-app approve/reject with reason (FW4). Overrides (policy_change, flag_override) append to audit ledger. */
router.post(
  '/resolve',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { id: string; action: 'approve' | 'reject'; reason?: string; signedBy?: string };
    if (!body?.id || !body?.action) {
      res.status(400).json({ error: 'Missing id or action (approve | reject)' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const item = await getStagingItem(body.id, pool ? { pool } : undefined);
    const isOverride = item && OVERRIDE_TYPES.includes(item.type);

    if (body.action === 'approve') {
      if (isOverride && tenantId && pool) {
        const rationale = (body.reason ?? 'Approved').trim() || 'Approved';
        await recordOverride(pool, {
          tenantId,
          eventType: 'staging_approval',
          deterministicFlagSnapshot: {
            stagingId: item!.id,
            type: item!.type,
            proposedAction: item!.proposedAction,
            justification: item!.justification,
            payload: item!.payload,
          },
          agentDissentSnapshot: { justification: item!.justification },
          userPromptRationale: rationale,
          createdBy: body.signedBy,
        });
      }
      const result = await receiveHumanApproval({ id: body.id, signedBy: body.signedBy }, pool ? { pool } : undefined);
      if (!result.ok) {
        res.status(result.error === 'Staging item not found' ? 404 : 400).json({ error: result.error });
        return;
      }
      res.json({ ok: true, item: result.item });
      return;
    }
    if (body.action === 'reject') {
      if (isOverride && tenantId && pool) {
        const rationale = (body.reason ?? 'No reason provided').trim() || 'Rejected';
        await recordOverride(pool, {
          tenantId,
          eventType: 'staging_rejection',
          deterministicFlagSnapshot: {
            stagingId: item!.id,
            type: item!.type,
            proposedAction: item!.proposedAction,
            justification: item!.justification,
            payload: item!.payload,
          },
          agentDissentSnapshot: { justification: item!.justification },
          userPromptRationale: rationale,
          createdBy: body.signedBy,
        });
      }
      const result = await receiveHumanRejection({ id: body.id, rejectionReason: body.reason ?? 'No reason provided' }, pool ? { pool } : undefined);
      if (!result.ok) {
        res.status(result.error === 'Staging item not found' ? 404 : 400).json({ error: result.error });
        return;
      }
      res.json({ ok: true, item: result.item });
      return;
    }
    res.status(400).json({ error: 'action must be approve or reject' });
  })
);

/** GET /api/hitl/thresholds — Current escalation thresholds */
router.get(
  '/thresholds',
  asyncHandler(async (_req: Request, res: Response) => {
    const t = getThresholds();
    res.json({ amountThreshold: t.amountThreshold, criticalPolicyChangeRequiresApproval: t.criticalPolicyChangeRequiresApproval });
  })
);

/** POST /api/hitl/thresholds — Set thresholds (e.g. amountThreshold: 10000) */
router.post(
  '/thresholds',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { amountThreshold?: number; criticalPolicyChangeRequiresApproval?: boolean };
    setThresholds(body);
    const t = getThresholds();
    res.json({ ok: true, amountThreshold: t.amountThreshold, criticalPolicyChangeRequiresApproval: t.criticalPolicyChangeRequiresApproval });
  })
);

/** POST /api/hitl/check-escalation — Check if action must be escalated (amount, isCriticalAccountingPolicyChange) */
router.post(
  '/check-escalation',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { amount?: number; isCriticalAccountingPolicyChange?: boolean };
    const escalate = shouldEscalateToHuman(body);
    res.json({ escalate, ...body });
  })
);

/** POST /api/hitl/staging — Submit proposed action to Staging Area (bot presents Proposed Action + Justification) */
router.post(
  '/staging',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      proposedAction: string;
      justification: string;
      type?: StagingItemType;
      amount?: number;
      payload?: Record<string, unknown>;
    };
    if (!body.proposedAction || !body.justification) {
      res.status(400).json({ error: 'proposedAction and justification required' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const opts = pool && tenantId ? { pool, tenantId } : undefined;
    const item = await Promise.resolve(
      submitToStaging(
        {
          proposedAction: body.proposedAction,
          justification: body.justification,
          type: body.type,
          amount: body.amount,
          payload: body.payload,
        },
        opts
      )
    );
    res.status(201).json({ ok: true, item });
  })
);

/** GET /api/hitl/staging — Staging Area (list items for UI: Proposed Action, Justification, status Pending/Approved/Rejected) */
router.get(
  '/staging',
  asyncHandler(async (req: Request, res: Response) => {
    const status = req.query.status as 'pending' | 'approved' | 'rejected' | undefined;
    const limit = req.query.limit != null ? Math.min(500, Math.max(1, Number(req.query.limit))) : 100;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const items = await getStagingArea({ status, limit, ...(pool && tenantId ? { pool, tenantId } : {}) });
    res.json({ items, count: items.length });
  })
);

/** GET /api/hitl/staging/:id — Get one staging item */
router.get(
  '/staging/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const pool = getTenantPool(req);
    const item = await getStagingItem(req.params.id, pool ? { pool } : undefined);
    if (!item) {
      res.status(404).json({ error: 'Staging item not found' });
      return;
    }
    res.json(item);
  })
);

/** POST /api/hitl/webhook — Approval flow: webhook returns HumanApproved or HumanRejected. Bot remains Pending until HumanApproved. Stage 3: rejectionReason required when HumanRejected (stored in context memory for feedback loop). */
router.post(
  '/webhook',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as {
      id: string;
      signal: 'HumanApproved' | 'HumanRejected';
      signedBy?: string;
      signatureToken?: string;
      /** Required when signal is HumanRejected — stored in context memory so AI avoids same mistake. */
      rejectionReason?: string;
    };
    if (!body.id || !body.signal) {
      res.status(400).json({ error: 'id and signal (HumanApproved | HumanRejected) required' });
      return;
    }
    if (body.signal === 'HumanRejected' && !body.rejectionReason?.trim()) {
      res.status(400).json({ error: 'rejectionReason required when signal is HumanRejected (feedback loop: Why?)' });
      return;
    }
    const pool = getTenantPool(req);
    const result = await handleApprovalWebhook(body, pool ? { pool } : undefined);
    if (!result.ok) {
      res.status(result.error === 'Staging item not found' ? 404 : 400).json({ ok: false, error: result.error });
      return;
    }
    res.json({ ok: true, item: result.item });
  })
);

/** GET /api/hitl/context-memory — Feedback loop: past rejection reasons so AI can avoid same mistake twice */
router.get(
  '/context-memory',
  asyncHandler(async (req: Request, res: Response) => {
    const limit = req.query.limit != null ? Math.min(500, Math.max(1, Number(req.query.limit))) : 100;
    const feedback = getContextMemory({ limit });
    res.json({ feedback, count: feedback.length });
  })
);

export default router;
