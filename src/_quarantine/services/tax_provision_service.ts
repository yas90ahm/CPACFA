/**
 * Tax provision: current tax, deferred tax, rate reconciliation.
 */

import type { TaxProvisionInput, TaxProvisionResult } from '../types/tax_statutory.js';

export interface TaxProvisionInputExtended extends TaxProvisionInput {
  /** FW3: prior-year return figures for tie-out */
  priorYearReturnFigures?: TaxProvisionResult['priorYearReturnFigures'];
  /** FW3: deferred tax rollforward (opening + plMovement + other = closing) */
  deferredTaxRollforward?: TaxProvisionResult['deferredTaxRollforward'];
}

export function buildTaxProvision(input: TaxProvisionInput | TaxProvisionInputExtended): TaxProvisionResult {
  const {
    periodLabel,
    pretaxIncome,
    statutoryRate,
    currentTaxExpense = 0,
    deferredTaxAssetStart = 0,
    deferredTaxLiabilityStart = 0,
    deferredTaxMovement = 0,
  } = input;
  const totalTaxExpense = currentTaxExpense + deferredTaxMovement;
  const effectiveRate = pretaxIncome !== 0 ? totalTaxExpense / Math.abs(pretaxIncome) : 0;
  const rateReconciliation = [
    { description: 'Statutory rate', amount: statutoryRate * 100 },
    { description: 'Effective rate', amount: effectiveRate * 100 },
  ];
  const result: TaxProvisionResult = {
    periodLabel,
    currentTaxExpense,
    deferredTaxExpense: deferredTaxMovement,
    totalTaxExpense,
    effectiveRate,
    rateReconciliation,
  };
  if ((input as TaxProvisionInputExtended).priorYearReturnFigures != null) {
    result.priorYearReturnFigures = (input as TaxProvisionInputExtended).priorYearReturnFigures;
  }
  if ((input as TaxProvisionInputExtended).deferredTaxRollforward != null) {
    result.deferredTaxRollforward = (input as TaxProvisionInputExtended).deferredTaxRollforward;
  }
  return result;
}
