'use client';

import { TopBar } from '@/components/shell/TopBar';

export default function PortfolioLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen bg-primary">
      <TopBar mode="portfolio" userName="Operating Partner" userInitials="OP" />
      <main className="pt-14">{children}</main>
    </div>
  );
}
