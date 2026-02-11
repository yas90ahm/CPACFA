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
import {
  attachEvidenceToJournalEntry,
  attachEvidenceWithFile,
  EvidenceAttachmentError,
} from '../../services/evidence_attachment_service.js';
import * as jeRepo from '../../db/repositories/journal_entry_repository.js';
import * as evidenceRepo from '../../db/repositories/evidence_repository.js';
import { getEvidenceStorageAdapterAsync } from '../../services/evidence_storage_service.js';
import type { JournalEntrySource } from '../../types/journal_entry.js';
import { executeBridgeCommand } from '../../bridge/index.js';
import type { AuthRequest } from '../../auth/middleware.js';

const router = Router();

/** Allowed MIME types for JE attachments (configurable via env; default whitelist). */
const ATTACHMENT_ALLOWED_MIMES = (
  process.env.SECURITY_ATTACHMENT_MIME_WHITELIST?.toLowerCase().split(',').map((s) => s.trim()).filter(Boolean)
) ?? [
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'text/csv',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
];

/** Max file size for JE attachments (20 MB). Configurable via EVIDENCE_ATTACHMENT_MAX_BYTES. */
const ATTACHMENT_MAX_BYTES =
  Number(process.env.EVIDENCE_ATTACHMENT_MAX_BYTES) || 20 * 1024 * 1024;

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: ATTACHMENT_MAX_BYTES },
  fileFilter: (_req, file, cb) => {
    const mime = (file.mimetype ?? '').toLowerCase();
    const ext = (file.originalname ?? '').toLowerCase().split('.').pop();
    const allowedExts = ['pdf', 'png', 'jpg', 'jpeg', 'csv', 'xlsx'];
    const mimeOk = ATTACHMENT_ALLOWED_MIMES.includes(mime);
    const extOk = ext && allowedExts.includes(ext);
    if (mimeOk && extOk) cb(null, true);
    else cb(new Error('Allowed attachment types: pdf, png, jpg, jpeg, csv, xlsx only.'));
  },
});

/** Reject oversized requests before body is read (Content-Length check). */
function contentLengthLimit(maxBytes: number) {
  return (req: Request, res: Response, next: import('express').NextFunction): void => {
    const cl = req.headers['content-length'];
    if (cl) {
      const len = parseInt(cl, 10);
      if (!Number.isNaN(len) && len > maxBytes) {
        res.status(413).json({
          error: 'File too large',
          message: `File too large, maximum ${Math.round(maxBytes / (1024 * 1024))}MB.`,
        });
        req.resume();
        return;
      }
    }
    next();
  };
}

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
      send500(res, new Error('Journal entry not found after create'), 'Journal entry not found after create');
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
      res.status(status).json({ error: e.message, code: e.code });
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
    send500(res, new Error('Post JE failed'), 'Post JE failed');
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

/** POST /api/close/journal-entries/:id/evidence/upload — attach evidence with file upload (multipart) */
router.post(
  '/journal-entries/:id/evidence/upload',
  contentLengthLimit(ATTACHMENT_MAX_BYTES),
  (req: Request, res: Response, next: import('express').NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const code = (err as { code?: string })?.code;
        const message = err instanceof Error ? err.message : String(err);
        if (code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: 'File too large',
            message: `File too large, maximum ${Math.round(ATTACHMENT_MAX_BYTES / (1024 * 1024))}MB.`,
          });
          return;
        }
        if (message.includes('Allowed attachment types')) {
          res.status(400).json({ error: message });
          return;
        }
        next(err);
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
    try {
      const pool = getTenantPool(req);
      const tenantId = getTenantId(req);
      if (!pool || !tenantId) {
        res.status(400).json({ error: 'Tenant context required' });
        return;
      }
      const id = req.params.id ?? '';
      const file = (req as Request & { file?: { buffer: Buffer; originalname?: string; mimetype?: string } }).file;
      if (!file?.buffer) {
        res.status(400).json({ error: 'file (multipart) required' });
        return;
      }
      const body = req.body as { assertionType?: string; role?: string; requiredness?: 'optional' | 'required'; label?: string };
      const validAssertionTypes = ['invoice_support', 'bank_support', 'reconciliation', 'approval', 'contract_support', 'calc_support', 'other'];
      const assertionType = body?.assertionType ?? 'other';
      if (!validAssertionTypes.includes(assertionType)) {
        res.status(400).json({ error: 'assertionType must be one of: ' + validAssertionTypes.join(', ') });
        return;
      }
      const attachedBy = (req as AuthRequest).userId ?? 'anonymous';
      const result = await attachEvidenceWithFile(pool, tenantId, id, {
        buffer: file.buffer,
        mimeType: file.mimetype,
        originalFilename: file.originalname,
        assertionType: assertionType as import('../../types/evidence.js').AssertionType,
        role: body?.role ?? 'support',
        requiredness: body?.requiredness ?? 'optional',
        attachedBy,
      });
      res.status(201).json(result);
    } catch (e) {
      if (e instanceof EvidenceAttachmentError) {
        const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'PERIOD_LOCKED' ? 409 : 400;
        res.status(status).json({ error: e.message, code: e.code });
        return;
      }
      send500(res, e, 'Evidence upload failed');
    }
  }
);

/** POST /api/close/journal-entries/:id/evidence — attach evidence (proof + reference metadata only; no file storage) */
router.post('/journal-entries/:id/evidence', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const id = req.params.id ?? '';
    const body = req.body as {
      hashSha256?: string;
      sizeBytes?: number;
      assertionType?: string;
      mimeType?: string;
      externalUri?: string;
      externalProvider?: string;
      label?: string;
      role?: string;
      requiredness?: 'optional' | 'required';
      attachedBy?: string;
      claimedAmount?: string;
      claimedCurrency?: string;
      claimedPeriod?: string;
      note?: string;
    };
    if (!body?.hashSha256 || body?.sizeBytes == null) {
      res.status(400).json({ error: 'hashSha256 and sizeBytes required' });
      return;
    }
    const validAssertionTypes = ['invoice_support', 'bank_support', 'reconciliation', 'approval', 'contract_support', 'calc_support', 'other'];
    if (!body?.assertionType || !validAssertionTypes.includes(body.assertionType)) {
      res.status(400).json({ error: 'assertionType required; must be one of: ' + validAssertionTypes.join(', ') });
      return;
    }
    const attachedBy = body.attachedBy ?? (req as AuthRequest).userId ?? 'anonymous';
    const result = await attachEvidenceToJournalEntry(pool, tenantId, id, {
      hashSha256: body.hashSha256,
      sizeBytes: Number(body.sizeBytes),
      assertionType: body.assertionType as import('../../types/evidence.js').AssertionType,
      mimeType: body.mimeType,
      externalUri: body.externalUri,
      externalProvider: body.externalProvider,
      label: body.label,
      role: body.role ?? 'support',
      requiredness: body.requiredness ?? 'optional',
      attachedBy,
      claimedAmount: body.claimedAmount,
      claimedCurrency: body.claimedCurrency,
      claimedPeriod: body.claimedPeriod,
      note: body.note,
    });
    res.status(201).json(result);
  } catch (e) {
    if (e instanceof EvidenceAttachmentError) {
      const status = e.code === 'NOT_FOUND' ? 404 : e.code === 'PERIOD_LOCKED' ? 409 : 400;
      res.status(status).json({ error: e.message, code: e.code });
      return;
    }
    send500(res, e, 'Attach evidence failed');
  }
});

/** POST /api/close/journal-entries/:id/attachments — add attachment (multipart file or body.fileRef) */
router.post(
  '/journal-entries/:id/attachments',
  contentLengthLimit(ATTACHMENT_MAX_BYTES),
  (req: Request, res: Response, next: import('express').NextFunction) => {
    upload.single('file')(req, res, (err: unknown) => {
      if (err) {
        const code = (err as { code?: string })?.code;
        const message = err instanceof Error ? err.message : String(err);
        if (code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: 'File too large',
            message: `File too large, maximum ${Math.round(ATTACHMENT_MAX_BYTES / (1024 * 1024))}MB.`,
          });
          return;
        }
        if (message.includes('Allowed attachment types')) {
          res.status(400).json({ error: message });
          return;
        }
        next(err);
        return;
      }
      next();
    });
  },
  async (req: Request, res: Response) => {
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
  }
);

/** GET /api/close/journal-entries/:jeId/evidence/:evidenceId/download — stream evidence file from storage */
router.get('/journal-entries/:jeId/evidence/:evidenceId/download', async (req: Request, res: Response) => {
  try {
    const pool = getTenantPool(req);
    const tenantId = getTenantId(req);
    if (!pool || !tenantId) {
      res.status(400).json({ error: 'Tenant context required' });
      return;
    }
    const jeId = req.params.jeId ?? '';
    const evidenceId = req.params.evidenceId ?? '';
    const evidence = await evidenceRepo.getEvidenceById(pool, tenantId, evidenceId);
    if (!evidence) {
      res.status(404).json({ error: 'Evidence not found' });
      return;
    }
    const linked = await evidenceRepo.isEvidenceLinkedToJournalEntry(pool, tenantId, evidenceId, jeId);
    if (!linked) {
      res.status(404).json({ error: 'Evidence not found for this journal entry' });
      return;
    }
    if (!evidence.storagePath) {
      res.status(404).json({ error: 'Evidence file not stored (metadata-only)' });
      return;
    }
    const adapter = await getEvidenceStorageAdapterAsync();
    const result = await adapter.retrieve(tenantId, evidenceId);
    if (!result) {
      res.status(404).json({ error: 'Evidence file not found in storage' });
      return;
    }
    const contentType = result.metadata.mimeType ?? 'application/octet-stream';
    const filename = evidence.originalFilename ?? result.metadata.originalFilename ?? `evidence-${evidenceId}`;
    const safeFilename = filename.replace(/[^\w.-]/g, '_');
    res.setHeader('Content-Type', contentType);
    res.setHeader('Content-Disposition', `attachment; filename="${safeFilename}"`);
    res.send(result.buffer);
  } catch (e) {
    send500(res, e, 'Download evidence failed');
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
    const attachment = await jeRepo.getJEAttachmentById(pool, tenantId, attachmentId);
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
