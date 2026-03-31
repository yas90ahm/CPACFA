'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { apiFetch } from '@/lib/api';
import {
  Settings,
  Globe,
  Landmark,
  Users,
  FileCheck,
  BookOpen,
  Layers,
  Plug,
  ExternalLink,
  Pencil,
  Plus,
  Loader2,
  AlertTriangle,
  CheckCircle2,
  Shield,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface ERPConnection {
  id: string;
  provider: string;
  status: string;
  lastSyncAt?: string;
  connectedAt?: string;
}

interface BankConnection {
  id: string;
  bankName: string;
  accountLast4: string;
  accountType: string;
  status: string;
}

interface MaterialityConfig {
  varianceThreshold?: number;
  dollarThreshold?: number;
  jeApprovalThreshold?: number;
  reconTolerance?: number;
}

interface TeamMember {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  lastActiveAt?: string;
}

/* ------------------------------------------------------------------ */
/*  Sidebar nav items                                                  */
/* ------------------------------------------------------------------ */

const NAV_ITEMS = [
  { key: 'general', label: 'General', icon: Settings, href: '/settings/general' },
  { key: 'erp', label: 'ERP Integrations', icon: Plug, href: '/settings/general' },
  { key: 'bank', label: 'Bank Connections', icon: Landmark, href: '/settings/general' },
  { key: 'materiality', label: 'Materiality', icon: Layers, href: '/settings/general' },
  { key: 'team', label: 'Team', icon: Users, href: '/settings/general' },
  { key: 'evidence', label: 'Evidence Policy', icon: FileCheck, href: '/settings/general' },
  { key: 'taxonomy', label: 'Taxonomy', icon: BookOpen, href: '/settings/general' },
];

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

const ERP_PROVIDERS: Record<string, { label: string; description: string }> = {
  netsuite: { label: 'NetSuite', description: 'Oracle NetSuite ERP' },
  quickbooks: { label: 'QuickBooks Online', description: 'Intuit QuickBooks' },
  xero: { label: 'Xero', description: 'Xero Cloud Accounting' },
};

const ROLE_COLORS: Record<string, string> = {
  controller: 'bg-[#2D6A4F] text-[#F5F0E8]',
  cfo: 'bg-[#B8860B] text-[#F5F0E8]',
  'staff accountant': 'bg-[#3B6EA5] text-[#F5F0E8]',
  'staff_accountant': 'bg-[#3B6EA5] text-[#F5F0E8]',
  'vp finance': 'bg-[#8B6914] text-[#F5F0E8]',
  'vp_finance': 'bg-[#8B6914] text-[#F5F0E8]',
  admin: 'bg-[#5C4F3A] text-[#F5F0E8]',
  'system admin': 'bg-[#5C4F3A] text-[#F5F0E8]',
  'system_admin': 'bg-[#5C4F3A] text-[#F5F0E8]',
};

function roleBadgeClass(role: string): string {
  const key = role.toLowerCase().replace(/_/g, ' ').replace(/-/g, ' ');
  return ROLE_COLORS[key] ?? 'bg-[#8B7A5E] text-[#F5F0E8]';
}

function fmtDate(d?: string): string {
  if (!d) return '--';
  return new Date(d).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

function fmtRelative(d?: string): string {
  if (!d) return '--';
  const now = Date.now();
  const then = new Date(d).getTime();
  const diffMin = Math.floor((now - then) / 60_000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `${diffH}h ago`;
  return fmtDate(d);
}

function fmtDollar(n?: number): string {
  if (n === undefined || n === null) return '--';
  return '$' + n.toLocaleString('en-US');
}

function fmtPercent(n?: number): string {
  if (n === undefined || n === null) return '--';
  return n + '%';
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function SettingsPage() {
  const [activeNav, setActiveNav] = useState('erp');
  const [showInviteForm, setShowInviteForm] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('senior_accountant');
  const [inviteError, setInviteError] = useState('');
  const [inviteSuccess, setInviteSuccess] = useState('');
  const [editingThreshold, setEditingThreshold] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const queryClient = useQueryClient();

  /* --- Data fetching --- */

  const { data: erpConnections, isLoading: loadingErp } = useQuery({
    queryKey: ['erp-connections'],
    queryFn: () => apiFetch<ERPConnection[]>('/api/accounting-integration/connections'),
  });

  const { data: bankConnections, isLoading: loadingBank } = useQuery({
    queryKey: ['bank-connections'],
    queryFn: () => apiFetch<BankConnection[]>('/api/bank-connections'),
  });

  const { data: materiality, isLoading: loadingMat } = useQuery({
    queryKey: ['materiality-config'],
    queryFn: () => apiFetch<MaterialityConfig>('/api/config/materiality'),
  });

  const { data: teamData, isLoading: loadingTeam } = useQuery({
    queryKey: ['settings-team'],
    queryFn: () => apiFetch<{ members: TeamMember[] }>('/api/settings/team'),
  });

  const team = teamData?.members ?? (Array.isArray(teamData) ? (teamData as unknown as TeamMember[]) : []);

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiFetch('/api/settings/team/invite', {
        method: 'POST',
        body: { email: inviteEmail, name: inviteName, role: inviteRole },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['settings-team'] });
      setInviteEmail('');
      setInviteName('');
      setInviteRole('senior_accountant');
      setInviteError('');
      setShowInviteForm(false);
      setInviteSuccess('Invitation sent successfully');
      setTimeout(() => setInviteSuccess(''), 4000);
    },
    onError: (err: Error) => {
      setInviteError(err.message || 'Failed to send invitation');
    },
  });

  const materialityMutation = useMutation({
    mutationFn: (payload: Record<string, number>) =>
      apiFetch('/api/config/materiality', { method: 'PUT', body: payload }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['materiality-config'] });
      setEditingThreshold(null);
      setEditValue('');
    },
  });

  /* --- Derived ERP list (always show 3 providers) --- */

  const erpList = ['netsuite', 'quickbooks', 'xero'].map((provider) => {
    const conn = (erpConnections ?? []).find(
      (c) => c.provider?.toLowerCase().replace(/\s+/g, '') === provider.replace(/\s+/g, '')
    );
    return {
      provider,
      ...(ERP_PROVIDERS[provider] ?? { label: provider, description: '' }),
      connected: conn?.status === 'connected',
      lastSyncAt: conn?.lastSyncAt,
    };
  });

  const isLoading = loadingErp || loadingBank || loadingMat || loadingTeam;

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex">
      {/* ---- Sidebar ---- */}
      <aside className="w-[190px] min-h-screen bg-[#EDE6D6] border-r border-[#DDD5C2] flex flex-col">
        <div className="px-5 pt-6 pb-4">
          <span className="text-lg font-medium tracking-wide text-[#2C2416]">SABIT</span>
        </div>
        <nav className="flex-1 flex flex-col gap-0.5 px-2">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.key === activeNav;
            return (
              <button
                key={item.key}
                onClick={() => setActiveNav(item.key)}
                className={`flex items-center gap-2.5 px-3 py-2 text-sm rounded-md transition-colors text-left w-full ${
                  active
                    ? 'text-[#B8860B] font-medium border-l-2 border-[#B8860B] bg-[#F5F0E8]'
                    : 'text-[#8B7A5E] hover:text-[#2C2416] hover:bg-[#F5F0E8]'
                }`}
              >
                <Icon size={16} />
                {item.label}
              </button>
            );
          })}
        </nav>
      </aside>

      {/* ---- Main content ---- */}
      <main className="flex-1 overflow-y-auto">
        <div className="max-w-5xl mx-auto px-8 py-8">
          {/* Header */}
          <div className="mb-8">
            <h1 className="text-2xl font-medium text-[#2C2416]">
              Settings{' '}
              <span className="text-[#8B7A5E] font-normal">
                — ERP Integrations
              </span>
            </h1>
          </div>

          {isLoading && (
            <div className="flex items-center gap-2 text-[#8B7A5E] mb-6">
              <Loader2 size={16} className="animate-spin" />
              <span className="text-sm">Loading settings...</span>
            </div>
          )}

          {/* ============ ERP CONNECTIONS ============ */}
          <section className="mb-10">
            <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wider mb-4">
              ERP Connections
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {erpList.map((erp) => (
                <div
                  key={erp.provider}
                  className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5"
                >
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <h3 className="text-sm font-medium text-[#2C2416]">{erp.label}</h3>
                      <p className="text-xs text-[#8B7A5E] mt-0.5">{erp.description}</p>
                    </div>
                    <Globe size={18} className="text-[#8B7A5E] mt-0.5" />
                  </div>
                  {erp.connected ? (
                    <div className="mt-3">
                      <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2D6A4F] bg-[#2D6A4F]/10 px-2.5 py-1 rounded-full">
                        <CheckCircle2 size={12} />
                        Connected
                      </span>
                      <p className="text-xs text-[#8B7A5E] mt-2">
                        Last sync: {fmtRelative(erp.lastSyncAt)}
                      </p>
                    </div>
                  ) : (
                    <button
                      onClick={() => {
                        const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
                        window.open(`${baseUrl}/api/integrations/oauth/start/${erp.provider}`, '_blank');
                      }}
                      className="mt-3 text-xs font-medium text-[#F5F0E8] bg-[#2C2416] px-4 py-1.5 rounded-md hover:bg-[#2C2416]/90 transition-colors"
                    >
                      Connect
                    </button>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ============ BANK CONNECTIONS ============ */}
          <section className="mb-10">
            <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wider mb-4">
              Bank Connections{' '}
              <span className="text-[#8B7A5E] font-normal">(via Plaid)</span>
            </h2>
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#DDD5C2]">
                    <th className="text-left px-5 py-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                      Bank
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                      Account
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                      Type
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {(bankConnections ?? []).length === 0 && !loadingBank ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-6 text-center text-sm text-[#8B7A5E]">
                        No bank connections configured
                      </td>
                    </tr>
                  ) : (
                    (bankConnections ?? []).map((bank) => (
                      <tr key={bank.id} className="border-b border-[#DDD5C2] last:border-0">
                        <td className="px-5 py-3 text-[#2C2416] font-medium">{bank.bankName}</td>
                        <td className="px-5 py-3 text-[#8B7A5E] font-mono">****{bank.accountLast4}</td>
                        <td className="px-5 py-3 text-[#8B7A5E]">{bank.accountType}</td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2D6A4F]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]" />
                            Active
                          </span>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>

          {/* ============ MATERIALITY THRESHOLDS ============ */}
          <section className="mb-10">
            <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wider mb-4">
              Materiality Thresholds
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {[
                {
                  key: 'varianceThreshold',
                  label: 'Variance Materiality',
                  value: fmtPercent(materiality?.varianceThreshold ?? 5),
                  raw: materiality?.varianceThreshold ?? 5,
                },
                {
                  key: 'dollarThreshold',
                  label: 'Dollar Threshold',
                  value: fmtDollar(materiality?.dollarThreshold ?? 100000),
                  raw: materiality?.dollarThreshold ?? 100000,
                },
                {
                  key: 'jeApprovalThreshold',
                  label: 'JE Approval Threshold',
                  value: fmtDollar(materiality?.jeApprovalThreshold ?? 50000),
                  raw: materiality?.jeApprovalThreshold ?? 50000,
                },
                {
                  key: 'reconTolerance',
                  label: 'Recon Tolerance',
                  value: fmtDollar(materiality?.reconTolerance ?? 100),
                  raw: materiality?.reconTolerance ?? 100,
                },
              ].map((item) => (
                <div
                  key={item.label}
                  className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-4"
                >
                  <p className="text-xs text-[#8B7A5E] mb-1">{item.label}</p>
                  {editingThreshold === item.key ? (
                    <div className="mt-1">
                      <input
                        type="number"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        className="w-full px-2 py-1 text-sm font-mono border border-[#DDD5C2] rounded bg-[#F5F0E8] text-[#2C2416] focus:outline-none focus:border-[#B8860B]"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === 'Escape') {
                            setEditingThreshold(null);
                            setEditValue('');
                          }
                        }}
                      />
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          onClick={() => {
                            const num = Number(editValue);
                            if (!isNaN(num)) {
                              materialityMutation.mutate({ [item.key]: num });
                            }
                          }}
                          disabled={materialityMutation.isPending}
                          className="text-xs font-medium text-[#F5F0E8] bg-[#2D6A4F] px-3 py-1 rounded hover:bg-[#2D6A4F]/90 transition-colors disabled:opacity-50"
                        >
                          {materialityMutation.isPending ? 'Saving...' : 'Save'}
                        </button>
                        <button
                          onClick={() => { setEditingThreshold(null); setEditValue(''); }}
                          className="text-xs text-[#8B7A5E] hover:text-[#2C2416] transition-colors"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <>
                      <p className="text-xl font-medium text-[#2C2416] font-mono">{item.value}</p>
                      <button
                        onClick={() => { setEditingThreshold(item.key); setEditValue(String(item.raw)); }}
                        className="mt-2 flex items-center gap-1 text-xs text-[#8B7A5E] hover:text-[#2C2416] transition-colors"
                      >
                        <Pencil size={12} />
                        Edit
                      </button>
                    </>
                  )}
                </div>
              ))}
            </div>
          </section>

          {/* ============ TEAM MANAGEMENT ============ */}
          <section className="mb-10">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wider">
                Team Management
              </h2>
              <button
                onClick={() => { setShowInviteForm(!showInviteForm); setInviteError(''); }}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-[#F5F0E8] bg-[#2D6A4F] px-4 py-1.5 rounded-md hover:bg-[#2D6A4F]/90 transition-colors"
              >
                <Plus size={14} />
                Invite User
              </button>
            </div>
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-[#DDD5C2]">
                    <th className="text-left px-5 py-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                      Name
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                      Email
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                      Role
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-left px-5 py-3 text-xs font-medium text-[#8B7A5E] uppercase tracking-wider">
                      Last Active
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {team.length === 0 && !loadingTeam ? (
                    <tr>
                      <td colSpan={5} className="px-5 py-6 text-center text-sm text-[#8B7A5E]">
                        No team members found
                      </td>
                    </tr>
                  ) : (
                    team.map((member) => (
                      <tr key={member.id} className="border-b border-[#DDD5C2] last:border-0">
                        <td className="px-5 py-3 text-[#2C2416] font-medium">{member.name}</td>
                        <td className="px-5 py-3 text-[#8B7A5E]">{member.email}</td>
                        <td className="px-5 py-3">
                          <span
                            className={`inline-block text-xs font-medium px-2.5 py-0.5 rounded-full ${roleBadgeClass(member.role)}`}
                          >
                            {member.role}
                          </span>
                        </td>
                        <td className="px-5 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-[#2D6A4F]">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#2D6A4F]" />
                            Active
                          </span>
                        </td>
                        <td className="px-5 py-3 text-xs text-[#8B7A5E]">
                          {fmtRelative(member.lastActiveAt)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>

            {inviteSuccess && (
              <div className="mt-3 flex items-center gap-2 text-sm text-[#2D6A4F] bg-[#E0EDE8] border border-[#2D6A4F]/20 rounded-md px-4 py-2.5">
                <CheckCircle2 size={14} />
                {inviteSuccess}
              </div>
            )}

            {showInviteForm && (
              <div className="mt-4 bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
                <h3 className="text-sm font-medium text-[#2C2416] mb-4">Invite New User</h3>
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-xs text-[#8B7A5E] mb-1">Name</label>
                    <input
                      type="text"
                      value={inviteName}
                      onChange={(e) => setInviteName(e.target.value)}
                      placeholder="Full name"
                      className="w-full bg-[#F5F0E8] border border-[#DDD5C2] rounded-md px-3 py-2 text-sm text-[#2C2416] placeholder-[#8B7A5E]/60 focus:outline-none focus:border-[#B8860B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B7A5E] mb-1">Email</label>
                    <input
                      type="email"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      placeholder="email@company.com"
                      className="w-full bg-[#F5F0E8] border border-[#DDD5C2] rounded-md px-3 py-2 text-sm text-[#2C2416] placeholder-[#8B7A5E]/60 focus:outline-none focus:border-[#B8860B]"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-[#8B7A5E] mb-1">Role</label>
                    <select
                      value={inviteRole}
                      onChange={(e) => setInviteRole(e.target.value)}
                      className="w-full bg-[#F5F0E8] border border-[#DDD5C2] rounded-md px-3 py-2 text-sm text-[#2C2416] focus:outline-none focus:border-[#B8860B]"
                    >
                      <option value="controller">Controller</option>
                      <option value="senior_accountant">Senior Accountant</option>
                      <option value="cfo">CFO</option>
                      <option value="reviewer">Reviewer</option>
                    </select>
                  </div>
                  <div className="flex items-end">
                    <button
                      onClick={() => inviteMutation.mutate()}
                      disabled={!inviteEmail || inviteMutation.isPending}
                      className="w-full inline-flex items-center justify-center gap-1.5 text-xs font-medium text-[#F5F0E8] bg-[#2D6A4F] px-4 py-2 rounded-md hover:bg-[#2D6A4F]/90 transition-colors disabled:opacity-50"
                    >
                      {inviteMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Plus size={14} />}
                      Send Invite
                    </button>
                  </div>
                </div>
                {inviteError && (
                  <div className="mt-3 flex items-center gap-2 text-xs text-[#C44B2B]">
                    <AlertTriangle size={12} />
                    {inviteError}
                  </div>
                )}
              </div>
            )}
          </section>

          {/* ============ AUDIT NOTICE ============ */}
          <div className="bg-[#8B6914]/10 border border-[#8B6914]/30 rounded-lg px-5 py-4 flex items-start gap-3">
            <Shield size={18} className="text-[#8B6914] mt-0.5 shrink-0" />
            <p className="text-sm text-[#8B6914]">
              All configuration changes are logged to the tamper-evident audit trail and
              cryptographically linked to the operator who made the change.
            </p>
          </div>
        </div>
      </main>
    </div>
  );
}
