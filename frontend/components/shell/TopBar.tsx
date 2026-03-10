'use client';

import { useState, useRef, useEffect } from 'react';
import Link from 'next/link';
import { cn } from '@/lib/utils';
import { Settings, ArrowLeft, LogOut, ChevronDown, Shield } from 'lucide-react';
import { NotificationBell } from './NotificationBell';
import { useAuth } from '@/lib/auth';
import { canAccessSettings, getRoleLabel } from '@/lib/permissions';
import type { CloseState } from '@/lib/types/close-session';

function stateClass(s: CloseState): string {
  if (s === 'OPEN') return 'bg-sky-500/10 text-sky-400 border-sky-500/20';
  if (s === 'IN_PROGRESS') return 'bg-amber-500/10 text-amber-400 border-amber-500/20';
  if (s === 'UNDER_REVIEW') return 'bg-[#7C5CFC]/10 text-[#7C5CFC] border-[#7C5CFC]/20';
  if (s === 'CERTIFIED') return 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20';
  return 'bg-gray-500/10 text-gray-400 border-gray-500/20';
}

const ROLE_BADGE_STYLE: Record<string, string> = {
  admin: 'bg-[#7C5CFC]/10 text-[#7C5CFC]',
  controller: 'bg-sky-500/10 text-sky-400',
  reviewer: 'bg-emerald-500/10 text-emerald-400',
  operating_partner: 'bg-amber-500/10 text-amber-400',
  auditor: 'bg-gray-500/10 text-gray-400',
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
    <header className="fixed top-0 left-0 right-0 h-14 z-40 flex items-center justify-between px-5 bg-[#0d1017] border-b border-[#1e2235] print:hidden">
      <div className="flex items-center gap-5">
        {/* Logo */}
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-lg bg-[#7C5CFC]/10 border border-[#7C5CFC]/20 flex items-center justify-center">
            <Shield className="w-3.5 h-3.5 text-[#7C5CFC]" />
          </div>
          <span className="text-sm font-semibold tracking-[0.15em] uppercase text-white">Sabit</span>
        </div>

        <div className="w-px h-6 bg-[#1e2235]" />

        {isPortfolio ? (
          <span className="text-sm font-medium text-gray-300">Portfolio</span>
        ) : (
          <div className="flex items-center gap-3">
            {p.showBackToPortfolio && (
              <Link href="/portfolio" className="flex items-center gap-1.5 text-gray-500 hover:text-gray-300 text-xs transition-colors">
                <ArrowLeft className="w-3.5 h-3.5" />
                Portfolio
              </Link>
            )}
            <span className="text-sm text-gray-300 font-medium">{entityName}</span>
            {showPeriod && periodLabel && (
              <>
                <span className="text-gray-600">/</span>
                <span className="text-sm text-gray-500">{periodLabel}</span>
              </>
            )}
          </div>
        )}
      </div>

      <div className="flex items-center gap-3">
        {!isPortfolio && state != null && (
          <span className={cn('px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider rounded-md border', stateClass(state))}>
            {state.replace('_', ' ')}
          </span>
        )}

        <NotificationBell />

        {showSettings && (
          <Link href="/settings" className="p-2 rounded-lg text-gray-600 hover:text-gray-300 hover:bg-[#141829] transition-colors" aria-label="Settings">
            <Settings className="w-4 h-4" />
          </Link>
        )}

        {/* User menu */}
        <div className="relative" ref={menuRef}>
          <button
            type="button"
            onClick={() => setMenuOpen((o) => !o)}
            className="flex items-center gap-2.5 pl-3 border-l border-[#1e2235] hover:bg-[#141829] rounded-lg px-2.5 py-1.5 transition-colors"
          >
            <div className="w-7 h-7 rounded-full bg-[#7C5CFC]/10 flex items-center justify-center text-[#7C5CFC] text-xs font-semibold">
              {userInitials || '?'}
            </div>
            <span className="text-sm text-gray-300 hidden sm:block">{userName || 'User'}</span>
            <ChevronDown className={cn('w-3 h-3 text-gray-600 transition-transform', menuOpen && 'rotate-180')} />
          </button>
          {menuOpen && (
            <div className="absolute right-0 top-full mt-1.5 w-56 bg-[#141829] border border-[#262C48] rounded-xl shadow-2xl py-1 z-50">
              <div className="px-4 py-3 border-b border-[#1e2235]">
                <p className="text-sm font-medium text-white">{userName || 'User'}</p>
                <p className="text-xs text-gray-500 mt-0.5">{user?.email ?? ''}</p>
                <span className={cn('inline-block mt-2 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider', ROLE_BADGE_STYLE[role] ?? 'bg-gray-500/10 text-gray-400')}>
                  {getRoleLabel(role)}
                </span>
              </div>
              <button
                type="button"
                onClick={() => { setMenuOpen(false); logout(); }}
                className="w-full flex items-center gap-2.5 px-4 py-2.5 text-sm text-gray-400 hover:bg-[#1a1d2e] hover:text-white transition-colors"
              >
                <LogOut className="w-4 h-4" />
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
