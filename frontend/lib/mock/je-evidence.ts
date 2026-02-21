import type { EvidenceFile } from '@/lib/types/evidence';

function ev(id: string, name: string, size: number, mime: string, by: string, at: string): EvidenceFile {
  const hash = (id + '0'.repeat(64)).slice(0, 64);
  return { id, fileName: name, fileSize: size, mimeType: mime, uploadedBy: by, uploadedAt: at, sha256Hash: hash, downloadUrl: '#' };
}

export const mockJEEvidenceByJe: Record<string, EvidenceFile[]> = {
  'je-1040': [ev('jev-1', 'ar-aging-analysis-jan2026.xlsx', 52000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Sarah Chen', '2026-02-07T09:15:00Z')],
  'je-1042': [ev('jev-2', 'inventory-reserve-analysis-jan2026.pdf', 156000, 'application/pdf', 'Sarah Chen', '2026-02-10T09:10:00Z')],
};
