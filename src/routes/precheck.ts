/**
 * Pre-certification structural check (board-ready).
 * POST /board-ready — stateless; no DB, no close session, no AI.
 * Mounted at /api/precheck.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId } from '../lib/tenant_context.js';
import { send500 } from '../lib/errorHandler.js';
import {
  runPrecheckBoardReady,
  type PrecheckTrialBalanceRow,
  type PrecheckJournalEntryLine,
} from '../services/precheck_board_ready_service.js';

const router = Router();

interface BoardReadyBody {
  periodLabel?: string;
  trialBalance?: PrecheckTrialBalanceRow[];
  journalEntries?: PrecheckJournalEntryLine[];
}

/** POST /api/precheck/board-ready */
router.post('/board-ready', (req: Request, res: Response) => {
  const tenantId = getTenantId(req);
  const body = (req.body ?? {}) as BoardReadyBody;

  if (typeof body.periodLabel !== 'string' || !body.periodLabel.trim()) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'periodLabel is required; provide a non-empty string.',
    });
  }
  if (!Array.isArray(body.trialBalance)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'Provide trialBalance as an array.',
    });
  }
  if (body.journalEntries !== undefined && !Array.isArray(body.journalEntries)) {
    return res.status(400).json({
      error: 'Invalid request',
      message: 'When provided, journalEntries must be an array.',
    });
  }

  try {
    const verdict = runPrecheckBoardReady({
      periodLabel: body.periodLabel.trim(),
      trialBalance: body.trialBalance,
      journalEntries: body.journalEntries,
    });
    res.json(verdict);
  } catch (err) {
    send500(req, res, err as Error, 'precheck.board-ready');
  }
});

export default router;
