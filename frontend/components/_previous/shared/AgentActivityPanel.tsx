'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import {
  Brain,
  Search,
  BookOpen,
  GitBranch,
  ChevronDown,
  ChevronRight,
  Clock,
  Zap,
  AlertTriangle,
  CheckCircle2,
} from 'lucide-react';
import { useMemoryList, useMemorySearch, type MemoryEntry } from '@/lib/queries/memory';
import { useDecisionRecords } from '@/lib/queries/ai-insights';

const ENTRY_TYPE_CONFIG: Record<string, { icon: typeof Brain; color: string; label: string }> = {
  correction: { icon: GitBranch, color: 'text-amber-400', label: 'Correction' },
  justification: { icon: BookOpen, color: 'text-sky-400', label: 'Justification' },
  decision: { icon: Zap, color: 'text-[#7C5CFC]', label: 'Decision' },
  transaction_category: { icon: GitBranch, color: 'text-emerald-400', label: 'Category' },
  entity_policy: { icon: BookOpen, color: 'text-rose-400', label: 'Policy' },
};

function MemoryEntryCard({ entry }: { entry: MemoryEntry }) {
  const [expanded, setExpanded] = useState(false);
  const config = ENTRY_TYPE_CONFIG[entry.entryType] ?? ENTRY_TYPE_CONFIG.decision;
  const Icon = config.icon;
  const age = formatAge(entry.createdAt);

  return (
    <div className="border border-[#262C48] rounded-lg overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-[#1a1d2e] transition-colors text-left"
      >
        <Icon className={cn('w-4 h-4 shrink-0', config.color)} />
        <div className="flex-1 min-w-0">
          <p className="text-xs text-gray-300 truncate">{entry.key}</p>
          <p className="text-xs text-gray-600 mt-0.5">{config.label} · {age}</p>
        </div>
        {expanded ? <ChevronDown className="w-3 h-3 text-gray-600" /> : <ChevronRight className="w-3 h-3 text-gray-600" />}
      </button>
      {expanded && (
        <div className="px-3 pb-3 border-t border-[#1e2235]">
          <pre className="text-xs text-gray-500 mt-2 font-mono whitespace-pre-wrap break-all bg-[#0d1017] rounded p-2 max-h-32 overflow-y-auto">
            {JSON.stringify(entry.value, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}

function formatAge(iso: string): string {
  try {
    const ms = Date.now() - new Date(iso).getTime();
    const mins = Math.floor(ms / 60000);
    if (mins < 60) return `${mins}m ago`;
    const hours = Math.floor(ms / 3600000);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(ms / 86400000);
    return `${days}d ago`;
  } catch {
    return iso;
  }
}

export function AgentActivityPanel() {
  const [tab, setTab] = useState<'memory' | 'decisions' | 'search'>('memory');
  const [expanded, setExpanded] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MemoryEntry[]>([]);

  const { data: memoryEntries = [], isLoading: memoryLoading } = useMemoryList();
  const { data: decisions = [] } = useDecisionRecords();
  const search = useMemorySearch();

  const handleSearch = () => {
    if (!searchQuery.trim()) return;
    search.mutate({ query: searchQuery, topK: 10 }, {
      onSuccess: (data) => setSearchResults(data.entries ?? []),
    });
  };

  const memoryCount = memoryEntries.length;
  const decisionCount = decisions.length;

  if (memoryLoading) return null;
  if (memoryCount === 0 && decisionCount === 0) return null;

  return (
    <div className="bg-[#141829] border border-[#262C48] rounded-xl overflow-hidden">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-4 hover:bg-[#1a1d2e] transition-colors"
        aria-label="Toggle agent activity"
        aria-expanded={expanded}
      >
        <div className="w-8 h-8 rounded-lg bg-[#7C5CFC]/10 flex items-center justify-center">
          <Brain className="w-4 h-4 text-[#7C5CFC]" />
        </div>
        <div className="flex-1 text-left">
          <h3 className="text-xs font-semibold text-white">Agent Activity</h3>
          <p className="text-xs text-gray-600">
            {memoryCount} precedent{memoryCount !== 1 ? 's' : ''} · {decisionCount} decision{decisionCount !== 1 ? 's' : ''}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {memoryCount > 0 && (
            <span className="px-2 py-0.5 rounded bg-[#7C5CFC]/10 text-[#7C5CFC] text-xs font-semibold tabular-nums">{memoryCount}</span>
          )}
          {expanded ? <ChevronDown className="w-3.5 h-3.5 text-gray-600" /> : <ChevronRight className="w-3.5 h-3.5 text-gray-600" />}
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4">
          {/* Tab bar */}
          <div className="flex items-center gap-1 mb-3 border-b border-[#1e2235] pb-2">
            {([
              { id: 'memory' as const, label: 'Precedents', count: memoryCount },
              { id: 'decisions' as const, label: 'Decisions', count: decisionCount },
              { id: 'search' as const, label: 'Search', count: 0 },
            ]).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={cn(
                  'px-3 py-1.5 rounded-lg text-xs font-medium transition-colors flex items-center gap-1.5',
                  tab === t.id ? 'bg-[#7C5CFC]/10 text-[#7C5CFC]' : 'text-gray-500 hover:text-gray-300'
                )}
              >
                {t.label}
                {t.count > 0 && (
                  <span className="text-xs tabular-nums">{t.count}</span>
                )}
              </button>
            ))}
          </div>

          {/* Memory tab */}
          {tab === 'memory' && (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {memoryEntries.length === 0 ? (
                <p className="text-xs text-gray-600 py-4 text-center">No precedents stored yet</p>
              ) : (
                memoryEntries.slice(0, 20).map((entry) => (
                  <MemoryEntryCard key={entry.id} entry={entry} />
                ))
              )}
              {memoryEntries.length > 20 && (
                <p className="text-xs text-gray-600 text-center pt-1">+{memoryEntries.length - 20} more entries</p>
              )}
            </div>
          )}

          {/* Decisions tab */}
          {tab === 'decisions' && (
            <div className="space-y-1.5 max-h-[300px] overflow-y-auto">
              {decisions.length === 0 ? (
                <p className="text-xs text-gray-600 py-4 text-center">No automated decisions recorded</p>
              ) : (
                decisions.slice(0, 20).map((d) => {
                  const conf = parseFloat(String(d.confidenceScore ?? 0));
                  const confColor = conf >= 0.8 ? 'text-emerald-400 bg-emerald-500/10' : conf >= 0.5 ? 'text-amber-400 bg-amber-500/10' : 'text-red-400 bg-red-500/10';
                  const ConfIcon = conf >= 0.8 ? CheckCircle2 : conf >= 0.5 ? Clock : AlertTriangle;

                  return (
                    <div key={d.id} className="flex items-start gap-3 p-3 rounded-lg border border-[#262C48]">
                      <ConfIcon className={cn('w-4 h-4 mt-0.5 shrink-0', conf >= 0.8 ? 'text-emerald-400' : conf >= 0.5 ? 'text-amber-400' : 'text-red-400')} />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-gray-300">{d.rationaleText || d.decisionType}</p>
                        <div className="flex items-center gap-2 mt-1">
                          <span className="text-xs text-gray-600 uppercase">{d.decisionType}</span>
                          <span className={cn('text-xs font-semibold px-1.5 py-0.5 rounded', confColor)}>
                            {Math.round(conf * 100)}%
                          </span>
                          {d.engineVersion && (
                            <span className="text-xs text-gray-700 font-mono">{d.engineVersion}</span>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* Search tab */}
          {tab === 'search' && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-600" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
                    placeholder="Search precedents semantically..."
                    className="w-full pl-9 pr-3 py-2 rounded-lg bg-[#0d1017] border border-[#262C48] text-xs text-gray-300 placeholder:text-gray-700 focus:outline-none focus:border-[#7C5CFC]/50"
                  />
                </div>
                <button
                  type="button"
                  onClick={handleSearch}
                  disabled={search.isPending || !searchQuery.trim()}
                  className="px-4 py-2 rounded-lg bg-[#7C5CFC]/10 text-[#7C5CFC] text-xs font-medium hover:bg-[#7C5CFC]/20 disabled:opacity-50 transition-colors"
                >
                  {search.isPending ? 'Searching...' : 'Search'}
                </button>
              </div>
              <div className="space-y-1.5 max-h-[250px] overflow-y-auto">
                {searchResults.length === 0 && !search.isPending ? (
                  <p className="text-xs text-gray-600 py-4 text-center">
                    {search.isSuccess ? 'No matching precedents found' : 'Search agent memory for past decisions and corrections'}
                  </p>
                ) : (
                  searchResults.map((entry) => (
                    <MemoryEntryCard key={entry.id} entry={entry} />
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
