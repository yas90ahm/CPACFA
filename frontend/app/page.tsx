'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.push('/login');
  }, [router]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#F5F0E8]">
      <p className="text-[#8B7A5E]">Redirecting...</p>
    </div>
  );
}
