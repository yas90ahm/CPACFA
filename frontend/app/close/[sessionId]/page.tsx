'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function CloseSessionRoot() {
  const params = useParams();
  const router = useRouter();

  useEffect(() => {
    router.replace(`/close/${params.sessionId}/dashboard`);
  }, [params.sessionId, router]);

  return null;
}
