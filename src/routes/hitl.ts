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
import { parseTrialBalance } from '../services/trialBalanceParser.js';
import { getRoundingTolerance } from '../services/rules_registry.js';
import { absGt } from '../utils/decimal.js';
import { saveUnadjustedFromUpload } from '../services/trial_balance_store_service.js';
import { appendAuditLog } from '../services/audit_log_service.js';
import * as persistence from '../services/persistence_service.js';
import type { JournalEntryProposal } from '../services/agentic_gap_analyzer.js';
import type { AuthRequest } from '../auth/middleware.js';
import type { TrialBalanceEntry } from '../types/financial.js';

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
      const result = await receiveHumanApproval({ id: body.id, signedBy: body.signedBy }, pool && tenantId ? { pool, tenantId } : undefined);
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
      const result = await receiveHumanRejection({ id: body.id, rejectionReason: body.reason ?? 'No reason provided' }, pool && tenantId ? { pool, tenantId } : undefined);
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

/** POST /api/hitl/resolve-ingest — Apply adjustment to staged imbalanced upload; re-verify math; save to period_trial_balance. */
router.post(
  '/resolve-ingest',
  asyncHandler(async (req: Request, res: Response) => {
    const body = req.body as { stagedId: string; adjustment: JournalEntryProposal[] };
    if (!body?.stagedId || !Array.isArray(body.adjustment)) {
      res.status(400).json({ error: 'stagedId and adjustment (array) required' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context (pool, tenantId) required for resolve-ingest' });
      return;
    }
    const item = await getStagingItem(body.stagedId, { pool, tenantId });
    if (!item) {
      res.status(404).json({ error: 'Staging item not found' });
      return;
    }
    const payload = item.payload as Record<string, unknown> | undefined;
    if (payload?.kind !== 'trial_balance_ingest') {
      res.status(400).json({ error: 'Staging item is not a trial_balance_ingest; use /resolve for approve/reject' });
      return;
    }
    const rawRows = payload.rawRows as Array<{ accountName: string; debit?: number; credit?: number }> | undefined;
    const periodLabel = payload.periodLabel as string | undefined;
    const fileName = (payload.fileName as string) ?? 'upload.csv';
    const originalImbalance = (payload.imbalanceAmount as number) ?? 0;
    if (!rawRows || !Array.isArray(rawRows) || !periodLabel) {
      res.status(400).json({ error: 'Staging payload missing rawRows or periodLabel' });
      return;
    }

    const base = parseTrialBalance(rawRows);
    const adjustmentEntries: TrialBalanceEntry[] = body.adjustment.map((p) => ({
      accountName: p.accountName,
      debit: p.debit ?? 0,
      credit: p.credit ?? 0,
    }));
    const combinedEntries = [...base.entries, ...adjustmentEntries];
    const totalDebits = combinedEntries.reduce((s, e) => s + (e.debit ?? 0), 0);
    const totalCredits = combinedEntries.reduce((s, e) => s + (e.credit ?? 0), 0);
    const tolerance = getRoundingTolerance();
    if (absGt(totalDebits, totalCredits, tolerance)) {
      res.status(422).json({
        error: 'MathematicalIntegrityError',
        message: 'Adjustment still does not balance. Sum(Debits) != Sum(Credits).',
        totalDebits,
        totalCredits,
        imbalanceAmount: Math.abs(totalDebits - totalCredits),
      });
      return;
    }

    const authReq = req as AuthRequest;
    await saveUnadjustedFromUpload(
      tenantId,
      periodLabel,
      combinedEntries,
      { uploadedBy: authReq.userId, fileName },
      pool
    );

    appendAuditLog(
      {
        action: 'hitl_ingest_fix',
        resource: `staged:${body.stagedId}`,
        detail: JSON.stringify({
          originalImbalance,
          adjustmentApplied: body.adjustment,
          periodLabel,
          totalDebits,
          totalCredits,
        }),
        actor: authReq.userId ?? 'anonymous',
      },
      { pool, tenantId }
    );

    await persistence.updateStagingStatus(pool, tenantId, body.stagedId, {
      status: 'approved',
      approvedBy: authReq.userId ?? undefined,
    });

    res.json({
      ok: true,
      periodLabel,
      message: 'Staged data fixed and saved to period_trial_balance.',
    });
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
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const item = await getStagingItem(req.params.id, pool && tenantId ? { pool, tenantId } : undefined);
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
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const result = await handleApprovalWebhook(body, pool && tenantId ? { pool, tenantId } : undefined);
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
