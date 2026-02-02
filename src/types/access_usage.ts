/**
 * Access and usage: role-based dashboards, alerts, usage log.
 */

export type DashboardRole = 'controller' | 'cfo' | 'auditor';

export interface RoleDashboardConfig {
  role: DashboardRole;
  /** API endpoints or report keys this role sees */
  reportKeys: string[];
  description?: string;
}

export interface AlertConfig {
  id: string;
  name: string;
  /** e.g. "variance_material", "covenant_near_limit", "close_task_overdue" */
  type: string;
  thresholdPercent?: number;
  thresholdAmount?: number;
  /** For covenant: within X% of limit */
  thresholdHeadroomPercent?: number;
  enabled: boolean;
}

export interface UsageLogEntry {
  id: string;
  timestamp: string; // ISO
  userId?: string;
  tenantId?: string;
  reportKey: string; // endpoint or report name
  action?: string; // e.g. "view", "export"
}
