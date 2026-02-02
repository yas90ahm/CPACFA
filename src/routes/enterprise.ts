/**
 * Enterprise API — M&A (QoE, WC adjustment), Financing (covenant monitoring), Tax strategy, Tax returns.
 * Optional: engagementId / tenantId for advisory multi-client.
 */

import { Router, type Request, type Response } from 'express';
import {
  buildQualityOfEarnings,
  buildWorkingCapitalAdjustment,
  monitorCovenants,
} from '../services/enterprise_m_and_a_financing_service.js';
import { getTaxStrategy } from '../services/tax_strategy_service.js';
import { buildTaxProvision } from '../services/tax_provision_service.js';
import {
  addFilingCalendarItem,
  listFilingCalendarItems,
  updateFilingStatus,
  getUpcomingWithReminders,
} from '../services/filing_calendar_service.js';
import {
  createReturn,
  getReturn,
  listReturns,
  updateReturnStatus,
  attachProvision,
  listUpcomingReturns,
} from '../services/tax_return_service.js';
import { explainTaxTieOutAgentic } from '../services/agentic_tax_tie_out.js';
import { buildStatutoryReconciliation } from '../services/statutory_reconciliation_service.js';
import { explainStatutoryReconciliationAgentic } from '../services/agentic_statutory_reconciliation.js';
import { explainCovenantsAgentic } from '../services/agentic_covenant_commentary.js';
import { send500 } from '../lib/errorHandler.js';

const getTenantId = (req: Request): string => (req as Request & { tenantId?: string }).tenantId ?? 'default';
const getTenantPool = (req: Request): import('pg').Pool | undefined =>
  (req as Request & { tenantPool?: import('pg').Pool }).tenantPool;

const router = Router();

/** POST /api/enterprise/quality-of-earnings — QoE: EBITDA and adjusted EBITDA */
router.post('/quality-of-earnings', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      reportedNetIncome: number;
      interest: number;
      taxes: number;
      depreciation: number;
      amortization: number;
      addBacks?: number;
      ownerCompAdjustment?: number;
      engagementId?: string;
    };
    if (
      body?.reportedNetIncome == null ||
      body?.interest == null ||
      body?.taxes == null ||
      body?.depreciation == null ||
      body?.amortization == null
    ) {
      res.status(400).json({ error: 'Missing required QoE fields (reportedNetIncome, interest, taxes, depreciation, amortization)' });
      return;
    }
    const result = buildQualityOfEarnings({
      reportedNetIncome: body.reportedNetIncome,
      interest: body.interest,
      taxes: body.taxes,
      depreciation: body.depreciation,
      amortization: body.amortization,
      addBacks: body.addBacks,
      ownerCompAdjustment: body.ownerCompAdjustment,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Quality of earnings failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/enterprise/working-capital-adjustment — WC adjustment for M&A */
router.post('/working-capital-adjustment', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      currentAssets: number;
      currentLiabilities: number;
      targetWCDays?: number;
      revenue?: number;
      engagementId?: string;
    };
    if (body?.currentAssets == null || body?.currentLiabilities == null) {
      res.status(400).json({ error: 'Missing currentAssets or currentLiabilities' });
      return;
    }
    const result = buildWorkingCapitalAdjustment({
      currentAssets: body.currentAssets,
      currentLiabilities: body.currentLiabilities,
      targetWCDays: body.targetWCDays,
      revenue: body.revenue,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Working capital adjustment failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/enterprise/covenants — Covenant monitoring (debt/EBITDA, interest coverage). Body may include explain: true for agentic commentary. */
router.post('/covenants', async (req: Request, res: Response) => {
  try {
    const body = req.body as {
      debt: number;
      ebitda: number;
      interestExpense: number;
      maxDebtToEbitda?: number;
      minInterestCoverage?: number;
      engagementId?: string;
      explain?: boolean;
    };
    if (body?.debt == null || body?.ebitda == null || body?.interestExpense == null) {
      res.status(400).json({ error: 'Missing debt, ebitda, or interestExpense' });
      return;
    }
    const result = monitorCovenants(
      { debt: body.debt, ebitda: body.ebitda, interestExpense: body.interestExpense },
      {
        maxDebtToEbitda: body.maxDebtToEbitda,
        minInterestCoverage: body.minInterestCoverage,
      }
    );
    if (body.explain) {
      const narrative = await explainCovenantsAgentic(result);
      res.json({ result, narrative });
      return;
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Covenant monitoring failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/enterprise/covenants/explain — Agentic narrative for an existing covenant result */
router.post('/covenants/explain', async (req: Request, res: Response) => {
  try {
    const result = req.body as import('../services/enterprise_m_and_a_financing_service.js').CovenantResult;
    if (!result || typeof result.debtToEbitda !== 'number') {
      res.status(400).json({ error: 'Missing or invalid covenant result' });
      return;
    }
    const narrative = await explainCovenantsAgentic(result);
    res.json({ narrative });
  } catch (e) {
    res.status(500).json({
      error: 'Covenant explain failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/enterprise/covenants/next-test — Next covenant test date (quarter-end) — FW3 */
router.get('/covenants/next-test', (req: Request, res: Response) => {
  try {
    const asOf = (req.query.asOf as string) || new Date().toISOString().slice(0, 10);
    const d = new Date(asOf + 'T12:00:00Z');
    const year = d.getUTCFullYear();
    const month = d.getUTCMonth();
    const quarter = Math.floor(month / 3) + 1;
    const endOfQuarter = new Date(Date.UTC(year, quarter * 3 + 1, 0));
    const nextTestDate = endOfQuarter.toISOString().slice(0, 10);
    res.json({ nextTestDate, asOf, note: 'Quarter-end covenant test date; override via config if needed.' });
  } catch (e) {
    res.status(500).json({
      error: 'Next covenant test failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/enterprise/tax-strategy — Tax jurisdictions and proactive suggestions */
router.post('/tax-strategy', (req: Request, res: Response) => {
  try {
    const body = req.body as {
      revenue: number;
      taxableIncome?: number;
      jurisdictions?: string[];
      engagementId?: string;
    };
    if (body?.revenue == null) {
      res.status(400).json({ error: 'Missing revenue' });
      return;
    }
    const result = getTaxStrategy({
      revenue: body.revenue,
      taxableIncome: body.taxableIncome,
      jurisdictions: body.jurisdictions,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Tax strategy failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/enterprise/tax-provision — Tax provision (current, deferred, rate reconciliation) */
router.post('/tax-provision', (req: Request, res: Response) => {
  try {
    const body = req.body as import('../types/tax_statutory.js').TaxProvisionInput;
    if (body?.pretaxIncome == null || body?.statutoryRate == null) {
      res.status(400).json({ error: 'Missing pretaxIncome or statutoryRate' });
      return;
    }
    const result = buildTaxProvision(body);
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Tax provision failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/enterprise/filing-calendar — Add filing/payment deadline */
router.post('/filing-calendar', async (req: Request, res: Response) => {
  try {
    const body = req.body as Omit<import('../types/tax_statutory.js').FilingCalendarItem, 'id'>;
    if (!body?.type || !body?.name || !body?.dueDate) {
      res.status(400).json({ error: 'Missing type, name, or dueDate' });
      return;
    }
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const item = await addFilingCalendarItem(body, pool, tenantId);
    res.status(201).json(item);
  } catch (e) {
    send500(res, e, 'Add filing calendar failed');
  }
});

/** GET /api/enterprise/filing-calendar — List filing calendar (optional entityId, type, fromDate, toDate). Query reminderDays for FW3: upcoming with reminder flag. */
router.get('/filing-calendar', async (req: Request, res: Response) => {
  try {
    const entityId = req.query.entityId as string | undefined;
    const type = req.query.type as 'tax' | 'statutory' | 'covenant' | 'other' | undefined;
    const fromDate = req.query.fromDate as string | undefined;
    const toDate = req.query.toDate as string | undefined;
    const reminderDays = req.query.reminderDays != null ? Number(req.query.reminderDays) : undefined;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    if (reminderDays != null && !Number.isNaN(reminderDays)) {
      const items = await getUpcomingWithReminders({ entityId, fromDate, toDate, reminderDays }, pool, tenantId);
      res.json({ items });
      return;
    }
    const items = await listFilingCalendarItems({ entityId, type, fromDate, toDate }, pool, tenantId);
    res.json({ items });
  } catch (e) {
    send500(res, e, 'List filing calendar failed');
  }
});

/** PATCH /api/enterprise/filing-calendar/:id — Update filing status */
router.patch('/filing-calendar/:id', async (req: Request, res: Response) => {
  try {
    const body = req.body as { status: 'pending' | 'filed' | 'extended' };
    if (!body?.status) {
      res.status(400).json({ error: 'Missing status' });
      return;
    }
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const item = await updateFilingStatus(req.params.id, body.status, pool, tenantId);
    if (!item) {
      res.status(404).json({ error: 'Filing item not found' });
      return;
    }
    res.json(item);
  } catch (e) {
    send500(res, e, 'Update filing status failed');
  }
});

/** GET /api/enterprise/tax-returns — List tax returns (optional entityId, jurisdiction, periodLabel, status) */
router.get('/tax-returns', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.json({ returns: [] });
      return;
    }
    const entityId = req.query.entityId as string | undefined;
    const jurisdiction = req.query.jurisdiction as string | undefined;
    const periodLabel = req.query.periodLabel as string | undefined;
    const status = req.query.status as import('../types/tax_statutory.js').TaxReturnStatus | undefined;
    const list = await listReturns(pool, tenantId, { entityId, jurisdiction, periodLabel, status });
    const explain = req.query.explain === 'true' && list.length > 0;
    if (explain && list[0]) {
      const narrative = await explainTaxTieOutAgentic(list[0]);
      res.json({ returns: list, tieOutNarrativeForFirst: narrative });
      return;
    }
    res.json({ returns: list });
  } catch (e) {
    send500(res, e, 'List tax returns failed');
  }
});

/** GET /api/enterprise/tax-returns/upcoming — Returns due within reminder window (draft, due soon) */
router.get('/tax-returns/upcoming', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.json({ returns: [] });
      return;
    }
    const reminderDays = req.query.reminderDays != null ? Number(req.query.reminderDays) : 30;
    const list = await listUpcomingReturns(pool, tenantId, reminderDays);
    res.json({ returns: list });
  } catch (e) {
    send500(res, e, 'List upcoming tax returns failed');
  }
});

/** POST /api/enterprise/tax-returns — Create tax return */
router.post('/tax-returns', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const body = req.body as {
      entityId: string;
      jurisdiction: string;
      periodLabel: string;
      type?: import('../types/tax_statutory.js').TaxReturnType;
      dueDate: string;
      status?: import('../types/tax_statutory.js').TaxReturnStatus;
    };
    if (!body?.entityId || !body?.jurisdiction || !body?.periodLabel || !body?.dueDate) {
      res.status(400).json({ error: 'Missing entityId, jurisdiction, periodLabel, or dueDate' });
      return;
    }
    const ret = await createReturn(pool, tenantId, {
      entityId: body.entityId,
      jurisdiction: body.jurisdiction,
      periodLabel: body.periodLabel,
      type: body.type ?? 'income_tax',
      status: body.status ?? 'draft',
      dueDate: body.dueDate,
    });
    res.status(201).json(ret);
  } catch (e) {
    send500(res, e, 'Create tax return failed');
  }
});

/** GET /api/enterprise/tax-returns/:id — Get one tax return; ?explain=true for tie-out narrative */
router.get('/tax-returns/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(404).json({ error: 'Tax return not found' });
      return;
    }
    const ret = await getReturn(pool, req.params.id, tenantId);
    if (!ret) {
      res.status(404).json({ error: 'Tax return not found' });
      return;
    }
    const explain = req.query.explain === 'true' || req.query.explain === '1';
    if (explain) {
      const narrative = await explainTaxTieOutAgentic(ret);
      res.json({ ...ret, tieOutNarrative: narrative });
      return;
    }
    res.json(ret);
  } catch (e) {
    send500(res, e, 'Get tax return failed');
  }
});

/** POST /api/enterprise/tax-returns/:id/tie-out-narrative — Agentic tie-out narrative */
router.post('/tax-returns/:id/tie-out-narrative', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const ret = await getReturn(pool, req.params.id, tenantId);
    if (!ret) {
      res.status(404).json({ error: 'Tax return not found' });
      return;
    }
    const narrative = await explainTaxTieOutAgentic(ret);
    res.json({ tieOutNarrative: narrative });
  } catch (e) {
    send500(res, e, 'Tax tie-out narrative failed');
  }
});

/** PATCH /api/enterprise/tax-returns/:id — Update status (draft | in_review | filed | extended); optional attach provisionSnapshot, priorYearFigures */
router.patch('/tax-returns/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const body = req.body as {
      status?: import('../types/tax_statutory.js').TaxReturnStatus;
      filedAt?: string;
      provisionSnapshot?: Record<string, unknown>;
      priorYearFigures?: Record<string, unknown>;
    };
    if (body?.provisionSnapshot != null) {
      const updated = await attachProvision(
        pool,
        req.params.id,
        tenantId,
        body.provisionSnapshot,
        body?.priorYearFigures
      );
      if (!updated) {
        res.status(404).json({ error: 'Tax return not found' });
        return;
      }
      if (body?.status != null) {
        const withStatus = await updateReturnStatus(pool, req.params.id, tenantId, {
          status: body.status,
          filedAt: body.filedAt,
        });
        res.json(withStatus ?? updated);
        return;
      }
      res.json(updated);
      return;
    }
    if (body?.status != null) {
      const updated = await updateReturnStatus(pool, req.params.id, tenantId, {
        status: body.status,
        filedAt: body.filedAt,
      });
      if (!updated) {
        res.status(404).json({ error: 'Tax return not found' });
        return;
      }
      res.json(updated);
      return;
    }
    res.status(400).json({ error: 'Missing status or provisionSnapshot' });
  } catch (e) {
    send500(res, e, 'Update tax return failed');
  }
});

/** POST /api/enterprise/statutory-reconciliation — Management vs statutory view reconciliation (optional explain=true for agentic narrative) */
router.post('/statutory-reconciliation', async (req: Request, res: Response) => {
  try {
    const body = req.body as import('../types/statutory_view.js').StatutoryReconciliationInput & { explain?: boolean };
    if (!body?.periodLabel || !body?.managementLines || !Array.isArray(body.managementLines) || !body?.statutoryLines || !Array.isArray(body.statutoryLines)) {
      res.status(400).json({ error: 'Missing periodLabel, managementLines, or statutoryLines' });
      return;
    }
    const result = buildStatutoryReconciliation({
      periodLabel: body.periodLabel,
      managementLines: body.managementLines,
      statutoryLines: body.statutoryLines,
    });
    if (body.explain) {
      try {
        result.narrative = await explainStatutoryReconciliationAgentic(result);
      } catch {
        /* keep narrative undefined */
      }
    }
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Statutory reconciliation failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
