/**
 * Export gate — fail-shut before PDF/CSV: audit ledger chain + optional rounding materiality.
 * When Integration is on: also block if unresolved CPA-CFA conflicts exist for the period.
 * On failure: CRITICAL_TAMPER_ALERT, block financial export.
 *
 * Only committed and balanced data can be exported. Save for Later drafts (tenant_draft_adjustments)
 * are never included; export uses period_trial_balance and approved HITL adjustments only.
 *
 * Zero-trust: materiality flags are read only from period_export_checks (DB). The gate
 * performs a server-side state-check; caller must not supply roundingGapExceedsMateriality
 * or aggregateRoundingExceedsMateriality.
 */

import type { Pool } from 'pg';
import { verifyChain } from './audit_ledger_service.js';
import { getQualitativeEvidenceMissing } from './risk_context_store.js';
import { ENABLE_INTEGRATED_SUPERVISOR } from '../lib/capability_flags.js';
import { getUnresolvedConflicts } from './risk_context_store.js';
import * as conflictsRepo from '../db/repositories/risk_context_conflicts_repository.js';
import * as auditLedgerRepo from '../db/repositories/audit_ledger_repository.js';
import { getPeriodExportChecks } from '../db/repositories/period_export_checks_repository.js';
import { listStoredEvidenceForPeriod } from '../db/repositories/evidence_repository.js';
import { getEvidenceStorageAdapterAsync, verifyEvidenceIntegrity } from './evidence_storage_service.js';
import { getAdjustedTrialBalance } from './adjusted_trial_balance_service.js';
import { getEffectiveMateriality } from './materiality_config_service.js';
import { sumRound2, minus as decMinus, absGt } from '../utils/decimal.js';
import { log } from '../lib/logger.js';

export const CRITICAL_TAMPER_ALERT = 'CRITICAL_TAMPER_ALERT';
export const TAMPERING_ATTEMPT_DETECTED = 'TAMPERING_ATTEMPT_DETECTED';
export const UNRESOLVED_CONFLICTS_ALERT = 'UNRESOLVED_CONFLICTS';
export const RESOLUTION_MISMATCH = 'RESOLUTION_MISMATCH';

export interface ExportGateInput {
  tenantId: string;
  pool: Pool;
  /** Period for unresolved-conflict check (Integration) and for server-side materiality state-check. */
  periodLabel?: string;
}

export interface ExportGateResult {
  allowed: boolean;
  alert?: typeof CRITICAL_TAMPER_ALERT | typeof TAMPERING_ATTEMPT_DETECTED | typeof UNRESOLVED_CONFLICTS_ALERT | typeof RESOLUTION_MISMATCH;
  message?: string;
  /** When true, qualitative evidence is missing for the period (informational). */
  qualitativeEvidenceMissing?: boolean;
  /** When alert is RESOLUTION_MISMATCH: resolved vs ledger resolution counts. */
  details?: { resolvedCount: number; ledgerResolutionCount: number };
}

/**
 * Run export gate: server-side state-check (period_export_checks), audit ledger chain, and optional conflict check.
 * Materiality is read only from DB when periodLabel is present; caller must not supply materiality flags.
 * Call before generating PDF/CSV. On allowed: false, return 403 with appropriate alert.
 */
export async function checkExportGate(input: ExportGateInput): Promise<ExportGateResult> {
  if (input.periodLabel) {
    let roundingGapExceedsMateriality = false;
    let aggregateRoundingExceedsMateriality = false;

    const stored = await getPeriodExportChecks(input.pool, input.tenantId, input.periodLabel);
    if (stored) {
      roundingGapExceedsMateriality = stored.roundingGapExceedsMateriality === true;
      aggregateRoundingExceedsMateriality = stored.aggregateRoundingExceedsMateriality === true;
    } else {
      // No pre-computed period_export_checks: compute materiality on-the-fly from trial balance.
      try {
        const entries = await getAdjustedTrialBalance(input.tenantId, input.periodLabel, input.pool);
        const debitValues = entries.map((e) => e.debit ?? 0);
        const creditValues = entries.map((e) => e.credit ?? 0);
        const totalDebit = sumRound2(debitValues);
        const totalCredit = sumRound2(creditValues);
        const roundingGap = Math.abs(decMinus(totalDebit, totalCredit));

        const materiality = await getEffectiveMateriality(input.pool, input.tenantId);
        const absoluteThreshold = materiality.absoluteThreshold > 0 ? materiality.absoluteThreshold : 1000;
        const relativeThreshold = Number.isFinite(materiality.relativeThreshold) ? materiality.relativeThreshold : 0.005;
        const totalBase = Math.max(totalDebit, totalCredit, 1);
        const relativeThresholdAmount = totalBase * relativeThreshold;
        const effectiveMateriality = Math.max(absoluteThreshold, relativeThresholdAmount);

        roundingGapExceedsMateriality = absGt(totalDebit, totalCredit, effectiveMateriality);
        aggregateRoundingExceedsMateriality = roundingGap > effectiveMateriality;

        log('info', 'Materiality computed on-the-fly; no pre-computed period_export_checks found', {
          tenantId: input.tenantId,
          periodLabel: input.periodLabel,
          roundingGap,
          effectiveMateriality,
          absoluteThreshold,
          relativeThreshold,
        });
      } catch (e) {
        return {
          allowed: false,
          alert: CRITICAL_TAMPER_ALERT,
          message:
            'No trial balance for this period; cannot compute materiality. Run ingest or consolidation first. Financial export blocked.',
        };
      }
    }

    if (roundingGapExceedsMateriality) {
      return {
        allowed: false,
        alert: CRITICAL_TAMPER_ALERT,
        message: 'Rounding gap exceeds aggregate materiality; financial export blocked.',
      };
    }
    if (aggregateRoundingExceedsMateriality) {
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

  if (input.periodLabel) {
    const storedEvidence = await listStoredEvidenceForPeriod(input.pool, input.tenantId, input.periodLabel);
    const adapter = await getEvidenceStorageAdapterAsync();
    for (const ev of storedEvidence) {
      const verify = await verifyEvidenceIntegrity(adapter, input.tenantId, ev.id, ev.hashSha256);
      if (!verify.valid) {
        return {
          allowed: false,
          alert: CRITICAL_TAMPER_ALERT,
          message: `Evidence integrity check failed for ${ev.id}; hash mismatch. Financial export blocked.`,
        };
      }
    }
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
    // Integrity check: resolved conflict count must match ledger user_induced_variance count for period.
    // Mismatch blocks export (deterministic certification).
    const resolvedCount = await conflictsRepo.countResolvedByTenantPeriod(input.pool, input.tenantId, input.periodLabel);
    const ledgerResolutionCount = await auditLedgerRepo.countByTenantPeriodAndEventType(
      input.pool,
      input.tenantId,
      input.periodLabel,
      'user_induced_variance'
    );
    if (resolvedCount !== ledgerResolutionCount) {
      return {
        allowed: false,
        alert: RESOLUTION_MISMATCH,
        message: 'Ledger resolution mismatch: export blocked.',
        details: { resolvedCount, ledgerResolutionCount },
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
