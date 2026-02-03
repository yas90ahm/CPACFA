'use client';

import * as React from 'react';
import Link from 'next/link';
import { Send, MessageSquare, Download } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { justifyQuestion, supervisorChat } from '@/lib/api';
import { logAudit, getCurrentUserId } from '@/lib/audit-log';
import { useExportNotification } from '@/components/notifications';
import { PdfPreviewThumbnail } from '@/components/notifications/pdf-preview-thumbnail';
import {
  ReasoningStreams,
  buildReasoningSteps,
} from '@/components/reasoning-streams';
import { useAgentThoughtStream, buildThoughtStreamSteps } from '@/components/agent';
import { TransactionInterrogatorModal } from '@/components/transaction-interrogator-modal';

const DATA_SAFETY_RESPONSE =
  'Your data is protected using SOC2-aligned controls and a zero-knowledge architecture. Only you and authorized users can access your financial data.';

export interface StatementRow {
  label: string;
  amount: number;
  accountCode?: string;
  section?: 'assets' | 'liabilities' | 'equity' | 'revenue' | 'expenses';
}

interface AgentWorkspaceProps {
  statementRows?: StatementRow[];
  statementTitle?: string;
  /** When provided and there's no data, empty state shows a "Load sample data" button that calls this. */
  onLoadSampleDataRequest?: () => void;
  className?: string;
}

interface ChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: string;
  reasoningPath?: string;
  citation?: string;
  thoughts?: string[];
  toolCalls?: Array<{ name: string; input?: unknown; result?: string }>;
}

export function AgentWorkspace({
  statementRows = [],
  statementTitle = 'Financial Statement',
  onLoadSampleDataRequest,
  className,
}: AgentWorkspaceProps) {
  const [messages, setMessages] = React.useState<ChatMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const [drillDownOpen, setDrillDownOpen] = React.useState(false);
  const [drillDownLineItem, setDrillDownLineItem] = React.useState('');
  const [drillDownAccountCode, setDrillDownAccountCode] = React.useState<string | undefined>(undefined);
  const exportCtx = useExportNotification();
  const { reportPreviewUrl, needsRegenerate, markNeedsRegenerate } = exportCtx;
  const { setStream: setThoughtStream } = useAgentThoughtStream();

  const openDrillDown = React.useCallback((label: string, accountCode?: string) => {
    setDrillDownLineItem(label);
    setDrillDownAccountCode(accountCode);
    setDrillDownOpen(true);
    markNeedsRegenerate();
  }, [markNeedsRegenerate]);

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || loading) return;

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setThoughtStream({ isThinking: true, steps: [] });

    let reasoningPath = 'User asked justification question.';
    let citation = '';
    let explanation = '';
    let thoughts: string[] = [];
    let toolCalls: Array<{ name: string; input?: unknown; result?: string }> = [];

    const isDataSafetyQuestion = /is (my|our) data safe|data safe|data safety|is (my|our) (data|info) (safe|secure)|how (do you |does the )?(you |system )?protect (my |our )?data/i.test(q);

    if (isDataSafetyQuestion) {
      explanation = DATA_SAFETY_RESPONSE;
      reasoningPath = 'Privacy & Security: SOC2 and Zero-Knowledge architecture summary.';
    } else {
      try {
        const entries =
          statementRows.length > 0
            ? statementRows.map((r) => {
                const amt = Math.abs(Number(r.amount)) || 0;
                const isDebit =
                  r.section === 'assets' || r.section === 'expenses';
                return {
                  accountName: r.label,
                  debit: isDebit ? amt : 0,
                  credit: isDebit ? 0 : amt,
                  accountCode: r.accountCode,
                };
              })
            : undefined;
        const res = await supervisorChat({ message: q, entries });
        explanation = res.response ?? '';
        thoughts = Array.isArray(res.thoughts) ? res.thoughts : [];
        toolCalls = Array.isArray(res.toolCalls) ? res.toolCalls : [];
        reasoningPath = thoughts.length
          ? `Supervisor ReAct: ${thoughts.length} thought(s), ${toolCalls.length} tool call(s).`
          : `Supervisor: ${explanation.slice(0, 150)}…`;
      } catch (err) {
        try {
          const res = await justifyQuestion(q);
          citation = res.citation ?? '';
          explanation = res.explanation ?? '';
          reasoningPath = `Justification Engine: ${res.citation}. ${(res.supporting_detail ?? '').slice(0, 200)}`;
        } catch (fallbackErr) {
          explanation = err instanceof Error ? err.message : 'Unable to reach Supervisor or justification service.';
          reasoningPath = `Error: ${explanation}`;
        }
      }
    }

    logAudit({
      userId: getCurrentUserId(),
      action: 'justification_request',
      resource: q.slice(0, 100),
      reasoningPath,
      metadata: { citation, questionLength: q.length, thoughtCount: thoughts.length },
    });

    setThoughtStream({
      isThinking: false,
      steps: thoughts.length || toolCalls.length ? buildThoughtStreamSteps(thoughts, toolCalls) : [],
    });

    const assistantMsg: ChatMessage = {
      id: `bot-${Date.now()}`,
      role: 'assistant',
      content: citation ? `${citation}\n\n${explanation}` : explanation,
      timestamp: new Date().toISOString(),
      reasoningPath,
      citation: citation || undefined,
      thoughts: thoughts.length ? thoughts : undefined,
      toolCalls: toolCalls.length ? toolCalls : undefined,
    };
    setMessages((prev) => [...prev, assistantMsg]);
    setLoading(false);
  };

  const formatAmount = (n: number) =>
    new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(n);

  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[520px]', className)}>
      {/* Left: Your statements */}
      <Card className="flex flex-col overflow-hidden shadow-calm border border-border rounded-md">
        <CardHeader className="py-5 px-5 border-b border-border/50">
          <CardTitle className="text-base font-semibold">{statementTitle}</CardTitle>
        </CardHeader>
        <CardContent className="flex-1 overflow-hidden p-0">
          <ScrollArea className="h-full">
            <Table>
              <TableHeader>
                <TableRow className="hover:bg-transparent border-border/50">
                  <TableHead className="font-medium text-muted-foreground">Account</TableHead>
                  <TableHead className="text-right font-medium text-muted-foreground">Amount</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {statementRows.length === 0 ? (
                  <TableRow className="hover:bg-transparent">
                    <TableCell colSpan={2} className="text-center text-muted-foreground text-sm py-12">
                      Upload a trial balance or load sample data to see your statements here.
                    </TableCell>
                  </TableRow>
                ) : (
                  statementRows.map((row, i) => {
                    const isHighlight =
                      /net income|total assets/i.test(row.label ?? '');
                    return (
                      <TableRow
                        key={`${row.label}-${i}`}
                        className={isHighlight ? 'table-row-highlight' : undefined}
                      >
                        <TableCell className="font-medium">{row.label}</TableCell>
                        <TableCell className="text-right font-mono tabular-nums font-medium" data-currency>
                          {formatAmount(row.amount)}
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>

      {/* Right: Chat with your partner */}
      <Card className="flex flex-col overflow-hidden shadow-calm border border-border rounded-md" data-onboarding="agent-reasoning">
        <CardHeader className="py-5 px-5 border-b border-border flex flex-row items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-md bg-primary/10 text-primary">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div>
            <CardTitle className="text-base font-semibold">Chat with your partner</CardTitle>
            <p className="text-xs text-muted-foreground mt-0.5">Justifications, codification, drill-downs</p>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col flex-1 min-h-0 p-0">
          <div className="px-4 pt-3 flex items-center gap-2 shrink-0">
            <PdfPreviewThumbnail
              previewUrl={reportPreviewUrl}
              label="PDF Preview"
              onOpenPreview={reportPreviewUrl ? () => window.open(reportPreviewUrl!, '_blank') : undefined}
            />
            <Link href="/auditor" className="shrink-0" data-onboarding="export-button">
              <Button
                variant="outline"
                size="sm"
                className={cn('rounded-md border-primary/30 text-primary hover:bg-primary/10', needsRegenerate && 'export-download-pulse')}
              >
                <Download className="h-4 w-4 mr-2" />
                {needsRegenerate ? 'Re-download report' : 'Download report'}
              </Button>
            </Link>
          </div>
          <ScrollArea className="flex-1 px-4">
            <div className="space-y-5 py-4">
              {messages.length === 0 && (
                <div className="rounded-md border border-dashed border-border bg-muted/30 px-4 py-6 text-center space-y-4">
                  <p className="text-sm text-foreground font-medium">
                    {statementRows.length === 0
                      ? 'Add your data to get cited answers'
                      : 'Ask anything — e.g. &quot;Why was this capitalized?&quot; or &quot;Which FASB codification applies?&quot;'}
                  </p>
                  {statementRows.length === 0 ? (
                    <>
                      <p className="text-xs text-muted-foreground">Load sample data or upload a trial balance below — then ask about treatment, codification, or drill-downs.</p>
                      {onLoadSampleDataRequest && (
                        <Button
                          type="button"
                          onClick={onLoadSampleDataRequest}
                          className="rounded-md bg-primary hover:bg-primary/90 text-primary-foreground gap-2"
                        >
                          <MessageSquare className="h-4 w-4" />
                          Load sample data
                        </Button>
                      )}
                    </>
                  ) : (
                    <p className="text-xs text-muted-foreground">Your partner uses your statement data to give precise, cited answers.</p>
                  )}
                </div>
              )}
              {messages.map((m) => (
                <div key={m.id} className="space-y-2">
                  {m.role === 'assistant' && (m.thoughts?.length ?? 0) > 0 && (
                    <ReasoningStreams
                      isThinking={false}
                      steps={buildReasoningSteps(m.thoughts ?? [], m.toolCalls ?? [])}
                      typingEffect
                      className="shrink-0"
                    />
                  )}
                  <div
                    className={cn(
                      'rounded-md px-4 py-3 text-sm max-w-[85%]',
                      m.role === 'user'
                        ? 'ml-auto bg-primary text-primary-foreground shadow-sm'
                        : 'mr-auto bg-muted/80 border border-border/60'
                    )}
                  >
                    <p className="whitespace-pre-wrap leading-relaxed">{m.content}</p>
                    {m.citation && (
                      <p className="mt-2 text-xs opacity-90 font-mono border-t border-border/40 pt-2">{m.citation}</p>
                    )}
                  </div>
                </div>
              ))}
              {loading && (
                <>
                  <ReasoningStreams isThinking steps={[]} typingEffect={false} className="shrink-0" />
                  <div className="mr-auto max-w-[85%] rounded-md bg-muted/80 border border-border px-4 py-3 text-sm text-muted-foreground">
                    Thinking…
                  </div>
                </>
              )}
              <div ref={scrollRef} />
            </div>
          </ScrollArea>
          <div className="p-4 border-t border-border flex gap-3 bg-muted/20">
            <Input
              placeholder="Ask your partner anything…"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
              className="flex-1 rounded-md border border-border bg-background focus-visible:ring-primary/50"
            />
            <Button onClick={sendMessage} disabled={loading} size="icon" className="rounded-md bg-primary hover:bg-primary/90 text-primary-foreground h-10 w-10 shrink-0">
              <Send className="h-4 w-4" />
            </Button>
          </div>
        </CardContent>
      </Card>

      <TransactionInterrogatorModal
        open={drillDownOpen}
        onClose={() => setDrillDownOpen(false)}
        lineItemLabel={drillDownLineItem}
        accountCode={drillDownAccountCode}
      />
    </div>
  );
}
