'use client';

import { useState } from 'react';
import { Check, Download, FileText, FileDown, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { apiFetch } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import type { CertificationArtifact } from '@/lib/types/certification';

export interface CertificationRecordProps {
  artifact: CertificationArtifact;
  entityName?: string;
  periodLabel?: string;
}

export function CertificationRecord({ artifact, entityName, periodLabel }: CertificationRecordProps) {
  const { getAuthToken } = useAuth();
  const [expandedHash, setExpandedHash] = useState(false);
  const [expandedKey, setExpandedKey] = useState(false);
  const [verifyResult, setVerifyResult] = useState<boolean | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingJson, setExportingJson] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString('en-US', { month: 'long', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit', timeZoneName: 'short' });
  };

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await apiFetch<{ valid: boolean }>('/api/verification/certification/verify', {
        method: 'POST',
        body: { artifactId: artifact.id, sessionId: artifact.sessionId },
      });
      setVerifyResult(res.valid);
    } catch {
      setVerifyResult(false);
    } finally {
      setVerifying(false);
    }
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

  const handleExportBinderPdf = async () => {
    setExportingPdf(true);
    setExportError(null);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(
        `${baseUrl}/api/audit/binder/export/pdf?closeSessionId=${artifact.sessionId}`,
        { headers }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error((err as { error?: string }).error || 'PDF export failed');
      }
      const contentType = res.headers.get('content-type') ?? '';
      if (!contentType.includes('application/pdf')) {
        throw new Error('Server did not return a valid PDF');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Audit_Binder_${artifact.sessionId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'PDF export failed');
    } finally {
      setExportingPdf(false);
    }
  };

  const handleExportBinderJson = async () => {
    setExportingJson(true);
    setExportError(null);
    try {
      const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
      const token = getAuthToken();
      const headers: Record<string, string> = {};
      if (token) headers['Authorization'] = `Bearer ${token}`;
      const res = await fetch(
        `${baseUrl}/api/audit/binder?closeSessionId=${artifact.sessionId}`,
        { headers }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error((err as { error?: string }).error || 'JSON export failed');
      }
      const data = await res.json();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Audit_Binder_${artifact.sessionId}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (err) {
      setExportError(err instanceof Error ? err.message : 'JSON export failed');
    } finally {
      setExportingJson(false);
    }
  };

  return (
    <div className="bg-surface border-2 border-certified rounded-card p-6 space-y-6">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-certified-dim flex items-center justify-center">
          <Check className="w-6 h-6 text-certified" />
        </div>
        <h2 className="text-xl font-display text-certified">CERTIFIED</h2>
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
          disabled={verifying}
          className="px-4 py-2 rounded-input border border-border text-sm hover:bg-hover disabled:opacity-50"
        >
          {verifying ? 'Verifying...' : 'Verify Independently'}
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

      <div className="border-t border-border-light pt-4">
        <h3 className="text-sm font-medium text-text-secondary mb-3">Audit Binder Export</h3>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={handleExportBinderPdf}
            disabled={exportingPdf}
            className="px-4 py-2 rounded-input bg-accent text-white text-sm hover:bg-accent/90 disabled:opacity-50 flex items-center gap-2"
          >
            {exportingPdf ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
            {exportingPdf ? 'Exporting...' : 'Export PDF'}
          </button>
          <button
            type="button"
            onClick={handleExportBinderJson}
            disabled={exportingJson}
            className="px-4 py-2 rounded-input border border-border text-sm hover:bg-hover disabled:opacity-50 flex items-center gap-2"
          >
            {exportingJson ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
            {exportingJson ? 'Exporting...' : 'Export JSON'}
          </button>
        </div>
        {exportError && (
          <div className="mt-2 p-2 rounded-input bg-status-red-dim text-status-red text-sm">
            {exportError}
          </div>
        )}
      </div>
    </div>
  );
}
