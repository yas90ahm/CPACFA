'use client';

import { useMutation } from '@tanstack/react-query';

const getBaseUrl = () => process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';

function getToken(): string | null {
  if (typeof window !== 'undefined') {
    try { return localStorage.getItem('cpa_auth_token'); } catch { return null; }
  }
  return null;
}

export interface ExportParams {
  exportMode: 'draft' | 'certified';
  closeSessionId: string;
  periodLabel?: string;
  agent_context?: boolean;
}

async function fetchBlob(path: string, body: ExportParams): Promise<{ blob: Blob; filename: string }> {
  const url = `${getBaseUrl()}${path}`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: 'Export failed' }));
    throw new Error((err as { error?: string }).error ?? 'Export failed');
  }

  const disposition = res.headers.get('Content-Disposition') ?? '';
  const match = disposition.match(/filename="?([^"]+)"?/);
  const filename = match?.[1] ?? `export.${path.includes('pdf') ? 'pdf' : 'csv'}`;
  const blob = await res.blob();
  return { blob, filename };
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function useExportPDF() {
  return useMutation({
    mutationFn: async (params: ExportParams) => {
      const { blob, filename } = await fetchBlob('/api/export/pdf', params);
      downloadBlob(blob, filename);
      return { filename };
    },
  });
}

export function useExportCSV() {
  return useMutation({
    mutationFn: async (params: ExportParams) => {
      const { blob, filename } = await fetchBlob('/api/export/csv', params);
      downloadBlob(blob, filename);
      return { filename };
    },
  });
}
