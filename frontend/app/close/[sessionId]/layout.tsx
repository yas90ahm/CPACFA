'use client';

import { useParams } from 'next/navigation';
import { CloseSidebar } from '@/components/close-sidebar';
import SabitAssistantStrip from '@/components/close/SabitAssistantStrip';

export default function CloseSessionLayout({ children }: { children: React.ReactNode }) {
  const params = useParams();
  const sessionId = params.sessionId as string;

  return (
    <>
      <CloseSidebar sessionId={sessionId} />
      <SabitAssistantStrip sessionId={sessionId} />
      {children}
    </>
  );
}
