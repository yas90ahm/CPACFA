'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import Link from 'next/link';
import {
  Scale,
  GitCompare,
  FileEdit,
  FileText,
  TrendingUp,
  ShieldCheck,
  History,
  Download,
  FileArchive,
  Loader2,
  Paperclip,
} from 'lucide-react';
import { useCloseSession } from '@/lib/queries/close-session';
import { useTrialBalance } from '@/lib/queries/trial-balance';
import { useJournalEntries } from '@/lib/queries/adjustments';
import { useReconciliations } from '@/lib/queries/reconciliations';
import { useStatements } from '@/lib/queries/statements';
import { useVariances } from '@/lib/queries/variance';
import { useCertification } from '@/lib/queries/certification';
import { useAuth } from '@/lib/auth';
import { EmptyState } from '@/components/shared/EmptyState';
import { fmtMoney, sumMoneyStrings } from '@/lib/money';

/* ------------------------------------------------------------------ */
/*  Section definitions                                                */
/* ------------------------------------------------------------------ */
interface BinderSection {
  id: string;
  label: string;
  icon: React.ComponentType<{ className?: string; style?: React.CSSProperties }>;
  description: string;
  href: string; // relative path from session root
}

function getSections(sessionId: string): BinderSection[] {
  const base = `/close/${sessionId}`;
  return [
    {
      id: 'trial-balance',
      label: 'Trial Balance',
      icon: Scale,
      description:
        'Unadjusted and adjusted trial balances showing all account balances for the period. Includes opening balances, period activity, and adjustments.',
      href: `${base}/trial-balance`,
    },
    {
      id: 'reconciliations',
      label: 'Reconciliations',
      icon: GitCompare,
      description:
        'Account reconciliations with supporting documentation and evidence. Each balance sheet account is reconciled against source systems.',
      href: `${base}/reconciliation`,
    },
    {
      id: 'journal-entries',
      label: 'Journal Entries',
      icon: FileEdit,
      description:
        'All adjusting journal entries posted during the close, including recurring template entries and manual adjustments with approval history.',
      href: `${base}/adjustments`,
    },
    {
      id: 'financial-statements',
      label: 'Financial Statements',
      icon: FileText,
      description:
        'Generated financial statement package: Balance Sheet, Income Statement, Cash Flow Statement, and Statement of Stockholders\u2019 Equity.',
      href: `${base}/statements`,
    },
    {
      id: 'variance-analysis',
      label: 'Variance Analysis',
      icon: TrendingUp,
      description:
        'Period-over-period variance analysis with materiality thresholds. All material variances include documented explanations.',
      href: `${base}/variance`,
    },
    {
      id: 'certification',
      label: 'Certification',
      icon: ShieldCheck,
      description:
        'Cryptographic certification artifact with Ed25519 digital signature, snapshot hash, and validation results for the close session.',
      href: `${base}/review`,
    },
    {
      id: 'audit-trail',
      label: 'Audit Trail',
      icon: History,
      description:
        'Hash-chained, tamper-evident log of every action taken during the close. Includes state changes, approvals, and data modifications.',
      href: `${base}/audit-trail`,
    },
  ];
}

/* ------------------------------------------------------------------ */
/*  AuditBinderSection helper component                                */
/* ------------------------------------------------------------------ */
function AuditBinderSection({ title, icon, children, href }: {
  title: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  href: string;
}) {
  return (
    <div className="p-4 rounded-lg mb-3" style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}>
      <div className="flex items-center gap-2 mb-3">
        {icon}
        <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>{title}</h3>
      </div>
      <div className="grid grid-cols-3 gap-4 text-sm mb-3">
        {children}
      </div>
      <Link href={href} className="text-sm" style={{ color: 'var(--interactive-primary)' }}>
        View full details &rarr;
      </Link>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Metric display helpers                                             */
/* ------------------------------------------------------------------ */
function MetricItem({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs" style={{ color: 'var(--text-tertiary)' }}>{label}</div>
      <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{value}</div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Sidebar section button                                             */
/* ------------------------------------------------------------------ */
interface SidebarItemProps {
  section: BinderSection;
  active: boolean;
  onClick: () => void;
}

function SidebarItem({ section, active, onClick }: SidebarItemProps) {
  const Icon = section.icon;
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 py-2.5 text-left text-sm font-medium transition-colors"
      style={{
        color: active ? 'var(--interactive-primary)' : 'var(--text-secondary)',
        borderLeft: active ? '3px solid var(--interactive-primary)' : '3px solid transparent',
        background: active ? 'var(--bg-surface-sunken)' : 'transparent',
      }}
      aria-current={active ? 'true' : undefined}
    >
      <Icon
        className="w-4 h-4 flex-shrink-0"
        style={{ color: active ? 'var(--interactive-primary)' : 'var(--text-tertiary)' }}
      />
      {section.label}
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Section content card with inline summaries                         */
/* ------------------------------------------------------------------ */
interface SectionContentProps {
  section: BinderSection;
  sessionId: string;
}

function SectionContent({ section, sessionId }: SectionContentProps) {
  const Icon = section.icon;

  // Fetch summary data
  const { data: tbData } = useTrialBalance(sessionId, false);
  const { data: journalEntries = [] } = useJournalEntries(sessionId);
  const { data: reconciliations = [] } = useReconciliations(sessionId);
  const { data: statementsData } = useStatements(sessionId);
  const { data: variances = [] } = useVariances(sessionId);
  const { data: certification } = useCertification(sessionId);

  // Compute metrics per section
  const renderSummary = () => {
    switch (section.id) {
      case 'trial-balance': {
        const accountCount = tbData?.rows?.length ?? 0;
        const totalDebits = tbData?.totalDebits ?? '0.00';
        const totalCredits = tbData?.totalCredits ?? '0.00';
        const diff = Math.abs(parseFloat(totalDebits) - parseFloat(totalCredits));
        const balanced = diff < 0.02;
        return (
          <AuditBinderSection title={section.label} icon={<Icon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />} href={section.href}>
            <MetricItem label="Account Count" value={accountCount} />
            <MetricItem label="Total Debits" value={fmtMoney(totalDebits, { dollar: true })} />
            <MetricItem label="Balance Status" value={
              <span style={{ color: balanced ? 'var(--status-success)' : 'var(--status-error)' }}>
                {balanced ? 'In Balance' : 'Out of Balance'}
              </span>
            } />
          </AuditBinderSection>
        );
      }
      case 'journal-entries': {
        const posted = journalEntries.filter(e => e.status === 'posted');
        const postedCount = posted.length;
        const totalAmount = sumMoneyStrings(posted.flatMap(e => (e.lines ?? []).map(l => l.debit)));
        const allApproved = journalEntries.length > 0 && journalEntries.every(e => e.status === 'posted' || e.status === 'approved');
        return (
          <AuditBinderSection title={section.label} icon={<Icon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />} href={section.href}>
            <MetricItem label="Posted Count" value={postedCount} />
            <MetricItem label="Total Adjustments" value={fmtMoney(totalAmount, { dollar: true })} />
            <MetricItem label="Approval Status" value={
              <span style={{ color: allApproved ? 'var(--status-success)' : 'var(--status-warning)' }}>
                {allApproved ? 'All Approved' : 'Pending'}
              </span>
            } />
          </AuditBinderSection>
        );
      }
      case 'reconciliations': {
        const complete = reconciliations.filter(r => r.status === 'completed' || r.status === 'approved').length;
        const total = reconciliations.length;
        const evidenceFiles = reconciliations.reduce((sum, r) => sum + (r.evidenceCount ?? 0), 0);
        return (
          <AuditBinderSection title={section.label} icon={<Icon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />} href={section.href}>
            <MetricItem label="Completion" value={`${complete}/${total} complete`} />
            <MetricItem label="Progress" value={`${total ? Math.round((complete / total) * 100) : 0}%`} />
            <MetricItem label="Evidence Files" value={
              <span className="inline-flex items-center gap-1">
                <Paperclip className="w-3.5 h-3.5" />
                {evidenceFiles} attached
              </span>
            } />
          </AuditBinderSection>
        );
      }
      case 'financial-statements': {
        const hasIS = (statementsData?.incomeStatement?.lines?.length ?? 0) > 0;
        const hasBS = (statementsData?.balanceSheet?.lines?.length ?? 0) > 0;
        const hasCF = (statementsData?.cashFlow?.lines?.length ?? 0) > 0;
        const hasEQ = (statementsData?.equityStatement?.lines?.length ?? 0) > 0;
        const stmtCount = [hasIS, hasBS, hasCF, hasEQ].filter(Boolean).length;
        const hasStatements = stmtCount > 0;
        return (
          <AuditBinderSection title={section.label} icon={<Icon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />} href={section.href}>
            <MetricItem label="Statements" value={hasStatements ? `${stmtCount} generated` : 'Not generated'} />
            <MetricItem label="Status" value={
              <span style={{ color: hasStatements ? 'var(--status-success)' : 'var(--text-tertiary)' }}>
                {hasStatements ? 'Generated' : 'Pending'}
              </span>
            } />
            <MetricItem label="Package" value={hasStatements ? 'Complete' : 'N/A'} />
          </AuditBinderSection>
        );
      }
      case 'variance-analysis': {
        const material = variances.filter(v => v.isMaterial);
        const explained = material.filter(v => v.explanationStatus === 'explained' || v.explanationStatus === 'approved').length;
        const materialCount = material.length;
        return (
          <AuditBinderSection title={section.label} icon={<Icon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />} href={section.href}>
            <MetricItem label="Explained" value={`${explained}/${materialCount}`} />
            <MetricItem label="Material Count" value={materialCount} />
            <MetricItem label="Status" value={
              <span style={{ color: explained === materialCount && materialCount > 0 ? 'var(--status-success)' : materialCount > 0 ? 'var(--status-warning)' : 'var(--text-tertiary)' }}>
                {materialCount === 0 ? 'No variances' : explained === materialCount ? 'All explained' : `${materialCount - explained} pending`}
              </span>
            } />
          </AuditBinderSection>
        );
      }
      case 'certification': {
        const certifiedBy = certification?.certifiedBy ?? null;
        const certifiedAt = certification?.certifiedAt ? new Date(certification.certifiedAt).toLocaleDateString() : null;
        const sigHash = certification?.signature ?? null;
        return (
          <AuditBinderSection title={section.label} icon={<Icon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />} href={section.href}>
            <MetricItem label="Certified By" value={certifiedBy ?? 'Not certified'} />
            <MetricItem label="Date" value={certifiedAt ?? 'N/A'} />
            <MetricItem label="Signature" value={
              sigHash ? <span className="font-mono text-xs">{sigHash.slice(0, 16)}...</span> : 'N/A'
            } />
          </AuditBinderSection>
        );
      }
      case 'audit-trail': {
        const totalEvidence = reconciliations.reduce((sum, r) => sum + (r.evidenceCount ?? 0), 0) +
          journalEntries.reduce((sum, e) => sum + (e.evidenceCount ?? 0), 0);
        return (
          <AuditBinderSection title={section.label} icon={<Icon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />} href={section.href}>
            <MetricItem label="Total Attachments" value={totalEvidence} />
            <MetricItem label="Journal Entries" value={journalEntries.length} />
            <MetricItem label="Reconciliations" value={reconciliations.length} />
          </AuditBinderSection>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div>
      {renderSummary()}
      <div
        className="rounded-lg p-6 mt-3"
        style={{
          background: 'var(--bg-surface)',
          border: '1px solid var(--border-default)',
        }}
      >
        <div className="flex items-start gap-4">
          <div
            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
            style={{ background: 'var(--bg-surface-sunken)' }}
          >
            <Icon className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-base font-semibold" style={{ color: 'var(--text-primary)' }}>
              {section.label}
            </h3>
            <p className="text-sm mt-1 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
              {section.description}
            </p>
            <Link
              href={section.href}
              className="inline-flex items-center gap-1 text-sm font-medium mt-3"
              style={{ color: 'var(--interactive-primary)' }}
            >
              View full page &rarr;
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Loading skeleton                                                   */
/* ------------------------------------------------------------------ */
function AuditBinderSkeleton() {
  return (
    <div className="flex gap-0 h-[calc(100vh-160px)]">
      {/* Sidebar skeleton */}
      <div
        className="w-[280px] flex-shrink-0 p-4 space-y-2 animate-pulse"
        style={{ background: 'var(--bg-surface)', borderRight: '1px solid var(--border-default)' }}
      >
        {[1, 2, 3, 4, 5, 6, 7].map((i) => (
          <div key={i} className="h-10 rounded" style={{ background: 'var(--bg-surface-sunken)' }} />
        ))}
      </div>
      {/* Content skeleton */}
      <div className="flex-1 p-6 animate-pulse">
        <div className="h-6 rounded w-1/3 mb-4" style={{ background: 'var(--bg-surface-sunken)' }} />
        <div className="h-32 rounded" style={{ background: 'var(--bg-surface-sunken)' }} />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main page                                                          */
/* ------------------------------------------------------------------ */
export default function AuditBinderPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const { user, getAuthToken } = useAuth();
  const { data: session, isLoading } = useCloseSession(sessionId);

  const sections = getSections(sessionId);
  const [activeSectionId, setActiveSectionId] = useState(sections[0].id);
  const activeSection = sections.find((s) => s.id === activeSectionId) ?? sections[0];

  // FIX 5B: Export state
  const [exporting, setExporting] = useState<'zip' | 'pdf' | null>(null);

  async function handleExport(format: 'zip' | 'pdf') {
    setExporting(format);
    try {
      const token = getAuthToken();
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}/api/close/sessions/${sessionId}/audit-binder/export/${format}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.status === 501) {
        alert('Export feature coming soon');
        return;
      }
      if (!res.ok) throw new Error('Export failed');
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `audit-binder-${sessionId}.${format}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export failed:', err);
    } finally {
      setExporting(null);
    }
  }

  if (isLoading) {
    return <AuditBinderSkeleton />;
  }

  if (!session) {
    return (
      <div className="p-6">
        <EmptyState
          icon={FileArchive}
          title="No Close Session Found"
          description="This close session could not be loaded. Return to the dashboard to select an active session."
          ctaLabel="Go to Dashboard"
          ctaHref="/close"
        />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Page header */}
      <div>
        <h1 className="text-xl font-semibold" style={{ color: 'var(--text-primary)' }}>
          Audit Binder
        </h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>
          {session?.periodLabel ?? 'Period'} &mdash; Aggregated close artifacts for audit review
        </p>
      </div>

      {/* Two-panel layout */}
      <div
        className="flex rounded-lg overflow-hidden"
        style={{ border: '1px solid var(--border-default)', minHeight: 'calc(100vh - 260px)' }}
      >
        {/* Sidebar */}
        <div
          className="w-[280px] flex-shrink-0 flex flex-col"
          style={{
            background: 'var(--bg-surface)',
            borderRight: '1px solid var(--border-default)',
          }}
        >
          {/* Section title */}
          <div className="px-4 py-3" style={{ borderBottom: '1px solid var(--border-subtle)' }}>
            <h2 className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--text-tertiary)' }}>
              Table of Contents
            </h2>
          </div>

          {/* Section links */}
          <nav className="flex-1 py-1" role="navigation" aria-label="Audit binder sections">
            {sections.map((section) => (
              <SidebarItem
                key={section.id}
                section={section}
                active={section.id === activeSectionId}
                onClick={() => setActiveSectionId(section.id)}
              />
            ))}
          </nav>

          {/* Export buttons */}
          <div
            className="p-4 space-y-2"
            style={{ borderTop: '1px solid var(--border-subtle)' }}
          >
            <button
              type="button"
              onClick={() => handleExport('zip')}
              disabled={exporting !== null}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-opacity disabled:opacity-50"
              style={{
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                background: 'transparent',
              }}
            >
              {exporting === 'zip' ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileArchive className="w-4 h-4" />}
              {exporting === 'zip' ? 'Exporting...' : 'Export ZIP'}
            </button>
            <button
              type="button"
              onClick={() => handleExport('pdf')}
              disabled={exporting !== null}
              className="w-full inline-flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium rounded-md transition-opacity disabled:opacity-50"
              style={{
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                background: 'transparent',
              }}
            >
              {exporting === 'pdf' ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
              {exporting === 'pdf' ? 'Exporting...' : 'Export PDF'}
            </button>
          </div>
        </div>

        {/* Main content area */}
        <div className="flex-1 p-6" style={{ background: 'var(--bg-base)' }}>
          <SectionContent section={activeSection} sessionId={sessionId} />
        </div>
      </div>
    </div>
  );
}
