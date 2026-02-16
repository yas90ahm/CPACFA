/**
 * Chart of Accounts API — upload CSV, list accounts, get by code.
 */

import { Router, type Request, type Response } from 'express';
import multer from 'multer';
import { uploadCoaForTenant } from '../services/coa_upload_service.js';
import * as coaRepository from '../db/repositories/coa_repository.js';
import { getTenantId, getTenantPool } from '../lib/tenant_context.js';
import { requireValidTenantId } from '../middleware/validationMiddleware.js';
import { send500 } from '../lib/errorHandler.js';
import type { AuthRequest } from '../auth/middleware.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 2 * 1024 * 1024 }, // 2 MB
  fileFilter: (_req, file, cb) => {
    const mime = file.mimetype?.toLowerCase() ?? '';
    if (mime === 'text/csv') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed for COA upload.'));
    }
  },
});

/**
 * POST /api/coa/upload
 * Upload Chart of Accounts (CSV).
 * Body: multipart/form-data with 'file' field.
 * Returns: { success, accountCount, errors? }
 */
router.post(
  '/upload',
  upload.single('file'),
  requireValidTenantId,
  async (req: Request, res: Response) => {
    try {
      const file = req.file;
      if (!file) {
        res.status(400).json({
          error: 'No file uploaded',
          message: 'Upload a CSV file with field name "file".',
        });
        return;
      }

      const tenantId = getTenantId(req);
      const pool = getTenantPool(req);
      if (!tenantId || !pool) {
        res.status(503).json({
          error: 'Tenant context required',
          message: 'Authenticate with a valid token so the tenant database is attached.',
        });
        return;
      }

      const authReq = req as AuthRequest;
      const uploadedBy = authReq.userId ?? authReq.tenantId ?? undefined;

      const result = await uploadCoaForTenant(pool, tenantId, file.buffer, uploadedBy);

      if (!result.success) {
        res.status(400).json(result);
        return;
      }

      res.status(200).json(result);
    } catch (err) {
      if (err instanceof multer.MulterError) {
        if (err.code === 'LIMIT_FILE_SIZE') {
          res.status(413).json({
            error: 'File too large',
            message: 'COA CSV must be under 2 MB.',
          });
          return;
        }
      }
      console.error('COA upload error:', err);
      send500(res, err instanceof Error ? err : new Error('COA upload failed'), 'COA upload failed');
    }
  }
);

/**
 * GET /api/coa
 * Get all active accounts for tenant.
 */
router.get('/', requireValidTenantId, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(503).json({
        error: 'Tenant context required',
        message: 'Authenticate with a valid token so the tenant database is attached.',
      });
      return;
    }

    const accounts = await coaRepository.getAccountsByTenant(pool, tenantId);
    res.status(200).json({ accounts });
  } catch (err) {
    console.error('COA fetch error:', err);
    send500(res, err instanceof Error ? err : new Error('Failed to fetch COA'), 'Failed to fetch COA');
  }
});

/**
 * GET /api/coa/:accountCode
 * Get specific account by code.
 */
router.get('/:accountCode', requireValidTenantId, async (req: Request, res: Response) => {
  try {
    const tenantId = getTenantId(req);
    const pool = getTenantPool(req);
    if (!tenantId || !pool) {
      res.status(503).json({
        error: 'Tenant context required',
        message: 'Authenticate with a valid token so the tenant database is attached.',
      });
      return;
    }

    const accountCode = req.params.accountCode;
    const account = await coaRepository.getAccountByCode(pool, tenantId, accountCode);

    if (!account) {
      res.status(404).json({ error: 'Account not found', accountCode });
      return;
    }

    res.status(200).json({ account });
  } catch (err) {
    console.error('COA fetch error:', err);
    send500(res, err instanceof Error ? err : new Error('Failed to fetch account'), 'Failed to fetch account');
  }
});

export default router;
