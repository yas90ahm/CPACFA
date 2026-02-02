/**
 * Data quality exceptions: list, acknowledge, resolve, run rules and persist.
 */

import type { Pool } from 'pg';
import type { DataQualityException } from '../types/data_quality.js';
import type { RuleEvaluationContext } from './data_quality_rule_service.js';
import {
  createException,
  getException,
  listExceptions,
  updateException,
  getExceptionSummary,
} from '../db/repositories/data_quality_repository.js';
import { listRulesForTenant, evaluateRule } from './data_quality_rule_service.js';

export async function runRulesAndPersistExceptions(
  pool: Pool,
  tenantId: string,
  ctx: RuleEvaluationContext
): Promise<DataQualityException[]> {
  const rules = await listRulesForTenant(pool, tenantId);
  const created: DataQualityException[] = [];
  for (const rule of rules) {
    const result = evaluateRule(rule, ctx);
    if (!result.passed) {
      const ex = await createException(pool, tenantId, {
        tenantId,
        ruleId: rule.id,
        periodLabel: ctx.periodLabel,
        sourceId: ctx.sourceId,
        status: 'open',
        message: result.message ?? `Rule ${rule.name} failed`,
        metric: result.metric,
        severity: rule.severity,
      });
      created.push(ex);
    }
  }
  return created;
}

export async function getExceptionById(
  pool: Pool,
  id: string,
  tenantId: string
): Promise<DataQualityException | null> {
  return getException(pool, id, tenantId);
}

export async function listExceptionsForTenant(
  pool: Pool,
  tenantId: string,
  params?: { periodLabel?: string; ruleId?: string; severity?: string; status?: string; limit?: number }
): Promise<DataQualityException[]> {
  return listExceptions(pool, tenantId, params);
}

export async function acknowledgeException(
  pool: Pool,
  id: string,
  tenantId: string,
  acknowledgedBy: string
): Promise<DataQualityException | null> {
  return updateException(pool, id, tenantId, { status: 'acknowledged', acknowledgedBy });
}

export async function resolveException(
  pool: Pool,
  id: string,
  tenantId: string,
  update: { resolvedBy: string; note?: string }
): Promise<DataQualityException | null> {
  return updateException(pool, id, tenantId, { status: 'resolved', resolvedBy: update.resolvedBy, note: update.note });
}

export async function patchException(
  pool: Pool,
  id: string,
  tenantId: string,
  update: { status?: DataQualityException['status']; note?: string; acknowledgedBy?: string; resolvedBy?: string }
): Promise<DataQualityException | null> {
  return updateException(pool, id, tenantId, update);
}

export async function getSummary(
  pool: Pool,
  tenantId: string,
  params?: { periodLabel?: string }
): Promise<{ bySeverity: Record<string, number>; byRule: Record<string, number>; total: number }> {
  return getExceptionSummary(pool, tenantId, params);
}
