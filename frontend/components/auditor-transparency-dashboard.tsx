'use client';

import * as React from 'react';
import {
  FileUp,
  Scale,
  Code2,
  CheckCircle2,
  Download,
  FileText,
  ChevronRight,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { TooltipSimple } from '@/components/ui/tooltip-simple';

// --- Trace timeline steps ---
export type TraceStepId = 'document_uploaded' | 'cpa_justification' | 'python_calculation' | 'supervisor_approval';

export interface TraceStep {
  id: TraceStepId;
  label: string;
  description?: string;
  timestamp?: string;
  icon: React.ReactNode;
}

const DEFAULT_TRACE_STEPS: TraceStep[] = [
  {
    id: 'document_uploaded',
    label: 'Document Uploaded',
    description: 'Trial balance or source document ingested',
    timestamp: undefined,
    icon: <FileUp className="h-5 w-5" />,
  },
  {
    id: 'cpa_justification',
    label: 'CPA Justification',
    description: 'Accounting treatment and FASB/IFRS rationale',
    timestamp: undefined,
    icon: <Scale className="h-5 w-5" />,
  },
  {
    id: 'python_calculation',
    label: 'Python Calculation',
    description: 'Quantitative engine (NPV, ratios, roll-ups)',
    timestamp: undefined,
    icon: <Code2 className="h-5 w-5" />,
  },
  {
    id: 'supervisor_approval',
    label: 'Supervisor Approval',
    description: 'Engagement partner sign-off',
    timestamp: undefined,
    icon: <CheckCircle2 className="h-5 w-5" />,
  },
];

// --- Statement line with optional FASB/IFRS citation ---
export interface StatementLineWithCitation {
  label: string;
  amount: number | string;
  accountCode?: string;
  /** FASB/IFRS paragraph for hover tooltip, e.g. "ASC 210-10-45", "IAS 1.54" */
  citation?: string;
}

export interface StatementSection {
  title: string;
  lines: StatementLineWithCitation[];
  total?: number | string;
  totalCitation?: string;
}

export interface AuditorTransparencyDashboardProps {
  /** Entity and period for the generated statement */
  entityName?: string;
  periodStart?: string;
  periodEnd?: string;
  reportDate?: string;
  /** Balance sheet sections (assets, liabilities, equity) */
  balanceSheetSections?: StatementSection[];
  /** P&L sections (revenue, expenses) */
  profitAndLossSections?: StatementSection[];
  /** Trace timeline steps (default: Document → CPA → Python → Supervisor) */
  traceSteps?: TraceStep[];
  /** Callback to build and download the Audit Evidence Package zip */
  onDownloadEvidencePackage?: () => Promise<void>;
  className?: string;
}

function formatAmount(value: number | string): string {
  const n = typeof value === 'number' ? value : parseFloat(String(value).replace(/[$,]/g, '')) || 0;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

/** Vertical Trace timeline (right side) */
function TraceView({ steps }: { steps: TraceStep[] }) {
  return (
    <div className="flex flex-col">
      {steps.map((step, i) => (
        <div key={step.id} className="flex gap-3">
          <div className="flex flex-col items-center">
            <div
              className={cn(
                'rounded-full p-2 border-2 bg-background',
                i === 0
                  ? 'border-primary text-primary'
                  : 'border-muted-foreground/30 text-muted-foreground'
              )}
            >
              {step.icon}
            </div>
            {i < steps.length - 1 && (
              <div className="w-0.5 flex-1 min-h-[24px] bg-border my-1" />
            )}
          </div>
          <div className="pb-6 flex-1">
            <p className="font-medium text-sm text-foreground">{step.label}</p>
            {step.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{step.description}</p>
            )}
            {step.timestamp && (
              <p className="text-xs text-muted-foreground mt-1 font-mono">{step.timestamp}</p>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Statement section with citation tooltips on each line */
function StatementSectionBlock({
  section,
  formatAmountFn,
}: {
  section: StatementSection;
  formatAmountFn: (v: number | string) => string;
}) {
  return (
    <div className="mb-4">
      <h4 className="text-sm font-semibold text-muted-foreground mb-2">{section.title}</h4>
      <table className="w-full text-sm">
        <tbody>
          {section.lines.map((line, i) => (
            <tr key={`${line.label}-${i}`} className="border-b border-border/50">
              <td className="py-1.5 pr-4">
                {line.citation ? (
                  <TooltipSimple
                    content={
                      <span className="font-mono">
                        {line.citation}
                        <br />
                        <span className="text-muted-foreground">FASB/IFRS paragraph cited for this line</span>
                      </span>
                    }
                    side="top"
                  >
                    <span className="border-b border-dotted border-muted-foreground cursor-help">
                      {line.label}
                    </span>
                  </TooltipSimple>
                ) : (
                  line.label
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {formatAmountFn(line.amount)}
              </td>
            </tr>
          ))}
          {section.total !== undefined && (
            <tr className="border-t border-border font-medium">
              <td className="py-2 pr-4">
                {section.totalCitation ? (
                  <TooltipSimple
                    content={
                      <span className="font-mono">
                        {section.totalCitation}
                      </span>
                    }
                    side="top"
                  >
                    <span className="border-b border-dotted border-muted-foreground cursor-help">
                      Total {section.title}
                    </span>
                  </TooltipSimple>
                ) : (
                  `Total ${section.title}`
                )}
              </td>
              <td className="py-2 text-right tabular-nums">{formatAmountFn(section.total)}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function AuditorTransparencyDashboard({
  entityName = 'Entity',
  periodStart,
  periodEnd,
  reportDate,
  balanceSheetSections = [],
  profitAndLossSections = [],
  traceSteps = DEFAULT_TRACE_STEPS,
  onDownloadEvidencePackage,
  className,
}: AuditorTransparencyDashboardProps) {
  const [exporting, setExporting] = React.useState(false);
  const hasStatement =
    balanceSheetSections.length > 0 || profitAndLossSections.length > 0;

  const handleDownload = async () => {
    if (onDownloadEvidencePackage) {
      setExporting(true);
      try {
        await onDownloadEvidencePackage();
      } finally {
        setExporting(false);
      }
    }
  };

  return (
    <div className={cn('rounded-lg border bg-card overflow-hidden', className)}>
      <CardHeader className="py-4 border-b flex flex-row items-center justify-between space-y-0">
        <div className="flex items-center gap-2">
          <FileText className="h-5 w-5 text-primary" />
          <CardTitle className="text-base">Auditor Transparency</CardTitle>
        </div>
        {onDownloadEvidencePackage && (
          <Button
            variant="outline"
            size="sm"
            onClick={handleDownload}
            disabled={exporting}
          >
            <Download className="h-4 w-4 mr-2" />
            {exporting ? 'Preparing…' : 'Download Audit Evidence Package'}
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-0">
        <div className="flex flex-col lg:flex-row">
          {/* Left: Statement content with citations */}
          <div className="flex-1 min-w-0 border-r border-border/50">
            <ScrollArea className="h-[420px]">
              <div className="p-4">
                <p className="text-sm text-muted-foreground mb-3">
                  {entityName}
                  {reportDate && ` — Report date: ${reportDate}`}
                  {periodStart && periodEnd && ` — Period: ${periodStart} to ${periodEnd}`}
                </p>
                {!hasStatement && (
                  <p className="text-sm text-muted-foreground">
                    Load Audit Binder to see generated statements with trace and citations.
                  </p>
                )}
                {balanceSheetSections.map((sec, i) => (
                  <StatementSectionBlock
                    key={`bs-${i}`}
                    section={sec}
                    formatAmountFn={formatAmount}
                  />
                ))}
                {profitAndLossSections.map((sec, i) => (
                  <StatementSectionBlock
                    key={`pl-${i}`}
                    section={sec}
                    formatAmountFn={formatAmount}
                  />
                ))}
              </div>
            </ScrollArea>
          </div>
          {/* Right: Trace View — vertical timeline */}
          <div className="w-full lg:w-72 shrink-0 bg-muted/20 p-4">
            <h3 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
              <ChevronRight className="h-4 w-4" />
              Trace
            </h3>
            <TraceView steps={traceSteps} />
          </div>
        </div>
      </CardContent>
    </div>
  );
}
