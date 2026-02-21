export interface EvidencePolicy {
  jeThreshold: string;
  reconEvidenceRequired: boolean;
  acceptedFileTypes: string[];
  acceptedLabels: string[];
  maxFileSizeMB: number;
  sha256Enabled: boolean;
}

export const mockEvidencePolicy: EvidencePolicy = {
  jeThreshold: '10000.00',
  reconEvidenceRequired: true,
  acceptedFileTypes: ['application/pdf', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'text/csv', 'image/png', 'image/jpeg'],
  acceptedLabels: ['PDF', 'Excel (.xlsx, .xls)', 'CSV', 'Images (.png, .jpg)'],
  maxFileSizeMB: 25,
  sha256Enabled: true,
};

export function getEvidencePolicy(_entityId: string): EvidencePolicy {
  return { ...mockEvidencePolicy };
}
