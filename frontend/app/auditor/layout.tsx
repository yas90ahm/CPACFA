import type { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Auditor Portal — FinOS Agent',
  description: 'Read-only portal for external auditors to interrogate Internal Controls and access Audit Binder',
};

export default function AuditorPortalLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
