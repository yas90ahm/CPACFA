'use client';

import { Suspense, useCallback, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  AlertCircle,
  Archive,
  CheckCircle2,
  Copy,
  Download,
  FileJson,
  Link2,
  Loader2,
  Lock,
  Shield,
  ShieldCheck,
} from 'lucide-react';

interface CertificationArtifactEnvelope {
  contractVersion: 'v1';
  artifact: {
    artifactId: string;
    closeSessionId: string;
    periodLabel: string;
    certifiedBy: string | null;
    certifiedAt: string;
    mode: string;
    snapshot: {
      snapshotId: string;
      snapshotHash: string;
      hashVersion: string;
    };
  };
  artifactHash: string;
  signatureB64: string;
  publicKeyB64: string;
  alg: string;
}

interface ArtifactVerificationResponse {
  contractVersion: 'v1';
  artifactHash: string;
  signatureValid: boolean;
  hashVersion: string | null;
  hashVersionWarnings?: string[];
  snapshotHashMatches?: boolean;
  auditChainVerified?: boolean;
}

interface AuditChainResponse {
  contractVersion: 'v1';
  auditChain: {
    verified: boolean;
    entryCount: number;
    verifiedAt: string;
    lastEntryId: string | null;
    lastEntryHash: string | null;
    error?: { code: string; message: string; brokenAtEntryId?: string };
  };
  dbEnforcement: {
    appendOnlyTrigger: boolean;
    snapshotImmutabilityTrigger: boolean;
  };
}

interface EvidenceManifestResponse {
  contractVersion: 'v1';
  snapshotId: string;
  supported: boolean;
  reason?: string;
  evidenceManifest?: {
    entryCount: number;
    recomputedManifestHash: string;
    matchesSnapshotBinding: boolean;
  };
}

function formatDate(value?: string): string {
  if (!value) return '--';
  return new Date(value).toLocaleString('en-CA', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function VerificationRow({
  label,
  passed,
  unavailable = false,
}: {
  label: string;
  passed: boolean;
  unavailable?: boolean;
}) {
  const Icon = passed ? CheckCircle2 : AlertCircle;
  return (
    <div className="flex items-center justify-between gap-4 border-b border-[#3B2F1E] py-3 last:border-0">
      <span className="text-sm text-[#C4B89A]">{label}</span>
      <span className={`inline-flex items-center gap-1.5 text-xs font-medium ${
        passed ? 'text-[#2D6A4F]' : unavailable ? 'text-[#8B7A5E]' : 'text-[#C44B2B]'
      }`}>
        <Icon size={14} />
        {passed ? 'Verified' : unavailable ? 'Unavailable' : 'Failed'}
      </span>
    </div>
  );
}

async function downloadBlob(url: string, filename: string): Promise<void> {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const token = localStorage.getItem('cpa_auth_token');
  const response = await fetch(`${baseUrl}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!response.ok) throw new Error(`Export failed (${response.status})`);
  const blob = await response.blob();
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function downloadJson(value: unknown, filename: string): void {
  const blob = new Blob([JSON.stringify(value, null, 2)], { type: 'application/json' });
  const href = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = href;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(href);
}

function VerifyContent() {
  const sessionId = useSearchParams().get('session') ?? '';
  const [copied, setCopied] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const artifactQuery = useQuery({
    queryKey: ['verify-artifact', sessionId],
    queryFn: () =>
      apiFetch<CertificationArtifactEnvelope>(
        `/api/verification/certification/artifacts/${sessionId}`
      ),
    enabled: !!sessionId,
  });

  const chainQuery = useQuery({
    queryKey: ['verify-chain', sessionId],
    queryFn: () => apiFetch<AuditChainResponse>('/api/verification/audit-chain'),
    enabled: !!sessionId,
  });

  const artifact = artifactQuery.data;
  const verificationQuery = useQuery({
    queryKey: ['verify-artifact-result', artifact?.artifactHash],
    queryFn: () => {
      if (!artifact) throw new Error('Certification artifact unavailable');
      return apiFetch<ArtifactVerificationResponse>('/api/verification/certification/verify', {
        method: 'POST',
        body: {
          artifact: artifact.artifact,
          signatureB64: artifact.signatureB64,
          publicKeyB64: artifact.publicKeyB64,
        },
      });
    },
    enabled: !!artifact,
  });

  const snapshotId = artifact?.artifact.snapshot.snapshotId;
  const evidenceQuery = useQuery({
    queryKey: ['verify-evidence-manifest', snapshotId],
    queryFn: () =>
      apiFetch<EvidenceManifestResponse>(
        `/api/verification/evidence-manifest/${snapshotId}`
      ),
    enabled: !!snapshotId,
  });

  const copyVerificationData = useCallback(() => {
    if (!artifact) return;
    navigator.clipboard.writeText(JSON.stringify(artifact, null, 2)).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }, [artifact]);

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-[#1A1510] flex items-center justify-center px-6">
        <div className="text-center">
          <Shield size={32} className="mx-auto mb-3 text-[#8B7A5E]" />
          <p className="text-sm text-[#8B7A5E]">Select a certified close session to verify.</p>
        </div>
      </div>
    );
  }

  const isLoading = artifactQuery.isLoading || chainQuery.isLoading;
  const loadError = artifactQuery.error || chainQuery.error;
  const verification = verificationQuery.data;
  const chain = chainQuery.data;
  const evidence = evidenceQuery.data;

  return (
    <div className="min-h-screen bg-[#1A1510] text-[#F5F0E8]">
      <header className="flex items-center justify-between border-b border-[#2C2416] px-8 py-4">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-[#B8860B]" />
          <span className="text-sm font-medium tracking-wide">SABIT Verification</span>
        </div>
        <span className="rounded-full border border-[#F5F0E8]/30 px-3 py-1 text-xs text-[#F5F0E8]/70">
          READ ONLY
        </span>
      </header>

      <main className="mx-auto max-w-5xl px-8 py-8">
        <h1 className="mb-2 text-2xl font-medium">Certification Artifact Verification</h1>
        <p className="mb-8 text-sm text-[#8B7A5E]">Close session {sessionId}</p>

        {isLoading && (
          <div className="flex items-center gap-2 text-sm text-[#8B7A5E]">
            <Loader2 size={16} className="animate-spin" /> Loading persisted verification data…
          </div>
        )}
        {loadError && (
          <div className="mb-6 flex items-start gap-3 rounded-lg border border-[#C44B2B]/30 bg-[#C44B2B]/10 p-4 text-sm text-[#C44B2B]">
            <AlertCircle size={16} className="mt-0.5 shrink-0" />
            {(loadError as Error).message}
          </div>
        )}

        {artifact && (
          <>
            <section className="mb-8 rounded-lg border border-[#B8860B]/40 bg-[#2C2416]/60 p-6">
              <div className="grid gap-5 md:grid-cols-4">
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#8B7A5E]">Period</div>
                  <div className="mt-1 text-sm">{artifact.artifact.periodLabel}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#8B7A5E]">Certified by</div>
                  <div className="mt-1 text-sm">{artifact.artifact.certifiedBy ?? 'Not recorded'}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#8B7A5E]">Certified at</div>
                  <div className="mt-1 text-sm">{formatDate(artifact.artifact.certifiedAt)}</div>
                </div>
                <div>
                  <div className="text-[10px] uppercase tracking-wider text-[#8B7A5E]">Snapshot hash version</div>
                  <div className="mt-1 font-mono text-sm">{artifact.artifact.snapshot.hashVersion}</div>
                </div>
              </div>
              <div className="mt-6 space-y-4">
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-[#8B7A5E]">Artifact SHA-256</div>
                  <div className="break-all rounded bg-[#1A1510]/70 p-3 font-mono text-xs text-[#B8860B]">{artifact.artifactHash}</div>
                </div>
                <div>
                  <div className="mb-1 text-[10px] uppercase tracking-wider text-[#8B7A5E]">Ed25519 signature</div>
                  <div className="break-all rounded bg-[#1A1510]/70 p-3 font-mono text-xs text-[#C4B89A]">{artifact.signatureB64}</div>
                </div>
              </div>
            </section>

            <section className="mb-8 grid gap-6 md:grid-cols-2">
              <div className="rounded-lg border border-[#2C2416] bg-[#2C2416]/60 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <ShieldCheck size={16} className="text-[#B8860B]" /> Artifact checks
                </h2>
                {verificationQuery.isLoading ? (
                  <div className="flex items-center gap-2 py-3 text-sm text-[#8B7A5E]"><Loader2 size={14} className="animate-spin" /> Verifying…</div>
                ) : (
                  <>
                    <VerificationRow label="Ed25519 signature" passed={verification?.signatureValid === true} unavailable={!verification} />
                    <VerificationRow label="Snapshot hash binding" passed={verification?.snapshotHashMatches === true} unavailable={verification?.snapshotHashMatches == null} />
                    <VerificationRow label="Audit chain at verification" passed={verification?.auditChainVerified === true} unavailable={verification?.auditChainVerified == null} />
                  </>
                )}
              </div>

              <div className="rounded-lg border border-[#2C2416] bg-[#2C2416]/60 p-5">
                <h2 className="mb-3 flex items-center gap-2 text-sm font-medium">
                  <Link2 size={16} className="text-[#B8860B]" /> Audit-chain integrity
                </h2>
                <VerificationRow label="Hash chain" passed={chain?.auditChain.verified === true} unavailable={!chain} />
                <VerificationRow label="Append-only database triggers" passed={chain?.dbEnforcement.appendOnlyTrigger === true} unavailable={!chain} />
                <VerificationRow label="Snapshot immutability triggers" passed={chain?.dbEnforcement.snapshotImmutabilityTrigger === true} unavailable={!chain} />
                <div className="pt-3 text-xs text-[#8B7A5E]">
                  {chain ? `${chain.auditChain.entryCount} entries checked at ${formatDate(chain.auditChain.verifiedAt)}` : 'No chain result available.'}
                </div>
                {chain?.auditChain.error && <div className="mt-2 text-xs text-[#C44B2B]">{chain.auditChain.error.message}</div>}
              </div>
            </section>

            <section className="mb-8 rounded-lg border border-[#2C2416] bg-[#2C2416]/60 p-5">
              <h2 className="mb-3 text-sm font-medium">Evidence manifest binding</h2>
              {evidenceQuery.isLoading ? (
                <div className="flex items-center gap-2 text-sm text-[#8B7A5E]"><Loader2 size={14} className="animate-spin" /> Verifying manifest…</div>
              ) : evidence?.supported && evidence.evidenceManifest ? (
                <div className="grid gap-4 md:grid-cols-3">
                  <div><div className="text-[10px] uppercase text-[#8B7A5E]">Evidence links</div><div className="mt-1 font-mono">{evidence.evidenceManifest.entryCount}</div></div>
                  <div><div className="text-[10px] uppercase text-[#8B7A5E]">Snapshot binding</div><div className={`mt-1 text-sm ${evidence.evidenceManifest.matchesSnapshotBinding ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'}`}>{evidence.evidenceManifest.matchesSnapshotBinding ? 'Verified' : 'Failed'}</div></div>
                  <div><div className="text-[10px] uppercase text-[#8B7A5E]">Manifest SHA-256</div><div className="mt-1 break-all font-mono text-xs text-[#C4B89A]">{evidence.evidenceManifest.recomputedManifestHash}</div></div>
                </div>
              ) : (
                <div className="text-sm text-[#8B7A5E]">{evidence?.reason ?? 'Evidence-manifest verification is unavailable.'}</div>
              )}
            </section>

            <section className="mb-8 grid gap-4 md:grid-cols-3">
              <button
                type="button"
                onClick={() => downloadBlob(`/api/audit/binder/export/pdf?closeSessionId=${sessionId}`, `audit-binder-${sessionId}.pdf`).catch((error: Error) => setExportError(error.message))}
                className="rounded-lg bg-[#B8860B] p-5 text-left transition-colors hover:bg-[#A07608]"
              >
                <Archive size={20} className="mb-3" />
                <div className="text-sm font-medium">Download certified binder</div>
                <div className="mt-1 text-[10px] text-[#F5F0E8]/70">PDF generated from the certified snapshot</div>
              </button>
              <button
                type="button"
                onClick={() => downloadJson(artifact, `certification-artifact-${sessionId}.json`)}
                className="rounded-lg border border-[#B8860B]/40 bg-[#2C2416]/60 p-5 text-left"
              >
                <FileJson size={20} className="mb-3 text-[#B8860B]" />
                <div className="text-sm font-medium">Download artifact</div>
                <div className="mt-1 text-[10px] text-[#8B7A5E]">Signed JSON envelope and public key</div>
              </button>
              <button
                type="button"
                onClick={() => downloadBlob(`/api/audit/binder/export/csv?closeSessionId=${sessionId}`, `audit-binder-${sessionId}.csv`).catch((error: Error) => setExportError(error.message))}
                className="rounded-lg border border-[#B8860B]/40 bg-[#2C2416]/60 p-5 text-left"
              >
                <Download size={20} className="mb-3 text-[#B8860B]" />
                <div className="text-sm font-medium">Download binder CSV</div>
                <div className="mt-1 text-[10px] text-[#8B7A5E]">Machine-readable certified package</div>
              </button>
            </section>

            {exportError && <div className="mb-6 text-sm text-[#C44B2B]">{exportError}</div>}

            <section className="mb-8 rounded-lg border border-[#2C2416] bg-[#2C2416]/60 p-6">
              <h2 className="mb-3 text-sm font-medium">Independent verification data</h2>
              <div className="mb-4 break-all rounded bg-[#1A1510]/70 p-3 font-mono text-xs text-[#8B7A5E]">{artifact.publicKeyB64}</div>
              <button
                type="button"
                onClick={copyVerificationData}
                className="inline-flex items-center gap-2 rounded-lg border border-[#3B6EA5]/40 bg-[#3B6EA5]/20 px-4 py-2 text-xs font-medium"
              >
                {copied ? <CheckCircle2 size={14} className="text-[#2D6A4F]" /> : <Copy size={14} />}
                {copied ? 'Copied' : 'Copy signed envelope'}
              </button>
            </section>
          </>
        )}

        <div className="flex items-start gap-3 rounded-lg border border-[#2C2416] bg-[#2C2416]/60 px-5 py-4">
          <Lock size={14} className="mt-0.5 shrink-0 text-[#8B7A5E]" />
          <p className="text-xs text-[#8B7A5E]">This surface is read-only. It reports persisted verification outcomes and does not infer a passing result when data is absent.</p>
        </div>
      </main>
    </div>
  );
}

export default function VerifyPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-[#1A1510] flex items-center justify-center"><Loader2 size={24} className="animate-spin text-[#8B7A5E]" /></div>}>
      <VerifyContent />
    </Suspense>
  );
}
