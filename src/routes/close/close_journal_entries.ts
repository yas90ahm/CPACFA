/**
 * Journal Entry lifecycle: draft → proposed → approved/posted/exported/rejected.
 * Mounted at /api/close (paths: /journal-entries, /journal-entries/:id, etc.).
 * Attachments: multipart file upload stored via storage adapter (file_ref); or body.fileRef for existing ref.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { randomUUID } from 'crypto';
import { getTenantId, getTenantPool } from '../../lib/tenant_context.js';
import { send500 } from '../../lib/errorHandler.js';
import { getStorage } from '../../storage/index.js';
import {
  rejectJE,
  exportJE,
  getJournalEntry,
  getJournalEntryWithLines,
  listJournalEntries,
  listPostableJournalEntries,
  validateBalanced,
  validatePeriod,
  validateMaterialityWarnings,
  addJEAttachment,
  JournalEntryError,
} from '../../services/journal_entry_service.js';
import * as jeRepo from '../../db/repositories/journal_entry_repository.js';
import type { JournalEntrySource } from '../../types/journal_entry.js';
import { executeBridgeCommand } from '../../bridge/index.js';
import type { AuthRequest } from '../../auth/middleware.js';

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } }); // 20 MB

/** POST /api/close/journal-entries — create draft JE (via bridge) */
router.post('/journal-entries', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as {
      closeSessionId: string;
      memo?: string;
      source: JournalEntrySource;
      createdBy?: string;
      lines: { accountRef: string; debit?: number; credit?: number; description?: string }[];
    };
    if (!body?.closeSessionId || !body?.source || !Array.isArray(body?.lines)) {
      res.status(400).json({ error: 'closeSessionId, source, and lines (array) required' });
      return;
    }
    const result = await executeBridgeCommand(
      {
        pool,
        tenantId,
        actor: (req as AuthRequest).userId ?? 'anonymous',
      },
      {
        commandType: 'CreateDraftJE',
        closeSessionId: body.closeSessionId,
        memo: body.memo,
        source: body.source,
        createdBy: body.createdBy ?? (req as AuthRequest).userId,
        lines: body.lines,
      }
    );
    if (!result.ok) {
      const status =
        result.code === 'PERIOD_LOCKED' ? 409 : result.code === 'VALIDATION' ? 422 : 400;
      res.status(status).json({ error: result.error, code: result.code });
      return;
    }
    if (result.commandType !== 'CreateDraftJE') throw new Error('Unexpected result');
    const je = await getJournalEntry(pool, tenantId, result.journalEntry.id);
    if (!je) {
      res.status(500).json({ error: 'Journal entry not found after create' });
      return;
    }
    res.status(201).json(je);
  } catch (e) {
    if (e instanceof JournalEntryError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Create draft JE failed');
  }
});

/** GET /api/close/journal-entries — list JEs (query: closeSessionId?, status?, limit?) */
router.get('/journal-entries', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const closeSessionId = req.query.closeSessionId as string | undefined;
    const status = req.query.status as 'draft' | 'proposed' | 'approved' | 'posted' | 'exported' | 'rejected' | undefined;
    const limit = req.query.limit != null ? Number(req.query.limit) : undefined;
    const list = await listJournalEntries(pool, tenantId, {
      closeSessionId,
      status,
      limit: Number.isNaN(limit) ? undefined : limit,
    });
    res.json({ journalEntries: list });
  } catch (e) {
    send500(res, e, 'List journal entries failed');
  }
});

/** GET /api/close/journal-entries/postable — list approved/posted/exported JEs (for statement builder) */
router.get('/journal-entries/postable', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const closeSessionId = req.query.closeSessionId as string | undefined;
    const list = await listPostableJournalEntries(pool, tenantId, closeSessionId);
    res.json({ journalEntries: list });
  } catch (e) {
    send500(res, e, 'List postable journal entries failed');
  }
});

/** GET /api/close/journal-entries/:id */
router.get('/journal-entries/:id', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const withLines = req.query.withLines === 'true';
    if (withLines) {
      const result = await getJournalEntryWithLines(pool, tenantId, id);
      if (!result) {
        res.status(404).json({ error: 'Journal entry not found' });
        return;
      }
      res.json(result);
      return;
    }
    const je = await getJournalEntry(pool, tenantId, id);
    if (!je) {
      res.status(404).json({ error: 'Journal entry not found' });
      return;
    }
    res.json(je);
  } catch (e) {
    send500(res, e, 'Get journal entry failed');
  }
});

/** POST /api/close/journal-entries/:id/propose (via bridge) */
router.post('/journal-entries/:id/propose', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const result = await executeBridgeCommand(
      { pool, tenantId, actor: (req as AuthRequest).userId ?? 'anonymous' },
      { commandType: 'ProposeJE', journalEntryId: id }
    );
    if (!result.ok) {
      const status = result.code === 'PERIOD_LOCKED' ? 409 : 400;
      res.status(status).json({ error: result.error, code: result.code });
      return;
    }
    if (result.commandType !== 'ProposeJE') throw new Error('Unexpected result');
    const je = await getJournalEntry(pool, tenantId, result.journalEntry.id);
    if (!je) {
      res.status(404).json({ error: 'Journal entry not found' });
      return;
    }
    res.json(je);
  } catch (e) {
    if (e instanceof JournalEntryError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Propose JE failed');
  }
});

/** POST /api/close/journal-entries/:id/approve (via bridge) */
router.post('/journal-entries/:id/approve', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as { approvedBy: string };
    if (!body?.approvedBy) {
      res.status(400).json({ error: 'approvedBy required' });
      return;
    }
    const result = await executeBridgeCommand(
      { pool, tenantId, actor: (req as AuthRequest).userId ?? 'anonymous' },
      { commandType: 'ApproveJE', journalEntryId: id, approvedBy: body.approvedBy }
    );
    if (!result.ok) {
      const status = result.code === 'VALIDATION' ? 403 : 400;
      res.status(status).json({ error: result.error, code: result.code });
      return;
    }
    if (result.commandType !== 'ApproveJE') throw new Error('Unexpected result');
    const je = await getJournalEntry(pool, tenantId, result.journalEntry.id);
    if (!je) {
      res.status(404).json({ error: 'Journal entry not found' });
      return;
    }
    res.json(je);
  } catch (e) {
    if (e instanceof JournalEntryError) {
      const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'SEGREGATION' ? 403 : 400;
      res.status(status).json({ error: e.message });
      return;
    }
    send500(res, e, 'Approve JE failed');
  }
});

/** POST /api/close/journal-entries/:id/reject */
router.post('/journal-entries/:id/reject', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const je = await rejectJE(pool, tenantId, id);
    res.json(je);
  } catch (e) {
    if (e instanceof JournalEntryError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Reject JE failed');
  }
});

/** POST /api/close/journal-entries/:id/post (via bridge). All error responses include { error, code }. */
router.post('/journal-entries/:id/post', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required', code: 'VALIDATION' });
      return;
    }
    const id = req.params.id ?? '';
    const result = await executeBridgeCommand(
      { pool, tenantId, actor: (req as AuthRequest).userId ?? 'anonymous' },
      { commandType: 'PostJE', journalEntryId: id }
    );
    if (!result.ok) {
      const status = result.code === 'PERIOD_LOCKED' ? 409 : result.code === 'SHADOW_AUDIT_BLOCK' ? 403 : 400;
      res.status(status).json({ error: result.error, code: result.code ?? 'SERVICE' });
      return;
    }
    if (result.commandType !== 'PostJE') throw new Error('Unexpected result');
    const je = await getJournalEntry(pool, tenantId, result.journalEntry.id);
    if (!je) {
      res.status(404).json({ error: 'Journal entry not found', code: 'NOT_FOUND' });
      return;
    }
    res.json({
      ...je,
      ...(result.aiWarnings?.length && { ai_warnings: result.aiWarnings }),
    });
  } catch (e) {
    if (e instanceof JournalEntryError) {
      const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'SHADOW_AUDIT_BLOCK' ? 403 : 400;
      res.status(status).json({ error: e.message, code: e.code });
      return;
    }
    const { log } = await import('../../lib/logger.js');
    const message = e instanceof Error ? e.message : String(e);
    const stack = e instanceof Error ? e.stack : undefined;
    log('error', 'Post JE failed', { message, stack });
    res.status(500).json({ error: 'Post JE failed', code: 'SERVICE' });
  }
});

/** POST /api/close/journal-entries/:id/export */
router.post('/journal-entries/:id/export', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const je = await exportJE(pool, tenantId, id);
    res.json(je);
  } catch (e) {
    if (e instanceof JournalEntryError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Export JE failed');
  }
});

/** POST /api/close/journal-entries/validate-balanced — validate lines balance (body: lines[]) */
router.post('/journal-entries/validate-balanced', async (req: Request, res: Response) => {
  try {
    const body = req.body as { lines: { accountRef: string; debit?: number; credit?: number }[] };
    if (!Array.isArray(body?.lines)) {
      res.status(400).json({ error: 'lines (array) required' });
      return;
    }
    const result = validateBalanced(body.lines);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Validate balanced failed');
  }
});

/** POST /api/close/journal-entries/validate-period — validate close session exists (body: closeSessionId) */
router.post('/journal-entries/validate-period', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as { closeSessionId: string };
    if (!body?.closeSessionId) {
      res.status(400).json({ error: 'closeSessionId required' });
      return;
    }
    const result = await validatePeriod(pool, tenantId, body.closeSessionId);
    res.json(result);
  } catch (e) {
    send500(res, e, 'Validate period failed');
  }
});

/** POST /api/close/journal-entries/validate-materiality — body: closeSessionId, lines[], materialityThreshold? */
router.post('/journal-entries/validate-materiality', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const body = req.body as {
      closeSessionId: string;
      lines: { debit?: number; credit?: number }[];
      materialityThreshold?: number;
    };
    if (!body?.closeSessionId || !Array.isArray(body?.lines)) {
      res.status(400).json({ error: 'closeSessionId and lines (array) required' });
      return;
    }
    const result = await validateMaterialityWarnings(
      pool,
      tenantId,
      body.closeSessionId,
      body.lines,
      body.materialityThreshold
    );
    res.json(result);
  } catch (e) {
    send500(res, e, 'Validate materiality failed');
  }
});

/** POST /api/close/journal-entries/:id/attachments — add attachment (multipart file or body.fileRef) */
router.post('/journal-entries/:id/attachments', upload.single('file'), async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    let fileRef: string;
    const file = (req as Request & { file?: { buffer: Buffer; originalname?: string; mimetype?: string } }).file;
    if (file?.buffer) {
      const ext = (file.originalname && /\.\w+$/.test(file.originalname))
        ? file.originalname.replace(/^.*\./, '')
        : 'bin';
      const key = `${tenantId}/attachments/je/${id}/${randomUUID()}.${ext}`;
      await getStorage().putObject(key, file.buffer, { contentType: file.mimetype });
      fileRef = key;
    } else {
      const body = req.body as { fileRef?: string };
      if (!body?.fileRef) {
        res.status(400).json({ error: 'file (multipart) or fileRef required' });
        return;
      }
      fileRef = body.fileRef;
    }
    const attachment = await addJEAttachment(pool, tenantId, id, fileRef);
    res.status(201).json(attachment);
  } catch (e) {
    if (e instanceof JournalEntryError) {
      res.status(e.code === 'NOT_FOUND' ? 404 : 400).json({ error: e.message });
      return;
    }
    send500(res, e, 'Add JE attachment failed');
  }
});

/** GET /api/close/journal-entries/:jeId/attachments/:attachmentId/download — stream attachment from storage (file_ref) */
router.get('/journal-entries/:jeId/attachments/:attachmentId/download', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const jeId = req.params.jeId ?? '';
    const attachmentId = req.params.attachmentId ?? '';
    const attachment = await jeRepo.getJEAttachmentById(pool, attachmentId);
    if (!attachment || attachment.jeId !== jeId) {
      res.status(404).json({ error: 'Attachment not found' });
      return;
    }
    const je = await jeRepo.getJournalEntryById(pool, jeId, tenantId);
    if (!je) {
      res.status(404).json({ error: 'Journal entry not found' });
      return;
    }
    if (!attachment.fileRef.startsWith(tenantId + '/')) {
      res.status(403).json({ error: 'Forbidden' });
      return;
    }
    const buf = await getStorage().getObject(attachment.fileRef);
    if (!buf) {
      res.status(404).json({ error: 'File not found in storage' });
      return;
    }
    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${attachmentId}"`);
    res.send(buf);
  } catch (e) {
    send500(res, e, 'Download JE attachment failed');
  }
});

export default router;
