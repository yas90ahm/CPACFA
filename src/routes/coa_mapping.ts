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

const router = Router();

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

/** POST /api/coa-mapping/map — apply rules to accounts (body: entityId, accounts[]). Returns fs_line_id + explanation per account. */
router.post('/map', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as {
      entityId?: string;
      accounts?: Array<{ accountName: string; accountNumber?: string }>;
      asOfDate?: string;
    };
    if (!body?.entityId || !Array.isArray(body?.accounts)) {
      res.status(400).json({ error: 'entityId and accounts[] are required' });
      return;
    }
    const { results, ruleVersionApplied } = await applyCoaRulesToAccounts(
      pool,
      tenantId,
      body.entityId,
      body.accounts,
      { asOfDate: body.asOfDate }
    );
    try {
      await createDecisionRecord(pool, {
        closeSessionId: (body as { closeSessionId?: string }).closeSessionId ?? null,
        tenantId,
        decisionType: 'coa_mapping',
        subjectRef: { entityId: body.entityId, accountCount: body.accounts.length },
        inputSnapshot: { accounts: body.accounts, asOfDate: body.asOfDate ?? undefined },
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
