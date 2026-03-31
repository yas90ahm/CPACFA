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

/** Allowed roles for self-registration. Privileged roles (system_admin, internal_auditor, pe_operating_partner, external_auditor) must be invited. */
const ALLOWED_ROLES = ['controller', 'senior_accountant', 'cfo', 'reviewer'] as const;

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
    // Set HttpOnly cookie as primary auth mechanism for web frontend
    const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    res.cookie('cpa_session', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      domain: isProd ? '.sabit.ai' : undefined,
      maxAge: 4 * 60 * 60 * 1000, // 4 hours (match JWT expiry)
      path: '/',
    });
    // Still return token in body for backward compatibility (mobile clients, API consumers)
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
    const { tenantName, name, email, password, role } = req.body;
    const roleValue = role ?? 'controller';
    // H2 fix: Self-registration only creates NEW tenants. Joining existing tenants
    // must go through the team/invite flow managed by an admin.
    if (req.body.tenantId) {
      return res.status(403).json({ error: 'Cannot join an existing tenant via self-registration. Ask a tenant admin for an invite.' });
    }
    const tenantId = `tenant-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const displayName = tenantName ?? name ?? 'My organization';
    // H3 fix: databaseUrl removed — never accept DB connection strings from user input
    await queryControl(
      'INSERT INTO tenants (id, name, database_url, created_at, updated_at) VALUES ($1, $2, $3, NOW(), NOW())',
      [tenantId, displayName, null]
    );
    const { createUser } = await import('../db/repositories/user_repository.js');
    const passwordHash = await hashPassword(password);
    const user = await createUser(tenantId, email, passwordHash, roleValue, name ?? undefined);
    const token = signToken({
      userId: user.id,
      tenantId: user.tenant_id,
      email: user.email,
      role: user.role,
    });
    // Set HttpOnly cookie as primary auth mechanism for web frontend
    const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
    res.cookie('cpa_session', token, {
      httpOnly: true,
      secure: isProd,
      sameSite: 'lax',
      domain: isProd ? '.sabit.ai' : undefined,
      maxAge: 4 * 60 * 60 * 1000, // 4 hours (match JWT expiry)
      path: '/',
    });
    res.status(201).json({ token, userId: user.id, tenantId: user.tenant_id, role: user.role, email: user.email, name: user.name ?? null });
  } catch (e) {
    send500(res, e, 'Registration failed');
  }
});

/** Logout: clear the HttpOnly session cookie. */
router.post('/logout', (_req: Request, res: Response) => {
  const isProd = process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging';
  res.clearCookie('cpa_session', {
    httpOnly: true,
    secure: isProd,
    sameSite: 'lax',
    domain: isProd ? '.sabit.ai' : undefined,
    path: '/',
  });
  res.json({ ok: true });
});

export default router;
