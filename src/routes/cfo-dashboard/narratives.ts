/**
 * CFO Dashboard — Narratives (MD&A, versioning), variance analysis, sensitivity, board one-pager/deck, pointed-question.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import {
  computeCFOKPIs,
  generateMDANarrative,
  runPointedQuestionSensitivity,
  runPointedQuestionSensitivityAsync,
} from '../../services/executive_summarizer.js';
import {
  getMateriality,
  materialityThresholdFromSettings,
} from '../../services/materiality_service.js';
import {
  buildVarianceAnalysis,
  buildMultiPeriodVariance,
  snapshotToLines,
} from '../../services/variance_analysis_service.js';
import { buildSensitivityReport } from '../../services/sensitivity_report_service.js';
import { generateMDANarrativeAgentic } from '../../services/agentic_mda_service.js';
import {
  explainVarianceAgentic,
  explainScenarioAgentic,
  explainSensitivityReportAgentic,
  explainMultiPeriodVarianceAgentic,
} from '../../services/agentic_variance_explainer.js';
import {
  refineVarianceDriversAgentic,
  mergeRefinedDriversIntoLines,
} from '../../services/agentic_variance_drivers.js';
import { generateKPICommentaryAgentic } from '../../services/agentic_kpi_commentary.js';
import { recommendScenariosAgentic } from '../../services/scenario_recommendation_service.js';
import { generateBoardOnePagerAgentic } from '../../services/agentic_board_one_pager.js';
import { generateBoardDeckAgentic } from '../../services/agentic_board_deck_service.js';
import { buildCfoViewFromSnapshotAndReports } from '../../services/lead_partner_cfo_view_service.js';
import { runLeadPartner } from '../../services/lead_partner_orchestrator.js';
import {
  storeNarrativeVersion,
  listNarrativeVersions,
  getNarrativeVersion,
} from '../../services/narrative_version_service.js';
import { isPeriodLocked } from '../../services/period_lock_service.js';
import { storeDecision } from '../../memory/index.js';
import { validateBody, validateParams, validateQuery } from '../../middleware/validationMiddleware.js';
import {
  narrativeBodySchema,
  narrativeAgenticBodySchema,
  narrativeVersionBodySchema,
  narrativeVersionQuerySchema,
  narrativeVersionIdParamSchema,
  varianceBodySchema,
  varianceExplainBodySchema,
  varianceDriversRefineBodySchema,
  varianceMultiPeriodBodySchema,
  varianceHitlConfirmBodySchema,
  kpiCommentaryBodySchema,
  scenarioRecommendBodySchema,
  leadPartnerViewBodySchema,
  boardOnePagerBodySchema,
  boardDeckBodySchema,
  pointedQuestionBodySchema,
  pointedQuestionInterpretBodySchema,
  sensitivityReportBodySchema,
  sensitivityReportInterpretBodySchema,
} from '../../schemas/cfoDashboardSchemas.js';
import type { VarianceReport } from '../../types/cfo-dashboard.js';

const router = Router();

/** POST /api/cfo-dashboard/narrative — MD&A style commentary from financial snapshot */
router.post('/narrative', validateBody(narrativeBodySchema), (req: Request, res: Response) => {
  try {
    const { snapshot } = req.body;
    const kpis = computeCFOKPIs(snapshot);
    const narrative = generateMDANarrative(snapshot, kpis);
    res.json({ narrative, kpis });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to generate MD&A narrative',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/narrative/agentic — LLM-enhanced MD&A */
router.post('/narrative/agentic', validateBody(narrativeAgenticBodySchema), async (req: Request, res: Response) => {
  try {
    const { snapshot, templateNarrative, periodLabel } = req.body;
    const kpis = computeCFOKPIs(snapshot);
    const period = periodLabel ?? snapshot.periodLabel ?? 'Current Period';
    const narrative = await generateMDANarrativeAgentic({
      snapshot,
      kpis,
      templateNarrative: templateNarrative ? { periodLabel: period, ...templateNarrative } : undefined,
      periodLabel,
    });
    res.json({ narrative, kpis });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to generate agentic MD&A',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/narrative/version — Store narrative version */
router.post('/narrative/version', validateBody(narrativeVersionBodySchema), (req: Request, res: Response) => {
  try {
    const body = req.body;
    const version = storeNarrativeVersion({
      type: body.type,
      periodLabel: body.periodLabel,
      content: body.content,
      asAt: body.asAt,
    });
    res.status(201).json(version);
  } catch (e) {
    res.status(500).json({
      error: 'Store narrative version failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/narrative/versions — List narrative versions */
router.get('/narrative/versions', validateQuery(narrativeVersionQuerySchema), (req: Request, res: Response) => {
  try {
    const { type, periodLabel, from, to, limit } = req.query;
    const list = listNarrativeVersions({ type, periodLabel, from, to, limit });
    res.json({ versions: list });
  } catch (e) {
    res.status(500).json({
      error: 'List narrative versions failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/narrative/versions/:id — Get one narrative version */
router.get('/narrative/versions/:id', validateParams(narrativeVersionIdParamSchema), (req: Request, res: Response) => {
  try {
    const version = getNarrativeVersion(req.params.id);
    if (!version) {
      res.status(404).json({ error: 'Narrative version not found' });
      return;
    }
    res.json(version);
  } catch (e) {
    res.status(500).json({
      error: 'Get narrative version failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/variance — Budget vs actual variance analysis */
router.post('/variance', validateBody(varianceBodySchema), async (req: Request, res: Response) => {
  try {
    const {
      budget,
      actual,
      budgetSnapshot,
      actualSnapshot,
      options,
      explain,
      useAgenticDrivers,
      includeHitlPending,
    } = req.body;
    const budgetLines = budget ?? (budgetSnapshot ? snapshotToLines(budgetSnapshot) : []);
    const actualLines = actual ?? (actualSnapshot ? snapshotToLines(actualSnapshot) : []);
    if (budgetLines.length === 0 && actualLines.length === 0) {
      res.status(400).json({ error: 'Provide "budget" and "actual" line arrays, or "budgetSnapshot" and "actualSnapshot".' });
      return;
    }
    const periodLabelForLock = options?.periodLabel;
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (options?.requireLockedPriorPeriod && periodLabelForLock && !(await isPeriodLocked(periodLabelForLock, tenantId, pool))) {
      res.status(400).json({
        error: 'Period consistency: variance only allowed for locked prior period. Lock the period first or omit requireLockedPriorPeriod.',
        periodLabel: periodLabelForLock,
      });
      return;
    }
    let materialThresholdPercent = options?.materialThresholdPercent;
    let materialThresholdAmount = options?.materialThresholdAmount;
    if (materialThresholdPercent == null && materialThresholdAmount == null) {
      const settings = getMateriality(tenantId, options?.periodLabel, pool);
      const basisValue = actualSnapshot?.revenue ?? (actualSnapshot && typeof (actualSnapshot as { netIncome?: number }).netIncome === 'number' ? (actualSnapshot as { netIncome: number }).netIncome : undefined);
      const th = materialityThresholdFromSettings(settings, basisValue);
      if (th.percent != null) materialThresholdPercent = th.percent;
      if (th.amount != null) materialThresholdAmount = th.amount;
    }
    let report = buildVarianceAnalysis(budgetLines, actualLines, {
      materialThresholdPercent: materialThresholdPercent ?? 5,
      materialThresholdAmount: materialThresholdAmount ?? options?.materialThresholdAmount,
      periodLabel: options?.periodLabel,
      budgetVersionId: options?.budgetVersionId,
      budgetVersionLabel: options?.budgetVersionLabel,
      actualsSource: options?.actualsSource,
      actualsPeriodLabel: options?.actualsPeriodLabel,
    });
    if (useAgenticDrivers && report.lines.length > 0) {
      try {
        const refined = await refineVarianceDriversAgentic(report.lines);
        report = { ...report, lines: mergeRefinedDriversIntoLines(report.lines, refined) };
      } catch {
        /* keep rule-based drivers */
      }
    }
    const hitlPending = includeHitlPending
      ? report.lines
          .filter((l) => l.material && l.variance !== 0)
          .map((l) => ({
            label: l.label,
            budget: l.budget,
            actual: l.actual,
            variance: l.variance,
            variancePercent: l.variancePercent,
            suggestedDriver: l.drivers?.[0],
          }))
      : undefined;
    if (explain) {
      try {
        const narrative = await explainVarianceAgentic(report as VarianceReport);
        return res.json({ report, narrative, hitlPending });
      } catch {
        return res.json({ report, narrative: report.summaryNarrative, hitlPending });
      }
    }
    if (hitlPending !== undefined) res.json({ report, hitlPending });
    else res.json(report);
  } catch (e) {
    res.status(500).json({
      error: 'Failed to build variance analysis',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/variance/explain — Agentic narrative for an existing variance report */
router.post('/variance/explain', validateBody(varianceExplainBodySchema), async (req: Request, res: Response) => {
  try {
    const report = req.body;
    const narrative = await explainVarianceAgentic(report as VarianceReport);
    res.json({ narrative });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to explain variance',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/variance/drivers/refine — LLM-refine drivers for variance report lines */
router.post('/variance/drivers/refine', validateBody(varianceDriversRefineBodySchema), async (req: Request, res: Response) => {
  try {
    const report = req.body;
    const refined = await refineVarianceDriversAgentic(report.lines);
    const lines = mergeRefinedDriversIntoLines(report.lines, refined);
    res.json({ report: { ...report, lines }, refinedCount: refined.size });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to refine variance drivers',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/variance/multi-period — Period A vs Period B actuals variance */
router.post('/variance/multi-period', validateBody(varianceMultiPeriodBodySchema), async (req: Request, res: Response) => {
  try {
    const { periodALines, periodBLines, periodALabel, periodBLabel, options, explain } = req.body;
    const report = buildMultiPeriodVariance(periodALines, periodBLines, {
      periodALabel,
      periodBLabel,
      ...options,
    });
    if (explain) {
      try {
        const narrative = await explainMultiPeriodVarianceAgentic(report);
        return res.json({ report, narrative });
      } catch {
        return res.json({ report, narrative: report.summaryNarrative });
      }
    }
    res.json(report);
  } catch (e) {
    res.status(500).json({
      error: 'Failed to build multi-period variance',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/variance/hitl-confirm — Confirm driver/comment for material variance */
router.post('/variance/hitl-confirm', validateBody(varianceHitlConfirmBodySchema), async (req: Request, res: Response) => {
  try {
    const { reportPeriodLabel, lineLabel, confirmedDriver, confirmedComment } = req.body;
    const context = `Variance HITL: ${reportPeriodLabel} — ${lineLabel}`;
    const choice = confirmedDriver ?? 'confirmed';
    const reason = confirmedComment ?? undefined;
    const entry = await storeDecision({ context, choice, reason, period: reportPeriodLabel });
    res.json({
      ok: true,
      id: entry.id,
      storedAt: entry.storedAt,
      context,
      choice,
      reason,
    });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to store variance HITL confirmation',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/kpi-commentary — Agentic explanation of KPI changes vs prior period */
router.post('/kpi-commentary', validateBody(kpiCommentaryBodySchema), async (req: Request, res: Response) => {
  try {
    const { currentSnapshot, priorSnapshot, currentKpis, priorKpis, periodLabel, priorPeriodLabel } = req.body;
    const kpisCurrent = currentKpis ?? computeCFOKPIs(currentSnapshot);
    const commentary = await generateKPICommentaryAgentic({
      currentSnapshot,
      priorSnapshot,
      currentKpis: kpisCurrent,
      priorKpis,
      periodLabel,
      priorPeriodLabel,
    });
    res.json({ commentary });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to generate KPI commentary',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/scenario-recommend — Recommend scenario specs to hit target runway/break-even */
router.post('/scenario-recommend', validateBody(scenarioRecommendBodySchema), async (req: Request, res: Response) => {
  try {
    const { snapshot, target, buildReport, periodLabel } = req.body;
    const result = await recommendScenariosAgentic(snapshot, target ?? {}, { buildReport, periodLabel });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Failed to recommend scenarios',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/lead-partner-view — One-call Lead Partner with CFO view */
router.post('/lead-partner-view', validateBody(leadPartnerViewBodySchema), async (req: Request, res: Response) => {
  try {
    const { query, snapshot, varianceReport, sensitivityReport, periodLabel } = req.body;
    const cfoView = await buildCfoViewFromSnapshotAndReports({
      snapshot,
      varianceReport,
      sensitivityReport,
      periodLabel,
    });
    const output = await runLeadPartner({
      query: query.trim(),
      cfoView,
    });
    res.json(output);
  } catch (e) {
    res.status(500).json({
      error: 'Lead Partner with CFO view failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/board-one-pager — Board-ready one-pager */
router.post('/board-one-pager', validateBody(boardOnePagerBodySchema), async (req: Request, res: Response) => {
  try {
    const { snapshot, kpis, mdaNarrative, varianceReport, sensitivityReport, periodLabel } = req.body;
    const kpisComputed = kpis ?? computeCFOKPIs(snapshot);
    const onePager = await generateBoardOnePagerAgentic({
      snapshot,
      kpis: kpisComputed,
      mdaNarrative,
      varianceReport,
      sensitivityReport,
      periodLabel,
    });
    res.json(onePager);
  } catch (e) {
    res.status(500).json({
      error: 'Failed to generate board one-pager',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/board-deck — Board deck (slide-ready JSON) */
router.post('/board-deck', validateBody(boardDeckBodySchema), async (req: Request, res: Response) => {
  try {
    const { onePagerNarrative, kpis, snapshot, periodLabel } = req.body;
    const kpisComputed = snapshot && !kpis ? computeCFOKPIs(snapshot) : kpis;
    const result = await generateBoardDeckAgentic({
      onePagerNarrative,
      kpis: kpisComputed,
      snapshot,
      periodLabel,
    });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Failed to generate board deck',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/pointed-question — Sensitivity (e.g. "What if COGS increases by 15%?") */
router.post('/pointed-question', validateBody(pointedQuestionBodySchema), async (req: Request, res: Response) => {
  try {
    const { question, snapshot, useAgenticParser } = req.body;
    const result = useAgenticParser
      ? await runPointedQuestionSensitivityAsync({
          question: question.trim(),
          snapshot: snapshot ?? {},
          useAgenticParser: true,
        })
      : runPointedQuestionSensitivity({ question: question.trim(), snapshot: snapshot ?? {} });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Failed to run pointed-question sensitivity',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/sensitivity-report — Structured what-if report */
router.post('/sensitivity-report', validateBody(sensitivityReportBodySchema), async (req: Request, res: Response) => {
  try {
    const { snapshot, scenarios: scenarioSpecs, periodLabel, explain } = req.body;
    const scenarios = Array.isArray(scenarioSpecs) ? scenarioSpecs : [];
    const report = buildSensitivityReport(snapshot, scenarios, { periodLabel });
    if (explain) {
      try {
        const narrative = await explainSensitivityReportAgentic(report);
        return res.json({ report, narrative });
      } catch {
        return res.json({ report, narrative: report.summaryNarrative });
      }
    }
    res.json(report);
  } catch (e) {
    res.status(500).json({
      error: 'Failed to build sensitivity report',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/pointed-question/interpret — Agentic interpretation of a single sensitivity result */
router.post('/pointed-question/interpret', validateBody(pointedQuestionInterpretBodySchema), async (req: Request, res: Response) => {
  try {
    const result = req.body;
    const narrative = await explainScenarioAgentic(result);
    res.json({ narrative });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to interpret scenario',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/sensitivity-report/interpret — Agentic interpretation of full sensitivity report */
router.post('/sensitivity-report/interpret', validateBody(sensitivityReportInterpretBodySchema), async (req: Request, res: Response) => {
  try {
    const report = req.body;
    const narrative = await explainSensitivityReportAgentic(report);
    res.json({ narrative });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to interpret sensitivity report',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
