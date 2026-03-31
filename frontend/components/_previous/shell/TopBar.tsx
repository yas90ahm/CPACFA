'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Settings, ArrowLeft, LogOut, ChevronDown, Sun, Moon, Building2 } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '@/lib/auth';
import { canAccessSettings, getRoleLabel } from '@/lib/permissions';
import { useTheme } from '@/components/ThemeProvider';
import type { CloseState } from '@/lib/types/close-session';

function stateColor(s: CloseState): string {
  if (s === 'OPEN') return 'var(--status-info)';
  if (s === 'IN_PROGRESS') return 'var(--status-warning)';
  if (s === 'UNDER_REVIEW') return 'var(--interactive-primary)';
  if (s === 'CERTIFIED') return 'var(--status-success)';
  return 'var(--text-tertiary)';
}

const ROLE_BADGE_STYLE: Record<string, string> = {
  admin: 'bg-accent-dim text-accent',
  controller: 'bg-status-blue-dim text-status-blue',
  reviewer: 'bg-status-green-dim text-status-green',
  operating_partner: 'bg-status-amber-dim text-status-amber',
  auditor: 'bg-text-muted/20 text-text-secondary',
};

export interface TopBarProps {
  entityName?: string;
  periodLabel?: string;
  state?: CloseState;
  userName?: string;
  userInitials?: string;
  showPeriod?: boolean;
  mode?: 'close' | 'portfolio';
  showBackToPortfolio?: boolean;
}

export function TopBar(p: TopBarProps) {
  const entityName = p.entityName ?? 'Entity';
  const periodLabel = p.periodLabel ?? '';
  const state = p.state;
  const userName = p.userName ?? '';
  const userInitials = p.userInitials ?? (userName ? userName.slice(0, 2).toUpperCase() : '');
  const showPeriod = p.showPeriod !== false;
  const isPortfolio = p.mode === 'portfolio';

  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const role = user?.role ?? 'controller';
  const showSettings = canAccessSettings(role);

  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!menuOpen) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuOpen]);

  return (
    <header className="fixed top-0 left-0 right-0 h-14 z-40 flex items-center justify-between px-5 bg-surface border-b border-border shadow-sm print:hidden">
      <div className="flex items-center gap-6">
        <span className="font-sans text-lg font-medium tracking-[0.12em] uppercase" style={{ color: 'var(--text-primary)' }}>Sabit</span>
        {isPortfolio ? (
          <span className="text-base font-medium text-primary">Portfolio Dashboard</span>
        ) : (
          <>
            {p.showBackToPortfolio && (
              <Link href="/portfolio" className="flex items-center gap-2 px-3 py-1.5 rounded-input text-text-secondary hover:bg-hover hover:text-primary text-sm">
                <ArrowLeft className="w-4 h-4" />
                Back to Portfolio
              </Link>
            )}
            <span className="flex items-center gap-2 px-3 py-1.5 rounded-input bg-[var(--bg-surface-sunken)] border border-border-light text-primary text-sm font-medium">
              <Building2 className="w-3.5 h-3.5 text-tertiary" />
              {entityName}
            </span>
            {showPeriod && periodLabel && (
              <span className="flex items-center gap-2 px-3 py-1.5 rounded-input bg-hover border border-border-light text-primary text-sm">
                {periodLabel}
              </span>
            )}
          </>
        )}
      </div>
      <div className="flex items-center gap-4">
        {!isPortfolio && state != null && (
          <span
            className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-semibold tracking-wide"
            style={{ color: stateColor(state) }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-current" />
            {state.replace('_', ' ')}
          </span>
        )}
        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2 pl-4 border-l border-border hover:bg-hover rounded-input px-2 py-1 transition-colors"
          >
            <div className="w-8 h-8 rounded-full bg-accent-dim flex items-center justify-center text-accent text-sm font-medium">{userInitials || '?'}</div>
            <span className="text-sm text-primary">{userName || 'User'}</span>
            <ChevronDown className={cn('w-3.5 h-3.5 text-text-muted transition-transform', menuOpen && 'rotate-180')} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1 w-56 bg-surface border border-border rounded-card shadow-lg py-1 z-50 animate-menu-open">
              <div className="px-4 py-3 border-b border-border">
                <p className="text-sm font-medium text-primary">{userName || 'User'}</p>
                <p className="text-xs text-text-secondary mt-0.5">{user?.email ?? ''}</p>
                <span className={cn('inline-block mt-1.5 px-2 py-0.5 rounded text-xs font-medium uppercase tracking-wide', ROLE_BADGE_STYLE[role] ?? 'bg-elevated text-text-secondary')}>
                  {getRoleLabel(role)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); logout(); }}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-text-secondary hover:bg-hover hover:text-primary transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 rounded-input text-text-secondary hover:text-primary hover:bg-hover transition-colors"
          aria-label={theme === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'}
        >
          {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
        </button>
        <NotificationBell />
        {showSettings && (
          <Link href="/settings" className="p-2 rounded-input text-text-secondary hover:text-primary hover:bg-hover" aria-label="Settings">
            <Settings className="w-5 h-5" />
          </Link>
        )}
      </div>
    </header>
  );
}
