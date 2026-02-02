/**
 * Capital allocation: ROI, payback period, simple portfolio (project list with ROI/payback).
 */

export interface ProjectInput {
  id: string;
  name: string;
  initialCost: number;
  /** Annual (or period) cash inflow from project */
  annualCashFlow: number;
  /** Optional: total gain over life (for ROI) */
  totalGain?: number;
  /** Optional: project life in years */
  lifeYears?: number;
}

export interface ProjectMetrics {
  id: string;
  name: string;
  initialCost: number;
  annualCashFlow: number;
  /** ROI = (total gain - cost) / cost * 100. If totalGain not provided, uses annualCashFlow * lifeYears. */
  roiPercent: number;
  /** Payback (years) = initialCost / annualCashFlow */
  paybackYears: number;
  /** Total gain used for ROI */
  totalGain: number;
}

/**
 * Compute ROI and payback for a single project.
 */
export function computeProjectMetrics(project: ProjectInput): ProjectMetrics {
  const cost = project.initialCost ?? 0;
  const annual = project.annualCashFlow ?? 0;
  const lifeYears = project.lifeYears ?? 5;
  const totalGain = project.totalGain ?? annual * lifeYears;
  const roiPercent = cost > 0 ? ((totalGain - cost) / cost) * 100 : 0;
  const paybackYears = annual > 0 ? cost / annual : 0;
  return {
    id: project.id,
    name: project.name,
    initialCost: cost,
    annualCashFlow: annual,
    roiPercent,
    paybackYears,
    totalGain,
  };
}

/**
 * Portfolio: list of projects with ROI and payback; sort by ROI or payback.
 */
export interface PortfolioResult {
  projects: ProjectMetrics[];
  /** Sorted by ROI descending */
  byRoi: ProjectMetrics[];
  /** Sorted by payback ascending */
  byPayback: ProjectMetrics[];
  totalCost: number;
  totalNpvStyleGain: number; // sum of totalGain (simplified)
}

export function buildPortfolio(projects: ProjectInput[]): PortfolioResult {
  const metrics = projects.map(computeProjectMetrics);
  const byRoi = [...metrics].sort((a, b) => b.roiPercent - a.roiPercent);
  const byPayback = [...metrics].sort((a, b) => a.paybackYears - b.paybackYears);
  const totalCost = metrics.reduce((s, p) => s + p.initialCost, 0);
  const totalNpvStyleGain = metrics.reduce((s, p) => s + p.totalGain, 0);
  return {
    projects: metrics,
    byRoi,
    byPayback,
    totalCost,
    totalNpvStyleGain,
  };
}
