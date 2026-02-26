/**
 * COA Mapping: FS taxonomy lines and mapping rules (list, upsert, apply).
 * Mounted at /api/coa-mapping.
 */

import { Router, type Request, type Response } from 'express';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { send500 } from '../lib/errorHandler.js';
import {
  listTaxonomyLines,
  listCoaRules,
  upsertCoaRules,
  applyCoaRulesToAccounts,
} from '../services/coa_mapping_service.js';
import { createDecisionRecord } from '../services/decision_record_service.js';
import { checkMappingCompleteness } from '../services/mapping_completeness_gate.js';
import { getCloseSessionById } from '../db/repositories/close_session_repository.js';
import { appendEntry } from '../db/repositories/audit_ledger_repository.js';

const router = Router();

/** GET /api/coa-mapping/suggestions — AI/deterministic suggestions for unmapped accounts. Query: sessionId (required), entityId? */
router.get('/suggestions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const sessionId = req.query.sessionId as string | undefined;
    const entityId = req.query.entityId as string | undefined;

    let resolvedEntityId = entityId;
    if (sessionId && !resolvedEntityId) {
      const session = await getCloseSessionById(pool, tenantId, sessionId);
      resolvedEntityId = session?.entityId ?? undefined;
    }
    if (!sessionId || !resolvedEntityId) {
      res.status(400).json({ error: 'sessionId (and entityId if not derivable from session) required' });
      return;
    }

    const mappingResult = await checkMappingCompleteness(
      pool,
      tenantId,
      sessionId,
      resolvedEntityId
    );
    const unmappedAccounts = mappingResult.unmapped_accounts;

    if (unmappedAccounts.length === 0) {
      res.json({ suggestions: [] });
      return;
    }

    const accounts = unmappedAccounts.map((a) => ({
      accountName: a.account_name,
      accountNumber: a.account_code || undefined,
    }));
    const session = await getCloseSessionById(pool, tenantId, sessionId);
    const asOfDate = session?.periodEnd;

    const { results } = await applyCoaRulesToAccounts(
      pool,
      tenantId,
      resolvedEntityId,
      accounts,
      { asOfDate }
    );

    const suggestions = unmappedAccounts.map((acc, i) => {
      const r = results[i];
      return {
        accountCode: acc.account_code,
        accountName: acc.account_name,
        suggestedLineItemId: r?.fsLineId ?? null,
        suggestedLineItemName: r?.fsLineCode ?? null,
        confidence: r?.confidence != null ? (r.confidence >= 0.9 ? 'high' : r.confidence >= 0.7 ? 'medium' : 'low') : 'medium',
        reasoning: r?.explanation ?? 'No confident match — manual mapping recommended',
      };
    });

    res.json({ suggestions });
  } catch (e) {
    send500(res, e, 'Get mapping suggestions failed');
  }
});

/** GET /api/coa-mapping/taxonomy — list FS taxonomy lines */
router.get('/taxonomy', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const lines = await listTaxonomyLines(pool);
    res.json({ lines });
  } catch (e) {
    send500(res, e, 'List taxonomy failed');
  }
});

/** GET /api/coa-mapping/rules — list rules (query: entityId, version?, asOfDate?) */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const entityId = req.query.entityId as string | undefined;
    if (!entityId) {
      res.status(400).json({ error: 'entityId query is required' });
      return;
    }
    const version = req.query.version as string | undefined;
    const asOfDate = req.query.asOfDate as string | undefined;
    const rules = await listCoaRules(pool, tenantId, entityId, {
      version: version != null ? Number(version) : undefined,
      asOfDate: asOfDate || undefined,
    });
    res.json({ rules });
  } catch (e) {
    send500(res, e, 'List rules failed');
  }
});

/** POST /api/coa-mapping/rules — upsert rule set (body: entityId, rules[]). Increments version. */
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as { entityId?: string; rules?: Array<{
      sourceAccountNamePattern: string;
      sourceAccountNumberPattern?: string;
      mappedFsLineId: string;
      confidenceDefault?: number;
      effectiveFrom: string;
      effectiveTo?: string;
    }> };
    if (!body?.entityId || !Array.isArray(body?.rules)) {
      res.status(400).json({ error: 'entityId and rules[] are required' });
      return;
    }
    const { version, ruleIds } = await upsertCoaRules(pool, tenantId, body.entityId, body.rules);
    res.status(201).json({ version, ruleIds });
  } catch (e) {
    send500(res, e, 'Upsert rules failed');
  }
});

/** POST /api/coa-mapping/map — apply rules to accounts OR save explicit mappings.
 *
 *  Mode 1 (rule-based): body { entityId, accounts[] } → applies rules and returns suggestions.
 *  Mode 2 (explicit):   body { accountCode, fsLineId } or { mappings: [{accountCode, fsLineId/lineItemId}] }
 *                        → creates exact-match COA mapping rules and returns saved count.
 */
router.post('/map', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as Record<string, unknown>;

    // Mode 2: Explicit mapping — single {accountCode, fsLineId} or batch {mappings: [...]}
    const singleMapping = body?.accountCode && (body?.fsLineId || body?.lineItemId);
    const batchMappings = Array.isArray(body?.mappings);
    if (singleMapping || batchMappings) {
      const entityId = (body.entityId as string) || tenantId;
      type MappingInput = { accountCode: string; fsLineId?: string; lineItemId?: string };
      const mappings: MappingInput[] = batchMappings
        ? (body.mappings as MappingInput[])
        : [{ accountCode: body.accountCode as string, fsLineId: (body.fsLineId || body.lineItemId) as string }];

      const rules = mappings.map((m) => ({
        sourceAccountNamePattern: '%',
        sourceAccountNumberPattern: m.accountCode,
        mappedFsLineId: m.fsLineId || m.lineItemId || '',
        confidenceDefault: 1,
        effectiveFrom: '2000-01-01',
      }));

      const { version, ruleIds } = await upsertCoaRules(pool, tenantId, entityId, rules);

      // Write audit ledger events for AI mapping suggestion decisions
      const suggestionSource = body.suggestionSource as string | undefined;
      if (suggestionSource === 'ai_accepted' || suggestionSource === 'ai_edited' || suggestionSource === 'ai_rejected') {
        const eventType = suggestionSource === 'ai_accepted'
          ? 'ai_mapping_suggestion_accepted' as const
          : suggestionSource === 'ai_edited'
            ? 'ai_mapping_suggestion_edited' as const
            : 'ai_mapping_suggestion_rejected' as const;
        try {
          await appendEntry(pool, {
            tenantId,
            eventType,
            deterministicFlagSnapshot: {
              entityId,
              mappingCount: mappings.length,
              mappings: mappings.map((m) => ({
                accountCode: m.accountCode,
                fsLineId: m.fsLineId || m.lineItemId,
              })),
            },
            userPromptRationale: body.rationale as string || `AI mapping suggestion ${suggestionSource.replace('ai_', '')}`,
            beforeState: body.aiOriginalSuggestion != null ? { aiSuggestion: body.aiOriginalSuggestion } : null,
            afterState: { mappings, version },
          });
        } catch (_) {
          /* non-fatal: audit event write failed */
        }
      }

      res.json({ saved: ruleIds.length, version, ruleIds });
      return;
    }

    // Mode 1: Rule-based mapping (original behavior)
    const accounts = body?.accounts as Array<{ accountName: string; accountNumber?: string }> | undefined;
    const entityId = body?.entityId as string | undefined;
    if (!entityId || !Array.isArray(accounts)) {
      res.status(400).json({ error: 'entityId and accounts[] are required, OR provide accountCode and fsLineId for explicit mapping' });
      return;
    }
    const asOfDate = body?.asOfDate as string | undefined;
    const { results, ruleVersionApplied } = await applyCoaRulesToAccounts(
      pool,
      tenantId,
      entityId,
      accounts,
      { asOfDate }
    );
    try {
      await createDecisionRecord(pool, {
        closeSessionId: (body as { closeSessionId?: string }).closeSessionId ?? null,
        tenantId,
        decisionType: 'coa_mapping',
        subjectRef: { entityId, accountCount: accounts.length },
        inputSnapshot: { accounts, asOfDate: asOfDate ?? undefined },
        outputSnapshot: { results, ruleVersionApplied: ruleVersionApplied ?? undefined },
        confidenceScore: results.length > 0 ? results.reduce((a, r) => a + r.confidence, 0) / results.length : null,
        rationaleText: 'COA mapping rules applied; fallback to classifier when no rule match.',
        engineVersion: ruleVersionApplied != null ? `rule_v${ruleVersionApplied}` : 'fallback',
      });
    } catch (_) {
      /* non-fatal: explainability record failed */
    }
    res.json({ results, ruleVersionApplied });
  } catch (e) {
    send500(res, e, 'Apply mapping failed');
  }
});

export default router;
