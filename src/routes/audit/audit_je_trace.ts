/**
 * GET /api/audit/journal-entries/:id/full-trace
 * Unified audit reconstruction endpoint: retrieves the complete decision
 * pathway for any journal entry — JE, lines, AI context, decision records,
 * audit chain events, and certification seal.
 */

import { Router, type Request, type Response } from 'express';
import type { Pool } from 'pg';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import * as jeRepo from '../../db/repositories/journal_entry_repository.js';

const router = Router();

router.get('/journal-entries/:id/full-trace', async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req) as Pool;
    if (!tenantId || !pool) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }

    const jeId = req.params.id;

    // 1. Fetch the journal entry
    const je = await jeRepo.getJournalEntryById(pool, jeId, tenantId);
    if (!je) {
      res.status(404).json({ error: 'Journal entry not found' });
      return;
    }

    // 2. Fetch lines with amount_provenance
    const lines = await jeRepo.listJournalEntryLines(pool, jeId);

    // 3. Fetch decision records for this JE (fetch first — may contain aiCallLogId for deterministic lookup)
    let decisionRecord: { id: string; decisionType: string; confidenceScore: number | null; engineVersion: unknown; inputSnapshot: unknown; outputSnapshot: unknown; promptSnapshot: unknown; aiCallLogId: string | null; createdAt: unknown } | null = null;
    try {
      const { rows: drRows } = await pool.query(
        `SELECT id, decision_type, confidence_score, engine_version,
                input_snapshot, output_snapshot, prompt_snapshot, ai_call_log_id, created_at
         FROM decision_records
         WHERE tenant_id = $1
           AND (subject_ref->>'jeId' = $2 OR subject_ref->>'journalEntryId' = $2
                OR subject_ref->>'je_id' = $2)
         ORDER BY created_at DESC LIMIT 1`,
        [tenantId, jeId]
      );
      if (drRows.length > 0) {
        const row = drRows[0];
        decisionRecord = {
          id: row.id,
          decisionType: row.decision_type,
          confidenceScore: row.confidence_score != null ? Number(row.confidence_score) : null,
          engineVersion: row.engine_version,
          inputSnapshot: row.input_snapshot,
          outputSnapshot: row.output_snapshot,
          promptSnapshot: row.prompt_snapshot,
          aiCallLogId: row.ai_call_log_id ?? null,
          createdAt: row.created_at,
        };
      }
    } catch { /* decision_records may not exist */ }

    // 4. Fetch AI context — prefer deterministic FK, fall back to timestamp proximity for legacy records
    let aiContext = null;
    try {
      const aiCallLogId = decisionRecord?.aiCallLogId;
      const aiQuery = aiCallLogId
        ? {
            sql: `SELECT id, pillar, prompt_version, model,
                    LEFT(request_json::text, 500) AS request_summary,
                    LEFT(response_json::text, 500) AS response_summary,
                    input_tokens, output_tokens, estimated_cost_usd, created_at
                  FROM ai_call_log WHERE id = $1`,
            params: [aiCallLogId],
          }
        : {
            sql: `SELECT id, pillar, prompt_version, model,
                    LEFT(request_json::text, 500) AS request_summary,
                    LEFT(response_json::text, 500) AS response_summary,
                    input_tokens, output_tokens, estimated_cost_usd, created_at
                  FROM ai_call_log
                  WHERE tenant_id = $1
                    AND created_at BETWEEN ($2::timestamptz - interval '5 seconds') AND ($2::timestamptz + interval '5 seconds')
                  ORDER BY ABS(EXTRACT(EPOCH FROM (created_at - $2::timestamptz)))
                  LIMIT 1`,
            params: [tenantId, je.createdAt],
          };
      const { rows: aiRows } = await pool.query(aiQuery.sql, aiQuery.params);
      if (aiRows.length > 0) {
        const row = aiRows[0];
        aiContext = {
          id: row.id,
          model: row.model,
          promptVersion: row.prompt_version,
          pillar: row.pillar,
          requestSummary: row.request_summary,
          responseSummary: row.response_summary,
          inputTokens: row.input_tokens,
          outputTokens: row.output_tokens,
          estimatedCostUsd: row.estimated_cost_usd,
          createdAt: row.created_at,
          correlationMethod: aiCallLogId ? 'deterministic_fk' : 'timestamp_proximity',
        };
      }
    } catch { /* ai_call_log may not exist */ }

    // 5. Fetch audit chain events for this JE's lifecycle
    let auditChain: { events: unknown[]; chainIntegrity: string } = { events: [], chainIntegrity: 'unknown' };
    try {
      const { rows: auditRows } = await pool.query(
        `SELECT id, event_type, created_by, created_at, before_state, after_state,
                deterministic_flag_snapshot, entry_hash
         FROM audit_ledger
         WHERE tenant_id = $1
           AND (deterministic_flag_snapshot->>'je_id' = $2
                OR deterministic_flag_snapshot->>'journalEntryId' = $2
                OR deterministic_flag_snapshot->>'closeSessionId' = $3)
         ORDER BY created_at ASC`,
        [tenantId, jeId, je.closeSessionId]
      );
      const events = auditRows.map((row) => ({
        eventType: row.event_type,
        userId: row.created_by,
        timestamp: row.created_at,
        beforeState: row.before_state,
        afterState: row.after_state,
        details: row.deterministic_flag_snapshot,
      }));

      // Verify chain integrity for the segment
      let chainIntegrity = 'unknown';
      try {
        const { verifyChain } = await import('../../db/repositories/audit_ledger_repository.js');
        const result = await verifyChain(pool, tenantId);
        chainIntegrity = result.valid ? 'verified' : 'tampered';
      } catch {
        chainIntegrity = 'unknown';
      }

      auditChain = { events, chainIntegrity };
    } catch { /* audit_ledger may not exist */ }

    // 6. Fetch certification seal for this JE's period
    let certificationSeal = null;
    try {
      const { rows: certRows } = await pool.query(
        `SELECT id, artifact_hash, created_at,
                artifact_json->>'certifiedBy' AS certified_by,
                LEFT(signature_b64, 32) AS signature_truncated
         FROM certification_artifacts
         WHERE tenant_id = $1 AND close_session_id = $2
         LIMIT 1`,
        [tenantId, je.closeSessionId]
      );
      if (certRows.length > 0) {
        const row = certRows[0];
        certificationSeal = {
          artifactId: row.id,
          artifactHash: row.artifact_hash,
          certifiedAt: row.created_at,
          certifiedBy: row.certified_by,
          signatureTruncated: row.signature_truncated ? `${row.signature_truncated}...` : null,
        };
      }
    } catch { /* certification_artifacts may not exist */ }

    res.json({
      journalEntry: {
        id: je.id,
        memo: je.memo,
        status: je.status,
        closeSessionId: je.closeSessionId,
        createdAt: je.createdAt,
        createdBy: je.createdBy,
        approvedBy: je.approvedBy ?? null,
        postedAt: je.postedAt ?? null,
        source: je.source ?? null,
        lines: lines.map((l) => ({
          accountRef: l.accountRef,
          debit: l.debit,
          credit: l.credit,
          description: l.description,
          amountProvenance: l.amountProvenance ?? null,
        })),
      },
      aiContext,
      decisionRecord,
      auditChain,
      certificationSeal,
    });
  } catch (e) {
    send500(res, e, 'Failed to retrieve JE full trace');
  }
});

export default router;
