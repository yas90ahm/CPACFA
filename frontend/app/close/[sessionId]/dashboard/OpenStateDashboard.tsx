'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { FileUploadZone } from '@/components/shared/FileUploadZone';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { GLUploadFlow } from './GLUploadFlow';
import { TBUploadFlow } from './TBUploadFlow';
import { apiFetch } from '@/lib/api';

export interface OpenStateDashboardProps {
  sessionId: string;
  periodLabel: string;
  entityName: string;
}

const PRIOR_PERIOD_SESSION_ID = 'c925645f-3831-4d81-93a9-a12a2819cd3e';

export function OpenStateDashboard({ sessionId, periodLabel, entityName }: OpenStateDashboardProps) {
  const { data: connections } = useQuery({
    queryKey: ['erp-connections'],
    queryFn: () => apiFetch<Array<{ id: string; name?: string }>>('/api/accounting-integration/connections'),
  });
  const erpConnected = (connections?.length ?? 0) > 0;
  const [glFile, setGlFile] = useState<File | null>(null);
  const [tbFile, setTbFile] = useState<File | null>(null);
  const [showTBUpload, setShowTBUpload] = useState(false);

  if (glFile) {
    return (
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-display text-primary">
            {periodLabel} — {entityName}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Status: <StatusBadge variant="neutral" label="OPEN" />
          </p>
        </div>
        <GLUploadFlow sessionId={sessionId} periodLabel={periodLabel} file={glFile} onBack={() => setGlFile(null)} />
      </div>
    );
  }

  if (tbFile) {
    return (
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-display text-primary">
            {periodLabel} — {entityName}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Status: <StatusBadge variant="neutral" label="OPEN" />
          </p>
        </div>
        <TBUploadFlow sessionId={sessionId} file={tbFile} onBack={() => setTbFile(null)} />
      </div>
    );
  }

  if (showTBUpload) {
    return (
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-display text-primary">
            {periodLabel} — {entityName}
          </h1>
          <p className="text-text-secondary text-sm mt-1">
            Status: <StatusBadge variant="neutral" label="OPEN" />
          </p>
        </div>
        <div className="bg-surface border border-border rounded-card p-8">
          <h2 className="text-lg font-display text-primary mb-2">Upload Trial Balance</h2>
          <p className="text-text-secondary text-sm mb-6">
            Upload a trial balance export (account-level balances). GL-level drill-down will not be available.
          </p>
          <FileUploadZone
            onFile={(f) => setTbFile(f)}
            title="Drop your trial balance here"
            subtitle="or click to browse"
            hint="Accepted: CSV, Excel (.xlsx, .xls)"
          />
          <button type="button" onClick={() => setShowTBUpload(false)} className="mt-6 text-sm text-accent hover:underline">
            ← Back to start
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-8">
      <div>
        <h1 className="text-2xl font-display text-primary">
          {periodLabel} — {entityName}
        </h1>
        <p className="text-text-secondary text-sm mt-1">
          Status: <StatusBadge variant="neutral" label="OPEN" />
        </p>
      </div>

      <div className="bg-surface border border-border rounded-card p-8">
        <h2 className="text-lg font-display text-primary mb-2">Start Your Close</h2>
        <p className="text-text-secondary text-sm mb-6">
          Upload your general ledger to begin the month-end close process. The system will derive your trial balance and guide you through each step.
        </p>

        <FileUploadZone
          onFile={(f) => setGlFile(f)}
          title="Drop your GL export here"
          subtitle="or click to browse"
          hint="Accepted: CSV, Excel (.xlsx, .xls)"
        />

        <div className="my-6 flex items-center gap-4">
          <div className="flex-1 border-t border-border" />
          <span className="text-sm text-text-tertiary">OR</span>
          <div className="flex-1 border-t border-border" />
        </div>

        {erpConnected ? (
          <button type="button" className="w-full py-3 rounded-input border border-border text-sm font-medium hover:bg-hover">
            Sync from ERP
          </button>
        ) : (
          <div className="p-4 rounded-input border border-border bg-surface-alt text-sm text-text-secondary">
            No ERP connection configured. Connect your accounting system in Settings to enable direct sync.
            <Link href="/settings" className="block mt-2 text-accent hover:underline">
              Go to Settings →
            </Link>
          </div>
        )}

        <button type="button" onClick={() => setShowTBUpload(true)} className="w-full mt-3 py-3 rounded-input border border-border text-sm font-medium hover:bg-hover">
          Upload Trial Balance Directly
        </button>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="text-sm font-medium text-text-secondary mb-2">Prior Period Reference</h3>
        <p className="text-sm text-primary">
          January 2026 — CERTIFIED (6 days, 47 accounts, 8 AJEs)
        </p>
        <Link href={`/close/${PRIOR_PERIOD_SESSION_ID}/dashboard`} className="text-sm text-accent hover:underline mt-1 inline-block">
          View prior close →
        </Link>
      </div>
    </div>
  );
}
