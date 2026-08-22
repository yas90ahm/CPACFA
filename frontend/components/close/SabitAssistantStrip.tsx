'use client';

/**
 * SabitAssistantStrip — Persistent AI co-pilot status bar.
 *
 * Shows one line of context-sensitive AI status across all close pages.
 * Uses agency encoding: ink-blue = Sabit acted, amber = needs attention, forest = all clear.
 */

import { useQuery } from '@tanstack/react-query';
import { Sparkles, AlertTriangle, CheckCircle2, FileText, X } from 'lucide-react';
import { useState } from 'react';
import { apiFetch } from '@/lib/api';
import { adaptReadiness, adaptVariances } from '@/lib/contracts/adapters';
import { VarianceExplanationStatus, isVarianceExplained } from '@/lib/contracts/statuses';
import { closeQueryKeys } from '@/lib/hooks/useCloseSession';

interface SabitAssistantStripProps {
  sessionId: string;
}

interface StripMessage {
  text: string;
  icon: React.ReactNode;
  accentColor: string;
  bgColor: string;
}

export default function SabitAssistantStrip({ sessionId }: SabitAssistantStripProps) {
  const [dismissed, setDismissed] = useState(false);

  const variancesQuery = useQuery({
    queryKey: closeQueryKeys.variances(sessionId),
    queryFn: async () => {
      const data = await apiFetch(`/api/close/sessions/${sessionId}/variances`);
      return adaptVariances(data);
    },
    enabled: !!sessionId,
    staleTime: 60_000, // refresh every 60s (lightweight)
    retry: 1,
  });

  const readinessQuery = useQuery({
    queryKey: closeQueryKeys.readiness(sessionId),
    queryFn: async () => {
      const data = await apiFetch<unknown>(
        `/api/close/sessions/${sessionId}/readiness?format=gates`
      );
      return adaptReadiness(data);
    },
    enabled: !!sessionId,
    staleTime: 60_000,
    retry: 1,
  });

  if (dismissed) return null;

  const variances = variancesQuery.data ?? [];
  const material = variances.filter((v) => v?.isMaterial);
  const unexplained = material.filter((v) => v?.explanationStatus === VarianceExplanationStatus.UNEXPLAINED);
  const aiDrafts = material.filter(
    (v) => v?.explanationStatus === VarianceExplanationStatus.AI_DRAFTED || v?.explanationStatus === VarianceExplanationStatus.DRAFT_READY
  );
  const allExplained = material.length > 0 && material.every((v) => isVarianceExplained(v.explanationStatus));

  const gatesPassing = readinessQuery.data?.gatesPassing ?? 0;
  const gatesTotal = readinessQuery.data?.gatesTotal ?? 0;
  const canAdvance = readinessQuery.data?.canAdvance ?? false;

  // Determine message by priority
  let msg: StripMessage;

  if (unexplained.length > 0) {
    msg = {
      text: `${unexplained.length} material variance${unexplained.length !== 1 ? 's' : ''} need explanation`,
      icon: <AlertTriangle size={14} />,
      accentColor: '#8B6914',
      bgColor: '#F0E8D0',
    };
  } else if (aiDrafts.length > 0) {
    msg = {
      text: `${aiDrafts.length} AI variance draft${aiDrafts.length !== 1 ? 's' : ''} ready for your review`,
      icon: <Sparkles size={14} />,
      accentColor: '#3B6EA5',
      bgColor: '#E0EAF5',
    };
  } else if (canAdvance && allExplained) {
    msg = {
      text: `All gates passing \u2014 ready for certification`,
      icon: <CheckCircle2 size={14} />,
      accentColor: '#2D6A4F',
      bgColor: '#E0EDE8',
    };
  } else if (gatesTotal > 0) {
    msg = {
      text: `${gatesPassing} of ${gatesTotal} gates passing. ${material.length > 0 ? `${material.length} material variance${material.length !== 1 ? 's' : ''} tracked.` : 'Upload GL to begin.'}`,
      icon: <FileText size={14} />,
      accentColor: '#3B6EA5',
      bgColor: '#E0EAF5',
    };
  } else {
    // Loading or no data
    msg = {
      text: 'Sabit is analyzing your close data...',
      icon: <Sparkles size={14} className="animate-pulse" />,
      accentColor: '#3B6EA5',
      bgColor: '#E0EAF5',
    };
  }

  return (
    <div
      className="flex items-center justify-between px-4 py-1.5 text-xs border-b"
      style={{ background: msg.bgColor, color: msg.accentColor, borderColor: '#D1C7B7' }}
    >
      <div className="flex items-center gap-2">
        {msg.icon}
        <span className="font-medium">{msg.text}</span>
      </div>
      <button
        onClick={() => setDismissed(true)}
        className="p-0.5 rounded hover:opacity-60 transition-opacity"
        aria-label="Dismiss"
        style={{ color: msg.accentColor }}
      >
        <X size={14} />
      </button>
    </div>
  );
}
