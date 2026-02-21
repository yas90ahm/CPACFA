import { useQuery } from '@tanstack/react-query';
import { mockAjeTemplates } from '@/lib/mock/aje-templates';
import { mockJournalEntries } from '@/lib/mock/journal-entries';

export function useAjeTemplates(sessionId: string) {
  return useQuery({
    queryKey: ['aje-templates', sessionId],
    queryFn: async () => mockAjeTemplates.filter((t) => t.sessionId === sessionId),
    enabled: !!sessionId,
  });
}

export function useJournalEntries(sessionId: string) {
  return useQuery({
    queryKey: ['journal-entries', sessionId],
    queryFn: async () => mockJournalEntries.filter((e) => e.sessionId === sessionId),
    enabled: !!sessionId,
  });
}

export function useJournalEntry(sessionId: string, jeId: string | null) {
  return useQuery({
    queryKey: ['journal-entry', sessionId, jeId],
    queryFn: async () => {
      const list = mockJournalEntries.filter((e) => e.sessionId === sessionId);
      return list.find((e) => e.id === jeId) ?? null;
    },
    enabled: !!sessionId && !!jeId,
  });
}
