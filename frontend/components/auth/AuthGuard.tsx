'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { DemoModeBanner } from '@/components/shared/DemoModeBanner';

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { token, isLoading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!isLoading && token === null) {
      router.replace('/login');
    }
  }, [isLoading, token, router]);

  // Still loading auth state from localStorage — don't redirect
  if (isLoading) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <span className="text-text-secondary text-sm">Loading...</span>
      </div>
    );
  }

  if (token === null) {
    return (
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <span className="text-text-secondary text-sm">Redirecting to login...</span>
      </div>
    );
  }

  return (
    <>
      <DemoModeBanner />
      {children}
    </>
  );
}
