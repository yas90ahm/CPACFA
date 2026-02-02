'use client';

import * as React from 'react';

export interface ExportNotificationState {
  analysisComplete: boolean;
  reportPreviewUrl: string | null;
  needsRegenerate: boolean;
}

export interface ExportNotificationContextValue extends ExportNotificationState {
  setAnalysisComplete: (v: boolean) => void;
  setReportPreviewUrl: (v: string | null) => void;
  setNeedsRegenerate: (v: boolean) => void;
  markAnalysisComplete: (previewUrl?: string | null) => void;
  markNeedsRegenerate: () => void;
  markRegenerated: () => void;
}

const defaultState: ExportNotificationState = {
  analysisComplete: false,
  reportPreviewUrl: null,
  needsRegenerate: false,
};

const ExportNotificationContext = React.createContext<ExportNotificationContextValue | null>(null);

export function ExportNotificationProvider({ children }: { children: React.ReactNode }) {
  const [analysisComplete, setAnalysisComplete] = React.useState(defaultState.analysisComplete);
  const [reportPreviewUrl, setReportPreviewUrl] = React.useState<string | null>(defaultState.reportPreviewUrl);
  const [needsRegenerate, setNeedsRegenerate] = React.useState(defaultState.needsRegenerate);

  const markAnalysisComplete = React.useCallback((previewUrl?: string | null) => {
    setAnalysisComplete(true);
    if (previewUrl !== undefined) setReportPreviewUrl(previewUrl ?? null);
  }, []);

  const markNeedsRegenerate = React.useCallback(() => setNeedsRegenerate(true), []);
  const markRegenerated = React.useCallback(() => setNeedsRegenerate(false), []);

  const value: ExportNotificationContextValue = {
    analysisComplete,
    reportPreviewUrl,
    needsRegenerate,
    setAnalysisComplete,
    setReportPreviewUrl,
    setNeedsRegenerate,
    markAnalysisComplete,
    markNeedsRegenerate,
    markRegenerated,
  };

  return (
    <ExportNotificationContext.Provider value={value}>
      {children}
    </ExportNotificationContext.Provider>
  );
}

export function useExportNotification(): ExportNotificationContextValue {
  const ctx = React.useContext(ExportNotificationContext);
  if (!ctx) {
    return {
      ...defaultState,
      setAnalysisComplete: () => {},
      setReportPreviewUrl: () => {},
      setNeedsRegenerate: () => {},
      markAnalysisComplete: () => {},
      markNeedsRegenerate: () => {},
      markRegenerated: () => {},
    };
  }
  return ctx;
}
