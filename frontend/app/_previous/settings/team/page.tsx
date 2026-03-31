'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { apiFetch } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Plus, Pencil, UserX, Users } from 'lucide-react';
import { EmptyState } from '@/components/shared/EmptyState';

type TeamRole = 'CONTROLLER' | 'REVIEWER' | 'CERTIFIER' | 'ADMIN';

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: TeamRole;
  status: string;
  lastActiveAt?: string | null;
  invitedAt?: string | null;
  createdAt?: string;
}

const ROLE_LABELS: Record<TeamRole, string> = {
  CONTROLLER: 'Controller',
  REVIEWER: 'Reviewer',
  CERTIFIER: 'Certifier',
  ADMIN: 'Admin',
};

const ROLE_BADGE_STYLE: Record<TeamRole, string> = {
  CONTROLLER: 'bg-status-blue-dim text-status-blue',
  REVIEWER: 'bg-status-amber-dim text-status-amber',
  CERTIFIER: 'bg-status-green-dim text-status-green',
  ADMIN: 'bg-text-muted/20 text-text-secondary',
};

export default function TeamPage() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['settings-team'],
    queryFn: () => apiFetch<{ members: TeamMember[]; roles: string[] }>('/api/settings/team'),
  });
  const members = data?.members ?? [];

  const showToast = (type: 'success' | 'error', message: string) => {
    setToast({ type, message });
    setTimeout(() => setToast(null), type === 'success' ? 3000 : 5000);
  };

  const inviteMutation = useMutation({
    mutationFn: (body: { email: string; name?: string; role: string }) =>
      apiFetch('/api/settings/team/invite', { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-team'] });
      showToast('success', 'Invitation sent.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to send invitation'),
  });
  const roleMutation = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      apiFetch(`/api/settings/team/${userId}/role`, { method: 'PUT', body: { role } }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-team'] });
      setEditingRoleId(null);
      showToast('success', 'Role updated.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to update role'),
  });
  const deactivateMutation = useMutation({
    mutationFn: (userId: string) => apiFetch(`/api/settings/team/${userId}/deactivate`, { method: 'PUT' }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-team'] });
      showToast('success', 'Member deactivated.');
    },
    onError: (err) => showToast('error', err instanceof Error ? err.message : 'Failed to deactivate member'),
  });

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('CONTROLLER');
  const [editingRoleId, setEditingRoleId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const controllers = members.filter((m) => m.role === 'CONTROLLER' && m.status === 'active').length;
  const reviewersOrCertifiers = members.filter((m) => (m.role === 'REVIEWER' || m.role === 'CERTIFIER') && m.status === 'active').length;
  const needsReviewer = reviewersOrCertifiers === 0;

  const handleSendInvite = () => {
    if (!inviteEmail.trim()) return;
    inviteMutation.mutate({ email: inviteEmail.trim(), role: inviteRole });
    setInviteEmail('');
    setInviteRole('CONTROLLER');
    setInviteOpen(false);
  };

  if (isLoading && members.length === 0) return <div className="text-text-secondary">Loading team...</div>;

  return (
    <div className="max-w-4xl space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-display text-primary">Team & Roles</h1>
          <p className="text-text-secondary text-sm mt-1">Who can prepare, review, and certify the close</p>
        </div>
        <button type="button" onClick={() => setInviteOpen(true)} className="inline-flex items-center gap-2 px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm font-medium hover:opacity-90">
          <Plus className="w-4 h-4" /> Invite Team Member
        </button>
      </div>

      <section className="bg-surface-alt border border-border rounded-card p-5 text-sm space-y-3">
        <h2 className="font-medium text-primary">Roles</h2>
        <p><strong>Controller (Preparer)</strong> — Performs the close: uploads GL, maps accounts, completes reconciliations, creates and posts AJEs, generates statements, explains variances. Cannot approve their own work.</p>
        <p><strong>Reviewer</strong> — Reviews the close package; approves reconciliations, AJEs, variance explanations. Cannot certify.</p>
        <p><strong>Certifier (CFO)</strong> — Reviews and certifies the financial statements. Can reopen certified periods. Highest level of close authority.</p>
        <p><strong>Admin</strong> — Manages settings, team members, integrations. Does not participate in the close workflow directly.</p>
      </section>

      {members.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No Team Members"
          description="Invite your first team member to set up roles for the close workflow."
          actionLabel="Invite Team Member"
          onAction={() => setInviteOpen(true)}
        />
      ) : (
      <div className="bg-surface border border-border rounded-card overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-alt">
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Name</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Email</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Role</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Status</th>
              <th className="text-left py-3 px-4 font-medium text-text-secondary">Last Active</th>
              <th className="w-24" />
            </tr>
          </thead>
          <tbody>
            {members.map((m) => (
              <tr key={m.id} className="border-b border-border-light hover:bg-hover/50">
                <td className="py-2.5 px-4">{m.name || '—'}</td>
                <td className="py-2.5 px-4">{m.email}</td>
                <td className="py-2.5 px-4">
                  {editingRoleId === m.id ? (
                    <select
                      value={m.role}
                      onChange={(e) => roleMutation.mutate({ userId: m.id, role: e.target.value })}
                      onBlur={() => setEditingRoleId(null)}
                      autoFocus
                      className="rounded-input border border-accent bg-input px-2 py-1 text-xs"
                    >
                      {(['CONTROLLER', 'REVIEWER', 'CERTIFIER', 'ADMIN'] as const).map((r) => (
                        <option key={r} value={r}>{ROLE_LABELS[r]}</option>
                      ))}
                    </select>
                  ) : (
                    <span className={cn('px-1.5 py-0.5 rounded text-xs', ROLE_BADGE_STYLE[m.role])}>{ROLE_LABELS[m.role]}</span>
                  )}
                </td>
                <td className="py-2.5 px-4 capitalize">{m.status}</td>
                <td className="py-2.5 px-4 text-text-secondary">{m.lastActiveAt ? new Date(m.lastActiveAt).toLocaleDateString() : '—'}</td>
                <td className="py-2.5 px-4 flex items-center gap-1">
                  <button type="button" onClick={() => setEditingRoleId(editingRoleId === m.id ? null : m.id)} className="p-1.5 rounded-input text-text-secondary hover:bg-hover" aria-label="Edit role"><Pencil className="w-4 h-4" /></button>
                  <button type="button" onClick={() => deactivateMutation.mutate(m.id)} className="p-1.5 rounded-input text-text-secondary hover:bg-status-red-dim hover:text-status-red" aria-label="Deactivate"><UserX className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      )}

      <div className={cn('rounded-card border p-4 text-sm', needsReviewer ? 'bg-status-amber-dim border-status-amber/50' : 'bg-surface-alt border-border')}>
        <p className="font-medium text-primary">Segregation of Duties</p>
        <p className="text-text-secondary mt-1">
          The system enforces that a preparer cannot approve their own work. Ensure you have at least one Controller and one Reviewer/Certifier. Currently: {controllers} Controller(s), {reviewersOrCertifiers} Reviewer/Certifier(s).
        </p>
        {needsReviewer && (
          <p className="text-status-amber mt-2">
            You need at least one Reviewer or Certifier to approve reconciliations, journal entries, and certify periods. Invite a team member with the appropriate role.
          </p>
        )}
      </div>

      {toast && (
        <div
          className={cn(
            'fixed bottom-6 right-6 z-50 px-4 py-3 rounded-lg border text-sm shadow-lg',
            toast.type === 'success'
              ? 'border-status-green bg-status-green-dim text-status-green'
              : 'border-status-red bg-status-red-dim text-status-red'
          )}
        >
          {toast.message}
        </div>
      )}

      <SlideOverPanel open={inviteOpen} onClose={() => setInviteOpen(false)} title="Invite Team Member" footer={
        <>
          <button type="button" className="px-4 py-2 rounded-input border border-border text-sm" onClick={() => setInviteOpen(false)}>Cancel</button>
          <button type="button" className="px-4 py-2 rounded-input bg-accent text-accent-contrast text-sm" onClick={handleSendInvite} disabled={!inviteEmail.trim()}>Send Invitation</button>
        </>
      }>
        <div className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-1">Email Address *</label>
            <input type="email" value={inviteEmail} onChange={(e) => setInviteEmail(e.target.value)} placeholder="jane.doe@apexmfg.com" className="w-full rounded-input border border-border bg-input px-3 py-2 text-sm" />
          </div>
          <div>
            <label className="block text-xs font-medium text-text-secondary mb-2">Role *</label>
            <div className="space-y-2">
              {(['CONTROLLER', 'REVIEWER', 'CERTIFIER', 'ADMIN'] as const).map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input type="radio" name="inviteRole" checked={inviteRole === r} onChange={() => setInviteRole(r)} />
                  {ROLE_LABELS[r]}
                </label>
              ))}
            </div>
          </div>
        </div>
      </SlideOverPanel>
    </div>
  );
}
