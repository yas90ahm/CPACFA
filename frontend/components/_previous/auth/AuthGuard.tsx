'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && !user) {
      router.replace('/login');
    }
  }, [isLoading, user, router]);

  // Still loading auth state from localStorage — don't redirect
  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <span className="text-text-secondary text-sm">Loading...</span>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <span className="text-text-secondary text-sm">Redirecting to login...</span>
      </div>
    );
  }

  return <>{children}</>;
}
