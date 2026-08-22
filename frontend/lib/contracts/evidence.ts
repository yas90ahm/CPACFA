export type EvidenceIntegrityStatus = 'verified' | 'failed' | 'not_verifiable';

export interface SessionEvidenceFile {
  id: string;
  fileName: string;
  sizeBytes: number;
  mimeType?: string;
  sha256Hash: string;
  uploadedBy: string;
  createdAt: string;
  storageBacked: boolean;
  integrityStatus: EvidenceIntegrityStatus;
}

export interface SessionReconEvidence {
  reconId: string;
  accountCode: string;
  files: SessionEvidenceFile[];
}

export interface SessionJournalEntryEvidence {
  jeId: string;
  memo?: string;
  files: SessionEvidenceFile[];
}

export interface SessionEvidenceManifest {
  reconEvidence: SessionReconEvidence[];
  jeEvidence: SessionJournalEntryEvidence[];
  totalFiles: number;
  totalSizeBytes: number;
  hashVerification: {
    performedAt: string;
    storedFileCount: number;
    verifiedFileCount: number;
    failedFileCount: number;
    notVerifiableFileCount: number;
    allStoredFilesVerified: boolean | null;
    note: string;
  };
}
