/**
 * Inventory valuation: FIFO and weighted average (Phase 1 core CPA task).
 */

export type InventoryValuationMethod = 'FIFO' | 'weighted_average';

export interface InventoryLayer {
  quantity: number;
  unitCost: number;
  date?: string; // ISO, for FIFO ordering
}

export interface InventoryValuationInput {
  /** Layers (receipts or batches); for FIFO, order by date ascending (oldest first) */
  layers: InventoryLayer[];
  /** Quantity on hand (or quantity to value) */
  quantityOnHand: number;
  method: InventoryValuationMethod;
}

export interface InventoryValuationResult {
  method: InventoryValuationMethod;
  quantityValued: number;
  totalValue: number;
  unitCost: number; // average cost per unit
  layersUsed?: { quantity: number; unitCost: number; value: number }[];
}

/**
 * FIFO: consume oldest layers first.
 */
function fifoValue(layers: InventoryLayer[], quantityOnHand: number): InventoryValuationResult {
  const sorted = [...layers].sort((a, b) => (a.date ?? '').localeCompare(b.date ?? ''));
  let remaining = quantityOnHand;
  let totalValue = 0;
  const layersUsed: { quantity: number; unitCost: number; value: number }[] = [];

  for (const layer of sorted) {
    if (remaining <= 0) break;
    const take = Math.min(remaining, layer.quantity);
    const value = take * layer.unitCost;
    totalValue += value;
    remaining -= take;
    if (take > 0) layersUsed.push({ quantity: take, unitCost: layer.unitCost, value });
  }
  const quantityValued = quantityOnHand - remaining;
  const unitCost = quantityValued > 0 ? totalValue / quantityValued : 0;
  return {
    method: 'FIFO',
    quantityValued,
    totalValue,
    unitCost,
    layersUsed,
  };
}

/**
 * Weighted average: total cost / total quantity across layers.
 */
function weightedAverageValue(layers: InventoryLayer[], quantityOnHand: number): InventoryValuationResult {
  let totalCost = 0;
  let totalQty = 0;
  for (const l of layers) {
    totalCost += l.quantity * l.unitCost;
    totalQty += l.quantity;
  }
  const avgCost = totalQty > 0 ? totalCost / totalQty : 0;
  const quantityValued = Math.min(quantityOnHand, totalQty);
  const totalValue = quantityValued * avgCost;
  return {
    method: 'weighted_average',
    quantityValued,
    totalValue,
    unitCost: avgCost,
  };
}

export function computeInventoryValuation(input: InventoryValuationInput): InventoryValuationResult {
  const { layers, quantityOnHand, method } = input;
  if (method === 'FIFO') return fifoValue(layers, quantityOnHand);
  return weightedAverageValue(layers, quantityOnHand);
}
