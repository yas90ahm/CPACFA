/**
 * Evidence policy enforcement for certification gate (Phase 2A).
 * Deterministic: no AI, no review workflow.
 * When policy.enforcement_mode != 'off', checks material JEs have required evidence.
 * Phase 2D: computeEvidenceSummary for visibility (PBC index, board-ready-pack).
 */

import type { Pool } from 'pg';
import { getEvidencePolicy } from '../db/repositories/evidence_policy_repository.js';
import * as jeRepo from '../db/repositories/journal_entry_repository.js';
import { sumRound2, from as dec } from '../utils/decimal.js';
import {
  listAssertionTypesByJournalEntryForSession,
  listEvidenceForObject,
} from '../db/repositories/evidence_repository.js';
import { normalizeMoney } from '../utils/decimal.js';
import { listPeriodReconciliationsByPeriod } from '../db/repositories/period_reconciliation_repository.js';

export interface MissingEvidenceDetail {
  journalEntryId: string;
  journalEntryType: string;
  amount: string;
  requiredAssertionTypes: string[];
  existingAssertionTypes: string[];
}

export interface EvidenceSummary {
  enforcementMode: 'off' | 'warn_only' | 'hard_block';
  materialityThreshold: string | null;
  totalJournalEntries: number;
  materialJournalEntries: number;
  journalEntriesWithEvidence: number;
  journalEntriesMissingRequiredEvidence: number;
  missingEvidenceDetails: MissingEvidenceDetail[];
}
export interface EvidencePolicyCheckResult {
  hardBlockers: Array<{ code: string; message: string; jeId?: string }>;
  softWarnings: Array<{ message: string; jeId?: string }>;
}

/** Derive JE type from journal entry. Use existing classification if available; default manual_entry. */
function deriveJeType(je: { source: string }, _lines?: { accountRef: string; debit: string | number; credit: string | number }[]): string {
  // Phase 2A: simple mapping. Future: derive from account types (revenue, cash, etc.)
  switch (je.source) {
    case 'recon':
      return 'reconciliation';
    default:
      return 'manual_entry';
  }
}

/** Compute JE amount (max of sum debits / sum credits for materiality comparison). */
function computeJeAmount(lines: { debit: string | number; credit: string | number }[]): number {
  const sumDebits = sumRound2(lines.map((l) => Number(l.debit ?? 0)));
  const sumCredits = sumRound2(lines.map((l) => Number(l.credit ?? 0)));
  return Math.max(sumDebits, sumCredits);
}

export async function checkEvidencePolicyForCertification(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<EvidencePolicyCheckResult> {
  const hardBlockers: EvidencePolicyCheckResult['hardBlockers'] = [];
  const softWarnings: EvidencePolicyCheckResult['softWarnings'] = [];

  const policy = await getEvidencePolicy(pool, tenantId);
  const effectiveMode = policy?.enforcementMode ?? 'off';
  if (effectiveMode === 'off') {
    return { hardBlockers, softWarnings };
  }

  const materialityThreshold = policy?.materialityThreshold;
  const thresholdNum =
    materialityThreshold != null && materialityThreshold !== ''
      ? Number(materialityThreshold)
      : 0;
  const requiredTypes = policy?.requiredAssertionTypes ?? {};

  const jes = await jeRepo.listJournalEntries(pool, tenantId, {
    closeSessionId,
    limit: 1000,
  });
  const assertionMap = await listAssertionTypesByJournalEntryForSession(
    pool,
    tenantId,
    closeSessionId
  );

  for (const je of jes) {
    const jeAmount = await (async () => {
      const lines = await jeRepo.listJournalEntryLines(pool, je.id);
      return computeJeAmount(lines);
    })();

    if (jeAmount < thresholdNum) continue;

    const jeType = deriveJeType(je);
    const required = requiredTypes[jeType];
    if (!required || required.length === 0) continue;

    const assertions = assertionMap.get(je.id) ?? [];
    const hasMatch = required.some((r) => assertions.includes(r));

    if (!hasMatch) {
      const msg = `Journal entry ${je.id} (type: ${jeType}, amount >= ${materialityThreshold}) requires evidence with assertion type(s): ${required.join(', ')}`;
      if (effectiveMode === 'hard_block') {
        hardBlockers.push({ code: 'EVIDENCE_REQUIRED', message: msg, jeId: je.id });
      } else {
        softWarnings.push({ message: msg, jeId: je.id });
      }
    }
  }

  // Check reconciliation evidence requirements
  const recons = await listPeriodReconciliationsByPeriod(pool, tenantId, closeSessionId);
  const reconRequiredTypes = requiredTypes['reconciliation'];
  if (reconRequiredTypes && reconRequiredTypes.length > 0) {
    for (const recon of recons) {
      if (recon.status !== 'completed' && recon.status !== 'approved') continue;
      const glBalance = recon.glBalance != null ? dec(String(recon.glBalance)).abs().toDecimalPlaces(2).toNumber() : 0;
      if (glBalance < thresholdNum) continue;

      const reconEvidence = await listEvidenceForObject(pool, tenantId, 'reconciliation', recon.reconId);
      const reconAssertions = reconEvidence.flatMap((e) =>
        e.link?.assertionType ? [e.link.assertionType] : []
      );
      const hasReconMatch = reconRequiredTypes.some((r) => reconAssertions.includes(r as typeof reconAssertions[number]));
      if (!hasReconMatch) {
        const msg = `Reconciliation ${recon.accountCode} (balance: ${recon.glBalance}) requires evidence with assertion type(s): ${reconRequiredTypes.join(', ')}`;
        if (effectiveMode === 'hard_block') {
          hardBlockers.push({ code: 'RECON_EVIDENCE_REQUIRED', message: msg });
        } else {
          softWarnings.push({ message: msg });
        }
      }
    }
  }

  return { hardBlockers, softWarnings };
}

/**
 * Compute evidence summary for visibility (PBC index, board-ready-pack).
 * Does not change enforcement logic; surfaces status only.
 * When enforcement_mode = 'off', missingEvidenceDetails is empty.
 */
export async function computeEvidenceSummary(
  pool: Pool,
  tenantId: string,
  closeSessionId: string
): Promise<EvidenceSummary> {
  const policy = await getEvidencePolicy(pool, tenantId);
  const effectiveMode = policy?.enforcementMode ?? 'off';
  const materialityThreshold = policy?.materialityThreshold ?? null;
  const requiredTypes = policy?.requiredAssertionTypes ?? {};

  const jes = await jeRepo.listJournalEntries(pool, tenantId, {
    closeSessionId,
    limit: 1000,
  });
  const assertionMap = await listAssertionTypesByJournalEntryForSession(
    pool,
    tenantId,
    closeSessionId
  );

  const thresholdNum =
    materialityThreshold != null && materialityThreshold !== ''
      ? Number(materialityThreshold)
      : 0;

  let materialJournalEntries = 0;
  let journalEntriesWithEvidence = 0;
  let journalEntriesMissingRequiredEvidence = 0;
  const missingDetails: MissingEvidenceDetail[] = [];

  for (const je of jes) {
    const lines = await jeRepo.listJournalEntryLines(pool, je.id);
    const jeAmount = computeJeAmount(lines);
    const amountStr = normalizeMoney(jeAmount);
    const jeType = deriveJeType(je, lines);
    const existingAssertions = assertionMap.get(je.id) ?? [];
    const hasEvidence = existingAssertions.length > 0;

    if (hasEvidence) journalEntriesWithEvidence++;

    if (effectiveMode === 'off') {
      continue;
    }

    if (jeAmount < thresholdNum) continue;
    materialJournalEntries++;

    const required = requiredTypes[jeType];
    if (!required || required.length === 0) continue;

    const hasMatch = required.some((r) => existingAssertions.includes(r));
    if (!hasMatch) {
      journalEntriesMissingRequiredEvidence++;
      missingDetails.push({
        journalEntryId: je.id,
        journalEntryType: jeType,
        amount: amountStr,
        requiredAssertionTypes: [...required],
        existingAssertionTypes: [...existingAssertions],
      });
    }
  }

  missingDetails.sort((a, b) => a.journalEntryId.localeCompare(b.journalEntryId));

  return {
    enforcementMode: effectiveMode,
    materialityThreshold,
    totalJournalEntries: jes.length,
    materialJournalEntries,
    journalEntriesWithEvidence,
    journalEntriesMissingRequiredEvidence,
    missingEvidenceDetails: missingDetails,
  };
}
