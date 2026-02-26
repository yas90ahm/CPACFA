'use client';

import { TopBar } from '@/components/shell/TopBar';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/lib/auth';

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const displayName = user?.email ?? 'Portfolio User';
  const initials = user?.email?.slice(0, 2).toUpperCase() ?? 'PU';

  return (
    <AuthGuard>
      <div className="min-h-screen bg-primary">
        <TopBar mode="portfolio" userName={displayName} userInitials={initials} />
        <main className="pt-14">{children}</main>
      </div>
    </AuthGuard>
  );
}
