/**
 * Tool: calculateLeaseLiability — IFRS 16 lease liability and right-of-use asset.
 * Triggered when IFRS is selected for statement generation.
 */

import { z } from 'zod';
import type { ToolDefinition, ToolResult } from './types.js';

export const leaseLiabilitySchema = z.object({
  leasePayments: z
    .array(z.number())
    .min(1)
    .describe('Lease payments per period (e.g. monthly or annual).'),
  discountRate: z
    .number()
    .min(0)
    .max(1)
    .describe('Lessee incremental borrowing rate (e.g. 0.05 for 5%).'),
  paymentTiming: z
    .enum(['beginning', 'end'])
    .optional()
    .default('end')
    .describe('Whether payments are at period beginning or end (IFRS 16: typically end).'),
});

export type LeaseLiabilityInput = z.infer<typeof leaseLiabilitySchema>;

export const leaseLiabilityDefinition: ToolDefinition<LeaseLiabilityInput> = {
  name: 'calculateLeaseLiability',
  description:
    'Use this when IFRS is selected and lease data is available. Calculates IFRS 16 lease liability and right-of-use asset: present value of lease payments. Returns lease liability, ROU asset (same amount at commencement), and optional amortization schedule. Call with leasePayments (array of payments), discountRate (e.g. 0.05), and optional paymentTiming ("end" or "beginning").',
  parameters: leaseLiabilitySchema as import('zod').z.ZodType<LeaseLiabilityInput>,
};

import { computeLeaseLiability } from '../../services/leaseLiabilityCalc.js';

/**
 * Run the lease liability calculation (IFRS 16). Returns lease liability and ROU asset at commencement.
 */
export function runLeaseLiability(input: LeaseLiabilityInput): ToolResult<{
  leaseLiability: number;
  rightOfUseAsset: number;
  presentValueOfPayments: number;
  numberOfPayments: number;
  discountRate: number;
  citation: string;
}> {
  try {
    const parsed = leaseLiabilitySchema.parse(input);
    const result = computeLeaseLiability({
      leasePayments: parsed.leasePayments,
      discountRate: parsed.discountRate,
      paymentTiming: parsed.paymentTiming,
    });
    return {
      success: true,
      data: {
        ...result,
        citation: 'IFRS 16.26–.27 Lease liability and right-of-use asset at commencement',
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, error: message };
  }
}
