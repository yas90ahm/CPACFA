/**
 * Onboarding: guided setup, CoA import, first close wizard.
 */

import { Router, Request, Response } from 'express';
import {
  getOrCreateOnboarding,
  advanceStep,
  setEntityInfo,
  completeCoAImport,
  setFirstTbUploaded,
  setFirstCloseCompleted,
  importCoA,
  getSteps,
} from '../services/onboarding_service.js';
import { suggestCoAMappingAgentic, getFirstCloseGuideAgentic } from '../services/agentic_onboarding.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { validateBody } from '../middleware/validationMiddleware.js';
import {
  advanceStepBodySchema,
  entityInfoBodySchema,
  coaImportBodySchema,
  suggestCoAMappingBodySchema,
  firstCloseGuideBodySchema,
} from '../schemas/onboardingSchemas.js';

const router = Router();

router.get('/state', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req) ?? 'default';
  const pool = getTenantPool(req);
  const state = await getOrCreateOnboarding(tenantId, pool);
  res.json(state);
});

router.get('/steps', (_req: Request, res: Response) => {
  res.json(getSteps());
});

router.post('/advance', validateBody(advanceStepBodySchema), async (req: Request, res: Response) => {
  const tenantId = getTenantId(req) ?? 'default';
  const pool = getTenantPool(req);
  const { stepId } = req.body;
  const state = await advanceStep(tenantId, stepId, pool);
  if (!state) return res.status(404).json({ error: 'Onboarding state not found' });
  res.json(state);
});

router.post('/entity-info', validateBody(entityInfoBodySchema), async (req: Request, res: Response) => {
  const tenantId = getTenantId(req) ?? 'default';
  const pool = getTenantPool(req);
  const { entityName, fiscalYearEnd, currency } = req.body;
  const state = await setEntityInfo(tenantId, { entityName, fiscalYearEnd, currency }, pool);
  if (!state) return res.status(404).json({ error: 'Onboarding state not found' });
  res.json(state);
});

router.post('/coa-import', validateBody(coaImportBodySchema), async (req: Request, res: Response) => {
  const tenantId = getTenantId(req) ?? 'default';
  const pool = getTenantPool(req);
  const { accounts } = req.body;
  const result = importCoA(accounts.map((a: { code?: unknown; name?: unknown }) => ({ code: String(a.code), name: String(a.name) })));
  const state = await completeCoAImport(tenantId, result, pool);
  res.json({ ...result, state: state ?? undefined });
});

/** POST /api/onboarding/suggest-coa-mapping — Agentic: suggest ASSET/LIABILITY/EQUITY/REVENUE/EXPENSE for each account. Body: { accounts: [{ code, name }] }. */
router.post('/suggest-coa-mapping', validateBody(suggestCoAMappingBodySchema), async (req: Request, res: Response) => {
  try {
    const { accounts } = req.body;
    const result = await suggestCoAMappingAgentic(accounts.map((a: { code?: unknown; name?: unknown }) => ({ code: String(a.code), name: String(a.name) })));
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest CoA mapping failed', message });
  }
});

/** GET or POST /api/onboarding/first-close-guide — Agentic: ordered steps for first month-end close. Optional query/body: entityName, fiscalYearEnd. */
router.get('/first-close-guide', async (req: Request, res: Response) => {
  try {
    const entityName = (req.query.entityName as string) ?? undefined;
    const fiscalYearEnd = (req.query.fiscalYearEnd as string) ?? undefined;
    const result = await getFirstCloseGuideAgentic({ entityName, fiscalYearEnd });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'First close guide failed', message });
  }
});
router.post('/first-close-guide', validateBody(firstCloseGuideBodySchema), async (req: Request, res: Response) => {
  try {
    const { entityName, fiscalYearEnd } = req.body;
    const result = await getFirstCloseGuideAgentic({ entityName, fiscalYearEnd });
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'First close guide failed', message });
  }
});

router.post('/first-tb-uploaded', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req) ?? 'default';
  const pool = getTenantPool(req);
  const state = await setFirstTbUploaded(tenantId, pool);
  if (!state) return res.status(404).json({ error: 'Onboarding state not found' });
  res.json(state);
});

router.post('/first-close-completed', async (req: Request, res: Response) => {
  const tenantId = getTenantId(req) ?? 'default';
  const pool = getTenantPool(req);
  const state = await setFirstCloseCompleted(tenantId, pool);
  if (!state) return res.status(404).json({ error: 'Onboarding state not found' });
  res.json(state);
});

export default router;
