/**
 * KPI history: shared DTO for service and repository.
 */

import type { CFOKPIs } from './cfo-dashboard.js';

export interface KPISnapshot {
  id: string;
  periodLabel: string;
  asAt: string;
  kpis: CFOKPIs;
  createdAt: string;
}
