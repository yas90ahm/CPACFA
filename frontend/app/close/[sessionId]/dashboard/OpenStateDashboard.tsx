'use client';

import { useState } from 'react';
import Link from 'next/link';
import { FileUploadZone } from '@/components/shared/FileUploadZone';
import { StatusBadge } from '@/components/shared/StatusBadge';
import { GLUploadFlow } from './GLUploadFlow';
import { TBUploadFlow } from './TBUploadFlow';
import { useSessions } from '@/lib/queries/sessions';
import { useEntities } from '@/lib/queries/entities';

export interface OpenStateDashboardProps {
  sessionId: string;
  periodLabel: string;
  entityName: string;
}

export function OpenStateDashboard({ sessionId, periodLabel, entityName }: OpenStateDashboardProps) {
  const { data: entities = [] } = useEntities();
  const entityId = entities.length > 0 ? entities[0].id : null;
  const { data: allSessions = [] } = useSessions(entityId);
  const priorSession = allSessions
    .filter((s) => s.id !== sessionId && (s.state === 'CERTIFIED' || s.state === 'LOCKED'))
    .sort((a, b) => new Date(b.periodStart).getTime() - new Date(a.periodStart).getTime())[0] ?? null;

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
        <TBUploadFlow sessionId={sessionId} periodLabel={periodLabel} file={tbFile} onBack={() => setTbFile(null)} />
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

        <button type="button" onClick={() => setShowTBUpload(true)} className="w-full py-3 rounded-input border border-border text-sm font-medium hover:bg-hover">
          Upload Trial Balance Directly
        </button>
      </div>

      <div className="border-t border-border pt-6">
        <h3 className="text-sm font-medium text-text-secondary mb-2">Prior Period Reference</h3>
        {priorSession ? (
          <>
            <p className="text-sm text-primary">
              {priorSession.periodLabel} — {priorSession.state}{priorSession.duration ? ` (${priorSession.duration})` : ''}
            </p>
            <Link href={`/close/${priorSession.id}/dashboard`} className="text-sm text-accent hover:underline mt-1 inline-block">
              View prior close →
            </Link>
          </>
        ) : (
          <p className="text-sm text-text-tertiary">No prior period data available.</p>
        )}
      </div>
    </div>
  );
}
