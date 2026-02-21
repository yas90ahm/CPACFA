'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { TopBar } from '@/components/shell/TopBar';
import { cn } from '@/lib/utils';
import {
  Building2,
  ShieldCheck,
  FileCheck,
  LayoutTemplate,
  FolderTree,
  Plug,
  Users,
  ArrowLeft,
} from 'lucide-react';

const NAV_ITEMS: { href: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: '/settings/general', label: 'General', icon: Building2 },
  { href: '/settings/reconciliation', label: 'Reconciliation', icon: ShieldCheck },
  { href: '/settings/evidence-policy', label: 'Evidence Policy', icon: FileCheck },
  { href: '/settings/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/settings/taxonomy', label: 'Taxonomy', icon: FolderTree },
  { href: '/settings/integrations', label: 'Integrations', icon: Plug },
  { href: '/settings/team', label: 'Team & Roles', icon: Users },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-primary">
      <TopBar entityName="Apex Manufacturing Co." showPeriod={false} />
      <div className="pt-14 flex">
        <aside className="fixed left-0 top-14 w-56 h-[calc(100vh-56px)] bg-surface border-r border-border py-4 flex flex-col z-20">
          <Link
            href="/close"
            className="flex items-center gap-2 px-4 py-2 mx-2 mb-2 text-sm text-text-secondary hover:text-primary hover:bg-hover rounded-input"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Close
          </Link>
          <nav className="flex-1 overflow-y-auto px-2">
            {NAV_ITEMS.map((item) => {
              const isActive = pathname === item.href;
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 px-3 py-2.5 rounded-input text-sm transition-colors border-l-3 border-transparent',
                    isActive ? 'bg-accent-dim text-accent border-l-accent' : 'text-text-secondary hover:bg-hover hover:text-primary'
                  )}
                  style={{ borderLeftWidth: '3px' }}
                >
                  <item.icon className="w-5 h-5 shrink-0" />
                  {item.label}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 pl-56 pr-8 py-8">{children}</main>
      </div>
    </div>
  );
}
