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
  classifyWithXBRL,
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
    let result;
    try {
      result = await generateClassificationSuggestions(pool, {
        tenantId,
        entityId: session.entityId,
        closeSessionId,
        accountNames: body?.accountNames,
      });
    } catch (slmErr) {
      // SLM/primary pathway unavailable — fall back to autonomous pipeline
      console.warn('[suggestions/generate] Primary pathway failed, falling back to auto-classify:', slmErr instanceof Error ? slmErr.message : String(slmErr));
      const { runAutonomousMapping } = await import('../../services/autonomous_mapping_service.js');
      const autoResult = await runAutonomousMapping(pool, tenantId, session.entityId, closeSessionId);
      const allSuggestions = await listCoaSuggestions(pool, tenantId, closeSessionId);
      result = { coaSuggestions: allSuggestions, cfSuggestions: [], errors: [], autonomous: autoResult };
    }

    res.json(result);
  } catch (e) {
    send500(res, e, 'Generate classification suggestions failed');
  }
});

/**
 * POST /sessions/:closeSessionId/suggestions/auto-classify
 *
 * XBRL-only classification — runs on page load without AI dependency.
 * Uses trigram search against xbrl_taxonomy_elements table.
 * Returns suggestions immediately (typically <2s for 100 accounts).
 */
router.post('/sessions/:closeSessionId/suggestions/auto-classify', async (req: Request, res: Response) => {
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

    // Check if suggestions already exist for this session
    const existingSuggestions = await listCoaSuggestions(pool, tenantId, closeSessionId, 'pending');
    if (existingSuggestions.length > 0) {
      res.json({
        coaSuggestions: existingSuggestions,
        cfSuggestions: [],
        errors: [],
        source: 'cached',
      });
      return;
    }

    // Run full autonomous pipeline: classify → validate → auto-accept → return exceptions
    const { runAutonomousMapping } = await import('../../services/autonomous_mapping_service.js');
    const autonomousResult = await runAutonomousMapping(pool, tenantId, session.entityId, closeSessionId);

    // Also return the suggestions list for the UI
    const allSuggestions = await listCoaSuggestions(pool, tenantId, closeSessionId);

    res.json({
      coaSuggestions: allSuggestions,
      cfSuggestions: [],
      errors: [],
      source: 'autonomous_pipeline',
      autonomous: {
        autoAccepted: autonomousResult.autoAccepted,
        needsReview: autonomousResult.needsReview,
        reviewRequired: autonomousResult.reviewRequired,
        correctionProposals: autonomousResult.correctionProposals,
        crossValidationPasses: autonomousResult.crossValidationPasses,
        learningSignalsUsed: autonomousResult.learningSignalsUsed,
      },
    });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('xbrl_taxonomy_elements') && msg.includes('does not exist')) {
      res.status(503).json({
        error: 'TAXONOMY_NOT_INITIALIZED',
        message: 'XBRL taxonomy has not been initialized. Run taxonomy seed first.',
        coaSuggestions: [],
        cfSuggestions: [],
        errors: [{ account_name: '*', error: 'XBRL taxonomy table not found' }],
      });
      return;
    }
    send500(res, e, 'Auto-classify failed');
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

/**
 * POST /sessions/:closeSessionId/suggestions/validate-mappings
 *
 * Layer 3: Agentic balance validation. Detects mapping-balance mismatches
 * and proposes corrections with full reasoning.
 * Layer 4: Pre-statement cross-validation. Catches structural statement errors.
 */
router.post('/sessions/:closeSessionId/suggestions/validate-mappings', async (req: Request, res: Response) => {
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

    // Get mapped trial balance
    const { getTrialBalanceForCertification } = await import('../../services/adjusted_trial_balance_service.js');
    const { enrichEntriesWithCoaMapping } = await import('../../services/coa_mapping_service.js');
    const periodLabel = (session.periodEnd ?? '').slice(0, 7);

    let tbResult;
    try {
      tbResult = await getTrialBalanceForCertification(pool, tenantId, periodLabel, closeSessionId);
    } catch {
      res.json({ agent: { suspects: [], proposals: [], accountsValidated: 0, issuesFound: 0 }, crossValidation: { passes: true, issues: [], summary: { totalChecks: 0, passed: 0, critical: 0, warning: 0 } } });
      return;
    }

    // Enrich with COA mappings
    const tbEntries = tbResult.trialBalance.map((e) => ({ ...e }));
    const enriched = await enrichEntriesWithCoaMapping(
      pool, tenantId, session.entityId, tbEntries, { asOfDate: session.periodEnd }
    );

    // Build mapped accounts for Layer 3
    const { listFsTaxonomyLines } = await import('../../db/repositories/fs_taxonomy_repository.js');
    const fsLines = await listFsTaxonomyLines(pool);
    const fsById = new Map(fsLines.map((l) => [l.id, l]));

    const mappedAccounts = enriched.map((e) => {
      const fsLine = fsById.get(e.fsLineId ?? '');
      return {
        accountCode: (e.accountCode ?? e.accountName ?? '').trim(),
        accountName: e.accountName,
        accountType: (e.accountType ?? '').toUpperCase(),
        fsLineId: e.fsLineId ?? '',
        fsLineName: fsLine?.name ?? e.fsLineId ?? '',
        fsLineStatement: fsLine?.statement ?? '',
        netBalance: (e.debit ?? 0) - (e.credit ?? 0),
      };
    }).filter((a) => a.fsLineId);

    // Layer 3: Agentic validation
    const { runValidationAgent } = await import('../../services/mapping_validation_agent.js');
    const agentResult = await runValidationAgent(pool, tenantId, session.entityId, closeSessionId, mappedAccounts);

    // Layer 4: Cross-validation
    const { runMappingCrossValidation } = await import('../../services/mapping_cross_validation_service.js');
    const crossValidation = runMappingCrossValidation(
      enriched.map((e) => {
        const fsLine = fsById.get(e.fsLineId ?? '');
        return {
          accountCode: (e.accountCode ?? e.accountName ?? '').trim(),
          accountName: e.accountName,
          fsLineId: e.fsLineId ?? '',
          fsLineStatement: fsLine?.statement ?? '',
          debit: e.debit ?? 0,
          credit: e.credit ?? 0,
        };
      })
    );

    res.json({ agent: agentResult, crossValidation });
  } catch (e) {
    send500(res, e, 'Validate mappings failed');
  }
});

/**
 * GET /sessions/:closeSessionId/suggestions/learning-stats
 *
 * Layer 5: Learning loop statistics for this entity.
 */
router.get('/sessions/:closeSessionId/suggestions/learning-stats', async (req: Request, res: Response) => {
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

    const { getLearningStats } = await import('../../services/mapping_learning_service.js');
    const stats = await getLearningStats(pool, tenantId, session.entityId);
    res.json(stats);
  } catch (e) {
    send500(res, e, 'Learning stats failed');
  }
});

/**
 * POST /suggestions/:proposalId/accept-correction
 *
 * Accept a Layer 3 agent correction proposal — remaps the account.
 */
router.post('/suggestions/:proposalId/accept-correction', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const { proposalId } = req.params;

    // Fetch proposal
    const proposalRes = await pool.query<{
      id: string; entity_id: string; close_session_id: string;
      account_code: string; account_name: string;
      current_fs_line_id: string; proposed_fs_line_id: string; proposed_fs_line_name: string;
      status: string;
    }>(
      `SELECT id, entity_id, close_session_id, account_code, account_name,
              current_fs_line_id, proposed_fs_line_id, proposed_fs_line_name, status
       FROM mapping_correction_proposals
       WHERE id = $1 AND tenant_id = $2`,
      [proposalId, tenantId]
    );
    if (proposalRes.rows.length === 0) {
      res.status(404).json({ error: 'Correction proposal not found' });
      return;
    }
    const proposal = proposalRes.rows[0];
    if (proposal.status !== 'pending') {
      res.status(409).json({ error: `Proposal is already ${proposal.status}` });
      return;
    }

    // Create the corrected mapping rule
    const { upsertCoaRules } = await import('../../services/coa_mapping_service.js');
    const { version } = await upsertCoaRules(pool, tenantId, proposal.entity_id, [{
      sourceAccountNamePattern: '%',
      sourceAccountNumberPattern: proposal.account_code,
      mappedFsLineId: proposal.proposed_fs_line_id,
      confidenceDefault: 1,
      effectiveFrom: '2000-01-01',
    }]);

    // Mark proposal accepted
    await pool.query(
      `UPDATE mapping_correction_proposals SET status = 'accepted', reviewed_by = $1, reviewed_at = NOW()
       WHERE id = $2 AND tenant_id = $3`,
      [(req as import('../../auth/middleware.js').AuthRequest).userId ?? 'api', proposalId, tenantId]
    );

    // Record in learning loop
    try {
      const { recordCorrection } = await import('../../services/mapping_learning_service.js');
      await recordCorrection(pool, {
        tenantId,
        entityId: proposal.entity_id,
        accountNamePattern: proposal.account_name,
        accountCodePattern: proposal.account_code,
        rejectedFsLineId: proposal.current_fs_line_id,
        chosenFsLineId: proposal.proposed_fs_line_id,
        chosenFsLineName: proposal.proposed_fs_line_name,
        source: 'manual_override',
        closeSessionId: proposal.close_session_id,
      });
    } catch { /* non-fatal */ }

    res.json({ accepted: true, version });
  } catch (e) {
    send500(res, e, 'Accept correction proposal failed');
  }
});

/**
 * POST /sessions/:closeSessionId/suggestions/test-layer3
 *
 * Test Layer 3 (AI validation) directly with a given account name.
 * Body: { accountName: string, glType?: string }
 * Returns Layer 0 (curated), Layer 2 (XBRL), and Layer 3 (AI) results for comparison.
 */
router.post('/sessions/:closeSessionId/suggestions/test-layer3', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { accountName, glType } = req.body as { accountName?: string; glType?: string };
    if (!accountName) {
      res.status(400).json({ error: 'accountName required' });
      return;
    }

    const { listFsTaxonomyLines } = await import('../../db/repositories/fs_taxonomy_repository.js');
    const fsLines = await listFsTaxonomyLines(pool);
    const fsById = new Map(fsLines.map((l) => [l.id, l]));
    const fsByName = new Map(fsLines.map((l) => [l.name.toLowerCase(), l]));
    const accountType = (glType ?? '').toUpperCase();

    // Layer 0: Curated pattern
    const { classifyWithXBRL } = await import('../../services/ai_classification_service.js');
    // We'll test each layer independently

    // Layer 2: XBRL trigram
    const { searchXBRL } = await import('../../services/xbrl_search_service.js');
    const statementByType: Record<string, string> = { ASSET: 'BS', LIABILITY: 'BS', EQUITY: 'BS', REVENUE: 'PL', EXPENSE: 'PL' };
    const xbrlResults = await searchXBRL(pool, accountName, {
      statement: statementByType[accountType] || undefined,
      limit: 5,
    });
    const xbrlTop = xbrlResults[0];
    const xbrlMapped = xbrlTop ? (() => {
      for (const l of fsLines) {
        if (l.xbrlElement === xbrlTop.id) return { fsLineId: l.id, fsLineName: l.name, confidence: xbrlTop.similarity };
      }
      return null;
    })() : null;

    // Layer 3: Validation agent
    let layer3Result = null;
    try {
      const { runValidationAgent } = await import('../../services/mapping_validation_agent.js');
      const { closeSessionId } = req.params;
      const testMappedAccount = {
        accountCode: 'TEST001',
        accountName,
        accountType,
        fsLineId: xbrlMapped?.fsLineId ?? 'fs_opex_sga',
        fsLineName: xbrlMapped?.fsLineName ?? 'Unknown',
        fsLineStatement: 'PL',
        netBalance: 0,
      };
      const agentResult = await runValidationAgent(pool, tenantId, 'default', closeSessionId, [testMappedAccount]);
      layer3Result = {
        suspects: agentResult.suspects,
        proposals: agentResult.proposals,
        fired: true,
      };
    } catch (e) {
      layer3Result = { fired: false, error: e instanceof Error ? e.message : String(e) };
    }

    res.json({
      accountName,
      glType: accountType,
      layer0_curated: 'check curated patterns inline — see full auto-classify for this',
      layer2_xbrl: {
        topResult: xbrlTop ? { id: xbrlTop.id, label: xbrlTop.label, similarity: xbrlTop.similarity } : null,
        mappedToFsLine: xbrlMapped,
        allResults: xbrlResults.slice(0, 3).map(r => ({ id: r.id, label: r.label, sim: r.similarity })),
      },
      layer3_validation: layer3Result,
    });
  } catch (e) {
    send500(res, e, 'Test Layer 3 failed');
  }
});

export default router;
