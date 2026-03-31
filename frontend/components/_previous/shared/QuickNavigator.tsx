'use client';
import { useState, useEffect, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Search } from 'lucide-react';

interface NavOption {
  label: string;
  href: string;
  section: string;
}

// All navigable pages
function getNavOptions(sessionId: string | null): NavOption[] {
  const base = sessionId ? `/close/${sessionId}` : '';
  const options: NavOption[] = [
    { label: 'Portfolio', href: '/portfolio', section: 'Global' },
    { label: 'Settings', href: '/settings', section: 'Global' },
    { label: 'Close Sessions', href: '/close', section: 'Global' },
  ];
  if (sessionId) {
    options.push(
      { label: 'Dashboard', href: `${base}/dashboard`, section: 'Close Pipeline' },
      { label: 'Trial Balance', href: `${base}/trial-balance`, section: 'Close Pipeline' },
      { label: 'GL Quality Review', href: `${base}/gl-quality`, section: 'Close Pipeline' },
      { label: 'Account Mapping', href: `${base}/mapping`, section: 'Close Pipeline' },
      { label: 'Reconciliation', href: `${base}/reconciliation`, section: 'Close Pipeline' },
      { label: 'Adjustments', href: `${base}/adjustments`, section: 'Close Pipeline' },
      { label: 'Financial Statements', href: `${base}/statements`, section: 'Statements' },
      { label: 'Variance Analysis', href: `${base}/variance`, section: 'Statements' },
      { label: 'GL Health', href: `${base}/gl-health`, section: 'Statements' },
      { label: 'Discrepancies', href: `${base}/discrepancies`, section: 'Statements' },
      { label: 'Fixed Assets', href: `${base}/fixed-assets`, section: 'Modules' },
      { label: 'Deferred Tax', href: `${base}/deferred-tax`, section: 'Modules' },
      { label: 'Equity Compensation', href: `${base}/stock-compensation`, section: 'Modules' },
      { label: 'Impairment', href: `${base}/impairment`, section: 'Modules' },
      { label: 'Segments', href: `${base}/segments`, section: 'Modules' },
      { label: 'FX Translation', href: `${base}/fx-translation`, section: 'Modules' },
      { label: 'Consolidation', href: `${base}/consolidation`, section: 'Modules' },
      { label: 'AI Review', href: `${base}/ai-review`, section: 'Governance' },
      { label: 'Controls', href: `${base}/controls`, section: 'Governance' },
      { label: 'Checklist', href: `${base}/checklist`, section: 'Governance' },
      { label: 'Board Package', href: `${base}/board-package`, section: 'Governance' },
      { label: 'Review & Certify', href: `${base}/review`, section: 'Governance' },
      { label: 'Audit Trail', href: `${base}/audit-trail`, section: 'Governance' },
      { label: 'Audit Binder', href: `${base}/audit-binder`, section: 'Governance' },
    );
  }
  return options;
}

interface QuickNavigatorProps {
  open: boolean;
  onClose: () => void;
  sessionId?: string | null;
}

export function QuickNavigator({ open, onClose, sessionId }: QuickNavigatorProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState('');
  const [selectedIdx, setSelectedIdx] = useState(0);

  const options = useMemo(() => getNavOptions(sessionId ?? null), [sessionId]);
  const filtered = useMemo(() => {
    if (!query.trim()) return options;
    const q = query.toLowerCase();
    return options.filter(o => o.label.toLowerCase().includes(q) || o.section.toLowerCase().includes(q));
  }, [query, options]);

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    setSelectedIdx(0);
  }, [query]);

  const navigate = (href: string) => {
    router.push(href);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setSelectedIdx(i => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setSelectedIdx(i => Math.max(i - 1, 0));
    } else if (e.key === 'Enter' && filtered[selectedIdx]) {
      navigate(filtered[selectedIdx].href);
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] flex items-start justify-center pt-[20vh]" onClick={onClose}>
      <div className="absolute inset-0" style={{ background: 'rgba(0,0,0,0.5)' }} />
      <div
        className="relative w-full max-w-lg rounded-xl shadow-2xl overflow-hidden"
        style={{ background: 'var(--bg-surface)', borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4 py-3" style={{ borderBottomColor: 'var(--border-subtle)', borderBottomWidth: '1px', borderBottomStyle: 'solid' }}>
          <Search className="w-5 h-5 shrink-0" style={{ color: 'var(--text-tertiary)' }} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search pages..."
            className="flex-1 bg-transparent text-sm outline-none"
            style={{ color: 'var(--text-primary)' }}
          />
          <kbd className="px-1.5 py-0.5 rounded text-xs font-mono" style={{ background: 'var(--bg-surface-sunken)', color: 'var(--text-tertiary)' }}>ESC</kbd>
        </div>

        {/* Results */}
        <div className="max-h-[320px] overflow-y-auto py-1">
          {filtered.length === 0 ? (
            <p className="px-4 py-6 text-center text-sm" style={{ color: 'var(--text-tertiary)' }}>No pages match &quot;{query}&quot;</p>
          ) : (
            filtered.map((opt, i) => (
              <button
                key={opt.href}
                type="button"
                onClick={() => navigate(opt.href)}
                className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm transition-colors"
                style={{
                  background: i === selectedIdx ? 'var(--bg-surface-sunken)' : 'transparent',
                  color: 'var(--text-primary)',
                }}
                onMouseEnter={() => setSelectedIdx(i)}
              >
                <span className="flex-1">{opt.label}</span>
                <span className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{opt.section}</span>
              </button>
            ))
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 px-4 py-2 text-xs" style={{ borderTopColor: 'var(--border-subtle)', borderTopWidth: '1px', borderTopStyle: 'solid', color: 'var(--text-tertiary)' }}>
          <span><kbd className="px-1 py-0.5 rounded font-mono" style={{ background: 'var(--bg-surface-sunken)' }}>&#8593;&#8595;</kbd> navigate</span>
          <span><kbd className="px-1 py-0.5 rounded font-mono" style={{ background: 'var(--bg-surface-sunken)' }}>&#8629;</kbd> open</span>
          <span><kbd className="px-1 py-0.5 rounded font-mono" style={{ background: 'var(--bg-surface-sunken)' }}>esc</kbd> close</span>
        </div>
      </div>
    </div>
  );
}
