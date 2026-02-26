/**
 * Report pack routes — management and board reporting packs.
 * Mounted at /api/close via close/index.ts.
 *
 * Endpoints:
 *   GET  /sessions/:sessionId/report-pack/templates         — List available pack templates
 *   GET  /sessions/:sessionId/report-pack/templates/:id     — Get single pack template
 *   POST /sessions/:sessionId/report-pack/generate          — Generate report pack (requires certified/locked)
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  listPackTemplates,
  getPackTemplate,
  buildReportPack,
} from '../../services/pack_builder_service.js';
import { listStatementPackages, getStatementPackageWithLines } from '../../services/statement_package_service.js';
import { checkVarianceCompleteness } from '../../services/variance_analysis_service.js';

const router = Router();

/** GET /sessions/:sessionId/report-pack/templates — List available pack templates. */
router.get('/sessions/:sessionId/report-pack/templates', async (_req: Request, res: Response) => {
  try {
    const templates = listPackTemplates();
    res.json({ templates });
  } catch (e) {
    send500(res, e, 'List pack templates failed');
  }
});

/** GET /sessions/:sessionId/report-pack/templates/:id — Get a single template. */
router.get('/sessions/:sessionId/report-pack/templates/:id', async (req: Request, res: Response) => {
  try {
    const template = getPackTemplate(req.params.id!);
    if (!template) {
      res.status(404).json({ error: 'Pack template not found' });
      return;
    }
    res.json({ template });
  } catch (e) {
    send500(res, e, 'Get pack template failed');
  }
});

/** POST /sessions/:sessionId/report-pack/generate — Generate report pack from certified data.
 *  Requires session status to be certified or locked (pack reflects certified statements). */
router.post('/sessions/:sessionId/report-pack/generate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { sessionId } = req.params;
    const session = await getCloseSessionById(pool, tenantId, sessionId!);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }
    if (session.status !== 'certified' && session.status !== 'locked') {
      res.status(409).json({
        error: 'Report pack can only be generated from certified or locked sessions.',
        code: 'SESSION_NOT_CERTIFIED',
        currentStatus: session.status,
      });
      return;
    }

    const body = req.body as { templateId?: string; commentary?: string; onePager?: string };
    const templateId = body.templateId ?? 'monthly-cfo';
    const template = getPackTemplate(templateId);
    if (!template) {
      res.status(400).json({ error: `Unknown template: ${templateId}` });
      return;
    }

    // Assemble data from latest statement package
    const packages = await listStatementPackages(pool, tenantId, sessionId!, 1);
    const latestPkg = packages[0];
    let pl: Record<string, number> = {};
    let bs: Record<string, number> = {};
    let cash: Record<string, number> = {};
    if (latestPkg) {
      const pkgWithLines = await getStatementPackageWithLines(pool, tenantId, latestPkg.id);
      if (pkgWithLines) {
        for (const line of pkgWithLines.lines) {
          const key = line.fsLineId ?? `line-${line.displayOrder ?? 0}`;
          const amount = Number(line.amount);
          if (line.statement === 'profit_and_loss') pl[key] = amount;
          else if (line.statement === 'balance_sheet') bs[key] = amount;
          else if (line.statement === 'cash_flow') cash[key] = amount;
        }
      }
    }

    // Assemble variance summary
    let varianceSummary: string | undefined;
    try {
      const vResult = await checkVarianceCompleteness(pool, tenantId, sessionId!);
      varianceSummary = `Material variances: ${vResult.totalMaterial}, explained: ${vResult.explained}, unexplained: ${vResult.unexplained}`;
    } catch {
      varianceSummary = undefined;
    }

    const periodLabel = `${session.periodStart}..${session.periodEnd}`;
    const pack = buildReportPack({
      templateId,
      periodLabel,
      pl,
      bs,
      cash,
      varianceSummary,
      commentary: body.commentary,
      onePager: body.onePager,
    });
    if (!pack) {
      res.status(500).json({ error: 'Failed to build report pack' });
      return;
    }
    res.json({ pack });
  } catch (e) {
    send500(res, e, 'Generate report pack failed');
  }
});

export default router;
