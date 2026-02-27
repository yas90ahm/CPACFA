/**
 * AI Classification Suggestions routes.
 *
 * Endpoints for generating, listing, accepting, and rejecting SLM-based
 * COA mapping and Cash Flow classification suggestions.
 *
 * All suggestions are AI-advisory — human confirmation required before
 * any suggestion becomes a real COA mapping rule.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { getCloseSessionById } from '../../db/repositories/close_session_repository.js';
import {
  generateClassificationSuggestions,
  listCoaSuggestions,
  listCfSuggestions,
  acceptCoaSuggestion,
  acceptCfSuggestion,
  rejectCoaSuggestion,
  rejectCfSuggestion,
} from '../../services/ai_classification_service.js';
import { checkHealth } from '../../services/slm_client_service.js';

const router = Router();

/**
 * POST /sessions/:closeSessionId/suggestions/generate
 *
 * Generate COA + CF classification suggestions for unmapped accounts.
 * Optionally pass { accountNames: [...] } to classify specific accounts.
 */
router.post('/sessions/:closeSessionId/suggestions/generate', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const { closeSessionId } = req.params;
    const session = await getCloseSessionById(pool, tenantId, closeSessionId);
    if (!session) {
      res.status(404).json({ error: 'Close session not found' });
      return;
    }

    const body = req.body as { accountNames?: string[] } | undefined;
    const result = await generateClassificationSuggestions(pool, {
      tenantId,
      entityId: session.entityId,
      closeSessionId,
      accountNames: body?.accountNames,
    });

    res.json(result);
  } catch (e) {
    send500(res, e, 'Generate classification suggestions failed');
  }
});

/**
 * GET /sessions/:closeSessionId/suggestions
 *
 * List all suggestions for a session. Query: ?type=coa|cf&status=pending|accepted|rejected|expired
 */
router.get('/sessions/:closeSessionId/suggestions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const { closeSessionId } = req.params;
    const type = req.query.type as string | undefined;
    const status = req.query.status as string | undefined;

    const result: { coaSuggestions?: unknown[]; cfSuggestions?: unknown[] } = {};

    if (!type || type === 'coa') {
      result.coaSuggestions = await listCoaSuggestions(pool, tenantId, closeSessionId, status);
    }
    if (!type || type === 'cf') {
      result.cfSuggestions = await listCfSuggestions(pool, tenantId, closeSessionId, status);
    }

    res.json(result);
  } catch (e) {
    send500(res, e, 'List suggestions failed');
  }
});

/**
 * POST /suggestions/:suggestionId/accept
 *
 * Accept a suggestion. Body: { type: 'coa'|'cf', overrideFsLineId?, overrideClassification? }
 * Creates a real COA mapping rule and fires the MAPPING_CHANGED cascade.
 */
router.post('/suggestions/:suggestionId/accept', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const { suggestionId } = req.params;
    const body = req.body as {
      type: 'coa' | 'cf';
      overrideFsLineId?: string;
      overrideClassification?: string;
      reviewedBy?: string;
    };

    if (!body?.type || !['coa', 'cf'].includes(body.type)) {
      res.status(400).json({ error: 'type must be "coa" or "cf"' });
      return;
    }

    const reviewedBy = body.reviewedBy || tenantId;

    if (body.type === 'coa') {
      const result = await acceptCoaSuggestion(pool, tenantId, suggestionId, reviewedBy, body.overrideFsLineId);
      res.json({ accepted: true, ...result });
    } else {
      const result = await acceptCfSuggestion(pool, tenantId, suggestionId, reviewedBy, body.overrideClassification);
      res.json({ accepted: true, ...result });
    }
  } catch (e) {
    if (e instanceof Error && (e.message.includes('not found') || e.message.includes('already'))) {
      res.status(400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Accept suggestion failed');
  }
});

/**
 * POST /suggestions/:suggestionId/reject
 *
 * Reject a suggestion. Body: { type: 'coa'|'cf', reason? }
 */
router.post('/suggestions/:suggestionId/reject', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const { suggestionId } = req.params;
    const body = req.body as {
      type: 'coa' | 'cf';
      reason?: string;
      reviewedBy?: string;
    };

    if (!body?.type || !['coa', 'cf'].includes(body.type)) {
      res.status(400).json({ error: 'type must be "coa" or "cf"' });
      return;
    }

    const reviewedBy = body.reviewedBy || tenantId;

    if (body.type === 'coa') {
      await rejectCoaSuggestion(pool, tenantId, suggestionId, reviewedBy, body.reason);
    } else {
      await rejectCfSuggestion(pool, tenantId, suggestionId, reviewedBy, body.reason);
    }

    res.json({ rejected: true });
  } catch (e) {
    if (e instanceof Error && (e.message.includes('not found') || e.message.includes('already'))) {
      res.status(400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Reject suggestion failed');
  }
});

/**
 * GET /suggestions/health
 *
 * Check SLM microservice health. Returns connectivity status and model versions.
 */
router.get('/suggestions/health', async (_req: Request, res: Response) => {
  try {
    const health = await checkHealth();
    if (!health) {
      res.json({ available: false, error: 'SLM service unreachable' });
      return;
    }
    res.json({ available: true, ...health });
  } catch (e) {
    send500(res, e, 'SLM health check failed');
  }
});

export default router;
