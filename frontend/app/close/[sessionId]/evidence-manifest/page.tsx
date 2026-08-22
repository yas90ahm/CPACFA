'use client';

import { useState } from 'react';
import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type {
  EvidenceIntegrityStatus,
  SessionEvidenceFile,
  SessionEvidenceManifest,
} from '@/lib/contracts';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileText,
  FolderOpen,
  HardDrive,
  Hash,
  Loader2,
  RefreshCw,
} from 'lucide-react';

interface DisplayFile extends SessionEvidenceFile {
  category: string;
  sourceId: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function csvCell(value: string | number): string {
  const raw = String(value);
  return /[",\n]/.test(raw) ? `"${raw.replace(/"/g, '""')}"` : raw;
}

function downloadManifest(files: DisplayFile[], sessionId: string): void {
  const header = [
    'Evidence ID',
    'Source type',
    'Source ID',
    'File name',
    'Size bytes',
    'SHA-256',
    'Uploaded by',
    'Uploaded at',
    'Integrity status',
  ];
  const rows = files.map((file) => [
    file.id,
    file.category,
    file.sourceId,
    file.fileName,
    file.sizeBytes,
    file.sha256Hash,
    file.uploadedBy,
    file.createdAt,
    file.integrityStatus,
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvCell).join(',')).join('\n');
  const href = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = `sabit-evidence-manifest-${sessionId}.csv`;
  anchor.click();
  URL.revokeObjectURL(href);
}

function StatCard({
  label,
  value,
  icon: Icon,
  color = '#B8860B',
}: {
  label: string;
  value: string | number;
  icon: React.ElementType;
  color?: string;
}) {
  return (
    <div className="rounded-lg border border-[#3B1F0A] bg-[#2C2416] p-5">
      <div className="mb-3 flex items-center justify-between">
        <span className="text-xs font-medium uppercase tracking-wide text-[#8B7A5E]">{label}</span>
        <Icon size={16} className="text-[#8B7A5E]" />
      </div>
      <div className="font-mono text-2xl font-medium" style={{ color }}>
        {value}
      </div>
    </div>
  );
}

function IntegrityBadge({ status }: { status: EvidenceIntegrityStatus }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#68A98A]">
        <CheckCircle2 size={14} /> Re-hash matched
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#E0785C]">
        <AlertTriangle size={14} /> Failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#B8A98D]">
      <Hash size={14} /> Hash recorded only
    </span>
  );
}

export default function EvidenceManifestPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const [exportError, setExportError] = useState<string | null>(null);
  const manifestQuery = useQuery<SessionEvidenceManifest>({
    queryKey: ['evidence-manifest', sessionId],
    queryFn: () => apiFetch<SessionEvidenceManifest>(
      `/api/close/sessions/${sessionId}/evidence-manifest`
    ),
    enabled: Boolean(sessionId),
  });

  if (manifestQuery.isLoading) {
    return (
      <div className="ml-[260px] flex min-h-screen items-center justify-center bg-[#1A1510]">
        <Loader2 size={32} className="animate-spin text-[#B8860B]" />
      </div>
    );
  }

  if (manifestQuery.error || !manifestQuery.data) {
    return (
      <div className="ml-[260px] flex min-h-screen items-center justify-center bg-[#1A1510] px-6">
        <div className="text-sm text-[#E0785C]">
          {manifestQuery.error instanceof Error
            ? manifestQuery.error.message
            : 'Evidence manifest is unavailable.'}
        </div>
      </div>
    );
  }

  const manifest = manifestQuery.data;
  const verification = manifest.hashVerification;
  const files: DisplayFile[] = [
    ...manifest.reconEvidence.flatMap((group) =>
      group.files.map((file) => ({
        ...file,
        category: 'Reconciliation',
        sourceId: `${group.accountCode} · ${group.reconId}`,
      }))
    ),
    ...manifest.jeEvidence.flatMap((group) =>
      group.files.map((file) => ({
        ...file,
        category: 'Journal entry',
        sourceId: group.jeId,
      }))
    ),
  ];
  const categoryCount = new Set(files.map((file) => file.category)).size;

  return (
    <div className="ml-[260px] min-h-screen bg-[#1A1510] text-[#EDE6D6]">
      <header className="px-8 pb-6 pt-8">
        <h1 className="text-2xl font-medium text-[#B8860B]">Evidence Manifest</h1>
        <p className="mt-1 text-sm text-[#8B7A5E]">
          Evidence linked to this close. Stored files are retrieved and re-hashed on each refresh;
          external references retain their supplied hash but are not shown as independently verified.
        </p>
      </header>

      <section className="mb-6 grid grid-cols-2 gap-4 px-8 lg:grid-cols-5">
        <StatCard label="Total Files" value={manifest.totalFiles} icon={FileText} />
        <StatCard
          label="Stored & Verified"
          value={`${verification.verifiedFileCount}/${verification.storedFileCount}`}
          icon={CheckCircle2}
          color={verification.failedFileCount > 0 ? '#E0785C' : '#68A98A'}
        />
        <StatCard
          label="Verification Failures"
          value={verification.failedFileCount}
          icon={AlertTriangle}
          color={verification.failedFileCount > 0 ? '#E0785C' : '#68A98A'}
        />
        <StatCard label="Categories" value={categoryCount} icon={FolderOpen} />
        <StatCard label="Total Size" value={formatBytes(manifest.totalSizeBytes)} icon={HardDrive} />
      </section>

      <section className="mb-6 px-8">
        <div className={`rounded-lg border px-5 py-4 ${
          verification.failedFileCount > 0
            ? 'border-[#C44B2B]/30 bg-[#C44B2B]/10'
            : 'border-[#3B1F0A] bg-[#2C2416]'
        }`}>
          <div className="flex items-start gap-3">
            {verification.failedFileCount > 0 ? (
              <AlertTriangle size={17} className="mt-0.5 shrink-0 text-[#E0785C]" />
            ) : (
              <Hash size={17} className="mt-0.5 shrink-0 text-[#B8860B]" />
            )}
            <div>
              <div className="text-sm font-medium">
                {verification.failedFileCount > 0
                  ? 'One or more stored files failed integrity verification.'
                  : verification.storedFileCount > 0
                    ? 'All retrieved stored files matched their recorded SHA-256 hashes.'
                    : 'No storage-backed files were available to re-hash.'}
              </div>
              <p className="mt-1 text-xs leading-relaxed text-[#8B7A5E]">
                {verification.notVerifiableFileCount} external metadata-only file(s) were not re-hashed.
                Verification ran {new Date(verification.performedAt).toLocaleString('en-CA')}.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="px-8">
        <div className="overflow-hidden rounded-lg border border-[#3B1F0A] bg-[#2C2416]">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-[#3B1F0A] text-[#B8860B]">
                  <th className="px-4 py-3 text-left font-medium">File</th>
                  <th className="px-4 py-3 text-left font-medium">Source</th>
                  <th className="px-4 py-3 text-left font-medium">SHA-256</th>
                  <th className="px-4 py-3 text-left font-medium">Uploaded</th>
                  <th className="px-4 py-3 text-right font-medium">Size</th>
                  <th className="px-4 py-3 text-left font-medium">Integrity</th>
                </tr>
              </thead>
              <tbody>
                {files.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-[#8B7A5E]">
                      No evidence is linked to reconciliations or journal entries in this close.
                    </td>
                  </tr>
                ) : files.map((file) => (
                  <tr key={`${file.category}-${file.sourceId}-${file.id}`} className="border-t border-[#3B1F0A]">
                    <td className="px-4 py-3 text-[#EDE6D6]">
                      <div>{file.fileName}</div>
                      <div className="mt-0.5 text-xs text-[#8B7A5E]">{file.mimeType ?? 'Unknown type'}</div>
                    </td>
                    <td className="px-4 py-3">
                      <div className="text-[#C4B89A]">{file.category}</div>
                      <code className="text-[11px] text-[#8B7A5E]">{file.sourceId}</code>
                    </td>
                    <td className="max-w-[230px] px-4 py-3">
                      <code className="block truncate font-mono text-xs text-[#B8860B]" title={file.sha256Hash}>
                        {file.sha256Hash}
                      </code>
                    </td>
                    <td className="px-4 py-3 text-[#8B7A5E]">
                      <div>{file.uploadedBy}</div>
                      <div className="text-xs">{new Date(file.createdAt).toLocaleString('en-CA')}</div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-[#8B7A5E]">
                      {formatBytes(file.sizeBytes)}
                    </td>
                    <td className="px-4 py-3"><IntegrityBadge status={file.integrityStatus} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <footer className="flex items-center gap-3 px-8 py-8">
        <button
          type="button"
          onClick={() => {
            setExportError(null);
            try {
              downloadManifest(files, sessionId);
            } catch (error) {
              setExportError(error instanceof Error ? error.message : 'Manifest export failed');
            }
          }}
          disabled={files.length === 0}
          className="inline-flex items-center gap-2 rounded-lg border border-[#3B1F0A] bg-[#2C2416] px-5 py-2.5 text-sm font-medium text-[#B8A98D] transition-colors hover:border-[#B8860B] hover:text-[#B8860B] disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Download size={16} /> Download manifest CSV
        </button>
        <button
          type="button"
          onClick={() => manifestQuery.refetch()}
          disabled={manifestQuery.isFetching}
          className="inline-flex items-center gap-2 rounded-lg bg-[#B8860B] px-5 py-2.5 text-sm font-medium text-[#2C2416] transition-colors hover:bg-[#A07608] disabled:opacity-50"
        >
          <RefreshCw size={16} className={manifestQuery.isFetching ? 'animate-spin' : ''} />
          Re-run stored-file verification
        </button>
        {exportError && <span className="text-xs text-[#E0785C]">{exportError}</span>}
      </footer>
    </div>
  );
}
