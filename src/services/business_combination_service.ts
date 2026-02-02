/**
 * Business combination service — purchase price allocation, goodwill calculation.
 */

import type { Pool } from 'pg';
import * as repo from '../db/repositories/business_combination_repository.js';
import type { AcquisitionRow, PPALineItemRow, ContingentConsiderationRow } from '../db/repositories/business_combination_repository.js';

export type { AcquisitionRow, PPALineItemRow, ContingentConsiderationRow };

export interface PPAResult {
  acquisitionId: string;
  purchasePrice: number;
  totalFairValueAssets: number;
  totalFairValueLiabilities: number;
  fairValueNetAssets: number;
  goodwill: number;
  bargainPurchaseGain: number;
  lineItems: PPALineItemRow[];
}

export async function calculatePPA(tenantId: string, pool: Pool, acquisitionId: string): Promise<PPAResult> {
  const acq = await repo.getAcquisition(pool, tenantId, acquisitionId);
  if (!acq) throw new Error('Acquisition not found');
  
  const lineItems = await repo.listPPALineItems(pool, tenantId, acquisitionId);
  
  let totalFairValueAssets = 0;
  let totalFairValueLiabilities = 0;
  
  for (const item of lineItems) {
    const fv = item.fairValue ?? 0;
    if (item.itemType === 'liability') {
      totalFairValueLiabilities += fv;
    } else {
      totalFairValueAssets += fv;
    }
  }
  
  const fairValueNetAssets = totalFairValueAssets - totalFairValueLiabilities;
  const purchasePrice = acq.purchasePrice;
  
  let goodwill = 0;
  let bargainPurchaseGain = 0;
  
  if (purchasePrice > fairValueNetAssets) {
    goodwill = purchasePrice - fairValueNetAssets;
  } else {
    bargainPurchaseGain = fairValueNetAssets - purchasePrice;
  }
  
  return {
    acquisitionId,
    purchasePrice,
    totalFairValueAssets: round2(totalFairValueAssets),
    totalFairValueLiabilities: round2(totalFairValueLiabilities),
    fairValueNetAssets: round2(fairValueNetAssets),
    goodwill: round2(goodwill),
    bargainPurchaseGain: round2(bargainPurchaseGain),
    lineItems,
  };
}

export function calculateContingentConsiderationFairValue(scenarios: Array<{ probability: number; payout: number }>): number {
  return scenarios.reduce((sum, s) => sum + s.probability * s.payout, 0);
}

// CRUD Operations
export async function createAcquisition(tenantId: string, pool: Pool, acq: Omit<AcquisitionRow, 'id' | 'createdAt' | 'tenantId'>): Promise<AcquisitionRow> {
  return repo.createAcquisition(pool, tenantId, acq);
}

export async function getAcquisition(tenantId: string, pool: Pool, id: string): Promise<AcquisitionRow | null> {
  return repo.getAcquisition(pool, tenantId, id);
}

export async function listAcquisitions(tenantId: string, pool: Pool): Promise<AcquisitionRow[]> {
  return repo.listAcquisitions(pool, tenantId);
}

export async function deleteAcquisition(tenantId: string, pool: Pool, id: string): Promise<boolean> {
  return repo.deleteAcquisition(pool, tenantId, id);
}

export async function addPPALineItem(tenantId: string, pool: Pool, item: Omit<PPALineItemRow, 'id' | 'createdAt' | 'tenantId'>): Promise<PPALineItemRow> {
  return repo.addPPALineItem(pool, tenantId, item);
}

export async function listPPALineItems(tenantId: string, pool: Pool, acquisitionId: string): Promise<PPALineItemRow[]> {
  return repo.listPPALineItems(pool, tenantId, acquisitionId);
}

export async function addContingentConsideration(tenantId: string, pool: Pool, cc: Omit<ContingentConsiderationRow, 'id' | 'createdAt' | 'tenantId'>): Promise<ContingentConsiderationRow> {
  return repo.addContingentConsideration(pool, tenantId, cc);
}

export async function listContingentConsideration(tenantId: string, pool: Pool, acquisitionId: string): Promise<ContingentConsiderationRow[]> {
  return repo.listContingentConsideration(pool, tenantId, acquisitionId);
}
