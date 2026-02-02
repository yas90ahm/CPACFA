'use client';

import * as React from 'react';

const STORAGE_KEY = 'finos_first_run_done';

export interface FirstRunContextValue {
  /** True until the user has completed or dismissed the first-run experience. */
  isFirstRun: boolean;
  /** Call to mark first-run as complete (e.g. after tour or Load Sample Data). */
  completeFirstRun: () => void;
  /** Reset for testing (sets isFirstRun true again). */
  resetFirstRun: () => void;
}

const FirstRunContext = React.createContext<FirstRunContextValue | null>(null);

function getStored(): boolean {
  if (typeof window === 'undefined') return true;
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'true';
  } catch {
    return true;
  }
}

export function FirstRunProvider({ children }: { children: React.ReactNode }) {
  const [isFirstRun, setIsFirstRun] = React.useState(true);

  React.useEffect(() => {
    setIsFirstRun(getStored());
  }, []);

  const completeFirstRun = React.useCallback(() => {
    try {
      localStorage.setItem(STORAGE_KEY, 'true');
    } catch {}
    setIsFirstRun(false);
  }, []);

  const resetFirstRun = React.useCallback(() => {
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {}
    setIsFirstRun(true);
  }, []);

  const value: FirstRunContextValue = {
    isFirstRun,
    completeFirstRun,
    resetFirstRun,
  };

  return (
    <FirstRunContext.Provider value={value}>
      {children}
    </FirstRunContext.Provider>
  );
}

export function useFirstRun(): FirstRunContextValue {
  const ctx = React.useContext(FirstRunContext);
  if (!ctx) {
    return {
      isFirstRun: false,
      completeFirstRun: () => {},
      resetFirstRun: () => {},
    };
  }
  return ctx;
}
