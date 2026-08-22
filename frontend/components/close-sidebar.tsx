'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  FolderClosed,
  BarChart3,
  GitBranch,
  Shield,
  FileText,
  TrendingUp,
  Award,
  ScrollText,
  Settings,
  BookOpenCheck,
  BrainCircuit,
} from 'lucide-react';

const WORKFLOW_ITEMS = [
  { label: 'Dashboard', icon: LayoutDashboard, href: (sid: string) => `/close/${sid}/dashboard`, match: 'dashboard' },
  { label: 'Runbook & Agents', icon: BookOpenCheck, href: (sid: string) => `/close/${sid}/runbook`, match: 'runbook' },
  { label: 'Journal Entry Review', icon: FileText, href: (sid: string) => `/close/${sid}/adjustments?tab=entries`, match: 'adjustments' },
  { label: 'Learning & Recovery', icon: BrainCircuit, href: (sid: string) => `/close/${sid}/memory`, match: 'memory' },
];

// These remain first-class close evidence and certification surfaces. The
// dashboard, agents, JE review, and recovery loop are the primary workflow;
// they do not replace accounting evidence or final human certification.
const ACCOUNTING_CONTROL_ITEMS = [
  { label: 'Trial Balance', icon: BarChart3, href: (sid: string) => `/close/${sid}/trial-balance`, match: 'trial-balance' },
  { label: 'Account Mapping', icon: GitBranch, href: (sid: string) => `/close/${sid}/mapping`, match: 'mapping' },
  { label: 'Reconciliation', icon: Shield, href: (sid: string) => `/close/${sid}/reconciliation`, match: 'reconciliation' },
  { label: 'Statements', icon: FileText, href: (sid: string) => `/close/${sid}/statements`, match: 'statements' },
  { label: 'Variance', icon: TrendingUp, href: (sid: string) => `/close/${sid}/variance`, match: 'variance' },
  { label: 'Review & Certify', icon: Award, href: (sid: string) => `/close/${sid}/review`, match: 'review' },
  { label: 'Audit Trail', icon: ScrollText, href: (sid: string) => `/close/${sid}/audit-trail`, match: 'audit-trail' },
];

const UTIL_ITEMS = [
  { label: 'Close Sessions', icon: FolderClosed, href: () => '/close', match: '__close_list__' },
  { label: 'Settings', icon: Settings, href: () => '/settings/general', match: '__settings__' },
];

export function CloseSidebar({ sessionId }: { sessionId: string }) {
  const pathname = usePathname();

  function isActive(match: string) {
    if (match === '__close_list__') return pathname === '/close';
    if (match === '__settings__') return pathname?.startsWith('/settings') ?? false;
    return pathname?.includes(`/${match}`);
  }

  return (
    <aside className="fixed top-0 left-0 h-screen w-[260px] bg-[#2C2416] flex flex-col z-50">
      {/* Logo */}
      <div className="px-6 pt-6 pb-4">
        <div className="text-[#B8860B] text-xl font-medium tracking-wide">SABIT</div>
        <div className="text-[#8B7A5E] text-xs mt-0.5">Canadian Close Harness</div>
      </div>

      {/* Workflow nav */}
      <nav className="flex-1 px-3 mt-2 space-y-0.5 overflow-y-auto" aria-label="Close workflow">
        <div className="px-3 py-1.5 text-[10px] font-medium text-[#5C4F3A] uppercase tracking-widest">
          Close Workflow
        </div>
        {WORKFLOW_ITEMS.map((item) => {
          const active = isActive(item.match);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href(sessionId)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#3B1F0A] text-[#B8860B]'
                  : 'text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50'
              }`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}

        <div className="my-3 border-t border-[#3B1F0A]" />

        <div className="px-3 py-1.5 text-[10px] font-medium uppercase tracking-widest text-[#5C4F3A]">
          Accounting evidence
        </div>
        {ACCOUNTING_CONTROL_ITEMS.map((item) => {
          const active = isActive(item.match);
          const Icon = item.icon;
          return (
            <Link
              key={item.label}
              href={item.href(sessionId)}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#3B1F0A] text-[#B8860B]'
                  : 'text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50'
              }`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}

        <div className="my-3 border-t border-[#3B1F0A]" />

        {UTIL_ITEMS.map((item) => {
          const Icon = item.icon;
          const active = isActive(item.match);
          return (
            <Link
              key={item.label}
              href={item.href()}
              aria-current={active ? 'page' : undefined}
              className={`flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors ${
                active
                  ? 'bg-[#3B1F0A] text-[#B8860B]'
                  : 'text-[#8B7A5E] hover:text-[#B8860B] hover:bg-[#3B1F0A]/50'
              }`}
            >
              <Icon size={16} />
              {item.label}
            </Link>
          );
        })}
      </nav>

      {/* User */}
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
