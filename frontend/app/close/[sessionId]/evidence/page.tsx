'use client';

import { useRef, useState } from 'react';
import Link from 'next/link';
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
  ChevronRight,
  FileText,
  Hash,
  Loader2,
  Paperclip,
  ScrollText,
  Upload,
} from 'lucide-react';

type UploadTarget = { kind: 'reconciliation' | 'journal_entry'; id: string };

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function IntegrityBadge({ status }: { status: EvidenceIntegrityStatus }) {
  if (status === 'verified') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#2D6A4F]">
        <CheckCircle2 size={13} /> Re-hash matched
      </span>
    );
  }
  if (status === 'failed') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-[#C44B2B]">
        <AlertTriangle size={13} /> Integrity failed
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-[#8B6914]">
      <Hash size={13} /> Hash recorded only
    </span>
  );
}

function FileList({ files }: { files: SessionEvidenceFile[] }) {
  if (files.length === 0) {
    return <span className="text-xs text-[#8B7A5E]">No evidence linked</span>;
  }
  return (
    <div className="space-y-2">
      {files.map((file) => (
        <div key={file.id} className="rounded border border-[#DDD5C2] bg-[#F5F0E8] px-3 py-2">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate text-sm text-[#2C2416]" title={file.fileName}>{file.fileName}</div>
              <div className="mt-0.5 text-xs text-[#8B7A5E]">
                {formatBytes(file.sizeBytes)} · {file.uploadedBy} ·{' '}
                {new Date(file.createdAt).toLocaleDateString('en-CA')}
              </div>
            </div>
            <IntegrityBadge status={file.integrityStatus} />
          </div>
          <code className="mt-1 block truncate font-mono text-[10px] text-[#B8860B]" title={file.sha256Hash}>
            {file.sha256Hash}
          </code>
        </div>
      ))}
    </div>
  );
}

function StatCard({ label, value, icon: Icon }: {
  label: string;
  value: string | number;
  icon: React.ElementType;
}) {
  return (
    <div className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-4">
      <div className="flex items-center justify-between text-xs font-medium uppercase tracking-wide text-[#8B7A5E]">
        {label}<Icon size={15} />
      </div>
      <div className="mt-3 font-mono text-2xl text-[#2C2416]">{value}</div>
    </div>
  );
}

export default function EvidenceUploadPage() {
  const { sessionId } = useParams<{ sessionId: string }>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadTarget, setUploadTarget] = useState<UploadTarget | null>(null);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const manifestQuery = useQuery<SessionEvidenceManifest>({
    queryKey: ['evidence-manifest', sessionId],
    queryFn: () => apiFetch<SessionEvidenceManifest>(
      `/api/close/sessions/${sessionId}/evidence-manifest`
    ),
    enabled: Boolean(sessionId),
  });

  function chooseFile(target: UploadTarget): void {
    setUploadError(null);
    setUploadTarget(target);
    fileInputRef.current?.click();
  }

  async function uploadSelectedFile(file: File, target: UploadTarget): Promise<void> {
    const form = new FormData();
    form.append('file', file);
    let endpoint: string;
    if (target.kind === 'reconciliation') {
      endpoint = `/api/close/sessions/${sessionId}/reconciliations/${target.id}/evidence`;
    } else {
      endpoint = `/api/close/journal-entries/${target.id}/evidence/upload`;
      form.append('assertionType', 'other');
      form.append('role', 'support');
      form.append('requiredness', 'optional');
    }

    const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
    const token = localStorage.getItem('cpa_auth_token');
    const response = await fetch(`${baseUrl}${endpoint}`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      credentials: 'include',
      body: form,
    });
    if (!response.ok) {
      const body = await response.json().catch(() => ({})) as { error?: string; message?: string };
      throw new Error(body.message ?? body.error ?? `Upload failed (${response.status})`);
    }
  }

  if (manifestQuery.isLoading) {
    return (
      <div className="ml-[260px] flex min-h-screen items-center justify-center bg-[#F5F0E8]">
        <Loader2 size={30} className="animate-spin text-[#B8860B]" />
      </div>
    );
  }

  if (manifestQuery.error || !manifestQuery.data) {
    return (
      <div className="ml-[260px] flex min-h-screen items-center justify-center bg-[#F5F0E8] px-6">
        <div className="text-sm text-[#C44B2B]">
          {manifestQuery.error instanceof Error
            ? manifestQuery.error.message
            : 'Evidence data is unavailable.'}
        </div>
      </div>
    );
  }

  const manifest = manifestQuery.data;
  const reconsWithEvidence = manifest.reconEvidence.filter((group) => group.files.length > 0).length;
  const jesWithEvidence = manifest.jeEvidence.filter((group) => group.files.length > 0).length;

  return (
    <div className="ml-[260px] min-h-screen bg-[#F5F0E8] text-[#2C2416]">
      <input
        ref={fileInputRef}
        type="file"
        className="hidden"
        onChange={async (event) => {
          const file = event.target.files?.[0];
          const target = uploadTarget;
          event.target.value = '';
          if (!file || !target) return;
          setUploading(true);
          setUploadError(null);
          try {
            await uploadSelectedFile(file, target);
            await manifestQuery.refetch();
          } catch (error) {
            setUploadError(error instanceof Error ? error.message : 'Evidence upload failed');
          } finally {
            setUploading(false);
            setUploadTarget(null);
          }
        }}
      />

      <header className="border-b border-[#DDD5C2] bg-[#EDE6D6] px-8 py-6">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-medium">Evidence by Close Object</h1>
            <p className="mt-1 text-sm text-[#8B7A5E]">
              Attach evidence to a specific reconciliation or journal entry so its accounting assertion and audit lineage remain explicit.
            </p>
          </div>
          <Link
            href={`/close/${sessionId}/evidence-manifest`}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#DDD5C2] bg-[#F5F0E8] px-4 py-2 text-sm text-[#5C4F3A] hover:border-[#B8860B]"
          >
            View integrity manifest <ChevronRight size={15} />
          </Link>
        </div>
      </header>

      <main className="space-y-8 px-8 py-8">
        {uploadError && (
          <div className="flex items-start gap-2 rounded-lg border border-[#C44B2B]/30 bg-[#F5E4DE] p-4 text-sm text-[#C44B2B]">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" /> {uploadError}
          </div>
        )}
        {uploading && (
          <div className="flex items-center gap-2 rounded-lg border border-[#B8860B]/30 bg-[#F5EDD0] p-4 text-sm text-[#8B6914]">
            <Loader2 size={16} className="animate-spin" /> Hashing, storing, and linking the evidence file…
          </div>
        )}

        <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <StatCard label="Linked Files" value={manifest.totalFiles} icon={FileText} />
          <StatCard label="Recons With Evidence" value={`${reconsWithEvidence}/${manifest.reconEvidence.length}`} icon={Paperclip} />
          <StatCard label="JEs With Evidence" value={`${jesWithEvidence}/${manifest.jeEvidence.length}`} icon={ScrollText} />
          <StatCard label="Integrity Failures" value={manifest.hashVerification.failedFileCount} icon={AlertTriangle} />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[#8B7A5E]">Reconciliations</h2>
          <div className="overflow-hidden rounded-lg border border-[#DDD5C2] bg-[#EDE6D6]">
            {manifest.reconEvidence.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#8B7A5E]">No reconciliations exist for this close.</div>
            ) : manifest.reconEvidence.map((group) => (
              <div key={group.reconId} className="grid gap-4 border-t border-[#DDD5C2] p-4 first:border-t-0 lg:grid-cols-[220px_1fr_auto]">
                <div>
                  <div className="font-medium">Account {group.accountCode}</div>
                  <code className="text-[10px] text-[#8B7A5E]">{group.reconId}</code>
                </div>
                <FileList files={group.files} />
                <div className="flex items-start gap-2">
                  <Link href={`/close/${sessionId}/reconciliation/${group.reconId}`} className="rounded border border-[#DDD5C2] px-3 py-2 text-xs hover:border-[#B8860B]">
                    Open recon
                  </Link>
                  <button type="button" disabled={uploading} onClick={() => chooseFile({ kind: 'reconciliation', id: group.reconId })} className="inline-flex items-center gap-1.5 rounded bg-[#B8860B] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                    <Upload size={13} /> Attach
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section>
          <h2 className="mb-3 text-sm font-medium uppercase tracking-wide text-[#8B7A5E]">Journal Entries</h2>
          <div className="overflow-hidden rounded-lg border border-[#DDD5C2] bg-[#EDE6D6]">
            {manifest.jeEvidence.length === 0 ? (
              <div className="p-8 text-center text-sm text-[#8B7A5E]">No journal entries exist for this close.</div>
            ) : manifest.jeEvidence.map((group) => (
              <div key={group.jeId} className="grid gap-4 border-t border-[#DDD5C2] p-4 first:border-t-0 lg:grid-cols-[260px_1fr_auto]">
                <div>
                  <div className="font-medium">{group.memo || 'Journal entry'}</div>
                  <code className="text-[10px] text-[#8B7A5E]">{group.jeId}</code>
                </div>
                <FileList files={group.files} />
                <button type="button" disabled={uploading} onClick={() => chooseFile({ kind: 'journal_entry', id: group.jeId })} className="inline-flex h-fit items-center gap-1.5 rounded bg-[#B8860B] px-3 py-2 text-xs font-medium text-white disabled:opacity-50">
                  <Upload size={13} /> Attach
                </button>
              </div>
            ))}
          </div>
        </section>

        <div className="rounded-lg border border-[#DDD5C2] bg-[#EDE6D6] p-4 text-xs leading-relaxed text-[#5C4F3A]">
          Uploads are hashed before storage and linked to the selected accounting object. A green integrity result means Sabit later retrieved that stored file and reproduced the recorded SHA-256 hash; it does not mean the document's accounting contents were approved.
        </div>
      </main>
    </div>
  );
}
