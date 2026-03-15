/**
 * PE Reporting Hierarchy routes: hierarchy CRUD and PE-format statement generation.
 * Mounted at /api/close via close/index.ts.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import * as peRepo from '../../db/repositories/pe_hierarchy_repository.js';
import { generatePEStatements } from '../../services/pe_reporting_service.js';

const router = Router();

/**
 * GET /api/close/sessions/:sessionId/pe-statements
 * Generate PE-format financial statements for a close session.
 */
router.get('/sessions/:sessionId/pe-statements', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const sessionId = req.params.sessionId;
    const session = await getCloseSessionById(pool, tenantId, sessionId);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const statements = await generatePEStatements(pool, tenantId, sessionId);
    res.json({ statements });
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('Close session not found')) {
      res.status(404).json({ error: msg });
      return;
    }
    send500(res, e, 'Generate PE statements failed');
  }
});

/**
 * GET /api/close/pe-hierarchy
 * List the full PE hierarchy for the tenant. Optional query: ?statement=PL
 */
router.get('/pe-hierarchy', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const statement = req.query.statement as string | undefined;
    const hierarchy = await peRepo.getHierarchy(pool, tenantId, statement ? { statement } : undefined);
    res.json({ hierarchy });
  } catch (e) {
    send500(res, e, 'List PE hierarchy failed');
  }
});

/**
 * POST /api/close/pe-hierarchy
 * Upsert a PE hierarchy line.
 * Body: { peLineId, peLineName, parentPeLineId?, displayOrder?, statement? }
 */
router.post('/pe-hierarchy', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const body = req.body as {
      peLineId?: string;
      peLineName?: string;
      parentPeLineId?: string | null;
      displayOrder?: number;
      statement?: string;
    };
    if (!body.peLineId || typeof body.peLineId !== 'string') {
      res.status(400).json({ error: 'peLineId string required' });
      return;
    }
    if (!body.peLineName || typeof body.peLineName !== 'string') {
      res.status(400).json({ error: 'peLineName string required' });
      return;
    }

    const line = await peRepo.upsertLine(pool, tenantId, {
      peLineId: body.peLineId,
      peLineName: body.peLineName,
      parentPeLineId: body.parentPeLineId,
      displayOrder: body.displayOrder,
      statement: body.statement,
    });
    res.status(201).json({ line });
  } catch (e) {
    send500(res, e, 'Upsert PE hierarchy line failed');
  }
});

/**
 * DELETE /api/close/pe-hierarchy/:peLineId
 * Delete a PE hierarchy line.
 */
router.delete('/pe-hierarchy/:peLineId', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const { peLineId } = req.params;
    const deleted = await peRepo.deleteLine(pool, tenantId, peLineId);
    if (!deleted) {
      res.status(404).json({ error: 'PE hierarchy line not found' });
      return;
    }
    res.json({ deleted: true });
  } catch (e) {
    send500(res, e, 'Delete PE hierarchy line failed');
  }
});

export default router;
