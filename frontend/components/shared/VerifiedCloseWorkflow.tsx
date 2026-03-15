'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Brain,
  FileText,
  Shield,
  FileDown,
  CheckCircle2,
  Loader2,
  Lock,
  ArrowRight,
} from 'lucide-react';
import { useCloseSession, useCloseReadiness } from '@/lib/queries/close-session';
import { useCertification } from '@/lib/queries/certification';
import { useDecisionRecords, useHITLStaging, useJustifications } from '@/lib/queries/ai-insights';
import { useJournalEntries } from '@/lib/queries/adjustments';
import { useAuditTrail } from '@/lib/queries/audit-trail';

type StepStatus = 'complete' | 'in_progress' | 'locked';

interface WorkflowStep {
  id: string;
  label: string;
  subtitle: string;
  icon: typeof Brain;
  status: StepStatus;
  detail: string;
}

const STATUS_STYLES: Record<StepStatus, { ring: string; bg: string; icon: string; text: string }> = {
  complete: { ring: 'ring-emerald-500/30', bg: 'bg-emerald-500/10', icon: 'text-emerald-400', text: 'text-emerald-400' },
  in_progress: { ring: 'ring-[#7C5CFC]/30', bg: 'bg-[#7C5CFC]/10', icon: 'text-[#7C5CFC]', text: 'text-[#7C5CFC]' },
  locked: { ring: 'ring-[#262C48]', bg: 'bg-[#0d1017]', icon: 'text-gray-700', text: 'text-gray-600' },
};

function StatusIcon({ status }: { status: StepStatus }) {
  if (status === 'complete') return <CheckCircle2 className="w-5 h-5 text-emerald-400" />;
  if (status === 'in_progress') return <Loader2 className="w-5 h-5 text-[#7C5CFC] animate-spin" />;
  return <Lock className="w-4 h-4 text-gray-700" />;
}

export function VerifiedCloseWorkflow({ sessionId }: { sessionId: string }) {
  const { data: session } = useCloseSession(sessionId);
  const { data: readiness } = useCloseReadiness(sessionId);
  const { data: certification } = useCertification(sessionId);
  const { data: decisions = [] } = useDecisionRecords(sessionId);
  const { data: staging = [] } = useHITLStaging();
  const { data: justifications = [] } = useJustifications();
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: auditTrail } = useAuditTrail(sessionId);

  const state = session?.state ?? 'IN_PROGRESS';
  const isCertified = state === 'CERTIFIED' || state === 'LOCKED';
  const isOpen = state === 'OPEN';

  const steps: WorkflowStep[] = useMemo(() => {
    // Step 1: ML Classification & Shadow Audit
    const shadowAuditFindings = decisions.length;
    const pendingStaging = staging.filter((s) => s.status === 'pending').length;
    const classificationDone = shadowAuditFindings > 0 && pendingStaging === 0;
    const classificationInProgress = shadowAuditFindings > 0 && pendingStaging > 0;
    const step1Status: StepStatus = isOpen ? 'locked' : classificationDone ? 'complete' : classificationInProgress ? 'in_progress' : 'locked';
    const step1Detail = isOpen
      ? 'Upload GL to begin'
      : classificationDone
        ? `${shadowAuditFindings} items classified, 0 pending`
        : classificationInProgress
          ? `${pendingStaging} items awaiting review`
          : 'Awaiting GL ingest';

    // Step 2: Generative IRAC Drafting
    const nonRoutineEntries = journalEntries.filter((e) => e.source !== 'template');
    const justificationCount = justifications.length;
    const unsignedEntries = journalEntries.filter((e) => e.status === 'draft' || e.status === 'proposed');
    const iracDone = step1Status === 'complete' && nonRoutineEntries.length > 0 && justificationCount >= nonRoutineEntries.length;
    const iracInProgress = step1Status === 'complete' && nonRoutineEntries.length > 0 && justificationCount < nonRoutineEntries.length;
    const step2Status: StepStatus = iracDone ? 'complete' : iracInProgress ? 'in_progress' : step1Status === 'complete' ? (nonRoutineEntries.length === 0 ? 'complete' : 'in_progress') : 'locked';
    const step2Detail = step2Status === 'locked'
      ? 'Complete classification first'
      : step2Status === 'complete'
        ? `${justificationCount} memos generated`
        : `${justificationCount}/${nonRoutineEntries.length} memos drafted`;

    // Step 3: Cryptographic Multi-Sign-Off
    const hasCertification = !!certification;
    const gatesPassing = readiness?.gatesPassing ?? 0;
    const gatesTotal = readiness?.gatesTotal ?? 1;
    const allGatesPassing = gatesPassing === gatesTotal && gatesTotal > 0;
    const step3Status: StepStatus = isCertified ? 'complete' : (step2Status === 'complete' && allGatesPassing) ? 'in_progress' : 'locked';
    const step3Detail = isCertified
      ? `Signed by ${certification?.certifiedBy ?? 'CFO'}`
      : step3Status === 'in_progress'
        ? `${unsignedEntries.length} unsigned entries, ${gatesPassing}/${gatesTotal} gates`
        : `${gatesTotal - gatesPassing} gates remaining`;

    // Step 4: Audit-Ready Push
    const chainIntegrity = auditTrail?.chainIntegrity ?? false;
    const step4Status: StepStatus = isCertified && chainIntegrity ? 'complete' : isCertified ? 'in_progress' : 'locked';
    const step4Detail = step4Status === 'complete'
      ? 'Audit pack ready for export'
      : step4Status === 'in_progress'
        ? 'Chain verification in progress'
        : 'Complete certification first';

    return [
      { id: 'classify', label: 'ML Classification', subtitle: 'Shadow Audit', icon: Brain, status: step1Status, detail: step1Detail },
      { id: 'irac', label: 'IRAC Drafting', subtitle: 'Generative Memos', icon: FileText, status: step2Status, detail: step2Detail },
      { id: 'sign', label: 'Multi-Sign-Off', subtitle: 'Ed25519 Signatures', icon: Shield, status: step3Status, detail: step3Detail },
      { id: 'export', label: 'Audit-Ready Push', subtitle: 'Complete Pack', icon: FileDown, status: step4Status, detail: step4Detail },
    ];
  }, [session, readiness, certification, decisions, staging, justifications, journalEntries, auditTrail, isOpen, isCertified]);

  const completedCount = steps.filter((s) => s.status === 'complete').length;
  const progressPct = Math.round((completedCount / steps.length) * 100);

  if (isOpen) return null;

  return (
    <div className="bg-[#141829] border border-[#262C48] rounded-xl p-5 mb-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-[#7C5CFC]/10 flex items-center justify-center">
            <Shield className="w-4 h-4 text-[#7C5CFC]" />
          </div>
          <div>
            <h2 className="text-xs font-semibold text-white uppercase tracking-wider">The Verified Close</h2>
            <p className="text-xs text-gray-600">4-step cryptographically verified close pipeline</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="h-1.5 w-24 bg-[#0d1017] rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700"
              style={{ width: `${progressPct}%`, background: progressPct === 100 ? '#34D399' : '#7C5CFC' }}
            />
          </div>
          <span className="text-xs text-gray-500 tabular-nums">{completedCount}/{steps.length}</span>
        </div>
      </div>

      <div className="relative flex items-start justify-between">
        {/* Connecting line */}
        <div className="absolute top-6 left-12 right-12 h-px bg-[#262C48]" />

        {steps.map((step, i) => {
          const styles = STATUS_STYLES[step.status];
          const StepIcon = step.icon;
          return (
            <div key={step.id} className="flex flex-col items-center relative z-10" style={{ width: '25%' }}>
              <div className={cn('w-12 h-12 rounded-xl flex items-center justify-center ring-2 transition-all', styles.ring, styles.bg)}>
                {step.status === 'complete' ? (
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                ) : step.status === 'in_progress' ? (
                  <div className="relative">
                    <StepIcon className="w-5 h-5 text-[#7C5CFC]" />
                    <div className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-[#7C5CFC] animate-pulse" />
                  </div>
                ) : (
                  <StepIcon className={cn('w-5 h-5', styles.icon)} />
                )}
              </div>
              <p className={cn('text-[11px] font-semibold mt-2 text-center', styles.text)}>{step.label}</p>
              <p className={cn('text-xs text-center', step.status === 'locked' ? 'text-gray-700' : 'text-gray-500')}>{step.subtitle}</p>
              <p className={cn('text-xs mt-1 text-center max-w-[120px]', step.status === 'locked' ? 'text-gray-700' : 'text-gray-500')}>{step.detail}</p>

              {/* Arrow between steps */}
              {i < steps.length - 1 && (
                <div className="absolute top-5 -right-2 z-20">
                  <ArrowRight className={cn('w-3 h-3', step.status === 'complete' ? 'text-emerald-500/50' : 'text-[#262C48]')} />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
