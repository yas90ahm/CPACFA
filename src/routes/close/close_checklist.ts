/**
 * Close checklist routes: checklist POST/GET/PATCH, checklist-templates, checklist-sign-off.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { createCloseChecklist } from '../../services/month_end_close_service.js';
import { getChecklist, setChecklist, updateStepEvidence } from '../../services/checklist_store_service.js';
import {
  listTemplatesForTenant,
  getTemplateForTenant,
  upsertTemplateForTenant,
  createChecklistFromTemplate,
} from '../../services/close_checklist_template_service.js';
import { createChecklistSchema } from '../../schemas/closeSchemas.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { send500 } from '../../lib/errorHandler.js';
import { appendAuditLog } from '../../services/audit_log_service.js';

const router = Router();

/** POST /api/close/checklist */
router.post('/checklist', validateBody(createChecklistSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const periodLabel = body.periodLabel ?? 'Current';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const options = { assignee: body.assignee, dueDate: body.dueDate };
    const periodType = periodLabel.toLowerCase().startsWith('q') || periodLabel.toLowerCase().includes('quarter') ? 'quarterly' as const : periodLabel.toLowerCase().includes('fy') || periodLabel.toLowerCase().includes('annual') ? 'annual' as const : 'monthly' as const;
    const steps = tenantId && pool
      ? await createChecklistFromTemplate(tenantId, periodLabel, periodType, options, pool)
      : createCloseChecklist(periodLabel, options);
    const stored = await setChecklist(periodLabel, steps, tenantId ?? undefined, pool);
    res.json({ periodLabel, steps: stored });
  } catch (e) {
    send500(res, e, 'Checklist failed');
  }
});

/** GET /api/close/checklist/:periodLabel */
router.get('/checklist/:periodLabel', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel ?? '';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const steps = await getChecklist(periodLabel, undefined, tenantId ?? undefined, pool);
    res.json({ periodLabel, steps });
  } catch (e) {
    send500(res, e, 'Get checklist failed');
  }
});

/** PATCH /api/close/checklist/:periodLabel/step/:stepId */
router.patch('/checklist/:periodLabel/step/:stepId', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel ?? '';
    const stepId = req.params.stepId ?? '';
    const body = req.body as {
      evidenceId?: string;
      evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off';
      dueDate?: string;
      assignee?: string;
    };
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const updated = await updateStepEvidence(periodLabel, stepId, {
      evidenceId: body.evidenceId,
      evidenceType: body.evidenceType,
      dueDate: body.dueDate,
      assignee: body.assignee,
    }, tenantId ?? undefined, pool);
    if (!updated) {
      res.status(404).json({ error: 'Checklist or step not found' });
      return;
    }
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Update step evidence failed');
  }
});

/** GET /api/close/checklist-templates */
router.get('/checklist-templates', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodType = req.query.periodType as 'monthly' | 'quarterly' | 'annual' | undefined;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (periodType) {
      const template = await getTemplateForTenant(tenantId, periodType, pool);
      res.json({ templates: template ? [template] : [] });
    } else {
      const templates = await listTemplatesForTenant(tenantId, pool);
      res.json({ templates });
    }
  } catch (e) {
    send500(res, e, 'List checklist templates failed');
  }
});

/** POST /api/close/checklist-templates */
router.post('/checklist-templates', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body as { periodType: 'monthly' | 'quarterly' | 'annual'; name?: string; stepsSpec: { label: string; controlId?: string; dueOffsetDays?: number; assignee?: string }[] };
    if (!tenantId || !pool || !body?.periodType || !Array.isArray(body?.stepsSpec)) {
      res.status(400).json({ error: 'Missing tenant context, periodType, or stepsSpec array' });
      return;
    }
    const template = await upsertTemplateForTenant(tenantId, body.periodType, { name: body.name, stepsSpec: body.stepsSpec }, pool);
    if (!template) {
      res.status(500).json({ error: 'Upsert template failed (DB not configured?)' });
      return;
    }
    res.status(201).json(template);
  } catch (e) {
    send500(res, e, 'Upsert checklist template failed');
  }
});

/** PATCH /api/close/checklist-templates/:periodType */
router.patch('/checklist-templates/:periodType', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const periodType = req.params.periodType as 'monthly' | 'quarterly' | 'annual';
    const body = req.body as { name?: string; stepsSpec?: { label: string; controlId?: string; dueOffsetDays?: number; assignee?: string }[] };
    if (!tenantId || !pool || !periodType || !['monthly', 'quarterly', 'annual'].includes(periodType)) {
      res.status(400).json({ error: 'Missing tenant context or invalid periodType' });
      return;
    }
    if (!body?.stepsSpec && body?.name === undefined) {
      res.status(400).json({ error: 'Provide name or stepsSpec to update' });
      return;
    }
    const existing = await getTemplateForTenant(tenantId, periodType, pool);
    const stepsSpec = body.stepsSpec ?? existing?.stepsSpec ?? [];
    const name = body.name ?? existing?.name ?? 'Default';
    const template = await upsertTemplateForTenant(tenantId, periodType, { name, stepsSpec }, pool);
    if (!template) {
      res.status(500).json({ error: 'Update template failed (DB not configured?)' });
      return;
    }
    res.json(template);
  } catch (e) {
    send500(res, e, 'Update checklist template failed');
  }
});

/** POST /api/close/checklist-sign-off */
router.post('/checklist-sign-off', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      periodLabel: string;
      stepId: string;
      signedOffBy: string;
      steps: import('../../types/close_and_controls.js').CloseChecklistStep[];
    };
    if (!body?.stepId || !body?.signedOffBy || !Array.isArray(body?.steps)) {
      res.status(400).json({ error: 'Missing stepId, signedOffBy, or steps array' });
      return;
    }
    const now = new Date().toISOString();
    const steps = body.steps.map((s) =>
      s.id === body.stepId
        ? {
            ...s,
            status: 'completed' as const,
            completedAt: now,
            completedBy: body.signedOffBy,
            signedOffBy: body.signedOffBy,
            signedOffAt: now,
          }
        : s
    );
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    await setChecklist(body.periodLabel, steps, tenantId ?? undefined, pool);
    const auditContext = pool && tenantId ? { pool, tenantId } : undefined;
    appendAuditLog(
      { action: 'close_checklist_complete', resource: `checklist:${body.periodLabel}:${body.stepId}`, actor: body.signedOffBy, detail: 'signed off' },
      auditContext
    );
    res.json({ periodLabel: body.periodLabel, stepId: body.stepId, steps, signedOffAt: now });
  } catch (e) {
    send500(res, e, 'Checklist sign-off failed');
  }
});

export default router;
