/**
 * CFO Dashboard — MD&A narrative, KPIs (Burn Rate, Runway, Rule of 40, Working Capital), Pointed Questions (sensitivity).
 * Strategic Sandbox: scenario analysis via Python sandbox (revenue shock, new hires) → runway & break-even.
 */

import { Router } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import {
  computeCFOKPIs,
  generateMDANarrative,
  runPointedQuestionSensitivity,
  runPointedQuestionSensitivityAsync,
} from '../services/executive_summarizer.js';
import {
  getMateriality,
  materialityThresholdFromSettings,
} from '../services/materiality_service.js';
import {
  buildVarianceAnalysis,
  buildMultiPeriodVariance,
  snapshotToLines,
} from '../services/variance_analysis_service.js';
import { buildSensitivityReport } from '../services/sensitivity_report_service.js';
import { generateMDANarrativeAgentic } from '../services/agentic_mda_service.js';
import {
  explainVarianceAgentic,
  explainScenarioAgentic,
  explainSensitivityReportAgentic,
  explainMultiPeriodVarianceAgentic,
} from '../services/agentic_variance_explainer.js';
import {
  refineVarianceDriversAgentic,
  mergeRefinedDriversIntoLines,
} from '../services/agentic_variance_drivers.js';
import { generateKPICommentaryAgentic } from '../services/agentic_kpi_commentary.js';
import { recommendScenariosAgentic } from '../services/scenario_recommendation_service.js';
import { generateBoardOnePagerAgentic } from '../services/agentic_board_one_pager.js';
import { generateBoardDeckAgentic } from '../services/agentic_board_deck_service.js';
import { buildCfoViewFromSnapshotAndReports } from '../services/lead_partner_cfo_view_service.js';
import { runLeadPartner } from '../services/lead_partner_orchestrator.js';
import { appendKPISnapshot, listKPIHistory } from '../services/kpi_history_service.js';
import {
  setKPITarget,
  listKPITargets,
  computeVarianceToTarget,
} from '../services/kpi_target_service.js';
import {
  storeNarrativeVersion,
  listNarrativeVersions,
  getNarrativeVersion,
} from '../services/narrative_version_service.js';
import {
  saveScenario,
  listScenarios,
  getScenario,
  compareScenarios,
} from '../services/saved_scenarios_service.js';
import { isPeriodLocked } from '../services/period_lock_service.js';
import { storeDecision } from '../memory/index.js';
import type {
  CFOFinancialSnapshot,
  BudgetLine,
  ActualLine,
  SensitivityScenarioSpec,
  VarianceReport,
  VarianceLine,
  VarianceHITLItem,
} from '../types/cfo-dashboard.js';

const router = Router();
const BACKEND_PYTHON_URL = process.env.BACKEND_PYTHON_URL ?? '';
const PYTHON_BASE = BACKEND_PYTHON_URL.replace(/\/$/, '') || 'http://localhost:5000';

/** POST /api/cfo-dashboard/narrative — MD&A style commentary from financial snapshot */
router.post('/narrative', (req, res) => {
  try {
    const snapshot = req.body as CFOFinancialSnapshot;
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

/** POST /api/cfo-dashboard/narrative/agentic — LLM-enhanced MD&A (falls back to rule-based if LLM unavailable) */
router.post('/narrative/agentic', async (req, res) => {
  try {
    const { snapshot, templateNarrative, periodLabel } = req.body as {
      snapshot: CFOFinancialSnapshot;
      templateNarrative?: { overview: string; sections: Array<{ title: string; content: string }>; highlights: string[] };
      periodLabel?: string;
    };
    if (!snapshot || typeof snapshot !== 'object') {
      res.status(400).json({ error: 'Missing or invalid "snapshot"' });
      return;
    }
    const kpis = computeCFOKPIs(snapshot);
    const period = periodLabel ?? snapshot.periodLabel ?? 'Current Period';
    const narrative = await generateMDANarrativeAgentic({
      snapshot,
      kpis,
      templateNarrative: templateNarrative
        ? { periodLabel: period, ...templateNarrative }
        : undefined,
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

/** POST /api/cfo-dashboard/kpis — KPIs only: Burn Rate, Runway, Rule of 40, Working Capital; optional varianceToTarget (FW2) */
router.post('/kpis', (req, res) => {
  try {
    const snapshot = req.body as CFOFinancialSnapshot;
    const kpis = computeCFOKPIs(snapshot);
    const targets = listKPITargets();
    const varianceToTarget = targets.length > 0 ? computeVarianceToTarget(kpis, targets) : undefined;
    res.json({ kpis, ...(varianceToTarget?.length ? { varianceToTarget } : {}) });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to compute KPIs',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/kpi-history — Append KPI snapshot for trend (FW2) */
router.post('/kpi-history', async (req, res) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const { periodLabel, kpis, asAt } = req.body as { periodLabel: string; kpis: import('../types/cfo-dashboard.js').CFOKPIs; asAt?: string };
    if (!periodLabel || !kpis) {
      res.status(400).json({ error: 'Missing periodLabel or kpis' });
      return;
    }
    const snap = await appendKPISnapshot({ periodLabel, kpis, asAt }, pool, tenantId);
    res.status(201).json(snap);
  } catch (e) {
    res.status(500).json({
      error: 'Append KPI history failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/kpi-history — List KPI history (optional periodLabel, from, to) — FW2 */
router.get('/kpi-history', async (req, res) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    const periodLabel = req.query.periodLabel as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const list = await listKPIHistory({ periodLabel, from, to, limit }, pool, tenantId);
    res.json({ history: list });
  } catch (e) {
    res.status(500).json({
      error: 'List KPI history failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/kpi-targets — Set KPI target (e.g. runway 18 months, DSO 45 days) — FW2 */
router.post('/kpi-targets', (req, res) => {
  try {
    const body = req.body as { metric: string; targetValue: number; unit?: string; label?: string };
    if (body?.metric == null || body?.targetValue == null) {
      res.status(400).json({ error: 'Missing metric or targetValue' });
      return;
    }
    const target = setKPITarget({
      metric: body.metric,
      targetValue: body.targetValue,
      unit: body.unit,
      label: body.label,
    });
    res.status(201).json(target);
  } catch (e) {
    res.status(500).json({
      error: 'Set KPI target failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/kpi-targets — List KPI targets — FW2 */
router.get('/kpi-targets', (_req, res) => {
  try {
    const targets = listKPITargets();
    res.json({ targets });
  } catch (e) {
    res.status(500).json({
      error: 'List KPI targets failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/narrative/version — Store narrative version (MD&A, one-pager) for "as at date" — FW2 */
router.post('/narrative/version', (req, res) => {
  try {
    const body = req.body as {
      type: 'mda' | 'one_pager' | 'board_deck';
      periodLabel: string;
      content: string | Record<string, unknown>;
      asAt?: string;
    };
    if (!body?.type || !body?.periodLabel || body?.content == null) {
      res.status(400).json({ error: 'Missing type, periodLabel, or content' });
      return;
    }
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

/** GET /api/cfo-dashboard/narrative/versions — List narrative versions (optional type, periodLabel, from, to) — FW2 */
router.get('/narrative/versions', (req, res) => {
  try {
    const type = req.query.type as 'mda' | 'one_pager' | 'board_deck' | undefined;
    const periodLabel = req.query.periodLabel as string | undefined;
    const from = req.query.from as string | undefined;
    const to = req.query.to as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const list = listNarrativeVersions({ type, periodLabel, from, to, limit });
    res.json({ versions: list });
  } catch (e) {
    res.status(500).json({
      error: 'List narrative versions failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/narrative/versions/:id — Get one narrative version — FW2 */
router.get('/narrative/versions/:id', (req, res) => {
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

/** POST /api/cfo-dashboard/variance — Budget vs actual variance analysis with drivers */
router.post('/variance', async (req, res) => {
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
    } = req.body as {
      budget?: BudgetLine[];
      actual?: ActualLine[];
      budgetSnapshot?: CFOFinancialSnapshot;
      actualSnapshot?: CFOFinancialSnapshot;
      options?: {
        materialThresholdPercent?: number;
        materialThresholdAmount?: number;
        periodLabel?: string;
        budgetVersionId?: string;
        budgetVersionLabel?: string;
        actualsSource?: string;
        actualsPeriodLabel?: string;
        /** FW4: if true, variance only allowed when period is locked (period consistency) */
        requireLockedPriorPeriod?: boolean;
      };
      explain?: boolean;
      useAgenticDrivers?: boolean;
      includeHitlPending?: boolean;
    };
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
      const basisValue =
        actualSnapshot?.revenue ??
        (actualSnapshot && typeof (actualSnapshot as { netIncome?: number }).netIncome === 'number'
          ? (actualSnapshot as { netIncome: number }).netIncome
          : undefined);
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
    const hitlPending: VarianceHITLItem[] | undefined = includeHitlPending
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
        const narrative = await explainVarianceAgentic(report);
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
router.post('/variance/explain', async (req, res) => {
  try {
    const report = req.body as VarianceReport;
    if (!report?.lines || !Array.isArray(report.lines)) {
      res.status(400).json({ error: 'Missing or invalid variance "report" (with lines)' });
      return;
    }
    const narrative = await explainVarianceAgentic(report);
    res.json({ narrative });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to explain variance',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/variance/drivers/refine — LLM-refine drivers for variance report lines */
router.post('/variance/drivers/refine', async (req, res) => {
  try {
    const report = req.body as VarianceReport;
    if (!report?.lines || !Array.isArray(report.lines)) {
      res.status(400).json({ error: 'Missing or invalid variance "report" (with lines)' });
      return;
    }
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

/** POST /api/cfo-dashboard/variance/multi-period — Period A vs Period B actuals variance; optional explain */
router.post('/variance/multi-period', async (req, res) => {
  try {
    const { periodALines, periodBLines, periodALabel, periodBLabel, options, explain } = req.body as {
      periodALines: ActualLine[];
      periodBLines: ActualLine[];
      periodALabel?: string;
      periodBLabel?: string;
      options?: { materialThresholdPercent?: number; materialThresholdAmount?: number };
      explain?: boolean;
    };
    if (!Array.isArray(periodALines) || !Array.isArray(periodBLines)) {
      res.status(400).json({ error: 'Missing or invalid "periodALines" or "periodBLines"' });
      return;
    }
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

/** POST /api/cfo-dashboard/variance/hitl-confirm — Confirm driver/comment for material variance; store in semantic memory */
router.post('/variance/hitl-confirm', async (req, res) => {
  try {
    const { reportPeriodLabel, lineLabel, confirmedDriver, confirmedComment } = req.body as {
      reportPeriodLabel: string;
      lineLabel: string;
      confirmedDriver?: string;
      confirmedComment?: string;
    };
    if (!reportPeriodLabel || !lineLabel) {
      res.status(400).json({ error: 'Missing "reportPeriodLabel" or "lineLabel"' });
      return;
    }
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
router.post('/kpi-commentary', async (req, res) => {
  try {
    const { currentSnapshot, priorSnapshot, currentKpis, priorKpis, periodLabel, priorPeriodLabel } = req.body as {
      currentSnapshot: CFOFinancialSnapshot;
      priorSnapshot: CFOFinancialSnapshot;
      currentKpis?: import('../types/cfo-dashboard.js').CFOKPIs;
      priorKpis?: import('../types/cfo-dashboard.js').CFOKPIs;
      periodLabel?: string;
      priorPeriodLabel?: string;
    };
    if (!currentSnapshot || !priorSnapshot) {
      res.status(400).json({ error: 'Missing "currentSnapshot" or "priorSnapshot"' });
      return;
    }
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

/** POST /api/cfo-dashboard/scenario-recommend — Recommend scenario specs to hit target runway/break-even; optional buildReport */
router.post('/scenario-recommend', async (req, res) => {
  try {
    const { snapshot, target, buildReport, periodLabel } = req.body as {
      snapshot: CFOFinancialSnapshot;
      target: { runwayMonths?: number; breakEvenRevenue?: number; maxNewHires?: number; maxRevenueChangePercent?: number };
      buildReport?: boolean;
      periodLabel?: string;
    };
    if (!snapshot || typeof snapshot !== 'object') {
      res.status(400).json({ error: 'Missing or invalid "snapshot"' });
      return;
    }
    const result = await recommendScenariosAgentic(snapshot, target ?? {}, { buildReport, periodLabel });
    res.json(result);
  } catch (e) {
    res.status(500).json({
      error: 'Failed to recommend scenarios',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/lead-partner-view — One-call Lead Partner with CFO view (snapshot + optional variance/sensitivity); returns unified board narrative */
router.post('/lead-partner-view', async (req, res) => {
  try {
    const { query, snapshot, varianceReport, sensitivityReport, periodLabel } = req.body as {
      query: string;
      snapshot: CFOFinancialSnapshot;
      varianceReport?: VarianceReport;
      sensitivityReport?: import('../types/cfo-dashboard.js').SensitivityReport;
      periodLabel?: string;
    };
    if (!query || typeof query !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "query"' });
      return;
    }
    if (!snapshot || typeof snapshot !== 'object') {
      res.status(400).json({ error: 'Missing or invalid "snapshot"' });
      return;
    }
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

/** POST /api/cfo-dashboard/board-one-pager — Board-ready one-pager (agentic executive summary) */
router.post('/board-one-pager', async (req, res) => {
  try {
    const { snapshot, kpis, mdaNarrative, varianceReport, sensitivityReport, periodLabel } = req.body as {
      snapshot: CFOFinancialSnapshot;
      kpis?: import('../types/cfo-dashboard.js').CFOKPIs;
      mdaNarrative?: import('../types/cfo-dashboard.js').MDANarrative;
      varianceReport?: VarianceReport;
      sensitivityReport?: import('../types/cfo-dashboard.js').SensitivityReport;
      periodLabel?: string;
    };
    if (!snapshot || typeof snapshot !== 'object') {
      res.status(400).json({ error: 'Missing or invalid "snapshot"' });
      return;
    }
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

/** POST /api/cfo-dashboard/board-deck — Board deck (slide-ready JSON: title + bullets) from one-pager/KPIs; agentic. */
router.post('/board-deck', async (req, res) => {
  try {
    const { onePagerNarrative, kpis, snapshot, periodLabel } = req.body as {
      onePagerNarrative?: string;
      kpis?: import('../types/cfo-dashboard.js').CFOKPIs;
      snapshot?: CFOFinancialSnapshot;
      periodLabel?: string;
    };
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

/** POST /api/cfo-dashboard/pointed-question — Sensitivity (e.g. "What if COGS increases by 15%?") → updated margins + chart data. Use useAgenticParser: true for LLM parsing of free-form questions. */
router.post('/pointed-question', async (req, res) => {
  try {
    const { question, snapshot, useAgenticParser } = req.body as {
      question: string;
      snapshot: CFOFinancialSnapshot;
      useAgenticParser?: boolean;
    };
    if (!question || typeof question !== 'string') {
      res.status(400).json({ error: 'Missing or invalid "question"' });
      return;
    }
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

/** Build adjusted snapshot for Strategic Sandbox: revenue change % and new hires (annual salary each). */
function buildScenarioSnapshot(
  snapshot: CFOFinancialSnapshot,
  opts: { revenueChangePercent?: number; newEmployeeCount?: number; newEmployeeSalary?: number }
): CFOFinancialSnapshot {
  const revenueChangePercent = Number(opts.revenueChangePercent) || 0;
  const newEmployeeCount = Math.max(0, Math.floor(Number(opts.newEmployeeCount) || 0));
  const newEmployeeSalary = Math.max(0, Number(opts.newEmployeeSalary) || 0);
  const revenue = (snapshot.revenue ?? 0) * (1 + revenueChangePercent / 100);
  const extraOpEx = newEmployeeCount * newEmployeeSalary;
  const operatingExpenses = (snapshot.operatingExpenses ?? 0) + extraOpEx;
  const costOfGoodsSold = snapshot.costOfGoodsSold ?? 0;
  const operatingIncome = (snapshot.operatingIncome ?? 0) - extraOpEx + (revenue - (snapshot.revenue ?? 0));
  const netIncome = (snapshot.netIncome ?? 0) - extraOpEx + (revenue - (snapshot.revenue ?? 0));
  return {
    ...snapshot,
    revenue,
    costOfGoodsSold,
    operatingExpenses,
    operatingIncome: Number.isFinite(operatingIncome) ? operatingIncome : revenue - costOfGoodsSold - operatingExpenses,
    netIncome: Number.isFinite(netIncome) ? netIncome : revenue - costOfGoodsSold - operatingExpenses,
  };
}

/** POST /api/cfo-dashboard/scenario — Strategic Sandbox: recalc Cash Runway & Break-even via Python sandbox */
router.post('/scenario', async (req, res) => {
  try {
    const { snapshot, revenueChangePercent, newEmployeeCount, newEmployeeSalary } = req.body as {
      snapshot: CFOFinancialSnapshot;
      revenueChangePercent?: number;
      newEmployeeCount?: number;
      newEmployeeSalary?: number;
    };
    if (!snapshot || typeof snapshot !== 'object') {
      res.status(400).json({ error: 'Missing or invalid "snapshot"' });
      return;
    }
    try {
      const pyResp = await fetch(`${PYTHON_BASE}/api/cfa/scenario-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          snapshot,
          revenueChangePercent,
          newEmployeeCount,
          newEmployeeSalary,
        }),
      });
      if (pyResp.ok) {
        const r = (await pyResp.json()) as { burn_rate?: number; runway_months?: number; break_even_revenue?: number };
        if (typeof r.burn_rate === 'number' || typeof r.runway_months === 'number') {
          return res.json({
            kpis: {
              burnRate: Number(r.burn_rate) ?? 0,
              runwayMonths: Number(r.runway_months) ?? 0,
              breakEvenRevenue: Number(r.break_even_revenue) ?? 0,
            },
          });
        }
      }
    } catch {
      /* Python backend unavailable; fall back to Node */
    }
    const adjusted = buildScenarioSnapshot(snapshot, {
      revenueChangePercent,
      newEmployeeCount,
      newEmployeeSalary,
    });
    const kpis = computeCFOKPIs(adjusted);
    res.json({
      kpis: {
        burnRate: kpis.burnRate,
        runwayMonths: kpis.runwayMonths >= 999 ? 999 : kpis.runwayMonths,
        breakEvenRevenue: kpis.breakEvenRevenue ?? 0,
      },
    });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to run scenario analysis',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/sensitivity-report — Structured what-if report: multiple scenarios in one artifact */
router.post('/sensitivity-report', async (req, res) => {
  try {
    const { snapshot, scenarios: scenarioSpecs, periodLabel } = req.body as {
      snapshot: CFOFinancialSnapshot;
      scenarios: SensitivityScenarioSpec[];
      periodLabel?: string;
    };
    if (!snapshot || typeof snapshot !== 'object') {
      res.status(400).json({ error: 'Missing or invalid "snapshot"' });
      return;
    }
    const scenarios = Array.isArray(scenarioSpecs) ? scenarioSpecs : [];
    const report = buildSensitivityReport(snapshot, scenarios, { periodLabel });
    const explain = (req.body as { explain?: boolean }).explain;
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
router.post('/pointed-question/interpret', async (req, res) => {
  try {
    const result = req.body as import('../types/cfo-dashboard.js').PointedQuestionSensitivityResult;
    if (!result?.question || !result?.baseCase) {
      res.status(400).json({ error: 'Missing or invalid pointed-question result (question, baseCase)' });
      return;
    }
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
router.post('/sensitivity-report/interpret', async (req, res) => {
  try {
    const report = req.body as import('../types/cfo-dashboard.js').SensitivityReport;
    if (!report?.scenarios || !Array.isArray(report.scenarios)) {
      res.status(400).json({ error: 'Missing or invalid sensitivity "report" (with scenarios)' });
      return;
    }
    const narrative = await explainSensitivityReportAgentic(report);
    res.json({ narrative });
  } catch (e) {
    res.status(500).json({
      error: 'Failed to interpret sensitivity report',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** POST /api/cfo-dashboard/scenarios — Save named scenario (Base, Upside, Downside) (FW4) */
router.post('/scenarios', (req, res) => {
  try {
    const body = req.body as {
      name: string;
      periodLabel: string;
      snapshot: CFOFinancialSnapshot;
      kpis?: import('../types/cfo-dashboard.js').CFOKPIs;
      sensitivityResult?: unknown;
    };
    if (!body?.name || !body?.periodLabel || !body?.snapshot) {
      res.status(400).json({ error: 'Missing name, periodLabel, or snapshot' });
      return;
    }
    const scenario = saveScenario({
      name: body.name,
      periodLabel: body.periodLabel,
      snapshot: body.snapshot,
      kpis: body.kpis,
      sensitivityResult: body.sensitivityResult,
    });
    res.status(201).json(scenario);
  } catch (e) {
    res.status(500).json({
      error: 'Save scenario failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/scenarios — List saved scenarios (optional periodLabel) (FW4) */
router.get('/scenarios', (req, res) => {
  try {
    const periodLabel = req.query.periodLabel as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const list = listScenarios({ periodLabel, limit });
    res.json({ scenarios: list });
  } catch (e) {
    res.status(500).json({
      error: 'List scenarios failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/scenarios/compare — Compare scenarios side-by-side (query ids=id1,id2) (FW4) */
router.get('/scenarios/compare', (req, res) => {
  try {
    const idsParam = req.query.ids as string | undefined;
    const ids = idsParam ? idsParam.split(',').map((s) => s.trim()).filter(Boolean) : [];
    if (ids.length === 0) {
      res.status(400).json({ error: 'Missing query ids (e.g. ids=id1,id2)' });
      return;
    }
    const scenarios = compareScenarios(ids);
    res.json({ scenarios });
  } catch (e) {
    res.status(500).json({
      error: 'Compare scenarios failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

/** GET /api/cfo-dashboard/scenarios/:id — Get one saved scenario (FW4) */
router.get('/scenarios/:id', (req, res) => {
  try {
    const scenario = getScenario(req.params.id);
    if (!scenario) {
      res.status(404).json({ error: 'Scenario not found' });
      return;
    }
    res.json(scenario);
  } catch (e) {
    res.status(500).json({
      error: 'Get scenario failed',
      message: e instanceof Error ? e.message : String(e),
    });
  }
});

export default router;
