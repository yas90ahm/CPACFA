/**
 * Transaction classification memory (per-entity).
 */

import { getPolicyMemory, updatePolicyMemory } from './policy_memory.js';

export type CashFlowCategory = 'operating' | 'investing' | 'financing';

export async function getTransactionCategory(entityId: string, description?: string): Promise<CashFlowCategory | undefined> {
  const key = buildKey(description);
  if (!key) return undefined;
  const mem = await getPolicyMemory(entityId);
  const value = mem?.overrides?.[key];
  if (value === 'operating' || value === 'investing' || value === 'financing') return value;
  return undefined;
}

export async function setTransactionCategory(
  entityId: string,
  description: string | undefined,
  category: CashFlowCategory
): Promise<void> {
  const key = buildKey(description);
  if (!key) return;
  await updatePolicyMemory(entityId, { overrides: { [key]: category } });
}

function buildKey(description?: string): string | null {
  if (!description) return null;
  const norm = description.toLowerCase().replace(/\s+/g, ' ').trim();
  if (!norm) return null;
  return `txcat:${norm.slice(0, 160)}`;
}
