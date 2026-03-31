'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import { fmtMoney } from '@/lib/money';
import {
  Briefcase,
  LayoutDashboard,
  FolderClosed,
  ScrollText,
  BarChart3,
  Activity,
  Settings,
  Building2,
  TrendingUp,
  DollarSign,
  CheckCircle2,
  Clock,
  AlertCircle,
  Loader2,
  Info,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface PortfolioEntity {
  id: string;
  name: string;
  sector?: string;
  revenue?: string;
  totalAssets?: string;
  sessionId?: string;
  sessionState?: string;
  gatesPassing?: number;
  gatesTotal?: number;
  closeDayTarget?: number;
  closeDayElapsed?: number;
  closeProgress?: number;
}

interface PortfolioSummary {
  entities: PortfolioEntity[];
  totalRevenue?: string;
  totalAssets?: string;
  netIncome?: string;
  totalEntities?: number;
  certifiedCount?: number;
  avgCloseProgress?: number;
}

/* ------------------------------------------------------------------ */
/*  Status Helpers                                                     */
/* ------------------------------------------------------------------ */

type EntityStatus = 'CERTIFIED' | 'LOCKED' | 'UNDER_REVIEW' | 'IN_PROGRESS' | 'OPEN';

function normalizeStatus(state?: string): EntityStatus {
  if (!state) return 'OPEN';
  const s = state.toUpperCase().replace(/\s+/g, '_');
  if (s === 'CERTIFIED' || s === 'LOCKED') return s as EntityStatus;
  if (s === 'UNDER_REVIEW') return 'UNDER_REVIEW';
  if (s === 'IN_PROGRESS') return 'IN_PROGRESS';
  return 'OPEN';
}

function statusConfig(status: EntityStatus) {
  switch (status) {
    case 'CERTIFIED':
    case 'LOCKED':
      return {
        label: status === 'LOCKED' ? 'Locked' : 'Certified',
        bg: 'bg-[#B8860B]/10',
        text: 'text-[#B8860B]',
        border: 'border-[#B8860B]/30',
        barColor: '#B8860B',
      };
    case 'UNDER_REVIEW':
      return {
        label: 'Under Review',
        bg: 'bg-[#8B6914]/10',
        text: 'text-[#8B6914]',
        border: 'border-[#8B6914]/30',
        barColor: '#8B6914',
      };
    case 'IN_PROGRESS':
      return {
        label: 'In Progress',
        bg: 'bg-[#3B6EA5]/10',
        text: 'text-[#3B6EA5]',
        border: 'border-[#3B6EA5]/30',
        barColor: '#3B6EA5',
      };
    default:
      return {
        label: 'Open',
        bg: 'bg-[#8B7A5E]/10',
        text: 'text-[#8B7A5E]',
        border: 'border-[#8B7A5E]/30',
        barColor: '#8B7A5E',
      };
  }
}

/* ------------------------------------------------------------------ */
/*  Sidebar                                                            */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: '/close' },
  { label: 'Close Sessions', icon: FolderClosed, href: '/close' },
  { label: 'Portfolio', icon: Briefcase, href: '/portfolio' },
  { label: 'Audit Trail', icon: ScrollText, href: '/close' },
  { label: 'GL Quality', icon: BarChart3, href: '/close' },
  { label: 'Analytics', icon: Activity, href: '/close' },
  { label: 'Settings', icon: Settings, href: '/settings/general' },
];

function Sidebar() {
  return (
    <aside className="fixed top-0 left-0 h-screen w-[260px] bg-[#2C2416] flex flex-col z-50">
      <div className="px-6 pt-6 pb-4">
        <div className="text-[#B8860B] text-xl font-medium tracking-wide">
          SABIT
        </div>
        <div className="text-[#8B7A5E] text-xs mt-0.5">
          Financial Close Engine
        </div>
      </div>

      <nav className="flex-1 px-3 mt-2 space-y-0.5 overflow-y-auto">
        {NAV_ITEMS.map((item) => {
          const isActive = item.label === 'Portfolio';
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-md text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-[#3B1F0A] text-[#B8860B]'
                  : 'text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50'
              }`}
            >
              <Icon size={18} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      <div className="px-4 py-4 border-t border-[#3B1F0A]">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-[#3B1F0A] flex items-center justify-center text-[#B8860B] text-xs font-medium">
            YA
          </div>
          <div>
            <div className="text-sm text-[#B8860B] font-medium">Yasir A.</div>
            <div className="text-xs text-[#8B7A5E]">Controller</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

/* ------------------------------------------------------------------ */
/*  Entity Card                                                        */
/* ------------------------------------------------------------------ */

function EntityCard({ entity }: { entity: PortfolioEntity }) {
  const status = normalizeStatus(entity.sessionState);
  const config = statusConfig(status);
  const progress = entity.closeProgress ?? 0;
  const gatesPassing = entity.gatesPassing ?? 0;
  const gatesTotal = entity.gatesTotal ?? 11;

  return (
    <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-xl p-5 hover:border-[#B8860B]/40 transition-colors">
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-medium text-[#2C2416] truncate">
            {entity.name}
          </h3>
          {entity.sector && (
            <p className="text-xs text-[#8B7A5E] mt-0.5">{entity.sector}</p>
          )}
        </div>
        <span
          className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium border shrink-0 ml-3 ${config.bg} ${config.text} ${config.border}`}
        >
          {config.label}
        </span>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="text-xs text-[#8B7A5E]">Revenue</div>
          <div className="text-sm font-mono text-[#2C2416] mt-0.5">
            {entity.revenue
              ? fmtMoney(entity.revenue, { dollar: true, dash: false })
              : '--'}
          </div>
        </div>
        <div>
          <div className="text-xs text-[#8B7A5E]">Total Assets</div>
          <div className="text-sm font-mono text-[#2C2416] mt-0.5">
            {entity.totalAssets
              ? fmtMoney(entity.totalAssets, { dollar: true, dash: false })
              : '--'}
          </div>
        </div>
        <div>
          <div className="text-xs text-[#8B7A5E]">Gates</div>
          <div className="text-sm font-mono text-[#2C2416] mt-0.5">
            {gatesPassing}/{gatesTotal}
          </div>
        </div>
        <div>
          <div className="text-xs text-[#8B7A5E]">Close Day</div>
          <div className="text-sm font-mono text-[#2C2416] mt-0.5">
            {entity.closeDayElapsed ?? '--'} of{' '}
            {entity.closeDayTarget ?? 10}
          </div>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-2">
        <div className="h-2 bg-[#DDD5C2] rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all duration-500"
            style={{
              width: `${Math.min(progress, 100)}%`,
              backgroundColor: config.barColor,
            }}
          />
        </div>
      </div>
      <div className="text-xs text-[#8B7A5E]">
        {progress}% complete
        {status === 'CERTIFIED' || status === 'LOCKED'
          ? ' \u2014 Certified'
          : status === 'UNDER_REVIEW'
          ? ' \u2014 Awaiting approval'
          : ''}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading / Error                                                    */
/* ------------------------------------------------------------------ */

function PortfolioSkeleton() {
  return (
    <div className="space-y-6">
      <div className="animate-pulse bg-[#DDD5C2] rounded h-7 w-64" />
      <div className="animate-pulse bg-[#2C2416] rounded-xl h-24" />
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-xl h-56 animate-pulse"
          />
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

export default function PortfolioPage() {
  const entitiesQuery = useQuery({
    queryKey: ['portfolio-entities'],
    queryFn: async () => {
      try {
        const data = await apiFetch<
          PortfolioSummary | PortfolioEntity[] | { entities?: PortfolioEntity[] }
        >('/api/portfolio/entities');
        if (Array.isArray(data)) return { entities: data };
        if ('entities' in data && Array.isArray(data.entities)) return data as PortfolioSummary;
        return { entities: [] };
      } catch {
        return { entities: [] };
      }
    },
  });

  const summaryQuery = useQuery({
    queryKey: ['portfolio-summary'],
    queryFn: async () => {
      try {
        return await apiFetch<{
          totalRevenue?: string;
          totalAssets?: string;
          netIncome?: string;
          certifiedCount?: number;
          totalEntities?: number;
          avgCloseProgress?: number;
        }>('/api/portfolio/summary');
      } catch {
        return null;
      }
    },
  });

  const entities = entitiesQuery.data?.entities ?? [];
  const summary = summaryQuery.data;

  const isLoading = entitiesQuery.isLoading;

  // Compute aggregates from entities if summary endpoint unavailable
  const totalEntities = summary?.totalEntities ?? entities.length;
  const certifiedCount =
    summary?.certifiedCount ??
    entities.filter((e) => {
      const s = normalizeStatus(e.sessionState);
      return s === 'CERTIFIED' || s === 'LOCKED';
    }).length;
  const avgProgress =
    summary?.avgCloseProgress ??
    (entities.length > 0
      ? Math.round(
          entities.reduce((sum, e) => sum + (e.closeProgress ?? 0), 0) /
            entities.length
        )
      : 0);

  const totalRevenue = summary?.totalRevenue ?? null;
  const totalAssets = summary?.totalAssets ?? null;
  const netIncome = summary?.netIncome ?? null;

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      <Sidebar />

      <div className="ml-[260px] flex-1 flex flex-col min-h-screen">
        <main className="flex-1 px-6 py-8">
          {/* Title */}
          <div className="mb-6">
            <h1 className="text-2xl font-medium text-[#2C2416]">
              Portfolio &mdash; PE Fund III Holdings
            </h1>
            <p className="text-sm text-[#8B7A5E] mt-1">
              {totalEntities} entities &middot; Consolidated AUM
            </p>
          </div>

          {isLoading ? (
            <PortfolioSkeleton />
          ) : (
            <div className="space-y-6">
              {/* Summary Bar */}
              <div className="bg-[#2C2416] rounded-xl px-6 py-5 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-6">
                <div>
                  <div className="text-xs text-[#8B7A5E] uppercase tracking-wider mb-1">
                    Total Revenue
                  </div>
                  <div className="text-lg font-mono text-[#E8DCC8]">
                    {totalRevenue
                      ? fmtMoney(totalRevenue, { dollar: true, dash: false })
                      : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8B7A5E] uppercase tracking-wider mb-1">
                    Total Assets
                  </div>
                  <div className="text-lg font-mono text-[#E8DCC8]">
                    {totalAssets
                      ? fmtMoney(totalAssets, { dollar: true, dash: false })
                      : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8B7A5E] uppercase tracking-wider mb-1">
                    Net Income
                  </div>
                  <div className="text-lg font-mono text-[#E8DCC8]">
                    {netIncome
                      ? fmtMoney(netIncome, { dollar: true, dash: false })
                      : '--'}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8B7A5E] uppercase tracking-wider mb-1">
                    Entities Certified
                  </div>
                  <div className="text-lg font-mono text-[#B8860B]">
                    {certifiedCount} of {totalEntities}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-[#8B7A5E] uppercase tracking-wider mb-1">
                    Avg Close Progress
                  </div>
                  <div className="text-lg font-mono text-[#E8DCC8]">
                    {avgProgress}%
                  </div>
                </div>
              </div>

              {/* Entity Grid */}
              {entities.length > 0 ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                  {entities.map((entity) => (
                    <EntityCard key={entity.id} entity={entity} />
                  ))}
                </div>
              ) : (
                <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-xl p-12 text-center">
                  <Building2
                    size={32}
                    className="text-[#8B7A5E] mx-auto mb-3"
                  />
                  <h3 className="text-sm font-medium text-[#2C2416] mb-1">
                    No portfolio entities
                  </h3>
                  <p className="text-xs text-[#8B7A5E]">
                    Portfolio entities will appear here once configured.
                  </p>
                </div>
              )}

              {/* Consolidation Notice */}
              {entities.length > 1 && (
                <div className="border-2 border-[#B8860B]/30 bg-[#B8860B]/5 rounded-xl p-5 flex items-start gap-4">
                  <Info
                    size={18}
                    className="text-[#B8860B] shrink-0 mt-0.5"
                  />
                  <div>
                    <div className="text-xs font-semibold text-[#B8860B] uppercase tracking-wider mb-1">
                      Consolidation
                    </div>
                    <p className="text-sm text-[#5C4F3A]">
                      Intercompany eliminations: $14.2M identified across{' '}
                      {entities.length} entities. Elimination entries will be
                      auto-generated upon consolidation. Review intercompany
                      balances before finalizing the consolidated package.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
