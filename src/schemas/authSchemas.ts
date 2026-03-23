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

/** Roles allowed for self-registration. Admin/approver must be assigned by an existing admin. */
export const allowedRolesSchema = z.enum(['accountant', 'preparer', 'reviewer']);

const passwordComplexity = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .refine(
    (s) => /[A-Z]/.test(s) && /[a-z]/.test(s) && /\d/.test(s) && /[!@#$%^&*(),.?":{}|<>\-_=[\]\\;'+/]/.test(s),
    'Password must include uppercase, lowercase, number, and special character'
  );

export const registerSchema = z.object({
  tenantId: z.string().min(1).optional(),  // accepted but rejected at route level (H2)
  tenantName: z.string().min(1, 'Tenant name required').optional(),
  name: z.string().optional(),
  email: z.string().email('Invalid email format'),
  password: passwordComplexity,
  role: allowedRolesSchema.optional(),
  // H3 fix: databaseUrl removed — must never be user-supplied
});
