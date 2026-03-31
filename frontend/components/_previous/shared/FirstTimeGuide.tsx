'use client';
import { useState, useEffect } from 'react';
import { HelpCircle, X } from 'lucide-react';

interface FirstTimeGuideProps {
  featureKey: string;  // unique key like 'gl-upload', 'mapping', 'reconciliation', 'statements', 'certification'
  message: string;     // the tooltip text
  position?: 'top' | 'bottom' | 'left' | 'right';  // tooltip position, default 'bottom'
  children: React.ReactNode;  // the element to attach the tooltip to
}

function getStorageKey(featureKey: string): string {
  // Include user context if available -- but for simplicity, just use the feature key
  return `sabit-ftx-${featureKey}`;
}

export function FirstTimeGuide({ featureKey, message, position = 'bottom', children }: FirstTimeGuideProps) {
  const [dismissed, setDismissed] = useState(true); // default hidden, show only after mount check
  const [showTooltip, setShowTooltip] = useState(false);

  useEffect(() => {
    const key = getStorageKey(featureKey);
    const stored = localStorage.getItem(key);
    if (!stored) {
      setDismissed(false);
    }
  }, [featureKey]);

  const handleDismiss = () => {
    const key = getStorageKey(featureKey);
    localStorage.setItem(key, 'true');
    setDismissed(true);
    setShowTooltip(false);
  };

  if (dismissed) return <>{children}</>;

  return (
    <div className="relative inline-flex items-center gap-1.5">
      {children}
      <button
        type="button"
        onClick={() => setShowTooltip(!showTooltip)}
        className="shrink-0"
        style={{ color: 'var(--interactive-primary)' }}
        aria-label="Help"
      >
        <HelpCircle className="w-4 h-4" />
      </button>
      {showTooltip && (
        <div
          className={`absolute z-50 w-72 p-3 rounded-lg shadow-lg ${
            position === 'top' ? 'bottom-full mb-2' :
            position === 'left' ? 'right-full mr-2' :
            position === 'right' ? 'left-full ml-2' :
            'top-full mt-2'
          }`}
          style={{
            background: 'var(--bg-surface)',
            borderColor: 'var(--border-default)',
            borderWidth: '1px',
            borderStyle: 'solid',
          }}
        >
          <div className="flex items-start gap-2">
            <p className="text-xs leading-relaxed flex-1" style={{ color: 'var(--text-secondary)' }}>{message}</p>
            <button
              type="button"
              onClick={handleDismiss}
              className="shrink-0 mt-0.5"
              style={{ color: 'var(--text-tertiary)' }}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <button
            type="button"
            onClick={handleDismiss}
            className="mt-2 text-xs font-medium"
            style={{ color: 'var(--interactive-primary)' }}
          >
            Got it
          </button>
        </div>
      )}
    </div>
  );
}
