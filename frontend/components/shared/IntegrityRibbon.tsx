'use client';

import { useState } from 'react';
import { Shield, ShieldCheck, ShieldAlert } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface IntegrityRibbonProps {
  chainIntegrity: boolean | null;
  certified: boolean;
  certifiedBy?: string | null;
  certifiedAt?: string | null;
  snapshotHash?: string | null;
  signature?: string | null;
}

export function IntegrityRibbon({
  chainIntegrity,
  certified,
  certifiedBy,
  certifiedAt,
  snapshotHash,
  signature,
}: IntegrityRibbonProps) {
  const [hovered, setHovered] = useState(false);

  const isHealthy = chainIntegrity !== false;
  const Icon = certified ? ShieldCheck : isHealthy ? Shield : ShieldAlert;

  const label = certified
    ? 'Certified'
    : isHealthy
      ? 'Chain Verified'
      : 'Integrity Warning';

  /* Ledger Palette: gold=certified, forest=chain verified, rust=warning */
  const color = certified
    ? 'text-gold border-gold/30 bg-gold-bg'
    : isHealthy
      ? 'text-forest border-forest/30 bg-forest-bg'
      : 'text-rust border-rust/30 bg-rust-bg';

  const dotColor = certified
    ? 'bg-gold'
    : isHealthy
      ? 'bg-forest'
      : 'bg-rust';

  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        className={cn(
          'flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all',
          color
        )}
      >
        <span className={cn('w-1.5 h-1.5 rounded-full animate-pulse', dotColor)} />
        <Icon className="w-3.5 h-3.5" />
        <span>{label}</span>
      </button>

      {hovered && (
        <div className="absolute top-full right-0 mt-2 w-80 bg-ledger-100 border border-ledger-200 rounded-xl shadow-2xl p-4 z-50 text-xs space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Icon className={cn('w-4 h-4', certified ? 'text-gold' : isHealthy ? 'text-forest' : 'text-rust')} />
            <span className="text-sm font-medium text-ledger-900">Integrity Status</span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-ledger-400">Hash Chain</span>
              <span className={isHealthy ? 'text-forest' : 'text-rust'}>
                {isHealthy ? 'Valid' : 'Broken'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-ledger-400">Ed25519 Signature</span>
              <span className={certified ? 'text-gold' : 'text-ledger-400'}>
                {certified ? 'Verified' : 'Not yet signed'}
              </span>
            </div>
          </div>

          {certified && (
            <>
              <div className="border-t border-ledger-200 pt-2 space-y-1.5">
                {certifiedBy && (
                  <div className="flex justify-between">
                    <span className="text-ledger-400">Certified by</span>
                    <span className="text-ledger-900">{certifiedBy}</span>
                  </div>
                )}
                {certifiedAt && (
                  <div className="flex justify-between">
                    <span className="text-ledger-400">Date</span>
                    <span className="text-ledger-900">{new Date(certifiedAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
              {snapshotHash && (
                <div className="border-t border-ledger-200 pt-2">
                  <span className="text-ledger-400 block mb-1">Snapshot Hash</span>
                  <code className="text-xs text-ledger-600 font-mono break-all leading-relaxed">
                    {snapshotHash}
                  </code>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
