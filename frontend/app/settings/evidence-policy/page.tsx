'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { MoneyInput } from '@/components/shared/MoneyInput';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';

type EvidencePolicyResponse = {
  enforcementMode?: 'off' | 'warn_only' | 'hard_block';
  materialityThreshold?: string | null;
  requiredAssertionTypes?: Record<string, string[]> | null;
};

export default function EvidencePolicyPage() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['evidence-policy'],
    queryFn: () => apiFetch<EvidencePolicyResponse>('/api/close/evidence-policy'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: { enforcementMode: 'off' | 'warn_only' | 'hard_block'; materialityThreshold?: string }) =>
      apiFetch('/api/close/evidence-policy', { method: 'PUT', body: payload }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['evidence-policy'] }),
  });

  const [jeThreshold, setJeThreshold] = useState(data?.materialityThreshold ?? '');
  const [enforcementMode, setEnforcementMode] = useState<'off' | 'warn_only' | 'hard_block'>(data?.enforcementMode ?? 'off');
  const [reconEvidenceRequired, setReconEvidenceRequired] = useState(true);
  const [maxFileSizeMB, setMaxFileSizeMB] = useState('10');
  const [sha256Enabled, setSha256Enabled] = useState(true);
  const saved = updateMutation.isSuccess;

  useEffect(() => {
    if (data) {
      setJeThreshold(data.materialityThreshold ?? '');
      setEnforcementMode((data.enforcementMode as 'off' | 'warn_only' | 'hard_block') ?? 'off');
    }
  }, [data]);

  const handleSave = () => {
    const mode: 'off' | 'warn_only' | 'hard_block' = reconEvidenceRequired ? 'hard_block' : enforcementMode;
    updateMutation.mutate({
      enforcementMode: mode,
      materialityThreshold: jeThreshold || undefined,
    });
  };

  if (isLoading && !data) return <div className="text-text-secondary">Loading...</div>;

  return (
    <div className="max-w-2xl space-y-10">
      <div>
        <h1 className="text-2xl font-display text-primary">Evidence Policy</h1>
        <p className="text-text-secondary text-sm mt-1">When supporting documentation is required</p>
      </div>

      <p className="text-sm text-text-secondary">
        This policy applies to journal entries and reconciliations.{' '}
        <Link href="/close" className="text-accent hover:underline">View close sessions</Link>
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
