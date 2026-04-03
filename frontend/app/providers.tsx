'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useState, useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { setAuthExpiredHandler } from '@/lib/api';

export function Providers({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();

  const [queryClient] = useState(() => new QueryClient({
    defaultOptions: { queries: { staleTime: 30_000, retry: 1, refetchOnWindowFocus: true } },
  }));

  useEffect(() => {
    setAuthExpiredHandler(() => {
      // Don't redirect if already on login page
      if (pathname === '/login') return;
      localStorage.removeItem('cpa_auth_token');
      localStorage.removeItem('cpa_auth_user');
      router.push('/login');
    });
  }, [router, pathname]);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}
