import type { EvidenceFile } from '@/lib/types/evidence';

function ev(id: string, name: string, size: number, mime: string, by: string, at: string): EvidenceFile {
  const hash = (id + '0'.repeat(64)).slice(0, 64);
  return { id, fileName: name, fileSize: size, mimeType: mime, uploadedBy: by, uploadedAt: at, sha256Hash: hash, downloadUrl: '#' };
}

export const mockEvidenceByRecon: Record<string, EvidenceFile[]> = {
  'recon-1010': [ev('ev-1', 'chase-operating-stmt-jan-2026.pdf', 245000, 'application/pdf', 'Sarah Chen', '2026-02-10T14:22:00Z')],
  'recon-1020': [ev('ev-2', 'chase-savings-stmt-jan-2026.pdf', 189000, 'application/pdf', 'Sarah Chen', '2026-02-10T14:25:00Z')],
  'recon-1100': [
    ev('ev-3', 'ar-aging-report-013126.xlsx', 52000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Sarah Chen', '2026-02-12T09:00:00Z'),
    ev('ev-4', 'ar-subledger-export-jan.xlsx', 78000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Sarah Chen', '2026-02-12T09:05:00Z'),
  ],
  'recon-1200': [ev('ev-5', 'inventory-count-sheet-jan.pdf', 156000, 'application/pdf', 'Mike Torres', '2026-02-14T11:30:00Z')],
  'recon-1210': [],
  'recon-1300': [],
  'recon-1500': [ev('ev-6', 'ppe-depreciation-schedule-jan-2026.xlsx', 42000, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Sarah Chen', '2026-02-09T16:00:00Z')],
  'recon-1510': [ev('ev-7', 'accum-depreciation-rollforward-jan.pdf', 98000, 'application/pdf', 'Sarah Chen', '2026-02-09T16:05:00Z')],
  'recon-2010': [],
  'recon-2100': [],
  'recon-2200': [ev('ev-8', 'loan-statement-current-portion-jan.pdf', 112000, 'application/pdf', 'Sarah Chen', '2026-02-08T10:00:00Z')],
  'recon-2500': [ev('ev-9', 'term-loan-statement-jan-2026.pdf', 203000, 'application/pdf', 'Sarah Chen', '2026-02-08T10:05:00Z')],
};
