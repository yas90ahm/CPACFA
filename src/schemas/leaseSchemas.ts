/**
 * Zod schemas for lease API routes (ASC 842 / IFRS 16).
 */

import { z } from 'zod';
import { isoDateSchema, amountSchema, percentageSchema, idParamSchema } from './commonSchemas.js';

export const leaseClassificationSchema = z.enum(['operating', 'finance']);
export const paymentFrequencySchema = z.enum(['monthly', 'quarterly', 'annual']);
export const leaseStandardSchema = z.enum(['asc842', 'ifrs16']);
export const accountingStandardSchema = z.enum(['ASPE', 'IFRS', 'FRS102', 'US_GAAP']);

export const createLeaseSchema = z
  .object({
    leaseName: z.string().min(1, 'Lease name required'),
    classification: leaseClassificationSchema.optional(),
    commencementDate: isoDateSchema,
    termMonths: z.number().int().positive('Term months required'),
    paymentFrequency: paymentFrequencySchema,
    paymentAmount: amountSchema,
    escalationPct: z.number().min(0).max(1).optional(),
    discountRate: percentageSchema,
    currency: z.string().min(1).optional(),
    standard: leaseStandardSchema.optional(),
    accountingStandard: accountingStandardSchema.optional(),
  })
  .refine((d) => d.standard != null || d.accountingStandard != null, {
    message: 'Either standard (asc842/ifrs16) or accountingStandard (ASPE/IFRS/FRS102/US_GAAP) is required',
  });

export const updateLeaseSchema = z.object({
  leaseName: z.string().min(1).optional(),
  classification: leaseClassificationSchema.optional(),
  commencementDate: isoDateSchema.optional(),
  termMonths: z.number().int().positive().optional(),
  paymentFrequency: paymentFrequencySchema.optional(),
  paymentAmount: amountSchema.optional(),
  escalationPct: z.number().min(0).max(1).optional(),
  discountRate: percentageSchema.optional(),
  currency: z.string().min(1).optional(),
  standard: leaseStandardSchema.optional(),
});

export const periodQuerySchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
});

export const suggestClassificationSchema = z
  .object({
    termMonths: z.number().int().positive(),
    pvOfPayments: amountSchema,
    fairValueOfAsset: amountSchema.optional(),
    standard: leaseStandardSchema.optional(),
    accountingStandard: accountingStandardSchema.optional(),
  })
  .refine((d) => d.standard != null || d.accountingStandard != null, {
    message: 'Either standard (asc842/ifrs16) or accountingStandard is required',
  });

export const suggestDiscountRateSchema = z.object({
  leaseType: z.string().optional(),
  tenantContext: z.string().optional(),
  currency: z.string().optional(),
});

export const leaseIdParamSchema = idParamSchema;

export const generateFootnoteSchema = z.object({
  periodLabel: z.string().optional(),
});
