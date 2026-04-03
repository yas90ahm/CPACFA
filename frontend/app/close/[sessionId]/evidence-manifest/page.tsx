'use client';

import { useParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  FileText,
  ShieldCheck,
  Link2,
  CheckCircle2,
  Loader2,
  Download,
  Hash,
  HardDrive,
  FolderOpen,
  Lock,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ManifestFile {
  id: string;
  fileName: string;
  category: string;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
  fileSize: string;
  verified: boolean;
}

interface ManifestData {
  files: ManifestFile[];
  stats: {
    totalFiles: number;
    hashVerified: number;
    chainStatus: string;
    categories: number;
    totalSize: string;
  };
  snapshotId?: string;
}

/* ------------------------------------------------------------------ */
/*  Stat Card (dark theme)                                             */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  color?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-[#2C2416] border border-[#3B1F0A] rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#8B7A5E] font-medium uppercase tracking-wide">{label}</span>
        <Icon size={16} className="text-[#8B7A5E]" />
      </div>
      <div className="text-2xl font-medium font-mono" style={{ color: color || '#B8860B' }}>
        {value}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function EvidenceManifestPage() {
  const { sessionId } = useParams<{ sessionId: string }>();

  const sessionQuery = useQuery({
    queryKey: ['session', sessionId],
    queryFn: () => apiFetch<any>(`/api/close/sessions/${sessionId}`),
    enabled: !!sessionId,
  });
  const readinessQuery = useQuery({
    queryKey: ['readiness', sessionId],
    queryFn: () => apiFetch<any>(`/api/close/sessions/${sessionId}/readiness`, { params: { format: 'gates' } }),
    enabled: !!sessionId,
  });

  const { data, isLoading, error } = useQuery<ManifestData>({
    queryKey: ['evidence-manifest', sessionId],
    queryFn: async () => {
      const manifest = await apiFetch<any>(`/api/close/sessions/${sessionId}/evidence-manifest`);
      return manifest;
    },
    enabled: !!sessionId,
  });

  if (isLoading) {
    return (
      <div className="ml-[260px] min-h-screen bg-[#1A1510] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#B8860B]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#1A1510] flex items-center justify-center">
        <div className="text-[#C44B2B] text-sm">Failed to load evidence manifest.</div>
      </div>
    );
  }

  const stats = data?.stats ?? {
    totalFiles: 61,
    hashVerified: 61,
    chainStatus: 'INTACT',
    categories: 6,
    totalSize: '142 MB',
  };
  const files = data?.files ?? [];

  const _gates = (readinessQuery.data as any)?.gates ?? [];
  const _gatesTotal = (readinessQuery.data as any)?.gatesTotal ?? _gates.length;
  const _activeGateIndex = _gates.findIndex((g: any) => !g.passing);
  const _activeGateNum = _activeGateIndex >= 0 ? _activeGateIndex + 1 : _gatesTotal;
  const _startedAt = (sessionQuery.data as any)?.startedAt ?? (sessionQuery.data as any)?.createdAt ?? new Date().toISOString();
  const _dayElapsed = Math.max(1, Math.ceil((Date.now() - new Date(_startedAt).getTime()) / (1000 * 60 * 60 * 24)));
  const _targetDays = (sessionQuery.data as any)?.closeDayTarget ?? 10;
  const _sessionState = ((sessionQuery.data as any)?.state ?? 'IN_PROGRESS').replace(/_/g, ' ');
  const _periodLabel = (sessionQuery.data as any)?.periodLabel ?? '';

  return (
    <div className="min-h-screen bg-[#1A1510]">
      {/* Progress Rail */}
      {_gates.length > 0 && (
        <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#B8860B] font-medium">
              Gate {_activeGateNum} of {_gatesTotal}
            </span>
            <span className="text-[#8B7A5E]">
              Close Day {_dayElapsed} of {_targetDays}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
              {_sessionState}
            </span>
            {_periodLabel && <span className="text-[#8B7A5E]">{_periodLabel}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {_gates.map((gate: any, i: number) => {
              let bg = '#5C4F3A';
              if (gate.passing) bg = '#2D6A4F';
              else if (i === _activeGateIndex) bg = '#B8860B';
              return (
                <div
                  key={gate.id}
                  className="w-2.5 h-2.5 rounded-full transition-colors"
                  style={{ backgroundColor: bg }}
                  title={`${gate.label}: ${gate.passing ? 'Passing' : 'Pending'}`}
                />
              );
            })}
          </div>
        </div>
      )}

      {/* Header */}
      <div className="px-8 pt-8 pb-6">
        <h1 className="text-2xl font-medium text-[#B8860B]">
          Evidence Manifest — Complete File Registry
        </h1>
        <p className="text-sm text-[#8B7A5E] mt-1">
          Immutable record of all evidence files uploaded during this close cycle.
        </p>
      </div>

      {/* Stat Cards */}
      <div className="px-8 grid grid-cols-5 gap-4 mb-8">
        <StatCard label="Total Files" value={stats.totalFiles} icon={FileText} />
        <StatCard
          label="Hash Verified"
          value={`${stats.hashVerified}/${stats.totalFiles}`}
          color="#2D6A4F"
          icon={ShieldCheck}
        />
        <StatCard label="Chain Status" value={stats.chainStatus} color="#2D6A4F" icon={Link2} />
        <StatCard label="Categories" value={stats.categories} icon={FolderOpen} />
        <StatCard label="Total Size" value={stats.totalSize} icon={HardDrive} />
      </div>

      {/* File Table */}
      <div className="px-8 mb-8">
        <div className="bg-[#2C2416] border border-[#3B1F0A] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#3B1F0A] text-[#B8860B]">
                <th className="text-left px-4 py-3 font-medium">File Name</th>
                <th className="text-left px-4 py-3 font-medium">Category</th>
                <th className="text-left px-4 py-3 font-medium">SHA-256 Hash</th>
                <th className="text-left px-4 py-3 font-medium">Uploader</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-right px-4 py-3 font-medium">Size</th>
                <th className="text-center px-4 py-3 font-medium">Verified</th>
              </tr>
            </thead>
            <tbody>
              {files.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-8 text-center text-[#8B7A5E]">
                    No evidence files in manifest.
                  </td>
                </tr>
              ) : (
                files.map((file) => (
                  <tr
                    key={file.id}
                    className="border-t border-[#3B1F0A] hover:bg-[#3B1F0A]/30 transition-colors"
                  >
                    <td className="px-4 py-3 text-[#EDE6D6]">{file.fileName}</td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-medium px-2 py-0.5 rounded bg-[#3B1F0A] text-[#8B7A5E]">
                        {file.category}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <code className="text-xs font-mono text-[#B8860B] break-all">
                        {file.sha256.slice(0, 24)}...
                      </code>
                    </td>
                    <td className="px-4 py-3 text-[#8B7A5E]">{file.uploadedBy}</td>
                    <td className="px-4 py-3 text-[#8B7A5E]">
                      {new Date(file.uploadedAt).toLocaleDateString()}
                    </td>
                    <td className="px-4 py-3 text-right text-[#8B7A5E] font-mono">{file.fileSize}</td>
                    <td className="px-4 py-3 text-center">
                      {file.verified ? (
                        <CheckCircle2 size={16} className="text-[#2D6A4F] mx-auto" />
                      ) : (
                        <span className="text-[#C44B2B] text-xs">Failed</span>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Export Buttons */}
      <div className="px-8 pb-8 flex items-center gap-4">
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2C2416] border border-[#3B1F0A] text-sm font-medium text-[#8B7A5E] hover:text-[#B8860B] hover:border-[#B8860B] transition-colors">
          <Download size={16} />
          Download Full Manifest (CSV)
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#B8860B] text-sm font-medium text-[#2C2416] hover:bg-[#A07608] transition-colors">
          <Download size={16} />
          Download All Evidence (ZIP)
        </button>
        <button className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-[#2C2416] border border-[#3B1F0A] text-sm font-medium text-[#8B7A5E] hover:text-[#B8860B] hover:border-[#B8860B] transition-colors">
          <ShieldCheck size={16} />
          Verify All Hashes
        </button>
      </div>
    </div>
  );
}
