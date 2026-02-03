'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Root: redirect to diagnostics HUD (lab).
 */
export default function RootPage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace('/diagnostics');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Redirecting to diagnostics…</p>
    </div>
  );
}
