/**
 * Binder/export 422 responses: single source of truth for codes, protective messages, and remediation.
 */

export const BinderExportCode = {
  NO_CERTIFIED_SOURCE: 'NO_CERTIFIED_SOURCE',
  FINAL_INTEGRITY_CHECK_FAILED: 'FINAL_INTEGRITY_CHECK_FAILED',
} as const;

/** Protective messages (no blame wording). */
export const BinderExportMessage: Record<(typeof BinderExportCode)[keyof typeof BinderExportCode], string> = {
  [BinderExportCode.NO_CERTIFIED_SOURCE]:
    'Not ready for external presentation. Missing required certified source. Certification creates the snapshot.',
  [BinderExportCode.FINAL_INTEGRITY_CHECK_FAILED]:
    'Not ready for external presentation. No certified statements available or Truth Gate did not pass.',
};

/** Short remediation for NO_CERTIFIED_SOURCE. */
export const BinderExportRemediation: Partial<Record<(typeof BinderExportCode)[keyof typeof BinderExportCode], string>> = {
  [BinderExportCode.NO_CERTIFIED_SOURCE]:
    'Certify the close session to create the snapshot, or use allowLegacyCertifiedSource=1 for legacy source.',
};
