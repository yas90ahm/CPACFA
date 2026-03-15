'use client';

import { useState, useCallback } from 'react';
import { cn } from '@/lib/utils';
import { Copy, Check, Shield, ExternalLink } from 'lucide-react';

export interface HashDisplayProps {
  hash: string;
  /** Optional label displayed above the hash (e.g. "Ed25519 Signature") */
  label?: string;
  truncate?: boolean;
  copyable?: boolean;
  verificationUrl?: string;
  verified?: boolean;
  showQR?: boolean;
  className?: string;
}

export function HashDisplay({
  hash,
  label,
  truncate = true,
  copyable = true,
  verificationUrl,
  verified,
  showQR = false,
  className,
}: HashDisplayProps) {
  const [copied, setCopied] = useState(false);

  const displayHash = truncate && hash.length > 16
    ? `${hash.slice(0, 8)}\u2026${hash.slice(-4)}`
    : hash;

  const handleCopy = useCallback(async () => {
    if (!copyable) return;
    try {
      await navigator.clipboard.writeText(hash);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      // Fallback
    }
  }, [hash, copyable]);

  if (label) {
    return (
      <div
        className={cn('flex items-center justify-between rounded-lg px-3 py-2', className)}
        style={{ background: 'var(--bg-surface-sunken)' }}
      >
        <div className="min-w-0">
          <span className="text-xs uppercase" style={{ color: 'var(--text-tertiary)' }}>{label}</span>
          <p className="text-xs font-mono truncate" style={{ color: 'var(--text-secondary)' }}>{hash}</p>
        </div>
        {copyable && (
          <button
            type="button"
            onClick={handleCopy}
            className="p-1 transition-colors flex-shrink-0"
            style={{ color: 'var(--text-tertiary)' }}
            aria-label="Copy hash"
            title="Copy"
          >
            {copied
              ? <Check className="w-3.5 h-3.5" style={{ color: 'var(--status-success)' }} />
              : <Copy className="w-3.5 h-3.5" />
            }
          </button>
        )}
      </div>
    );
  }

  return (
    <span
      className={cn('inline-flex items-center gap-1.5 group', className)}
      title={truncate ? hash : undefined}
    >
      {verified && (
        <Shield className="w-3.5 h-3.5 flex-shrink-0" style={{ color: 'var(--status-success)' }} />
      )}
      <code
        className="font-mono text-xs"
        style={{ color: 'var(--text-secondary)' }}
      >
        {displayHash}
      </code>
      {verified && (
        <span className="text-[0.6875rem] font-medium" style={{ color: 'var(--status-success)' }}>
          Verified
        </span>
      )}
      {copyable && (
        <button
          type="button"
          onClick={handleCopy}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
          aria-label="Copy hash"
        >
          {copied
            ? <Check className="w-3 h-3" style={{ color: 'var(--status-success)' }} />
            : <Copy className="w-3 h-3" style={{ color: 'var(--text-tertiary)' }} />
          }
        </button>
      )}
      {verificationUrl && (
        <a
          href={verificationUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-0.5 text-xs font-medium"
          style={{ color: 'var(--text-link)' }}
        >
          Verify <ExternalLink className="w-3 h-3" />
        </a>
      )}
    </span>
  );
}
