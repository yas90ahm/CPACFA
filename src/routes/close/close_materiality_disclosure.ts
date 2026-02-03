/**
 * Close materiality and disclosure routes: materiality GET/PATCH/suggest, disclosure-checklist.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getMateriality, setMateriality } from '../../services/materiality_service.js';
import { suggestMaterialityAgentic } from '../../services/agentic_materiality_suggestion.js';
import { listDisclosureChecklist, updateDisclosureStep, getDisclosureItem } from '../../services/disclosure_checklist_service.js';
import { suggestDisclosuresAgentic, generateDisclosureReviewSummaryAgentic, suggestEvidenceForDisclosureItemAgentic } from '../../services/agentic_disclosure_suggestions.js';
import type { MaterialitySettings } from '../../types/close_and_controls.js';
import { disclosureSuggestEvidenceSchema, disclosureReviewSummarySchema } from '../../schemas/closeSchemas.js';
import { validateBody } from '../../middleware/validateRequest.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();

router.get('/materiality', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const periodLabel = req.query.periodLabel as string | undefined;
    const settings = getMateriality(tenantId, periodLabel);
    res.json(settings ?? {});
  } catch (e) {
    send500(res, e, 'Get materiality failed');
  }
});

router.patch('/materiality', (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const body = req.body as MaterialitySettings & { periodLabel?: string };
    const { periodLabel, ...settings } = body;
    const updated = setMateriality(tenantId, settings as MaterialitySettings, periodLabel);
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Set materiality failed');
  }
});

router.post('/materiality/suggest', async (req: Request, res: Response) => {
  try {
    const body = req.body as { netIncome?: number; revenue?: number; totalAssets?: number; summary?: string };
    const suggestion = await suggestMaterialityAgentic(body ?? {});
    res.json(suggestion ?? {});
  } catch (e) {
    send500(res, e, 'Materiality suggestion failed');
  }
});

router.post('/disclosure-checklist/suggest', async (req: Request, res: Response) => {
  try {
    const body = req.body as { notesAndSummary?: string };
    const suggestions = await suggestDisclosuresAgentic(body?.notesAndSummary ?? '');
    res.json({ suggestions });
  } catch (e) {
    send500(res, e, 'Disclosure suggestion failed');
  }
});

router.get('/disclosure-checklist', async (req: Request, res: Response) => {
  try {
    const periodLabel = (req.query.periodLabel as string) ?? '';
    const standard = req.query.standard as string | undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const items = await listDisclosureChecklist(periodLabel, standard, tenantId ?? undefined, pool);
    res.json({ periodLabel, standard: standard ?? null, items });
  } catch (e) {
    send500(res, e, 'List disclosure checklist failed');
  }
});

router.post('/disclosure-checklist/review-summary', validateBody(disclosureReviewSummarySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string };
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const items = await listDisclosureChecklist(body.periodLabel, undefined, tenantId ?? undefined, pool);
    const summary = await generateDisclosureReviewSummaryAgentic(items);
    res.json({ summary });
  } catch (e) {
    send500(res, e, 'Disclosure review summary failed');
  }
});

router.post('/disclosure-checklist/:id/suggest-evidence', validateBody(disclosureSuggestEvidenceSchema), async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? '';
    const body = req.body as { periodLabel: string; notesExcerpt?: string };
    if (!id) {
      res.status(400).json({ error: 'Missing disclosure item id' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const item = await getDisclosureItem(id, body.periodLabel, tenantId ?? undefined, pool);
    if (!item) {
      res.status(404).json({ error: 'Disclosure item not found' });
      return;
    }
    const suggestion = await suggestEvidenceForDisclosureItemAgentic(
      { topic: item.topic, standard: item.standard, description: item.description },
      body.notesExcerpt
    );
    res.json({ suggestion });
  } catch (e) {
    send500(res, e, 'Suggest evidence failed');
  }
});

router.patch('/disclosure-checklist/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? '';
    const body = req.body as {
      periodLabel: string;
      status?: 'not_started' | 'in_progress' | 'reviewed' | 'complete';
      evidenceId?: string;
      evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off';
      assignee?: string;
      dueDate?: string;
    };
    if (!id || !body?.periodLabel) {
      res.status(400).json({ error: 'Missing id or periodLabel in body' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const updated = await updateDisclosureStep(
      id,
      body.periodLabel,
      {
        status: body.status,
        evidenceId: body.evidenceId,
        evidenceType: body.evidenceType,
        assignee: body.assignee,
        dueDate: body.dueDate,
      },
      tenantId ?? undefined,
      pool
    );
    if (!updated) {
      res.status(404).json({ error: 'Disclosure item not found' });
      return;
    }
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Update disclosure step failed');
  }
});

export default router;
