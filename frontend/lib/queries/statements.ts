'use client';

import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';

const STALE_TIME = 30_000;

export function useStatements(sessionId: string | null) {
  return useQuery({
    queryKey: ['statements', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No sessionId');
      const pkgRes = await apiFetch<{ packages: { id: string }[] }>(
        `/api/close/sessions/${sessionId}/statement-packages`
      );
      const pkgs = pkgRes.packages ?? [];
      const pkg = pkgs[0];
      if (!pkg) {
        return {
          incomeStatement: { statementType: 'income_statement' as const, lines: [] },
          balanceSheet: { statementType: 'balance_sheet' as const, lines: [] },
          cashFlow: { statementType: 'cash_flow' as const, lines: [] },
          equityStatement: { statementType: 'equity' as const, lines: [] },
          equityColumnar: { columns: [] as string[], rows: [] as { label: string; values: string[] }[] },
        };
      }
      const linesRes = await apiFetch<{ lines: Array<{ id?: string; fsLineId?: string; name?: string; amount?: string; statement?: string; displayOrder?: number; indentLevel?: number; isSubtotal?: boolean; isGrandTotal?: boolean; sectionName?: string }> }>(
        `/api/close/statement-packages/${pkg.id}/lines`
      );
      const stMap: Record<string, 'income_statement' | 'balance_sheet' | 'cash_flow' | 'equity'> = { profit_and_loss: 'income_statement', income_statement: 'income_statement', balance_sheet: 'balance_sheet', cash_flow: 'cash_flow', equity: 'equity' };
      const toLine = (l: { id?: string; fsLineId?: string; name?: string; amount?: string; statement?: string; displayOrder?: number; indentLevel?: number; isSubtotal?: boolean; isGrandTotal?: boolean; sectionName?: string }) => ({
        id: l.id ?? `${pkg.id}:${l.fsLineId}`,
        statementType: (stMap[l.statement ?? ''] ?? 'income_statement') as 'income_statement' | 'balance_sheet' | 'cash_flow' | 'equity',
        sectionName: l.sectionName ?? '',
        lineItemName: l.name ?? l.fsLineId ?? '',
        taxonomyLineId: l.fsLineId ?? l.id ?? '',
        amount: String(l.amount ?? '0'),
        displayOrder: l.displayOrder ?? 0,
        isSubtotal: l.isSubtotal ?? false,
        isGrandTotal: l.isGrandTotal ?? false,
        indentLevel: l.indentLevel ?? 0,
        accounts: [],
      });
      const lines = (linesRes.lines ?? []).map(toLine);
      const byType: Record<string, typeof lines> = { income_statement: [], balance_sheet: [], cash_flow: [], equity: [] };
      for (const item of lines) {
        const t = item.statementType in byType ? item.statementType : 'income_statement';
        byType[t].push(item);
      }
      const sortLines = (arr: typeof lines) => [...arr].sort((a, b) => a.displayOrder - b.displayOrder);
      return {
        incomeStatement: { statementType: 'income_statement' as const, lines: sortLines(byType.income_statement) },
        balanceSheet: { statementType: 'balance_sheet' as const, lines: sortLines(byType.balance_sheet) },
        cashFlow: { statementType: 'cash_flow' as const, lines: sortLines(byType.cash_flow) },
        equityStatement: { statementType: 'equity' as const, lines: sortLines(byType.equity) },
        equityColumnar: { columns: [] as string[], rows: [] as { label: string; values: string[] }[] },
      };
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}

export function useValidation(sessionId: string | null) {
  return useQuery({
    queryKey: ['validation', sessionId],
    queryFn: async () => {
      if (!sessionId) throw new Error('No sessionId');
      try {
        const pkgRes = await apiFetch<{ packages: { validationResults?: { allPassing?: boolean; checks?: Array<{ id?: string; name?: string; passing?: boolean; detail?: string }> } }[] }>(
          `/api/close/sessions/${sessionId}/statement-packages`
        );
        const vr = pkgRes.packages?.[0]?.validationResults;
        const checks = (vr?.checks ?? []).map((c, i) => ({
          id: c.id ?? `c-${i}`,
          name: c.name ?? 'Check',
          passing: c.passing ?? false,
          detail: c.detail ?? '',
        }));
        return {
          sessionId,
          allPassing: vr?.allPassing ?? checks.every((c) => c.passing),
          checks,
        };
      } catch {
        return { sessionId, allPassing: false, checks: [] };
      }
    },
    enabled: !!sessionId,
    staleTime: STALE_TIME,
  });
}
