'use client';

import { useState } from 'react';
import { mockTeam, type TeamMember, type TeamRole } from '@/lib/mock/team';
import { SlideOverPanel } from '@/components/shared/SlideOverPanel';
import { cn } from '@/lib/utils';
import { Plus, Pencil, UserX } from 'lucide-react';

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
  const [members, setMembers] = useState<TeamMember[]>(mockTeam);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState<TeamRole>('CONTROLLER');

  const controllers = members.filter((m) => m.role === 'CONTROLLER' && m.status === 'active').length;
  const reviewersOrCertifiers = members.filter((m) => (m.role === 'REVIEWER' || m.role === 'CERTIFIER') && m.status === 'active').length;
  const needsReviewer = reviewersOrCertifiers === 0;

  const handleSendInvite = () => {
    if (!inviteEmail.trim()) return;
    setMembers((prev) => [...prev, { id: `inv-${Date.now()}`, name: '', email: inviteEmail.trim(), role: inviteRole, status: 'invited', lastActive: null }]);
    setInviteEmail('');
    setInviteRole('CONTROLLER');
    setInviteOpen(false);
  };

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
                  <span className={cn('px-1.5 py-0.5 rounded text-xs', ROLE_BADGE_STYLE[m.role])}>{ROLE_LABELS[m.role]}</span>
                </td>
                <td className="py-2.5 px-4 capitalize">{m.status}</td>
                <td className="py-2.5 px-4 text-text-secondary">{m.lastActive ?? '—'}</td>
                <td className="py-2.5 px-4 flex items-center gap-1">
                  <button type="button" className="p-1.5 rounded-input text-text-secondary hover:bg-hover" aria-label="Edit role"><Pencil className="w-4 h-4" /></button>
                  <button type="button" className="p-1.5 rounded-input text-text-secondary hover:bg-status-red-dim hover:text-status-red" aria-label="Deactivate"><UserX className="w-4 h-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

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
