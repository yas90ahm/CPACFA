/**
 * Revenue recognition: contract, POBs, allocation, schedule (IFRS 15 / ASC 606).
 * Agentic: suggest allocation and recognition schedule.
 * Persistence: repository (tenant-scoped).
 */

import type { Pool } from 'pg';
import { callLLMWithFallback } from '../llm/callWithFallback.js';
import { runInBoundaryScope, enterAdvisoryContext, exitAdvisoryContext, assertNoAiMutationContext } from '../lib/ai_boundary.js';
import { assertNoNumericAmountsInAgentOutput } from '../llm/guardrails.js';
import * as repo from '../db/repositories/revenue_recognition_repository.js';
import { minus as decMinus, plus as decPlus, round2 } from '../utils/decimal.js';
import type {
  RevenueContract,
  PerformanceObligation,
  RecognitionScheduleEntry,
} from '../types/revenue_recognition.js';

function toPerformanceObligation(row: repo.PerformanceObligationRow): PerformanceObligation {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    satisfiedOverTime: row.satisfiedOverTime,
    allocationPercent: row.allocationPercent != null ? Number(row.allocationPercent) : undefined,
    allocationAmount: row.allocationAmount != null ? Number(row.allocationAmount) : undefined,
    schedule: row.schedule,
    scheduleType: row.scheduleType,
    costToCostTotalEstimated: row.costToCostTotalEstimated != null ? Number(row.costToCostTotalEstimated) : undefined,
    costToCostCostsToDate: row.costToCostCostsToDate != null ? Number(row.costToCostCostsToDate) : undefined,
    milestoneAmounts: row.milestoneAmounts,
  };
}

function toContract(
  contract: repo.RevenueContractRow,
  pobs: repo.PerformanceObligationRow[]
): RevenueContract {
  return {
    id: contract.id,
    tenantId: contract.tenantId,
    contractNumber: contract.contractNumber,
    customerId: contract.customerId,
    customerName: contract.customerName,
    startDate: contract.startDate,
    endDate: contract.endDate,
    totalContractValue: Number(contract.totalContractValue),
    currency: contract.currency,
    status: contract.status,
    allocation: contract.allocation,
    performanceObligations: pobs.map(toPerformanceObligation),
    createdAt: contract.createdAt,
    updatedAt: contract.updatedAt,
  };
}

export function createContract(
  tenantId: string,
  pool: Pool,
  input: {
    contractNumber: string;
    customerId?: string;
    customerName?: string;
    startDate: string;
    endDate: string;
    totalContractValue: number;
    currency: string;
    performanceObligations: Omit<PerformanceObligation, 'id'>[];
  }
): Promise<RevenueContract> {
  return (async () => {
    const contractRow = await repo.createContract(pool, tenantId, {
      tenantId,
      contractNumber: input.contractNumber,
      customerId: input.customerId,
      customerName: input.customerName,
      startDate: input.startDate,
      endDate: input.endDate,
      totalContractValue: String(input.totalContractValue),
      currency: input.currency,
      status: 'draft',
    });
    const pobInputs = input.performanceObligations.map((p) => ({
      name: p.name,
      description: p.description,
      satisfiedOverTime: p.satisfiedOverTime,
      allocationPercent: p.allocationPercent != null ? String(p.allocationPercent) : undefined,
      allocationAmount: p.allocationAmount != null ? String(p.allocationAmount) : undefined,
      schedule: p.schedule,
      scheduleType: p.scheduleType ?? 'linear',
      costToCostTotalEstimated: p.costToCostTotalEstimated != null ? String(p.costToCostTotalEstimated) : undefined,
      costToCostCostsToDate: p.costToCostCostsToDate != null ? String(p.costToCostCostsToDate) : undefined,
      milestoneAmounts: p.milestoneAmounts,
    }));
    const pobRows = await repo.createPerformanceObligations(
      pool,
      tenantId,
      contractRow.id,
      pobInputs
    );
    return toContract(contractRow, pobRows);
  })();
}

export async function getContract(
  tenantId: string,
  pool: Pool,
  id: string
): Promise<RevenueContract | null> {
  const contract = await repo.getContract(pool, tenantId, id);
  if (!contract) return null;
  const pobs = await repo.listPerformanceObligations(pool, tenantId, id);
  return toContract(contract, pobs);
}

export async function listContracts(
  tenantId: string,
  pool: Pool,
  filters?: { status?: import('../types/revenue_recognition.js').RevRecStatus }
): Promise<RevenueContract[]> {
  const contracts = await repo.listContracts(pool, tenantId, filters);
  const result: RevenueContract[] = [];
  for (const c of contracts) {
    const pobs = await repo.listPerformanceObligations(pool, tenantId, c.id);
    result.push(toContract(c, pobs));
  }
  return result;
}

function parseAllocation(
  raw: string,
  pobs: PerformanceObligation[],
  total: number
): Record<string, number> | null {
  try {
    const start = raw.indexOf('{');
    const end = raw.lastIndexOf('}');
    const slice = start >= 0 && end >= 0 ? raw.slice(start, end + 1) : raw;
    const o = JSON.parse(slice) as Record<string, number>;
    const out: Record<string, number> = {};
    let sum = 0;
    for (const p of pobs) {
      const v = Number(o[p.id]) ?? 0;
      out[p.id] = v;
      sum += v;
    }
    if (Math.abs(sum - total) > 0.02) {
      const diff = total - sum;
      const first = pobs[0];
      if (first) out[first.id] = (out[first.id] ?? 0) + diff;
    }
    return out;
  } catch {
    return null;
  }
}

/** Result of suggest allocation: allocation and whether it is from equal-split fallback (tentative). */
export interface SuggestAllocationResult {
  allocation: Record<string, number> | null;
  allocationSource: 'agentic' | 'fallback';
}

/** Agentic: suggest allocation of transaction price across POBs. When fallback (equal split) is used, do not persist; return allocation as tentative so client can confirm or supply allocation. */
export async function suggestAllocationAgentic(
  tenantId: string,
  pool: Pool,
  contractId: string
): Promise<SuggestAllocationResult | null> {
  const contract = await getContract(tenantId, pool, contractId);
  if (!contract) return null;
  const pobs = contract.performanceObligations.map((p) => ({
    id: p.id,
    name: p.name,
    satisfiedOverTime: p.satisfiedOverTime,
  }));
  const prompt = `Contract ${contract.contractNumber}. Total value: ${contract.totalContractValue} ${contract.currency}. Period: ${contract.startDate} to ${contract.endDate}.
Performance obligations: ${JSON.stringify(pobs)}
Allocate the transaction price across POBs (percent or amount). Return JSON: { "pob-id": amount, ... } so amounts sum to ${contract.totalContractValue}.`;
  const fallback: Record<string, number> = {};
  const total = contract.totalContractValue;
  const n = contract.performanceObligations.length;
  contract.performanceObligations.forEach((p, i) => {
    fallback[p.id] =
      i < n - 1
        ? round2(total / n)
        : total - Object.values(fallback).reduce((a, b) => a + b, 0);
  });
  return runInBoundaryScope(async () => {
    assertNoAiMutationContext(); // Ensure we are NOT already in a mutation context
    enterAdvisoryContext();
    try {
      const result = await callLLMWithFallback({
        system:
          'You are a revenue recognition specialist (IFRS 15/ASC 606). Output only valid JSON object of POB id to allocated amount.',
        prompt,
        maxTokens: 400,
        parse: (raw) => parseAllocation(raw, contract.performanceObligations, contract.totalContractValue),
        fallback,
      });

      const usedFallback = result === fallback;

      // AI suggestions go to staging — NOT directly to core tables
      // Controller must explicitly accept before allocation reaches core tables
      if (result && Object.keys(result).length > 0 && !usedFallback) {
        try {
          await pool.query(
            `INSERT INTO ai_revenue_suggestions (id, tenant_id, contract_id, suggestion_type, suggested_values, status, created_at)
             VALUES (gen_random_uuid()::text, $1, $2, 'allocation', $3, 'pending', NOW())`,
            [tenantId, contractId, JSON.stringify(result)]
          );
        } catch {
          // Table may not exist yet — non-fatal, return suggestion without staging
        }
      }

      return {
        allocation: result && Object.keys(result).length > 0 ? result : null,
        allocationSource: usedFallback ? 'fallback' : 'agentic',
      };
    } finally {
      exitAdvisoryContext();
    }
  });
}

/** Persist allocation (e.g. after user confirms suggested or fallback allocation). Use for recognition in reports. */
export async function setContractAllocation(
  tenantId: string,
  pool: Pool,
  contractId: string,
  allocation: Record<string, number>,
  options?: { allocationRationale?: string }
): Promise<RevenueContract | null> {
  const contract = await getContract(tenantId, pool, contractId);
  if (!contract) return null;
  await repo.updateContract(pool, tenantId, contractId, {
    allocation,
    ...(options?.allocationRationale != null ? { allocationRationale: options.allocationRationale } : {}),
  });
  for (const p of contract.performanceObligations) {
    const amount = allocation[p.id];
    if (amount != null) {
      await repo.updatePerformanceObligation(pool, tenantId, p.id, { allocationAmount: String(amount) });
    }
  }
  return getContract(tenantId, pool, contractId);
}

/** Enforce cumulativeAmount = sum(amounts) and last period amount = total − sum(prior amounts). Uses decimal for round-trip. */
function normalizeScheduleToTotal(entries: RecognitionScheduleEntry[], total: number): RecognitionScheduleEntry[] {
  if (entries.length === 0) return entries;
  let sumPrior = 0;
  const out: RecognitionScheduleEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i]!;
    const amount =
      i === entries.length - 1
        ? round2(decMinus(total, sumPrior))
        : round2(e.amount ?? 0);
    sumPrior = decPlus(sumPrior, amount);
    out.push({
      periodStart: e.periodStart,
      periodEnd: e.periodEnd,
      amount,
      cumulativeAmount: sumPrior,
      recognized: e.recognized ?? false,
    });
  }
  return out;
}

/**
 * Deterministic: build straight-line recognition schedule (amount over N periods from start_date).
 * Used by CPA bridge for agentic → deterministic execution. ASC 606 / IFRS 15.
 */
export function buildLinearRecognitionSchedule(
  amount: number,
  periods: number,
  startDate: string
): RecognitionScheduleEntry[] {
  const start = new Date(startDate);
  const end = new Date(start);
  end.setMonth(end.getMonth() + Math.max(1, periods));
  const endStr = end.toISOString().slice(0, 10);
  return linearSchedule(startDate, endStr, amount);
}

function linearSchedule(start: string, end: string, total: number): RecognitionScheduleEntry[] {
  const entries: RecognitionScheduleEntry[] = [];
  const startDate = new Date(start);
  const endDate = new Date(end);
  const months = Math.max(
    1,
    (endDate.getFullYear() - startDate.getFullYear()) * 12 +
      (endDate.getMonth() - startDate.getMonth()) +
      1
  );
  const perMonth = total / months;
  let sumAmounts = 0;
  for (let i = 0; i < months; i++) {
    const periodStart = new Date(startDate);
    periodStart.setMonth(periodStart.getMonth() + i);
    const periodEnd = new Date(periodStart);
    periodEnd.setMonth(periodEnd.getMonth() + 1);
    periodEnd.setDate(0);
    const amt =
      i < months - 1 ? round2(perMonth) : round2(decMinus(total, sumAmounts));
    sumAmounts = decPlus(sumAmounts, amt);
    entries.push({
      periodStart: periodStart.toISOString().slice(0, 10),
      periodEnd: periodEnd.toISOString().slice(0, 10),
      amount: amt,
      cumulativeAmount: sumAmounts,
      recognized: false,
    });
  }
  return entries;
}

function parseSchedule(
  raw: string,
  start: string,
  end: string,
  total: number
): RecognitionScheduleEntry[] | null {
  try {
    const startIdx = raw.indexOf('[');
    const endIdx = raw.lastIndexOf(']');
    const slice = startIdx >= 0 && endIdx >= 0 ? raw.slice(startIdx, endIdx + 1) : raw;
    const arr = JSON.parse(slice) as unknown[];
    if (!Array.isArray(arr)) return null;
    const parsed = arr.map((o: unknown) => {
      const row = o as Record<string, unknown>;
      return {
        periodStart: String(row.periodStart ?? ''),
        periodEnd: String(row.periodEnd ?? ''),
        amount: Number(row.amount) || 0,
        cumulativeAmount: row.cumulativeAmount != null ? Number(row.cumulativeAmount) : undefined,
        recognized: row.recognized === true,
      };
    });
    return normalizeScheduleToTotal(parsed, total);
  } catch {
    return linearSchedule(start, end, total);
  }
}

/**
 * Cost-to-cost schedule: recognize (costs to date / total estimated cost) * total amount.
 * Returns single-period cumulative recognition (one entry for "to date"). For multi-period
 * cost-to-cost, period amount should be computed as (current cumulative minus prior cumulative)
 * so that catch-up is correct and no double-count (ASC 606).
 */
function costToCostSchedule(
  start: string,
  end: string,
  totalAmount: number,
  totalEstimatedCost: number,
  costsToDate: number
): RecognitionScheduleEntry[] {
  if (totalEstimatedCost <= 0) return linearSchedule(start, end, totalAmount);
  const percentComplete = Math.min(1, costsToDate / totalEstimatedCost);
  const recognizedToDate = round2(totalAmount * percentComplete);
  return [
    {
      periodStart: start,
      periodEnd: end,
      amount: recognizedToDate,
      cumulativeAmount: recognizedToDate,
      recognized: false,
    },
  ];
}

/** Milestone schedule: one entry per milestone date/amount. */
function milestoneSchedule(
  milestones: { date: string; amount: number }[],
  totalAmount: number
): RecognitionScheduleEntry[] {
  if (!milestones || milestones.length === 0) return [];
  const sorted = [...milestones].sort((a, b) => a.date.localeCompare(b.date));
  let cum = 0;
  const entries: RecognitionScheduleEntry[] = sorted.map((m) => {
    cum += m.amount;
    return {
      periodStart: m.date,
      periodEnd: m.date,
      amount: round2(m.amount),
      cumulativeAmount: round2(cum),
      recognized: false,
    };
  });
  return normalizeScheduleToTotal(entries, totalAmount);
}

/** Agentic: suggest recognition schedule for a POB (over time). Uses scheduleType: linear, cost_to_cost, milestones, or LLM for custom. */
export async function suggestRecognitionScheduleAgentic(
  tenantId: string,
  pool: Pool,
  contractId: string,
  pobId: string
): Promise<RecognitionScheduleEntry[] | null> {
  const contract = await getContract(tenantId, pool, contractId);
  if (!contract) return null;
  const pob = contract.performanceObligations.find((p) => p.id === pobId);
  if (!pob || !pob.satisfiedOverTime) return null;
  const amount =
    contract.allocation?.[pobId] ??
    pob.allocationAmount ??
    contract.totalContractValue / contract.performanceObligations.length;
  const scheduleType = pob.scheduleType ?? 'linear';

  let result: RecognitionScheduleEntry[] | null = null;
  if (scheduleType === 'cost_to_cost' && pob.costToCostTotalEstimated != null && pob.costToCostTotalEstimated > 0 && pob.costToCostCostsToDate != null) {
    result = costToCostSchedule(
      contract.startDate,
      contract.endDate,
      amount,
      pob.costToCostTotalEstimated,
      pob.costToCostCostsToDate
    );
  } else if (scheduleType === 'milestones' && pob.milestoneAmounts && pob.milestoneAmounts.length > 0) {
    result = milestoneSchedule(pob.milestoneAmounts, amount);
  } else if (scheduleType === 'linear') {
    result = linearSchedule(contract.startDate, contract.endDate, amount);
  } else {
    const prompt = `Contract ${contract.contractNumber}. POB: ${pob.name}. Allocated amount: ${amount} ${contract.currency}. Period: ${contract.startDate} to ${contract.endDate}.
Suggest monthly recognition schedule (straight-line or as per pattern). Return JSON array: [ { periodStart, periodEnd, amount, cumulativeAmount?, recognized?: false } ].`;
    const fallback = linearSchedule(contract.startDate, contract.endDate, amount);
    result = await runInBoundaryScope(async () => {
      assertNoAiMutationContext(); // Ensure not in mutation context
      enterAdvisoryContext();
      try {
        const llmResult = await callLLMWithFallback({
          system:
            'You are a revenue recognition specialist. Output only valid JSON array of period entries.',
          prompt,
          maxTokens: 600,
          parse: (raw) => parseSchedule(raw, contract.startDate, contract.endDate, amount),
          fallback,
        });

        // AI schedule suggestions go to staging — NOT directly to core tables
        const usedFallback = llmResult === fallback;
        if (llmResult && !usedFallback) {
          try {
            await pool.query(
              `INSERT INTO ai_revenue_suggestions (id, tenant_id, contract_id, suggestion_type, suggested_values, status, created_at)
               VALUES (gen_random_uuid()::text, $1, $2, 'schedule', $3, 'pending', NOW())`,
              [tenantId, contractId, JSON.stringify({ pobId, schedule: llmResult })]
            );
          } catch {
            // Table may not exist yet — non-fatal
          }
        }

        return llmResult;
      } finally {
        exitAdvisoryContext();
      }
    });
  }

  // Only write deterministic (non-AI) schedules to core tables directly
  // AI-generated schedules require human acceptance via /revenue-suggestions/:id/accept
  const isFromAI = result !== null && !(
    result === linearSchedule(contract.startDate, contract.endDate, amount)
  );
  if (result && result.length > 0 && !isFromAI) {
    await repo.updatePerformanceObligation(pool, tenantId, pobId, { schedule: result });
    await repo.upsertRecognitionSchedule(pool, tenantId, contractId, pobId, result);
  }
  return result;
}

export interface RevenueFootnoteResult {
  footnote: string;
  summary: string;
}

/** Agentic: generate revenue recognition footnote for disclosure */
export async function generateRevenueFootnoteAgentic(summary: {
  contractCount: number;
  totalContractValue: number;
  currency: string;
  periodLabel?: string;
  /** Resolved topic standard for citation (asc606 → ASC 606, ifrs15 → IFRS 15). */
  topicStandard?: 'asc606' | 'ifrs15';
}): Promise<RevenueFootnoteResult> {
  const citation = summary.topicStandard === 'ifrs15' ? 'IFRS 15' : 'ASC 606';
  const systemPrompt = `You are a financial reporting specialist. Generate a concise footnote disclosure for revenue recognition (${citation}).

Include: contract balances, performance obligation allocation, and timing of recognition. Use plain language suitable for notes to financial statements. Return JSON: { "footnote": "...", "summary": "1-2 sentence summary" }`;

  const userContent = `Contract count: ${summary.contractCount}\nTotal contract value: ${summary.totalContractValue} ${summary.currency}\nPeriod: ${summary.periodLabel ?? 'current'}`;

  const fallback: RevenueFootnoteResult = {
    footnote: `The Company has ${summary.contractCount} contract(s) with total value of ${summary.totalContractValue.toLocaleString()} ${summary.currency}. Revenue is recognized in accordance with ${citation}.`,
    summary: `Revenue from contracts: ${summary.contractCount} contract(s), ${summary.totalContractValue.toLocaleString()} ${summary.currency}.`,
  };

  return runInBoundaryScope(async () => {
    enterAdvisoryContext();
    try {
      const result = await callLLMWithFallback({
        system: systemPrompt,
        prompt: userContent,
        maxTokens: 800,
        parse: (raw: string) => {
          try {
            const parsed = JSON.parse(raw);
            return {
              footnote: typeof parsed.footnote === 'string' ? parsed.footnote : fallback.footnote,
              summary: typeof parsed.summary === 'string' ? parsed.summary : fallback.summary,
            };
          } catch {
            return fallback;
          }
        },
        fallback,
      });

      // Apply numeric guardrail on parsed LLM output
      if (result !== fallback) {
        assertNoNumericAmountsInAgentOutput(result, 'revenue_recognition_footnote');
      }

      return result;
    } finally {
      exitAdvisoryContext();
    }
  });
}
