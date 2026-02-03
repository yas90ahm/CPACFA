'use client';

import { WedgeAppShell } from '@/components/wedge-app-shell';
import { AuthGuard } from '@/components/auth-guard';

export default function WedgeLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <AuthGuard>
      <WedgeAppShell>{children}</WedgeAppShell>
    </AuthGuard>
  );
}
