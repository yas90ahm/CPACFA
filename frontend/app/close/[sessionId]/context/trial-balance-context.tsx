'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import { useTrialBalance } from '@/lib/queries/trial-balance';
import type { TrialBalanceRow } from '@/lib/types/trial-balance';

type Overrides = Record<string, { lineId: string; lineName: string }>;

const TrialBalanceContext = createContext<{
  overrides: Overrides;
  setOverrides: React.Dispatch<React.SetStateAction<Overrides>>;
  rows: TrialBalanceRow[];
  unmappedCount: number;
  mappedCount: number;
} | null>(null);

const EMPTY_ROWS: TrialBalanceRow[] = [];

export function TrialBalanceProvider({ sessionId, children }: { sessionId: string; children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});
  const { data } = useTrialBalance(sessionId, false);
  const rowsFromApi = data?.rows ?? EMPTY_ROWS;

  const value = useMemo(() => {
    const rows: TrialBalanceRow[] = rowsFromApi.map((r) => {
      const ov = overrides[r.accountCode];
      if (ov) {
        return {
          ...r,
          mappingReportingLineId: ov.lineId,
          mappingReportingLineName: ov.lineName,
          mappingStatus: 'mapped' as const,
        };
      }
      return r;
    });
    const unmappedCount = rows.filter((r) => !r.mappingReportingLineId).length;
    const mappedCount = rows.filter((r) => r.mappingReportingLineId).length;
    return { overrides, setOverrides, rows, unmappedCount, mappedCount };
  }, [rowsFromApi, overrides]);

  return (
    <TrialBalanceContext.Provider value={value}>
      {children}
    </TrialBalanceContext.Provider>
  );
}

export function useTrialBalanceContext() {
  const ctx = useContext(TrialBalanceContext);
  if (!ctx) return { overrides: {}, setOverrides: () => {}, rows: EMPTY_ROWS, unmappedCount: 0, mappedCount: 0 };
  return ctx;
}
