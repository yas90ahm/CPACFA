/**
 * Audit todos routes: todos, gaps-with-resolution, todos/from-gaps, todos/:id.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import {
  getReconciliationTodos,
  addTodosFromGaps,
  markTodoDone,
  getGapsWithResolution,
} from '../../services/reconciliation_todos.js';
import { validateBody } from '../../middleware/validationMiddleware.js';
import { todosFromGapsBodySchema, todoUpdateBodySchema } from '../../schemas/auditSchemas.js';
import { handleAuditError } from './audit_shared.js';

const router = Router();

/** GET /api/audit/todos */
router.get('/todos', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const status = req.query.status as 'open' | 'done' | undefined;
    const limit = req.query.limit != null ? Math.min(500, Math.max(1, Number(req.query.limit))) : 100;
    const todos = await getReconciliationTodos({ status, limit }, pool, tenantId);
    res.json({ todos, count: todos.length });
  } catch (err) {
    handleAuditError(res, err, 'Todos error');
  }
});

/** GET /api/audit/gaps-with-resolution */
router.get('/gaps-with-resolution', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const status = req.query.status as 'open' | 'done' | undefined;
    const limit = req.query.limit != null ? Math.min(500, Math.max(1, Number(req.query.limit))) : 100;
    const gaps = await getGapsWithResolution({ status, limit }, pool, tenantId);
    res.json({ gaps, count: gaps.length });
  } catch (err) {
    handleAuditError(res, err, 'Audit error');
  }
});

/** POST /api/audit/todos/from-gaps */
router.post('/todos/from-gaps', validateBody(todosFromGapsBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const gaps = req.body.gaps ?? [];
    const added = await addTodosFromGaps(gaps as Parameters<typeof addTodosFromGaps>[0], pool, tenantId);
    res.status(201).json({ ok: true, added, count: added.length });
  } catch (err) {
    handleAuditError(res, err, 'Todos error');
  }
});

/** PATCH /api/audit/todos/:id */
router.patch('/todos/:id', validateBody(todoUpdateBodySchema), async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    const id = req.params.id;
    const status = req.body.status;
    const todo = await markTodoDone(id, status, pool, tenantId);
    if (!todo) {
      res.status(404).json({ error: 'Todo not found' });
      return;
    }
    res.json({ ok: true, todo });
  } catch (err) {
    handleAuditError(res, err, 'Todos error');
  }
});

export default router;
