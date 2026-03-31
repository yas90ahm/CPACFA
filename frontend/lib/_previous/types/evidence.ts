export interface EvidenceFile {
  id: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  uploadedBy: string;
  uploadedAt: string;
  sha256Hash: string;
  downloadUrl: string;
}
