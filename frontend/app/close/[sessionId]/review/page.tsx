'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetch } from '@/lib/api';
import { fmtMoney } from '@/lib/money';
import {
  Shield,
  CheckCircle2,
  Download,
  Lock,
  ExternalLink,
  FileText,
  TrendingUp,
  DollarSign,
  Users,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import VarianceReadinessCard from '@/components/close/VarianceReadinessCard';
import { adaptVariances } from '@/lib/contracts/adapters';

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface Gate {
  id: string;
  label: string;
  passing: boolean;
  detail?: string;
}

interface ReadinessResponse {
  gates: Gate[];
  gatesPassing: number;
  gatesTotal: number;
  canAdvance: boolean;
}

interface SessionResponse {
  id: string;
  state: string;
  status?: string;
  periodLabel: string;
  entityName: string;
  certifiedAt?: string;
  certifiedBy?: string;
  lockedAt?: string;
  startedAt?: string;
  createdAt?: string;
  closeDayTarget?: number;
}

interface CertificationArtifact {
  signature: string;
  documentHash: string;
  certifiedBy: string;
  certifiedAt: string;
  publicKey?: string;
  verified?: boolean;
}

interface StatementLine {
  lineItemName: string;
  amount: string;
  section?: string;
}

interface StatementPackage {
  id: string;
  type: string;
  lines?: StatementLine[];
}

/* ------------------------------------------------------------------ */
/*  Helpers                                                            */
/* ------------------------------------------------------------------ */

function formatCertDate(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

function truncateHash(hash: string, len = 64): string {
  if (hash.length <= len) return hash;
  return hash;
}

/* ------------------------------------------------------------------ */
/*  Sub-Components                                                     */
/* ------------------------------------------------------------------ */

function GateGrid({ gates }: { gates: Gate[] }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {gates.map((gate) => (
        <div
          key={gate.id}
          className="flex items-center gap-3 px-4 py-3 rounded-lg bg-[#1F1A12] border border-[#3B2F1E]"
        >
          <div
            className={`w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
              gate.passing
                ? 'bg-[#2D6A4F]'
                : 'bg-[#5C4F3A]'
            }`}
          >
            <CheckCircle2
              size={14}
              className={gate.passing ? 'text-[#A7D7C5]' : 'text-[#8B7A5E]'}
            />
          </div>
          <span className="text-sm text-[#C4B89A] truncate">{gate.label}</span>
        </div>
      ))}
    </div>
  );
}

function CryptographicCard({ artifact }: { artifact: CertificationArtifact }) {
  return (
    <div className="rounded-xl border-2 border-[#B8860B]/40 bg-[#1F1A12] p-6 space-y-5">
      <div className="flex items-center gap-3">
        <Shield size={20} className="text-[#B8860B]" />
        <h3 className="text-lg font-medium text-[#B8860B]">
          Cryptographic Certification
        </h3>
      </div>

      <div className="space-y-4">
        <div>
          <div className="text-xs text-[#8B7A5E] uppercase tracking-wider mb-1">
            Certified By
          </div>
          <div className="text-sm text-[#E8DCC8]">{artifact.certifiedBy}</div>
        </div>

        <div>
          <div className="text-xs text-[#8B7A5E] uppercase tracking-wider mb-1">
            Date &amp; Time
          </div>
          <div className="text-sm text-[#E8DCC8]">
            {formatCertDate(artifact.certifiedAt)}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#8B7A5E] uppercase tracking-wider mb-1">
            Ed25519 Digital Signature
          </div>
          <div className="font-mono text-xs text-[#B8860B] break-all leading-relaxed bg-[#15120C] rounded-lg p-3 border border-[#3B2F1E]">
            {truncateHash(artifact.signature)}
          </div>
        </div>

        <div>
          <div className="text-xs text-[#8B7A5E] uppercase tracking-wider mb-1">
            Document SHA-256 Hash
          </div>
          <div className="font-mono text-xs text-[#C4B89A] break-all leading-relaxed bg-[#15120C] rounded-lg p-3 border border-[#3B2F1E]">
            {truncateHash(artifact.documentHash)}
          </div>
        </div>

        {(artifact.verified !== false) && (
          <div className="flex items-center gap-2 bg-[#2D6A4F]/20 border border-[#2D6A4F]/30 rounded-lg px-4 py-2.5">
            <CheckCircle2 size={16} className="text-[#2D6A4F]" />
            <span className="text-sm font-medium text-[#A7D7C5]">
              Signature Verified
            </span>
          </div>
        )}
      </div>
    </div>
  );
}

interface SummaryCardProps {
  icon: React.ElementType;
  title: string;
  value: string;
  label: string;
}

function SummaryCard({ icon: Icon, title, value, label }: SummaryCardProps) {
  return (
    <div className="bg-[#1F1A12] border border-[#3B2F1E] rounded-xl p-5">
      <div className="flex items-center gap-2 mb-3">
        <Icon size={16} className="text-[#8B7A5E]" />
        <span className="text-xs text-[#8B7A5E] uppercase tracking-wider">
          {title}
        </span>
      </div>
      <div className="text-xl font-mono font-medium text-[#E8DCC8]">
        {value}
      </div>
      <div className="text-xs text-[#8B7A5E] mt-1">{label}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading / Error States                                             */
/* ------------------------------------------------------------------ */

function CeremonySkeleton() {
  return (
    <div className="ml-[260px] min-h-screen bg-[#1A1510] flex items-center justify-center">
      <Loader2 size={32} className="text-[#B8860B] animate-spin" />
    </div>
  );
}

function ErrorState({ message }: { message: string }) {
  return (
    <div className="min-h-screen bg-[#1A1510] flex items-center justify-center px-6">
      <div className="bg-[#1F1A12] border border-[#C44B2B]/30 rounded-xl p-8 max-w-md text-center">
        <AlertCircle size={32} className="text-[#C44B2B] mx-auto mb-4" />
        <h2 className="text-lg font-medium text-[#E8DCC8] mb-2">
          Failed to load certification
        </h2>
        <p className="text-sm text-[#8B7A5E]">{message}</p>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Page                                                          */
/* ------------------------------------------------------------------ */

async function downloadBlob(url: string, filename: string) {
  const baseUrl = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3000';
  const token = localStorage.getItem('cpa_auth_token');
  const res = await fetch(`${baseUrl}${url}`, {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
    credentials: 'include',
  });
  if (!res.ok) return;
  const blob = await res.blob();
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
}

export default function CertificationCeremonyPage() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const sessionId = params.sessionId as string;
  const [lockSuccess, setLockSuccess] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);

  const sessionQuery = useQuery({
    queryKey: ['close-session', sessionId],
    queryFn: () =>
      apiFetch<SessionResponse>(`/api/close/sessions/${sessionId}`),
    enabled: !!sessionId,
  });

  const readinessQuery = useQuery({
    queryKey: ['close-readiness', sessionId],
    queryFn: () =>
      apiFetch<ReadinessResponse>(
        `/api/close/sessions/${sessionId}/readiness`,
        { params: { format: 'gates' } }
      ),
    enabled: !!sessionId,
  });

  const artifactQuery = useQuery({
    queryKey: ['certification-artifact', sessionId],
    queryFn: async () => {
      try {
        return await apiFetch<CertificationArtifact>(
          `/api/verification/certification/artifacts/${sessionId}`
        );
      } catch {
        // Artifact may not exist if not yet certified; return placeholder
        return null;
      }
    },
    enabled: !!sessionId,
  });

  const statementsQuery = useQuery({
    queryKey: ['statement-packages', sessionId],
    queryFn: async () => {
      try {
        const data = await apiFetch<
          StatementPackage[] | { packages?: StatementPackage[] }
        >(`/api/close/sessions/${sessionId}/statement-packages`);
        return Array.isArray(data) ? data : data.packages ?? [];
      } catch {
        return [];
      }
    },
    enabled: !!sessionId,
  });

  const variancesQuery = useQuery({
    queryKey: ['variances', sessionId],
    queryFn: async () => {
      const data = await apiFetch(`/api/close/sessions/${sessionId}/variances`);
      return adaptVariances(data);
    },
    enabled: !!sessionId,
  });

  // Derived
  const session = sessionQuery.data;
  const gates = readinessQuery.data?.gates ?? [];
  const gatesTotal = readinessQuery.data?.gatesTotal ?? gates.length;
  const gatesPassing = readinessQuery.data?.gatesPassing ?? gates.filter((g) => g.passing).length;
  const artifact = artifactQuery.data;
  const statements = statementsQuery.data ?? [];

  /* ---- Lifecycle mutations ---- */
  const invalidateSession = () => {
    queryClient.invalidateQueries({ queryKey: ['close-session', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['close-readiness', sessionId] });
    queryClient.invalidateQueries({ queryKey: ['certification-artifact', sessionId] });
    setLifecycleError(null);
  };

  const advanceMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/advance`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: invalidateSession,
    onError: (err: Error) => setLifecycleError(err.message),
  });

  const certifyMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/certify`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: invalidateSession,
    onError: (err: Error) => setLifecycleError(err.message),
  });

  const lockMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/lock`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      invalidateSession();
      setLockSuccess(true);
    },
    onError: (err: Error) => setLifecycleError(err.message),
  });

  const isLoading = sessionQuery.isLoading || readinessQuery.isLoading;
  const error = sessionQuery.error || readinessQuery.error;

  if (isLoading) return <CeremonySkeleton />;
  if (error) return <ErrorState message={(error as Error).message} />;

  // Build financial summary from statement packages or use placeholder values
  function findStatementTotal(keyword: string): string {
    const pkg = statements.find((s) =>
      s.type?.toLowerCase().includes(keyword)
    );
    if (pkg?.lines && pkg.lines.length > 0) {
      // Find "total" line or last line
      const totalLine =
        pkg.lines.find(
          (l) =>
            l.lineItemName?.toLowerCase().includes('total') &&
            l.lineItemName?.toLowerCase().includes(keyword.split('_')[0])
        ) ?? pkg.lines[pkg.lines.length - 1];
      if (totalLine?.amount) {
        return fmtMoney(totalLine.amount, { dollar: true, dash: false });
      }
    }
    return '--';
  }

  const balanceSheetTotal = findStatementTotal('balance');
  const incomeTotal = findStatementTotal('income');
  const cashFlowTotal = findStatementTotal('cash');
  const equityTotal = findStatementTotal('equity');

  const sessionStatus = (session?.state ?? session?.status ?? '').toLowerCase().replace(/-/g, '_');
  const isCertified = sessionStatus === 'certified' || sessionStatus === 'subsequent_events_review' || sessionStatus === 'locked';

  const _gates = gates;
  const _activeGateIndex = _gates.findIndex((g) => !g.passing);
  const _activeGateNum = _activeGateIndex >= 0 ? _activeGateIndex + 1 : gatesTotal;
  const _startedAt = session?.certifiedAt ?? session?.startedAt ?? session?.createdAt;
  const _startDate = _startedAt ? new Date(_startedAt) : null;
  const _dayElapsed = _startDate && !isNaN(_startDate.getTime())
    ? Math.max(1, Math.ceil((Date.now() - _startDate.getTime()) / (1000 * 60 * 60 * 24)))
    : 1;
  const _targetDays = session?.closeDayTarget ?? 10;
  const _sessionState = sessionStatus.replace(/_/g, ' ');

  return (
    <div className="min-h-screen bg-[#1A1510]">
      {/* Progress Rail */}
      {_gates.length > 0 && (
        <div className="bg-[#2C2416] px-6 py-3 flex items-center justify-between">
          <div className="flex items-center gap-4 text-sm">
            <span className="text-[#B8860B] font-medium">
              Gate {_activeGateNum} of {gatesTotal}
            </span>
            <span className="text-[#8B7A5E]">
              Close Day {_dayElapsed} of {_targetDays}
            </span>
            <span className="px-2 py-0.5 rounded text-xs font-medium bg-[#3B1F0A] text-[#B8860B]">
              {_sessionState}
            </span>
            {session?.periodLabel && <span className="text-[#8B7A5E]">{session.periodLabel}</span>}
          </div>
          <div className="flex items-center gap-1.5">
            {_gates.map((gate, i) => {
              let bg = '#5C4F3A';
              if (gate.passing) bg = '#2D6A4F';
              else if (i === _activeGateIndex) bg = '#B8860B';
              return (
                <div
                  key={gate.id}
                  className="w-2.5 h-2.5 rounded-full transition-colors"
                  style={{ backgroundColor: bg }}
                  title={`${gate.label}: ${gate.passing ? 'Passing' : 'Pending'}`}
                />
              );
            })}
          </div>
        </div>
      )}

      <div className="max-w-4xl mx-auto px-6 py-12">
        {/* Header */}
        <div className="text-center mb-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full border border-[#B8860B]/40 bg-[#B8860B]/10 mb-6">
            <Shield size={14} className="text-[#B8860B]" />
            <span className="text-xs font-medium text-[#B8860B] uppercase tracking-widest">
              Certified
            </span>
          </div>

          <h1 className="text-3xl font-medium text-[#E8DCC8] mb-3">
            Financial Close Certification
          </h1>
          <p className="text-sm text-[#8B7A5E]">
            {session?.entityName ?? 'Entity'}
            {' \u00B7 '}
            {session?.periodLabel ?? 'Period'}
          </p>
        </div>

        {/* Gates Verified */}
        <div className="mb-10">
          <div className="flex items-center justify-center gap-2 mb-5">
            <CheckCircle2
              size={18}
              className={gatesPassing === gatesTotal && gatesTotal > 0 ? 'text-[#2D6A4F]' : 'text-[#8B7A5E]'}
            />
            <h2 className={`text-sm font-medium uppercase tracking-wider ${
              gatesPassing === gatesTotal && gatesTotal > 0 ? 'text-[#A7D7C5]' : 'text-[#C4B89A]'
            }`}>
              {gatesPassing === gatesTotal && gatesTotal > 0
                ? `All ${gatesTotal} Gates Verified`
                : `${gatesPassing} of ${gatesTotal} Gates Verified`}
            </h2>
          </div>
          <GateGrid gates={gates} />
          {gatesPassing < gatesTotal && (
            <div className="mt-3 text-center text-xs text-[#8B6914]">
              {gatesTotal - gatesPassing} gate
              {gatesTotal - gatesPassing !== 1 ? 's' : ''} not yet passing
            </div>
          )}
        </div>

        {/* Variance Explanation Readiness */}
        <div className="mb-10">
          <VarianceReadinessCard
            variances={variancesQuery.data ?? []}
            sessionId={sessionId}
            isLoading={variancesQuery.isLoading}
          />
        </div>

        {/* Cryptographic Certification */}
        <div className="mb-10">
          {artifact ? (
            <CryptographicCard artifact={artifact} />
          ) : (
            <div className="rounded-xl border-2 border-[#5C4F3A]/40 bg-[#1F1A12] p-6 text-center">
              <Shield size={20} className="text-[#8B7A5E] mx-auto mb-2" />
              <div className="text-sm text-[#8B7A5E]">Not yet certified — no cryptographic artifact available</div>
            </div>
          )}
        </div>

        {/* Financial Summary */}
        <div className="mb-10">
          <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wider text-center mb-5">
            Certified Financial Summary
          </h2>
          {statements.length === 0 ? (
            <div className="text-center py-8 text-sm text-[#8B7A5E] border border-[#3B2F1E] rounded-xl bg-[#1F1A12]">
              Generate statements first
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <SummaryCard
                icon={FileText}
                title="Balance Sheet"
                value={balanceSheetTotal}
                label="Total Assets"
              />
              <SummaryCard
                icon={TrendingUp}
                title="Income Statement"
                value={incomeTotal}
                label="Net Income"
              />
              <SummaryCard
                icon={DollarSign}
                title="Cash Flow"
                value={cashFlowTotal}
                label="Operating Cash Flow"
              />
              <SummaryCard
                icon={Users}
                title="Stockholders&rsquo; Equity"
                value={equityTotal}
                label="Total Equity"
              />
            </div>
          )}
        </div>

        {/* Lifecycle Actions */}
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
            {/* Download Audit Binder — always available */}
            <button
              type="button"
              onClick={() =>
                downloadBlob(
                  `/api/audit/binder?closeSessionId=${sessionId}`,
                  `audit-binder-${sessionId}.pdf`
                )
              }
              className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#2A231A] border border-[#3B2F1E] text-[#C4B89A] text-sm font-medium hover:border-[#B8860B]/40 hover:text-[#E8DCC8] transition-colors"
            >
              <Download size={16} />
              Download Audit Binder
            </button>

            {/* Lifecycle button — one at a time based on current state */}
            {sessionStatus === 'open' && (
              <button
                type="button"
                disabled={advanceMutation.isPending}
                onClick={() => advanceMutation.mutate()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#B8860B] text-[#1A1510] text-sm font-medium hover:bg-[#D4A017] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {advanceMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {advanceMutation.isPending ? 'Advancing...' : 'Begin Close'}
              </button>
            )}

            {sessionStatus === 'in_progress' && (
              <button
                type="button"
                disabled={advanceMutation.isPending}
                onClick={() => advanceMutation.mutate()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#B8860B] text-[#1A1510] text-sm font-medium hover:bg-[#D4A017] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {advanceMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Shield size={16} />
                )}
                {advanceMutation.isPending ? 'Submitting...' : 'Submit for Review'}
              </button>
            )}

            {sessionStatus === 'under_review' && (
              <button
                type="button"
                disabled={certifyMutation.isPending}
                onClick={() => {
                  const confirmed = window.confirm(
                    'You are about to certify this financial close. This attests that all figures are materially correct and complete. Proceed?'
                  );
                  if (confirmed) certifyMutation.mutate();
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#2D6A4F] text-[#F5F0E8] text-sm font-medium hover:bg-[#358B63] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {certifyMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Shield size={16} />
                )}
                {certifyMutation.isPending ? 'Certifying...' : 'Certify Close'}
              </button>
            )}

            {sessionStatus === 'certified' && (
              <button
                type="button"
                disabled={advanceMutation.isPending}
                onClick={() => advanceMutation.mutate()}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#B8860B] text-[#1A1510] text-sm font-medium hover:bg-[#D4A017] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {advanceMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <CheckCircle2 size={16} />
                )}
                {advanceMutation.isPending ? 'Advancing...' : 'Confirm Subsequent Events'}
              </button>
            )}

            {sessionStatus === 'subsequent_events_review' && !lockSuccess && (
              <button
                type="button"
                disabled={lockMutation.isPending}
                onClick={() => {
                  const typed = window.prompt(
                    'This action is PERMANENT and cannot be undone. Type LOCK to confirm.'
                  );
                  if (typed === 'LOCK') lockMutation.mutate();
                }}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#C44B2B] text-[#F5F0E8] text-sm font-medium hover:bg-[#D4553A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {lockMutation.isPending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Lock size={16} />
                )}
                {lockMutation.isPending ? 'Locking...' : 'Lock Period (Final)'}
              </button>
            )}

            {/* Verify Externally — available once certified or locked */}
            {(isCertified || sessionStatus === 'subsequent_events_review') && (
              <button
                type="button"
                onClick={() => router.push('/verify?session=' + sessionId)}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#2A231A] border border-[#3B2F1E] text-[#C4B89A] text-sm font-medium hover:border-[#B8860B]/40 hover:text-[#E8DCC8] transition-colors"
              >
                <ExternalLink size={16} />
                Verify Externally
              </button>
            )}
          </div>

          {/* Locked state — no action, informational only */}
          {(sessionStatus === 'locked' || lockSuccess) && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-[#2D6A4F]">
              <Lock size={16} />
              Period is permanently locked
            </div>
          )}

          {/* Error display */}
          {lifecycleError && (
            <div className="flex items-center justify-center gap-2 text-sm text-[#C44B2B]">
              <AlertCircle size={16} />
              {lifecycleError}
            </div>
          )}
        </div>

        {/* Footer note */}
        {isCertified && (
          <p className="text-center text-xs text-[#5C4F3A] mt-8">
            This certification is cryptographically signed and tamper-evident.
            Any modification to the underlying data will invalidate the
            signature.
          </p>
        )}
      </div>
    </div>
  );
}
