'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Globe, MessageSquare, FileText, BarChart3, Shield, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface DashboardLayoutProps {
  sidebar: React.ReactNode;
  main: React.ReactNode;
  agentStream: React.ReactNode;
  className?: string;
}

/**
 * Calm Design dashboard: fixed Sidebar 20%, Main 50%, Agent Thought Stream 30%.
 * 1px borders (#E2E8F0), no bright gradients, rounded-md (6px).
 */
export function DashboardLayout({
  sidebar,
  main,
  agentStream,
  className,
}: DashboardLayoutProps) {
  return (
    <div
      className={cn(
        'grid min-h-screen bg-background border-border',
        className
      )}
      style={{
        gridTemplateColumns: 'minmax(180px, 20%) 1fr minmax(220px, 30%)',
        borderColor: '#E2E8F0',
      }}
    >
      {/* Left: Fixed Sidebar 20% */}
      <aside className="sticky top-0 h-screen border-r border-border bg-card overflow-y-auto" style={{ borderColor: '#E2E8F0' }}>
        <div className="p-4 flex flex-col gap-4">{sidebar}</div>
      </aside>

      {/* Middle: Main Workspace 50% */}
      <main className="min-w-0 flex flex-col overflow-y-auto border-r border-border" style={{ borderColor: '#E2E8F0' }}>
        {main}
      </main>

      {/* Right: Agent Thought Stream 30% */}
      <aside className="sticky top-0 h-screen overflow-y-auto bg-muted/30" style={{ borderColor: '#E2E8F0' }}>
        {agentStream}
      </aside>
    </div>
  );
}

const navLinkClass =
  'flex items-center gap-2 rounded-md px-3 py-2 text-sm font-medium text-foreground border border-transparent hover:bg-muted hover:border-border transition-colors';
const navLinkActiveClass = 'bg-muted border-border text-primary';

export function DashboardSidebarNav({ currentPath: currentPathProp, auditInProgress }: { currentPath?: string; auditInProgress?: boolean }) {
  const pathname = usePathname();
  const currentPath = currentPathProp ?? pathname ?? '/';

  return (
    <>
      <div className="pb-2 border-b border-border mb-4" style={{ borderColor: '#E2E8F0' }}>
        <div className="flex items-center gap-2 px-2">
          <h2 className="text-sm font-semibold text-primary">FinOS</h2>
          <span
            className="h-2 w-2 rounded-full bg-audit-green shrink-0"
            title="System Ready — AI Agents online"
            aria-hidden
          />
        </div>
        <p className="text-xs text-muted-foreground mt-0.5 px-2">CPA & CFA Partner</p>
      </div>
      <nav className="flex flex-col gap-1 flex-1">
        <Link
          href="/"
          className={currentPath === '/' ? `${navLinkClass} ${navLinkActiveClass}` : navLinkClass}
        >
          <FileText className="h-4 w-4 shrink-0" />
          Dashboard
        </Link>
        <Link
          href="/consolidation"
          className={currentPath === '/consolidation' ? `${navLinkClass} ${navLinkActiveClass}` : navLinkClass}
        >
          <Globe className="h-4 w-4 shrink-0" />
          Global Controller
        </Link>
        <Link
          href="/genui"
          className={currentPath === '/genui' ? `${navLinkClass} ${navLinkActiveClass}` : navLinkClass}
        >
          <MessageSquare className="h-4 w-4 shrink-0" />
          GenUI Chat
        </Link>
        <Link
          href="/auditor"
          className={currentPath === '/auditor' ? `${navLinkClass} ${navLinkActiveClass}` : navLinkClass}
        >
          {auditInProgress ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" />
          ) : (
            <Shield className="h-4 w-4 shrink-0" />
          )}
          Auditor
        </Link>
      </nav>
      <div className="pt-4 mt-auto border-t border-border">
        <p className="text-xs text-muted-foreground px-2 font-medium">CPA Master View</p>
        <p className="text-[10px] text-muted-foreground/80 px-2 mt-0.5">Financial Partner</p>
      </div>
    </>
  );
}

export function AgentThoughtStreamPlaceholder() {
  return (
    <div className="p-4 h-full flex flex-col">
      <h3 className="text-sm font-semibold text-primary mb-2">
        Agent Thought Stream
      </h3>
      <p className="text-xs text-muted-foreground leading-relaxed">
        Reasoning and chat with your partner appear in the main workspace. Use the panel there to ask questions and see cited answers.
      </p>
    </div>
  );
}
