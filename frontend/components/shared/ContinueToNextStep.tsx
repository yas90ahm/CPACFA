'use client';
import Link from 'next/link';
import { CheckCircle2, ArrowRight } from 'lucide-react';

interface ContinueToNextStepProps {
  currentStep: string;
  nextStep: { label: string; href: string };
  gatesPassed: boolean;
  gateSummary?: string;
}

export function ContinueToNextStep({ currentStep, nextStep, gatesPassed, gateSummary }: ContinueToNextStepProps) {
  if (!gatesPassed) return null;

  return (
    <div className="flex items-center justify-between p-4 rounded-lg mt-6"
         style={{ background: 'var(--status-success-bg)', border: '1px solid var(--status-success)' }}>
      <div className="flex items-center gap-3">
        <CheckCircle2 className="w-5 h-5" style={{ color: 'var(--status-success)' }} />
        <div>
          <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{gateSummary || `${currentStep} complete`}</div>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Ready to proceed</div>
        </div>
      </div>
      <Link href={nextStep.href} className="flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium"
         style={{ background: 'var(--interactive-primary)', color: '#fff' }}>
        Continue to {nextStep.label}
        <ArrowRight className="w-4 h-4" />
      </Link>
    </div>
  );
}
