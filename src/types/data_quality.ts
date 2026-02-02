/**
 * Configurable data quality rules and exceptions.
 */

export type DataQualityScope = 'trial_balance' | 'balance_sheet' | 'invoice';
export type DataQualityRuleType = 'balance' | 'threshold' | 'variance';
export type DataQualitySeverity = 'info' | 'warning' | 'critical';

export interface DataQualityRuleConfig {
  /** Account name pattern (e.g. regex or exact) */
  accountPattern?: string;
  /** Threshold for threshold-type rules */
  threshold?: number;
  /** Comparison period for variance (e.g. "prior_period") */
  comparisonPeriod?: string;
  /** Optional: min/max bounds */
  min?: number;
  max?: number;
}

export interface DataQualityRule {
  id: string;
  name: string;
  scope: DataQualityScope;
  type: DataQualityRuleType;
  config: DataQualityRuleConfig;
  severity: DataQualitySeverity;
  enabled: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export type DataQualityExceptionStatus = 'open' | 'acknowledged' | 'resolved';

export interface DataQualityException {
  id: string;
  tenantId: string;
  ruleId: string;
  periodLabel?: string;
  sourceId?: string;
  status: DataQualityExceptionStatus;
  message: string;
  metric?: number;
  severity: DataQualitySeverity;
  acknowledgedAt?: string;
  acknowledgedBy?: string;
  resolvedAt?: string;
  resolvedBy?: string;
  note?: string;
  createdAt: string;
  updatedAt: string;
}
