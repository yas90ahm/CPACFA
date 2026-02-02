/**
 * Capital allocation API — ROI, payback, portfolio.
 */

import { Router, type Request, type Response } from 'express';
import { computeProjectMetrics, buildPortfolio } from '../services/capital_allocation_service.js';
import type { ProjectInput } from '../services/capital_allocation_service.js';
import { generateCapitalProjectNarrativeAgentic } from '../services/agentic_forecasting_capital.js';

const router = Router();

/** POST /api/capital/project-metrics/narrative — Agentic payback/ROI narrative for project metrics */
router.post('/project-metrics/narrative', async (req: Request, res: Response) => {
  try {
    const body = req.body as { paybackYears?: number; roi?: number; projectName?: string };
    const narrative = await generateCapitalProjectNarrativeAgentic({
      paybackYears: body.paybackYears,
      roi: body.roi,
      projectName: body.projectName,
    });
    res.json({ narrative });
  } catch (e) {
    res.status(500).json({
      error: 'Project metrics narrative failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/capital/project-metrics — ROI and payback for a single project */
router.post('/project-metrics', (req: Request, res: Response) => {
  try {
    const body = req.body as ProjectInput;
    if (!body?.id || body?.initialCost == null) {
      res.status(400).json({ error: 'Missing id or initialCost' });
      return;
    }
    const metrics = computeProjectMetrics(body);
    res.json(metrics);
  } catch (e) {
    res.status(500).json({
      error: 'Project metrics failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/capital/portfolio — Portfolio of projects with ROI and payback */
router.post('/portfolio', (req: Request, res: Response) => {
  try {
    const body = req.body as { projects: ProjectInput[] };
    if (!Array.isArray(body?.projects)) {
      res.status(400).json({ error: 'Missing or invalid "projects" array' });
      return;
    }
    const result = buildPortfolio(body.projects);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Portfolio failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
