/**
 * CPA Decision Handler — Validates agent JSON recommendation, param-checks, executes deterministic service, guards with structured errors.
 * Every successful execution is logged in audit_log_service as AGENTIC_ADJUSTMENT_EXECUTED: [Standard Name] via Deterministic Engine.
 */

import {
  CPA_BRIDGE_MANIFEST,
  isBridgeStandardKey,
  getStandardName,
  type BridgeStandardKey,
} from './cpa_bridge_manifest.js';
import { recordAuditLogAction } from './audit_service.js';
import type { AuditLogContext } from './segregation_service.js';
import { computeLeaseLiability } from './leaseLiabilityCalc.js';
import { classifyLease } from './lease_service.js';
import { buildLinearRecognitionSchedule } from './revenue_recognition_service.js';
import { depreciationScheduleSl, depreciationScheduleDdb } from './fixed_asset_service.js';
import { computeDeferredTaxesStateless } from './deferred_tax_service.js';
import { round2 } from '../utils/decimal.js';
import { createBridgeAdjustmentJustification } from './justification_service.js';

export interface AgentRecommendation {
  /** Must match a key in cpa_bridge_manifest (Lease | Revenue | FixedAsset | Tax) */
  standard: string;
  /** Mathematical inputs; must include all required params for the standard */
  params: Record<string, unknown>;
}

export type ExecuteResult =
  | { ok: true; result: unknown }
  | { ok: false; error: string };

/**
 * Validate: Ensure the recommended "Standard" matches a key in the bridge manifest.
 * Param-Check: Ensure all required mathematical inputs are present.
 * Execute: Call the deterministic TS function.
 * Guard: If params are missing, return a structured error: "Incomplete Judgment: Missing X for Y".
 * Audit: On success, log "AGENTIC_ADJUSTMENT_EXECUTED: [Standard Name] via Deterministic Engine".
 */
export async function executeAgentRecommendation(
  recommendation: AgentRecommendation,
  auditContext?: AuditLogContext
): Promise<ExecuteResult> {
  const { standard, params } = recommendation;

  if (!isBridgeStandardKey(standard)) {
    return {
      ok: false,
      error: `Invalid Standard: "${standard}" is not in the CPA bridge manifest. Use one of: Lease, Revenue, FixedAsset, Tax.`,
    };
  }

  const entry = CPA_BRIDGE_MANIFEST[standard];
  const missing: string[] = [];
  for (const key of entry.required) {
    const val = params[key];
    if (val === undefined || val === null || (typeof val === 'number' && Number.isNaN(val))) {
      missing.push(key);
    }
  }
  if (missing.length > 0) {
    const standardName = getStandardName(standard);
    const missingList = missing.join(', ');
    return {
      ok: false,
      error: `Incomplete Judgment: Missing ${missingList} for ${standardName}.`,
    };
  }

  try {
    const result = await runDeterministic(standard as BridgeStandardKey, params);
    const standardName = getStandardName(standard as BridgeStandardKey);
    const resultSummary =
      typeof result === 'object' && result !== null
        ? JSON.stringify(result).slice(0, 500)
        : String(result);
    createBridgeAdjustmentJustification(standard, standardName, params, resultSummary);
    if (auditContext) {
      await recordAuditLogAction(auditContext.pool, auditContext.tenantId, {
        action: 'AGENTIC_ADJUSTMENT_EXECUTED',
        resource: `bridge:${standard}`,
        detail: `${standardName} via Deterministic Engine`,
        actor: 'system',
      });
    }
    return { ok: true, result };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Deterministic execution failed: ${message}` };
  }
}

async function runDeterministic(
  standard: BridgeStandardKey,
  params: Record<string, unknown>
): Promise<unknown> {
  switch (standard) {
    case 'Lease': {
      const term = Number(params.term);
      const rate = Number(params.rate);
      const payment = Number(params.payment);
      const std = String(params.standard).toLowerCase() as 'asc842' | 'ifrs16';
      if (std !== 'asc842' && std !== 'ifrs16') {
        throw new Error('Lease standard must be asc842 or ifrs16');
      }
      const payments = Array.from({ length: Math.max(1, Math.round(term)) }, () => round2(payment));
      const periodRate = rate / 12;
      const pvResult = computeLeaseLiability({
        leasePayments: payments,
        discountRate: periodRate,
        paymentTiming: 'end',
      });
      const classification = classifyLease({
        termMonths: term,
        pvOfPayments: pvResult.presentValueOfPayments,
        standard: std,
      });
      return { ...pvResult, ...classification };
    }
    case 'Revenue': {
      const amount = Number(params.amount);
      const periods = Number(params.periods);
      const start_date = String(params.start_date ?? '').trim();
      if (!start_date) throw new Error('Revenue start_date is required');
      return buildLinearRecognitionSchedule(amount, Math.max(1, Math.round(periods)), start_date);
    }
    case 'FixedAsset': {
      const cost = Number(params.cost);
      const life = Number(params.life);
      const method = String(params.method ?? 'straight_line').toLowerCase();
      const start_date =
        typeof params.start_date === 'string' && params.start_date.trim()
          ? params.start_date.trim()
          : new Date().toISOString().slice(0, 10);
      const salvageValue = params.salvageValue != null ? Number(params.salvageValue) : 0;
      if (method === 'declining_balance' || method === 'ddb') {
        return depreciationScheduleDdb(cost, salvageValue, life, start_date, '', '');
      }
      return depreciationScheduleSl(cost, salvageValue, life, start_date, '', '');
    }
    case 'Tax': {
      const temp_diff = Number(params.temp_diff);
      const rate = Number(params.rate);
      const isDeductibleTemp = params.isDeductibleTemp !== false;
      const reportDate =
        typeof params.reportDate === 'string' && params.reportDate.trim()
          ? params.reportDate.trim()
          : undefined;
      const rollforward = computeDeferredTaxesStateless(
        [
          {
            description: 'Agent adjustment',
            bookBasis: temp_diff,
            taxBasis: 0,
            isDeductibleTemp,
          },
        ],
        rate,
        reportDate,
        0,
        0
      );
      return rollforward;
    }
    default: {
      const _: never = standard;
      throw new Error(`Unhandled standard: ${standard}`);
    }
  }
}
