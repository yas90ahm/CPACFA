/**
 * Role-based dashboard config: which reports/APIs each role sees.
 */

import type { RoleDashboardConfig, DashboardRole } from '../types/access_usage.js';

const configs: RoleDashboardConfig[] = [
  {
    role: 'controller',
    reportKeys: [
      'close/checklist',
      'close/je-suggestions',
      'close/period-lock',
      'close/audit-log',
      'audit/reconciliation-summary',
      'audit/binder',
      'pipelines/bank',
      'pipelines/ap-aging',
      'pipelines/ar-aging',
    ],
    description: 'Close and reconciliations',
  },
  {
    role: 'cfo',
    reportKeys: [
      'cfo-dashboard/kpis',
      'cfo-dashboard/variance',
      'cfo-dashboard/sensitivity-report',
      'cfo-dashboard/board-one-pager',
      'forecasting/13-week-cash',
      'forecasting/quarterly-annual',
      'enterprise/covenants',
      'capital/portfolio',
    ],
    description: 'KPIs, variance, cash, covenants',
  },
  {
    role: 'auditor',
    reportKeys: [
      'audit/binder',
      'audit/reconciliation-summary',
      'audit/todos',
      'audit/gaap-consistency',
      'audit/drl',
      'close/audit-log',
    ],
    description: 'Binder, rec summary, DRL, audit log',
  },
];

export function getDashboardConfigForRole(role: DashboardRole): RoleDashboardConfig | undefined {
  return configs.find((c) => c.role === role);
}

export function listRoleDashboardConfigs(): RoleDashboardConfig[] {
  return [...configs];
}
