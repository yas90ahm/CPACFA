'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { canReplaceGL } from '@/lib/permissions';
import { useTrialBalanceContext } from '../context/trial-balance-context';
import { OperatingPartnerDashboard } from '@/components/dashboards/OperatingPartnerDashboard';
import { ReviewerDashboard } from '@/components/dashboards/ReviewerDashboard';
import { FundControllerDashboard } from '@/components/dashboards/FundControllerDashboard';
import { GLUploadFlow } from './GLUploadFlow';
import { OpenStateDashboard } from './OpenStateDashboard';
import { FileUploadZone } from '@/components/shared/FileUploadZone';
import { cn } from '@/lib/utils';

import {
  PipelineCard,
  FinancialHighlightsCard,
  GateStatusCard,
  AttentionItemsCard,
  ActivityTimelineCard,
  QuickStatsPanel,
} from '@/components/dashboard';
import { useDashboardData } from '@/components/dashboard/useDashboardData';

/* -------------------------------------------------------------------------- */
/*  Main page                                                                  */
/* -------------------------------------------------------------------------- */

export default function CloseDashboardPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const sessionId = params.sessionId as string;
  const { user } = useAuth();
  const role = user?.role ?? 'controller';
  const tbContext = useTrialBalanceContext();

  const d = useDashboardData(sessionId, tbContext);

  /* ── Toast state ────────────────────────────────────────────────────────── */

  const [ingestToast, setIngestToast] = useState<string | null>(null);
  const [createdToast, setCreatedToast] = useState<string | null>(null);
  const [showReplaceConfirm, setShowReplaceConfirm] = useState(false);
  const [showReplaceUpload, setShowReplaceUpload] = useState(false);
  const [replaceFile, setReplaceFile] = useState<File | null>(null);

  const ingested = searchParams.get('ingested') === '1';
  const justCreated = searchParams.get('created') === '1';

  useEffect(() => {
    if (!ingested) return;
    setIngestToast(`GL imported -- ${searchParams.get('accounts') ?? '52'} accounts, trial balance balanced. ${searchParams.get('unmapped') ?? '5'} accounts need mapping.`);
    const u = new URL(window.location.href);
    u.searchParams.delete('ingested'); u.searchParams.delete('accounts'); u.searchParams.delete('unmapped');
    window.history.replaceState({}, '', u.pathname + u.search);
  }, [ingested, searchParams]);

  useEffect(() => {
    if (!justCreated || !d.session) return;
    setCreatedToast(`Session created for ${d.session.periodLabel ?? 'this period'}. Prior period account mappings and AJE templates will carry forward automatically.`);
    const u = new URL(window.location.href);
    u.searchParams.delete('created');
    window.history.replaceState({}, '', u.pathname + u.search);
  }, [justCreated, d.session]);

  /* ── Loading skeleton ───────────────────────────────────────────────────── */

  if (!d.session) {
    return (
      <div className="space-y-6">
        <div className="rounded-[var(--radius-lg)] animate-pulse bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-sm)] p-6">
          <div className="h-6 w-48 rounded mb-2 bg-[var(--bg-surface-sunken)]" />
          <div className="h-4 w-32 rounded mb-5 bg-[var(--bg-surface-sunken)]" />
          <div className="h-3.5 rounded-full mb-5 bg-[var(--bg-surface-sunken)]" />
          <div className="flex gap-6">
            <div className="h-4 w-24 rounded bg-[var(--bg-surface-sunken)]" />
            <div className="h-4 w-32 rounded bg-[var(--bg-surface-sunken)]" />
            <div className="h-4 w-20 rounded bg-[var(--bg-surface-sunken)]" />
          </div>
        </div>
      </div>
    );
  }

  /* ── Role & state routing ───────────────────────────────────────────────── */

  const state = d.session.state;
  if (state === 'OPEN') return <OpenStateDashboard sessionId={sessionId} periodLabel={d.session.periodLabel ?? ''} entityName={d.session.entityName ?? ''} />;
  if (role === 'operating_partner') return <OperatingPartnerDashboard />;
  if ((role === 'reviewer' || role === 'admin') && state === 'UNDER_REVIEW') return <ReviewerDashboard sessionId={sessionId} />;
  if (role === 'fund_controller') return <FundControllerDashboard />;

  /* ── GL Replace flow ────────────────────────────────────────────────────── */

  if (replaceFile) {
    return (
      <div className="max-w-2xl space-y-8">
        <div>
          <h1 className="text-2xl font-semibold text-[var(--text-primary)]">Replace GL Data -- {d.session.periodLabel ?? ''}</h1>
          <p className="text-sm mt-1 text-[var(--text-secondary)]">Uploading a new GL will replace existing data. Account mappings will be preserved.</p>
        </div>
        <GLUploadFlow sessionId={sessionId} periodLabel={d.session.periodLabel ?? ''} file={replaceFile} onBack={() => setReplaceFile(null)} skipAdvance replaceMode onComplete={() => setReplaceFile(null)} />
      </div>
    );
  }

  /* ── Main controller dashboard ──────────────────────────────────────────── */

  return (
    <div className="space-y-6">
      {/* Toasts */}
      {ingestToast && <Toast message={ingestToast} variant="success" onDismiss={() => setIngestToast(null)} />}
      {createdToast && <Toast message={createdToast} variant="info" onDismiss={() => setCreatedToast(null)} />}

      {/* Replace GL modals */}
      {showReplaceConfirm && (
        <ReplaceConfirmModal
          onCancel={() => setShowReplaceConfirm(false)}
          onContinue={() => { setShowReplaceConfirm(false); setReplaceFile(null); setShowReplaceUpload(true); }}
        />
      )}
      {showReplaceUpload && !replaceFile && (
        <ReplaceUploadCard onCancel={() => setShowReplaceUpload(false)} onFile={(f) => { setReplaceFile(f); setShowReplaceUpload(false); }} />
      )}

      {/* ROW 1: Pipeline header */}
      <PipelineCard
        periodLabel={d.session.periodLabel ?? ''}
        entityName={d.session.entityName ?? ''}
        sessionState={state}
        dayElapsed={d.dayElapsed}
        targetDays={d.targetDays}
        stepperSteps={d.stepperSteps}
        sessionId={sessionId}
        canReplaceGL={canReplaceGL(role)}
        isInProgress={state === 'IN_PROGRESS'}
        onReplaceGL={() => setShowReplaceConfirm(true)}
        timeline={d.timeline}
      />

      {/* ROW 2: Attention + Stats */}
      <section className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-8">
          <AttentionItemsCard
            gates={d.gatesWithMapping}
            sessionId={sessionId}
            reconComplete={d.reconComplete}
            reconTotal={d.reconTotal}
            ajeTemplatePending={d.ajeTemplatePending}
            ajeTemplateTotal={d.ajeTemplateTotal}
            varianceExplainedCount={d.varianceExplainedCount}
            varianceMaterialTotal={d.varianceMaterialTotal}
            mappedCount={d.mappedCount}
            totalAccounts={d.totalAccounts}
            jesAwaitingApproval={d.jesAwaitingApproval}
            reconsInProgress={d.reconsInProgress}
          />
        </div>
        <div className="col-span-12 lg:col-span-4">
          <QuickStatsPanel
            gatesPassing={d.gatesPassing}
            gatesTotal={d.gatesTotal}
            mappedCount={d.mappedCount}
            unmappedCount={d.unmappedCount}
            reconComplete={d.reconComplete}
            reconTotal={d.reconTotal}
            statementsGenerated={d.statementsGenerated}
            statementsStale={d.statementsStale}
          />
        </div>
      </section>

      {/* ROW 3: Financials + Gates */}
      <section className="grid grid-cols-12 gap-6">
        <div className="col-span-12 lg:col-span-6">
          <FinancialHighlightsCard financialLines={d.financialLines} balanceVerified={d.balanceVerified} sessionId={sessionId} />
        </div>
        <div className="col-span-12 lg:col-span-6">
          <GateStatusCard gates={d.gatesWithMapping} gatesPassing={d.gatesPassing} gatesTotal={d.gatesTotal} sessionId={sessionId} />
        </div>
      </section>

      {/* ROW 4: Activity */}
      <section>
        <ActivityTimelineCard events={d.auditEvents} sessionId={sessionId} />
      </section>
    </div>
  );
}

/* -------------------------------------------------------------------------- */
/*  Small inline sub-components                                                */
/* -------------------------------------------------------------------------- */

function Toast({ message, variant, onDismiss }: { message: string; variant: 'success' | 'info'; onDismiss: () => void }) {
  const color = variant === 'success' ? 'var(--status-success)' : 'var(--interactive-primary)';
  const bg = variant === 'success' ? 'var(--status-success-bg)' : 'var(--status-info-bg)';
  return (
    <div className="flex items-center justify-between px-4 py-3 text-sm rounded-[var(--radius-lg)]" style={{ border: `1px solid ${color}`, backgroundColor: bg, color }}>
      <span>{message}</span>
      <button type="button" onClick={onDismiss} className="hover:opacity-80" aria-label="Dismiss">x</button>
    </div>
  );
}

function ReplaceConfirmModal({ onCancel, onContinue }: { onCancel: () => void; onContinue: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="max-w-md w-full mx-4 space-y-4 rounded-[var(--radius-lg)] p-6 bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-lg)]">
        <h3 className="text-lg font-semibold text-[var(--text-primary)]">Replace GL Data?</h3>
        <p className="text-sm text-[var(--text-secondary)]">Replacing the GL will reset your trial balance. Account mappings will be preserved. Any reconciliations in progress may need to be re-verified.</p>
        <div className="flex gap-3 justify-end">
          <button type="button" onClick={onCancel} className="px-4 py-2 text-sm font-medium rounded-[var(--radius-md)] border border-[var(--border-default)] bg-[var(--bg-surface)] text-[var(--text-primary)] hover:bg-[var(--interactive-ghost-hover)] transition-colors">Cancel</button>
          <button type="button" onClick={onContinue} className="px-4 py-2 text-sm font-medium text-white rounded-[var(--radius-md)] bg-[var(--interactive-primary)] hover:bg-[var(--interactive-primary-hover)] transition-colors">Continue</button>
        </div>
      </div>
    </div>
  );
}

function ReplaceUploadCard({ onCancel, onFile }: { onCancel: () => void; onFile: (f: File) => void }) {
  return (
    <div className="rounded-[var(--radius-lg)] bg-[var(--bg-surface)] border border-[var(--border-default)] shadow-[var(--shadow-sm)]">
      <div className="flex items-center justify-between px-6 pt-5 pb-3">
        <h3 className="text-sm font-medium text-[var(--text-primary)]">Upload Replacement GL File</h3>
        <button type="button" onClick={onCancel} className="text-sm text-[var(--text-secondary)]">Cancel</button>
      </div>
      <div className="px-6 pb-5">
        <FileUploadZone onFile={onFile} title="Drop your new GL export here" subtitle="or click to browse" hint="This will replace existing GL data for this period" />
      </div>
    </div>
  );
}
