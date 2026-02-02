'use client';

import * as React from 'react';
import {
  Send,
  Brain,
  Code2,
  ShieldCheck,
  Loader2,
  MessageSquare,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { cn } from '@/lib/utils';
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
import { justifyQuestion } from '@/lib/api';

// --- Types ---

export type BotState = 'idle' | 'thinking' | 'writing_code' | 'checking_compliance';

export interface StatementLineLike {
  label: string;
  amount: number | string;
  accountCode?: string;
}

export interface BalanceSheetLike {
  report_date?: string;
  assets?: StatementLineLike[];
  liabilities?: StatementLineLike[];
  equity?: StatementLineLike[];
  total_assets?: number | string;
  total_liabilities?: number | string;
  total_equity?: number | string;
}

export interface ProfitAndLossLike {
  report_date?: string;
  revenue?: StatementLineLike[];
  expenses?: StatementLineLike[];
  total_revenue?: number | string;
  total_expenses?: number | string;
  net_income?: number | string;
}

export interface ChartDataPoint {
  period?: string;
  name?: string;
  [key: string]: number | string | undefined;
}

export interface GenUIStructuredContent {
  balance_sheet?: BalanceSheetLike;
  profit_and_loss?: ProfitAndLossLike;
  chartData?: ChartDataPoint[];
  chartTitle?: string;
  chartType?: 'line' | 'bar';
}

export interface GenUIChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string | GenUIStructuredContent;
  timestamp: string;
  state?: BotState;
}

/** Dynamic starter chip: label + query sent when clicked */
export interface GenUISuggestedAction {
  label: string;
  query: string;
  icon?: string;
}

interface GenUIChatProps {
  className?: string;
  onSendMessage?: (message: string) => Promise<{ content: string | GenUIStructuredContent; state?: BotState }>;
  defaultState?: BotState;
  /** Context label (e.g. "Dashboard", "Global Controller — Consolidated") for display */
  contextLabel?: string;
  /** Dynamic starter chips when chat is empty; clicking sends the query */
  suggestedActions?: GenUISuggestedAction[];
}

function parseAmount(value: number | string): number {
  if (typeof value === 'number') return value;
  const s = String(value).replace(/[$,]/g, '').trim();
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function formatCurrency(value: number | string): string {
  const n = typeof value === 'number' ? value : parseAmount(value);
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(n);
}

function isStructured(content: string | GenUIStructuredContent): content is GenUIStructuredContent {
  if (typeof content !== 'object' || content === null) return false;
  const c = content as Record<string, unknown>;
  return (
    !!c.balance_sheet ||
    !!c.profit_and_loss ||
    (Array.isArray(c.chartData) && c.chartData.length > 0)
  );
}

function tryParseJSON(content: string): string | GenUIStructuredContent {
  if (typeof content !== 'string') return content;
  const t = content.trim();
  if ((t.startsWith('{') && t.endsWith('}')) || (t.startsWith('[') && t.endsWith(']'))) {
    try {
      return JSON.parse(t) as GenUIStructuredContent;
    } catch {
      return content;
    }
  }
  return content;
}

// --- Bot state indicator ---
function BotStateIndicator({ state }: { state: BotState }) {
  const config: Record<BotState, { icon: React.ElementType; label: string; className: string }> = {
    idle: { icon: MessageSquare, label: 'Ready', className: 'text-muted-foreground' },
    thinking: { icon: Brain, label: 'Thinking…', className: 'text-primary animate-pulse' },
    writing_code: { icon: Code2, label: 'Writing Code…', className: 'text-amber-600' },
    checking_compliance: { icon: ShieldCheck, label: 'Checking Compliance…', className: 'text-emerald-600' },
  };
  const { icon: Icon, label, className } = config[state];
  return (
    <div className={cn('flex items-center gap-2 text-sm', className)}>
      {state !== 'idle' && <Loader2 className="h-4 w-4 animate-spin" />}
      <Icon className="h-4 w-4" />
      <span>{label}</span>
    </div>
  );
}

// --- Clickable number cell (sub-query: "Explain the source transactions for this $X amount.") ---
function ClickableAmount({
  amount,
  label,
  onExplain,
  className,
}: {
  amount: number | string;
  label: string;
  onExplain: (query: string, amount: number, label: string) => void;
  className?: string;
}) {
  const n = parseAmount(amount);
  const formatted = formatCurrency(n);
  const handleClick = () => {
    onExplain(`Explain the source transactions for this ${formatted} amount.`, n, label);
  };
  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        'tabular-nums text-right underline decoration-dotted underline-offset-2',
        'hover:decoration-solid hover:text-primary focus:outline-none focus:ring-2 focus:ring-primary/50 rounded px-1',
        className
      )}
      title={`Explain source transactions for ${formatted}`}
    >
      {formatted}
    </button>
  );
}

// --- Render structured table (Balance Sheet / P&L) with clickable numbers ---
function StructuredTable({
  data,
  onExplainAmount,
}: {
  data: BalanceSheetLike | ProfitAndLossLike;
  onExplainAmount: (query: string, amount: number, label: string) => void;
}) {
  const sections: { title: string; rows: StatementLineLike[]; total?: number | string }[] = [];
  const bs = data as BalanceSheetLike;
  const pl = data as ProfitAndLossLike;

  if (bs.assets?.length) {
    sections.push({ title: 'Assets', rows: bs.assets, total: bs.total_assets });
  }
  if (bs.liabilities?.length) {
    sections.push({ title: 'Liabilities', rows: bs.liabilities, total: bs.total_liabilities });
  }
  if (bs.equity?.length) {
    sections.push({ title: 'Equity', rows: bs.equity, total: bs.total_equity });
  }
  if (pl.revenue?.length) {
    sections.push({ title: 'Revenue', rows: pl.revenue, total: pl.total_revenue });
  }
  if (pl.expenses?.length) {
    sections.push({ title: 'Expenses', rows: pl.expenses, total: pl.total_expenses });
  }
  if (sections.length === 0) return null;

  return (
    <div className="rounded-md border bg-muted/30 overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Account</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sections.map((sec) => (
            <React.Fragment key={sec.title}>
              <TableRow className="bg-muted/50">
                <TableCell colSpan={2} className="font-medium text-muted-foreground">
                  {sec.title}
                </TableCell>
              </TableRow>
              {sec.rows.map((row, i) => (
                <TableRow key={`${row.label}-${i}`}>
                  <TableCell className="font-medium">{row.label}</TableCell>
                  <TableCell className="text-right">
                    <ClickableAmount
                      amount={row.amount}
                      label={row.label}
                      onExplain={onExplainAmount}
                    />
                  </TableCell>
                </TableRow>
              ))}
              {sec.total !== undefined && (
                <TableRow className="font-medium">
                  <TableCell>Total {sec.title}</TableCell>
                  <TableCell className="text-right">
                    <ClickableAmount
                      amount={sec.total}
                      label={`Total ${sec.title}`}
                      onExplain={onExplainAmount}
                    />
                  </TableCell>
                </TableRow>
              )}
            </React.Fragment>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

// --- Chart Agent: Recharts line graph inside chat bubble ---
function ChartAgent({
  chartData,
  chartTitle,
  chartType = 'line',
}: {
  chartData: ChartDataPoint[];
  chartTitle?: string;
  chartType?: 'line' | 'bar';
}) {
  if (!chartData?.length) return null;
  const first = chartData[0] as Record<string, unknown>;
  const keys = Object.keys(first).filter((k) => k !== 'period' && k !== 'name' && typeof first[k] === 'number');
  const dataKey = keys[0] ?? 'value';
  const xKey = 'period' in first ? 'period' : 'name' in first ? 'name' : Object.keys(first)[0] ?? 'name';

  return (
    <div className="rounded-md border bg-muted/30 p-3 min-h-[240px]">
      {chartTitle && (
        <p className="text-sm font-medium text-muted-foreground mb-2">{chartTitle}</p>
      )}
      <ResponsiveContainer width="100%" height={220}>
        <LineChart data={chartData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey={xKey} tick={{ fontSize: 11 }} />
          <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => `$${v >= 1000 ? `${(v / 1000).toFixed(0)}k` : v}`} />
          <Tooltip
            formatter={(value: number) => [`$${Number(value).toLocaleString()}`, dataKey]}
            contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))' }}
          />
          <Legend />
          {keys.slice(0, 4).map((key, i) => (
            <Line
              key={key}
              type="monotone"
              dataKey={key}
              stroke={['hsl(var(--primary))', 'hsl(var(--muted-foreground))', '#f59e0b', '#10b981'][i % 4]}
              strokeWidth={2}
              name={key.replace(/_/g, ' ')}
              dot={{ r: 3 }}
            />
          ))}
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

// --- Single message content: text, structured table, or chart ---
function MessageContent({
  content,
  onExplainAmount,
}: {
  content: string | GenUIStructuredContent;
  onExplainAmount: (query: string, amount: number, label: string) => void;
}) {
  const parsed = tryParseJSON(typeof content === 'string' ? content : JSON.stringify(content));
  const structured = typeof parsed === 'object' && isStructured(parsed) ? parsed : null;

  if (structured) {
    return (
      <div className="space-y-3">
        {structured.balance_sheet && (
          <StructuredTable data={structured.balance_sheet} onExplainAmount={onExplainAmount} />
        )}
        {structured.profit_and_loss && (
          <StructuredTable data={structured.profit_and_loss} onExplainAmount={onExplainAmount} />
        )}
        {structured.chartData && structured.chartData.length > 0 && (
          <ChartAgent
            chartData={structured.chartData}
            chartTitle={structured.chartTitle}
            chartType={structured.chartType}
          />
        )}
      </div>
    );
  }

  const text = typeof parsed === 'string' ? parsed : JSON.stringify(parsed);
  return <p className="whitespace-pre-wrap text-sm">{text}</p>;
}

// --- Main GenUI Chat ---
export function GenUIChat({
  className,
  onSendMessage,
  defaultState = 'idle',
  contextLabel,
  suggestedActions = [],
}: GenUIChatProps) {
  const [messages, setMessages] = React.useState<GenUIChatMessage[]>([]);
  const [input, setInput] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [botState, setBotState] = React.useState<BotState>(defaultState);
  const scrollRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const sendQuery = React.useCallback(
    (query: string) => {
      setMessages((prev) => [
        ...prev,
        { id: `user-${Date.now()}`, role: 'user', content: query, timestamp: new Date().toISOString() },
      ]);
      setInput('');
      setLoading(true);
      setBotState('thinking');
      const stateCycle: BotState[] = ['thinking', 'writing_code', 'checking_compliance'];
      let cycleIndex = 0;
      const cycleInterval = window.setInterval(() => {
        cycleIndex = (cycleIndex + 1) % stateCycle.length;
        setBotState(stateCycle[cycleIndex]);
      }, 800);
      (async () => {
        try {
          let result: { content: string | GenUIStructuredContent; state?: BotState };
          if (onSendMessage) {
            result = await onSendMessage(query);
          } else {
            setBotState('checking_compliance');
            const res = await justifyQuestion(query);
            result = {
              content: res.citation ? `${res.citation}\n\n${res.explanation ?? ''}` : (res.explanation ?? ''),
              state: 'idle',
            };
          }
          setBotState(result.state ?? 'idle');
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              role: 'assistant',
              content: result.content,
              timestamp: new Date().toISOString(),
              state: result.state,
            },
          ]);
        } catch (err) {
          setMessages((prev) => [
            ...prev,
            {
              id: `bot-${Date.now()}`,
              role: 'assistant',
              content: err instanceof Error ? err.message : 'Request failed.',
              timestamp: new Date().toISOString(),
              state: 'idle',
            },
          ]);
          setBotState('idle');
        } finally {
          window.clearInterval(cycleInterval);
          setLoading(false);
          setBotState('idle');
        }
      })();
    },
    [onSendMessage]
  );

  const handleExplainAmount = React.useCallback(
    async (query: string, _amount: number, _label: string) => {
      setInput(query);
      setMessages((prev) => [
        ...prev,
        {
          id: `user-${Date.now()}`,
          role: 'user',
          content: query,
          timestamp: new Date().toISOString(),
        },
      ]);
      setInput('');
      setLoading(true);
      setBotState('thinking');

      let content: string | GenUIStructuredContent = '';
      try {
        const res = await justifyQuestion(query);
        content = res.citation
          ? `${res.citation}\n\n${res.explanation ?? ''}`
          : (res.explanation ?? 'No explanation returned.');
      } catch (err) {
        content = err instanceof Error ? err.message : 'Unable to reach justification service.';
      }

      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          role: 'assistant',
          content,
          timestamp: new Date().toISOString(),
        },
      ]);
      setLoading(false);
      setBotState('idle');
    },
    []
  );

  const sendMessage = async () => {
    const q = input.trim();
    if (!q || loading) return;

    const userMsg: GenUIChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: q,
      timestamp: new Date().toISOString(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput('');
    setLoading(true);
    setBotState('thinking');

    const stateCycle: BotState[] = ['thinking', 'writing_code', 'checking_compliance'];
    let cycleIndex = 0;
    let cycleInterval: number | undefined;
    cycleInterval = window.setInterval(() => {
      cycleIndex = (cycleIndex + 1) % stateCycle.length;
      setBotState(stateCycle[cycleIndex]);
    }, 800);

    try {
      let result: { content: string | GenUIStructuredContent; state?: BotState };
      if (onSendMessage) {
        result = await onSendMessage(q);
      } else {
        setBotState('checking_compliance');
        const res = await justifyQuestion(q);
        result = {
          content: res.citation ? `${res.citation}\n\n${res.explanation ?? ''}` : (res.explanation ?? ''),
          state: 'idle',
        };
      }
      setBotState(result.state ?? 'idle');
      const assistantMsg: GenUIChatMessage = {
        id: `bot-${Date.now()}`,
        role: 'assistant',
        content: result.content,
        timestamp: new Date().toISOString(),
        state: result.state,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } catch (err) {
      const errorContent = err instanceof Error ? err.message : 'Request failed.';
      setMessages((prev) => [
        ...prev,
        {
          id: `bot-${Date.now()}`,
          role: 'assistant',
          content: errorContent,
          timestamp: new Date().toISOString(),
          state: 'idle',
        },
      ]);
      setBotState('idle');
    } finally {
      if (cycleInterval) window.clearInterval(cycleInterval);
      setLoading(false);
      setBotState('idle');
    }
  };

  return (
    <div className={cn('flex flex-col h-[600px] rounded-lg border bg-card', className)}>
      {/* Bot state bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30">
        <div className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5 text-primary" />
          <span className="font-medium text-sm">GenUI Chat</span>
          {contextLabel && (
            <span className="text-xs text-muted-foreground font-normal">— {contextLabel}</span>
          )}
        </div>
        <BotStateIndicator state={loading ? botState : 'idle'} />
      </div>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.length === 0 && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Ask a question or pick a suggested action. Numbers in tables are clickable for source explanations.
              </p>
              {suggestedActions.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {suggestedActions.map((action, i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => sendQuery(action.query)}
                      className="inline-flex items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-sm font-medium text-foreground hover:bg-muted hover:border-primary/40 transition-colors"
                    >
                      {action.icon && <span aria-hidden>{action.icon}</span>}
                      {action.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          {messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                'rounded-lg px-4 py-3 text-sm max-w-full',
                m.role === 'user'
                  ? 'ml-8 bg-primary text-primary-foreground'
                  : 'mr-8 bg-muted'
              )}
            >
              {m.role === 'user' ? (
                <p className="whitespace-pre-wrap">{String(m.content)}</p>
              ) : (
                <MessageContent content={m.content} onExplainAmount={handleExplainAmount} />
              )}
            </div>
          ))}
          {loading && (
            <div className="mr-8 rounded-lg bg-muted px-4 py-3 text-sm flex items-center gap-2 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              <BotStateIndicator state={botState} />
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <div className="p-4 border-t flex gap-2">
        <Input
          placeholder="Ask for Balance Sheet, P&L, trends, or any question…"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && sendMessage()}
          className="flex-1"
        />
        <Button onClick={sendMessage} disabled={loading} size="icon" title="Send">
          <Send className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
}
