/**
 * Pre-certification structural check (board-ready).
 * POST /board-ready — stateless; no DB, no close session, no AI.
 * POST /board-ready-pack — same precheck + optional PBC index and trust tokens when closeSessionId provided.
 * Query: ?format=json|text (default json). Mounted at /api/precheck.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { send500 } from '../lib/errorHandler.js';
import { logCriticalRoute } from '../lib/logger.js';
import type { RequestWithId } from '../middleware/requestId.js';
import { precheckVerdictToText } from '../lib/precheck_report_text.js';
import {
  runPrecheckBoardReady,
  type PrecheckTrialBalanceRow,
  type PrecheckJournalEntryLine,
} from '../services/precheck_board_ready_service.js';
import { getSession } from '../services/close_session_service.js';
import { buildPbcIndexPayload, getBaseUrlForEndpoints } from './audit/pbc_index.js';
import { effectiveAllowLegacyCertifiedSource } from '../lib/runtime_mode.js';

const router = Router();

function criticalLog(
  req: Request,
  route: string,
  outcome: string,
  opts: { code?: string; closeSessionId?: string; startMs: number }
): void {
  const requestId = (req as RequestWithId).requestId ?? '';
  logCriticalRoute({
    ts: new Date().toISOString(),
    level: 'info',
    requestId,
    tenantId: getTenantId(req) ?? undefined,
    closeSessionId: opts.closeSessionId,
    route,
    outcome,
    code: opts.code,
    durationMs: Date.now() - opts.startMs,
  });
}

const PACK_CONTRACT_VERSION = 'v1';

interface BoardReadyBody {
  periodLabel?: string;
  trialBalance?: PrecheckTrialBalanceRow[];
  journalEntries?: PrecheckJournalEntryLine[];
  closeSessionId?: string;
}

const ROUTE_BOARD_READY = 'POST /api/precheck/board-ready';
const ROUTE_BOARD_READY_PACK = 'POST /api/precheck/board-ready-pack';

/** POST /api/precheck/board-ready — ?format=json|text (default json) */
router.post('/board-ready', (req: Request, res: Response) => {
  const startMs = Date.now();
  const tenantId = getTenantId(req);
  const body = (req.body ?? {}) as BoardReadyBody;
  const format = (req.query?.format as string)?.toLowerCase() || 'json';

  const periodLabel =
    typeof body.periodLabel === 'string' && body.periodLabel.trim()
      ? body.periodLabel.trim()
      : 'unspecified';

  if (!Array.isArray(body.trialBalance)) {
    criticalLog(req, ROUTE_BOARD_READY, 'error', { code: 'TRIAL_BALANCE_NOT_ARRAY', startMs });
    return res.status(400).json({
      error: 'Invalid request',
      code: 'TRIAL_BALANCE_NOT_ARRAY',
      message: 'Provide trialBalance as an array.',
    });
  }
  if (body.journalEntries !== undefined && !Array.isArray(body.journalEntries)) {
    criticalLog(req, ROUTE_BOARD_READY, 'error', { code: 'JOURNAL_ENTRIES_NOT_ARRAY', startMs });
    return res.status(400).json({
      error: 'Invalid request',
      code: 'JOURNAL_ENTRIES_NOT_ARRAY',
      message: 'When provided, journalEntries must be an array.',
    });
  }

  try {
    const verdict = runPrecheckBoardReady({
      periodLabel,
      trialBalance: body.trialBalance,
      journalEntries: body.journalEntries,
    });

    if (format === 'text') {
      res.type('text/plain').send(precheckVerdictToText(verdict, periodLabel));
      criticalLog(req, ROUTE_BOARD_READY, 'ok', { startMs });
      return;
    }
    res.json({ ...verdict, periodLabel });
    criticalLog(req, ROUTE_BOARD_READY, 'ok', { startMs });
  } catch (err) {
    criticalLog(req, ROUTE_BOARD_READY, 'error', { startMs });
    send500(res, err as Error, 'precheck.board-ready');
  }
});

/** POST /api/precheck/board-ready-pack — precheck + optional PBC index and trust tokens (when closeSessionId in body). */
router.post('/board-ready-pack', async (req: Request, res: Response) => {
  const startMs = Date.now();
  const body = (req.body ?? {}) as BoardReadyBody;
  const closeSessionId = typeof body.closeSessionId === 'string' ? body.closeSessionId.trim() : '';
  const periodLabel =
    typeof body.periodLabel === 'string' && body.periodLabel.trim()
      ? body.periodLabel.trim()
      : 'unspecified';

  if (!Array.isArray(body.trialBalance)) {
    criticalLog(req, ROUTE_BOARD_READY_PACK, 'error', { code: 'TRIAL_BALANCE_NOT_ARRAY', closeSessionId: closeSessionId || undefined, startMs });
    return res.status(400).json({
      error: 'Invalid request',
      code: 'TRIAL_BALANCE_NOT_ARRAY',
      message: 'Provide trialBalance as an array.',
    });
  }
  if (body.journalEntries !== undefined && !Array.isArray(body.journalEntries)) {
    criticalLog(req, ROUTE_BOARD_READY_PACK, 'error', { code: 'JOURNAL_ENTRIES_NOT_ARRAY', closeSessionId: closeSessionId || undefined, startMs });
    return res.status(400).json({
      error: 'Invalid request',
      code: 'JOURNAL_ENTRIES_NOT_ARRAY',
      message: 'When provided, journalEntries must be an array.',
    });
  }

  try {
    const verdict = runPrecheckBoardReady({
      periodLabel,
      trialBalance: body.trialBalance,
      journalEntries: body.journalEntries,
    });
    const precheck = { ...verdict, periodLabel };

    let pbcIndex: Awaited<ReturnType<typeof buildPbcIndexPayload>> | null = null;
    let trustTokens: {
      certifiedSnapshotId: string | null;
      snapshotHash: string | null;
      hashVersion: string | null;
      certifiedSource: 'certified_snapshot' | 'session_snapshot' | 'legacy' | 'none';
    } = {
      certifiedSnapshotId: null,
      snapshotHash: null,
      hashVersion: null,
      certifiedSource: 'none',
    };

    if (closeSessionId) {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        criticalLog(req, ROUTE_BOARD_READY_PACK, 'error', { code: 'VALIDATION', closeSessionId, startMs });
        return res.status(400).json({
          error: 'Tenant context required',
          code: 'VALIDATION',
          message: 'Tenant context is required when closeSessionId is provided.',
        });
      }
      const session = await getSession(pool, tenantId, closeSessionId);
      if (!session) {
        criticalLog(req, ROUTE_BOARD_READY_PACK, 'error', { code: 'NOT_FOUND', closeSessionId, startMs });
        return res.status(404).json({
          error: 'Close session not found',
          code: 'NOT_FOUND',
          message: 'No close session found for the given closeSessionId.',
        });
      }
      const allowLegacy = effectiveAllowLegacyCertifiedSource(req);
      const baseUrl = getBaseUrlForEndpoints(req);
      pbcIndex = await buildPbcIndexPayload(pool, tenantId, closeSessionId, { allowLegacy, baseUrl });
      trustTokens = {
        certifiedSnapshotId: pbcIndex.evidence.snapshot.snapshotId,
        snapshotHash: pbcIndex.evidence.snapshot.snapshotHash,
        hashVersion: pbcIndex.evidence.snapshot.hashVersion,
        certifiedSource: pbcIndex.evidence.certifiedStatements.source,
      };
    }

    const evidenceSummary = pbcIndex?.evidenceSummary ?? null;

    res.json({
      contractVersion: PACK_CONTRACT_VERSION,
      precheck,
      pbcIndex,
      trustTokens,
      evidenceSummary,
    });
    criticalLog(req, ROUTE_BOARD_READY_PACK, 'ok', { closeSessionId: closeSessionId || undefined, startMs });
  } catch (err) {
    criticalLog(req, ROUTE_BOARD_READY_PACK, 'error', { closeSessionId: closeSessionId || undefined, startMs });
    send500(res, err as Error, 'precheck.board-ready-pack');
  }
});

export default router;
