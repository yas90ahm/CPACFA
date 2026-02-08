/**
 * Close task-assign route: POST task-assign.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { setChecklist } from '../../services/checklist_store_service.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();

router.post('/task-assign', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      periodLabel: string;
      stepId: string;
      assignee: string;
      dueDate: string;
      steps: import('../../types/close_and_controls.js').CloseChecklistStep[];
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
    send500(res, e, 'Task assign failed');
  }
});

export default router;
