'use client';

import * as React from 'react';
import type {
  QualityCheck,
  DataGap,
  AgenticQualityAssessment,
} from '@/lib/agentic-types';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-destructive border-l-destructive',
  warning: 'text-amber-600 dark:text-amber-400 border-l-amber-500',
  info: 'text-muted-foreground border-l-muted-foreground',
};

export function AgenticQualityPanel({
  qualityChecks = [],
  dataGaps = [],
  agenticAssessment,
  className,
}: {
  qualityChecks?: QualityCheck[];
  dataGaps?: DataGap[];
  agenticAssessment?: AgenticQualityAssessment | null;
  className?: string;
}) {
  const hasChecks = qualityChecks.length > 0;
  const hasGaps = dataGaps.length > 0;
  const hasAssessment = agenticAssessment && (agenticAssessment.items?.length > 0 || agenticAssessment.summary);

  if (!hasChecks && !hasGaps && !hasAssessment) {
    return (
      <div className={`rounded-md border border-border bg-muted/10 p-4 text-sm text-muted-foreground ${className ?? ''}`}>
        <span className="font-medium text-foreground">Agentic quality</span>
        <p className="mt-1">No quality checks or data gaps reported. Statements passed automated and agentic review.</p>
      </div>
    );
  }

  return (
    <div className={`space-y-3 ${className ?? ''}`}>
      <h3 className="text-sm font-semibold text-foreground">Agentic quality & data gaps</h3>
      {hasAssessment && agenticAssessment.summary && (
        <div
          className={`rounded-md border-l-4 bg-muted/20 p-3 text-sm ${
            SEVERITY_COLOR[agenticAssessment.overallSeverity] ?? 'border-l-muted-foreground'
          }`}
        >
          <p className="font-medium">Assessment</p>
          <p className="mt-1">{agenticAssessment.summary}</p>
          {agenticAssessment.recommendedActions?.length > 0 && (
            <ul className="mt-2 list-disc pl-4 space-y-0.5">
              {agenticAssessment.recommendedActions.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {(hasChecks || hasGaps) && (
        <Accordion type="multiple" className="w-full">
          {hasChecks && (
            <AccordionItem value="quality-checks">
              <AccordionTrigger value="quality-checks">
                <span>Quality checks</span>
                <span className="ml-2 text-xs text-muted-foreground">
                  {qualityChecks.filter((c) => c.severity === 'critical').length} critical,{' '}
                  {qualityChecks.filter((c) => c.severity === 'warning').length} warning
                </span>
              </AccordionTrigger>
              <AccordionContent value="quality-checks">
                <ul className="space-y-2">
                  {qualityChecks.map((c) => (
                    <li
                      key={c.id}
                      className={`rounded border-l-2 pl-3 py-1 text-sm ${SEVERITY_COLOR[c.severity] ?? ''}`}
                    >
                      <span className="font-medium">{c.title}</span>
                      <p className="text-muted-foreground">{c.message}</p>
                      {c.metric != null && (
                        <p className="text-xs text-muted-foreground">Metric: {String(c.metric)}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}
          {hasGaps && (
            <AccordionItem value="data-gaps">
              <AccordionTrigger value="data-gaps">
                <span>Data gaps</span>
                <span className="ml-2 text-xs text-muted-foreground">{dataGaps.length} item(s)</span>
              </AccordionTrigger>
              <AccordionContent value="data-gaps">
                <ul className="space-y-2">
                  {dataGaps.map((g) => (
                    <li key={g.id} className="rounded border-l-2 border-l-amber-500 pl-3 py-1 text-sm">
                      <span className="font-medium">{g.title}</span>
                      <p className="text-muted-foreground">{g.description}</p>
                      {g.suggestion && (
                        <p className="text-xs text-muted-foreground">Suggestion: {g.suggestion}</p>
                      )}
                    </li>
                  ))}
                </ul>
              </AccordionContent>
            </AccordionItem>
          )}
        </Accordion>
      )}
    </div>
  );
}
