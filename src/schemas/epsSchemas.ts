/**
 * Zod schemas for EPS API routes (ASC 260).
 */

import { z } from 'zod';
import { amountSchema, idParamSchema } from './commonSchemas.js';

export const periodQuerySchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
});

export const optionsWarrantSchema = z.object({
  shares: z.number().nonnegative(),
  exercisePrice: amountSchema,
  avgMarketPrice: amountSchema,
});

export const convertibleInstrumentSchema = z.object({
  incrementalShares: z.number().nonnegative(),
  addBackToIncome: amountSchema,
});

export const calculateEpsSchema = z.object({
  periodLabel: z.string().min(1, 'Period label required'),
  netIncome: amountSchema,
  preferredDividends: z.number().min(0).optional(),
  weightedAvgShares: z.number().positive('Weighted average shares required'),
  optionsWarrants: z.array(optionsWarrantSchema).optional(),
  convertibles: z.array(convertibleInstrumentSchema).optional(),
  save: z.boolean().optional(),
});

export const suggestWeightedSharesSchema = z.object({
  shareHistory: z.array(
    z.object({
      date: z.string(),
      shares: z.number().nonnegative(),
      event: z.string().optional(),
    })
  ),
  periodStart: z.string().optional(),
  periodEnd: z.string().optional(),
});

const accountingStandardSchema = z.enum(['ASPE', 'IFRS', 'FRS102', 'US_GAAP']).optional();

export const generateEpsFootnoteSchema = z.object({
  basicEps: amountSchema,
  dilutedEps: amountSchema,
  basicWeightedShares: z.number().nonnegative(),
  dilutedWeightedShares: z.number().nonnegative(),
  antidilutive: z.boolean().optional(),
  periodLabel: z.string().optional(),
  /** When provided, resolves to topic standard (asc260/ias33) for citation. */
  accountingStandard: accountingStandardSchema,
});

export const epsIdParamSchema = idParamSchema;
