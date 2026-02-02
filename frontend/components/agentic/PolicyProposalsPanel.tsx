'use client';

import * as React from 'react';
import type { PolicyProposal } from '@/lib/agentic-types';
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from '@/components/ui/accordion';

export function PolicyProposalsPanel({
  policyProposals = [],
  className,
}: {
  policyProposals?: PolicyProposal[];
  className?: string;
}) {
  if (!policyProposals.length) return null;

  return (
    <div className={`space-y-2 ${className ?? ''}`}>
      <h3 className="text-sm font-semibold text-foreground">Agentic policy proposals</h3>
      <p className="text-xs text-muted-foreground">
        The CPA policy reviewer suggested the following based on your statements and quality checks.
      </p>
      <Accordion type="multiple" className="w-full">
        {policyProposals.map((p, i) => (
          <AccordionItem key={i} value={`proposal-${i}`}>
            <AccordionTrigger>
              <span className="font-medium">{p.policyArea}</span>
              <span className="ml-2 text-xs text-muted-foreground">
                confidence {Math.round(p.confidence * 100)}%
              </span>
            </AccordionTrigger>
            <AccordionContent className="space-y-2 text-sm">
              <p><span className="font-medium">Change:</span> {p.changeDescription}</p>
              <p className="text-muted-foreground">{p.reasoning}</p>
              {p.citation && (
                <p className="text-xs text-muted-foreground">Citation: {p.citation}</p>
              )}
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
