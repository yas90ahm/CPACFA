/**
 * Management and board reporting packs, commentary library.
 */

import { Router, type Request, type Response } from 'express';
import {
  getPackTemplate,
  listPackTemplates,
  buildReportPack,
} from '../services/pack_builder_service.js';
import { recordPackRun, listPackRuns, getPackRun } from '../services/pack_run_service.js';
import {
  listCommentarySnippets,
  getCommentarySnippet,
  addCommentarySnippet,
  searchCommentaryByTags,
} from '../services/commentary_library_service.js';
import type { ReportPackInput } from '../types/reporting_packs.js';

const router = Router();

/** GET /api/reporting/pack-templates — List pack templates */
router.get('/pack-templates', (_req: Request, res: Response) => {
  try {
    const templates = listPackTemplates();
    res.json({ templates });
  } catch (e) {
    res.status(500).json({
      error: 'List pack templates failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/reporting/pack-templates/:id — Get one pack template */
router.get('/pack-templates/:id', (req: Request, res: Response) => {
  try {
    const template = getPackTemplate(req.params.id);
    if (!template) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    res.json(template);
  } catch (e) {
    res.status(500).json({
      error: 'Get pack template failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/reporting/suggest-commentary — Agentic commentary suggestion for report/pack */
router.post('/suggest-commentary', validateBody(suggestCommentarySchema), async (req: Request, res: Response) => {
  try {
    const body = req.body as { reportType: string; periodLabel?: string; keyNumbers?: Record<string, number> };
    const result = await suggestReportingCommentaryAgentic({
      reportType: body.reportType,
      periodLabel: body.periodLabel,
      keyNumbers: body.keyNumbers,
    });
    res.json({ commentary: result.commentary, bullets: result.bullets });
  } catch (e) {
    res.status(500).json({
      error: 'Suggest commentary failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/reporting/pack — Build report pack from template + data; records pack run for "as at" (FW2) */
router.post('/pack', (req: Request, res: Response) => {
  try {
    const body = req.body as ReportPackInput;
    if (!body?.templateId || !body?.periodLabel) {
      res.status(400).json({ error: 'Missing templateId or periodLabel' });
      return;
    }
    const result = buildReportPack(body);
    if (!result) {
      res.status(404).json({ error: 'Template not found' });
      return;
    }
    const run = recordPackRun({ templateId: body.templateId, periodLabel: body.periodLabel, result });
    res.json({ ...result, runId: run.id, asAt: run.asAt });
  } catch (e) {
    res.status(500).json({
      error: 'Build report pack failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/reporting/pack/runs — List pack runs (optional periodLabel, templateId) — FW2 */
router.get('/pack/runs', (req: Request, res: Response) => {
  try {
    const periodLabel = req.query.periodLabel as string | undefined;
    const templateId = req.query.templateId as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const runs = listPackRuns({ periodLabel, templateId, limit });
    res.json({ runs });
  } catch (e) {
    res.status(500).json({
      error: 'List pack runs failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/reporting/pack/runs/:id — Get one pack run — FW2 */
router.get('/pack/runs/:id', (req: Request, res: Response) => {
  try {
    const run = getPackRun(req.params.id);
    if (!run) {
      res.status(404).json({ error: 'Pack run not found' });
      return;
    }
    res.json(run);
  } catch (e) {
    res.status(500).json({
      error: 'Get pack run failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/reporting/commentary — List commentary snippets (optional tag) */
router.get('/commentary', (req: Request, res: Response) => {
  try {
    const tag = req.query.tag as string | undefined;
    const snippets = listCommentarySnippets(tag);
    res.json({ snippets });
  } catch (e) {
    res.status(500).json({
      error: 'List commentary failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/reporting/commentary/:id — Get one commentary snippet */
router.get('/commentary/:id', (req: Request, res: Response) => {
  try {
    const snippet = getCommentarySnippet(req.params.id);
    if (!snippet) {
      res.status(404).json({ error: 'Commentary snippet not found' });
      return;
    }
    res.json(snippet);
  } catch (e) {
    res.status(500).json({
      error: 'Get commentary failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/reporting/commentary — Add commentary snippet */
router.post('/commentary', (req: Request, res: Response) => {
  try {
    const body = req.body as { label: string; text: string; tags?: string[] };
    if (!body?.label || !body?.text) {
      res.status(400).json({ error: 'Missing label or text' });
      return;
    }
    const snippet = addCommentarySnippet(body);
    res.json(snippet);
  } catch (e) {
    res.status(500).json({
      error: 'Add commentary failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/reporting/commentary/search — Search commentary by tags */
router.post('/commentary/search', (req: Request, res: Response) => {
  try {
    const body = req.body as { tags: string[] };
    if (!Array.isArray(body?.tags)) {
      res.status(400).json({ error: 'Missing tags array' });
      return;
    }
    const snippets = searchCommentaryByTags(body.tags);
    res.json({ snippets });
  } catch (e) {
    res.status(500).json({
      error: 'Search commentary failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
