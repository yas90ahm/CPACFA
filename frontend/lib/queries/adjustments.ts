'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import type { AJETemplate } from '@/lib/types/journal-entry';

const STALE_TIME = 30_000;

interface TemplateApp {
  applicationId?: string;
  id?: string;
  templateId?: string;
  status?: string;
  template?: { name?: string; lines?: Array<{ account_ref?: string; debit?: number; credit?: number }> };
  skipReason?: string;
  appliedAt?: string;
  appliedBy?: string;
  resultingJeId?: string;
}

function toAjeTemplate(
  a: TemplateApp,
  sessionId: string,
  index: number
): AJETemplate {
  const id = (a.applicationId ?? a.id ?? a.templateId ?? `app-${index}`) as string;
  const status = (a.status ?? 'proposed') as string;
  const periodStatus = status === 'applied' ? 'applied' : status === 'skipped' ? 'skipped' : 'pending';
  const t = a.template;
  const lines = t?.lines ?? [];
  const debitLine = lines.find((l) => (l.debit ?? 0) > 0);
  const creditLine = lines.find((l) => (l.credit ?? 0) > 0);
  const amount = (debitLine?.debit ?? creditLine?.credit ?? 0) as number;
  return {
    id,
    sessionId,
    name: (t?.name ?? a.templateId ?? 'Template') as string,
    frequency: 'Monthly',
    debitAccountCode: debitLine?.account_ref ?? '',
    debitAccountName: '',
    creditAccountCode: creditLine?.account_ref ?? '',
    creditAccountName: '',
    amount,
    periodStatus,
    appliedOrSkippedBy: (a.appliedBy ?? null) as string | null,
    appliedOrSkippedAt: (a.appliedAt ?? null) as string | null,
    resultingJeId: (a.resultingJeId ?? null) as string | null,
    skipReason: (a.skipReason ?? null) as string | null,
  };
}

export function useAjeTemplates(sessionId: string | null) {
  return useQuery({
    queryKey: ['templates', sessionId],
    queryFn: async (): Promise<AJETemplate[]> => {
      if (!sessionId) throw new Error('No sessionId');
      const raw = await apiFetch<{ applications?: TemplateApp[] }>(
        `/api/close/sessions/${sessionId}/template-status`,
        { params: { loadTemplates: 'true' } }
      );
      const arr = raw.applications ?? [];
      return arr.map((a, i) => toAjeTemplate(a, sessionId, i));
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useJournalEntries(sessionId: string | null, status?: string) {
  return useQuery({
    queryKey: ['journal-entries', sessionId, status],
    queryFn: async () => {
      if (!sessionId) throw new Error('No sessionId');
      const res = await apiFetch<{ journalEntries: unknown[] }>('/api/close/journal-entries', {
        params: { closeSessionId: sessionId, status: status ?? undefined },
      });
      const entries = res.journalEntries ?? [];
      return entries.map((e, i) => {
        const r = e as Record<string, unknown>;
        const lines = ((r.lines as unknown[]) ?? []).map((l, j) => {
          const line = l as Record<string, unknown>;
          return {
            id: `l-${j}`,
            accountCode: (line.account_ref ?? line.accountCode ?? '') as string,
            accountName: (line.accountName ?? '') as string,
            description: (line.description ?? null) as string | null,
            debit: parseFloat(String(line.debit ?? 0)),
            credit: parseFloat(String(line.credit ?? 0)),
          };
        });
        return {
          id: (r.id ?? '') as string,
          sessionId,
          jeNumber: (r.jeNumber ?? i + 1) as number,
          date: (r.date ?? r.createdAt ?? new Date().toISOString().slice(0, 10)) as string,
          memo: (r.memo ?? '') as string,
          status: ((r.status ?? 'draft') as string) as import('@/lib/types/journal-entry').JournalEntryStatus,
          source: ((r.source ?? 'manual') as string) as import('@/lib/types/journal-entry').JournalEntrySource,
          templateId: (r.templateId ?? null) as string | null,
          templateName: (r.templateName ?? null) as string | null,
          lines,
          evidenceCount: (r.evidenceCount ?? 0) as number,
          createdBy: (r.createdBy ?? '') as string,
          createdAt: (r.createdAt ?? '') as string,
          proposedBy: (r.proposedBy ?? null) as string | null,
          proposedAt: (r.proposedAt ?? null) as string | null,
          approvedBy: (r.approvedBy ?? null) as string | null,
          approvedAt: (r.approvedAt ?? null) as string | null,
          postedBy: (r.postedBy ?? null) as string | null,
          postedAt: (r.postedAt ?? null) as string | null,
          rejectedBy: (r.rejectedBy ?? null) as string | null,
          rejectedAt: (r.rejectedAt ?? null) as string | null,
          rejectionReason: (r.rejectionReason ?? null) as string | null,
        };
      });
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useJournalEntry(jeId: string | null) {
  return useQuery({
    queryKey: ['journal-entry', jeId],
    queryFn: async () => {
      if (!jeId) return null;
      return apiFetch<unknown>(`/api/close/journal-entries/${jeId}`);
    },
    enabled: !!jeId,
  });
}
