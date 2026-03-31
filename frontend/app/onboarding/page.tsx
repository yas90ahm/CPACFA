'use client';

import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import {
  Check,
  ChevronRight,
  ChevronLeft,
  Loader2,
  Building2,
  Plug,
  Sliders,
  Users,
  ClipboardCheck,
  Plus,
  Mail,
} from 'lucide-react';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

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
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const STEPS = [
  { key: 'company', label: 'Company', icon: Building2 },
  { key: 'erp', label: 'ERP Connect', icon: Plug },
  { key: 'thresholds', label: 'Thresholds', icon: Sliders },
  { key: 'team', label: 'Team', icon: Users },
  { key: 'review', label: 'Review', icon: ClipboardCheck },
];

const RECON_REQUIREMENTS = [
  { key: 'bank', label: 'Require bank statements for all cash accounts', defaultOn: true },
  { key: 'ar', label: 'Require subledger reconciliation for AR', defaultOn: true },
  { key: 'ap', label: 'Require subledger reconciliation for AP', defaultOn: true },
  { key: 'fa', label: 'Require fixed-asset register tie-out', defaultOn: true },
  { key: 'evidence', label: 'Minimum 2 evidence attachments per reconciliation', defaultOn: true },
  { key: 'automatch', label: 'Enable auto-match for bank transactions', defaultOn: true },
  { key: 'sod', label: 'Enforce separation of duties (preparer != approver)', defaultOn: true },
  { key: 'tolerance', label: 'Allow tolerance-based auto-approval', defaultOn: false },
];

const ROLE_COLORS: Record<string, string> = {
  controller: 'bg-[#2D6A4F] text-[#F5F0E8]',
  cfo: 'bg-[#B8860B] text-[#F5F0E8]',
  'staff accountant': 'bg-[#3B6EA5] text-[#F5F0E8]',
  'vp finance': 'bg-[#8B6914] text-[#F5F0E8]',
};

function roleBadgeClass(role: string): string {
  return ROLE_COLORS[role.toLowerCase()] ?? 'bg-[#8B7A5E] text-[#F5F0E8]';
}

function avatarInitials(name: string): string {
  return name
    .split(' ')
    .map((w) => w[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();
}

/* ------------------------------------------------------------------ */
/*  Page                                                               */
/* ------------------------------------------------------------------ */

export default function OnboardingPage() {
  const [currentStep, setCurrentStep] = useState(2); // 0-indexed, step 3 = index 2
  const [inviteEmail, setInviteEmail] = useState('');

  /* Local form state for thresholds */
  const [varianceThreshold, setVarianceThreshold] = useState('5');
  const [dollarThreshold, setDollarThreshold] = useState('100000');
  const [jeThreshold, setJeThreshold] = useState('50000');
  const [reconChecks, setReconChecks] = useState<Record<string, boolean>>(
    Object.fromEntries(RECON_REQUIREMENTS.map((r) => [r.key, r.defaultOn]))
  );

  /* --- Data fetching --- */

  const { data: materiality } = useQuery({
    queryKey: ['onboarding-materiality'],
    queryFn: () => apiFetch<MaterialityConfig>('/api/config/materiality'),
  });

  const { data: teamData } = useQuery({
    queryKey: ['onboarding-team'],
    queryFn: () => apiFetch<{ members: TeamMember[] }>('/api/settings/team'),
  });

  const team = teamData?.members ?? (Array.isArray(teamData) ? (teamData as unknown as TeamMember[]) : []);

  /* Step state helpers */
  const stepStatus = (i: number): 'done' | 'active' | 'pending' => {
    if (i < currentStep) return 'done';
    if (i === currentStep) return 'active';
    return 'pending';
  };

  return (
    <div className="min-h-screen bg-[#F5F0E8] flex flex-col">
      {/* ============ DARK HEADER BAR ============ */}
      <header className="bg-[#2C2416] px-8 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <span className="text-[#F5F0E8] text-sm font-medium tracking-wide">SABIT</span>
          <span className="text-[#8B7A5E] text-sm">·</span>
          <span className="text-[#F5F0E8]/80 text-sm">First Close Setup</span>
        </div>
        <span className="text-[#8B7A5E] text-sm">
          Step {currentStep + 1} of {STEPS.length}
        </span>
      </header>

      {/* ============ PROGRESS BAR ============ */}
      <div className="bg-[#EDE6D6] border-b border-[#DDD5C2] px-8 py-6">
        <div className="max-w-3xl mx-auto">
          <div className="flex items-center justify-between relative">
            {/* Connecting line */}
            <div className="absolute top-4 left-0 right-0 h-px bg-[#DDD5C2] z-0" />

            {STEPS.map((step, i) => {
              const status = stepStatus(i);
              return (
                <div key={step.key} className="flex flex-col items-center relative z-10">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium transition-colors ${
                      status === 'done'
                        ? 'bg-[#2D6A4F] text-[#F5F0E8]'
                        : status === 'active'
                          ? 'bg-[#B8860B] text-[#F5F0E8]'
                          : 'bg-[#DDD5C2] text-[#8B7A5E]'
                    }`}
                  >
                    {status === 'done' ? <Check size={16} /> : i + 1}
                  </div>
                  <span
                    className={`text-xs mt-2 ${
                      status === 'active'
                        ? 'text-[#B8860B] font-medium'
                        : status === 'done'
                          ? 'text-[#2D6A4F] font-medium'
                          : 'text-[#8B7A5E]'
                    }`}
                  >
                    {step.label}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* ============ MAIN CONTENT ============ */}
      <div className="flex-1 px-8 py-8">
        <div className="max-w-5xl mx-auto">
          {/* Title */}
          <div className="mb-8">
            <h1 className="text-2xl font-medium text-[#2C2416]">Configure Close Thresholds</h1>
            <p className="text-sm text-[#8B7A5E] mt-1">
              Set materiality thresholds, reconciliation requirements, and invite your team.
            </p>
          </div>

          {/* ---- 3 config cards ---- */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* CARD 1: Materiality Thresholds */}
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-medium text-[#2C2416]">Materiality Thresholds</h3>
                <span className="text-xs font-medium text-[#C44B2B] bg-[#C44B2B]/10 px-2 py-0.5 rounded-full">
                  Required
                </span>
              </div>
              <div className="space-y-4">
                <div>
                  <label className="block text-xs text-[#8B7A5E] mb-1">Variance Threshold</label>
                  <div className="relative">
                    <input
                      type="text"
                      value={varianceThreshold}
                      onChange={(e) => setVarianceThreshold(e.target.value)}
                      className="w-full bg-[#F5F0E8] border border-[#DDD5C2] rounded-md px-3 py-2 text-sm text-[#2C2416] font-mono focus:outline-none focus:border-[#B8860B]"
                    />
                    <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-[#8B7A5E]">
                      %
                    </span>
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#8B7A5E] mb-1">Dollar Threshold</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8B7A5E]">
                      $
                    </span>
                    <input
                      type="text"
                      value={dollarThreshold}
                      onChange={(e) => setDollarThreshold(e.target.value)}
                      className="w-full bg-[#F5F0E8] border border-[#DDD5C2] rounded-md pl-7 pr-3 py-2 text-sm text-[#2C2416] font-mono focus:outline-none focus:border-[#B8860B]"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs text-[#8B7A5E] mb-1">JE Posting Threshold</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-[#8B7A5E]">
                      $
                    </span>
                    <input
                      type="text"
                      value={jeThreshold}
                      onChange={(e) => setJeThreshold(e.target.value)}
                      className="w-full bg-[#F5F0E8] border border-[#DDD5C2] rounded-md pl-7 pr-3 py-2 text-sm text-[#2C2416] font-mono focus:outline-none focus:border-[#B8860B]"
                    />
                  </div>
                </div>
              </div>
            </div>

            {/* CARD 2: Reconciliation Requirements */}
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-medium text-[#2C2416]">Reconciliation Requirements</h3>
                <span className="text-xs font-medium text-[#C44B2B] bg-[#C44B2B]/10 px-2 py-0.5 rounded-full">
                  Required
                </span>
              </div>
              <div className="space-y-2.5">
                {RECON_REQUIREMENTS.map((req) => (
                  <label
                    key={req.key}
                    className="flex items-start gap-2.5 cursor-pointer group"
                  >
                    <div
                      className={`w-4 h-4 mt-0.5 rounded border flex items-center justify-center shrink-0 transition-colors ${
                        reconChecks[req.key]
                          ? 'bg-[#2D6A4F] border-[#2D6A4F]'
                          : 'border-[#DDD5C2] bg-[#F5F0E8]'
                      }`}
                      onClick={(e) => {
                        e.preventDefault();
                        setReconChecks((prev) => ({ ...prev, [req.key]: !prev[req.key] }));
                      }}
                    >
                      {reconChecks[req.key] && <Check size={10} className="text-[#F5F0E8]" />}
                    </div>
                    <span className="text-xs text-[#2C2416] leading-tight">{req.label}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* CARD 3: Team Members */}
            <div className="bg-[#EDE6D6] border border-[#DDD5C2] rounded-lg p-5">
              <div className="flex items-center justify-between mb-5">
                <h3 className="text-sm font-medium text-[#2C2416]">Team Members</h3>
                <span className="text-xs font-medium text-[#2D6A4F] bg-[#2D6A4F]/10 px-2 py-0.5 rounded-full">
                  {team.length} invited
                </span>
              </div>
              <div className="space-y-3 mb-4">
                {team.length === 0 ? (
                  <p className="text-xs text-[#8B7A5E] py-2">No team members yet</p>
                ) : (
                  team.slice(0, 4).map((member) => (
                    <div key={member.id} className="flex items-center gap-3">
                      <div className="w-7 h-7 rounded-full bg-[#2C2416] flex items-center justify-center text-[10px] font-medium text-[#F5F0E8] shrink-0">
                        {avatarInitials(member.name)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-[#2C2416] truncate">
                          {member.name}
                        </p>
                        <p className="text-[10px] text-[#8B7A5E] truncate">{member.email}</p>
                      </div>
                      <span
                        className={`text-[10px] font-medium px-2 py-0.5 rounded-full shrink-0 ${roleBadgeClass(member.role)}`}
                      >
                        {member.role}
                      </span>
                    </div>
                  ))
                )}
              </div>

              {/* Invite input */}
              <div className="border-t border-[#DDD5C2] pt-4">
                <div className="flex gap-2">
                  <div className="relative flex-1">
                    <Mail size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8B7A5E]" />
                    <input
                      type="email"
                      placeholder="email@company.com"
                      value={inviteEmail}
                      onChange={(e) => setInviteEmail(e.target.value)}
                      className="w-full bg-[#F5F0E8] border border-[#DDD5C2] rounded-md pl-8 pr-3 py-1.5 text-xs text-[#2C2416] placeholder-[#8B7A5E]/60 focus:outline-none focus:border-[#B8860B]"
                    />
                  </div>
                  <button className="text-xs font-medium text-[#F5F0E8] bg-[#2D6A4F] px-3 py-1.5 rounded-md hover:bg-[#2D6A4F]/90 transition-colors shrink-0">
                    Invite
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ============ BOTTOM NAV BAR ============ */}
      <div className="border-t border-[#DDD5C2] bg-[#EDE6D6] px-8 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <button
            onClick={() => setCurrentStep((s) => Math.max(0, s - 1))}
            className="inline-flex items-center gap-1.5 text-sm text-[#8B7A5E] border border-[#DDD5C2] px-4 py-2 rounded-md hover:bg-[#F5F0E8] transition-colors"
          >
            <ChevronLeft size={16} />
            Back
          </button>
          <span className="text-xs text-[#8B7A5E]">Estimated setup time: 8 minutes</span>
          <button
            onClick={() => setCurrentStep((s) => Math.min(STEPS.length - 1, s + 1))}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#F5F0E8] bg-[#B8860B] px-5 py-2 rounded-md hover:bg-[#B8860B]/90 transition-colors"
          >
            Continue to Team
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
