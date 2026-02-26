/**
 * Zod schemas for CFO Dashboard API routes (KPIs, narratives, variance, scenarios).
 */

import { z } from 'zod';
import { idParamSchema } from './commonSchemas.js';

// ============================================================================
// CFO Financial Snapshot (shared across many routes)
// ============================================================================

const finiteNumber = z.number().finite();
const optionalFiniteNumber = finiteNumber.optional();

export const cfoFinancialSnapshotSchema = z.object({
  revenue: finiteNumber,
  costOfGoodsSold: optionalFiniteNumber,
  operatingExpenses: optionalFiniteNumber,
  operatingIncome: optionalFiniteNumber,
  netIncome: finiteNumber,
  totalAssets: finiteNumber,
  totalLiabilities: finiteNumber,
  totalEquity: finiteNumber,
  cash: finiteNumber,
  currentAssets: optionalFiniteNumber,
  currentLiabilities: optionalFiniteNumber,
  inventory: optionalFiniteNumber,
  accountsReceivable: optionalFiniteNumber,
  accountsPayable: optionalFiniteNumber,
  priorRevenue: optionalFiniteNumber,
  priorNetIncome: optionalFiniteNumber,
  periodLabel: z.string().optional(),
}).strict();

// ============================================================================
// KPIs
// ============================================================================

export const kpisBodySchema = z.object({
  snapshot: cfoFinancialSnapshotSchema,
});

const cfokpisSchema = z.object({
  burnRate: finiteNumber.optional(),
  runwayMonths: finiteNumber.optional(),
  breakEvenRevenue: optionalFiniteNumber,
  ruleOf40: optionalFiniteNumber,
  revenueGrowthPercent: optionalFiniteNumber,
  profitMarginPercent: optionalFiniteNumber,
  workingCapitalCycleDays: optionalFiniteNumber,
  daysSalesOutstanding: optionalFiniteNumber,
  daysInventoryOutstanding: optionalFiniteNumber,
  daysPayablesOutstanding: optionalFiniteNumber,
  grossMarginPercent: optionalFiniteNumber,
  operatingMarginPercent: optionalFiniteNumber,
  netMarginPercent: optionalFiniteNumber,
  roicPercent: optionalFiniteNumber,
}).passthrough();

export const kpiHistoryBodySchema = z.object({
  periodLabel: z.string().min(1, 'periodLabel required'),
  kpis: cfokpisSchema,
  asAt: z.string().optional(),
});

export const kpiHistoryQuerySchema = z.object({
  periodLabel: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

export const kpiTargetsBodySchema = z.object({
  metric: z.string().min(1, 'metric required'),
  targetValue: finiteNumber,
  unit: z.string().optional(),
  label: z.string().optional(),
});

// ============================================================================
// Narrative
// ============================================================================

export const narrativeBodySchema = z.object({
  snapshot: cfoFinancialSnapshotSchema,
});

const templateNarrativeSchema = z.object({
  overview: z.string(),
  sections: z.array(z.object({ title: z.string(), content: z.string() })),
  highlights: z.array(z.string()),
}).optional();

export const narrativeAgenticBodySchema = z.object({
  snapshot: cfoFinancialSnapshotSchema,
  templateNarrative: templateNarrativeSchema,
  periodLabel: z.string().optional(),
});

export const narrativeVersionBodySchema = z.object({
  type: z.enum(['mda', 'one_pager', 'board_deck']),
  periodLabel: z.string().min(1, 'periodLabel required'),
  content: z.union([z.string(), z.record(z.unknown())]),
  asAt: z.string().optional(),
});

export const narrativeVersionQuerySchema = z.object({
  type: z.enum(['mda', 'one_pager', 'board_deck']).optional(),
  periodLabel: z.string().optional(),
  from: z.string().optional(),
  to: z.string().optional(),
  limit: z.coerce.number().int().positive().max(500).optional(),
});

// ============================================================================
// Variance
// ============================================================================

const budgetActualLineSchema = z.object({
  label: z.string(),
  amount: finiteNumber,
  category: z.enum(['Revenue', 'COGS', 'OpEx', 'Other']).optional(),
});

const varianceOptionsSchema = z.object({
  materialThresholdPercent: optionalFiniteNumber,
  materialThresholdAmount: optionalFiniteNumber,
  periodLabel: z.string().optional(),
  budgetVersionId: z.string().optional(),
  budgetVersionLabel: z.string().optional(),
  actualsSource: z.string().optional(),
  actualsPeriodLabel: z.string().optional(),
  requireLockedPriorPeriod: z.boolean().optional(),
}).optional();

export const varianceBodySchema = z.object({
  budget: z.array(budgetActualLineSchema).optional(),
  actual: z.array(budgetActualLineSchema).optional(),
  budgetSnapshot: cfoFinancialSnapshotSchema.optional(),
  actualSnapshot: cfoFinancialSnapshotSchema.optional(),
  options: varianceOptionsSchema,
  explain: z.boolean().optional(),
  useAgenticDrivers: z.boolean().optional(),
  includeHitlPending: z.boolean().optional(),
});

const varianceLineSchema = z.object({
  label: z.string(),
  budget: finiteNumber,
  actual: finiteNumber,
  variance: finiteNumber,
  variancePercent: finiteNumber,
  material: z.boolean(),
  drivers: z.array(z.object({ type: z.enum(['volume', 'price', 'mix', 'timing', 'acquisition_divestiture', 'new_product', 'discontinued', 'other']), description: z.string(), estimatedImpact: optionalFiniteNumber })).optional(),
  category: z.string().optional(),
}).passthrough();

export const varianceReportSchema = z.object({
  periodLabel: z.string(),
  generatedAt: z.string(),
  lines: z.array(varianceLineSchema),
  totalBudget: finiteNumber,
  totalActual: finiteNumber,
  totalVariance: finiteNumber,
  totalVariancePercent: finiteNumber,
  materialCount: z.number().int().nonnegative(),
  summaryNarrative: z.string(),
  budgetVersionId: z.string().optional(),
  budgetVersionLabel: z.string().optional(),
  actualsSource: z.string().optional(),
  actualsPeriodLabel: z.string().optional(),
}).passthrough();

/** Body is the variance report (with lines) */
export const varianceExplainBodySchema = varianceReportSchema;

/** Body is the variance report (with lines) */
export const varianceDriversRefineBodySchema = varianceReportSchema;

export const varianceMultiPeriodBodySchema = z.object({
  periodALines: z.array(budgetActualLineSchema),
  periodBLines: z.array(budgetActualLineSchema),
  periodALabel: z.string().optional(),
  periodBLabel: z.string().optional(),
  options: z.object({
    materialThresholdPercent: optionalFiniteNumber,
    materialThresholdAmount: optionalFiniteNumber,
  }).optional(),
  explain: z.boolean().optional(),
});

export const varianceHitlConfirmBodySchema = z.object({
  reportPeriodLabel: z.string().min(1, 'reportPeriodLabel required'),
  lineLabel: z.string().min(1, 'lineLabel required'),
  confirmedDriver: z.string().optional(),
  confirmedComment: z.string().optional(),
});

// ============================================================================
// KPI Commentary, Scenario Recommend, Lead Partner, Board
// ============================================================================

export const kpiCommentaryBodySchema = z.object({
  currentSnapshot: cfoFinancialSnapshotSchema,
  priorSnapshot: cfoFinancialSnapshotSchema,
  currentKpis: cfokpisSchema.optional(),
  priorKpis: cfokpisSchema.optional(),
  periodLabel: z.string().optional(),
  priorPeriodLabel: z.string().optional(),
});

export const scenarioRecommendBodySchema = z.object({
  snapshot: cfoFinancialSnapshotSchema,
  target: z.object({
    runwayMonths: optionalFiniteNumber,
    breakEvenRevenue: optionalFiniteNumber,
    maxNewHires: optionalFiniteNumber,
    maxRevenueChangePercent: optionalFiniteNumber,
  }).optional(),
  buildReport: z.boolean().optional(),
  periodLabel: z.string().optional(),
});

export const leadPartnerViewBodySchema = z.object({
  query: z.string().min(1, 'query required'),
  snapshot: cfoFinancialSnapshotSchema,
  varianceReport: z.record(z.unknown()).optional(),
  sensitivityReport: z.record(z.unknown()).optional(),
  periodLabel: z.string().optional(),
});

export const boardOnePagerBodySchema = z.object({
  snapshot: cfoFinancialSnapshotSchema,
  kpis: cfokpisSchema.optional(),
  mdaNarrative: z.record(z.unknown()).optional(),
  varianceReport: z.record(z.unknown()).optional(),
  sensitivityReport: z.record(z.unknown()).optional(),
  periodLabel: z.string().optional(),
});

export const boardDeckBodySchema = z.object({
  onePagerNarrative: z.string().optional(),
  kpis: cfokpisSchema.optional(),
  snapshot: cfoFinancialSnapshotSchema.optional(),
  periodLabel: z.string().optional(),
});

export const pointedQuestionBodySchema = z.object({
  question: z.string().min(1, 'question required'),
  snapshot: cfoFinancialSnapshotSchema.optional(),
  useAgenticParser: z.boolean().optional(),
});

const marginScenarioSchema = z.object({
  scenario: z.string(),
  grossMarginPercent: finiteNumber,
  operatingMarginPercent: finiteNumber,
  netMarginPercent: finiteNumber,
  revenue: finiteNumber,
  cogs: optionalFiniteNumber,
  operatingExpenses: optionalFiniteNumber,
  netIncome: optionalFiniteNumber,
}).passthrough();

export const pointedQuestionInterpretBodySchema = z.object({
  question: z.string().min(1, 'question required'),
  baseCase: marginScenarioSchema,
  sensitivityCase: marginScenarioSchema.optional(),
  interpretedVariable: z.string().optional(),
  interpretedShock: z.string().optional(),
  narrative: z.string().optional(),
  chartData: z.array(z.unknown()).optional(),
}).passthrough();

const sensitivityScenarioSpecSchema = z.object({
  question: z.string().optional(),
  revenueChangePercent: optionalFiniteNumber,
  newEmployeeCount: optionalFiniteNumber,
  newEmployeeSalary: optionalFiniteNumber,
}).passthrough();

export const sensitivityReportBodySchema = z.object({
  snapshot: cfoFinancialSnapshotSchema,
  scenarios: z.array(sensitivityScenarioSpecSchema).optional(),
  periodLabel: z.string().optional(),
  explain: z.boolean().optional(),
});

export const sensitivityReportInterpretBodySchema = z.object({
  report: z.object({
    scenarios: z.array(z.unknown()),
    summaryNarrative: z.string().optional(),
  }).passthrough(),
}).passthrough();

// ============================================================================
// Scenarios (Strategic Sandbox + Saved Scenarios)
// ============================================================================

export const scenarioBodySchema = z.object({
  snapshot: cfoFinancialSnapshotSchema,
  revenueChangePercent: optionalFiniteNumber,
  newEmployeeCount: optionalFiniteNumber,
  newEmployeeSalary: optionalFiniteNumber,
});

export const scenariosBodySchema = z.object({
  name: z.string().min(1, 'name required'),
  periodLabel: z.string().min(1, 'periodLabel required'),
  snapshot: cfoFinancialSnapshotSchema,
  kpis: cfokpisSchema.optional(),
  sensitivityResult: z.unknown().optional(),
});

export const scenariosQuerySchema = z.object({
  periodLabel: z.string().optional(),
  limit: z.coerce.number().int().positive().max(100).optional(),
});

export const scenariosCompareQuerySchema = z.object({
  ids: z.string().min(1, 'ids required (e.g. id1,id2)'),
});

// ============================================================================
// Params
// ============================================================================

export const narrativeVersionIdParamSchema = idParamSchema;
export const scenarioIdParamSchema = idParamSchema;
