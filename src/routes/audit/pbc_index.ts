/**
 * PBC Index — GET /api/audit/pbc-index?closeSessionId=<id>
 * Deterministic summary of audit-prep evidence for a close session (what exists, what's missing).
 * Composes existing services only; no new business logic, no DB writes.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { getSession } from '../../services/close_session_service.js';
import { getLedgerSnapshotById } from '../../db/repositories/ledger_snapshot_repository.js';
import { verifySnapshotHash } from '../../services/ledger_snapshot_service.js';
import { verifyChain } from '../../services/audit_ledger_service.js';
import { getCertifiedStatementsForBinder } from '../../services/audit_export_service.js';
import { computeEvidenceSummary } from '../../services/evidence_policy_service.js';
import { send500 } from '../../lib/errorHandler.js';

const router = Router();

const CONTRACT_VERSION = 'v1';

/** Opt-in absolute URLs: query absoluteUrls=1 or env ABSOLUTE_URLS=true. */
function useAbsoluteUrls(req: Request): boolean {
  return req.query.absoluteUrls === '1' || process.env.ABSOLUTE_URLS === 'true';
}

/** When absolute URLs requested and protocol/host present, return base URL; otherwise return '' for relative. */
export function getBaseUrlForEndpoints(req: Request): string {
  if (!useAbsoluteUrls(req)) return '';
  const protocol = req.protocol;
  const host = req.get('host');
  if (!protocol || !host || typeof host !== 'string' || host.trim() === '') return '';
  return `${protocol}://${host}`.replace(/\/$/, '');
}

interface MissingItem {
  code: string;
  message: string;
  remediation: string;
}

/** Deterministic missing-item list from evidence flags. Exported for unit tests. */
export function buildMissing(
  isLocked: boolean,
  isCertified: boolean,
  snapshotExists: boolean,
  hashVerified: boolean | null,
  chainVerified: boolean | null,
  certifiedStatementsAvailable: boolean
): MissingItem[] {
  const missing: MissingItem[] = [];
  if (!isLocked) {
    missing.push({
      code: 'LOCK_REQUIRED',
      message: 'Session is not locked.',
      remediation: 'Lock the period and move the close session to locked status before certification.',
    });
  }
  if (!isCertified) {
    missing.push({
      code: 'CERTIFICATION_REQUIRED',
      message: 'Session is not certified.',
      remediation: 'Certify the close session to create a certified snapshot and enable binder and certified export.',
    });
  }
  if (isCertified && !snapshotExists) {
    missing.push({
      code: 'SNAPSHOT_MISSING',
      message: 'Certified snapshot is missing for this session.',
      remediation: 'Re-certify the close session to create a certified snapshot.',
    });
  }
  if (snapshotExists && hashVerified === false) {
    missing.push({
      code: 'SNAPSHOT_HASH_UNVERIFIED',
      message: 'Snapshot hash verification failed.',
      remediation: 'Do not rely on this snapshot for audit; re-certify the close session if needed.',
    });
  }
  if (chainVerified === false) {
    missing.push({
      code: 'CHAIN_BROKEN',
      message: 'Audit ledger chain verification failed.',
      remediation: 'Resolve audit ledger chain integrity before relying on export or binder.',
    });
  }
  if (!certifiedStatementsAvailable) {
    missing.push({
      code: 'CERTIFIED_STATEMENTS_UNAVAILABLE',
      message: 'Certified statements are not available for this session.',
      remediation: 'Certify the close session to create a certified snapshot, or use allowLegacyCertifiedSource=1 if legacy source is allowed.',
    });
  }
  return missing;
}

export interface PbcIndexPayload {
  contractVersion: string;
  closeSessionId: string;
  tenantId: string;
  periodLabel: string | null;
  status: { isLocked: boolean; isCertified: boolean; certifiedSnapshotId: string | null };
  evidence: {
    snapshot: {
      exists: boolean;
      snapshotId: string | null;
      snapshotHash: string | null;
      hashVersion: string | null;
      hashVerified: boolean | null;
    };
    auditLedgerChain: { verified: boolean | null; entryCount: number | null; verifiedAt: string | null };
    certifiedStatements: { available: boolean; source: 'certified_snapshot' | 'session_snapshot' | 'legacy' | 'none' };
    binder: {
      available: boolean;
      endpoints: { json: string; zip: string; pdf: string };
    };
    exports: {
      certifiedPdf: { available: boolean; endpoint: string };
      certifiedCsv: { available: boolean; endpoint: string };
    };
  };
  evidenceSummary: import('../../services/evidence_policy_service.js').EvidenceSummary;
  missing: MissingItem[];
}

/**
 * Build PBC index payload for a close session. Session must exist (caller checks getSession first).
 * Used by GET /api/audit/pbc-index and POST /api/precheck/board-ready-pack.
 */
export async function buildPbcIndexPayload(
  pool: NonNullable<ReturnType<typeof getTenantPool>>,
  tenantId: string,
  closeSessionId: string,
  options: { allowLegacy: boolean; baseUrl: string }
): Promise<PbcIndexPayload> {
  const session = await getSession(pool, tenantId, closeSessionId);
  if (!session) {
    throw new Error('NOT_FOUND');
  }
  const isLocked = session.status === 'locked';
  const isCertified = session.status === 'certified';
  const periodLabel = session.periodEnd?.slice(0, 7) ?? null;

  let snapshotId: string | null = null;
  let snapshotHash: string | null = null;
  let hashVersion: string | null = null;
  let hashVerified: boolean | null = null;
  if (session.certifiedSnapshotId) {
    const snapshot = await getLedgerSnapshotById(pool, tenantId, session.certifiedSnapshotId);
    if (snapshot) {
      snapshotId = snapshot.id;
      snapshotHash = snapshot.snapshotHash;
      hashVersion = String(snapshot.hashVersion);
      hashVerified = verifySnapshotHash(snapshot);
    }
  }

  let chainVerified: boolean | null = null;
  let chainEntryCount: number | null = null;
  let chainVerifiedAt: string | null = null;
  try {
    const chainResult = await verifyChain(pool, tenantId);
    chainVerified = chainResult.valid;
    chainEntryCount = chainResult.entryCount;
    chainVerifiedAt = chainResult.verifiedAt ?? null;
  } catch {
    chainVerified = false;
  }

  const certifiedResult = await getCertifiedStatementsForBinder(pool, tenantId, closeSessionId, {
    allowLegacyCertifiedSource: options.allowLegacy,
  });
  const certifiedStatementsAvailable = certifiedResult != null;
  const certifiedStatementsSource: 'certified_snapshot' | 'session_snapshot' | 'legacy' | 'none' =
    certifiedResult?.source ?? 'none';

  const snapshotExists = snapshotId != null;
  const missing = buildMissing(
    isLocked,
    isCertified,
    snapshotExists,
    hashVerified,
    chainVerified,
    certifiedStatementsAvailable
  );

  const evidenceSummary = await computeEvidenceSummary(pool, tenantId, closeSessionId);

  const base = options.baseUrl ? options.baseUrl.replace(/\/$/, '') : '';
  const q = `closeSessionId=${encodeURIComponent(closeSessionId)}`;
  const prefix = base ? `${base}` : '';
  return {
    contractVersion: CONTRACT_VERSION,
    closeSessionId,
    tenantId,
    periodLabel,
    status: {
      isLocked,
      isCertified,
      certifiedSnapshotId: session.certifiedSnapshotId ?? null,
    },
    evidence: {
      snapshot: {
        exists: snapshotExists,
        snapshotId,
        snapshotHash,
        hashVersion,
        hashVerified,
      },
      auditLedgerChain: {
        verified: chainVerified,
        entryCount: chainEntryCount,
        verifiedAt: chainVerifiedAt,
      },
      certifiedStatements: {
        available: certifiedStatementsAvailable,
        source: certifiedStatementsSource,
      },
      binder: {
        available: certifiedStatementsAvailable,
        endpoints: {
          json: `${prefix}/api/audit/binder?${q}`,
          zip: `${prefix}/api/audit/binder.zip?${q}`,
          pdf: `${prefix}/api/audit/binder/export/pdf?${q}`,
        },
      },
      exports: {
        certifiedPdf: {
          available: certifiedStatementsAvailable,
          endpoint: `${prefix}/api/export/pdf?${q}&exportMode=certified`,
        },
        certifiedCsv: {
          available: certifiedStatementsAvailable,
          endpoint: `${prefix}/api/export/csv?${q}&exportMode=certified`,
        },
      },
    },
    evidenceSummary,
    missing,
  };
}

/** GET /api/audit/pbc-index?closeSessionId=<id> */
router.get('/pbc-index', async (req: Request, res: Response) => {
  try {
    const closeSessionId = (req.query.closeSessionId as string)?.trim?.() ?? '';
    if (!closeSessionId) {
      res.status(400).json({
        error: 'Validation failed',
        code: 'VALIDATION',
        message: 'closeSessionId is required as a query parameter.',
      });
      return;
    }

    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({
        error: 'Tenant context required',
        code: 'VALIDATION',
        message: 'Tenant context (tenantId and pool) is required for PBC index.',
      });
      return;
    }

    const session = await getSession(pool, tenantId, closeSessionId);
    if (!session) {
      res.status(404).json({
        error: 'Close session not found',
        code: 'NOT_FOUND',
        message: 'No close session found for the given closeSessionId.',
      });
      return;
    }

    const allowLegacy =
      req.query.allowLegacyCertifiedSource === '1' || process.env.ALLOW_LEGACY_CERTIFIED_SOURCE === 'true';
    const baseUrl = getBaseUrlForEndpoints(req);
    const payload = await buildPbcIndexPayload(pool, tenantId, closeSessionId, { allowLegacy, baseUrl });
    res.json(payload);
  } catch (err) {
    if (err instanceof Error && err.message === 'NOT_FOUND') {
      res.status(404).json({
        error: 'Close session not found',
        code: 'NOT_FOUND',
        message: 'No close session found for the given closeSessionId.',
      });
      return;
    }
    send500(res, err, 'PBC index failed');
  }
});

export default router;
