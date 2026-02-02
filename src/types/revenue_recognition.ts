/**
 * Revenue recognition: contract, performance obligations, allocation, schedule.
 * IFRS 15 / ASC 606.
 */

export type RevRecStatus = 'draft' | 'active' | 'completed' | 'cancelled';

export interface RevenueContract {
  id: string;
  tenantId: string;
  contractNumber: string;
  customerId?: string;
  customerName?: string;
  startDate: string;
  endDate: string;
  totalContractValue: number;
  currency: string;
  status: RevRecStatus;
  performanceObligations: PerformanceObligation[];
  /** Allocated transaction price per POB (from agentic or rule) */
  allocation?: Record<string, number>;
  createdAt: string;
  updatedAt: string;
}

/** Recognition timing pattern (IFRS 15 / ASC 606). */
export type RevenueScheduleType = 'linear' | 'cost_to_cost' | 'milestones' | 'custom';

export interface PerformanceObligation {
  id: string;
  name: string;
  description?: string;
  /** Satisfied over time vs point in time */
  satisfiedOverTime: boolean;
  /** Allocation % or fixed amount */
  allocationPercent?: number;
  allocationAmount?: number;
  /** Schedule of recognition (dates + amounts) */
  schedule?: RecognitionScheduleEntry[];
  /** Pattern for timing: linear, cost_to_cost, milestones, custom. Required when satisfiedOverTime. */
  scheduleType?: RevenueScheduleType;
  /** Cost-to-cost: total estimated cost (when scheduleType is cost_to_cost). */
  costToCostTotalEstimated?: number;
  /** Cost-to-cost: costs incurred to date (when scheduleType is cost_to_cost). */
  costToCostCostsToDate?: number;
  /** Milestones: [{ date, amount }] (when scheduleType is milestones). */
  milestoneAmounts?: { date: string; amount: number }[];
}

export interface RecognitionScheduleEntry {
  periodStart: string;
  periodEnd: string;
  amount: number;
  cumulativeAmount?: number;
  recognized?: boolean;
}
