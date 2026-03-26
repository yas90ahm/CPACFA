/**
 * Reconciliation Intelligence Service
 *
 * Makes reconciliation semi-autonomous by:
 * 1. Pre-filling supporting balances from prior period certified recons
 * 2. Auto-resolving reconciling items that cleared in the current period
 * 3. Suggesting new reconciling items from GL activity patterns
 * 4. Extracting balances from uploaded bank statement PDFs
 *
 * Priority order for supporting balance:
 * 1. Bank API balance (if connected — future)
 * 2. PDF extraction (if bank statement uploaded as evidence)
 * 3. Prior period carry-forward (certified recon's supporting balance)
 *
 * All pre-filled values are marked with source so the controller
 * can see what was auto-populated vs manually entered.
 */

import type { Pool } from 'pg';
import type { PeriodReconciliation, ReconItem } from '../types/period_reconciliation.js';

export type BalanceSource =
  | 'bank_api'
  | 'pdf_extraction'
  | 'prior_period'
  | 'manual';

export interface PreFillResult {
  reconId: string;
  accountCode: string;
  accountName: string | null;
  /** Pre-filled supporting balance (null if no source available) */
  suggestedBalance: string | null;
  /** Where the balance came from */
  source: BalanceSource;
  /** Confidence in the pre-fill */
  confidence: 'high' | 'medium' | 'low';
  /** Additional context for controller */
  sourceDetail: string;
  /** Items that auto-resolved from prior period */
  resolvedItems: number;
  /** New items suggested from GL activity */
  suggestedItems: Array<{
    description: string;
    amount: string;
    itemType: string;
    reason: string;
  }>;
}

export interface IntelligenceResult {
  preFills: PreFillResult[];
  totalRecons: number;
  preFilled: number;
  fromPriorPeriod: number;
  fromPdfExtraction: number;
  fromBankApi: number;
  itemsAutoResolved: number;
  itemsSuggested: number;
}

/**
 * Run reconciliation intelligence for all recons in a session.
 * Called after initializeReconciliations and evidence upload.
 */
export async function runReconIntelligence(
  pool: Pool,
  tenantId: string,
  closeSessionId: string,
  entityId: string
): Promise<IntelligenceResult> {
  const { listPeriodReconciliationsByPeriod } = await import('../db/repositories/period_reconciliation_repository.js');
  const recons = await listPeriodReconciliationsByPeriod(pool, tenantId, closeSessionId);

  if (recons.length === 0) {
    return emptyResult();
  }

  // Get prior period recons for carry-forward
  const { getPriorPeriodRecons } = await import('../db/repositories/period_reconciliation_repository.js');
  const priorRecons = await getPriorPeriodRecons(pool, tenantId, entityId, closeSessionId);
  const priorByAccount = new Map(priorRecons.map((p) => [p.accountCode, p]));

  // Get prior period reconciling items for auto-resolution
  const { listReconItemsByReconId } = await import('../db/repositories/period_reconciliation_repository.js');
  const priorItemsByRecon = new Map<string, ReconItem[]>();
  for (const prior of priorRecons) {
    const items = await listReconItemsByReconId(pool, prior.reconId);
    priorItemsByRecon.set(prior.accountCode, items);
  }

  // Check for uploaded bank statement evidence
  const { getObjectIdsWithEvidence } = await import('../db/repositories/evidence_repository.js');
  const reconIdsWithEvidence = await getObjectIdsWithEvidence(
    pool, tenantId, 'reconciliation', recons.map((r) => r.reconId)
  );

  const preFills: PreFillResult[] = [];
  let fromPriorPeriod = 0;
  let fromPdfExtraction = 0;
  let fromBankApi = 0;
  let totalPreFilled = 0;
  let totalItemsResolved = 0;
  let totalItemsSuggested = 0;

  for (const recon of recons) {
    // Skip recons that already have a supporting balance
    if (recon.supportingBalance != null) {
      preFills.push({
        reconId: recon.reconId,
        accountCode: recon.accountCode,
        accountName: recon.accountName,
        suggestedBalance: recon.supportingBalance,
        source: 'manual',
        confidence: 'high',
        sourceDetail: 'Manually entered',
        resolvedItems: 0,
        suggestedItems: [],
      });
      continue;
    }

    let suggestedBalance: string | null = null;
    let source: BalanceSource = 'manual';
    let confidence: PreFillResult['confidence'] = 'low';
    let sourceDetail = 'No source available';
    let resolvedItems = 0;
    const suggestedItems: PreFillResult['suggestedItems'] = [];

    // Priority 1: Bank API (live bank balance if connection configured)
    try {
      const { fetchBankBalance } = await import('./bank_connection_service.js');
      const session = await import('../db/repositories/close_session_repository.js').then(m => m.getCloseSessionById(pool, tenantId, closeSessionId));
      const asOfDate = session?.periodEnd ?? new Date().toISOString().slice(0, 10);
      const bankBalance = await fetchBankBalance(pool, tenantId, recon.accountCode, asOfDate);
      if (bankBalance) {
        suggestedBalance = String(bankBalance.balance);
        source = 'bank_api';
        confidence = 'high';
        sourceDetail = `Live balance from ${bankBalance.institution ?? 'bank'} as of ${bankBalance.asOfDate ?? asOfDate}`;
        fromBankApi++;
      }
    } catch {
      // Bank connection unavailable — fall through to PDF/prior period
    }

    // Priority 2: PDF extraction (if evidence uploaded for this recon)
    if (!suggestedBalance && reconIdsWithEvidence.has(recon.reconId)) {
      try {
        const extracted = await extractBalanceFromEvidence(pool, tenantId, recon.reconId);
        if (extracted) {
          suggestedBalance = extracted.balance;
          source = 'pdf_extraction';
          confidence = extracted.confidence === 'high' ? 'high' : 'medium';
          sourceDetail = `Extracted from ${extracted.institution ?? 'bank statement'}: "${extracted.excerpt ?? ''}"`;
          fromPdfExtraction++;
        }
      } catch {
        // Extraction failed — fall through to prior period
      }
    }

    // Priority 3: Prior period carry-forward
    if (!suggestedBalance) {
      const prior = priorByAccount.get(recon.accountCode);
      if (prior && prior.supportingBalance != null) {
        suggestedBalance = prior.supportingBalance;
        source = 'prior_period';
        confidence = 'low'; // Prior period balance is a starting point, not the current balance
        sourceDetail = `Carried from prior period (${prior.periodId}). Prior supporting balance was ${prior.supportingBalance}. Verify against current statement.`;
        fromPriorPeriod++;
      }
    }

    // Auto-resolve prior period items that likely cleared
    const priorItems = priorItemsByRecon.get(recon.accountCode) ?? [];
    const unresolvedPrior = priorItems.filter((i) => i.resolvedAt === null);

    if (unresolvedPrior.length > 0 && recon.glBalance != null) {
      // Items from prior period that are no longer needed
      // (Simple heuristic: if GL balance changed in the direction that would resolve the item)
      const prior = priorByAccount.get(recon.accountCode);
      if (prior && prior.glBalance != null) {
        const glDelta = Number(recon.glBalance) - Number(prior.glBalance);
        for (const item of unresolvedPrior) {
          const itemAmount = Number(item.amount);
          // If the GL moved in a way that covers this item, suggest resolution
          if (Math.sign(glDelta) === Math.sign(itemAmount) && Math.abs(glDelta) >= Math.abs(itemAmount) * 0.8) {
            suggestedItems.push({
              description: `[Auto-resolve] ${item.description} — GL activity suggests this item has cleared`,
              amount: item.amount,
              itemType: item.itemType,
              reason: 'GL balance change covers this reconciling item',
            });
            resolvedItems++;
          }
        }
      }
    }

    if (suggestedBalance) {
      totalPreFilled++;
    }
    totalItemsResolved += resolvedItems;
    totalItemsSuggested += suggestedItems.length;

    preFills.push({
      reconId: recon.reconId,
      accountCode: recon.accountCode,
      accountName: recon.accountName,
      suggestedBalance,
      source,
      confidence,
      sourceDetail,
      resolvedItems,
      suggestedItems,
    });
  }

  return {
    preFills,
    totalRecons: recons.length,
    preFilled: totalPreFilled,
    fromPriorPeriod,
    fromPdfExtraction,
    fromBankApi,
    itemsAutoResolved: totalItemsResolved,
    itemsSuggested: totalItemsSuggested,
  };
}

/**
 * Apply pre-fills to reconciliations — sets supporting balance with source tracking.
 */
export async function applyPreFills(
  pool: Pool,
  tenantId: string,
  preFills: PreFillResult[]
): Promise<{ applied: number; skipped: number }> {
  const { updateReconSupportingBalance } = await import('../db/repositories/period_reconciliation_repository.js');
  let applied = 0;
  let skipped = 0;

  for (const pf of preFills) {
    if (!pf.suggestedBalance || pf.source === 'manual') {
      skipped++;
      continue;
    }

    try {
      await updateReconSupportingBalance(
        pool,
        tenantId,
        pf.reconId,
        pf.suggestedBalance,
        `${pf.source}:${pf.sourceDetail.slice(0, 200)}`
      );
      applied++;
    } catch {
      skipped++;
    }
  }

  return { applied, skipped };
}

/**
 * Extract balance from evidence attached to a reconciliation.
 * Finds the first PDF evidence and runs extraction.
 */
async function extractBalanceFromEvidence(
  pool: Pool,
  tenantId: string,
  reconId: string
): Promise<{ balance: string; confidence: 'high' | 'medium' | 'low'; institution: string | null; excerpt: string | null } | null> {
  const { listEvidenceForObject } = await import('../db/repositories/evidence_repository.js');
  const evidence = await listEvidenceForObject(pool, tenantId, 'reconciliation', reconId);

  // Find PDF evidence (bank statements)
  const pdfEvidence = evidence.filter((e) =>
    e.mimeType === 'application/pdf' || e.originalFilename?.endsWith('.pdf')
  );

  if (pdfEvidence.length === 0) return null;

  // Try to retrieve and extract from the first PDF
  const { getEvidenceStorageAdapterAsync } = await import('./evidence_storage_service.js');
  const adapter = await getEvidenceStorageAdapterAsync();

  for (const ev of pdfEvidence) {
    try {
      const result = await adapter.retrieve(tenantId, ev.id);
      if (!result) continue;

      const { extractFromPDF } = await import('./bank_statement_extraction_service.js');
      const extraction = await extractFromPDF(result.buffer);

      if (extraction.balance) {
        return {
          balance: extraction.balance,
          confidence: extraction.confidence,
          institution: extraction.institution,
          excerpt: extraction.excerpt,
        };
      }
    } catch {
      // Individual PDF extraction failed — try next
    }
  }

  return null;
}

function emptyResult(): IntelligenceResult {
  return {
    preFills: [],
    totalRecons: 0,
    preFilled: 0,
    fromPriorPeriod: 0,
    fromPdfExtraction: 0,
    fromBankApi: 0,
    itemsAutoResolved: 0,
    itemsSuggested: 0,
  };
}
