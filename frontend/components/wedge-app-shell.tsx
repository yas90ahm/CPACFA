'use client';

import * as React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { cn } from '@/lib/utils';
import {
  LayoutDashboard,
  Calendar,
  BarChart3,
  FileCheck,
  FileDown,
  ClipboardCheck,
  LogOut,
} from 'lucide-react';

const SIDEBAR_WIDTH = 240;

const navItems = [
  { href: '/dashboard', label: 'Overview', icon: LayoutDashboard },
  { href: '/close', label: 'Month-End Close', icon: Calendar },
  { href: '/approvals', label: 'Approvals', icon: ClipboardCheck },
  { href: '/valuation', label: 'Valuation', icon: BarChart3 },
  { href: '/conflicts', label: 'Review', icon: FileCheck },
  { href: '/export', label: 'Reports', icon: FileDown },
] as const;

export function WedgeAppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { user, logout } = useAuth();

  return (
    <div className="flex min-h-screen bg-background">
      <aside
        className="sticky top-0 flex h-screen flex-col border-r border-border bg-card"
        style={{ width: SIDEBAR_WIDTH }}
      >
        <div className="flex flex-col gap-1 border-b border-border px-5 py-4">
          <h1 className="text-lg font-semibold tracking-tight text-foreground">
            FinOS
          </h1>
          <p className="text-xs text-muted-foreground">
            Financial close & valuation
          </p>
        </div>
        <nav className="flex-1 space-y-0.5 overflow-y-auto px-3 py-4">
          {navItems.map(({ href, label, icon: Icon }) => {
            const active =
              href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(href);
            return (
              <Link
                key={href}
                href={href}
                className={cn(
                  'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                  active
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="border-t border-border px-3 py-4">
          <div className="mb-2 truncate px-3 py-1 text-xs text-muted-foreground">
            {user?.email ?? user?.name ?? 'Signed in'}
          </div>
          <button
            type="button"
            onClick={() => logout()}
            className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <LogOut className="h-4 w-4 shrink-0" />
            Sign out
          </button>
        </div>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1200px] px-6 py-8">{children}</div>
      </main>
    </div>
  );
}
