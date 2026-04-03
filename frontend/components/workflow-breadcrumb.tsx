'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight, CheckCircle2, ArrowRight } from 'lucide-react';

const WORKFLOW_STEPS = [
  { key: 'trial-balance', label: 'Trial Balance', short: 'TB' },
  { key: 'mapping', label: 'Account Mapping', short: 'Mapping' },
  { key: 'reconciliation', label: 'Reconciliation', short: 'Recon' },
  { key: 'adjustments', label: 'Journal Entries', short: 'JEs' },
  { key: 'statements', label: 'Statements', short: 'Statements' },
  { key: 'variance', label: 'Variance Analysis', short: 'Variance' },
  { key: 'review', label: 'Review & Certify', short: 'Certify' },
];

interface Gate {
  id: string;
  label: string;
  passing: boolean;
}

/** Map gate IDs to workflow step keys */
const GATE_TO_STEP: Record<string, string> = {
  tb_balanced: 'trial-balance',
  all_accounts_mapped: 'mapping',
  recons_complete: 'reconciliation',
  cash_rec_complete: 'reconciliation',
  templates_resolved: 'adjustments',
  material_jes_approved: 'adjustments',
  statements_current: 'statements',
  variances_explained: 'variance',
  no_blocking_issues: 'review',
  evidence_policy: 'review',
  checklist_complete: 'review',
};

function getStepStatus(stepKey: string, gates: Gate[]): 'done' | 'active' | 'upcoming' {
  // Find gates that map to this step
  const relatedGates = gates.filter((g) => {
    const mapped = GATE_TO_STEP[g.id];
    return mapped === stepKey;
  });

  if (relatedGates.length === 0) return 'upcoming';
  if (relatedGates.every((g) => g.passing)) return 'done';
  return 'active';
}

export function WorkflowBreadcrumb({
  sessionId,
  gates = [],
}: {
  sessionId: string;
  gates?: Gate[];
}) {
  const pathname = usePathname();

  // Find current step index
  const currentStepIndex = WORKFLOW_STEPS.findIndex((s) =>
    pathname?.includes(`/${s.key}`)
  );

  // Find the next incomplete step
  const nextStepIndex = WORKFLOW_STEPS.findIndex((step) => {
    const status = getStepStatus(step.key, gates);
    return status !== 'done';
  });

  const nextStep =
    currentStepIndex >= 0 && currentStepIndex < WORKFLOW_STEPS.length - 1
      ? WORKFLOW_STEPS[currentStepIndex + 1]
      : nextStepIndex >= 0
        ? WORKFLOW_STEPS[nextStepIndex]
        : null;

  // Is current step the last one?
  const isLastStep = currentStepIndex === WORKFLOW_STEPS.length - 1;

  return (
    <div className="bg-[#EDE6D6] border-b border-[#DDD5C2] px-6 py-2">
      <div className="flex items-center justify-between">
        {/* Step indicators */}
        <div className="flex items-center gap-1">
          <Link
            href={`/close/${sessionId}/dashboard`}
            className="text-xs text-[#8B7A5E] hover:text-[#B8860B] transition-colors"
          >
            Dashboard
          </Link>
          {WORKFLOW_STEPS.map((step, i) => {
            const status = getStepStatus(step.key, gates);
            const isCurrent = pathname?.includes(`/${step.key}`);

            return (
              <div key={step.key} className="flex items-center">
                <ChevronRight size={12} className="text-[#DDD5C2] mx-0.5" />
                <Link
                  href={`/close/${sessionId}/${step.key}`}
                  className={`text-xs font-medium px-1.5 py-0.5 rounded transition-colors flex items-center gap-1 ${
                    isCurrent
                      ? 'bg-[#2C2416] text-[#B8860B]'
                      : status === 'done'
                        ? 'text-[#2D6A4F] hover:bg-[#E0EDE8]'
                        : 'text-[#8B7A5E] hover:text-[#2C2416]'
                  }`}
                >
                  {status === 'done' && !isCurrent && (
                    <CheckCircle2 size={10} />
                  )}
                  {step.short}
                </Link>
              </div>
            );
          })}
        </div>

        {/* Next step CTA */}
        {nextStep && !isLastStep && (
          <Link
            href={`/close/${sessionId}/${nextStep.key}`}
            className="inline-flex items-center gap-1.5 text-xs font-medium px-3 py-1.5 rounded bg-[#B8860B] text-[#F5F0E8] hover:bg-[#A07608] transition-colors"
          >
            Continue to {nextStep.label}
            <ArrowRight size={12} />
          </Link>
        )}
        {isLastStep && (
          <span className="text-xs font-medium text-[#2D6A4F] flex items-center gap-1">
            <CheckCircle2 size={12} />
            Final step
          </span>
        )}
      </div>
    </div>
  );
}
