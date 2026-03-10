'use client';

import { useParams } from 'next/navigation';
import { useCloseSession } from '@/lib/queries/close-session';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useAjeTemplates, useJournalEntries } from '@/lib/queries/adjustments';
import { useVariances } from '@/lib/queries/variance';
import { CloseChecklist } from '@/components/shared/CloseChecklist';

export default function ChecklistPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { data: session } = useCloseSession(sessionId);
  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: ajeTemplates = [] } = useAjeTemplates(sessionId);
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: variances = [] } = useVariances(sessionId);

  const reconComplete = reconciliations.filter((r) => r.status === 'completed' || r.status === 'approved').length;
  const ajeTemplatesPending = ajeTemplates.filter((t) => t.periodStatus === 'pending').length;
  const statementsGenerated = !!session?.statementsGeneratedAt;
  const varianceUnexplained = variances.filter((v) => v.isMaterial && v.explanationStatus === 'pending').length;
  const allJePosted = journalEntries.length > 0 && journalEntries.every((e) => e.status === 'posted' || e.status === 'rejected');

  return (
    <div className="space-y-6 max-w-[1000px]">
      <div>
        <h1 className="text-xl font-semibold text-white">Close Checklist</h1>
        <p className="text-sm text-gray-500 mt-1">Track every task in your close workflow with dependency chains</p>
      </div>
      <CloseChecklist
        sessionId={sessionId}
        periodLabel={session?.periodLabel ?? ''}
        reconComplete={reconComplete}
        reconTotal={reconciliations.length}
        ajeTemplatesPending={ajeTemplatesPending}
        statementsGenerated={statementsGenerated}
        varianceUnexplained={varianceUnexplained}
        allJePosted={allJePosted}
      />
    </div>
  );
}
