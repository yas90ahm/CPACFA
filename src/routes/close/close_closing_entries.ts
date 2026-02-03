/**
 * Close closing-entries routes: closing-entries GET, closing-entries/add POST.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getAdjustedTrialBalance } from '../../services/adjusted_trial_balance_service.js';
import { buildClosingEntrySuggestion } from '../../services/closing_entries_service.js';
import { addJEAsAdjustments } from '../../services/close_adjustments_service.js';
import { assertPeriodNotLocked, PeriodLockedError } from '../../services/period_lock_service.js';
import { appendAuditLog } from '../../services/audit_log_service.js';
import { send500 } from '../../lib/errorHandler.js';
import type { AuthRequest } from '../../auth/middleware.js';

const router = Router();

router.get('/closing-entries', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!periodLabel || !tenantId) {
      res.status(400).json({ error: 'periodLabel query and tenant context required' });
      return;
    }
    const entries = await getAdjustedTrialBalance(tenantId, periodLabel, pool ?? undefined);
    const suggestion = buildClosingEntrySuggestion(entries);
    if (!suggestion) {
      res.json({ suggestion: null, message: 'No revenue or expense to close for this period.' });
      return;
    }
    res.json({ suggestion });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    if (message.includes('No unadjusted trial balance')) {
      res.status(404).json({ error: 'No trial balance for period', message });
      return;
    }
    res.status(500).json({ error: 'Closing entries failed', message });
  }
});

router.post('/closing-entries/add', async (req: Request, res: Response) => {
  try {
    const body = req.body as { periodLabel: string };
    if (!body?.periodLabel) {
      res.status(400).json({ error: 'periodLabel required' });
      return;
    }
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    await assertPeriodNotLocked(body.periodLabel, tenantId ?? undefined, pool);
    const entries = await getAdjustedTrialBalance(tenantId ?? '', body.periodLabel, pool ?? undefined);
    const suggestion = buildClosingEntrySuggestion(entries);
    if (!suggestion) {
      res.status(400).json({ error: 'No closing entry to add', message: 'No revenue or expense to close for this period.' });
      return;
    }
    const added = await addJEAsAdjustments(body.periodLabel, [suggestion], tenantId ?? undefined, pool);
    res.json({ added, count: added.length });
  } catch (e) {
    if (e instanceof PeriodLockedError) {
      const pool = getTenantPool(req);
      const tenantId = getTenantId(req);
      if (pool && tenantId) {
        appendAuditLog(
          { action: 'period_edit_blocked', resource: `period:${e.periodLabel}`, detail: 'Period is locked', actor: (req as AuthRequest).userId ?? 'anonymous' },
          { pool, tenantId }
        );
      }
      return res.status(403).json({ error: 'Period locked', periodLabel: e.periodLabel });
    }
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Add closing entry failed', message });
  }
});

export default router;
