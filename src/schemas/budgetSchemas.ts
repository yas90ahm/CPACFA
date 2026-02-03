/**
 * Zod schemas for budget API routes (versioning, driver-based planning, reforecast).
 */

import { z } from 'zod';
import { idParamSchema } from './commonSchemas.js';

// ============================================================================
// Budget version line
// ============================================================================

const budgetVersionLineSchema = z.object({
  label: z.string().min(1, 'Line label required'),
  amount: z.number().finite('Amount must be a finite number'),
  category: z.enum(['Revenue', 'COGS', 'OpEx', 'Other']).optional(),
  driverRef: z.string().optional(),
});

// ============================================================================
// POST /version — Create budget version
// ============================================================================

export const createBudgetVersionSchema = z.object({
  name: z.string().min(1, 'Name required'),
  periodLabel: z.string().min(1, 'Period label required'),
  lines: z.array(budgetVersionLineSchema).min(1, 'At least one line required'),
});

// ============================================================================
// PATCH /version/:id — Update budget version (draft only)
// ============================================================================

export const updateBudgetVersionSchema = z.object({
  name: z.string().min(1).optional(),
  lines: z.array(budgetVersionLineSchema).optional(),
});

// ============================================================================
// POST /version/:id/lock — Lock budget version
// ============================================================================

export const lockBudgetVersionSchema = z.object({
  lockedBy: z.string().min(1, 'lockedBy required'),
});

// ============================================================================
// POST /driver-based — Driver-based plan
// ============================================================================

const driverInputSchema = z.object({
  id: z.string().min(1, 'Driver id required'),
  name: z.string().min(1, 'Driver name required'),
  value: z.number().finite('Driver value required'),
  unit: z.string().optional(),
});

export const driverBasedPlanSchema = z.object({
  drivers: z.array(driverInputSchema).min(1, 'At least one driver required'),
  formulas: z.record(z.string()).refine((o) => typeof o === 'object' && o !== null, 'Formulas must be an object'),
  periodLabel: z.string().optional(),
});

// ============================================================================
// POST /reforecast — Agentic reforecast
// ============================================================================

const actualSnapshotSchema = z.object({
  revenue: z.number().finite(),
  costOfGoodsSold: z.number().finite().optional(),
  operatingExpenses: z.number().finite().optional(),
  netIncome: z.number().finite(),
  cash: z.number().finite(),
});

export const reforecastSchema = z.object({
  actualSnapshot: actualSnapshotSchema,
  periodLabel: z.string().min(1, 'Period label required'),
  priorBudgetVersionId: z.string().optional(),
  priorBudgetLines: z.array(z.object({
    label: z.string(),
    amount: z.number().finite(),
    category: z.string().optional(),
  })).optional(),
  driverOverrides: z.record(z.number()).optional(),
});

// ============================================================================
// Path params
// ============================================================================

export const budgetVersionIdParamSchema = idParamSchema;
