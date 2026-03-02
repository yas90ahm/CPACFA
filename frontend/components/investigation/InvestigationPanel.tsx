'use client';

import { useState, useRef, useEffect } from 'react';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { useInvestigateVariance, useDrilldownAccount, useInvestigateChat } from '@/lib/queries/investigation';
import { cn } from '@/lib/utils';
import type { InvestigationResult, AccountDelta, AccountDrilldown, ChatMessage } from '@/lib/types/investigation';
import { ChevronRight, MessageSquare, ArrowLeft, Send, Loader2, Search } from 'lucide-react';

export interface InvestigationPanelProps {
  open: boolean;
  onClose: () => void;
  sessionId: string;
  varianceId: string;
  fsLineId: string;
  lineItemLabel: string;
  currentPeriodId: string;
  priorPeriodId: string;
  onUseExplanation?: (text: string) => void;
}

type ViewState = 'loading' | 'results' | 'drilldown' | 'chat';

export function InvestigationPanel({
  open,
  onClose,
  sessionId,
  fsLineId,
  lineItemLabel,
  currentPeriodId,
  priorPeriodId,
  onUseExplanation,
}: InvestigationPanelProps) {
  const [view, setView] = useState<ViewState>('loading');
  const [result, setResult] = useState<InvestigationResult | null>(null);
  const [drilldown, setDrilldown] = useState<AccountDrilldown | null>(null);
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatInput, setChatInput] = useState('');
  const chatEndRef = useRef<HTMLDivElement>(null);

  const investigateMutation = useInvestigateVariance(sessionId);
  const drilldownMutation = useDrilldownAccount(sessionId);
  const chatMutation = useInvestigateChat(sessionId);

  useEffect(() => {
    if (open && fsLineId && currentPeriodId && priorPeriodId) {
      setView('loading');
      setResult(null);
      setDrilldown(null);
      setChatMessages([]);
      investigateMutation.mutate(
        { fs_line_id: fsLineId, current_period_id: currentPeriodId, prior_period_id: priorPeriodId },
        {
          onSuccess: (data) => { setResult(data); setView('results'); },
          onError: () => setView('results'),
        }
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, fsLineId, currentPeriodId, priorPeriodId]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chatMessages]);

  const handleDrilldown = (account: AccountDelta) => {
    drilldownMutation.mutate(
      { account_code: account.account_code, period_id: currentPeriodId },
      {
        onSuccess: (data) => { setDrilldown(data); setView('drilldown'); },
      }
    );
  };

  const handleSendChat = () => {
    const question = chatInput.trim();
    if (!question) return;
    const userMsg: ChatMessage = { role: 'user', content: question, timestamp: new Date().toISOString() };
    setChatMessages((prev) => [...prev, userMsg]);
    setChatInput('');

    chatMutation.mutate(
      {
        fs_line_id: fsLineId,
        question,
        conversation_history: [...chatMessages, userMsg].map((m) => ({ role: m.role, content: m.content })),
      },
      {
        onSuccess: (data) => {
          setChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: data.response, timestamp: new Date().toISOString() },
          ]);
        },
        onError: () => {
          setChatMessages((prev) => [
            ...prev,
            { role: 'assistant', content: 'Sorry, I encountered an error processing your question.', timestamp: new Date().toISOString() },
          ]);
        },
      }
    );
  };

  const buildExplanationText = (): string => {
    if (!result) return '';
    const parts: string[] = [];
    parts.push(`${result.line_item_label}: ${result.delta} (${result.delta_pct}) period-over-period change.`);
    if (result.top_accounts.length > 0) {
      parts.push('Key drivers:');
      result.top_accounts.slice(0, 3).forEach((a) => {
        parts.push(`- ${a.account_name} (${a.account_code}): ${a.delta} (${a.contribution_pct} of total change)`);
      });
    }
    if (result.new_accounts.length > 0) {
      parts.push(`New accounts: ${result.new_accounts.map((a) => a.account_name).join(', ')}`);
    }
    if (result.eliminated_accounts.length > 0) {
      parts.push(`Eliminated accounts: ${result.eliminated_accounts.map((a) => a.account_name).join(', ')}`);
    }
    return parts.join('\n');
  };

  return (
    <SlideOverPanel
      open={open}
      onClose={onClose}
      title={`Investigate: ${lineItemLabel}`}
      width={640}
      footer={
        view === 'results' && result && onUseExplanation ? (
          <button
            type="button"
            className="px-4 py-2 rounded-input bg-ai-purple text-white text-sm font-medium hover:opacity-90"
            onClick={() => { onUseExplanation(buildExplanationText()); onClose(); }}
          >
            Use as Explanation
          </button>
        ) : undefined
      }
    >
      {/* Tab bar */}
      {view !== 'loading' && (
        <div className="flex items-center gap-2 mb-4 -mt-2">
          {view === 'drilldown' && (
            <button type="button" onClick={() => setView('results')} className="p-1 rounded hover:bg-hover text-text-secondary">
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
          <button
            type="button"
            onClick={() => setView('results')}
            className={cn('px-3 py-1.5 rounded text-xs font-medium', view === 'results' || view === 'drilldown' ? 'bg-accent-dim text-accent' : 'text-text-secondary hover:bg-hover')}
          >
            <Search className="w-3 h-3 inline mr-1" /> Analysis
          </button>
          <button
            type="button"
            onClick={() => setView('chat')}
            className={cn('px-3 py-1.5 rounded text-xs font-medium', view === 'chat' ? 'bg-accent-dim text-accent' : 'text-text-secondary hover:bg-hover')}
          >
            <MessageSquare className="w-3 h-3 inline mr-1" /> Chat
          </button>
        </div>
      )}

      {/* Loading */}
      {view === 'loading' && (
        <div className="flex flex-col items-center justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-accent mb-3" />
          <p className="text-text-secondary text-sm">Analyzing variance...</p>
        </div>
      )}

      {/* Results View */}
      {view === 'results' && result && (
        <div className="space-y-6">
          {/* Summary */}
          <div className="bg-elevated rounded-card p-4">
            <div className="grid grid-cols-3 gap-4 text-center">
              <div>
                <div className="text-xs text-text-secondary">Current</div>
                <div className="font-mono font-medium"><MoneyCell value={result.current_total} showDollar /></div>
              </div>
              <div>
                <div className="text-xs text-text-secondary">Prior</div>
                <div className="font-mono font-medium"><MoneyCell value={result.prior_total} showDollar /></div>
              </div>
              <div>
                <div className="text-xs text-text-secondary">Change</div>
                <div className={cn('font-mono font-medium', parseFloat(result.delta) >= 0 ? 'text-status-green' : 'text-status-red')}>
                  <MoneyCell value={result.delta} showDollar /> ({result.delta_pct})
                </div>
              </div>
            </div>
          </div>

          {/* Top contributing accounts */}
          {result.top_accounts.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-text-secondary mb-2">Top Contributing Accounts</h3>
              <div className="space-y-1">
                {result.top_accounts.map((a) => (
                  <button
                    key={a.account_code}
                    type="button"
                    onClick={() => handleDrilldown(a)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-input hover:bg-hover text-left"
                  >
                    <div>
                      <span className="font-mono text-xs text-text-secondary mr-2">{a.account_code}</span>
                      <span className="text-sm text-primary">{a.account_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={cn('font-mono text-sm', parseFloat(a.delta) >= 0 ? 'text-status-green' : 'text-status-red')}>
                        <MoneyCell value={a.delta} showDollar />
                      </span>
                      <span className="text-xs text-text-tertiary">{a.contribution_pct}</span>
                      <ChevronRight className="w-4 h-4 text-text-tertiary" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* New accounts */}
          {result.new_accounts.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-status-green mb-2">New Accounts (this period)</h3>
              <div className="space-y-1">
                {result.new_accounts.map((a) => (
                  <button
                    key={a.account_code}
                    type="button"
                    onClick={() => handleDrilldown(a)}
                    className="w-full flex items-center justify-between px-3 py-2 rounded-input hover:bg-hover text-left"
                  >
                    <div>
                      <span className="font-mono text-xs text-text-secondary mr-2">{a.account_code}</span>
                      <span className="text-sm text-primary">{a.account_name}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-sm text-status-green"><MoneyCell value={a.current_balance} showDollar /></span>
                      <ChevronRight className="w-4 h-4 text-text-tertiary" />
                    </div>
                  </button>
                ))}
              </div>
            </section>
          )}

          {/* Eliminated accounts */}
          {result.eliminated_accounts.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-status-red mb-2">Eliminated Accounts</h3>
              <div className="space-y-1">
                {result.eliminated_accounts.map((a) => (
                  <div key={a.account_code} className="flex items-center justify-between px-3 py-2 text-text-secondary">
                    <div>
                      <span className="font-mono text-xs mr-2">{a.account_code}</span>
                      <span className="text-sm">{a.account_name}</span>
                    </div>
                    <span className="font-mono text-sm text-status-red"><MoneyCell value={a.prior_balance} showDollar /></span>
                  </div>
                ))}
              </div>
            </section>
          )}

          {/* Top memos */}
          {result.top_memos.length > 0 && (
            <section>
              <h3 className="text-sm font-medium text-text-secondary mb-2">Common Transaction Memos</h3>
              <ul className="space-y-1 text-sm text-text-secondary">
                {result.top_memos.map((m, i) => (
                  <li key={i} className="px-3 py-1 rounded bg-elevated">"{m}"</li>
                ))}
              </ul>
            </section>
          )}
        </div>
      )}

      {view === 'results' && !result && !investigateMutation.isPending && (
        <div className="py-12 text-center text-text-secondary">
          <p>No investigation data available.</p>
          {investigateMutation.isError && <p className="text-status-red text-sm mt-2">Failed to load analysis. The investigation endpoint may not be available.</p>}
        </div>
      )}

      {/* Drilldown View */}
      {view === 'drilldown' && drilldown && (
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-primary">{drilldown.account_name}</h3>
            <p className="text-xs text-text-secondary font-mono">{drilldown.account_code}</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 text-xs text-text-secondary">Date</th>
                  <th className="text-left py-2 text-xs text-text-secondary">Description</th>
                  <th className="text-right py-2 text-xs text-text-secondary">Debit</th>
                  <th className="text-right py-2 text-xs text-text-secondary">Credit</th>
                  <th className="text-left py-2 text-xs text-text-secondary">JE #</th>
                </tr>
              </thead>
              <tbody>
                {drilldown.entries.map((e, i) => (
                  <tr key={i} className="border-b border-border-light">
                    <td className="py-1.5 font-mono text-xs">{e.date}</td>
                    <td className="py-1.5" title={e.memo}>{e.description || e.memo}</td>
                    <td className="py-1.5 text-right font-mono">{parseFloat(e.debit) > 0 ? <MoneyCell value={e.debit} /> : ''}</td>
                    <td className="py-1.5 text-right font-mono">{parseFloat(e.credit) > 0 ? <MoneyCell value={e.credit} /> : ''}</td>
                    <td className="py-1.5 font-mono text-xs text-text-tertiary">{e.je_number}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {drilldown.entries.length === 0 && (
            <p className="text-text-secondary text-sm py-4 text-center">No GL entries found for this account.</p>
          )}
        </div>
      )}

      {view === 'drilldown' && !drilldown && drilldownMutation.isPending && (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="w-6 h-6 animate-spin text-accent" />
        </div>
      )}

      {/* Chat View */}
      {view === 'chat' && (
        <div className="flex flex-col h-full -my-4 -mx-6">
          <div className="flex-1 overflow-y-auto px-6 py-4 space-y-3">
            {chatMessages.length === 0 && (
              <div className="py-8 text-center text-text-secondary text-sm">
                <MessageSquare className="w-8 h-8 mx-auto mb-2 text-text-tertiary" />
                <p>Ask questions about this variance.</p>
                <p className="text-xs text-text-tertiary mt-1">e.g., "What drove the increase?" or "Show me the largest transactions"</p>
              </div>
            )}
            {chatMessages.map((msg, i) => (
              <div key={i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
                <div className={cn(
                  'max-w-[85%] px-3 py-2 rounded-card text-sm',
                  msg.role === 'user' ? 'bg-accent text-white' : 'bg-elevated text-primary'
                )}>
                  <p className="whitespace-pre-wrap">{msg.content}</p>
                </div>
              </div>
            ))}
            {chatMutation.isPending && (
              <div className="flex justify-start">
                <div className="bg-elevated px-3 py-2 rounded-card">
                  <Loader2 className="w-4 h-4 animate-spin text-text-secondary" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>
          <div className="shrink-0 px-6 py-3 border-t border-border bg-surface">
            <div className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                placeholder="Ask about this variance..."
                className="flex-1 px-3 py-2 rounded-input border border-border bg-input text-sm"
                disabled={chatMutation.isPending}
              />
              <button
                type="button"
                onClick={handleSendChat}
                disabled={chatMutation.isPending || !chatInput.trim()}
                className="p-2 rounded-input bg-accent text-white disabled:opacity-50"
              >
                <Send className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </SlideOverPanel>
  );
}
