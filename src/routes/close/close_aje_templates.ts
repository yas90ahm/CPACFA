/**
 * AJE template routes: CRUD, propose, apply, skip.
 * Mounted at /api/close (paths: /templates, /templates/propose, etc.).
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import * as ajeTemplateService from '../../services/aje_template_service.js';
import * as repo from '../../db/repositories/aje_template_repository.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';

const router = Router();

/** GET /api/close/templates — list templates for tenant */
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const entityId = (req.query as { entityId?: string }).entityId;
    const isActive = (req.query as { isActive?: string }).isActive;
    const filters =
      entityId != null || isActive != null
        ? {
            entityId: entityId ?? undefined,
            isActive: isActive === 'true' ? true : isActive === 'false' ? false : undefined,
          }
        : undefined;
    const templates = await repo.listTemplates(pool, tenantId, filters);
    res.json({ templates });
  } catch (e) {
    send500(res, e, 'List templates failed');
  }
});

/** POST /api/close/templates — create template */
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as {
      entityId?: string;
      name: string;
      memo: string;
      lines: Array<{ accountRef: string; debit?: number; credit?: number; description?: string }>;
      frequency?: 'monthly' | 'quarterly' | 'annually';
    };
    if (!body.name || !body.memo || !Array.isArray(body.lines)) {
      res.status(400).json({ error: 'name, memo, and lines required' });
      return;
    }
    const template = await repo.insertTemplate(pool, randomUUID(), {
      tenantId,
      entityId: body.entityId,
      name: body.name,
      memo: body.memo,
      lines: body.lines,
      frequency: body.frequency ?? 'monthly',
    });
    res.status(201).json({ template });
  } catch (e) {
    send500(res, e, 'Create template failed');
  }
});

/** GET /api/close/templates/:id — get template by id */
router.get('/templates/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const template = await repo.getTemplateById(pool, tenantId, req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json({ template });
  } catch (e) {
    send500(res, e, 'Get template failed');
  }
});

/** POST /api/close/templates/propose — propose templates for close session */
router.post('/templates/propose', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as {
      closeSessionId: string;
      periodLabel?: string;
      entityId?: string;
    };
    if (!body.closeSessionId) {
      res.status(400).json({ error: 'closeSessionId required' });
      return;
    }
    let periodLabel = body.periodLabel ?? (req.query.periodLabel as string | undefined);
    if (!periodLabel) {
      const session = await getCloseSessionById(pool, tenantId, body.closeSessionId);
      periodLabel = session?.periodEnd?.slice(0, 7) ?? body.closeSessionId;
    }
    const result = await ajeTemplateService.proposeTemplatesForPeriod(pool, {
      tenantId,
      closeSessionId: body.closeSessionId,
      periodLabel,
      entityId: body.entityId,
    });
    res.json(result);
  } catch (e) {
    send500(res, e, 'Propose templates failed');
  }
});

/** POST /api/close/templates/apply — apply proposed template */
router.post('/templates/apply', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as {
      applicationId: string;
      closeSessionId: string;
      createdBy?: string;
      lineOverrides?: Array<{ accountRef: string; debit?: number; credit?: number }>;
    };
    if (!body.applicationId || !body.closeSessionId) {
      res.status(400).json({ error: 'applicationId and closeSessionId required' });
      return;
    }
    const result = await ajeTemplateService.applyTemplate(pool, {
      tenantId,
      applicationId: body.applicationId,
      closeSessionId: body.closeSessionId,
      createdBy: body.createdBy,
      lineOverrides: body.lineOverrides,
    });
    res.json(result);
  } catch (e) {
    send500(res, e, 'Apply template failed');
  }
});

/** POST /api/close/templates/skip — skip proposed template */
router.post('/templates/skip', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as {
      applicationId: string;
      closeSessionId: string;
    };
    if (!body.applicationId || !body.closeSessionId) {
      res.status(400).json({ error: 'applicationId and closeSessionId required' });
      return;
    }
    const application = await ajeTemplateService.skipTemplate(pool, {
      tenantId,
      applicationId: body.applicationId,
      closeSessionId: body.closeSessionId,
    });
    res.json({ application });
  } catch (e) {
    send500(res, e, 'Skip template failed');
  }
});

/** GET /api/close/sessions/:closeSessionId/template-status — get template status for period */
router.get('/sessions/:closeSessionId/template-status', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const closeSessionId = req.params.closeSessionId;
    const loadTemplates = (req.query as { loadTemplates?: string }).loadTemplates === 'true';
    const status = await ajeTemplateService.getTemplateStatusForPeriod(
      pool,
      tenantId,
      closeSessionId,
      loadTemplates
    );
    res.json(status);
  } catch (e) {
    send500(res, e, 'Get template status failed');
  }
});

export default router;
