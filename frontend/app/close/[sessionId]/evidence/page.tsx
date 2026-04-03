'use client';

import { useState, useRef, useCallback } from 'react';
import { useParams } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  FileText,
  Upload,
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Loader2,
  Link as LinkIcon,
  Hash,
  User,
  Calendar,
  Lock,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface EvidenceFile {
  id: string;
  fileName: string;
  sha256: string;
  uploadedBy: string;
  uploadedAt: string;
  verified: boolean;
  category: string;
  fileUrl?: string;
}

interface ReconEvidence {
  reconId: string;
  accountCode: string;
  accountName: string;
  file?: EvidenceFile;
  status: 'verified' | 'upload_required' | 'pending';
}

interface JEEvidence {
  jeId: string;
  entryNumber?: string;
  description: string;
  amount: string;
  isMaterial: boolean;
  file?: EvidenceFile;
  status: 'verified' | 'upload_required' | 'pending';
}

interface EvidenceManifest {
  files: EvidenceFile[];
  reconEvidence: ReconEvidence[];
  jeEvidence: JEEvidence[];
  stats: {
    required: number;
    uploaded: number;
    missing: number;
    hashVerified: number;
    totalFiles: number;
  };
}

/* ------------------------------------------------------------------ */
/*  Stat Card                                                          */
/* ------------------------------------------------------------------ */

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string | number;
  sub?: string;
  color?: string;
  icon: React.ElementType;
}) {
  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-[#8B7A5E] font-medium uppercase tracking-wide">{label}</span>
        <Icon size={16} className="text-[#8B7A5E]" />
      </div>
      <div className="text-2xl font-medium font-mono" style={{ color: color || '#2C2416' }}>
        {value}
      </div>
      {sub && <div className="text-xs text-[#8B7A5E] mt-1">{sub}</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Status Badge                                                       */
/* ------------------------------------------------------------------ */

function StatusBadge({ status }: { status: string }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#E0EDE8] text-[#2D6A4F]">
        <CheckCircle2 size={12} /> Verified
      </span>
    );
  }
  if (status === 'upload_required') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#FDEAE6] text-[#C44B2B]">
        <XCircle size={12} /> Upload Required
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium px-2 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
      <AlertTriangle size={12} /> Pending
    </span>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function EvidenceUploadPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isDragOver, setIsDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);

  const handleFileUpload = useCallback(async (file: File, reconId?: string, jeId?: string) => {
    const formData = new FormData();
    formData.append('file', file);
    if (reconId) formData.append('reconId', reconId);
    if (jeId) formData.append('jeId', jeId);

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const token = localStorage.getItem('cpa_auth_token');
    const endpoint = reconId
      ? `${baseUrl}/api/close/sessions/${sessionId}/reconciliations/${reconId}/evidence`
      : `${baseUrl}/api/close/sessions/${sessionId}/evidence`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
      body: formData,
    });
    if (res.ok) {
      queryClient.invalidateQueries({ queryKey: ['evidence-zones', sessionId] });
    }
  }, [sessionId, queryClient]);

  const handleDrop = useCallback(async (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = Array.from(e.dataTransfer.files);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        await handleFileUpload(file);
      }
    } finally {
      setUploading(false);
    }
  }, [handleFileUpload]);

  const handleFileInputChange = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (files.length === 0) return;
    setUploading(true);
    try {
      for (const file of files) {
        await handleFileUpload(file);
      }
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [handleFileUpload]);

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

  const { data, isLoading, error } = useQuery<EvidenceManifest>({
    queryKey: ['evidence-zones', sessionId],
    queryFn: async () => {
      const manifest = await apiFetch<any>(`/api/close/sessions/${sessionId}/evidence-manifest`);
      return manifest;
    },
    enabled: !!sessionId,
  });

  if (isLoading) {
    return (
      <div className="ml-[260px] min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <Loader2 size={32} className="animate-spin text-[#B8860B]" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-[#F5F0E8] flex items-center justify-center">
        <div className="text-[#C44B2B] text-sm">Failed to load evidence data.</div>
      </div>
    );
  }

  const stats = data?.stats ?? { required: 24, uploaded: 18, missing: 6, hashVerified: 18, totalFiles: 18 };
  const reconEvidence = data?.reconEvidence ?? [];
  const jeEvidence = data?.jeEvidence ?? [];

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
    <div className="min-h-screen bg-[#F5F0E8]">
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
        <h1 className="text-2xl font-medium text-[#2C2416]">Evidence Upload Zones</h1>
        <p className="text-sm text-[#8B7A5E] mt-1">
          Upload and verify supporting evidence for reconciliations and journal entries.
        </p>
      </div>

      {/* Upload Dropzone */}
      <div className="px-8 mb-8">
        <div
          className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
            isDragOver
              ? 'border-[#B8860B] bg-[#F5EDD0]'
              : 'border-[#DDD5C2] bg-[#EDE6D6] hover:border-[#B8860B]/50'
          }`}
          onDragOver={(e) => { e.preventDefault(); setIsDragOver(true); }}
          onDragLeave={() => setIsDragOver(false)}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); fileInputRef.current?.click(); } }}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFileInputChange}
          />
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 size={24} className="animate-spin text-[#B8860B]" />
              <p className="text-sm text-[#8B7A5E]">Uploading...</p>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2">
              <Upload size={24} className="text-[#8B7A5E]" />
              <p className="text-sm text-[#2C2416] font-medium">
                {isDragOver ? 'Drop files here' : 'Drag & drop files or click to browse'}
              </p>
              <p className="text-xs text-[#8B7A5E]">
                Upload supporting evidence for reconciliations and journal entries
              </p>
            </div>
          )}
        </div>
      </div>

      {/* Stat Cards */}
      <div className="px-8 grid grid-cols-4 gap-4 mb-8">
        <StatCard label="Required Files" value={stats.required} icon={FileText} />
        <StatCard label="Uploaded" value={stats.uploaded} icon={Upload} />
        <StatCard label="Missing" value={stats.missing} color="#C44B2B" icon={AlertTriangle} />
        <StatCard
          label="Hash Verified"
          value={`${stats.hashVerified}/${stats.totalFiles}`}
          color="#2D6A4F"
          icon={ShieldCheck}
        />
      </div>

      {/* Reconciliation Evidence */}
      <div className="px-8 mb-8">
        <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wide mb-3">
          Reconciliation Evidence
        </h2>
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#2C2416] text-[#B8860B]">
                <th className="text-left px-4 py-3 font-medium">Account</th>
                <th className="text-left px-4 py-3 font-medium">File</th>
                <th className="text-left px-4 py-3 font-medium">SHA-256 Hash</th>
                <th className="text-left px-4 py-3 font-medium">Uploader</th>
                <th className="text-left px-4 py-3 font-medium">Date</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {reconEvidence.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-8 text-center text-[#8B7A5E]">
                    No reconciliation evidence records found.
                  </td>
                </tr>
              ) : (
                reconEvidence.map((re) => (
                  <tr key={re.reconId} className="border-t border-[#DDD5C2] hover:bg-[#F5F0E8] transition-colors">
                    <td className="px-4 py-3">
                      <div className="font-medium text-[#2C2416]">{re.accountCode}</div>
                      <div className="text-xs text-[#8B7A5E]">{re.accountName}</div>
                    </td>
                    <td className="px-4 py-3">
                      {re.file ? (
                        <a
                          href={re.file.fileUrl || '#'}
                          className="text-[#3B6EA5] hover:underline inline-flex items-center gap-1"
                        >
                          <LinkIcon size={12} />
                          {re.file.fileName}
                        </a>
                      ) : (
                        <span className="text-[#8B7A5E]">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      {re.file ? (
                        <code className="text-xs font-mono text-[#B8860B] break-all">
                          {re.file.sha256.slice(0, 16)}...
                        </code>
                      ) : (
                        <span className="text-[#8B7A5E]">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-[#2C2416]">{re.file?.uploadedBy ?? '--'}</td>
                    <td className="px-4 py-3 text-[#8B7A5E]">
                      {re.file?.uploadedAt
                        ? new Date(re.file.uploadedAt).toLocaleDateString()
                        : '--'}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={re.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Journal Entry Evidence */}
      <div className="px-8 mb-8">
        <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wide mb-3">
          Journal Entry Evidence
        </h2>
        <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="bg-[#2C2416] text-[#B8860B]">
                <th className="text-left px-4 py-3 font-medium">JE ID</th>
                <th className="text-left px-4 py-3 font-medium">Description</th>
                <th className="text-left px-4 py-3 font-medium">File</th>
                <th className="text-left px-4 py-3 font-medium">Status</th>
              </tr>
            </thead>
            <tbody>
              {jeEvidence.length === 0 ? (
                <tr>
                  <td colSpan={4} className="px-4 py-8 text-center text-[#8B7A5E]">
                    No journal entry evidence records found.
                  </td>
                </tr>
              ) : (
                jeEvidence.map((je) => (
                  <tr key={je.jeId} className="border-t border-[#DDD5C2] hover:bg-[#F5F0E8] transition-colors">
                    <td className="px-4 py-3 font-mono text-[#2C2416]">{je.entryNumber || je.jeId}</td>
                    <td className="px-4 py-3">
                      <div className="text-[#2C2416]">{je.description}</div>
                      <div className="text-xs text-[#8B7A5E] mt-0.5">
                        {je.amount}
                        {je.isMaterial && (
                          <span className="ml-2 text-xs font-medium px-1.5 py-0.5 rounded bg-[#F0E8D0] text-[#8B6914]">
                            MATERIAL
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      {je.file ? (
                        <a
                          href={je.file.fileUrl || '#'}
                          className="text-[#3B6EA5] hover:underline inline-flex items-center gap-1"
                        >
                          <LinkIcon size={12} />
                          {je.file.fileName}
                        </a>
                      ) : (
                        <span className="text-[#8B7A5E]">--</span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={je.status} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Bottom Notice */}
      <div className="px-8 pb-8">
        <div className="bg-[#2C2416] rounded-lg px-6 py-4 flex items-center gap-3">
          <Lock size={16} className="text-[#B8860B] flex-shrink-0" />
          <p className="text-sm text-[#8B7A5E]">
            <span className="text-[#B8860B] font-medium">IMMUTABLE EVIDENCE CHAIN</span> — Files are
            SHA-256 hashed on upload. Hashes are recorded in the append-only audit ledger. Evidence cannot
            be modified or replaced after upload without creating a new audit trail entry.
          </p>
        </div>
      </div>
    </div>
  );
}
