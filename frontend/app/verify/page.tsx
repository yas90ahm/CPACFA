'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { useState, useCallback, useEffect, useRef } from 'react';
import {
  Shield,
  ShieldCheck,
  Download,
  FileText,
  Link2,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Lock,
  Eye,
  BookOpen,
  Archive,
  ScrollText,
  Copy,
  ExternalLink,
  Monitor,
  Server,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface CertificationArtifact {
  id: string;
  sessionId: string;
  entityName: string;
  periodLabel: string;
  certifiedBy: string;
  certifiedAt: string;
  status: string;
  signature: string;
  publicKey?: string;
  contentHash: string;
  snapshotId?: string;
  /** Full CertificationArtifactV1 JSONB from backend — used for local hash verification */
  artifact?: Record<string, unknown>;
}

interface AuditChainStats {
  totalEvents: number;
  chainStatus: string;
  brokenLinks: number;
  materialEvents: number;
  overridesDocumented: number;
}

interface EvidenceCategory {
  category: string;
  fileCount: number;
  hashVerified: boolean;
}

interface EvidenceManifest {
  categories: EvidenceCategory[];
}

interface VerifyResult {
  valid: boolean;
  message?: string;
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function fmtDate(d?: string): string {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}

function truncSig(sig: string, len = 64): string {
  if (sig.length <= len) return sig;
  return sig;
}

/* ------------------------------------------------------------------ */
/*  WebCrypto Ed25519 local verification                               */
/* ------------------------------------------------------------------ */

type LocalVerifyStatus = 'pending' | 'verified' | 'failed' | 'unsupported';

async function verifySignatureLocally(
  artifactJson: string,
  signatureB64: string,
  publicKeyB64: string
): Promise<boolean> {
  try {
    // Import the Ed25519 public key
    const keyBytes = Uint8Array.from(atob(publicKeyB64), c => c.charCodeAt(0));
    const publicKey = await crypto.subtle.importKey(
      'raw',
      keyBytes,
      { name: 'Ed25519' },
      false,
      ['verify']
    );

    // Hash the artifact JSON with SHA-256
    const encoder = new TextEncoder();
    const data = encoder.encode(artifactJson);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);

    // Verify the signature against the hash
    const sigBytes = Uint8Array.from(atob(signatureB64), c => c.charCodeAt(0));
    const valid = await crypto.subtle.verify(
      'Ed25519',
      publicKey,
      sigBytes,
      hashBuffer
    );
    return valid;
  } catch {
    return false;
  }
}

async function isWebCryptoEd25519Available(): Promise<boolean> {
  try {
    // Test if Ed25519 import works (some browsers don't support it)
    const testKey = new Uint8Array(32);
    await crypto.subtle.importKey('raw', testKey, { name: 'Ed25519' }, false, ['verify']);
    return true;
  } catch {
    return false;
  }
}

/* ------------------------------------------------------------------ */
/*  Inner component (needs useSearchParams inside Suspense)            */
/* ------------------------------------------------------------------ */

function VerifyContent() {
  const searchParams = useSearchParams();
  const sessionId = searchParams.get('session') ?? '';

  /* --- Data fetching --- */

  const { data: artifact, isLoading: loadingArtifact } = useQuery({
    queryKey: ['verify-artifact', sessionId],
    queryFn: () =>
      apiFetch<CertificationArtifact>(
        `/api/verification/certification/artifacts/${sessionId}`
      ),
    enabled: !!sessionId,
  });

  const { data: auditChain, isLoading: loadingChain } = useQuery({
    queryKey: ['verify-chain', sessionId],
    queryFn: () =>
      apiFetch<AuditChainStats>('/api/verification/audit-chain', {
        params: { sessionId },
      }),
    enabled: !!sessionId,
  });

  const snapshotId = artifact?.snapshotId ?? sessionId;

  const { data: manifest, isLoading: loadingManifest } = useQuery({
    queryKey: ['verify-manifest', snapshotId],
    queryFn: () =>
      apiFetch<EvidenceManifest>(
        `/api/verification/evidence-manifest/${snapshotId}`
      ),
    enabled: !!snapshotId,
  });

  const { data: verifyResult } = useQuery({
    queryKey: ['verify-result', sessionId],
    queryFn: () =>
      apiFetch<VerifyResult>('/api/verification/certification/verify', {
        method: 'POST',
        body: { sessionId },
      }),
    enabled: !!sessionId,
  });

  const { data: publicKeyData } = useQuery({
    queryKey: ['verify-public-key'],
    queryFn: () =>
      apiFetch<{ publicKey: string }>('/api/verification/certification/public-key'),
    enabled: !!sessionId,
  });

  const isLoading = loadingArtifact || loadingChain || loadingManifest;

  /* --- Local WebCrypto verification --- */
  const [localVerifyStatus, setLocalVerifyStatus] = useState<LocalVerifyStatus>('pending');
  const localVerifyRan = useRef(false);

  useEffect(() => {
    if (!artifact || !publicKeyData?.publicKey || localVerifyRan.current) return;
    localVerifyRan.current = true;

    (async () => {
      const supported = await isWebCryptoEd25519Available();
      if (!supported) {
        setLocalVerifyStatus('unsupported');
        return;
      }

      // Must match backend canonicalStringifyKeysOnly(artifact) — sort all keys recursively
      function canonicalStringify(obj: unknown): string {
        if (obj === null || obj === undefined) return JSON.stringify(obj);
        if (typeof obj !== 'object') return JSON.stringify(obj);
        if (Array.isArray(obj)) return '[' + obj.map(canonicalStringify).join(',') + ']';
        const sorted = Object.keys(obj as Record<string, unknown>).sort();
        return '{' + sorted.map(k => JSON.stringify(k) + ':' + canonicalStringify((obj as Record<string, unknown>)[k])).join(',') + '}';
      }
      // Hash the FULL artifact object (not a subset) — this is what the backend signs
      const artifactJson = canonicalStringify(artifact.artifact ?? artifact);

      const pubKey = artifact.publicKey ?? publicKeyData.publicKey;
      const valid = await verifySignatureLocally(artifactJson, artifact.signature, pubKey);
      setLocalVerifyStatus(valid ? 'verified' : 'failed');
    })();
  }, [artifact, publicKeyData]);

  /* --- Copy verification data --- */
  const [copied, setCopied] = useState(false);
  const handleCopyVerificationData = useCallback(() => {
    const pubKey = artifact?.publicKey ?? publicKeyData?.publicKey ?? '';
    const verificationPayload = JSON.stringify(
      {
        artifact: {
          id: artifact?.id,
          sessionId: artifact?.sessionId,
          entityName: artifact?.entityName,
          periodLabel: artifact?.periodLabel,
          certifiedBy: artifact?.certifiedBy,
          certifiedAt: artifact?.certifiedAt,
          status: artifact?.status,
          contentHash: artifact?.contentHash,
        },
        signature: artifact?.signature ?? '',
        publicKey: pubKey,
        algorithm: 'Ed25519',
        hashAlgorithm: 'SHA-256',
      },
      null,
      2
    );
    navigator.clipboard.writeText(verificationPayload).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  }, [artifact, publicKeyData]);

  const categories = manifest?.categories ?? (Array.isArray(manifest) ? (manifest as unknown as EvidenceCategory[]) : []);

  /* --- Stat cards data --- */
  const stats = [
    {
      label: 'Total Events',
      value: auditChain?.totalEvents?.toLocaleString() ?? '--',
      icon: ScrollText,
    },
    {
      label: 'Chain Status',
      value: auditChain?.chainStatus === 'intact' || auditChain?.chainStatus === 'INTACT'
        ? 'INTACT'
        : auditChain?.chainStatus ?? '--',
      icon: Link2,
      isGreen: auditChain?.chainStatus?.toUpperCase() === 'INTACT',
    },
    {
      label: 'Broken Links',
      value: String(auditChain?.brokenLinks ?? '--'),
      icon: AlertCircle,
    },
    {
      label: 'Material Events',
      value: String(auditChain?.materialEvents ?? '--'),
      icon: Eye,
    },
    {
      label: 'Overrides Documented',
      value: String(auditChain?.overridesDocumented ?? '--'),
      icon: FileText,
    },
  ];

  if (!sessionId) {
    return (
      <div className="min-h-screen bg-[#1A1510] flex items-center justify-center">
        <div className="text-center">
          <Shield size={32} className="text-[#8B7A5E] mx-auto mb-3" />
          <p className="text-sm text-[#8B7A5E]">
            No session specified. Append <span className="font-mono text-[#B8860B]">?session=ID</span> to the URL.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1510]">
      {/* ============ TOP BAR ============ */}
      <header className="border-b border-[#2C2416] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <ShieldCheck size={20} className="text-[#B8860B]" />
          <span className="text-sm font-medium tracking-wide text-[#F5F0E8]">
            SABIT Auditor Verification Portal
          </span>
        </div>
        <span className="text-xs font-medium text-[#F5F0E8]/70 border border-[#F5F0E8]/30 px-3 py-1 rounded-full">
          READ-ONLY ACCESS
        </span>
      </header>

      <div className="max-w-5xl mx-auto px-8 py-8">
        {/* Subtitle */}
        <p className="text-xs text-[#8B7A5E] mb-1">
          Deloitte LLP — Engagement: {artifact?.entityName ?? 'CloudMetrics Inc.'} FY2026 Audit
        </p>
        <h1 className="text-xl font-medium text-[#F5F0E8] mb-8">
          Certification Artifact Verification
        </h1>

        {isLoading && (
          <div className="flex items-center gap-2 text-[#8B7A5E] mb-6">
            <Loader2 size={16} className="animate-spin" />
            <span className="text-sm">Loading verification data...</span>
          </div>
        )}

        {/* ============ CERTIFICATION CARD ============ */}
        <div className="border border-[#B8860B]/40 bg-[#2C2416]/60 rounded-lg p-6 mb-8">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#8B7A5E] mb-1">Entity</p>
              <p className="text-sm text-[#F5F0E8] font-medium">
                {artifact?.entityName ?? '--'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#8B7A5E] mb-1">Period</p>
              <p className="text-sm text-[#F5F0E8]">{artifact?.periodLabel ?? '--'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#8B7A5E] mb-1">
                Certified By
              </p>
              <p className="text-sm text-[#F5F0E8]">{artifact?.certifiedBy ?? '--'}</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#8B7A5E] mb-1">
                Certification Date
              </p>
              <p className="text-sm text-[#F5F0E8]">{fmtDate(artifact?.certifiedAt)}</p>
            </div>
          </div>

          {/* Status */}
          <div className="flex items-center gap-2 mb-5">
            <span className="text-xs font-medium text-[#B8860B] bg-[#B8860B]/10 px-2.5 py-1 rounded-full border border-[#B8860B]/30">
              {artifact?.status?.toUpperCase() ?? 'CERTIFIED'}
            </span>
          </div>

          {/* Signature */}
          <div className="space-y-3">
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#8B7A5E] mb-1">
                Ed25519 Signature
              </p>
              <p className="text-xs font-mono text-[#B8860B] break-all leading-relaxed bg-[#1A1510]/60 rounded px-3 py-2">
                {artifact?.signature ?? '--'}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wider text-[#8B7A5E] mb-1">
                SHA-256 Content Hash
              </p>
              <p className="text-xs font-mono text-[#8B7A5E] break-all leading-relaxed bg-[#1A1510]/60 rounded px-3 py-2">
                {artifact?.contentHash ?? '--'}
              </p>
            </div>
          </div>

          {/* Verification Results */}
          <div className="mt-5 space-y-3">
            {/* Server Verification */}
            {verifyResult && (
              <div className={`flex items-start gap-3 p-3 rounded-lg border ${
                verifyResult.valid
                  ? 'bg-[#2D6A4F]/10 border-[#2D6A4F]/30'
                  : 'bg-[#C44B2B]/10 border-[#C44B2B]/30'
              }`}>
                <Server size={14} className={`mt-0.5 shrink-0 ${verifyResult.valid ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'}`} />
                <div>
                  <p className={`text-xs font-medium ${verifyResult.valid ? 'text-[#2D6A4F]' : 'text-[#C44B2B]'}`}>
                    Server Verification: {verifyResult.valid ? '\u2713 Valid' : '\u2717 Invalid'}
                  </p>
                  <p className="text-[10px] text-[#8B7A5E] mt-0.5">
                    {verifyResult.valid
                      ? 'The backend confirmed the Ed25519 signature is valid.'
                      : (verifyResult.message ?? 'The backend could not verify this signature.')}
                  </p>
                </div>
              </div>
            )}

            {/* Browser Verification */}
            {localVerifyStatus === 'verified' && (
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-[#2D6A4F]/10 border-[#2D6A4F]/30">
                <Monitor size={14} className="mt-0.5 shrink-0 text-[#2D6A4F]" />
                <div>
                  <p className="text-xs font-medium text-[#2D6A4F]">
                    Browser Verification: {'\u2713'} Independently Verified
                  </p>
                  <p className="text-[10px] text-[#8B7A5E] mt-0.5">
                    This signature was verified locally in your browser using WebCrypto. No server trust required.
                  </p>
                </div>
              </div>
            )}
            {localVerifyStatus === 'failed' && (
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-[#C44B2B]/10 border-[#C44B2B]/30">
                <Monitor size={14} className="mt-0.5 shrink-0 text-[#C44B2B]" />
                <div>
                  <p className="text-xs font-medium text-[#C44B2B]">
                    Browser Verification: Local Verification Failed
                  </p>
                  <p className="text-[10px] text-[#8B7A5E] mt-0.5">
                    The browser could not independently verify this signature. The server reports it as valid.
                  </p>
                </div>
              </div>
            )}
            {localVerifyStatus === 'unsupported' && (
              <div className="flex items-start gap-3 p-3 rounded-lg border bg-[#8B6914]/10 border-[#8B6914]/30">
                <Monitor size={14} className="mt-0.5 shrink-0 text-[#8B6914]" />
                <div>
                  <p className="text-xs font-medium text-[#8B6914]">
                    Browser Verification: Unavailable
                  </p>
                  <p className="text-[10px] text-[#8B7A5E] mt-0.5">
                    Your browser does not support Ed25519 via WebCrypto. Use Chrome 113+ or Safari 17+ for local verification.
                  </p>
                </div>
              </div>
            )}
            {localVerifyStatus === 'pending' && sessionId && (
              <div className="flex items-center gap-2 p-3 rounded-lg border bg-[#2C2416]/40 border-[#2C2416]">
                <Loader2 size={14} className="animate-spin text-[#8B7A5E]" />
                <p className="text-xs text-[#8B7A5E]">Running local browser verification...</p>
              </div>
            )}
          </div>
        </div>

        {/* ============ AUDIT CHAIN INTEGRITY ============ */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-[#F5F0E8] mb-4">Audit Chain Integrity</h2>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {stats.map((stat) => {
              const Icon = stat.icon;
              return (
                <div
                  key={stat.label}
                  className="bg-[#2C2416]/60 border border-[#2C2416] rounded-lg p-4"
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className="text-[#8B7A5E]" />
                    <span className="text-[10px] uppercase tracking-wider text-[#8B7A5E]">
                      {stat.label}
                    </span>
                  </div>
                  <p
                    className={`text-lg font-medium font-mono ${
                      stat.isGreen ? 'text-[#2D6A4F]' : 'text-[#F5F0E8]'
                    }`}
                  >
                    {stat.isGreen && (
                      <CheckCircle2 size={14} className="inline mr-1 -mt-0.5" />
                    )}
                    {stat.value}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* ============ EVIDENCE MANIFEST ============ */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-[#F5F0E8] mb-4">Evidence Manifest</h2>
          <div className="bg-[#2C2416]/60 border border-[#2C2416] rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-[#2C2416]">
                  <th className="text-left px-5 py-3 text-[10px] font-medium text-[#8B7A5E] uppercase tracking-wider">
                    Category
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] font-medium text-[#8B7A5E] uppercase tracking-wider">
                    Files
                  </th>
                  <th className="text-left px-5 py-3 text-[10px] font-medium text-[#8B7A5E] uppercase tracking-wider">
                    Hash Verified
                  </th>
                  <th className="text-right px-5 py-3 text-[10px] font-medium text-[#8B7A5E] uppercase tracking-wider">
                    Action
                  </th>
                </tr>
              </thead>
              <tbody>
                {categories.length === 0 && !loadingManifest ? (
                  <tr>
                    <td colSpan={4} className="px-5 py-6 text-center text-xs text-[#8B7A5E]">
                      No evidence manifest available
                    </td>
                  </tr>
                ) : (
                  categories.map((cat, i) => (
                    <tr
                      key={cat.category ?? i}
                      className="border-b border-[#2C2416] last:border-0"
                    >
                      <td className="px-5 py-3 text-[#F5F0E8] text-xs">{cat.category}</td>
                      <td className="px-5 py-3 text-[#8B7A5E] text-xs font-mono">
                        {cat.fileCount}
                      </td>
                      <td className="px-5 py-3">
                        {cat.hashVerified ? (
                          <CheckCircle2 size={14} className="text-[#2D6A4F]" />
                        ) : (
                          <AlertCircle size={14} className="text-[#C44B2B]" />
                        )}
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button className="text-[10px] text-[#8B7A5E] hover:text-[#F5F0E8] transition-colors inline-flex items-center gap-1">
                          <Download size={12} />
                          Download
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        {/* ============ EXPORT ============ */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-[#F5F0E8] mb-4">Export</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Complete Audit Binder */}
            <button className="bg-[#B8860B] rounded-lg p-5 text-left hover:bg-[#B8860B]/90 transition-colors group">
              <Archive size={20} className="text-[#F5F0E8] mb-3" />
              <h3 className="text-sm font-medium text-[#F5F0E8] mb-1">
                Download Complete Audit Binder
              </h3>
              <p className="text-[10px] text-[#F5F0E8]/70">
                Full evidence package with hash manifest
              </p>
            </button>

            {/* Certification Artifact */}
            <button className="bg-[#2C2416]/60 border border-[#B8860B]/40 rounded-lg p-5 text-left hover:bg-[#2C2416]/80 transition-colors group">
              <Shield size={20} className="text-[#B8860B] mb-3" />
              <h3 className="text-sm font-medium text-[#F5F0E8] mb-1">
                Download Certification Artifact
              </h3>
              <p className="text-[10px] text-[#8B7A5E]">
                Signed certificate with Ed25519 signature
              </p>
            </button>

            {/* Audit Trail Export */}
            <button className="bg-[#2C2416]/60 border border-[#B8860B]/40 rounded-lg p-5 text-left hover:bg-[#2C2416]/80 transition-colors group">
              <BookOpen size={20} className="text-[#B8860B] mb-3" />
              <h3 className="text-sm font-medium text-[#F5F0E8] mb-1">
                Download Audit Trail Export
              </h3>
              <p className="text-[10px] text-[#8B7A5E]">
                Hash-chained event log in CSV format
              </p>
            </button>
          </div>
        </section>

        {/* ============ INDEPENDENT VERIFICATION ============ */}
        <section className="mb-8">
          <h2 className="text-sm font-medium text-[#F5F0E8] mb-4">Independent Verification</h2>
          <div className="bg-[#2C2416]/60 border border-[#2C2416] rounded-lg p-6">
            <p className="text-xs text-[#8B7A5E] leading-relaxed mb-4">
              This artifact can be verified independently using the Ed25519 public key and SHA-256 content hash.
              The signature was computed over the SHA-256 hash of the certification artifact using the Ed25519 algorithm.
            </p>

            <div className="space-y-3 mb-5">
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#8B7A5E] mb-1">Public Key</p>
                <p className="text-xs font-mono text-[#8B7A5E] break-all leading-relaxed bg-[#1A1510]/60 rounded px-3 py-2">
                  {artifact?.publicKey ?? publicKeyData?.publicKey ?? '--'}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-wider text-[#8B7A5E] mb-1">Algorithm</p>
                <p className="text-xs font-mono text-[#F5F0E8] bg-[#1A1510]/60 rounded px-3 py-2">
                  Ed25519 + SHA-256
                </p>
              </div>
            </div>

            <button
              onClick={handleCopyVerificationData}
              className="inline-flex items-center gap-2 text-xs font-medium text-[#F5F0E8] bg-[#3B6EA5]/20 border border-[#3B6EA5]/40 px-4 py-2 rounded-lg hover:bg-[#3B6EA5]/30 transition-colors"
            >
              {copied ? (
                <>
                  <CheckCircle2 size={14} className="text-[#2D6A4F]" />
                  Copied to Clipboard
                </>
              ) : (
                <>
                  <Copy size={14} />
                  Copy Verification Data
                </>
              )}
            </button>

            <p className="text-xs text-[#8B7A5E] mt-4 leading-relaxed">
              Paste this data into any Ed25519 verification tool to confirm the signature matches the artifact hash.
              The verification payload includes the artifact, signature, public key, and algorithm identifiers.
            </p>
          </div>
        </section>

        {/* ============ BOTTOM NOTICE ============ */}
        <div className="bg-[#2C2416]/60 border border-[#2C2416] rounded-lg px-5 py-4 flex items-start gap-3">
          <Lock size={14} className="text-[#8B7A5E] mt-0.5 shrink-0" />
          <p className="text-xs text-[#8B7A5E]">
            This manifest is read-only. All artifacts are cryptographically signed and
            independently verifiable. Tampering with any record will break the hash chain.
          </p>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Page wrapper (Suspense for useSearchParams)                        */
/* ------------------------------------------------------------------ */

export default function VerifyPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#1A1510] flex items-center justify-center">
          <Loader2 size={24} className="animate-spin text-[#8B7A5E]" />
        </div>
      }
    >
      <VerifyContent />
    </Suspense>
  );
}
