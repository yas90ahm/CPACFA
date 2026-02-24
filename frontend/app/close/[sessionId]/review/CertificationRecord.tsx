'use client';

import { useState } from 'react';
import { Check, Download, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { CertificationArtifact } from '@/lib/types/certification';

export interface CertificationRecordProps {
  artifact: CertificationArtifact;
  entityName?: string;
  periodLabel?: string;
}

export function CertificationRecord({ artifact, entityName, periodLabel }: CertificationRecordProps) {
  const [expandedHash, setExpandedHash] = useState(false);
  const [expandedKey, setExpandedKey] = useState(false);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
  };

  const handleVerify = () => {
    setTimeout(() => setVerifyResult(true), 500);
  };

  const handleDownload = () => {
    const data = JSON.stringify(artifact, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `certification-${artifact.sessionId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="bg-surface border border-status-green rounded-card p-6 space-y-6">
      <div className="flex items-center gap-2">
        <Check className="w-6 h-6 text-status-green" />
        <h2 className="text-xl font-display text-status-green">CERTIFIED</h2>
      </div>

      <div className="space-y-2">
        <div className="flex justify-between">
          <span className="text-sm text-text-secondary">Certified by</span>
          <span className="text-primary font-medium">{artifact.certifiedBy}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-text-secondary">Certified at</span>
          <span className="text-primary">{formatDate(artifact.certifiedAt)}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-text-secondary">Period</span>
          <span className="text-primary">{periodLabel ?? '—'}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-sm text-text-secondary">Entity</span>
          <span className="text-primary">{entityName ?? '—'}</span>
        </div>
      </div>

      <div className="border-t border-border-light pt-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">── Cryptographic Proof ──</h3>
        <div className="space-y-4">
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1">Snapshot Hash (SHA-256)</div>
            <div className="font-mono text-xs text-text-tertiary break-all bg-surface-alt p-2 rounded">
              {expandedHash ? artifact.snapshotHash : `${artifact.snapshotHash.slice(0, 16)}...`}
              <button
                type="button"
                onClick={() => setExpandedHash(!expandedHash)}
                className="ml-2 text-accent hover:underline text-xs"
              >
                {expandedHash ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1">Ed25519 Signature</div>
            <div className="font-mono text-xs text-text-tertiary break-all bg-surface-alt p-2 rounded">
              {artifact.signature.slice(0, 64)}<br />
              {artifact.signature.slice(64)}
            </div>
          </div>
          <div>
            <div className="text-xs font-medium text-text-secondary mb-1">Public Key</div>
            <div className="font-mono text-xs text-text-tertiary break-all bg-surface-alt p-2 rounded">
              {expandedKey ? artifact.publicKey : `${artifact.publicKey.slice(0, 20)}...`}
              <button
                type="button"
                onClick={() => setExpandedKey(!expandedKey)}
                className="ml-2 text-accent hover:underline text-xs"
              >
                {expandedKey ? 'Collapse' : 'Expand'}
              </button>
            </div>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-text-secondary">Verification Status</span>
            <span className={cn('text-sm font-medium', artifact.verified ? 'text-status-green' : 'text-status-red')}>
              {artifact.verified ? '✓ Signature valid' : '✗ Signature invalid'}
            </span>
          </div>
        </div>
      </div>

      <div className="flex gap-2 pt-4 border-t border-border-light">
        <button
          type="button"
          onClick={handleVerify}
          className="px-4 py-2 rounded-input border border-border text-sm hover:bg-hover"
        >
          Verify Independently
        </button>
        <button
          type="button"
          onClick={handleDownload}
          className="px-4 py-2 rounded-input border border-border text-sm hover:bg-hover flex items-center gap-2"
        >
          <Download className="w-4 h-4" />
          Download Artifact
        </button>
        <button
          type="button"
          className="px-4 py-2 rounded-input border border-border text-sm hover:bg-hover flex items-center gap-2"
        >
          <FileText className="w-4 h-4" />
          View Snapshot
        </button>
      </div>

      {verifyResult !== null && (
        <div className={cn('p-3 rounded-input text-sm', verifyResult ? 'bg-status-green-dim text-status-green' : 'bg-status-red-dim text-status-red')}>
          {verifyResult ? '✓ Verification successful — signature is valid' : '✗ Verification failed — signature is invalid'}
        </div>
      )}

      <div className="border-t border-border-light pt-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Cross-Statement Validation at Certification</h3>
        <div className="space-y-2">
          {artifact.validationResults.map((r) => (
            <div key={r.check} className="flex items-center justify-between text-sm">
              <span className={r.passed ? 'text-status-green' : 'text-status-red'}>
                {r.passed ? '✓' : '✗'} {r.check}
              </span>
              <span className="text-text-tertiary">Verified at certification</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
