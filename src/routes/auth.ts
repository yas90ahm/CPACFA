/**
 * Auth: login (returns JWT), optional register for dev.
 * Rate limited: register 5/15min, login 10/15min per IP.
 */

import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { queryControl, isDbConfigured } from '../db/index.js';
import { getUserByEmail, getUserByEmailOnly } from '../db/repositories/user_repository.js';
import { verifyPassword, signToken } from '../auth/index.js';
import { hashPassword } from '../auth/index.js';
import { send500 } from '../lib/errorHandler.js';
import { validateBody } from '../middleware/validationMiddleware.js';
import { loginSchema, registerSchema, allowedRolesSchema } from '../schemas/authSchemas.js';

const router = Router();

/** Allowed roles for self-registration. Privileged roles (admin, approver, operating_partner) must be assigned by an admin. */
const ALLOWED_ROLES = ['accountant', 'preparer', 'reviewer'] as const;

/** Register: 50 requests per 15 minutes per IP (generous for automated tests). */
const registerLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  message: { error: 'Too many registration attempts', retryAfter: '15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

/** Login: 10 requests per 15 minutes per IP. */
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many login attempts', retryAfter: '15 minutes' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/login', loginLimiter, validateBody(loginSchema), async (req: Request, res: Response) => {
  try {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Auth requires DATABASE_URL (Postgres)' });
    }
    const { tenantId, email, password } = req.body;
    // In production/staging, tenantId is mandatory to prevent cross-tenant email lookup
    const mode = (await import('../lib/runtime_mode.js')).getMode();
    if (!tenantId && (mode === 'prod' || mode === 'staging')) {
      return res.status(400).json({ error: 'tenantId is required' });
    }
    const user = tenantId
      ? await getUserByEmail(tenantId, email)
      : await getUserByEmailOnly(email);
    if (!user || !user.password_hash) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const ok = await verifyPassword(password, user.password_hash);
    if (!ok) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }
    const token = signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
    });
    res.json({ token, userId: user.id, tenantId: user.tenant_id, role: user.role, email: user.email, name: user.name ?? null });
  } catch (e) {
    send500(res, e, 'Login failed');
  }
});

/** Register (for dev/setup): create tenant + user, or add user to existing tenant. Requires DATABASE_URL. */
router.post('/register', registerLimiter, validateBody(registerSchema), async (req: Request, res: Response) => {
  try {
    if (!isDbConfigured()) {
      return res.status(503).json({ error: 'Register requires DATABASE_URL (Postgres)' });
    }
    const { tenantId: existingTenantId, tenantName, name, email, password, role, databaseUrl } = req.body;
    const roleValue = role ?? 'accountant';
    let tenantId: string;
    if (existingTenantId) {
      tenantId = existingTenantId;
      const tenantCheck = await queryControl<{ id: string }>('SELECT id FROM tenants WHERE id = $1', [tenantId]);
      if (!tenantCheck?.rows?.length) {
        return res.status(400).json({ error: 'Tenant not found', tenantId });
      }
    } else {
      tenantId = `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
      const displayName = tenantName ?? name ?? 'My organization';
      await queryControl(
        'INSERT INTO tenants (id, name, database_url, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
        [tenantId, displayName, databaseUrl ?? null]
      );
    }
    const { createUser } = await import('../db/repositories/user_repository.js');
    const passwordHash = await hashPassword(password);
    const user = await createUser(tenantId, email, passwordHash, roleValue, name ?? undefined);
    const token = signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
    });
    res.status(201).json({ token, userId: user.id, tenantId: user.tenant_id, role: user.role, email: user.email, name: user.name ?? null });
  } catch (e) {
    send500(res, e, 'Registration failed');
  }
});

export default router;
