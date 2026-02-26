/**
 * Evidence policy for certification gate (Phase 2A).
 * Tenant-scoped; default when no policy: enforcement_mode = 'off'.
 */

export type EvidenceEnforcementMode = 'off' | 'warn_only' | 'hard_block';

/** Maps JE type (e.g. manual_entry, revenue) to required assertion types. */
export type RequiredAssertionTypesMap = Record<string, string[]>;

export interface EvidencePolicy {
  tenantId: string;
  enforcementMode: EvidenceEnforcementMode;
  materialityThreshold?: string;
  requiredAssertionTypes?: RequiredAssertionTypesMap;
  createdAt: string;
  updatedAt: string;
}

export interface UpsertEvidencePolicyInput {
  tenantId: string;
  enforcementMode: EvidenceEnforcementMode;
  materialityThreshold?: string;
  requiredAssertionTypes?: RequiredAssertionTypesMap;
}
