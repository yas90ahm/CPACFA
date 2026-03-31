'use client';

import { TopBar } from '@/components/shell/TopBar';
import { AuthGuard } from '@/components/auth/AuthGuard';
import { useAuth } from '@/lib/auth';
import { getUserDisplay } from '@/lib/utils';

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { displayName, initials } = getUserDisplay(user);

  return (
    <AuthGuard>
      <div className="min-h-screen bg-primary">
        <TopBar mode="portfolio" userName={displayName} userInitials={initials} />
        <main className="pt-14">{children}</main>
      </div>
    </AuthGuard>
  );
}
