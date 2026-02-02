/**
 * Alerts: configurable thresholds (variance, covenant headroom, close task overdue).
 */

import type { AlertConfig } from '../types/access_usage.js';

const store = new Map<string, AlertConfig>();

const DEFAULTS: AlertConfig[] = [
  { id: 'variance_material', name: 'Material variance', type: 'variance_material', thresholdPercent: 10, enabled: true },
  { id: 'covenant_near', name: 'Covenant near limit', type: 'covenant_near_limit', thresholdHeadroomPercent: 20, enabled: true },
  { id: 'close_overdue', name: 'Close task overdue', type: 'close_task_overdue', enabled: true },
];

function init(): void {
  if (store.size > 0) return;
  for (const a of DEFAULTS) store.set(a.id, a);
}

export function listAlertConfigs(): AlertConfig[] {
  init();
  return Array.from(store.values());
}

export function getAlertConfig(id: string): AlertConfig | undefined {
  init();
  return store.get(id);
}

export function setAlertConfig(config: Partial<AlertConfig> & { id: string }): AlertConfig {
  init();
  const existing = store.get(config.id);
  const merged: AlertConfig = {
    id: config.id,
    name: config.name ?? existing?.name ?? config.id,
    type: config.type ?? existing?.type ?? config.id,
    thresholdPercent: config.thresholdPercent ?? existing?.thresholdPercent,
    thresholdAmount: config.thresholdAmount ?? existing?.thresholdAmount,
    thresholdHeadroomPercent: config.thresholdHeadroomPercent ?? existing?.thresholdHeadroomPercent,
    enabled: config.enabled ?? existing?.enabled ?? true,
  };
  store.set(config.id, merged);
  return merged;
}

export function evaluateVarianceAlert(
  variancePercent: number,
  varianceAmount: number
): { triggered: boolean; config?: AlertConfig } {
  const config = listAlertConfigs().find((c) => c.type === 'variance_material' && c.enabled);
  if (!config) return { triggered: false };
  const pOk = config.thresholdPercent == null || Math.abs(variancePercent) < config.thresholdPercent;
  const aOk = config.thresholdAmount == null || Math.abs(varianceAmount) < (config.thresholdAmount ?? 0);
  return { triggered: !pOk || !aOk, config };
}

export function evaluateCovenantHeadroomAlert(
  headroomPercent: number
): { triggered: boolean; config?: AlertConfig } {
  const config = listAlertConfigs().find((c) => c.type === 'covenant_near_limit' && c.enabled);
  if (!config) return { triggered: false };
  const threshold = config.thresholdHeadroomPercent ?? 20;
  return { triggered: headroomPercent < threshold && headroomPercent >= 0, config };
}
