'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (token === null) {
      router.replace('/login');
    }
  }, [token, router]);

  if (token === null) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <span className="text-text-secondary text-sm">Redirecting to login...</span>
      </div>
    );
  }

  return <>{children}</>;
}
