import { redirect } from 'next/navigation';

export default function SessionPage({
  params,
}: {
  params: { sessionId: string };
}) {
  redirect(`/close/${params.sessionId}/dashboard`);
}
