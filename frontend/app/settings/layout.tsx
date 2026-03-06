'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { TopBar } from '@/components/shell/TopBar';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/lib/auth';
import { useEntities } from '@/lib/queries/entities';
import { cn, getUserDisplay } from '@/lib/utils';
import { canAccessSettings, canAccessSettingsPage, getAccessibleSettingsPages, isSettingsReadOnly } from '@/lib/permissions';
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

const ALL_NAV_ITEMS: { href: string; page: string; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { href: '/settings/general', page: 'general', label: 'General', icon: Building2 },
  { href: '/settings/reconciliation', page: 'reconciliation', label: 'Reconciliation', icon: ShieldCheck },
  { href: '/settings/evidence-policy', page: 'evidence-policy', label: 'Evidence Policy', icon: FileCheck },
  { href: '/settings/templates', page: 'templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/settings/taxonomy', page: 'taxonomy', label: 'Taxonomy', icon: FolderTree },
  { href: '/settings/integrations', page: 'integrations', label: 'Integrations', icon: Plug },
  { href: '/settings/team', page: 'team', label: 'Team & Roles', icon: Users },
];

export default function SettingsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  const { data: entities = [] } = useEntities();
  const entityName = entities.length > 0 ? entities[0].name : 'My Company';
  const { displayName: userName, initials: userInitials } = getUserDisplay(user);
  const role = user?.role ?? 'controller';

  // Redirect if no settings access at all
  useEffect(() => {
    if (!user) return;
    if (!canAccessSettings(role)) {
      router.replace('/close');
      return;
    }
    // Check if the current page is allowed
    const currentPage = pathname?.split('/settings/')?.[1]?.split('/')?.[0];
    if (currentPage && !canAccessSettingsPage(role, currentPage)) {
      const defaultPage = getAccessibleSettingsPages(role)[0];
      if (defaultPage) {
        router.replace(`/settings/${defaultPage}`);
      } else {
        router.replace('/close');
      }
    }
  }, [user, role, pathname, router]);

  const visibleNavItems = ALL_NAV_ITEMS.filter((item) => canAccessSettingsPage(role, item.page));

  return (
    <AuthGuard>
    <div className="min-h-screen bg-primary">
      <TopBar entityName={entityName} showPeriod={false} userName={userName} userInitials={userInitials} />
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
            {visibleNavItems.map((item) => {
              const isActive = pathname === item.href;
              const readOnly = isSettingsReadOnly(role, item.page);
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
                  {readOnly && <span className="ml-auto text-[10px] text-text-muted uppercase">View</span>}
                </Link>
              );
            })}
          </nav>
        </aside>
        <main className="flex-1 pl-56 pr-8 py-8">{children}</main>
      </div>
    </div>
    </AuthGuard>
  );
}
