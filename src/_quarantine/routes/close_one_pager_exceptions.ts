/**
 * Close one-pager and exceptions routes: one-pager, one-pager/export/pdf, exceptions, tie-out/narrative.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { buildCloseOnePager, exportCloseOnePagerToPdf } from '../../services/close_one_pager_service.js';
import { getCloseExceptions } from '../../services/close_exceptions_service.js';
import { generateCloseExceptionsNarrativeAgentic } from '../../services/agentic_close_exceptions.js';
import { buildReconciliationTieOut } from '../../services/reconciliation_tie_out_service.js';
import { generateTieOutNarrativeAgentic } from '../../services/agentic_tie_out_narrative.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();

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
    send500(res, e, 'Close one-pager failed');
  }
});

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
    send500(res, e, 'Close one-pager PDF export failed');
  }
});

router.get('/exceptions', async (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string;
    const includeNarrative = String(req.query.includeNarrative ?? '') === 'true';
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel query' });
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
    send500(res, e, 'Close exceptions failed');
  }
});

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
    send500(res, e, 'Tie-out narrative failed');
  }
});

export default router;
