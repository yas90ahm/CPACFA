/**
 * Bank transaction routes — upload bank statements, run matching, manage matches.
 */

import { Router } from 'express';
import type { Pool } from 'pg';
import { parseBankStatement } from '../../services/bank_statement_parser_service.js';
import * as bankRepo from '../../db/repositories/bank_transaction_repository.js';
import {
  runMatchingEngine,
  persistMatchGroups,
  confirmMatchGroup,
  rejectMatchGroup,
  getMatchingSummary,
} from '../../services/transaction_matching_service.js';
import type { GLTransaction } from '../../services/transaction_matching_service.js';

export function createBankTransactionRoutes(getPool: (tenantId: string) => Promise<Pool>): Router {
  const router = Router();

  /**
   * POST /close/sessions/:sessionId/bank-transactions/parse
   * Parse a bank statement (preview, no persist). Returns parsed transactions.
   */
  router.post('/sessions/:sessionId/bank-transactions/parse', async (req, res) => {
    try {
      const content = req.body?.content as string;
      const fileName = req.body?.fileName as string | undefined;
      if (!content) {
        return res.status(400).json({ error: 'content is required (bank statement text)' });
      }
      const result = parseBankStatement(content, fileName);
      return res.json(result);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Parse failed' });
    }
  });

  /**
   * POST /close/sessions/:sessionId/bank-transactions/ingest
   * Parse and persist bank transactions for a session + account.
   */
  router.post('/sessions/:sessionId/bank-transactions/ingest', async (req, res) => {
    try {
      const tenantId = (req as unknown as { tenantId: string }).tenantId;
      const { sessionId } = req.params;
      const { content, fileName, accountCode } = req.body;
      if (!content || !accountCode) {
        return res.status(400).json({ error: 'content and accountCode are required' });
      }

      const pool = await getPool(tenantId);
      const parseResult = parseBankStatement(content, fileName);
      if (!parseResult.success) {
        return res.status(400).json({ error: 'Parse failed', details: parseResult.errors });
      }

      const userId = (req as unknown as { userId?: string }).userId ?? 'api';
      const inputs = parseResult.transactions.map((txn) => ({
        tenantId,
        periodId: sessionId,
        accountCode,
        transactionDate: txn.transactionDate,
        postDate: txn.postDate,
        description: txn.description,
        reference: txn.reference,
        checkNumber: txn.checkNumber,
        amount: txn.amount,
        runningBalance: txn.runningBalance,
        transactionType: txn.transactionType,
        counterparty: txn.counterparty,
        source: parseResult.format === 'csv' ? 'csv_upload' : 'ofx_upload',
        sourceFileName: fileName ?? null,
        externalId: txn.externalId,
        createdBy: userId,
      }));

      const result = await bankRepo.insertBankTransactionsBatch(pool, inputs);
      return res.status(201).json({
        ...result,
        totalParsed: parseResult.transactions.length,
        format: parseResult.format,
        accountIdentifier: parseResult.accountIdentifier,
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Ingest failed' });
    }
  });

  /**
   * GET /close/sessions/:sessionId/bank-transactions
   * List bank transactions for a session, optionally filtered by account and match status.
   */
  router.get('/sessions/:sessionId/bank-transactions', async (req, res) => {
    try {
      const tenantId = (req as unknown as { tenantId: string }).tenantId;
      const { sessionId } = req.params;
      const accountCode = req.query.accountCode as string | undefined;
      const matchStatus = req.query.matchStatus as 'unmatched' | 'matched' | 'excluded' | undefined;
      const pool = await getPool(tenantId);
      const txns = await bankRepo.listBankTransactions(pool, tenantId, sessionId, accountCode, matchStatus);
      return res.json({ transactions: txns, total: txns.length });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'List failed' });
    }
  });

  /**
   * POST /close/sessions/:sessionId/bank-transactions/match
   * Run the matching engine for a given account. Returns proposed match groups.
   */
  router.post('/sessions/:sessionId/bank-transactions/match', async (req, res) => {
    try {
      const tenantId = (req as unknown as { tenantId: string }).tenantId;
      const { sessionId } = req.params;
      const { accountCode, reconId, config } = req.body;
      if (!accountCode) {
        return res.status(400).json({ error: 'accountCode is required' });
      }

      const pool = await getPool(tenantId);

      // Fetch bank transactions
      const bankTxns = await bankRepo.listBankTransactions(pool, tenantId, sessionId, accountCode);

      // Fetch GL transactions
      const glResult = await pool.query<{
        id: string; entry_date: string | Date; description: string; reference: string | null;
        debit: string; credit: string; net_amount: string; account_code: string; match_status: string;
      }>(
        `SELECT id, entry_date, description, reference, debit, credit, net_amount, account_code, match_status
         FROM tenant_gl_transactions WHERE tenant_id = $1 AND period_id = $2 AND account_code = $3`,
        [tenantId, sessionId, accountCode]
      );

      const glTxns: GLTransaction[] = glResult.rows.map((r) => ({
        id: r.id,
        entryDate: typeof r.entry_date === 'string' ? r.entry_date : (r.entry_date as Date).toISOString().slice(0, 10),
        description: r.description,
        reference: r.reference,
        debit: String(r.debit),
        credit: String(r.credit),
        netAmount: String(r.net_amount),
        accountCode: r.account_code,
        matchStatus: r.match_status,
      }));

      // Run matching engine
      const matchGroups = runMatchingEngine(bankTxns, glTxns, config);

      // Persist proposed matches
      const { persisted } = await persistMatchGroups(pool, tenantId, sessionId, reconId ?? null, matchGroups);

      return res.json({
        matchGroups,
        persisted,
        summary: {
          totalBankTransactions: bankTxns.length,
          totalGLTransactions: glTxns.length,
          matchesFound: matchGroups.length,
        },
      });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Match failed' });
    }
  });

  /**
   * POST /close/sessions/:sessionId/bank-transactions/match-groups/:groupId/confirm
   */
  router.post('/sessions/:sessionId/bank-transactions/match-groups/:groupId/confirm', async (req, res) => {
    try {
      const tenantId = (req as unknown as { tenantId: string }).tenantId;
      const userId = (req as unknown as { userId?: string }).userId ?? 'api';
      const pool = await getPool(tenantId);
      const confirmed = await confirmMatchGroup(pool, tenantId, req.params.groupId, userId);
      if (!confirmed) {
        return res.status(404).json({ error: 'Match group not found or not in proposed status' });
      }
      return res.json({ confirmed: true });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Confirm failed' });
    }
  });

  /**
   * POST /close/sessions/:sessionId/bank-transactions/match-groups/:groupId/reject
   */
  router.post('/sessions/:sessionId/bank-transactions/match-groups/:groupId/reject', async (req, res) => {
    try {
      const tenantId = (req as unknown as { tenantId: string }).tenantId;
      const userId = (req as unknown as { userId?: string }).userId ?? 'api';
      const reason = req.body?.reason ?? '';
      const pool = await getPool(tenantId);
      const rejected = await rejectMatchGroup(pool, tenantId, req.params.groupId, userId, reason);
      if (!rejected) {
        return res.status(404).json({ error: 'Match group not found or not in proposed status' });
      }
      return res.json({ rejected: true });
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Reject failed' });
    }
  });

  /**
   * GET /close/sessions/:sessionId/bank-transactions/summary
   * Get matching summary for a session + account.
   */
  router.get('/sessions/:sessionId/bank-transactions/summary', async (req, res) => {
    try {
      const tenantId = (req as unknown as { tenantId: string }).tenantId;
      const { sessionId } = req.params;
      const accountCode = req.query.accountCode as string;
      if (!accountCode) {
        return res.status(400).json({ error: 'accountCode query parameter is required' });
      }
      const pool = await getPool(tenantId);
      const summary = await getMatchingSummary(pool, tenantId, sessionId, accountCode);
      return res.json(summary);
    } catch (err) {
      return res.status(500).json({ error: err instanceof Error ? err.message : 'Summary failed' });
    }
  });

  return router;
}
