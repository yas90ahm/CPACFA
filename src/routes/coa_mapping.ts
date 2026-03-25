/**
 * COA Mapping: FS taxonomy lines and mapping rules (list, upsert, apply).
 * Mounted at /api/coa-mapping.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
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
import { listFsTaxonomyLines, upsertFsTaxonomyLine, toggleFsTaxonomyLineHidden } from '../db/repositories/fs_taxonomy_repository.js';

const router = Router();

/** In-memory cache for Claude taxonomy search results. Prevents repeated API calls for the same term. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const taxonomyClaudeCache = new Map<string, any[]>();

/** Multer instance for CSV import — memory storage, 10 MB limit. */
const csvUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype?.toLowerCase() ?? '';
    const name = file.originalname?.toLowerCase() ?? '';
    const allowed = ['text/csv', 'application/csv', 'text/plain', 'application/vnd.ms-excel', 'application/octet-stream'];
    if (allowed.includes(mime) || name.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are accepted'));
    }
  },
});

/** Wrap multer middleware so errors surface as 400 responses. */
function handleCsvUpload(req: Request, res: Response, next: import('express').NextFunction) {
  csvUpload.single('file')(req, res, (err: unknown) => {
    if (err) {
      const msg = err instanceof Error ? err.message : 'File upload failed';
      res.status(400).json({ error: msg });
      return;
    }
    next();
  });
}

/** Parse a raw CSV buffer into an array of row objects keyed by header names. */
function parseCsvBuffer(buf: Buffer): Array<Record<string, string>> {
  const text = buf.toString('utf-8').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const lines = text.split('\n').filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];
  const headers = lines[0].split(',').map((h) => h.trim().toLowerCase().replace(/^"|"$/g, ''));
  const rows: Array<Record<string, string>> = [];
  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(',').map((c) => c.trim().replace(/^"|"$/g, ''));
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => { row[h] = cols[idx] ?? ''; });
    rows.push(row);
  }
  return rows;
}

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
  } catch (e: any) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes('ANTHROPIC') || msg.includes('API key') || msg.includes('api_key')) {
      res.status(503).json({ error: 'AI_UNAVAILABLE', message: 'AI classification service is not configured. Accounts can be mapped manually.' });
      return;
    }
    if ((msg.includes('xbrl_taxonomy_elements') || msg.includes('knowledge_embeddings')) && msg.includes('does not exist')) {
      res.status(503).json({ error: 'TAXONOMY_NOT_INITIALIZED', message: 'XBRL taxonomy has not been initialized. Accounts can be mapped manually.' });
      return;
    }
    send500(res, e, 'Get mapping suggestions failed');
  }
});

/** IDs that are section nodes (not mappable targets) */
const SECTION_NODE_IDS = new Set([
  'fs_asset', 'fs_liability', 'fs_equity', 'fs_expense',
  'fs_asset_current', 'fs_asset_noncurrent',
  'fs_liability_current', 'fs_liability_noncurrent',
  'fs_opex', 'fs_other_income',
]);
/** CF and OCI lines should not be mapping targets (CF is derived, OCI is specialized) */
const CF_LINE_IDS = new Set([
  'fs_cf_operating', 'fs_cf_investing', 'fs_cf_financing',
  'fs_oci', 'fs_oci_hedge', 'fs_oci_fx_translation', 'fs_oci_pension', 'fs_oci_unrealized_gains',
]);

/** GET /api/coa-mapping/taxonomy — list FS taxonomy lines */
router.get('/taxonomy', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const search = ((req.query.search ?? req.query.q ?? req.query.query ?? '') as string).trim();
    const limit = parseInt(req.query.limit as string) || 0;
    const allLines = await listTaxonomyLines(pool);
    // Enrich with mappable flag and filter by search
    let lines = allLines.map((l) => ({
      ...l,
      mappable: !l.isSubtotal && !SECTION_NODE_IDS.has(l.id) && !CF_LINE_IDS.has(l.id),
    }));
    if (search) {
      const q = search.toLowerCase();
      // ILIKE filter — only mappable lines that match name, code, or statement
      lines = lines.filter((l) =>
        l.mappable && (
          l.name.toLowerCase().includes(q) ||
          l.code.toLowerCase().includes(q) ||
          (l.statement ?? '').toLowerCase().includes(q)
        )
      );
      // Sort: exact match first, starts-with second, shorter names third (more specific)
      lines.sort((a, b) => {
        const an = a.name.toLowerCase();
        const bn = b.name.toLowerCase();
        // Exact match
        if (an === q && bn !== q) return -1;
        if (bn === q && an !== q) return 1;
        // Starts-with
        const aStarts = an.startsWith(q) ? 0 : 1;
        const bStarts = bn.startsWith(q) ? 0 : 1;
        if (aStarts !== bStarts) return aStarts - bStarts;
        // Shorter name = more specific match
        return an.length - bn.length;
      });
    }

    // If ILIKE found nothing, ask Claude to bridge vocabulary
    // Claude handles ALL naming conventions: UK (trade debtors), Canadian (chequing),
    // IFRS (provisions), industry-specific (motor vehicles vs vehicle expense), etc.
    if (lines.length === 0 && search && process.env.ANTHROPIC_API_KEY) {
      // Check in-memory cache first
      const cacheKey = search.toLowerCase().trim();
      const cached = taxonomyClaudeCache.get(cacheKey);
      if (cached !== undefined) {
        lines = cached;
      } else {
        const pool = getTenantPool(req);
        const tenantId = getTenantId(req) ?? '';
        if (pool) {
          try {
            const { callAIWithSchema } = await import('../ai/ai_client.js');
            const { z } = await import('zod');
            const allMappable = allLines.filter((l) => !l.isSubtotal && !SECTION_NODE_IDS.has(l.id) && !CF_LINE_IDS.has(l.id));
            const linesList = allMappable.map((l) => `${l.id}: "${l.name}" (${l.statement})`).join('\n');

            const SearchSchema = z.object({ fsLineIds: z.array(z.string()), reasoning: z.string() });
            const result = await callAIWithSchema({
              pool, tenantId, pillar: 'taxonomy_search', promptVersion: 'v3',
              systemPrompt: 'You are an expert US GAAP accountant matching GL account terminology to financial statement lines. Respond with JSON only. No markdown fences.',
              userPrompt: `A user searched for "${search}" in the financial statement taxonomy.

Available lines (id: name):
${linesList}

Rules:
1. If "${search}" is a recognized accounting term in ANY language or convention, return the matching line IDs
2. If "${search}" is NOT a recognizable accounting term, return EMPTY array
3. Key mappings:
   - Physical assets ("motor vehicles", "leasehold improvements", "plant", "machinery", "computers") → PP&E lines (fs_asset_ppe)
   - Asset expenses ("vehicle expense", "fuel", "repairs") → SG&A (fs_opex_sga)
   - Banking terms ("bank", "chequing", "checking", "caisse", "kasse") → Cash (fs_asset_cash)
   - UK terms ("trade debtors") → AR, ("trade creditors") → AP, ("stock") → Inventory
   - Payroll ("wages", "salaries", "labour") → SG&A (fs_opex_sga)
   - "drawings" → Retained Earnings (fs_equity_retained)
   - "cost of sales"/"direct costs" → COGS (fs_cogs)

Return JSON: {"fsLineIds":["best_id","second_id"],"reasoning":"brief"}
If no match: {"fsLineIds":[],"reasoning":"not an accounting term"}`,
              schema: SearchSchema,
              requestJson: { search },
            });
            if (result.ok && result.parsed) {
              const matchedIds = new Set(result.parsed.fsLineIds);
              lines = allMappable
                .filter((l) => matchedIds.has(l.id))
                .map((l) => ({ ...l, mappable: true }));
              taxonomyClaudeCache.set(cacheKey, lines);
            } else {
              console.warn('[taxonomy] Claude search failed:', result.error);
              taxonomyClaudeCache.set(cacheKey, []);
            }
          } catch (e) {
            console.warn('[taxonomy] Claude search error:', e instanceof Error ? e.message : String(e));
            taxonomyClaudeCache.set(cacheKey, []);
          }
        }
      }
    }

    if (limit > 0) lines = lines.slice(0, limit);
    res.json({ lines });
  } catch (e) {
    send500(res, e, 'List taxonomy failed');
  }
});

/** POST /api/coa-mapping/taxonomy — create or update a custom taxonomy line */
router.post('/taxonomy', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { id, code, name, statement, parentId, normalBalance } = req.body;
    if (!id || !code || !name || !statement) {
      res.status(400).json({ error: 'id, code, name, and statement are required' });
      return;
    }
    if (!['PL', 'BS', 'CF', 'OCI'].includes(statement)) {
      res.status(400).json({ error: 'statement must be PL, BS, CF, or OCI' });
      return;
    }
    const line = await upsertFsTaxonomyLine(pool, {
      id,
      code,
      name,
      statement,
      parentId: parentId ?? null,
      normalBalance: normalBalance ?? 'debit',
    });
    res.status(201).json(line);
  } catch (e) {
    send500(res, e, 'Create taxonomy line failed');
  }
});

/** DELETE /api/coa-mapping/taxonomy/:id — delete a custom taxonomy line */
router.delete('/taxonomy/:id', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { id } = req.params;
    if (!id.startsWith('fs_custom_')) {
      res.status(400).json({ error: 'Only custom taxonomy lines (fs_custom_*) can be deleted' });
      return;
    }
    // Check no mapping rules reference this line
    const refs = await pool.query(
      'SELECT COUNT(*)::int AS cnt FROM coa_mapping_rules WHERE mapped_fs_line_id = $1',
      [id]
    );
    if (refs.rows[0]?.cnt > 0) {
      res.status(409).json({ error: 'Cannot delete: mapping rules reference this taxonomy line' });
      return;
    }
    const del = await pool.query(
      "DELETE FROM fs_taxonomy_lines WHERE id = $1 AND id LIKE 'fs_custom_%' RETURNING id",
      [id]
    );
    if (del.rowCount === 0) {
      res.status(404).json({ error: 'Taxonomy line not found' });
      return;
    }
    res.json({ success: true });
  } catch (e) {
    send500(res, e, 'Delete taxonomy line failed');
  }
});

/** PATCH /api/coa-mapping/taxonomy/:id — toggle or set is_hidden on a taxonomy line */
router.patch('/taxonomy/:id', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    if (!pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const { id } = req.params;
    const { is_hidden, isHidden } = req.body ?? {};
    // Accept both snake_case and camelCase
    const hiddenValue = is_hidden ?? isHidden;
    const updated = await toggleFsTaxonomyLineHidden(
      pool,
      id,
      hiddenValue != null ? Boolean(hiddenValue) : undefined
    );
    if (!updated) {
      res.status(404).json({ error: 'Taxonomy line not found' });
      return;
    }
    res.json(updated);
  } catch (e) {
    send500(res, e, 'Patch taxonomy line failed');
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

/** GET /api/coa-mapping/import/template — download a CSV template. */
router.get('/import/template', (_req: Request, res: Response) => {
  const template = 'account_code,reporting_line_code\n1000,cash_and_equivalents\n4100,revenue\n';
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="coa_mapping_template.csv"');
  res.send(template);
});

/**
 * POST /api/coa-mapping/import — bulk-import mapping rules from a CSV file.
 *
 * Multipart body:
 *   file     — CSV file (field name "file"). Columns: account_code, reporting_line_code | reporting_line_name
 *   entityId — form field (required)
 *   sessionId — form field (optional, used only for audit context)
 *
 * Response: { imported: N, skipped: N, errors: [{ row, reason }] }
 */
router.post('/import', handleCsvUpload, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const file = req.file;
    if (!file) {
      res.status(400).json({ error: 'CSV file is required (field name: "file")' });
      return;
    }

    const entityId = (req.body?.entityId as string | undefined)?.trim();
    if (!entityId) {
      res.status(400).json({ error: 'entityId form field is required' });
      return;
    }

    // Load taxonomy lines once and build lookup maps (by code and by lowercased name).
    const taxonomyLines = await listFsTaxonomyLines(pool);
    const byCode = new Map<string, string>(); // code → id
    const byName = new Map<string, string>(); // lowercase name → id
    for (const line of taxonomyLines) {
      byCode.set(line.code.toLowerCase(), line.id);
      byName.set(line.name.toLowerCase(), line.id);
    }

    const rows = parseCsvBuffer(file.buffer);
    if (rows.length === 0) {
      res.status(400).json({ error: 'CSV contains no data rows' });
      return;
    }

    type RuleInput = {
      sourceAccountNamePattern: string;
      sourceAccountNumberPattern: string;
      mappedFsLineId: string;
      confidenceDefault: number;
      effectiveFrom: string;
    };

    const rules: RuleInput[] = [];
    const errors: Array<{ row: number; reason: string }> = [];
    let skipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2; // 1-indexed, account for header row

      const accountCode = (row['account_code'] ?? '').trim();
      if (!accountCode) {
        errors.push({ row: rowNum, reason: 'account_code is empty' });
        skipped++;
        continue;
      }

      // Resolve taxonomy line: prefer reporting_line_code, fall back to reporting_line_name.
      const lineCode = (row['reporting_line_code'] ?? '').trim().toLowerCase();
      const lineName = (row['reporting_line_name'] ?? '').trim().toLowerCase();

      let mappedFsLineId: string | undefined;
      if (lineCode) {
        mappedFsLineId = byCode.get(lineCode);
      }
      if (!mappedFsLineId && lineName) {
        mappedFsLineId = byName.get(lineName);
      }

      if (!mappedFsLineId) {
        const tried = lineCode || lineName || '(empty)';
        errors.push({ row: rowNum, reason: `reporting_line not found in taxonomy: "${tried}"` });
        skipped++;
        continue;
      }

      rules.push({
        sourceAccountNamePattern: '%',
        sourceAccountNumberPattern: accountCode,
        mappedFsLineId,
        confidenceDefault: 1,
        effectiveFrom: '2000-01-01',
      });
    }

    let imported = 0;
    if (rules.length > 0) {
      await upsertCoaRules(pool, tenantId, entityId, rules);
      imported = rules.length;
    }

    res.status(200).json({ imported, skipped, errors });
  } catch (e) {
    send500(res, e, 'CSV mapping import failed');
  }
});

export default router;
