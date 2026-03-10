'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Shield,
  Search,
  CheckCircle2,
  XCircle,
  Link2,
  FileText,
  Key,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  AlertTriangle,
  Lock,
  Hash,
  ChevronRight,
} from 'lucide-react';
import {
  useCertificationArtifact,
  useVerifyCertification,
  useAuditChain,
  useEvidenceManifest,
  usePublicKey,
  type CertificationArtifact,
  type VerificationResult,
  type AuditChainResult,
  type EvidenceManifest,
} from '@/lib/queries/verification';

type VerifyTab = 'lookup' | 'chain' | 'evidence' | 'public-key';

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };
  return (
    <button type="button" onClick={handleCopy} className="p-1 text-gray-600 hover:text-gray-300 transition-colors" title="Copy">
      {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

function HashDisplay({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between bg-[#0d1017] rounded-lg px-3 py-2">
      <div className="min-w-0">
        <span className="text-[10px] text-gray-600 uppercase">{label}</span>
        <p className="text-xs font-mono text-gray-300 truncate">{value}</p>
      </div>
      <CopyButton text={value} />
    </div>
  );
}

function VerifyBadge({ valid }: { valid: boolean }) {
  return (
    <span className={cn(
      'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold',
      valid ? 'bg-emerald-500/10 text-emerald-400' : 'bg-red-500/10 text-red-400'
    )}>
      {valid ? <CheckCircle2 className="w-4 h-4" /> : <XCircle className="w-4 h-4" />}
      {valid ? 'VERIFIED' : 'FAILED'}
    </span>
  );
}

// --- Certificate Lookup Tab ---
function CertificateLookup() {
  const [sessionId, setSessionId] = useState('');
  const [searchId, setSearchId] = useState<string | null>(null);
  const { data: artifact, isLoading, error } = useCertificationArtifact(searchId);
  const verify = useVerifyCertification();

  const handleSearch = () => {
    if (sessionId.trim()) setSearchId(sessionId.trim());
  };

  const handleVerify = () => {
    if (searchId) {
      verify.mutate({ closeSessionId: searchId });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter close session ID or certification hash..."
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#0d1017] border border-[#262C48] text-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-[#7C5CFC]/50"
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={!sessionId.trim()}
          className="px-6 py-3 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] disabled:opacity-50 transition-colors"
        >
          Look Up
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 text-[#7C5CFC] animate-spin" />
        </div>
      )}

      {error && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-4 text-red-400 text-sm">
          Certificate not found or error occurred.
        </div>
      )}

      {artifact && (
        <div className="space-y-4">
          {/* Certification record */}
          <div className="bg-[#141829] border border-[#262C48] rounded-xl p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold text-white">Certification Record</h3>
              <VerifyBadge valid={artifact.verified} />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-[10px] text-gray-600 uppercase">Certified By</p>
                <p className="text-sm text-white">{artifact.certifiedBy}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase">Certified At</p>
                <p className="text-sm text-white">{new Date(artifact.certifiedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase">Session ID</p>
                <p className="text-xs text-gray-400 font-mono">{artifact.sessionId}</p>
              </div>
              <div>
                <p className="text-[10px] text-gray-600 uppercase">Artifact ID</p>
                <p className="text-xs text-gray-400 font-mono">{artifact.id}</p>
              </div>
            </div>

            <div className="space-y-2">
              <HashDisplay label="Ed25519 Signature" value={artifact.signature} />
              <HashDisplay label="SHA-256 Snapshot Hash" value={artifact.snapshotHash} />
              <HashDisplay label="Public Key" value={artifact.publicKey} />
            </div>

            {/* Validation checks */}
            {artifact.validationResults && artifact.validationResults.length > 0 && (
              <div className="mt-4">
                <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-2">Validation Checks</p>
                <div className="space-y-1">
                  {artifact.validationResults.map((v, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0d1017]">
                      {v.passed ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                      ) : (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0" />
                      )}
                      <span className="text-xs text-gray-300 flex-1">{v.check}</span>
                      <span className="text-[10px] text-gray-600">{v.detail}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Verify button */}
          <button
            type="button"
            onClick={handleVerify}
            disabled={verify.isPending}
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg border border-[#7C5CFC]/30 text-[#7C5CFC] text-sm font-medium hover:bg-[#7C5CFC]/10 disabled:opacity-50 transition-colors"
          >
            {verify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Run Independent Verification
          </button>

          {verify.isSuccess && verify.data && (
            <div className={cn(
              'rounded-xl p-4 border',
              verify.data.signatureValid ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
            )}>
              <div className="flex items-center gap-3 mb-3">
                {verify.data.signatureValid ? (
                  <CheckCircle2 className="w-5 h-5 text-emerald-400" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-400" />
                )}
                <span className={cn('text-sm font-semibold', verify.data.signatureValid ? 'text-emerald-400' : 'text-red-400')}>
                  {verify.data.signatureValid ? 'Signature Valid' : 'Signature Invalid'}
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  {verify.data.snapshotHashMatches ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                  <span className="text-gray-400">Snapshot hash {verify.data.snapshotHashMatches ? 'matches' : 'mismatch'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {verify.data.auditChainVerified ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" /> : <XCircle className="w-3.5 h-3.5 text-red-400" />}
                  <span className="text-gray-400">Audit chain {verify.data.auditChainVerified ? 'verified' : 'broken'}</span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// --- Chain Verification Tab ---
function ChainVerification() {
  const { data: chainResult, isLoading, error } = useAuditChain();

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-[#7C5CFC] animate-spin" /></div>;
  }

  if (error || !chainResult) {
    return <div className="text-sm text-gray-500 py-8 text-center">Unable to load audit chain status</div>;
  }

  const chain = chainResult.auditChain;
  const db = chainResult.dbEnforcement;

  return (
    <div className="space-y-4">
      {/* Chain status */}
      <div className={cn(
        'rounded-xl p-6 border',
        chain.verified ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
      )}>
        <div className="flex items-center gap-4 mb-4">
          {chain.verified ? (
            <div className="w-12 h-12 rounded-xl bg-emerald-500/10 flex items-center justify-center">
              <CheckCircle2 className="w-6 h-6 text-emerald-400" />
            </div>
          ) : (
            <div className="w-12 h-12 rounded-xl bg-red-500/10 flex items-center justify-center">
              <XCircle className="w-6 h-6 text-red-400" />
            </div>
          )}
          <div>
            <p className={cn('text-lg font-semibold', chain.verified ? 'text-emerald-400' : 'text-red-400')}>
              {chain.verified ? 'Audit Chain Intact' : 'Chain Integrity Broken'}
            </p>
            <p className="text-xs text-gray-500">
              {chain.entryCount} entries verified at {new Date(chain.verifiedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {chain.error && (
          <div className="bg-red-500/10 rounded-lg p-3 mt-3">
            <p className="text-xs text-red-400 font-mono">{chain.error.code}: {chain.error.message}</p>
            {chain.error.brokenAtEntryId && (
              <p className="text-[10px] text-gray-500 mt-1">Broken at entry: {chain.error.brokenAtEntryId}</p>
            )}
          </div>
        )}

        {/* Visual chain links */}
        <div className="flex items-center gap-1 mt-4 overflow-x-auto pb-2">
          {Array.from({ length: Math.min(chain.entryCount, 20) }).map((_, i) => {
            const isLast = i === Math.min(chain.entryCount, 20) - 1;
            const isBroken = !chain.verified && isLast;
            return (
              <div key={i} className="flex items-center">
                <div className={cn(
                  'w-6 h-6 rounded-md flex items-center justify-center text-[8px] font-mono',
                  isBroken ? 'bg-red-500/20 text-red-400 ring-1 ring-red-500/50' : 'bg-emerald-500/10 text-emerald-400'
                )}>
                  {isBroken ? <XCircle className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                </div>
                {!isLast && (
                  <div className={cn('w-3 h-px', isBroken ? 'bg-red-500/50' : 'bg-emerald-500/30')} />
                )}
              </div>
            );
          })}
          {chain.entryCount > 20 && (
            <span className="text-[9px] text-gray-600 ml-2">+{chain.entryCount - 20} more</span>
          )}
        </div>
      </div>

      {/* DB Enforcement */}
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5">
        <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Database Enforcement</p>
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0d1017]">
            {db.appendOnlyTrigger ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className="text-xs text-gray-300">Append-only trigger</span>
            <span className="text-[10px] text-gray-600 ml-auto">{db.appendOnlyTrigger ? 'Active' : 'Missing'}</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg bg-[#0d1017]">
            {db.snapshotImmutabilityTrigger ? <CheckCircle2 className="w-4 h-4 text-emerald-400" /> : <XCircle className="w-4 h-4 text-red-400" />}
            <span className="text-xs text-gray-300">Snapshot immutability trigger</span>
            <span className="text-[10px] text-gray-600 ml-auto">{db.snapshotImmutabilityTrigger ? 'Active' : 'Missing'}</span>
          </div>
        </div>
      </div>

      {chain.lastEntryHash && (
        <HashDisplay label="Last Entry Hash" value={chain.lastEntryHash} />
      )}
    </div>
  );
}

// --- Evidence Manifest Tab ---
function EvidenceManifestViewer() {
  const [snapshotId, setSnapshotId] = useState('');
  const [searchId, setSearchId] = useState<string | null>(null);
  const { data: manifest, isLoading } = useEvidenceManifest(searchId);

  const handleSearch = () => {
    if (snapshotId.trim()) setSearchId(snapshotId.trim());
  };

  return (
    <div className="space-y-4">
      <div className="flex gap-2">
        <div className="flex-1 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-600" />
          <input
            type="text"
            value={snapshotId}
            onChange={(e) => setSnapshotId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter snapshot ID..."
            className="w-full pl-10 pr-4 py-3 rounded-lg bg-[#0d1017] border border-[#262C48] text-sm text-white placeholder:text-gray-700 focus:outline-none focus:border-[#7C5CFC]/50"
          />
        </div>
        <button type="button" onClick={handleSearch} disabled={!snapshotId.trim()} className="px-6 py-3 rounded-lg bg-[#7C5CFC] text-white text-sm font-medium hover:bg-[#6B4FE0] disabled:opacity-50 transition-colors">
          Load Manifest
        </button>
      </div>

      {isLoading && <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-[#7C5CFC] animate-spin" /></div>}

      {manifest && (
        <div className="space-y-4">
          {!manifest.supported ? (
            <div className="bg-amber-500/5 border border-amber-500/20 rounded-xl p-4 text-amber-400 text-sm">
              {manifest.reason ?? 'Evidence manifest not available for this snapshot'}
            </div>
          ) : manifest.evidenceManifest && (
            <>
              <div className={cn(
                'rounded-xl p-5 border',
                manifest.evidenceManifest.matchesSnapshotBinding ? 'bg-emerald-500/5 border-emerald-500/20' : 'bg-red-500/5 border-red-500/20'
              )}>
                <div className="flex items-center gap-3 mb-3">
                  <VerifyBadge valid={manifest.evidenceManifest.matchesSnapshotBinding} />
                  <span className="text-sm text-gray-300">{manifest.evidenceManifest.entryCount} evidence entries</span>
                </div>
                <div className="space-y-2">
                  <HashDisplay label="Stored Manifest Hash" value={manifest.evidenceManifest.storedManifestHash} />
                  <HashDisplay label="Recomputed Hash" value={manifest.evidenceManifest.recomputedManifestHash} />
                </div>
              </div>

              {manifest.manifestDetails && manifest.manifestDetails.length > 0 && (
                <div className="bg-[#141829] border border-[#262C48] rounded-xl overflow-hidden">
                  <div className="px-4 py-3 border-b border-[#1e2235]">
                    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Evidence Entries</p>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {manifest.manifestDetails.map((entry, i) => (
                      <div key={i} className="flex items-center gap-3 px-4 py-2.5 border-b border-[#0d1017] last:border-0 text-xs">
                        <FileText className="w-3.5 h-3.5 text-gray-600 shrink-0" />
                        <span className="text-gray-400 font-mono truncate flex-1">{entry.evidenceId}</span>
                        <span className="text-[9px] text-gray-600 uppercase bg-[#0d1017] px-1.5 py-0.5 rounded">{entry.assertionType}</span>
                        <span className="text-[9px] text-gray-700 font-mono">{entry.hashSha256.slice(0, 12)}...</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

// --- Public Key Tab ---
function PublicKeyDisplay() {
  const { data: keyData, isLoading } = usePublicKey();

  if (isLoading) {
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 text-[#7C5CFC] animate-spin" /></div>;
  }

  if (!keyData) {
    return <div className="text-sm text-gray-500 py-8 text-center">Unable to load public key</div>;
  }

  return (
    <div className="space-y-4">
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-6">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-10 h-10 rounded-xl bg-[#7C5CFC]/10 flex items-center justify-center">
            <Key className="w-5 h-5 text-[#7C5CFC]" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-white">Verification Public Key</h3>
            <p className="text-[10px] text-gray-500">Use this key to independently verify any Sabit certification signature</p>
          </div>
        </div>

        <div className="bg-[#0d1017] rounded-lg p-4 font-mono text-xs text-gray-300 break-all leading-relaxed relative">
          {keyData.publicKey}
          <div className="absolute top-2 right-2">
            <CopyButton text={keyData.publicKey} />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5 text-gray-600" />
          <span className="text-[10px] text-gray-500">Algorithm: {keyData.algorithm ?? 'Ed25519'}</span>
        </div>
      </div>

      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-6">
        <h3 className="text-xs font-semibold text-white mb-3">How to Verify</h3>
        <div className="space-y-3 text-xs text-gray-400">
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[#7C5CFC]/10 flex items-center justify-center shrink-0 text-[10px] font-semibold text-[#7C5CFC]">1</span>
            <p>Look up the certification artifact using the session ID or hash</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[#7C5CFC]/10 flex items-center justify-center shrink-0 text-[10px] font-semibold text-[#7C5CFC]">2</span>
            <p>Extract the signature and snapshot hash from the artifact</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[#7C5CFC]/10 flex items-center justify-center shrink-0 text-[10px] font-semibold text-[#7C5CFC]">3</span>
            <p>Verify the Ed25519 signature against this public key using any standard cryptographic library</p>
          </div>
          <div className="flex items-start gap-3">
            <span className="w-5 h-5 rounded-full bg-[#7C5CFC]/10 flex items-center justify-center shrink-0 text-[10px] font-semibold text-[#7C5CFC]">4</span>
            <p>If the signature verifies, the financial statements have not been modified since certification</p>
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Main Page ---
export default function VerifyPage() {
  const [tab, setTab] = useState<VerifyTab>('lookup');

  const tabs: { id: VerifyTab; label: string; icon: typeof Shield }[] = [
    { id: 'lookup', label: 'Certificate Lookup', icon: Search },
    { id: 'chain', label: 'Chain Verification', icon: Link2 },
    { id: 'evidence', label: 'Evidence Manifest', icon: FileText },
    { id: 'public-key', label: 'Public Key', icon: Key },
  ];

  return (
    <div className="min-h-screen bg-[#0a0d14]">
      {/* Header */}
      <div className="border-b border-[#1e2235] bg-[#0d1017]">
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-4">
            <div className="w-12 h-12 rounded-2xl bg-[#7C5CFC]/10 flex items-center justify-center">
              <Shield className="w-6 h-6 text-[#7C5CFC]" />
            </div>
            <div>
              <h1 className="text-2xl font-semibold text-white">Sabit Verification Portal</h1>
              <p className="text-sm text-gray-500">Independently verify certified financial close packages</p>
            </div>
          </div>
          <p className="text-sm text-gray-400 leading-relaxed max-w-2xl">
            Every certified close in Sabit produces an immutable, cryptographically signed artifact.
            This portal allows auditors to independently verify that financial statements have not been
            modified since certification — without trusting Sabit or any third party. Verification
            uses Ed25519 digital signatures and SHA-256 hash chains.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div className="border-b border-[#1e2235] bg-[#0d1017]">
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center gap-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className={cn(
                    'flex items-center gap-2 px-4 py-3 text-sm font-medium border-b-2 transition-colors',
                    tab === t.id
                      ? 'border-[#7C5CFC] text-[#7C5CFC]'
                      : 'border-transparent text-gray-500 hover:text-gray-300'
                  )}
                >
                  <Icon className="w-4 h-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-4xl mx-auto px-6 py-8">
        {tab === 'lookup' && <CertificateLookup />}
        {tab === 'chain' && <ChainVerification />}
        {tab === 'evidence' && <EvidenceManifestViewer />}
        {tab === 'public-key' && <PublicKeyDisplay />}
      </div>

      {/* Footer */}
      <div className="border-t border-[#1e2235] bg-[#0d1017]">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4 text-gray-700" />
            <span className="text-[10px] text-gray-700 font-semibold uppercase tracking-widest">Sabit</span>
            <span className="text-[10px] text-gray-700">Verified Close Engine</span>
          </div>
          <span className="text-[10px] text-gray-700">Ed25519 + SHA-256 + Hash-Chained Audit Ledger</span>
        </div>
      </div>
    </div>
  );
}
