/**
 * AJE templates for recurring entries. Amounts are defaults; user can override when applying.
 */

export interface AjeTemplateLine {
  accountRef: string;
  debit?: number;
  credit?: number;
  description?: string;
}

export interface AjeTemplate {
  id: string;
  tenantId: string;
  entityId?: string;
  name: string;
  memo: string;
  lines: AjeTemplateLine[];
  frequency: 'monthly' | 'quarterly' | 'annually';
  isActive: boolean;
  consecutiveUnchangedApplications: number;
  autoApplyEligible: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreateAjeTemplateInput {
  tenantId: string;
  entityId?: string;
  name: string;
  memo: string;
  lines: AjeTemplateLine[];
  frequency?: 'monthly' | 'quarterly' | 'annually';
}

export interface AjeTemplateApplication {
  id: string;
  tenantId: string;
  templateId: string;
  closeSessionId: string;
  periodLabel: string;
  status: 'proposed' | 'applied' | 'skipped' | 'auto_applied';
  appliedJeId?: string;
  skippedAt?: string;
  /** Reason given when template was skipped. */
  skipReason?: string;
  createdAt: string;
}
