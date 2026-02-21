export interface CertificationArtifact {
  id: string;
  sessionId: string;
  certifiedBy: string;
  certifiedAt: string;
  snapshotHash: string;
  signature: string;
  publicKey: string;
  validationResults: {
    check: string;
    passed: boolean;
    detail: string;
  }[];
  verified: boolean;
}
