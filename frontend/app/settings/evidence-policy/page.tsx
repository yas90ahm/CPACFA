'use client';

import { useState } from 'react';
import Link from 'next/link';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { mockEvidencePolicy } from '@/lib/mock/evidence-policy';
import { cn } from '@/lib/utils';

const ACTIVE_SESSION_ID = 'c925645f-3831-4d81-93a9-a12a2819cd3e';

export default function EvidencePolicyPage() {
  const [jeThreshold, setJeThreshold] = useState(mockEvidencePolicy.jeThreshold);
  const [reconEvidenceRequired, setReconEvidenceRequired] = useState(mockEvidencePolicy.reconEvidenceRequired);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState(String(mockEvidencePolicy.maxFileSizeMB));
  const [sha256Enabled, setSha256Enabled] = useState(mockEvidencePolicy.sha256Enabled);
  const [saved, setSaved] = useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-display text-primary">Evidence Policy</h1>
        <p className="text-text-secondary text-sm mt-1">When supporting documentation is required</p>
      </div>

      <p className="text-sm text-text-secondary">
        This policy applies to journal entries and reconciliations.{' '}
        <Link href={`/close/${ACTIVE_SESSION_ID}/adjustments`} className="text-accent hover:underline">View current adjustments</Link>
      </p>

      <section className="space-y-6">
        <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">Journal Entry Evidence Threshold</h2>
        <MoneyInput label="Threshold" value={jeThreshold} onChange={(v) => setJeThreshold(v ?? '')} />
        <p className="text-xs text-text-tertiary">
          Journal entries with total debits at or above this amount require supporting documentation. Entries below require only a memo.
        </p>
      </section>

      <section className="space-y-4">
        <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">Reconciliation Evidence</h2>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={reconEvidenceRequired} onChange={(e) => setReconEvidenceRequired(e.target.checked)} />
          Always require at least one supporting document for reconciliation completion
        </label>
      </section>

      <section className="space-y-6">
        <h2 className="text-sm font-medium text-text-secondary uppercase tracking-wide">Evidence File Settings</h2>
        <div>
          <label className="block text-xs font-medium text-text-secondary mb-1">Maximum file size (MB)</label>
          <input type="number" min={1} value={maxFileSizeMB} onChange={(e) => setMaxFileSizeMB(e.target.value)} className="w-24 rounded-input border border-border bg-input px-3 py-2 text-sm" />
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={sha256Enabled} onChange={(e) => setSha256Enabled(e.target.checked)} />
          Compute and store SHA-256 hash for every uploaded file
        </label>
      </section>

      <button type="button" onClick={handleSave} className={cn('px-4 py-2 rounded-input text-sm font-medium', saved ? 'bg-status-green text-white' : 'bg-accent text-accent-contrast')}>
        {saved ? 'Saved' : 'Save Policy'}
      </button>
    </div>
  );
}
