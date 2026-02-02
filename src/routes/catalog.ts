/**
 * Data catalog API: list datasets, run query (for UI/API consumers).
 */

import { Router, type Request, type Response } from 'express';
import { send500 } from '../lib/errorHandler.js';
import {
  listDatasetsForTenant,
  getDataset,
  createCustomDataset,
  updateCustomDataset,
  deleteCustomDataset,
} from '../services/data_catalog_service.js';
import { runCatalogQuery } from '../services/catalog_query_service.js';
import { resolveQueryIntentAgentic } from '../services/agentic_query_intent.js';
import { summarizeQueryResultAgentic } from '../services/agentic_query_summary.js';
import { suggestFollowUpQuestionsAgentic } from '../services/agentic_query_follow_up.js';
import type { DataCatalogDatasetType } from '../types/data_catalog.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';

const router = Router();

/** GET /api/catalog/datasets — List available datasets for tenant (default + custom) */
router.get('/datasets', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const datasets = await listDatasetsForTenant(pool, tenantId);
    res.json({ datasets });
  } catch (e) {
    send500(res, e, 'List catalog datasets failed');
  }
});

/** POST /api/catalog/query — Run query (body: datasetId, periodLabel?, entityId?, limit?); optional ?summarize=true, ?suggest_follow_up=true */
router.post('/query', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const body = req.body as { datasetId: string; periodLabel?: string; entityId?: string; limit?: number };
    if (!body?.datasetId) {
      res.status(400).json({ error: 'Missing datasetId' });
      return;
    }
    const result = await runCatalogQuery(
      tenantId,
      body.datasetId,
      {
        periodLabel: body.periodLabel,
        entityId: body.entityId,
        limit: body.limit,
      },
      pool
    );
    if (!result) {
      res.status(404).json({ error: 'Dataset not found or no data' });
      return;
    }
    const summarize = req.query.summarize === 'true' || req.query.summarize === '1';
    const suggestFollowUp = req.query.suggest_follow_up === 'true' || req.query.suggest_follow_up === '1';
    if (summarize || suggestFollowUp) {
      const [summary, followUpQuestions] = await Promise.all([
        summarize ? summarizeQueryResultAgentic(result) : Promise.resolve(undefined),
        suggestFollowUp ? suggestFollowUpQuestionsAgentic(result) : Promise.resolve(undefined),
      ]);
      res.json({ ...result, ...(summary != null ? { summary } : {}), ...(followUpQuestions != null ? { followUpQuestions } : {}) });
      return;
    }
    res.json(result);
  } catch (e) {
    send500(res, e, 'Catalog query failed');
  }
});

/** POST /api/catalog/datasets — Create custom dataset (body: name, type, schema?). Custom ids only. */
router.post('/datasets', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database not available' });
      return;
    }
    const body = req.body as { name: string; type: DataCatalogDatasetType; schema?: { name: string; type: string }[] };
    if (!body?.name?.trim() || !body?.type) {
      res.status(400).json({ error: 'Missing name or type' });
      return;
    }
    const entry = await createCustomDataset(pool, tenantId, {
      name: body.name.trim(),
      type: body.type,
      schema: body.schema,
    });
    res.status(201).json(entry);
  } catch (e) {
    send500(res, e, 'Create catalog dataset failed');
  }
});

/** GET /api/catalog/datasets/:id — Get one dataset (default or custom) */
router.get('/datasets/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req) ?? null;
    const id = (req.params as { id: string }).id;
    const entry = await getDataset(id, pool, tenantId);
    if (!entry) {
      res.status(404).json({ error: 'Dataset not found' });
      return;
    }
    res.json(entry);
  } catch (e) {
    send500(res, e, 'Get catalog dataset failed');
  }
});

/** PATCH /api/catalog/datasets/:id — Update custom dataset (body: name?, type?, schema?). Only custom entries. */
router.patch('/datasets/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database not available' });
      return;
    }
    const id = (req.params as { id: string }).id;
    const body = req.body as { name?: string; type?: DataCatalogDatasetType; schema?: { name: string; type: string }[] };
    const entry = await updateCustomDataset(pool, tenantId, id, body);
    if (!entry) {
      res.status(404).json({ error: 'Custom dataset not found or cannot update default' });
      return;
    }
    res.json(entry);
  } catch (e) {
    send500(res, e, 'Update catalog dataset failed');
  }
});

/** DELETE /api/catalog/datasets/:id — Delete custom dataset. Only custom entries. */
router.delete('/datasets/:id', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req) ?? 'default';
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(503).json({ error: 'Tenant database not available' });
      return;
    }
    const id = (req.params as { id: string }).id;
    const deleted = await deleteCustomDataset(pool, tenantId, id);
    if (!deleted) {
      res.status(404).json({ error: 'Custom dataset not found or cannot delete default' });
      return;
    }
    res.status(204).send();
  } catch (e) {
    send500(res, e, 'Delete catalog dataset failed');
  }
});

/** POST /api/catalog/resolve-intent — Agentic: natural-language question → suggested datasetId + filters */
router.post('/resolve-intent', async (req: Request, res: Response) => {
  try {
    const body = req.body as { question?: string };
    const question = (body?.question ?? '').trim();
    if (!question) {
      res.status(400).json({ error: 'Missing question' });
      return;
    }
    const intent = await resolveQueryIntentAgentic(question);
    res.json(intent ?? { datasetId: 'profit_and_loss', periodLabel: undefined, entityId: undefined });
  } catch (e) {
    send500(res, e, 'Resolve query intent failed');
  }
});

export default router;
