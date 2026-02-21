'use client';

import React, { createContext, useContext, useState, useMemo } from 'react';
import { mockTrialBalanceRows } from '@/lib/mock/trial-balance';
import type { TrialBalanceRow } from '@/lib/types/trial-balance';

type Overrides = Record<string, { lineId: string; lineName: string }>;

const TrialBalanceContext = createContext<{
  overrides: Overrides;
  setOverrides: React.Dispatch<React.SetStateAction<Overrides>>;
  rows: TrialBalanceRow[];
  unmappedCount: number;
  mappedCount: number;
} | null>(null);

export function TrialBalanceProvider({ children }: { children: React.ReactNode }) {
  const [overrides, setOverrides] = useState<Overrides>({});

  const value = useMemo(() => {
    const rows: TrialBalanceRow[] = mockTrialBalanceRows.map((r) => {
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
  }, [overrides]);

  return (
    <TrialBalanceContext.Provider value={value}>
      {children}
    </TrialBalanceContext.Provider>
  );
}

export function useTrialBalanceContext() {
  const ctx = useContext(TrialBalanceContext);
  if (!ctx) return { overrides: {}, setOverrides: () => {}, rows: mockTrialBalanceRows, unmappedCount: 3, mappedCount: mockTrialBalanceRows.length - 3 };
  return ctx;
}
