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

  const color = certified
    ? 'text-emerald-400 border-emerald-500/30 bg-emerald-500/5'
    : isHealthy
      ? 'text-sky-400 border-sky-500/30 bg-sky-500/5'
      : 'text-red-400 border-red-500/30 bg-red-500/5';

  const dotColor = certified
    ? 'bg-emerald-400'
    : isHealthy
      ? 'bg-sky-400'
      : 'bg-red-400';

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
        <div className="absolute top-full right-0 mt-2 w-80 bg-[#1a1d2e] border border-[#2a2d3e] rounded-xl shadow-2xl p-4 z-50 text-xs space-y-3">
          <div className="flex items-center gap-2 mb-2">
            <Icon className={cn('w-4 h-4', certified ? 'text-emerald-400' : isHealthy ? 'text-sky-400' : 'text-red-400')} />
            <span className="text-sm font-medium text-white">Integrity Status</span>
          </div>

          <div className="space-y-2">
            <div className="flex justify-between">
              <span className="text-gray-400">Hash Chain</span>
              <span className={isHealthy ? 'text-emerald-400' : 'text-red-400'}>
                {isHealthy ? 'Valid' : 'Broken'}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-gray-400">Ed25519 Signature</span>
              <span className={certified ? 'text-emerald-400' : 'text-gray-500'}>
                {certified ? 'Verified' : 'Not yet signed'}
              </span>
            </div>
          </div>

          {certified && (
            <>
              <div className="border-t border-[#2a2d3e] pt-2 space-y-1.5">
                {certifiedBy && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Certified by</span>
                    <span className="text-white">{certifiedBy}</span>
                  </div>
                )}
                {certifiedAt && (
                  <div className="flex justify-between">
                    <span className="text-gray-400">Date</span>
                    <span className="text-white">{new Date(certifiedAt).toLocaleDateString()}</span>
                  </div>
                )}
              </div>
              {snapshotHash && (
                <div className="border-t border-[#2a2d3e] pt-2">
                  <span className="text-gray-400 block mb-1">Snapshot Hash</span>
                  <code className="text-[10px] text-gray-300 font-mono break-all leading-relaxed">
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
