/**
 * Month-end close API — JE suggestions, checklist, period lock, audit log, segregation.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  buildJournalEntrySuggestions,
  createCloseChecklist,
} from '../services/month_end_close_service.js';
import {
  lockPeriod,
  isPeriodLocked,
  getPeriodLock,
  listLockedPeriods,
  assertPeriodNotLocked,
  PeriodLockedError,
} from '../services/period_lock_service.js';
import {
  setCloseDueDate,
  getPeriodEntry,
  listPeriods,
} from '../services/close_calendar_service.js';
import {
  getCloseCalendarConfig,
  setCloseCalendarConfig,
} from '../services/close_calendar_config_service.js';
import {
  addJEAsAdjustments,
  addAccrualsAsAdjustments,
  listAdjustments,
  updateAdjustmentStatus,
  getAdjustment,
} from '../services/close_adjustments_service.js';
import { pushAdjustmentToGL } from '../services/push_close_to_gl_service.js';
import { listConnections } from '../services/accounting_integration_service.js';
import { appendAuditLog, queryAuditLog, purgeRetention } from '../services/audit_log_service.js';
import {
  canPerform,
  performControlledAction,
  type ControlledAction,
} from '../services/segregation_service.js';
import type { CloseRole } from '../types/close_and_controls.js';
import type { DataGap } from '../agents/cpa_brain.js';
import type { ReconciliationMismatch } from '../types/orchestrator.js';
import { buildAccrualSuggestions, suggestAccrualsAgentic } from '../services/accrual_deferral_service.js';
import { computeInventoryValuation } from '../services/inventory_valuation_service.js';
import { explainJESuggestionsAgentic, suggestJEsFromTextAgentic } from '../services/agentic_je_suggestions.js';
import {
  createReconciliationResolution,
  listReconciliationResolutions,
  updateReconciliationResolution,
  type CreateReconciliationResolutionInput,
} from '../services/reconciliation_resolution_service.js';
import {
  getChecklist,
  setChecklist,
  updateStepEvidence,
} from '../services/checklist_store_service.js';
import {
  listTemplatesForTenant,
  getTemplateForTenant,
  upsertTemplateForTenant,
  createChecklistFromTemplate,
} from '../services/close_checklist_template_service.js';
import {
  getOrCreatePeriodClose,
  setPeriodCloseStatus,
  setReviewerSignOff,
} from '../services/period_close_service.js';
import { buildCloseReadiness } from '../services/close_readiness_service.js';
import { buildCloseStatus } from '../services/close_status_service.js';
import { buildCloseOnePager, exportCloseOnePagerToPdf } from '../services/close_one_pager_service.js';
import { getCloseExceptions } from '../services/close_exceptions_service.js';
import { generateCloseExceptionsNarrativeAgentic } from '../services/agentic_close_exceptions.js';
import { buildReconciliationTieOut } from '../services/reconciliation_tie_out_service.js';
import { generateTieOutNarrativeAgentic } from '../services/agentic_tie_out_narrative.js';
import { buildClosePackage } from '../services/close_package_service.js';
import { exportClosePackageToPdf, exportClosePackageToCsv } from '../services/close_package_export_service.js';
import { generateCloseNarrativeAgentic } from '../services/agentic_close_narrative.js';
import {
  addControl,
  listControls,
  getControl,
  updateControl,
  linkEvidenceToControl,
  listControlEvidenceForPeriod,
  listControlEvidenceForControl,
  listAssertionsForControl,
  addAssertionToControl,
  removeAssertion,
  suggestAssertionsForControl,
} from '../services/close_controls_service.js';
import { getMateriality, setMateriality } from '../services/materiality_service.js';
import {
  listDisclosureChecklist,
  updateDisclosureStep,
} from '../services/disclosure_checklist_service.js';
import { suggestMaterialityAgentic } from '../services/agentic_materiality_suggestion.js';
import { suggestDisclosuresAgentic } from '../services/agentic_disclosure_suggestions.js';
import type { JournalEntrySuggestion, MaterialitySettings } from '../types/close_and_controls.js';
import { periodLockBodySchema, accrualSuggestionsSchema, inventoryValuationSchema, jeSuggestionsSchema, jeExplainSchema, jeFromTextSchema, disclosureSuggestEvidenceSchema, disclosureReviewSummarySchema, createChecklistSchema, updateChecklistStepSchema, setMaterialitySchema, suggestMaterialitySchema } from '../schemas/closeSchemas.js';
import { validateBody } from '../middleware/validateRequest.js';
import { getCloseRoleFromReq } from '../lib/closeRole.js';
import { send500 } from '../lib/errorHandler.js';
import type { AuthRequest } from '../auth/middleware.js';

const router = Router();
const getRole = (req: Request): string | undefined => (req as Request & { role?: string }).role;

/** POST /api/close/accrual-suggestions — Rule-based accrual/deferral suggestions (open AR/AP, payroll) */
router.post('/accrual-suggestions', validateBody(accrualSuggestionsSchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const suggestions = buildAccrualSuggestions(body);
    res.json({ suggestions });
  } catch (e) {
    send500(res, e, 'Accrual suggestions failed');
  }
});

/** POST /api/close/accrual-suggestions/agentic — Agentic accrual/deferral suggestions (LLM + rule-based) */
router.post('/accrual-suggestions/agentic', validateBody(accrualSuggestionsSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const suggestions = await suggestAccrualsAgentic(body);
    res.json({ suggestions });
  } catch (e) {
    send500(res, e, 'Agentic accrual suggestions failed');
  }
});

/** POST /api/close/inventory-valuation — Inventory valuation (FIFO or weighted average) */
router.post('/inventory-valuation', validateBody(inventoryValuationSchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const result = computeInventoryValuation(body);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Inventory valuation failed');
  }
});

/** POST /api/close/je-suggestions — Build JE suggestions from gaps and reconciliation mismatches */
router.post('/je-suggestions', validateBody(jeSuggestionsSchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const gaps = body.gaps ?? [];
    const mismatches = body.mismatches ?? [];
    const suggestions = buildJournalEntrySuggestions(gaps, mismatches);
    res.json({ suggestions });
  } catch (e) {
    send500(res, e, 'JE suggestions failed');
  }
});

/** POST /api/close/je-suggestions/from-text — Generate JE suggestions from natural language */
router.post('/je-suggestions/from-text', validateBody(jeFromTextSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as { text: string; periodEnd?: string };
    const suggestions = await suggestJEsFromTextAgentic({ text: body.text, periodEnd: body.periodEnd });
    res.json({ suggestions });
  } catch (e) {
    send500(res, e, 'JE suggestions from text failed');
  }
});

/** POST /api/close/je-suggestions/explain — Agentic narrative for JE suggestions (close documentation) */
router.post('/je-suggestions/explain', validateBody(jeExplainSchema), async (req: Request, res: Response) => {
  try {
    const body = req.body;
    const suggestions = body.suggestions ?? [];
    const narrative = await explainJESuggestionsAgentic(suggestions);
    res.json({ narrative });
  } catch (e) {
    send500(res, e, 'JE suggestions explain failed');
  }
});

/** POST /api/close/checklist — Create default close checklist for a period (optional assignee, dueDate); from template if tenant has one. */
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

/** GET /api/close/checklist/:periodLabel — Get checklist for period (stored or default) — FW1 */
router.get('/checklist/:periodLabel', (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel ?? '';
    const steps = getChecklist(periodLabel);
    res.json({ periodLabel, steps });
  } catch (e) {
    send500(res, e, 'Get checklist failed');
  }
});

/** PATCH /api/close/checklist/:periodLabel/step/:stepId — Set evidence link on step (FW1) */
router.patch('/checklist/:periodLabel/step/:stepId', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel ?? '';
    const stepId = req.params.stepId ?? '';
    const body = req.body as { evidenceId?: string; evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off' };
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const updated = await updateStepEvidence(periodLabel, stepId, {
      evidenceId: body.evidenceId,
      evidenceType: body.evidenceType,
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

/** GET /api/close/checklist-templates — List close checklist templates for tenant. Optional ?periodType=monthly. */
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

/** POST /api/close/checklist-templates — Create or update template for period type. Body: periodType, name?, stepsSpec[]. */
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

/** PATCH /api/close/checklist-templates/:periodType — Update template for period type. Body: name?, stepsSpec[]. */
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

/** POST /api/close/reconciliation-resolution — Create reconciliation resolution (FW1) */
router.post('/reconciliation-resolution', async (req: Request, res: Response) => {
  try {
    const body = req.body as CreateReconciliationResolutionInput;
    if (!body?.periodLabel || body?.reconciliationType == null || body?.passed == null) {
      res.status(400).json({ error: 'Missing periodLabel, reconciliationType, or passed' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const resolution = await createReconciliationResolution(body, tenantId ?? undefined, pool);
    res.status(201).json(resolution);
  } catch (e) {
    send500(res, e, 'Create reconciliation resolution failed');
  }
});

/** GET /api/close/reconciliation-resolutions — List reconciliation resolutions (FW1) */
router.get('/reconciliation-resolutions', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string | undefined;
    const status = req.query.status as 'open' | 'in_progress' | 'resolved' | 're_run_pending' | 'waived' | undefined;
    const reconciliationType = req.query.reconciliationType as 'trial_balance' | 'balance_sheet_equation' | 'bank_reconciliation' | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const list = await listReconciliationResolutions(
      { periodLabel, status, reconciliationType, limit },
      tenantId ?? undefined,
      pool
    );
    res.json({ resolutions: list });
  } catch (e) {
    send500(res, e, 'List reconciliation resolutions failed');
  }
});

/** PATCH /api/close/reconciliation-resolution/:id — Update resolution (assignee, due date, status) — FW1 */
router.patch('/reconciliation-resolution/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? '';
    const body = req.body as { assignee?: string; dueDate?: string; status?: 'open' | 'in_progress' | 'resolved' | 're_run_pending' | 'waived'; resolvedBy?: string; waivedBy?: string; waivedReason?: string };
    if (!id) {
      res.status(400).json({ error: 'Missing resolution id' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const updated = await updateReconciliationResolution(
      id,
      {
        assignee: body.assignee,
        dueDate: body.dueDate,
        status: body.status,
        resolvedBy: body.resolvedBy,
        waivedBy: body.waivedBy,
        waivedReason: body.waivedReason,
      },
      tenantId ?? undefined,
      pool
    );
    if (!updated) {
      res.status(404).json({ error: 'Resolution not found' });
      return;
    }
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Update reconciliation resolution failed');
  }
});

/** GET /api/close/controls — List control catalogue (FW4) */
router.get('/controls', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const controls = await listControls(tenantId ?? undefined, pool);
    res.json({ controls });
  } catch (e) {
    send500(res, e, 'List controls failed');
  }
});

/** POST /api/close/controls — Add control (name, owner, frequency, evidenceType) (FW4) */
router.post('/controls', async (req: Request, res: Response) => {
  try {
    const body = req.body as { name: string; description?: string; owner?: string; frequency?: 'monthly' | 'quarterly' | 'annual'; evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off' };
    if (!body?.name) {
      res.status(400).json({ error: 'Missing name' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const control = await addControl(
      {
        name: body.name,
        description: body.description,
        owner: body.owner,
        frequency: body.frequency,
        evidenceType: body.evidenceType,
      },
      tenantId ?? undefined,
      pool
    );
    res.status(201).json(control);
  } catch (e) {
    send500(res, e, 'Add control failed');
  }
});

/** GET /api/close/materiality — Get materiality settings for tenant (optional periodLabel query) */
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

/** PATCH /api/close/materiality — Set materiality settings for tenant (optional periodLabel in body) */
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

/** POST /api/close/materiality/suggest — Optional agentic suggestion for materiality from financial summary */
router.post('/materiality/suggest', async (req: Request, res: Response) => {
  try {
    const body = req.body as { netIncome?: number; revenue?: number; totalAssets?: number; summary?: string };
    const suggestion = await suggestMaterialityAgentic(body ?? {});
    res.json(suggestion ?? {});
  } catch (e) {
    send500(res, e, 'Materiality suggestion failed');
  }
});

/** POST /api/close/disclosure-checklist/suggest — Optional agentic suggestion for missing disclosures from notes/summary */
router.post('/disclosure-checklist/suggest', async (req: Request, res: Response) => {
  try {
    const body = req.body as { notesAndSummary?: string };
    const suggestions = await suggestDisclosuresAgentic(body?.notesAndSummary ?? '');
    res.json({ suggestions });
  } catch (e) {
    send500(res, e, 'Disclosure suggestion failed');
  }
});

/** GET /api/close/controls/:id — Get one control (FW4) */
router.get('/controls/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? '';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const control = await getControl(id, tenantId ?? undefined, pool);
    if (!control) {
      res.status(404).json({ error: 'Control not found' });
      return;
    }
    res.json(control);
  } catch (e) {
    send500(res, e, 'Get control failed');
  }
});

/** GET /api/close/controls/:id/assertions — List assertions/risks for a control */
router.get('/controls/:id/assertions', async (req: Request, res: Response) => {
  try {
    const controlId = req.params.id ?? '';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const assertions = await listAssertionsForControl(tenantId, pool, controlId);
    res.json({ assertions });
  } catch (e) {
    send500(res, e, 'List control assertions failed');
  }
});

/** POST /api/close/controls/:id/assertions — Add assertion to control */
router.post('/controls/:id/assertions', async (req: Request, res: Response) => {
  try {
    const controlId = req.params.id ?? '';
    const body = req.body as { assertionLabel: string; riskCategory?: string };
    if (!body?.assertionLabel) {
      res.status(400).json({ error: 'Missing assertionLabel' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const assertion = await addAssertionToControl(tenantId, pool, controlId, body.assertionLabel, body.riskCategory);
    if (!assertion) {
      res.status(500).json({ error: 'Add assertion failed (DB not configured?)' });
      return;
    }
    res.status(201).json(assertion);
  } catch (e) {
    send500(res, e, 'Add assertion failed');
  }
});

/** DELETE /api/close/controls/assertions/:assertionId — Remove assertion */
router.delete('/controls/assertions/:assertionId', async (req: Request, res: Response) => {
  try {
    const assertionId = req.params.assertionId ?? '';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool || !assertionId) {
      res.status(400).json({ error: 'Missing assertionId or tenant context' });
      return;
    }
    const removed = await removeAssertion(tenantId, pool, assertionId);
    if (!removed) {
      res.status(404).json({ error: 'Assertion not found' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    send500(res, e, 'Remove assertion failed');
  }
});

/** POST /api/close/controls/suggest-assertions — Optional agentic suggestion of assertions for a control */
router.post('/controls/suggest-assertions', async (req: Request, res: Response) => {
  try {
    const body = req.body as { controlId: string };
    if (!body?.controlId) {
      res.status(400).json({ error: 'Missing controlId' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const suggestions = await suggestAssertionsForControl(tenantId, pool, body.controlId);
    res.json({ suggestions });
  } catch (e) {
    send500(res, e, 'Suggest assertions failed');
  }
});

/** PATCH /api/close/controls/:id — Update control (FW4) */
router.patch('/controls/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? '';
    const body = req.body as { name?: string; description?: string; owner?: string; frequency?: 'monthly' | 'quarterly' | 'annual'; evidenceType?: 'reconciliation' | 'document' | 'checklist_sign_off' };
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const updated = await updateControl(id, body, tenantId ?? undefined, pool);
    if (!updated) {
      res.status(404).json({ error: 'Control not found' });
      return;
    }
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Update control failed');
  }
});

/** POST /api/close/control-evidence — Link evidence (rec/sampling/PBC) to a control */
router.post('/control-evidence', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required (tenantId, pool)' });
      return;
    }
    const body = req.body as { controlId: string; evidenceType: string; evidenceId: string; periodLabel: string };
    if (!body?.controlId || !body?.evidenceType || !body?.evidenceId || !body?.periodLabel) {
      res.status(400).json({ error: 'Missing controlId, evidenceType, evidenceId, or periodLabel' });
      return;
    }
    const link = await linkEvidenceToControl(tenantId, pool, {
      controlId: body.controlId,
      evidenceType: body.evidenceType,
      evidenceId: body.evidenceId,
      periodLabel: body.periodLabel,
    });
    if (!link) {
      res.status(501).json({ error: 'Control evidence not persisted (no DB)' });
      return;
    }
    res.status(201).json(link);
  } catch (e) {
    send500(res, e, 'Link control evidence failed');
  }
});

/** GET /api/close/control-evidence — List control–evidence links (query: periodLabel, controlId) */
router.get('/control-evidence', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const controlId = req.query.controlId as string | undefined;
    if (periodLabel && controlId) {
      const list = await listControlEvidenceForControl(tenantId, pool, controlId, periodLabel);
      return res.json({ evidence: list });
    }
    if (periodLabel) {
      const list = await listControlEvidenceForPeriod(tenantId, pool, periodLabel);
      return res.json({ evidence: list });
    }
    res.status(400).json({ error: 'Provide periodLabel or periodLabel and controlId' });
  } catch (e) {
    send500(res, e, 'List control evidence failed');
  }
});

/** GET /api/close/disclosure-checklist — List disclosure checklist (query: periodLabel, standard?) */
router.get('/disclosure-checklist', (req: Request, res: Response) => {
  try {
    const periodLabel = (req.query.periodLabel as string) ?? '';
    const standard = req.query.standard as string | undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const items = listDisclosureChecklist(periodLabel, standard, tenantId ?? undefined, pool);
    res.json({ periodLabel, standard: standard ?? null, items });
  } catch (e) {
    send500(res, e, 'List disclosure checklist failed');
  }
});

/** POST /api/close/disclosure-checklist/review-summary — Agentic review summary for disclosure checklist */
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

/** POST /api/close/disclosure-checklist/:id/suggest-evidence — Suggest evidence/workpaper for disclosure item */
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

/** PATCH /api/close/disclosure-checklist/:id — Update disclosure step (status, evidenceId, evidenceType) */
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

/** POST /api/close/sign-off — Set period close status (in_review | closed). For closed, runs pre-close checks. */
router.post('/sign-off', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; status: 'in_review' | 'closed'; closedBy?: string };
    if (!body?.periodLabel || !body?.status) {
      res.status(400).json({ error: 'Missing periodLabel or status (in_review | closed)' });
      return;
    }
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    await getOrCreatePeriodClose(tenantId, body.periodLabel, pool ?? undefined);
    const { record } = await setPeriodCloseStatus(
      tenantId,
      body.periodLabel,
      body.status,
      body.closedBy,
      pool ?? undefined
    );
    const auditContext = pool && tenantId ? { pool, tenantId } : undefined;
    appendAuditLog(
      { action: 'period_close_sign_off', resource: `period:${body.periodLabel}`, actor: body.closedBy ?? (req as AuthRequest).userId ?? 'anonymous', detail: body.status },
      auditContext
    );
    res.json(record);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: 'Sign-off failed', message });
  }
});

/** POST /api/close/reviewer-sign-off — Optional second signer (reviewer) for period close. */
router.post('/reviewer-sign-off', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; reviewedBy: string };
    if (!body?.periodLabel || !body?.reviewedBy) {
      res.status(400).json({ error: 'Missing periodLabel or reviewedBy' });
      return;
    }
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const record = await setReviewerSignOff(tenantId, body.periodLabel, body.reviewedBy, pool ?? undefined);
    if (!record) {
      res.status(404).json({ error: 'Period close record not found' });
      return;
    }
    const auditContext = pool && tenantId ? { pool, tenantId } : undefined;
    appendAuditLog(
      { action: 'period_close_reviewer_sign_off', resource: `period:${body.periodLabel}`, actor: body.reviewedBy, detail: 'reviewer signed off' },
      auditContext
    );
    res.json(record);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(400).json({ error: 'Reviewer sign-off failed', message });
  }
});

/** GET /api/close/readiness — Close readiness for period. Optional ?includeNarrative=true for agentic summary. */
router.get('/readiness', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context' });
      return;
    }
    const readiness = await buildCloseReadiness(tenantId, periodLabel, pool ?? undefined, { includeNarrative });
    res.json(readiness);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Close readiness failed', message });
  }
});

/** GET /api/close/status — Single close status view: lock, checklist, rec tie-out, readiness, sign-off, materiality. */
router.get('/status', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context' });
      return;
    }
    const status = await buildCloseStatus(tenantId, periodLabel, pool ?? undefined);
    res.json(status);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Close status failed', message });
  }
});

/** GET /api/close/one-pager?periodLabel=X — Close summary one-pager (close status + optional narrative). Optional ?includeNarrative=true. */
router.get('/one-pager', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context' });
      return;
    }
    const onePager = await buildCloseOnePager(tenantId, periodLabel, pool ?? undefined, { includeNarrative });
    res.json(onePager);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Close one-pager failed', message });
  }
});

/** GET /api/close/one-pager/export/pdf?periodLabel=X — Close summary one-pager as PDF. Optional ?includeNarrative=true. */
router.get('/one-pager/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context' });
      return;
    }
    const onePager = await buildCloseOnePager(tenantId, periodLabel, pool ?? undefined, { includeNarrative });
    const pdf = await exportCloseOnePagerToPdf(onePager, { title: 'Close Summary One-Pager' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="close-one-pager-${periodLabel}.pdf"`);
    res.send(pdf);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Close one-pager PDF export failed', message });
  }
});

/** GET /api/close/exceptions — Open items for period: checklist incomplete, recs open, disclosure pending, DQ/DRL/PBC. Optional ?includeNarrative=true for agentic summary and next actions. */
router.get('/exceptions', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId) {
      res.status(400).json({ error: 'Missing periodLabel query or tenant context' });
      return;
    }
    const exceptions = await getCloseExceptions(tenantId, periodLabel, pool ?? undefined);
    if (includeNarrative) {
      const { narrative, nextActions } = await generateCloseExceptionsNarrativeAgentic(exceptions);
      res.json({ ...exceptions, narrative, nextActions });
      return;
    }
    res.json(exceptions);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Close exceptions failed', message });
  }
});

/** POST /api/close/tie-out/narrative — Agentic narrative for reconciliation tie-out (close/audit docs). Body: { periodLabel: string }. */
router.post('/tie-out/narrative', async (req: Request, res: Response) => {
  try {
    const periodLabel = (req.body as { periodLabel?: string })?.periodLabel ?? (req.query.periodLabel as string);
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId) {
      res.status(400).json({ error: 'Missing periodLabel (body or query) or tenant context' });
      return;
    }
    const tieOut = await buildReconciliationTieOut(tenantId, periodLabel, pool ?? undefined);
    const narrative = await generateTieOutNarrativeAgentic(tieOut);
    res.json({ narrative });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Tie-out narrative failed', message });
  }
});

/** GET /api/close/package — Close package for period. Optional ?includeNarrative=true for agentic narrative. */
router.get('/package', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const pkg = await buildClosePackage(tenantId, periodLabel, pool);
    let narrative: string | null = null;
    if (includeNarrative) {
      try {
        narrative = (await generateCloseNarrativeAgentic(pkg)) || null;
      } catch {
        narrative = null;
      }
    }
    res.json(narrative != null ? { ...pkg, narrative } : pkg);
  } catch (e) {
    send500(res, e, 'Close package failed');
  }
});

/** GET /api/close/package/export/pdf?periodLabel=X — Close package as PDF. Optional ?includeNarrative=true. */
router.get('/package/export/pdf', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const pkg = await buildClosePackage(tenantId, periodLabel, pool);
    let narrative: string | null = null;
    if (includeNarrative) {
      try {
        narrative = (await generateCloseNarrativeAgentic(pkg)) || null;
      } catch {
        narrative = null;
      }
    }
    const pdf = await exportClosePackageToPdf(pkg, { title: 'Close Package', includeNarrative: !!includeNarrative, narrative });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="close-package-${periodLabel}.pdf"`);
    res.send(pdf);
  } catch (e) {
    send500(res, e, 'Close package PDF export failed');
  }
});

/** GET /api/close/package/export/csv?periodLabel=X — Close package as CSV (checklist, recs, control evidence). */
router.get('/package/export/csv', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const pkg = await buildClosePackage(tenantId, periodLabel, pool);
    const csv = exportClosePackageToCsv(pkg);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="close-package-${periodLabel}.csv"`);
    res.send(csv);
  } catch (e) {
    send500(res, e, 'Close package CSV export failed');
  }
});

/** POST /api/close/period-lock — Lock a period (requires approver role). FW4: response includes suggestPackGeneration for close→reporting linkage. */
router.post('/period-lock', async (req: Request, res: Response) => {
  try {
    const actorRole = getCloseRoleFromReq(req as AuthRequest);
    if (!canPerform(actorRole, 'period_lock')) {
      return res.status(403).json({ error: 'Insufficient role for this action' });
    }
    const parsed = periodLockBodySchema.safeParse(req.body);
    if (!parsed.success) {
      const flat = parsed.error.flatten();
      const message = [...flat.formErrors, ...Object.values(flat.fieldErrors).flat()].filter(Boolean).join('; ') || 'Validation failed';
      res.status(400).json({ error: 'Validation failed', message });
      return;
    }
    const body = parsed.data;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const lock = await lockPeriod(body.periodLabel, body.lockedBy, body.reason, tenantId, pool);
    const auditContext = pool && tenantId ? { pool, tenantId } : undefined;
    appendAuditLog(
      { action: 'period_lock', resource: `period:${lock.periodLabel}`, actor: body.lockedBy, detail: body.reason },
      auditContext
    );
    res.json({
      ...lock,
      suggestPackGeneration: true,
      packUrl: '/api/reporting/pack',
      periodLabel: lock.periodLabel,
    });
  } catch (e: unknown) {
    send500(res, e, 'Period lock failed');
  }
});

/** GET /api/close/period-lock/:periodLabel — Check if period is locked */
router.get('/period-lock/:periodLabel', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.params.periodLabel ?? '';
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const locked = await isPeriodLocked(periodLabel, tenantId, pool);
    const lock = await getPeriodLock(periodLabel, tenantId, pool);
    res.json({ periodLabel, locked, lock: lock ?? null });
  } catch (e) {
    send500(res, e, 'Period lock check failed');
  }
});

/** GET /api/close/period-lock — List all locked periods */
router.get('/period-lock', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const locksList = await listLockedPeriods(tenantId, pool);
    res.json({ locks: locksList });
  } catch (e) {
    res.status(500).json({
      error: 'List locks failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/close/calendar-config — Get recurring close calendar config (close_due_offset_days, reminder_days). */
router.get('/calendar-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const config = await getCloseCalendarConfig(tenantId, pool);
    res.json(config ?? { tenantId, closeDueOffsetDays: 5, reminderDays: undefined });
  } catch (e) {
    send500(res, e, 'Get calendar config failed');
  }
});

/** PATCH /api/close/calendar-config — Set recurring close calendar config. Body: closeDueOffsetDays?, reminderDays?. */
router.patch('/calendar-config', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body as { closeDueOffsetDays?: number; reminderDays?: number };
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const config = await setCloseCalendarConfig(tenantId, body, pool);
    res.json(config ?? { tenantId, closeDueOffsetDays: body.closeDueOffsetDays ?? 5, reminderDays: body.reminderDays });
  } catch (e) {
    send500(res, e, 'Set calendar config failed');
  }
});

/** GET /api/close/calendar — List close calendar (periods with due date and status) */
router.get('/calendar', async (req: Request, res: Response) => {
  try {
    const periodLabels = req.query.periodLabels as string | undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const list = await listPeriods(periodLabels ? periodLabels.split(',') : undefined, tenantId, pool);
    res.json({ periods: list });
  } catch (e) {
    send500(res, e, 'Close calendar failed');
  }
});

/** POST /api/close/calendar — Set close due date for a period */
router.post('/calendar', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; closeDueDate: string };
    if (!body?.periodLabel || !body?.closeDueDate) {
      res.status(400).json({ error: 'Missing periodLabel or closeDueDate' });
      return;
    }
    setCloseDueDate(body.periodLabel, body.closeDueDate);
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const entry = await getPeriodEntry(body.periodLabel, tenantId, pool);
    res.json(entry);
  } catch (e) {
    res.status(500).json({
      error: 'Set close due date failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/close/periods — List periods with status (alias for calendar) */
router.get('/periods', async (req: Request, res: Response) => {
  try {
    const periodLabels = req.query.periodLabels as string | undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const list = await listPeriods(periodLabels ? periodLabels.split(',') : undefined, tenantId, pool);
    res.json({ periods: list });
  } catch (e) {
    send500(res, e, 'List periods failed');
  }
});

/** GET /api/close/adjustments — List unified close adjustments (JE + accrual) by period/status */
router.get('/adjustments', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string | undefined;
    const status = req.query.status as import('../types/close_and_controls.js').CloseAdjustmentStatus | undefined;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const list = await listAdjustments({ periodLabel, status }, tenantId, pool);
    res.json({ adjustments: list });
  } catch (e) {
    res.status(500).json({
      error: 'List adjustments failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/close/adjustments/from-je — Add JE suggestions to adjustments queue */
router.post('/adjustments/from-je', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; suggestions: JournalEntrySuggestion[] };
    if (!body?.periodLabel || !Array.isArray(body?.suggestions)) {
      res.status(400).json({ error: 'Missing periodLabel or suggestions' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    await assertPeriodNotLocked(body.periodLabel, tenantId ?? undefined, pool);
    const added = await addJEAsAdjustments(body.periodLabel, body.suggestions, tenantId, pool);
    res.json({ added, count: added.length });
  } catch (e) {
    if (e instanceof PeriodLockedError) {
      const pool = getTenantPool(req);
      const tenantId = getTenantId(req);
      const auditContext = pool && tenantId ? { pool, tenantId } : undefined;
      appendAuditLog(
        { action: 'period_edit_blocked', resource: `period:${e.periodLabel}`, detail: 'Period is locked', actor: (req as AuthRequest).userId ?? 'anonymous' },
        auditContext
      );
      return res.status(403).json({ error: 'Period locked', periodLabel: e.periodLabel });
    }
    send500(res, e, 'Add JE adjustments failed');
  }
});

/** POST /api/close/adjustments/from-accruals — Add accrual suggestions to adjustments queue */
router.post('/adjustments/from-accruals', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string; suggestions: import('../types/accrual_deferral.js').AccrualSuggestion[] };
    if (!body?.periodLabel || !Array.isArray(body?.suggestions)) {
      res.status(400).json({ error: 'Missing periodLabel or suggestions' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    await assertPeriodNotLocked(body.periodLabel, tenantId ?? undefined, pool);
    const added = await addAccrualsAsAdjustments(body.periodLabel, body.suggestions, tenantId, pool);
    res.json({ added, count: added.length });
  } catch (e) {
    if (e instanceof PeriodLockedError) {
      return res.status(403).json({ error: 'Period locked', periodLabel: e.periodLabel });
    }
    res.status(500).json({
      error: 'Add accrual adjustments failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** PATCH /api/close/adjustments/:id — Update adjustment status (approved / rejected / posted; approved/posted require approver). When status=posted, pushes to GL then updates; idempotent if already posted. When approval workflow exists for close_adjustment, use POST /api/approvals/submit then PATCH /api/approvals/requests/:id. */
router.patch('/adjustments/:id', async (req: Request, res: Response) => {
  try {
    const id = req.params.id ?? '';
    const body = req.body as {
      status: import('../types/close_and_controls.js').CloseAdjustmentStatus;
      approvedBy?: string;
      connectionId?: string;
    };
    if (!id || !body?.status) {
      res.status(400).json({ error: 'Missing adjustment id or status' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const existing = pool && tenantId ? await getAdjustment(pool, id, tenantId) : undefined;
    if (!existing) {
      res.status(404).json({ error: 'Adjustment not found' });
      return;
    }
    await assertPeriodNotLocked(existing.periodLabel, tenantId ?? undefined, pool);
    if ((body.status === 'approved' || body.status === 'posted') && pool && tenantId) {
      const { getWorkflowForResourceType } = await import('../services/approval_workflow_service.js');
      const { getRequestByResource } = await import('../services/approval_request_service.js');
      const workflow = await getWorkflowForResourceType(pool, tenantId, 'close_adjustment');
      if (workflow) {
        const pending = await getRequestByResource(pool, tenantId, 'close_adjustment', id);
        if (!pending) {
          return res.status(400).json({
            error: 'Approval workflow required',
            message: 'Submit for approval first via POST /api/approvals/submit with body: { resourceType: "close_adjustment", resourceId: "' + id + '" }',
          });
        }
        return res.status(400).json({
          error: 'Approve via approval request',
          message: 'Approve via PATCH /api/approvals/requests/' + pending.id + ' with body: { action: "approved", actor?: "userId" }',
          approvalRequestId: pending.id,
        });
      }
    }
    if (body.status === 'approved' || body.status === 'posted') {
      const actorRole = getCloseRoleFromReq(req as AuthRequest);
      const action: ControlledAction = body.status === 'posted' ? 'je_post' : 'je_suggest_approve';
      if (!canPerform(actorRole, action)) {
        return res.status(403).json({ error: 'Insufficient role for this action' });
      }
    }

    if (body.status === 'posted' && pool && tenantId) {
      let connectionId = body.connectionId;
      if (!connectionId) {
        const connections = await listConnections(tenantId, pool);
        if (connections.length === 0) {
          return res.status(400).json({
            error: 'No accounting connection',
            message: 'No accounting connection; add one or pass connectionId.',
          });
        }
        connectionId = connections[0].id;
      }
      if (existing.postedExternalId) {
        const updated = await updateAdjustmentStatus(id, 'posted', body.approvedBy, tenantId, pool, {
          postedAt: existing.postedAt ?? new Date().toISOString(),
          postedExternalId: existing.postedExternalId,
        });
        if (body.status === 'posted' && pool && tenantId) {
          appendAuditLog(
            { action: 'close_adjustment_post', resource: `adjustment:${id}`, actor: body.approvedBy ?? (req as AuthRequest).userId ?? 'anonymous' },
            { pool, tenantId }
          );
        }
        return res.json(updated);
      }
      const pushResult = await pushAdjustmentToGL(existing, connectionId, pool);
      if (!pushResult.success) {
        return res.status(502).json({
          error: 'Push to GL failed',
          message: pushResult.errors?.join(' ') ?? 'Unknown error',
          errors: pushResult.errors,
        });
      }
      const now = new Date().toISOString();
      const updated = await updateAdjustmentStatus(id, 'posted', body.approvedBy, tenantId, pool, {
        postedAt: now,
        postedExternalId: pushResult.externalId,
      });
      if (!updated) {
        res.status(404).json({ error: 'Adjustment not found' });
        return;
      }
      appendAuditLog(
        { action: 'close_adjustment_post', resource: `adjustment:${id}`, actor: body.approvedBy ?? (req as AuthRequest).userId ?? 'anonymous' },
        { pool, tenantId }
      );
      return res.json(updated);
    }

    const updated = await updateAdjustmentStatus(id, body.status, body.approvedBy, tenantId, pool);
    if (!updated) {
      res.status(404).json({ error: 'Adjustment not found' });
      return;
    }
    if (body.status === 'posted' && pool && tenantId) {
      appendAuditLog(
        { action: 'close_adjustment_post', resource: `adjustment:${id}`, actor: body.approvedBy ?? (req as AuthRequest).userId ?? 'anonymous' },
        { pool, tenantId }
      );
    }
    res.json(updated);
  } catch (e) {
    if (e instanceof PeriodLockedError) {
      const pool = getTenantPool(req);
      const tenantId = getTenantId(req);
      const auditContext = pool && tenantId ? { pool, tenantId } : undefined;
      appendAuditLog(
        { action: 'period_edit_blocked', resource: `period:${e.periodLabel}`, detail: 'Period is locked', actor: (req as AuthRequest).userId ?? 'anonymous' },
        auditContext
      );
      return res.status(403).json({ error: 'Period locked', periodLabel: e.periodLabel });
    }
    send500(res, e, 'Update adjustment failed');
  }
});

/** POST /api/close/audit-log — Append audit log entry (internal; or use perform-action) */
router.post('/audit-log', (req: Request, res: Response) => {
  try {
    const body = req.body as { actor: string; action: string; resource?: string; detail?: string; payload?: Record<string, unknown> };
    if (!body?.actor || !body?.action) {
      res.status(400).json({ error: 'Missing actor or action' });
      return;
    }
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req) ?? 'default';
    const context = pool && tenantId ? { pool, tenantId } : undefined;
    const entry = appendAuditLog(
      { actor: body.actor, action: body.action, resource: body.resource, detail: body.detail, payload: body.payload },
      context
    );
    res.json(entry);
  } catch (e) {
    send500(res, e, 'Audit log append failed');
  }
});

/** GET /api/close/audit-log — Query audit log */
router.get('/audit-log', async (req: Request, res: Response) => {
  try {
    const actor = req.query.actor as string | undefined;
    const action = req.query.action as string | undefined;
    const resource = req.query.resource as string | undefined;
    const since = req.query.since as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req) ?? 'default';
    const context = pool && tenantId ? { pool, tenantId } : undefined;
    const entries = await queryAuditLog({ actor, action, resource, since, limit }, context);
    res.json({ entries });
  } catch (e) {
    send500(res, e, 'Audit log query failed');
  }
});

/** POST /api/close/audit-log/retention-purge — Purge audit log older than retention (approver only). */
router.post('/audit-log/retention-purge', async (req: Request, res: Response) => {
  try {
    const actorRole = getCloseRoleFromReq(req as AuthRequest);
    if (!canPerform(actorRole, 'audit_log_retention_purge')) {
      return res.status(403).json({ error: 'Insufficient role for this action' });
    }
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      return res.status(503).json({ error: 'Tenant context required', message: 'Pool and tenantId required for retention purge.' });
    }
    const context = { pool, tenantId };
    const { deleted } = await purgeRetention(context);
    appendAuditLog(
      {
        action: 'audit_log_retention_purge',
        actor: (req as AuthRequest).userId ?? 'unknown',
        detail: `deleted=${deleted}`,
      },
      context
    );
    res.json({ deleted });
  } catch (e) {
    send500(res, e, 'Audit log retention purge failed');
  }
});

/** POST /api/close/can-perform — Check if current user role can perform action */
router.post('/can-perform', (req: Request, res: Response) => {
  try {
    const body = req.body as { action: ControlledAction };
    if (!body?.action) {
      res.status(400).json({ error: 'Missing action' });
      return;
    }
    const actorRole = getCloseRoleFromReq(req as AuthRequest);
    const allowed = canPerform(actorRole, body.action);
    res.json({ allowed, action: body.action, actorRole });
  } catch (e) {
    send500(res, e, 'Can-perform check failed');
  }
});

/** POST /api/close/perform-action — Perform controlled action (uses JWT role, appends audit log) */
router.post('/perform-action', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      action: ControlledAction;
      resource?: string;
      detail?: string;
      payload?: Record<string, unknown>;
    };
    if (!body?.action) {
      res.status(400).json({ error: 'Missing action' });
      return;
    }
    const actorRole = getCloseRoleFromReq(req as AuthRequest);
    const actor = (req as Request & { userId?: string }).userId ?? 'unknown';
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req) ?? 'default';
    const context = pool && tenantId ? { pool, tenantId } : undefined;
    const { allowed, auditEntry } = performControlledAction(
      actor,
      actorRole,
      body.action,
      body.resource,
      body.detail,
      body.payload,
      context
    );
    res.json({ allowed, auditEntry });
  } catch (e) {
    send500(res, e, 'Perform action failed');
  }
});

/** POST /api/close/checklist-sign-off — Sign off a checklist step (identity + timestamp) */
router.post('/checklist-sign-off', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      periodLabel: string;
      stepId: string;
      signedOffBy: string;
      steps: import('../types/close_and_controls.js').CloseChecklistStep[];
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

/** POST /api/close/task-assign — Assign task (assignee, due date) to checklist step */
router.post('/task-assign', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      periodLabel: string;
      stepId: string;
      assignee: string;
      dueDate: string;
      steps: import('../types/close_and_controls.js').CloseChecklistStep[];
    };
    if (!body?.stepId || !body?.assignee || !body?.dueDate || !Array.isArray(body?.steps)) {
      res.status(400).json({ error: 'Missing stepId, assignee, dueDate, or steps array' });
      return;
    }
    const steps = body.steps.map((s) =>
      s.id === body.stepId ? { ...s, assignee: body.assignee, dueDate: body.dueDate } : s
    );
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (tenantId && pool) {
      await setChecklist(body.periodLabel, steps, tenantId, pool);
    }
    res.json({ periodLabel: body.periodLabel, stepId: body.stepId, assignee: body.assignee, dueDate: body.dueDate, steps });
  } catch (e) {
    res.status(500).json({
      error: 'Task assign failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
