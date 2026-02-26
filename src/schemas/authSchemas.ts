/**
 * Zod schemas for auth API routes.
 */

import { z } from 'zod';

// ============================================================================
// Login
// ============================================================================

export const loginSchema = z.object({
  tenantId: z.string().min(1).optional(),
  email: z.string().email('Invalid email format'),
  password: z.string().min(1, 'Password required'),
});

// ============================================================================
// Register
// ============================================================================

export const allowedRolesSchema = z.enum(['accountant', 'preparer', 'reviewer', 'approver', 'admin', 'operating_partner']);

const passwordComplexity = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(
    (s) => /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s) && /[!@#$%^&*(),.?":{}|<>\-_=[\]\\;'+/]/.test(s),
    'Password must include uppercase, lowercase, number, and special character'
  );

export const registerSchema = z.object({
  tenantId: z.string().min(1).optional(),
  tenantName: z.string().min(1, 'Tenant name required').optional(),
  name: z.string().optional(),
  email: z.string().email('Invalid email format'),
  password: passwordComplexity,
  role: allowedRolesSchema.optional(),
  databaseUrl: z.string().url().optional(),
});
