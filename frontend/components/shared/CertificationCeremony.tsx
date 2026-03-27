'use client';

/**
 * CertificationCeremony — The product's climax.
 *
 * Design System Principle 2 (Ceremonial Security):
 *   The Certify moment must feel heavy — proportional to its legal/financial significance.
 *   Show: artifact hash, Ed25519 signature, certifier name, timestamp.
 *   "Certificate of Close" download, auditor verification link, acknowledgment required.
 *
 * Rule 3: Dark surface (#2C2416) appears ONLY here.
 * Rule 1: Gold (#B8860B) for all certified/verified elements.
 * Serif: Entity name only (the signed document feeling).
 */

import { useState } from 'react';
import { Lock, Download, ExternalLink, ShieldCheck, Hash, FileSignature } from 'lucide-react';

interface CertificationCeremonyProps {
  entityName: string;
  periodLabel: string;
  certifiedBy: string;
  certifiedAt: string;
  artifactHash: string;
  signatureB64: string;
  publicKeyB64: string;
  alg: string;
  snapshotHash?: string;
  gatesPassing?: number;
  gatesTotal?: number;
  /** Callback to download certificate PDF */
  onDownload?: () => void;
  /** Callback to open external verification */
  onVerify?: () => void;
  /** Callback when user acknowledges and dismisses */
  onAcknowledge: () => void;
}

export default function CertificationCeremony({
  entityName,
  periodLabel,
  certifiedBy,
  certifiedAt,
  artifactHash,
  signatureB64,
  publicKeyB64,
  alg,
  snapshotHash,
  gatesPassing,
  gatesTotal,
  onDownload,
  onVerify,
  onAcknowledge,
}: CertificationCeremonyProps) {
  const [acknowledged, setAcknowledged] = useState(false);

  const formattedDate = new Date(certifiedAt).toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
  const formattedTime = new Date(certifiedAt).toLocaleTimeString('en-US', {
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });

  return (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{
        backgroundColor: '#2C2416', /* ledger-900: the vault */
        zIndex: 'var(--z-modal)',
      }}
    >
      <div className="max-w-lg w-full mx-4 text-center space-y-8">
        {/* Lock icon */}
        <div className="flex justify-center">
          <div
            className="rounded-full p-4"
            style={{ backgroundColor: 'rgba(184, 134, 11, 0.12)' }}
          >
            <Lock size={32} style={{ color: '#B8860B' }} />
          </div>
        </div>

        {/* Certified badge */}
        <div className="space-y-1">
          <span
            className="type-badge inline-block px-3 py-1 rounded-sm"
            style={{
              color: '#B8860B',
              backgroundColor: '#F5EDD0',
              letterSpacing: '0.12em',
            }}
          >
            CERTIFIED
          </span>
        </div>

        {/* Entity name — the ONLY serif in the product */}
        <h1
          className="type-cert-title"
          style={{
            fontFamily: 'var(--font-serif)',
            color: '#F5F0E8', /* ledger-50 on dark */
            fontSize: '1.375rem',
            fontWeight: 500,
          }}
        >
          {entityName}
        </h1>

        {/* Period */}
        <p style={{ color: '#8B7A5E', fontSize: '0.8125rem' }}>
          {periodLabel}
        </p>

        {/* Certifier + timestamp */}
        <div className="space-y-1">
          <p style={{ color: '#DDD5C2', fontSize: '0.8125rem' }}>
            Certified by <span style={{ color: '#F5F0E8' }}>{certifiedBy}</span>
          </p>
          <p style={{ color: '#8B7A5E', fontSize: '0.75rem' }}>
            {formattedDate} at {formattedTime}
          </p>
        </div>

        {/* Cryptographic details */}
        <div
          className="rounded-lg p-4 space-y-3 text-left"
          style={{
            backgroundColor: 'rgba(245, 240, 232, 0.05)',
            border: '1px solid rgba(221, 213, 194, 0.15)',
          }}
        >
          {/* Artifact hash */}
          <div className="flex items-start gap-2">
            <Hash size={13} style={{ color: '#8B7A5E', marginTop: '2px' }} />
            <div>
              <p className="type-badge" style={{ color: '#8B7A5E', marginBottom: '2px' }}>
                ARTIFACT HASH
              </p>
              <p className="type-mono" style={{ color: '#DDD5C2', wordBreak: 'break-all' }}>
                {artifactHash.slice(0, 16)}...{artifactHash.slice(-16)}
              </p>
            </div>
          </div>

          {/* Signature */}
          <div className="flex items-start gap-2">
            <FileSignature size={13} style={{ color: '#8B7A5E', marginTop: '2px' }} />
            <div>
              <p className="type-badge" style={{ color: '#8B7A5E', marginBottom: '2px' }}>
                {alg.toUpperCase()} SIGNATURE
              </p>
              <p className="type-mono" style={{ color: '#DDD5C2', wordBreak: 'break-all' }}>
                {signatureB64.slice(0, 24)}...
              </p>
            </div>
          </div>

          {/* Snapshot hash */}
          {snapshotHash && (
            <div className="flex items-start gap-2">
              <ShieldCheck size={13} style={{ color: '#8B7A5E', marginTop: '2px' }} />
              <div>
                <p className="type-badge" style={{ color: '#8B7A5E', marginBottom: '2px' }}>
                  SNAPSHOT HASH
                </p>
                <p className="type-mono" style={{ color: '#DDD5C2', wordBreak: 'break-all' }}>
                  {snapshotHash.slice(0, 16)}...{snapshotHash.slice(-16)}
                </p>
              </div>
            </div>
          )}

          {/* Gates */}
          {gatesPassing != null && gatesTotal != null && (
            <div className="flex items-center gap-2 pt-1">
              <ShieldCheck size={13} style={{ color: '#2D6A4F' }} />
              <p style={{ color: '#DDD5C2', fontSize: '0.75rem' }}>
                {gatesPassing} of {gatesTotal} gates verified at certification
              </p>
            </div>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex flex-col gap-3">
          {/* Primary: Download Certificate */}
          {onDownload && (
            <button
              onClick={onDownload}
              className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-md font-medium transition-colors"
              style={{
                backgroundColor: '#B8860B',
                color: '#2C2416',
                fontSize: '0.8125rem',
              }}
            >
              <Download size={15} />
              Download Certificate of Close
            </button>
          )}

          {/* Ghost: Verify Independently */}
          {onVerify && (
            <button
              onClick={onVerify}
              className="flex items-center justify-center gap-2 w-full px-5 py-2.5 rounded-md font-medium transition-colors"
              style={{
                backgroundColor: 'transparent',
                color: '#DDD5C2',
                border: '1px solid #5C4F3A',
                fontSize: '0.8125rem',
              }}
            >
              <ExternalLink size={15} />
              Verify Independently
            </button>
          )}
        </div>

        {/* Acknowledgment checkbox */}
        <div className="pt-4">
          <label className="flex items-start gap-2 text-left cursor-pointer">
            <input
              type="checkbox"
              checked={acknowledged}
              onChange={(e) => setAcknowledged(e.target.checked)}
              className="mt-0.5 rounded"
              style={{ accentColor: '#B8860B' }}
            />
            <span style={{ color: '#8B7A5E', fontSize: '0.75rem', lineHeight: '1.5' }}>
              I acknowledge this certification represents a legal attestation that the financial
              statements for {periodLabel} are materially correct and have been prepared in
              accordance with applicable accounting standards.
            </span>
          </label>

          <button
            onClick={onAcknowledge}
            disabled={!acknowledged}
            className="mt-4 w-full px-5 py-2 rounded-md text-sm font-medium transition-opacity"
            style={{
              backgroundColor: acknowledged ? 'transparent' : 'transparent',
              color: acknowledged ? '#DDD5C2' : '#5C4F3A',
              border: `1px solid ${acknowledged ? '#5C4F3A' : '#3A3225'}`,
              opacity: acknowledged ? 1 : 0.5,
              cursor: acknowledged ? 'pointer' : 'not-allowed',
            }}
          >
            Dismiss
          </button>
        </div>
      </div>
    </div>
  );
}
