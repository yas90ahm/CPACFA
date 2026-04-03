/**
 * Data quality rules and exceptions API.
 */

import { Router, type Request, type Response } from 'express';
import { send500 } from '../lib/errorHandler.js';
import {
  createRule,
  getRuleById,
  listRulesForTenant,
  evaluateRule,
  type RuleEvaluationContext,
} from '../services/data_quality_rule_service.js';
import {
  runRulesAndPersistExceptions,
  getExceptionById,
  listExceptionsForTenant,
  patchException,
  getSummary,
} from '../services/data_quality_exception_service.js';
// QUARANTINED — Agentic remediation suggestions not in MVP architecture
// import { suggestRemediationAgentic } from '../services/agentic_remediation_suggestion.js';
import type { DataQualityRule, DataQualityScope } from '../types/data_quality.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';

const router = Router();

/** GET /api/data-quality/rules — List rules */
router.get('/rules', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    if (!pool) {
      res.json({ rules: [] });
      return;
    }
    const rules = await listRulesForTenant(pool, tenantId);
    res.json({ rules });
  } catch (e) {
    send500(res, e, 'List data quality rules failed');
  }
});

/** POST /api/data-quality/rules — Create rule */
router.post('/rules', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const body = req.body as Omit<DataQualityRule, 'id' | 'createdAt' | 'updatedAt'>;
    if (!body?.name || !body?.scope || !body?.type) {
      res.status(400).json({ error: 'Missing name, scope, or type' });
      return;
    }
    const rule = await createRule(pool, tenantId, {
      name: body.name,
      scope: body.scope as DataQualityScope,
      type: body.type,
      config: body.config ?? {},
      severity: body.severity ?? 'warning',
      enabled: body.enabled !== false,
    });
    res.status(201).json(rule);
  } catch (e) {
    send500(res, e, 'Create data quality rule failed');
  }
});

/** GET /api/data-quality/exceptions — List exceptions (optional periodLabel, ruleId, severity, status, limit) */
router.get('/exceptions', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    if (!pool) {
      res.json({ exceptions: [] });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const ruleId = req.query.ruleId as string | undefined;
    const severity = req.query.severity as string | undefined;
    const status = req.query.status as string | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const list = await listExceptionsForTenant(pool, tenantId, {
      periodLabel,
      ruleId,
      severity,
      status,
      limit,
    });
    // QUARANTINED — Agentic remediation suggestions not in MVP architecture
    // const suggest = req.query.suggest === 'true' || req.query.suggest === '1';
    // if (suggest && list.length > 0) {
    //   const first = list[0];
    //   const suggestion = await suggestRemediationAgentic(first);
    //   res.json({ exceptions: list, suggestionForFirst: suggestion });
    //   return;
    // }
    res.json({ exceptions: list });
  } catch (e) {
    send500(res, e, 'List data quality exceptions failed');
  }
});

/** GET /api/data-quality/exceptions/:id — Get one exception; ?suggest=true for remediation suggestion */
router.get('/exceptions/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(404).json({ error: 'Exception not found' });
      return;
    }
    const ex = await getExceptionById(pool, req.params.id, tenantId);
    if (!ex) {
      res.status(404).json({ error: 'Exception not found' });
      return;
    }
    // QUARANTINED — Agentic remediation suggestions not in MVP architecture
    // const suggest = req.query.suggest === 'true' || req.query.suggest === '1';
    // if (suggest) {
    //   const suggestion = await suggestRemediationAgentic(ex);
    //   res.json({ ...ex, suggestion });
    //   return;
    // }
    res.json(ex);
  } catch (e) {
    send500(res, e, 'Get data quality exception failed');
  }
});

/** PATCH /api/data-quality/exceptions/:id — Acknowledge, resolve, or add note */
router.patch('/exceptions/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const body = req.body as { status?: string; note?: string; acknowledgedBy?: string; resolvedBy?: string };
    const updated = await patchException(pool, req.params.id, tenantId, {
      status: body?.status as 'open' | 'acknowledged' | 'resolved' | undefined,
      note: body?.note,
      acknowledgedBy: body?.acknowledgedBy,
      resolvedBy: body?.resolvedBy,
    });
    if (!updated) {
      res.status(404).json({ error: 'Exception not found' });
      return;
    }
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Update data quality exception failed');
  }
});

/** POST /api/data-quality/run — Run rules and persist exceptions (body: scope, periodLabel?, sourceId?, balanceSheet?, profitAndLoss?, trialBalanceEntries?) */
router.post('/run', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database required' });
      return;
    }
    const body = req.body as {
      scope: DataQualityScope;
      periodLabel?: string;
      sourceId?: string;
      balanceSheet?: unknown;
      profitAndLoss?: unknown;
      trialBalanceEntries?: { accountName: string; debit: number; credit: number }[];
    };
    if (!body?.scope) {
      res.status(400).json({ error: 'Missing scope' });
      return;
    }
    const ctx: RuleEvaluationContext = {
      scope: body.scope,
      periodLabel: body.periodLabel,
      sourceId: body.sourceId,
      balanceSheet: body.balanceSheet as RuleEvaluationContext['balanceSheet'],
      profitAndLoss: body.profitAndLoss as RuleEvaluationContext['profitAndLoss'],
      trialBalanceEntries: body.trialBalanceEntries,
    };
    const created = await runRulesAndPersistExceptions(pool, tenantId, ctx);
    res.status(201).json({ created: created.length, exceptions: created });
  } catch (e) {
    send500(res, e, 'Run data quality rules failed');
  }
});

/** GET /api/data-quality/summary — Counts by severity/rule/period */
router.get('/summary', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    if (!tenantId) { res.status(400).json({ error: 'Tenant context required' }); return; }
    const pool = getTenantPool(req);
    if (!pool) {
      res.json({ bySeverity: {}, byRule: {}, total: 0 });
      return;
    }
    const periodLabel = req.query.periodLabel as string | undefined;
    const summary = await getSummary(pool, tenantId, { periodLabel });
    res.json(summary);
  } catch (e) {
    send500(res, e, 'Data quality summary failed');
  }
});

// QUARANTINED — Agentic remediation suggestions not in MVP architecture
// /** POST /api/data-quality/exceptions/:id/suggest-remediation — Agentic remediation suggestion */
// router.post('/exceptions/:id/suggest-remediation', async (req: Request, res: Response) => {
//   try {
//     const tenantId = getTenantId(req) ?? 'default';
//     const pool = getTenantPool(req);
//     if (!pool) {
//       res.status(503).json({ error: 'Tenant database required' });
//       return;
//     }
//     const ex = await getExceptionById(pool, req.params.id, tenantId);
//     if (!ex) {
//       res.status(404).json({ error: 'Exception not found' });
//       return;
//     }
//     const suggestion = await suggestRemediationAgentic(ex);
//     res.json({ suggestion });
//   } catch (e) {
//     send500(res, e, 'Suggest remediation failed');
//   }
// });

export default router;
