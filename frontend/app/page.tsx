'use client';

import { Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';

function RootRedirect() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const role = searchParams.get('role');
    if (role === 'operating_partner' || role === 'admin') {
      router.replace('/portfolio');
    } else {
      router.replace('/close');
    }
  }, [router, searchParams]);

  return (
    <div className="min-h-screen bg-primary flex items-center justify-center">
      <span className="text-text-secondary text-sm">Loading...</span>
    </div>
  );
}

export default function RootPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-primary flex items-center justify-center">
        <span className="text-text-secondary text-sm">Loading...</span>
      </div>
    }>
      <RootRedirect />
    </Suspense>
  );
}
