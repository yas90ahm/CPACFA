/**
 * Common Zod schemas used across multiple API routes.
 * Provides reusable validators for IDs, dates, amounts, and pagination.
 */

import { z } from 'zod';

// ============================================================================
// ID Patterns
// ============================================================================

export const tenantIdSchema = z.string().min(1, 'Tenant ID required');
export const entityIdSchema = z.string().min(1, 'Entity ID required');
export const periodLabelSchema = z.string().min(1, 'Period label required');
export const idSchema = z.string().min(1, 'ID required');

// ============================================================================
// Date Validators
// ============================================================================

export const isoDateSchema = z.string().refine(
  val => !isNaN(Date.parse(val)),
  'Invalid ISO date format'
);

export const optionalIsoDateSchema = z.string().refine(
  val => !isNaN(Date.parse(val)),
  'Invalid ISO date format'
).optional();

// ============================================================================
// Financial Amounts
// ============================================================================

export const amountSchema = z.number().finite('Amount must be a finite number');
export const positiveAmountSchema = z.number().positive('Amount must be positive').finite();
export const nonNegativeAmountSchema = z.number().nonnegative('Amount must be non-negative').finite();
export const percentageSchema = z.number().min(0, 'Percentage must be >= 0').max(1, 'Percentage must be <= 1');

// ============================================================================
// Pagination
// ============================================================================

export const paginationSchema = z.object({
  limit: z.coerce.number().int().positive().max(1000).optional(),
  offset: z.coerce.number().int().nonnegative().optional(),
});

// ============================================================================
// Path Parameters
// ============================================================================

export const idParamSchema = z.object({
  id: z.string().min(1, 'ID parameter required'),
});

// ============================================================================
// Common Enums
// ============================================================================

export const statusSchema = z.enum(['active', 'inactive', 'pending', 'completed']);
