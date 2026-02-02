/**
 * Export gate — fail-shut before PDF/CSV: audit ledger chain + optional rounding materiality.
 * When Integration is on: also block if unresolved CPA-CFA conflicts exist for the period.
 * On failure: CRITICAL_TAMPER_ALERT, block financial export.
 *
 * Zero-trust: materiality flags are read only from period_export_checks (DB). The gate
 * performs a server-side state-check; caller must not supply roundingGapExceedsMateriality
 * or aggregateRoundingExceedsMateriality.
 */

import type { Pool } from 'pg';
import { verifyChain } from './audit_ledger_service.js';
import { ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';
import { getUnresolvedConflicts } from './risk_context_store.js';
import * as conflictsRepo from '../db/repositories/risk_context_conflicts_repository.js';
import * as auditLedgerRepo from '../db/repositories/audit_ledger_repository.js';
import { getPeriodExportChecks } from '../db/repositories/period_export_checks_repository.js';

export const CRITICAL_TAMPER_ALERT = 'CRITICAL_TAMPER_ALERT';
export const TAMPERING_ATTEMPT_DETECTED = 'TAMPERING_ATTEMPT_DETECTED';
export const UNRESOLVED_CONFLICTS_ALERT = 'UNRESOLVED_CONFLICTS';

export interface ExportGateInput {
  tenantId: string;
  pool: Pool;
  /** Period for unresolved-conflict check (Integration) and for server-side materiality state-check. */
  periodLabel?: string;
}

export interface ExportGateResult {
  allowed: boolean;
  alert?: typeof CRITICAL_TAMPER_ALERT | typeof TAMPERING_ATTEMPT_DETECTED | typeof UNRESOLVED_CONFLICTS_ALERT;
  message?: string;
}

/**
 * Run export gate: server-side state-check (period_export_checks), audit ledger chain, and optional conflict check.
 * Materiality is read only from DB when periodLabel is present; caller must not supply materiality flags.
 * Call before generating PDF/CSV. On allowed: false, return 403 with appropriate alert.
 */
export async function checkExportGate(input: ExportGateInput): Promise<ExportGateResult> {
  if (input.periodLabel) {
    const stored = await getPeriodExportChecks(input.pool, input.tenantId, input.periodLabel);
    if (stored?.roundingGapExceedsMateriality === true) {
      return {
        allowed: false,
        alert: CRITICAL_TAMPER_ALERT,
        message: 'Rounding gap exceeds aggregate materiality; financial export blocked.',
      };
    }
    if (stored?.aggregateRoundingExceedsMateriality === true) {
      return {
        allowed: false,
        alert: CRITICAL_TAMPER_ALERT,
        message: 'Aggregate rounding error exceeds materiality; financial export blocked.',
      };
    }
  }

  const chainResult = await verifyChain(input.pool, input.tenantId);
  if (!chainResult.valid) {
    return {
      allowed: false,
      alert: CRITICAL_TAMPER_ALERT,
      message: chainResult.message ?? 'Audit ledger chain verification failed; financial export blocked.',
    };
  }

  if (ENABLE_INTEGRATED_SUPERVISOR) {
    if (input.periodLabel == null || input.periodLabel === '') {
      return {
        allowed: false,
        alert: UNRESOLVED_CONFLICTS_ALERT,
        message: 'periodLabel required for export when Integration is enabled.',
      };
    }
    const conflicts = await getUnresolvedConflicts(input.pool, input.tenantId, input.periodLabel);
    if (conflicts.length > 0) {
      return {
        allowed: false,
        alert: UNRESOLVED_CONFLICTS_ALERT,
        message: `Unresolved CPA-CFA conflict(s) (${conflicts.length}); resolve via Resolution Memo before export.`,
      };
    }
    // Optional integrity check: resolved conflict count vs ledger user_induced_variance count for period
    const resolvedCount = await conflictsRepo.countResolvedByTenantPeriod(input.pool, input.tenantId, input.periodLabel);
    const ledgerResolutionCount = await auditLedgerRepo.countByTenantPeriodAndEventType(
      input.pool,
      input.tenantId,
      input.periodLabel,
      'user_induced_variance'
    );
    if (resolvedCount !== ledgerResolutionCount) {
      return {
        allowed: true,
        message: `Export allowed. Integrity check: resolved conflict count (${resolvedCount}) for period does not match ledger resolution count (${ledgerResolutionCount}).`,
      };
    }
    const qualitativeEvidenceMissing = await getQualitativeEvidenceMissing(input.pool, input.tenantId, input.periodLabel);
    return {
      allowed: true,
      ...(qualitativeEvidenceMissing && { qualitativeEvidenceMissing: true }),
    };
  }

  return { allowed: true };
}
