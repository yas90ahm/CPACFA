import type { CertificationArtifact } from '@/lib/types/certification';

export const mockCertification: CertificationArtifact | null = null;

export const mockCertificationCertified: CertificationArtifact = {
  id: 'cert-001',
  sessionId: 'c925645f-3831-4d81-93a9-a12a2819cd3e',
  certifiedBy: 'Mike Torres',
  certifiedAt: '2026-02-05T16:32:18-05:00',
  snapshotHash: 'a3f2c891d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2',
  signature: '7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4',
  publicKey: 'MCowBQYDK2VwAyEAa3f2c891d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6',
  validationResults: [
    { check: 'A = L + E', passed: true, detail: 'Assets: $17,563,134.57 = L+E: $17,563,134.57' },
    { check: 'Net Income tie (IS ↔ Equity)', passed: true, detail: 'IS Net Income: $3,405,250.00 = Equity Net Income: $3,405,250.00' },
    { check: 'Cash tie (CF ↔ BS)', passed: true, detail: 'CF Ending Cash: $1,745,678.90 = BS Cash: $1,745,678.90' },
    { check: 'Equity tie', passed: true, detail: 'Equity Total: $4,083,801.24 = BS Equity: $4,083,801.24' },
    { check: 'All four statements exist', passed: true, detail: 'IS ✓  BS ✓  CF ✓  Equity ✓' },
    { check: 'Statements not stale', passed: true, detail: 'Generated after last mutation' },
    { check: 'Trial balance balanced', passed: true, detail: 'Total debits: $45,234,567.89 = Total credits' },
  ],
  verified: true,
};

export function getCertificationBySession(sessionId: string): CertificationArtifact | null {
  return mockCertificationCertified;
}
