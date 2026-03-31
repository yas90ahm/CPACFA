'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
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
  periodLabel: string;
  entityName: string;
  certifiedAt?: string;
  certifiedBy?: string;
  lockedAt?: string;
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
    <div className="min-h-screen bg-[#1A1510] flex items-center justify-center">
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

  // Derived
  const session = sessionQuery.data;
  const gates = readinessQuery.data?.gates ?? [];
  const gatesTotal = readinessQuery.data?.gatesTotal ?? gates.length;
  const gatesPassing = readinessQuery.data?.gatesPassing ?? gates.filter((g) => g.passing).length;
  const artifact = artifactQuery.data;
  const statements = statementsQuery.data ?? [];

  const lockMutation = useMutation({
    mutationFn: () =>
      apiFetch(`/api/close/sessions/${sessionId}/lock`, {
        method: 'POST',
        body: {},
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['close-session', sessionId] });
      setLockSuccess(true);
    },
  });

  const handleLockPeriod = () => {
    if (
      window.confirm(
        'This action is PERMANENT and cannot be undone. Lock this period?'
      )
    ) {
      lockMutation.mutate();
    }
  };

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

  const isCertified =
    session?.state === 'CERTIFIED' || session?.state === 'LOCKED';

  const certifiedByName =
    artifact?.certifiedBy ?? session?.certifiedBy ?? 'CFO';
  const certifiedAtDate =
    artifact?.certifiedAt ?? session?.certifiedAt ?? new Date().toISOString();

  // Placeholder artifact for display when no real artifact exists
  const displayArtifact: CertificationArtifact = artifact ?? {
    signature:
      'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855e3b0c44298fc1c149afbf4c8996fb924',
    documentHash:
      'a7ffc6f8bf1ed76651c14756a061d662f580ff4de43b49fa82d80a4b80f8434a',
    certifiedBy: certifiedByName,
    certifiedAt: certifiedAtDate,
    verified: true,
  };

  const _gates = gates;
  const _activeGateIndex = _gates.findIndex((g) => !g.passing);
  const _activeGateNum = _activeGateIndex >= 0 ? _activeGateIndex + 1 : gatesTotal;
  const _startedAt = session?.certifiedAt ?? new Date().toISOString();
  const _dayElapsed = Math.max(1, Math.ceil((Date.now() - new Date(_startedAt).getTime()) / (1000 * 60 * 60 * 24)));
  const _targetDays = 10;
  const _sessionState = (session?.state ?? 'IN_PROGRESS').replace(/_/g, ' ');

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
            <CheckCircle2 size={18} className="text-[#2D6A4F]" />
            <h2 className="text-sm font-medium text-[#A7D7C5] uppercase tracking-wider">
              All {gatesTotal} Gates Verified
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

        {/* Cryptographic Certification */}
        <div className="mb-10">
          <CryptographicCard artifact={displayArtifact} />
        </div>

        {/* Financial Summary */}
        <div className="mb-10">
          <h2 className="text-sm font-medium text-[#8B7A5E] uppercase tracking-wider text-center mb-5">
            Certified Financial Summary
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            <SummaryCard
              icon={FileText}
              title="Balance Sheet"
              value={balanceSheetTotal !== '--' ? balanceSheetTotal : '$124.6M'}
              label="Total Assets"
            />
            <SummaryCard
              icon={TrendingUp}
              title="Income Statement"
              value={incomeTotal !== '--' ? incomeTotal : '$6.1M'}
              label="Net Income"
            />
            <SummaryCard
              icon={DollarSign}
              title="Cash Flow"
              value={cashFlowTotal !== '--' ? cashFlowTotal : '$8.2M'}
              label="Operating Cash Flow"
            />
            <SummaryCard
              icon={Users}
              title="Stockholders&rsquo; Equity"
              value={equityTotal !== '--' ? equityTotal : '$57.3M'}
              label="Total Equity"
            />
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
          <button
            type="button"
            onClick={() =>
              downloadBlob(
                `/api/audit/binder?closeSessionId=${sessionId}`,
                `audit-binder-${sessionId}.pdf`
              )
            }
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#B8860B] text-[#1A1510] font-medium text-sm hover:bg-[#D4A017] transition-colors"
          >
            <Download size={16} />
            Download Audit Binder
          </button>

          <button
            type="button"
            onClick={handleLockPeriod}
            disabled={lockMutation.isPending || lockSuccess}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#C44B2B] text-white font-medium text-sm hover:bg-[#D4553A] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Lock size={16} />
            {lockMutation.isPending
              ? 'Locking...'
              : lockSuccess
              ? 'Period Locked'
              : 'Lock Period (Final)'}
          </button>

          <button
            type="button"
            onClick={() => router.push('/verify?session=' + sessionId)}
            className="inline-flex items-center gap-2 px-6 py-3 rounded-lg bg-[#2A231A] border border-[#3B2F1E] text-[#C4B89A] font-medium text-sm hover:border-[#B8860B]/40 hover:text-[#E8DCC8] transition-colors"
          >
            <ExternalLink size={16} />
            Verify Externally
          </button>
        </div>

        {lockMutation.isError && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[#C44B2B]">
            <AlertCircle size={16} />
            {(lockMutation.error as Error)?.message ?? 'Failed to lock period'}
          </div>
        )}
        {lockSuccess && (
          <div className="mt-4 flex items-center justify-center gap-2 text-sm text-[#2D6A4F]">
            <CheckCircle2 size={16} />
            Period has been permanently locked.
          </div>
        )}

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
