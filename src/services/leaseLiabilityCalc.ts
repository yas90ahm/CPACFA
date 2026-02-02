/**
 * IFRS 16 lease liability and right-of-use asset (present value of lease payments).
 * Used by StatementGenerator (IFRS) and by the calculateLeaseLiability tool.
 */

import { round2 } from '../utils/decimal.js';

export interface LeaseLiabilityInput {
  leasePayments: number[];
  discountRate: number;
  paymentTiming?: 'beginning' | 'end';
}

export interface LeaseLiabilityResult {
  leaseLiability: number;
  rightOfUseAsset: number;
  presentValueOfPayments: number;
  numberOfPayments: number;
  discountRate: number;
}

function presentValue(payments: number[], rate: number, atEnd: boolean): number {
  if (payments.length === 0) return 0;
  let pv = 0;
  for (let i = 0; i < payments.length; i++) {
    const periods = atEnd ? i + 1 : i;
    pv += payments[i]! / Math.pow(1 + rate, periods);
  }
  return pv;
}

export function computeLeaseLiability(input: LeaseLiabilityInput): LeaseLiabilityResult {
  const atEnd = input.paymentTiming !== 'beginning';
  const pv = presentValue(input.leasePayments, input.discountRate, atEnd);
  return {
    leaseLiability: round2(pv),
    rightOfUseAsset: round2(pv),
    presentValueOfPayments: round2(pv),
    numberOfPayments: input.leasePayments.length,
    discountRate: input.discountRate,
  };
}
