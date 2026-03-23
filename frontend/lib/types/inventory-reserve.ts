export interface InventoryAgingItem {
  id: string;
  itemCode: string;
  description: string;
  quantity: string;
  unitCost: string;
  totalCost: string;
  lastMovementDate: string | null;
  daysSinceMovement: number;
  agingBucket: 'current' | '91_180' | '181_365' | 'over_365';
}

export interface AgingSummary {
  snapshotId: string;
  totalItems: number;
  totalInventory: string;
  buckets: {
    current: { count: number; total: string };
    '91_180': { count: number; total: string };
    '181_365': { count: number; total: string };
    over_365: { count: number; total: string };
  };
  items: InventoryAgingItem[];
}

export interface InventoryReserveComputation {
  id: string;
  snapshotId: string;
  totalInventory: string;
  bucketCurrent: string;
  bucket91_180: string;
  bucket181_365: string;
  bucketOver365: string;
  reserveCurrent: string;
  reserve91_180: string;
  reserve181_365: string;
  reserveOver365: string;
  requiredReserve: string;
  currentGlReserve: string;
  adjustmentNeeded: string;
  journalEntryId: string | null;
  createdAt: string;
}

export interface InventoryReserveConfig {
  id: string;
  rateCurrent: string;
  rate91_180: string;
  rate181_365: string;
  rateOver365: string;
}
