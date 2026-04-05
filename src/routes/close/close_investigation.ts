/**
 * GL Investigation routes — variance investigation + conversational analysis.
 * All read-only: no session write guard needed.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool, getTenantAiPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import * as sessionRepo from '../../db/repositories/close_session_repository.js';
import * as glInvestigation from '../../services/gl_investigation_service.js';
import * as varianceChat from '../../services/variance_chat_service.js';

const router = Router();

/* ── Helpers ──────────────────────────────────────────────────── */

/** Compute prior period from session dates (one calendar month back). */
function computePriorPeriod(periodStart: string): { priorStart: string; priorEnd: string } {
  const d = new Date(periodStart + 'T00:00:00Z');
  const priorEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 0)); // last day of prior month
  const priorStart = new Date(Date.UTC(priorEnd.getUTCFullYear(), priorEnd.getUTCMonth(), 1));
  return {
    priorStart: priorStart.toISOString().slice(0, 10),
    priorEnd: priorEnd.toISOString().slice(0, 10),
  };
}

/* ── POST /sessions/:closeSessionId/investigate ───────────────── */

router.post(
  '/sessions/:closeSessionId/investigate',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }

      const { closeSessionId } = req.params;
      const body = req.body as { fsLineId?: string; question?: string };
      if (!body.fsLineId || typeof body.fsLineId !== 'string') {
        res.status(400).json({ error: 'fsLineId is required' });
        return;
      }

      // Look up session for period info
      const session = await sessionRepo.getCloseSessionById(pool, tenantId, closeSessionId);
      if (!session) {
        res.status(404).json({ error: 'Close session not found' });
        return;
      }

      const { priorStart, priorEnd } = computePriorPeriod(session.periodStart);

      // Run GL investigation (Layer 1)
      const investigation = await glInvestigation.investigateVariance(pool, {
        tenantId,
        entityId: session.entityId,
        fsLineId: body.fsLineId,
        currentPeriodStart: session.periodStart,
        currentPeriodEnd: session.periodEnd,
        priorPeriodStart: priorStart,
        priorPeriodEnd: priorEnd,
        closeSessionId,
      });

      // If question provided, also run conversational layer (Layer 2)
      let explanation;
      if (body.question && typeof body.question === 'string') {
        // Skip Claude call if investigation has no data (accounts likely unmapped)
        const hasData = investigation.contributingAccounts?.length > 0
          || investigation.currentTotal !== '0' && investigation.currentTotal !== '0.00';
        if (!hasData) {
          explanation = {
            answer: 'Variance investigation is not available for this line item because the underlying GL accounts have not been mapped to the financial statement taxonomy. Complete account mapping in the Mapping tab first.',
            numbersUsed: [],
            modelVersion: 'no_mapping',
            provenanceValid: true,
          };
        } else {
          const aiPool = getTenantAiPool(req) ?? pool;
          explanation = await varianceChat.generateVarianceExplanation(aiPool, {
            question: body.question,
            investigationResult: investigation,
            tenantId,
          });
        }
      }

      res.json({ investigation, explanation });
    } catch (e) {
      send500(res, e, 'Investigate variance failed');
    }
  },
);

/* ── POST /sessions/:closeSessionId/investigate/drilldown ─────── */

router.post(
  '/sessions/:closeSessionId/investigate/drilldown',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }

      const { closeSessionId } = req.params;
      const body = req.body as { accountCode?: string };
      if (!body.accountCode || typeof body.accountCode !== 'string') {
        res.status(400).json({ error: 'accountCode is required' });
        return;
      }

      const session = await sessionRepo.getCloseSessionById(pool, tenantId, closeSessionId);
      if (!session) {
        res.status(404).json({ error: 'Close session not found' });
        return;
      }

      const { priorStart, priorEnd } = computePriorPeriod(session.periodStart);

      const drilldown = await glInvestigation.investigateAccount(pool, {
        tenantId,
        entityId: session.entityId,
        accountCode: body.accountCode,
        currentPeriodStart: session.periodStart,
        currentPeriodEnd: session.periodEnd,
        priorPeriodStart: priorStart,
        priorPeriodEnd: priorEnd,
      });

      res.json({ drilldown });
    } catch (e) {
      send500(res, e, 'Account drilldown failed');
    }
  },
);

/* ── POST /sessions/:closeSessionId/investigate/chat ──────────── */

router.post(
  '/sessions/:closeSessionId/investigate/chat',
  async (req: Request, res: Response) => {
    try {
      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }

      const { closeSessionId } = req.params;
      const body = req.body as {
        question?: string;
        fsLineId?: string;
        conversationHistory?: Array<{ role: 'user' | 'assistant'; content: string }>;
      };

      if (!body.question || typeof body.question !== 'string') {
        res.status(400).json({ error: 'question is required' });
        return;
      }
      if (!body.fsLineId || typeof body.fsLineId !== 'string') {
        res.status(400).json({ error: 'fsLineId is required' });
        return;
      }

      const session = await sessionRepo.getCloseSessionById(pool, tenantId, closeSessionId);
      if (!session) {
        res.status(404).json({ error: 'Close session not found' });
        return;
      }

      const { priorStart, priorEnd } = computePriorPeriod(session.periodStart);

      // Run full pipeline: investigate → narrate → validate
      const investigation = await glInvestigation.investigateVariance(pool, {
        tenantId,
        entityId: session.entityId,
        fsLineId: body.fsLineId,
        currentPeriodStart: session.periodStart,
        currentPeriodEnd: session.periodEnd,
        priorPeriodStart: priorStart,
        priorPeriodEnd: priorEnd,
        closeSessionId,
      });

      const aiPool = getTenantAiPool(req) ?? pool;
      const explanation = await varianceChat.generateVarianceExplanation(aiPool, {
        question: body.question,
        investigationResult: investigation,
        conversationHistory: body.conversationHistory,
        tenantId,
      });

      res.json({ explanation });
    } catch (e) {
      send500(res, e, 'Investigation chat failed');
    }
  },
);

export default router;
