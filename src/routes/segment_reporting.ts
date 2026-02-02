/**
 * Segment reporting API — segments, financials, reconciliation (IFRS 8 / ASC 280).
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  createSegment,
  getSegment,
  listSegments,
  updateSegment,
  deleteSegment,
  createSegmentFinancials,
  listSegmentFinancials,
  createReconciliation,
  listReconciliations,
  buildSegmentReport,
  applyTenPercentTest,
} from '../services/segment_reporting_service.js';
import {
  suggestSegmentsAgentic,
  suggestAllocationAgentic,
  suggestReconcilingItemsAgentic,
  generateSegmentFootnoteAgentic,
} from '../services/agentic_segment_reporting.js';

const router = Router();

/** POST /api/segments — Create a segment */
router.post('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!body?.segmentName) {
      res.status(400).json({ error: 'Missing segmentName' });
      return;
    }
    const segment = await createSegment(tenantId, pool, {
      segmentName: body.segmentName,
      description: body.description,
      codmReportBasis: body.codmReportBasis,
      aggregationCriteria: body.aggregationCriteria,
      isReportable: body.isReportable ?? true,
    });
    res.status(201).json(segment);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create segment failed', message });
  }
});

/** GET /api/segments — List segments */
router.get('/', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const segments = await listSegments(tenantId, pool);
    res.json({ segments });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List segments failed', message });
  }
});

/** GET /api/segments/:id — Get a specific segment */
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and ID required' });
      return;
    }
    const segment = await getSegment(tenantId, pool, id);
    if (!segment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    res.json(segment);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Get segment failed', message });
  }
});

/** PATCH /api/segments/:id — Update a segment */
router.patch('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and ID required' });
      return;
    }
    const segment = await updateSegment(tenantId, pool, id, req.body);
    if (!segment) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    res.json(segment);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Update segment failed', message });
  }
});

/** DELETE /api/segments/:id — Delete a segment */
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const id = req.params.id;
    if (!tenantId || !pool || !id) {
      res.status(400).json({ error: 'Tenant context and ID required' });
      return;
    }
    const deleted = await deleteSegment(tenantId, pool, id);
    if (!deleted) {
      res.status(404).json({ error: 'Segment not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Delete segment failed', message });
  }
});

/** POST /api/segments/:id/financials — Add segment financials */
router.post('/:id/financials', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const segmentId = req.params.id;
    const body = req.body;
    if (!tenantId || !pool || !segmentId) {
      res.status(400).json({ error: 'Tenant context and segment ID required' });
      return;
    }
    if (!body?.periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel' });
      return;
    }
    const financials = await createSegmentFinancials(tenantId, pool, {
      segmentId,
      periodLabel: body.periodLabel,
      revenue: body.revenue,
      intersegmentRevenue: body.intersegmentRevenue,
      externalRevenue: body.externalRevenue,
      profitLoss: body.profitLoss,
      assets: body.assets,
      liabilities: body.liabilities,
      capitalExpenditures: body.capitalExpenditures,
      depreciation: body.depreciation,
    });
    res.status(201).json(financials);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create financials failed', message });
  }
});

/** GET /api/segments/financials — List segment financials */
router.get('/financials/list', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const segmentId = req.query.segmentId as string | undefined;
    const financials = await listSegmentFinancials(tenantId, pool, periodLabel, segmentId);
    res.json({ financials });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List financials failed', message });
  }
});

/** POST /api/segments/reconciliation — Create reconciliation */
router.post('/reconciliation', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    const body = req.body;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    if (!body?.periodLabel || !body?.itemType || body?.segmentTotal == null || body?.consolidatedTotal == null) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const reconciliation = await createReconciliation(tenantId, pool, {
      periodLabel: body.periodLabel,
      itemType: body.itemType,
      segmentTotal: body.segmentTotal,
      consolidatedTotal: body.consolidatedTotal,
      reconcilingItems: body.reconcilingItems ?? [],
    });
    res.status(201).json(reconciliation);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Create reconciliation failed', message });
  }
});

/** GET /api/segments/reconciliation — List reconciliations */
router.get('/reconciliation/list', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const reconciliations = await listReconciliations(tenantId, pool, periodLabel);
    res.json({ reconciliations });
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'List reconciliations failed', message });
  }
});

/** GET /api/segments/report — Build segment report */
router.get('/report', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const periodLabel = req.query.periodLabel as string;
    const revenue = Number(req.query.consolidatedRevenue) || 0;
    const profit = Number(req.query.consolidatedProfit) || 0;
    const assets = Number(req.query.consolidatedAssets) || 0;
    
    if (!periodLabel) {
      res.status(400).json({ error: 'Missing periodLabel' });
      return;
    }
    const report = await buildSegmentReport(tenantId, pool, periodLabel, { revenue, profit, assets });
    res.json(report);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Build report failed', message });
  }
});

/** POST /api/segments/ten-percent-test — Apply 10% test */
router.post('/ten-percent-test', (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.segments || !body?.consolidatedRevenue || !body?.consolidatedProfit || !body?.consolidatedAssets) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const result = applyTenPercentTest(
      body.segments,
      body.consolidatedRevenue,
      body.consolidatedProfit,
      body.consolidatedAssets
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: '10% test failed', message });
  }
});

/** POST /api/segments/suggest — Agentic segment identification */
router.post('/suggest', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.codmReports || !body?.businessDescription) {
      res.status(400).json({ error: 'Missing codmReports or businessDescription' });
      return;
    }
    const result = await suggestSegmentsAgentic(body.codmReports, body.businessDescription);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest segments failed', message });
  }
});

/** POST /api/segments/allocate — Agentic cost allocation */
router.post('/allocate', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body?.sharedCosts == null || !body?.segmentMetrics) {
      res.status(400).json({ error: 'Missing sharedCosts or segmentMetrics' });
      return;
    }
    const result = await suggestAllocationAgentic(
      body.sharedCosts,
      body.allocationBasis ?? 'revenue',
      body.segmentMetrics
    );
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Allocation failed', message });
  }
});

/** POST /api/segments/suggest-reconciling — Agentic reconciling items */
router.post('/suggest-reconciling', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (body?.segmentTotal == null || body?.consolidatedTotal == null || !body?.itemType) {
      res.status(400).json({ error: 'Missing required fields' });
      return;
    }
    const result = await suggestReconcilingItemsAgentic(body.segmentTotal, body.consolidatedTotal, body.itemType);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Suggest reconciling failed', message });
  }
});

/** POST /api/segments/footnote — Generate segment footnote */
router.post('/footnote', async (req: Request, res: Response) => {
  try {
    const body = req.body;
    if (!body?.segmentReport) {
      res.status(400).json({ error: 'Missing segmentReport' });
      return;
    }
    const result = await generateSegmentFootnoteAgentic(body.segmentReport);
    res.json(result);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    res.status(500).json({ error: 'Footnote generation failed', message });
  }
});

export default router;
