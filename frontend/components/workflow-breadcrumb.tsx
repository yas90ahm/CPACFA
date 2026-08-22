'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ArrowRight, ChevronRight } from 'lucide-react';

const CLOSE_WORKSPACE_STEPS = [
  { key: 'dashboard', label: 'Close overview', short: 'Overview', href: (sessionId: string) => `/close/${sessionId}/dashboard` },
  { key: 'runbook', label: 'Runbook & Agents', short: 'Agents', href: (sessionId: string) => `/close/${sessionId}/runbook` },
  { key: 'adjustments', label: 'Journal Entry Review', short: 'JE review', href: (sessionId: string) => `/close/${sessionId}/adjustments?tab=entries` },
  { key: 'memory', label: 'Learning & Recovery', short: 'Recovery', href: (sessionId: string) => `/close/${sessionId}/memory` },
  { key: 'review', label: 'Review & Certify', short: 'Certify', href: (sessionId: string) => `/close/${sessionId}/review` },
] as const;

interface Gate {
  id: string;
  label: string;
  passing: boolean;
}

/**
 * Shared wayfinding for the governed close product. Gate results remain on the
 * dashboard and in backend readiness checks; navigation never bypasses controls.
 */
export function WorkflowBreadcrumb({
  sessionId,
  gates: _gates = [],
}: {
  sessionId: string;
  gates?: Gate[];
}) {
  const pathname = usePathname();
  const currentStepIndex = CLOSE_WORKSPACE_STEPS.findIndex((step) => pathname?.includes(`/${step.key}`));
  const currentStep = currentStepIndex >= 0 ? CLOSE_WORKSPACE_STEPS[currentStepIndex] : null;
  const nextStep = currentStepIndex >= 0 && currentStepIndex < CLOSE_WORKSPACE_STEPS.length - 1
    ? CLOSE_WORKSPACE_STEPS[currentStepIndex + 1]
    : currentStepIndex < 0
      ? CLOSE_WORKSPACE_STEPS[0]
      : null;

  return (
    <nav className="border-b border-[#DDD5C2] bg-[#EDE6D6] px-6 py-2" aria-label="Governed close workspace">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1">
          {CLOSE_WORKSPACE_STEPS.map((step, index) => {
            const current = step.key === currentStep?.key;
            return (
              <div key={step.key} className="flex items-center">
                {index > 0 && <ChevronRight size={12} className="mx-0.5 text-[#DDD5C2]" aria-hidden="true" />}
                <Link
                  href={step.href(sessionId)}
                  aria-current={current ? 'page' : undefined}
                  className={`rounded px-1.5 py-0.5 text-xs font-medium transition-colors ${
                    current
                      ? 'bg-[#2C2416] text-[#B8860B]'
                      : 'text-[#8B7A5E] hover:bg-[#DDD5C2] hover:text-[#2C2416]'
                  }`}
                >
                  {step.short}
                </Link>
              </div>
            );
          })}
        </div>

        {nextStep && (
          <Link
            href={nextStep.href(sessionId)}
            className="inline-flex items-center gap-1.5 rounded bg-[#B8860B] px-3 py-1.5 text-xs font-medium text-[#F5F0E8] transition-colors hover:bg-[#A07608]"
          >
            Open {nextStep.label}
            <ArrowRight size={12} aria-hidden="true" />
          </Link>
        )}
      </div>
    </nav>
  );
}
