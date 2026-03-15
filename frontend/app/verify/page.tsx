'use client';

import { useState } from 'react';
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
  Lock,
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
import { HashDisplay } from '@/components/shared/HashDisplay';

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
    <button
      type="button"
      onClick={handleCopy}
      className="p-1 transition-colors"
      style={{ color: 'var(--text-tertiary)' }}
      title="Copy"
    >
      {copied ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} /> : <Copy className="w-3.5 h-3.5" />}
    </button>
  );
}

// HashDisplay imported from shared component

function VerifyBadge({ valid }: { valid: boolean }) {
  return (
    <span
      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold"
      style={{
        background: valid ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
        color: valid ? 'var(--status-success)' : 'var(--status-error)',
      }}
    >
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter close session ID or certification hash..."
            className="w-full pl-10 pr-4 py-3 rounded-lg text-sm focus:outline-none"
            style={{
              background: 'var(--bg-surface-sunken)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={!sessionId.trim()}
          className="px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          style={{ background: 'var(--interactive-primary)', color: 'var(--text-primary)' }}
        >
          Look Up
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--interactive-primary)' }} />
        </div>
      )}

      {error && (
        <div
          className="rounded-xl p-4 text-sm"
          style={{
            background: 'var(--status-error-bg)',
            borderWidth: '1px',
            borderStyle: 'solid',
            borderColor: 'var(--status-error-border)',
            color: 'var(--status-error)',
          }}
        >
          Certificate not found or error occurred.
        </div>
      )}

      {artifact && (
        <div className="space-y-4">
          {/* Certification record */}
          <div
            className="rounded-xl p-6"
            style={{
              background: 'var(--bg-surface)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--border-default)',
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Certification Record</h3>
              <VerifyBadge valid={artifact.verified} />
            </div>

            <div className="grid grid-cols-2 gap-4 mb-4">
              <div>
                <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Certified By</p>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{artifact.certifiedBy}</p>
              </div>
              <div>
                <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Certified At</p>
                <p className="text-sm" style={{ color: 'var(--text-primary)' }}>{new Date(artifact.certifiedAt).toLocaleString()}</p>
              </div>
              <div>
                <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Session ID</p>
                <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{artifact.sessionId}</p>
              </div>
              <div>
                <p className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>Artifact ID</p>
                <p className="text-xs font-mono" style={{ color: 'var(--text-secondary)' }}>{artifact.id}</p>
              </div>
            </div>

            <div className="space-y-2">
              <HashDisplay label="Ed25519 Signature" hash={artifact.signature} truncate={false} />
              <HashDisplay label="SHA-256 Snapshot Hash" hash={artifact.snapshotHash} truncate={false} />
              <HashDisplay label="Public Key" hash={artifact.publicKey} truncate={false} />
            </div>

            {/* Validation checks */}
            {artifact.validationResults && artifact.validationResults.length > 0 && (
              <div className="mt-4">
                <p className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-tertiary)' }}>Validation Checks</p>
                <div className="space-y-1">
                  {artifact.validationResults.map((v, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
                      {v.passed ? (
                        <CheckCircle2 className="w-4 h-4 shrink-0" style={{ color: 'var(--status-success)' }} />
                      ) : (
                        <XCircle className="w-4 h-4 shrink-0" style={{ color: 'var(--status-error)' }} />
                      )}
                      <span className="text-xs flex-1" style={{ color: 'var(--text-secondary)' }}>{v.check}</span>
                      <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{v.detail}</span>
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
            className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
            style={{
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--ai-border)',
              color: 'var(--interactive-primary)',
            }}
          >
            {verify.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Shield className="w-4 h-4" />}
            Run Independent Verification
          </button>

          {verify.isSuccess && verify.data && (
            <div
              className="rounded-xl p-4"
              style={{
                borderWidth: '1px',
                borderStyle: 'solid',
                background: verify.data.signatureValid ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                borderColor: verify.data.signatureValid ? 'var(--status-success-border)' : 'var(--status-error-border)',
              }}
            >
              <div className="flex items-center gap-3 mb-3">
                {verify.data.signatureValid ? (
                  <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--status-success)' }} />
                ) : (
                  <XCircle className="w-5 h-5" style={{ color: 'var(--status-error)' }} />
                )}
                <span
                  className="text-sm font-semibold"
                  style={{ color: verify.data.signatureValid ? 'var(--status-success)' : 'var(--status-error)' }}
                >
                  {verify.data.signatureValid ? 'Signature Valid' : 'Signature Invalid'}
                </span>
              </div>
              <div className="space-y-1 text-xs">
                <div className="flex items-center gap-2">
                  {verify.data.snapshotHashMatches
                    ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} />
                    : <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--status-error)' }} />}
                  <span style={{ color: 'var(--text-secondary)' }}>Snapshot hash {verify.data.snapshotHashMatches ? 'matches' : 'mismatch'}</span>
                </div>
                <div className="flex items-center gap-2">
                  {verify.data.auditChainVerified
                    ? <CheckCircle2 className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} />
                    : <XCircle className="w-3.5 h-3.5" style={{ color: 'var(--status-error)' }} />}
                  <span style={{ color: 'var(--text-secondary)' }}>Audit chain {verify.data.auditChainVerified ? 'verified' : 'broken'}</span>
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
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--interactive-primary)' }} /></div>;
  }

  if (error || !chainResult) {
    return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Unable to load audit chain status</div>;
  }

  const chain = chainResult.auditChain;
  const db = chainResult.dbEnforcement;

  return (
    <div className="space-y-4">
      {/* Chain status */}
      <div
        className="rounded-xl p-6"
        style={{
          borderWidth: '1px',
          borderStyle: 'solid',
          background: chain.verified ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
          borderColor: chain.verified ? 'var(--status-success-border)' : 'var(--status-error-border)',
        }}
      >
        <div className="flex items-center gap-4 mb-4">
          {chain.verified ? (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--status-success-bg)' }}
            >
              <CheckCircle2 className="w-6 h-6" style={{ color: 'var(--status-success)' }} />
            </div>
          ) : (
            <div
              className="w-12 h-12 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--status-error-bg)' }}
            >
              <XCircle className="w-6 h-6" style={{ color: 'var(--status-error)' }} />
            </div>
          )}
          <div>
            <p
              className="text-lg font-semibold"
              style={{ color: chain.verified ? 'var(--status-success)' : 'var(--status-error)' }}
            >
              {chain.verified ? 'Audit Chain Intact' : 'Chain Integrity Broken'}
            </p>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>
              {chain.entryCount} entries verified at {new Date(chain.verifiedAt).toLocaleString()}
            </p>
          </div>
        </div>

        {chain.error && (
          <div className="rounded-lg p-3 mt-3" style={{ background: 'var(--status-error-bg)' }}>
            <p className="text-xs font-mono" style={{ color: 'var(--status-error)' }}>{chain.error.code}: {chain.error.message}</p>
            {chain.error.brokenAtEntryId && (
              <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>Broken at entry: {chain.error.brokenAtEntryId}</p>
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
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-mono"
                  style={{
                    background: isBroken ? 'var(--status-error-bg)' : 'var(--status-success-bg)',
                    color: isBroken ? 'var(--status-error)' : 'var(--status-success)',
                    ...(isBroken ? { boxShadow: 'inset 0 0 0 1px var(--status-error-border)' } : {}),
                  }}
                >
                  {isBroken ? <XCircle className="w-3 h-3" /> : <Link2 className="w-3 h-3" />}
                </div>
                {!isLast && (
                  <div
                    className="w-3 h-px"
                    style={{ background: isBroken ? 'var(--status-error-border)' : 'var(--status-success-border)' }}
                  />
                )}
              </div>
            );
          })}
          {chain.entryCount > 20 && (
            <span className="text-xs ml-2" style={{ color: 'var(--text-tertiary)' }}>+{chain.entryCount - 20} more</span>
          )}
        </div>
      </div>

      {/* DB Enforcement */}
      <div
        className="rounded-xl p-5"
        style={{
          background: 'var(--bg-surface)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--border-default)',
        }}
      >
        <p className="text-xs font-semibold uppercase tracking-wider mb-3" style={{ color: 'var(--text-tertiary)' }}>Database Enforcement</p>
        <div className="space-y-2">
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
            {db.appendOnlyTrigger
              ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
              : <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />}
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Append-only trigger</span>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{db.appendOnlyTrigger ? 'Active' : 'Missing'}</span>
          </div>
          <div className="flex items-center gap-3 px-3 py-2 rounded-lg" style={{ background: 'var(--bg-surface-sunken)' }}>
            {db.snapshotImmutabilityTrigger
              ? <CheckCircle2 className="w-4 h-4" style={{ color: 'var(--status-success)' }} />
              : <XCircle className="w-4 h-4" style={{ color: 'var(--status-error)' }} />}
            <span className="text-xs" style={{ color: 'var(--text-secondary)' }}>Snapshot immutability trigger</span>
            <span className="text-xs ml-auto" style={{ color: 'var(--text-tertiary)' }}>{db.snapshotImmutabilityTrigger ? 'Active' : 'Missing'}</span>
          </div>
        </div>
      </div>

      {chain.lastEntryHash && (
        <HashDisplay label="Last Entry Hash" hash={chain.lastEntryHash} truncate={false} />
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
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
          <input
            type="text"
            value={snapshotId}
            onChange={(e) => setSnapshotId(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            placeholder="Enter snapshot ID..."
            className="w-full pl-10 pr-4 py-3 rounded-lg text-sm focus:outline-none"
            style={{
              background: 'var(--bg-surface-sunken)',
              borderWidth: '1px',
              borderStyle: 'solid',
              borderColor: 'var(--border-default)',
              color: 'var(--text-primary)',
            }}
          />
        </div>
        <button
          type="button"
          onClick={handleSearch}
          disabled={!snapshotId.trim()}
          className="px-6 py-3 rounded-lg text-sm font-medium disabled:opacity-50 transition-colors"
          style={{ background: 'var(--interactive-primary)', color: 'var(--text-primary)' }}
        >
          Load Manifest
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--interactive-primary)' }} />
        </div>
      )}

      {manifest && (
        <div className="space-y-4">
          {!manifest.supported ? (
            <div
              className="rounded-xl p-4 text-sm"
              style={{
                background: 'var(--status-warning-bg)',
                borderWidth: '1px',
                borderStyle: 'solid',
                borderColor: 'var(--status-warning-border)',
                color: 'var(--status-warning)',
              }}
            >
              {manifest.reason ?? 'Evidence manifest not available for this snapshot'}
            </div>
          ) : manifest.evidenceManifest && (
            <>
              <div
                className="rounded-xl p-5"
                style={{
                  borderWidth: '1px',
                  borderStyle: 'solid',
                  background: manifest.evidenceManifest.matchesSnapshotBinding ? 'var(--status-success-bg)' : 'var(--status-error-bg)',
                  borderColor: manifest.evidenceManifest.matchesSnapshotBinding ? 'var(--status-success-border)' : 'var(--status-error-border)',
                }}
              >
                <div className="flex items-center gap-3 mb-3">
                  <VerifyBadge valid={manifest.evidenceManifest.matchesSnapshotBinding} />
                  <span className="text-sm" style={{ color: 'var(--text-secondary)' }}>{manifest.evidenceManifest.entryCount} evidence entries</span>
                </div>
                <div className="space-y-2">
                  <HashDisplay label="Stored Manifest Hash" hash={manifest.evidenceManifest.storedManifestHash} truncate={false} />
                  <HashDisplay label="Recomputed Hash" hash={manifest.evidenceManifest.recomputedManifestHash} truncate={false} />
                </div>
              </div>

              {manifest.manifestDetails && manifest.manifestDetails.length > 0 && (
                <div
                  className="rounded-xl overflow-hidden"
                  style={{
                    background: 'var(--bg-surface)',
                    borderWidth: '1px',
                    borderStyle: 'solid',
                    borderColor: 'var(--border-default)',
                  }}
                >
                  <div
                    className="px-4 py-3"
                    style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--border-subtle)' }}
                  >
                    <p className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>Evidence Entries</p>
                  </div>
                  <div className="max-h-[300px] overflow-y-auto">
                    {manifest.manifestDetails.map((entry, i) => (
                      <div
                        key={i}
                        className="flex items-center gap-3 px-4 py-2.5 last:border-0 text-xs"
                        style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--bg-surface-sunken)' }}
                      >
                        <FileText className="w-3.5 h-3.5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
                        <span className="font-mono truncate flex-1" style={{ color: 'var(--text-secondary)' }}>{entry.evidenceId}</span>
                        <span
                          className="text-xs uppercase px-1.5 py-0.5 rounded"
                          style={{ color: 'var(--text-tertiary)', background: 'var(--bg-surface-sunken)' }}
                        >
                          {entry.assertionType}
                        </span>
                        <span className="text-xs font-mono" style={{ color: 'var(--text-tertiary)' }}>{entry.hashSha256.slice(0, 12)}...</span>
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
    return <div className="flex items-center justify-center py-12"><Loader2 className="w-6 h-6 animate-spin" style={{ color: 'var(--interactive-primary)' }} /></div>;
  }

  if (!keyData) {
    return <div className="text-sm py-8 text-center" style={{ color: 'var(--text-tertiary)' }}>Unable to load public key</div>;
  }

  return (
    <div className="space-y-4">
      <div
        className="rounded-xl p-6"
        style={{
          background: 'var(--bg-surface)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--border-default)',
        }}
      >
        <div className="flex items-center gap-3 mb-4">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--ai-bg)' }}
          >
            <Key className="w-5 h-5" style={{ color: 'var(--interactive-primary)' }} />
          </div>
          <div>
            <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Verification Public Key</h3>
            <p className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Use this key to independently verify any Sabit certification signature</p>
          </div>
        </div>

        <div
          className="rounded-lg p-4 font-mono text-xs break-all leading-relaxed relative"
          style={{ background: 'var(--bg-surface-sunken)', color: 'var(--text-secondary)' }}
        >
          {keyData.publicKey}
          <div className="absolute top-2 right-2">
            <CopyButton text={keyData.publicKey} />
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <Lock className="w-3.5 h-3.5" style={{ color: 'var(--text-tertiary)' }} />
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Algorithm: {keyData.algorithm ?? 'Ed25519'}</span>
        </div>
      </div>

      <div
        className="rounded-xl p-6"
        style={{
          background: 'var(--bg-surface)',
          borderWidth: '1px',
          borderStyle: 'solid',
          borderColor: 'var(--border-default)',
        }}
      >
        <h3 className="text-xs font-semibold mb-3" style={{ color: 'var(--text-primary)' }}>How to Verify</h3>
        <div className="space-y-3 text-xs" style={{ color: 'var(--text-secondary)' }}>
          <div className="flex items-start gap-3">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
              style={{ background: 'var(--ai-bg)', color: 'var(--interactive-primary)' }}
            >1</span>
            <p>Look up the certification artifact using the session ID or hash</p>
          </div>
          <div className="flex items-start gap-3">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
              style={{ background: 'var(--ai-bg)', color: 'var(--interactive-primary)' }}
            >2</span>
            <p>Extract the signature and snapshot hash from the artifact</p>
          </div>
          <div className="flex items-start gap-3">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
              style={{ background: 'var(--ai-bg)', color: 'var(--interactive-primary)' }}
            >3</span>
            <p>Verify the Ed25519 signature against this public key using any standard cryptographic library</p>
          </div>
          <div className="flex items-start gap-3">
            <span
              className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 text-xs font-semibold"
              style={{ background: 'var(--ai-bg)', color: 'var(--interactive-primary)' }}
            >4</span>
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
    <div className="min-h-screen" style={{ background: 'var(--bg-base)' }}>
      {/* Header */}
      <div style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--border-subtle)', background: 'var(--bg-surface-sunken)' }}>
        <div className="max-w-4xl mx-auto px-6 py-8">
          <div className="flex items-center gap-4 mb-4">
            <div
              className="w-12 h-12 rounded-2xl flex items-center justify-center"
              style={{ background: 'var(--ai-bg)' }}
            >
              <Shield className="w-6 h-6" style={{ color: 'var(--interactive-primary)' }} />
            </div>
            <div>
              <h1 className="text-2xl font-semibold" style={{ color: 'var(--text-primary)' }}>Sabit Verification Portal</h1>
              <p className="text-sm" style={{ color: 'var(--text-tertiary)' }}>Independently verify certified financial close packages</p>
            </div>
          </div>
          <p className="text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
            Every certified close in Sabit produces an immutable, cryptographically signed artifact.
            This portal allows auditors to independently verify that financial statements have not been
            modified since certification — without trusting Sabit or any third party. Verification
            uses Ed25519 digital signatures and SHA-256 hash chains.
          </p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ borderBottomWidth: '1px', borderBottomStyle: 'solid', borderBottomColor: 'var(--border-subtle)', background: 'var(--bg-surface-sunken)' }}>
        <div className="max-w-4xl mx-auto px-6">
          <div className="flex items-center gap-1">
            {tabs.map((t) => {
              const Icon = t.icon;
              const isActive = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setTab(t.id)}
                  className="flex items-center gap-2 px-4 py-3 text-sm font-medium transition-colors"
                  style={{
                    color: isActive ? 'var(--interactive-primary)' : 'var(--text-tertiary)',
                    borderBottomWidth: '2px',
                    borderBottomStyle: 'solid',
                    borderBottomColor: isActive ? 'var(--interactive-primary)' : 'transparent',
                  }}
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
      <div style={{ borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--border-subtle)', background: 'var(--bg-surface-sunken)' }}>
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-4 h-4" style={{ color: 'var(--text-tertiary)' }} />
            <span className="text-xs font-semibold uppercase tracking-widest" style={{ color: 'var(--text-tertiary)' }}>Sabit</span>
            <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Verified Close Engine</span>
          </div>
          <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>Ed25519 + SHA-256 + Hash-Chained Audit Ledger</span>
        </div>
      </div>
    </div>
  );
}
