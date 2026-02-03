/**
 * Close package routes: package GET, package/export/pdf, package/export/csv.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { buildClosePackage } from '../../services/close_package_service.js';
import { exportClosePackageToPdf, exportClosePackageToCsv } from '../../services/close_package_export_service.js';
import { generateCloseNarrativeAgentic } from '../../services/agentic_close_narrative.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();

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

export default router;
