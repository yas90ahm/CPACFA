'use client';

import * as React from 'react';
import { useRouter } from 'next/navigation';

/**
 * Root: redirect to dashboard (auth bypassed for now).
 */
export default function RootPage() {
  const router = useRouter();

  React.useEffect(() => {
    router.replace('/dashboard');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <p className="text-sm text-muted-foreground">Redirecting…</p>
    </div>
  );
}
