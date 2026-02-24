'use client';

import { useEffect, useRef } from 'react';
import { useAuth } from '@/lib/auth';
import { useRouter } from 'next/navigation';

const FALLBACK_REDIRECT_MS = 2000;

export default function HomePage() {
  const { user, token, isLoading } = useAuth();
  const router = useRouter();
  const fallbackRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isLoading) return;
    if (!user && token === null) {
      router.push('/login');
      fallbackRef.current = setTimeout(() => {
        if (typeof window !== 'undefined') {
          window.location.replace('/login');
        }
      }, FALLBACK_REDIRECT_MS);
      return () => {
        if (fallbackRef.current) clearTimeout(fallbackRef.current);
      };
    }
    if (fallbackRef.current) {
      clearTimeout(fallbackRef.current);
      fallbackRef.current = null;
    }
    if (!user) return;
    if (user.role === 'operating_partner' || user.role === 'admin') {
      router.push('/portfolio');
    } else {
      router.push('/close');
    }
  }, [user, token, isLoading, router]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: 'var(--bg-primary)' }}>
      <p style={{ color: 'var(--text-secondary)' }}>Redirecting...</p>
    </div>
  );
}
