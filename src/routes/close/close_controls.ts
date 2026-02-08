/**
 * Close controls routes: controls CRUD, assertions, control-evidence, suggest-assertions.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
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
} from '../../services/close_controls_service.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();

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
      { name: body.name, description: body.description, owner: body.owner, frequency: body.frequency, evidenceType: body.evidenceType },
      tenantId ?? undefined,
      pool
    );
    res.status(201).json(control);
  } catch (e) {
    send500(res, e, 'Add control failed');
  }
});

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
      send500(res, new Error('Add assertion failed'), 'Add assertion failed');
      return;
    }
    res.status(201).json(assertion);
  } catch (e) {
    send500(res, e, 'Add assertion failed');
  }
});

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

export default router;
