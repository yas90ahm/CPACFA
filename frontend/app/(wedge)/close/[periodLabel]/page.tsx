'use client';

import * as React from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  getChecklist,
  listAdjustments,
  getPeriodLock,
  lockPeriod,
  createAdjustment,
  getCloseStatus,
  getCloseExceptions,
  getCloseReadiness,
  getCloseCoach,
  getUnadjustedTrialBalance,
  getAdjustedTrialBalance,
  getPeriodStatements,
  getClosingEntries,
  addClosingEntryAsAdjustment,
  getJESuggestionsFromText,
  explainJESuggestions,
  getAccrualSuggestionsAgentic,
  addAccrualsAsAdjustments,
  listPeriods,
  setCloseDueDate as setCloseDueDateApi,
  checklistSignOff,
  updateAdjustmentStatus,
  updateChecklistStep,
  type CloseStage,
  type CloseAdjustmentRow,
} from '@/lib/apiAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { getPeriodEndDate, getPeriodType } from '@/lib/utils';

function stageBannerLabel(stage: CloseStage): string {
  switch (stage) {
    case 'no_tb':
      return 'No TB';
    case 'unadjusted_in':
      return 'Unadjusted in';
    case 'adjustments':
      return 'Adjustments';
    case 'ready_to_close':
      return 'Ready to close';
    case 'closed':
      return 'Closed';
    default:
      return stage;
  }
}

function nextStepLabel(stage: CloseStage): string {
  switch (stage) {
    case 'no_tb':
      return 'Add unadjusted TB (sync or upload from Overview).';
    case 'unadjusted_in':
      return 'Add adjustments or review statements.';
    case 'adjustments':
      return 'Review statements and complete checklist.';
    case 'ready_to_close':
      return 'Lock period.';
    case 'closed':
      return 'Period closed.';
    default:
      return '';
  }
}

function formatAmount(n: number): string {
  return new Intl.NumberFormat(undefined, { minimumFractionDigits: 0, maximumFractionDigits: 2 }).format(n);
}

function agenticErrorMessage(err: unknown): string {
  const msg = err instanceof Error ? err.message : String(err);
  const lower = msg.toLowerCase();
  if (lower.includes('api key') || lower.includes('anthropic') || lower.includes('unauthorized') || lower.includes('401')) {
    return 'AI features require ANTHROPIC_API_KEY. Set it in your environment to use suggestions and narratives.';
  }
  if (lower.includes('timeout') || lower.includes('timed out')) {
    return 'Request timed out. Try again or use a shorter input.';
  }
  return msg || 'Request failed. Try again later.';
}

export default function CloseWorkspacePage() {
  const params = useParams();
  const { user } = useAuth();
  const periodLabel = typeof params.periodLabel === 'string' ? params.periodLabel : '';

  const [lock, setLock] = React.useState<{ periodLabel: string; lockedAt: string; lockedBy: string } | undefined>(undefined);
  const [checklist, setChecklist] = React.useState<{ id: string; name: string; status?: string }[]>([]);
  const [adjustments, setAdjustments] = React.useState<CloseAdjustmentRow[]>([]);
  const [expandedAdjustmentId, setExpandedAdjustmentId] = React.useState<string | null>(null);
  const [closeStatus, setCloseStatus] = React.useState<{ closeStage?: CloseStage; tbSource?: 'uploaded' | 'synced' | null; tbAt?: string } | null>(null);
  const [unadjustedTB, setUnadjustedTB] = React.useState<{ entries: { accountName: string; debit: number; credit: number }[]; source: string; at?: string; by?: string; constituentPeriods?: string[] } | null>(null);
  const [adjustedTB, setAdjustedTB] = React.useState<{ entries: { accountName: string; debit: number; credit: number }[] } | null>(null);
  const [statements, setStatements] = React.useState<{ balanceSheet?: { assets?: { label: string; amount: number }[]; totalAssets?: number }; profitAndLoss?: { revenue?: { label: string; amount: number }[]; totalRevenue?: number; netIncome?: number } } | null>(null);
  const [closingEntry, setClosingEntry] = React.useState<{ description: string; debits: { account: string; amount: number }[]; credits: { account: string; amount: number }[] } | null>(null);
  const [lockLoading, setLockLoading] = React.useState(false);
  const [closingEntryAdding, setClosingEntryAdding] = React.useState(false);
  const [loading, setLoading] = React.useState(true);
  const [activeTab, setActiveTab] = React.useState('checklist');
  const [closeDueDate, setCloseDueDate] = React.useState<string | null>(null);
  const [dueDateEdit, setDueDateEdit] = React.useState('');
  const [dueDateSaving, setDueDateSaving] = React.useState(false);
  const [signingOffStepId, setSigningOffStepId] = React.useState<string | null>(null);
  const [exceptionsNarrative, setExceptionsNarrative] = React.useState<string | null>(null);
  const [nextActions, setNextActions] = React.useState<{ label: string; reason: string }[]>([]);
  const [readinessNarrative, setReadinessNarrative] = React.useState<string | null>(null);
  const [coachResult, setCoachResult] = React.useState<{ nextAction: string; reason: string } | null>(null);
  const [jeTextInput, setJeTextInput] = React.useState('');
  const [jeSuggestions, setJeSuggestions] = React.useState<{ description?: string; debits?: { account?: string; amount?: number }[]; credits?: { account?: string; amount?: number }[] }[]>([]);
  const [jeTextLoading, setJeTextLoading] = React.useState(false);
  const [jeTextError, setJeTextError] = React.useState<string | null>(null);
  const [accrualSuggestions, setAccrualSuggestions] = React.useState<{ description?: string; debitAccount?: string; creditAccount?: string; amount?: number }[]>([]);
  const [accrualLoading, setAccrualLoading] = React.useState(false);
  const [accrualError, setAccrualError] = React.useState<string | null>(null);
  const [explainNarrative, setExplainNarrative] = React.useState<string | null>(null);
  const [explainLoading, setExplainLoading] = React.useState(false);
  const [explainError, setExplainError] = React.useState<string | null>(null);
  const [adjustmentFilter, setAdjustmentFilter] = React.useState<'pending' | 'all'>('pending');
  const [updatingAdjustmentId, setUpdatingAdjustmentId] = React.useState<string | null>(null);
  const [adjustmentError, setAdjustmentError] = React.useState<string | null>(null);
  const [approvalErrorByAdjustmentId, setApprovalErrorByAdjustmentId] = React.useState<Record<string, { message: string; approvalRequestId?: string }>>({});
  const [submittingForApprovalId, setSubmittingForApprovalId] = React.useState<string | null>(null);
  const [lockConfirmOpen, setLockConfirmOpen] = React.useState(false);
  const [stepDueEdit, setStepDueEdit] = React.useState<{ stepId: string; value: string } | null>(null);
  const [stepDueSaving, setStepDueSaving] = React.useState(false);
  const [showManualForm, setShowManualForm] = React.useState(false);
  const [manualDescription, setManualDescription] = React.useState('');
  const [manualDebits, setManualDebits] = React.useState<{ account: string; amount: string }[]>([{ account: '', amount: '' }]);
  const [manualCredits, setManualCredits] = React.useState<{ account: string; amount: string }[]>([{ account: '', amount: '' }]);
  const [manualFormError, setManualFormError] = React.useState<string | null>(null);
  const [manualSubmitting, setManualSubmitting] = React.useState(false);

  const isClosed = !!lock;
  const postedAdjustmentsCount = adjustments.filter((a) => a.status === 'posted').length;

  const filteredAdjustments = React.useMemo(() => {
    if (adjustmentFilter === 'all') return adjustments;
    return adjustments.filter((a) => a.status !== 'posted' && a.status !== 'rejected');
  }, [adjustments, adjustmentFilter]);

  const adjustmentCounts = React.useMemo(() => {
    const pending = adjustments.filter((a) => a.status !== 'posted' && a.status !== 'rejected').length;
    const posted = adjustments.filter((a) => a.status === 'posted').length;
    const rejected = adjustments.filter((a) => a.status === 'rejected').length;
    return { pending, posted, rejected };
  }, [adjustments]);

  const handleUpdateAdjustmentStatus = async (adjustmentId: string, status: 'rejected' | 'approved' | 'posted') => {
    if (isClosed && status !== 'rejected') return;
    setAdjustmentError(null);
    setApprovalErrorByAdjustmentId((prev) => {
      const next = { ...prev };
      delete next[adjustmentId];
      return next;
    });
    setUpdatingAdjustmentId(adjustmentId);
    try {
      const approvedBy = user?.email ?? user?.id ?? 'user';
      const result = await updateAdjustmentStatusWithResult(adjustmentId, status, approvedBy);
      if (result.success) {
        const list = await listAdjustments(periodLabel);
        setAdjustments(list);
      } else if (result.needsApproval) {
        setApprovalErrorByAdjustmentId((prev) => ({
          ...prev,
          [adjustmentId]: { message: result.message, approvalRequestId: result.approvalRequestId },
        }));
      } else {
        setAdjustmentError(result.error);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdjustmentError(msg);
    } finally {
      setUpdatingAdjustmentId(null);
    }
  };

  const handleSubmitForApproval = async (adjustmentId: string) => {
    setSubmittingForApprovalId(adjustmentId);
    setAdjustmentError(null);
    try {
      const { approvalRequestId } = await submitApproval('close_adjustment', adjustmentId);
      setApprovalErrorByAdjustmentId((prev) => ({
        ...prev,
        [adjustmentId]: { message: 'Submitted for approval.', approvalRequestId },
      }));
      setTimeout(() => {
        setApprovalErrorByAdjustmentId((prev) => {
          const next = { ...prev };
          delete next[adjustmentId];
          return next;
        });
      }, 5000);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setAdjustmentError(msg);
    } finally {
      setSubmittingForApprovalId(null);
    }
  };

  React.useEffect(() => {
    if (!periodLabel) return;
    let cancelled = false;
    async function load() {
      try {
        const [lockRes, checklistRes, adjRes, statusRes, unadjRes, adjTbRes, stmtRes, closingRes, exceptionsRes, readinessRes, periodsRes, coachRes] = await Promise.all([
          getPeriodLock(periodLabel),
          getChecklist(periodLabel),
          listAdjustments(periodLabel),
          getCloseStatus(periodLabel),
          getUnadjustedTrialBalance(periodLabel),
          getAdjustedTrialBalance(periodLabel),
          getPeriodStatements(periodLabel),
          getClosingEntries(periodLabel),
          getCloseExceptions(periodLabel, true).catch(() => ({ narrative: undefined, nextActions: [] })),
          getCloseReadiness(periodLabel, true).catch(() => ({ narrative: undefined })),
          listPeriods([periodLabel]),
          getCloseCoach(periodLabel).catch(() => null),
        ]);
        if (cancelled) return;
        setLock(lockRes ?? undefined);
        setChecklist(Array.isArray(checklistRes?.steps) ? checklistRes.steps : []);
        setAdjustments(adjRes ?? []);
        setCloseStatus(statusRes ? { closeStage: statusRes.closeStage, tbSource: statusRes.tbSource, tbAt: statusRes.tbAt } : null);
        setUnadjustedTB(unadjRes ? { entries: unadjRes.entries, source: unadjRes.source, at: unadjRes.at, by: unadjRes.by, constituentPeriods: unadjRes.constituentPeriods } : null);
        setAdjustedTB(adjTbRes ?? null);
        setStatements(stmtRes ?? null);
        setClosingEntry(closingRes ? { description: closingRes.description, debits: closingRes.debits ?? [], credits: closingRes.credits ?? [] } : null);
        setExceptionsNarrative(exceptionsRes?.narrative ?? null);
        setNextActions(Array.isArray(exceptionsRes?.nextActions) ? exceptionsRes.nextActions : []);
        setReadinessNarrative(readinessRes?.narrative ?? null);
        const periodEntry = Array.isArray(periodsRes) && periodsRes.length > 0 ? periodsRes[0] : null;
        setCloseDueDate(periodEntry?.closeDueDate ?? null);
        setDueDateEdit(periodEntry?.closeDueDate ?? '');
      } catch {
        if (!cancelled) {
          setChecklist([{ id: '1', name: 'Reconcile bank', status: 'pending' }, { id: '2', name: 'Review accruals', status: 'pending' }]);
          setAdjustments([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [periodLabel]);

  const handleClosePeriod = async () => {
    if (!periodLabel || isClosed) return;
    setLockLoading(true);
    try {
      const lockedBy = user?.email ?? user?.id ?? 'user';
      const l = await lockPeriod(periodLabel, lockedBy, 'Closed from FinOS');
      setLock(l);
    } catch {
      // ignore
    } finally {
      setLockLoading(false);
    }
  };

  const resetManualForm = () => {
    setManualDescription('');
    setManualDebits([{ account: '', amount: '' }]);
    setManualCredits([{ account: '', amount: '' }]);
    setManualFormError(null);
    setShowManualForm(false);
  };

  const handleAddAdjustment = () => {
    if (isClosed) return;
    setManualFormError(null);
    setShowManualForm((v) => !v);
    if (!showManualForm) {
      setManualDescription('');
      setManualDebits([{ account: '', amount: '' }]);
      setManualCredits([{ account: '', amount: '' }]);
    }
  };

  const handleCreateManualAdjustment = async () => {
    if (!periodLabel || isClosed) return;
    setManualFormError(null);
    const desc = manualDescription.trim();
    if (!desc) {
      setManualFormError('Description is required.');
      return;
    }
    const debitLines = manualDebits
      .map((l) => ({ account: l.account.trim(), amount: parseFloat(l.amount) || 0 }))
      .filter((l) => l.amount > 0);
    const creditLines = manualCredits
      .map((l) => ({ account: l.account.trim(), amount: parseFloat(l.amount) || 0 }))
      .filter((l) => l.amount > 0);
    if (debitLines.length === 0 || creditLines.length === 0) {
      setManualFormError('Add at least one debit and one credit line with amount > 0.');
      return;
    }
    const totalDebits = debitLines.reduce((s, l) => s + l.amount, 0);
    const totalCredits = creditLines.reduce((s, l) => s + l.amount, 0);
    if (Math.abs(totalDebits - totalCredits) > 0.01) {
      setManualFormError('Total debits must equal total credits.');
      return;
    }
    setManualSubmitting(true);
    try {
      const suggestion = {
        id: crypto.randomUUID(),
        date: getPeriodEndDate(periodLabel),
        description: desc,
        debits: debitLines,
        credits: creditLines,
        source: 'manual' as const,
      };
      await createAdjustment(periodLabel, { suggestions: [suggestion] });
      const list = await listAdjustments(periodLabel);
      setAdjustments(list);
      resetManualForm();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setManualFormError(msg || 'Failed to create adjustment.');
    } finally {
      setManualSubmitting(false);
    }
  };

  const addManualDebitLine = () => setManualDebits((prev) => [...prev, { account: '', amount: '' }]);
  const addManualCreditLine = () => setManualCredits((prev) => [...prev, { account: '', amount: '' }]);
  const updateManualDebit = (index: number, field: 'account' | 'amount', value: string) => {
    setManualDebits((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };
  const updateManualCredit = (index: number, field: 'account' | 'amount', value: string) => {
    setManualCredits((prev) => prev.map((l, i) => (i === index ? { ...l, [field]: value } : l)));
  };
  const removeManualDebit = (index: number) => {
    setManualDebits((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };
  const removeManualCredit = (index: number) => {
    setManualCredits((prev) => (prev.length <= 1 ? prev : prev.filter((_, i) => i !== index)));
  };

  const handleAddClosingEntryAsAdjustment = async () => {
    if (!periodLabel || isClosed) return;
    setClosingEntryAdding(true);
    try {
      await addClosingEntryAsAdjustment(periodLabel);
      const list = await listAdjustments(periodLabel);
      setAdjustments(list);
    } catch {
      // ignore
    } finally {
      setClosingEntryAdding(false);
    }
  };

  const handleSuggestFromText = async () => {
    if (!jeTextInput.trim() || isClosed) return;
    setJeTextError(null);
    setJeTextLoading(true);
    try {
      const periodEnd = getPeriodEndDate(periodLabel);
      const res = await getJESuggestionsFromText(jeTextInput.trim(), periodEnd);
      setJeSuggestions(Array.isArray(res.suggestions) ? res.suggestions : []);
    } catch (err) {
      setJeSuggestions([]);
      setJeTextError(agenticErrorMessage(err));
    } finally {
      setJeTextLoading(false);
    }
  };

  const handleAddJeSuggestionsToQueue = async () => {
    if (!periodLabel || jeSuggestions.length === 0 || isClosed) return;
    try {
      await createAdjustment(periodLabel, { suggestions: jeSuggestions });
      const list = await listAdjustments(periodLabel);
      setAdjustments(list);
      setJeSuggestions([]);
      setJeTextInput('');
    } catch {
      // ignore
    }
  };

  const handleSuggestAccruals = async () => {
    if (isClosed) return;
    setAccrualError(null);
    setAccrualLoading(true);
    try {
      const periodEnd = getPeriodEndDate(periodLabel);
      const res = await getAccrualSuggestionsAgentic({ periodEnd });
      setAccrualSuggestions(Array.isArray(res.suggestions) ? res.suggestions : []);
    } catch (err) {
      setAccrualSuggestions([]);
      setAccrualError(agenticErrorMessage(err));
    } finally {
      setAccrualLoading(false);
    }
  };

  const handleAddAccrualsToQueue = async () => {
    if (!periodLabel || accrualSuggestions.length === 0 || isClosed) return;
    try {
      await addAccrualsAsAdjustments(periodLabel, accrualSuggestions);
      const list = await listAdjustments(periodLabel);
      setAdjustments(list);
      setAccrualSuggestions([]);
    } catch {
      // ignore
    }
  };

  const handleExplainAdjustments = async () => {
    if (adjustments.length === 0) return;
    setExplainError(null);
    setExplainLoading(true);
    setExplainNarrative(null);
    try {
      const mapped = adjustments.map((a) => ({
        description: a.description ?? '—',
        debits: [],
        credits: [],
        source: 'adjustment',
      }));
      const res = await explainJESuggestions(mapped);
      setExplainNarrative(res.narrative ?? null);
    } catch (err) {
      setExplainNarrative(null);
      setExplainError(agenticErrorMessage(err));
    } finally {
      setExplainLoading(false);
    }
  };

  const stage = closeStatus?.closeStage ?? 'no_tb';
  const checklistSteps = Array.isArray(checklist) ? checklist : [];
  const checklistComplete = checklistSteps.filter((s) => (s.status ?? 'pending') === 'completed' || (s.status ?? 'pending') === 'skipped').length;
  const checklistTotal = checklistSteps.length || 0;
  const pendingAdjustments = adjustments.filter((a) => a.status !== 'posted' && a.status !== 'rejected').length;
  const firstIncompleteStep = checklistSteps.find((s) => (s.status ?? 'pending') !== 'completed' && (s.status ?? 'pending') !== 'skipped') as { id: string; label?: string; name?: string } | undefined;
  const nextLine = coachResult?.nextAction ? coachResult.nextAction : firstIncompleteStep ? (firstIncompleteStep.label ?? firstIncompleteStep.name ?? firstIncompleteStep.id) : nextStepLabel(stage);

  const CATEGORY_ORDER = ['Cash', 'Receivables', 'Payables', 'Fixed Assets', 'Deferrals', 'Accruals', 'Reporting', 'Other'] as const;
  const checklistByCategory = React.useMemo(() => {
    const map = new Map<string, typeof checklistSteps>();
    for (const s of checklistSteps) {
      const cat = (s as { category?: string }).category?.trim() || 'Other';
      if (!map.has(cat)) map.set(cat, []);
      map.get(cat)!.push(s);
    }
    const ordered: { category: string; steps: typeof checklistSteps }[] = [];
    for (const cat of CATEGORY_ORDER) {
      const steps = map.get(cat);
      if (steps?.length) ordered.push({ category: cat, steps });
    }
    for (const [cat, steps] of map) {
      if (!CATEGORY_ORDER.includes(cat as typeof CATEGORY_ORDER[number])) ordered.push({ category: cat, steps });
    }
    return ordered;
  }, [checklistSteps]);

  const dueBadge = (() => {
    if (!closeDueDate) return null;
    const due = new Date(closeDueDate);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return <Badge variant="destructive">Overdue</Badge>;
    if (diffDays === 0) return <Badge variant="secondary">Due today</Badge>;
    if (diffDays <= 7) return <Badge variant="secondary">Due in {diffDays} day{diffDays !== 1 ? 's' : ''}</Badge>;
    return null;
  })();

  return (
    <div className="space-y-6">
      <div>
        <nav className="mb-2 flex items-center gap-2 text-sm text-muted-foreground">
          <Link href="/close" className="hover:text-foreground">Close</Link>
          <span>/</span>
          <span className="font-medium text-foreground">{periodLabel}</span>
        </nav>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">
          {periodLabel}
        </h1>
        {(getPeriodType(periodLabel) === 'quarterly' || getPeriodType(periodLabel) === 'annual') && (
          <p className="mt-0.5 text-sm text-muted-foreground">
            {getPeriodType(periodLabel) === 'quarterly' ? 'Quarter close' : 'Year-end close'}
          </p>
        )}

        {/* Sticky Close status strip */}
        {!loading && (
          <div className="close-status-strip sticky top-0 z-20 -mx-1 mt-3 rounded-md border px-3 py-2 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
              <span className="font-medium text-foreground">{periodLabel}</span>
              <span className="text-muted-foreground">|</span>
              <span>
                {closeDueDate ? (
                  <span className="text-muted-foreground">Due {closeDueDate}</span>
                ) : (
                  <span className="text-muted-foreground">No due date</span>
                )}
                {dueBadge && <span className="ml-1.5">{dueBadge}</span>}
              </span>
              <span className="text-muted-foreground">|</span>
              <span className="text-muted-foreground">
                {checklistComplete} of {checklistTotal} steps
                {!isClosed && pendingAdjustments > 0 && ` · ${pendingAdjustments} pending`}
              </span>
              <span className="text-muted-foreground">|</span>
              <Badge variant={isClosed ? 'success' : 'secondary'}>{stageBannerLabel(stage)}</Badge>
              {!isClosed && (
                <>
                  <span className="text-muted-foreground">|</span>
                  <span className="font-medium text-foreground">Next: {nextLine}</span>
                </>
              )}
            </div>
          </div>
        )}

        {!isClosed && (
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label htmlFor="close-due-date" className="text-sm text-muted-foreground">Set close due date:</label>
            <Input
              id="close-due-date"
              type="date"
              value={dueDateEdit || closeDueDate || ''}
              onChange={(e) => setDueDateEdit(e.target.value)}
              className="w-40"
            />
            <Button
              size="sm"
              variant="outline"
              disabled={dueDateSaving || !dueDateEdit}
              onClick={async () => {
                if (!periodLabel || !dueDateEdit) return;
                setDueDateSaving(true);
                try {
                  await setCloseDueDateApi(periodLabel, dueDateEdit);
                  setCloseDueDate(dueDateEdit);
                } finally {
                  setDueDateSaving(false);
                }
              }}
            >
              {dueDateSaving ? 'Saving…' : 'Save'}
            </Button>
          </div>
        )}
        {coachResult && !isClosed && (
          <div className="mt-3 rounded-md border border-primary/30 bg-primary/5 p-3 text-sm">
            <p className="font-medium text-foreground">Next: {coachResult.nextAction}</p>
            <p className="mt-1 text-muted-foreground">{coachResult.reason}</p>
          </div>
        )}
        {(exceptionsNarrative || readinessNarrative) && (
          <div className="mt-3 rounded-md border border-border bg-muted/30 p-3 text-sm">
            {exceptionsNarrative && (
              <p className="text-foreground">{exceptionsNarrative}</p>
            )}
            {nextActions.length > 0 && (
              <ul className="mt-2 list-disc pl-4 space-y-0.5 text-muted-foreground">
                {nextActions.map((a, i) => (
                  <li key={i}><span className="font-medium text-foreground">{a.label}</span>: {a.reason}</li>
                ))}
              </ul>
            )}
            {readinessNarrative && (
              <p className="mt-2 text-muted-foreground">{readinessNarrative}</p>
            )}
          </div>
        )}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="sticky top-0 z-10 mb-4 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
            <TabsTrigger value="checklist">Checklist</TabsTrigger>
            <TabsTrigger value="unadjusted">Unadjusted TB</TabsTrigger>
            <TabsTrigger value="adjustments">Adjustments</TabsTrigger>
            <TabsTrigger value="adjusted">Adjusted TB</TabsTrigger>
            <TabsTrigger value="statements">Statements</TabsTrigger>
            <TabsTrigger value="close">Lock period</TabsTrigger>
          </TabsList>
          <TabsContent value="checklist" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              <Link href={`/export?period=${encodeURIComponent(periodLabel)}`} className="text-primary hover:underline">Variance (actual vs budget)</Link>
            </p>
            {checklistTotal > 0 && (
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">{checklistComplete} of {checklistTotal} complete</span>
                </div>
                <div className="h-2 w-full rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-primary transition-[width]"
                    style={{ width: `${(checklistComplete / checklistTotal) * 100}%` }}
                  />
                </div>
              </div>
            )}
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead>Task</TableHead>
                    <TableHead>Verification</TableHead>
                    <TableHead>Due</TableHead>
                    <TableHead>Status</TableHead>
                    {!isClosed && <TableHead className="w-32"></TableHead>}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {checklistSteps.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isClosed ? 5 : 6} className="text-sm text-muted-foreground">No steps yet</TableCell>
                    </TableRow>
                  ) : (
                    checklistByCategory.map(({ category, steps }) => (
                      <React.Fragment key={category}>
                        <TableRow className="bg-muted/40">
                          <TableCell colSpan={isClosed ? 5 : 6} className="font-medium text-foreground py-2">
                            {category}
                          </TableCell>
                        </TableRow>
                        {steps.map((s) => {
                          const isNext = firstIncompleteStep?.id === s.id;
                          const stepDue = (s as { dueDate?: string }).dueDate;
                          const isComplete = (s.status ?? 'pending') === 'completed' || (s.status ?? 'pending') === 'skipped';
                          const today = new Date().toISOString().slice(0, 10);
                          const isOverdue = stepDue && !isComplete && stepDue < today;
                          const isOnTime = stepDue && !isComplete && stepDue >= today;
                          const editingDue = stepDueEdit?.stepId === s.id;
                          return (
                            <TableRow key={s.id} className={isNext ? 'border-l-4 border-l-primary bg-primary/5' : undefined}>
                              <TableCell className="text-muted-foreground w-32">{category === 'Other' ? '—' : ''}</TableCell>
                              <TableCell className="font-medium">
                                <span className="inline-flex items-center gap-2">
                                  {(s as { name?: string; label?: string }).name ?? (s as { label?: string }).label ?? '—'}
                                  {isNext && <Badge variant="secondary" className="text-xs">Next</Badge>}
                                </span>
                              </TableCell>
                              <TableCell className="text-sm text-muted-foreground">{(s as { verificationMethod?: string }).verificationMethod ?? '—'}</TableCell>
                              <TableCell className="text-sm">
                                {editingDue ? (
                                  <div className="flex items-center gap-1">
                                    <Input
                                      type="date"
                                      value={stepDueEdit?.value ?? stepDue ?? ''}
                                      onChange={(e) => setStepDueEdit((prev) => prev?.stepId === s.id ? { stepId: s.id, value: e.target.value } : prev)}
                                      className="w-36"
                                    />
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={stepDueSaving}
                                      onClick={async () => {
                                        if (!periodLabel || !stepDueEdit || stepDueEdit.stepId !== s.id) return;
                                        setStepDueSaving(true);
                                        try {
                                          await updateChecklistStep(periodLabel, s.id, { dueDate: stepDueEdit.value || undefined });
                                          const res = await getChecklist(periodLabel);
                                          setChecklist(Array.isArray(res?.steps) ? res.steps : []);
                                          setStepDueEdit(null);
                                        } finally {
                                          setStepDueSaving(false);
                                        }
                                      }}
                                    >
                                      Save
                                    </Button>
                                    <Button size="sm" variant="ghost" onClick={() => setStepDueEdit(null)}>Cancel</Button>
                                  </div>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5">
                                    {stepDue ?? '—'}
                                    {isOverdue && <Badge variant="destructive" className="text-xs">Late</Badge>}
                                    {isOnTime && <Badge variant="secondary" className="text-xs">On time</Badge>}
                                    {!isClosed && (
                                      <Button size="sm" variant="ghost" className="h-6 px-1 text-xs" onClick={() => setStepDueEdit({ stepId: s.id, value: stepDue ?? '' })}>
                                        Set due
                                      </Button>
                                    )}
                                  </span>
                                )}
                              </TableCell>
                              <TableCell>
                                <Badge variant={(s.status ?? 'pending') === 'completed' ? 'success' : 'muted'}>{s.status ?? 'Pending'}</Badge>
                              </TableCell>
                              {!isClosed && (
                                <TableCell>
                                  {(s.status ?? 'pending') !== 'completed' && (s.status ?? 'pending') !== 'skipped' && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={signingOffStepId !== null}
                                      onClick={async () => {
                                        if (!periodLabel || signingOffStepId) return;
                                        setSigningOffStepId(s.id);
                                        try {
                                          await checklistSignOff(
                                            periodLabel,
                                            s.id,
                                            user?.email ?? user?.id ?? 'user',
                                            checklistSteps
                                          );
                                          const res = await getChecklist(periodLabel);
                                          setChecklist(Array.isArray(res?.steps) ? res.steps : []);
                                          const coachRes = await getCloseCoach(periodLabel).catch(() => null);
                                          setCoachResult(coachRes && typeof coachRes.nextAction === 'string' ? coachRes : null);
                                        } finally {
                                          setSigningOffStepId(null);
                                        }
                                      }}
                                    >
                                      {signingOffStepId === s.id ? 'Saving…' : 'Mark complete'}
                                    </Button>
                                  )}
                                </TableCell>
                              )}
                            </TableRow>
                          );
                        })}
                      </React.Fragment>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="unadjusted" className="space-y-4">
            {unadjustedTB ? (
              <>
                <p className="text-sm text-muted-foreground">
                  Source: {unadjustedTB.source === 'rollup' && unadjustedTB.constituentPeriods?.length ? (
                    <span>
                      Roll-up from{' '}
                      {unadjustedTB.constituentPeriods.map((p, i) => (
                        <React.Fragment key={p}>
                          {i > 0 && ', '}
                          <Link href={`/close/${encodeURIComponent(p)}`} className="text-primary hover:underline">{p}</Link>
                        </React.Fragment>
                      ))}
                    </span>
                  ) : (
                    unadjustedTB.source
                  )}
                  {unadjustedTB.at && ` · ${unadjustedTB.at}`}
                  {unadjustedTB.by && ` by ${unadjustedTB.by}`}
                </p>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unadjustedTB.entries.map((e, i) => (
                        <TableRow key={i}>
                          <TableCell className="font-medium">{e.accountName}</TableCell>
                          <TableCell className="text-right">{formatAmount(e.debit)}</TableCell>
                          <TableCell className="text-right">{formatAmount(e.credit)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </>
            ) : (
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm text-muted-foreground">
                <p className="font-medium text-foreground">No unadjusted trial balance for this period.</p>
                {/^\d{4}-Q[1-4]$/i.test(periodLabel) ? (() => {
                  const qMatch = periodLabel.match(/^(\d{4})-Q([1-4])$/i);
                  const months = qMatch
                    ? [1, 2, 3].map((i) => `${qMatch[1]}-${String((parseInt(qMatch[2], 10) - 1) * 3 + i).padStart(2, '0')}`)
                    : [];
                  return (
                    <p className="mt-1">
                      For a quarter, add trial balance for each month (e.g. {months.join(', ')}) from Overview. A roll-up will appear here once those months have TB.
                    </p>
                  );
                })() : /^\d{4}$/.test(periodLabel.trim()) ? (
                  <p className="mt-1">
                    For a full year, add trial balance for each month (e.g. {periodLabel}-01 through {periodLabel}-12) from Overview. A roll-up will appear here once those months have TB.
                  </p>
                ) : (
                  <p className="mt-1">Sync or upload from Overview.</p>
                )}
                <p className="mt-2">
                  <Link href="/dashboard" className="text-primary hover:underline">Go to Overview</Link>
                </p>
              </div>
            )}
          </TabsContent>
          <TabsContent value="adjustments" className="space-y-4">
            {!isClosed && (
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" variant="outline" onClick={handleAddAdjustment}>
                  {showManualForm ? 'Cancel' : 'Add adjustment'}
                </Button>
                <div className="flex items-center gap-2">
                  <Input
                    placeholder="e.g. Accrue $15k legal expense"
                    value={jeTextInput}
                    onChange={(e) => setJeTextInput(e.target.value)}
                    className="max-w-xs"
                  />
                  <Button size="sm" variant="outline" onClick={handleSuggestFromText} disabled={jeTextLoading || !jeTextInput.trim()}>
                    {jeTextLoading ? 'Suggesting…' : 'Suggest from text'}
                  </Button>
                </div>
                <Button size="sm" variant="outline" onClick={handleSuggestAccruals} disabled={accrualLoading}>
                  {accrualLoading ? 'Suggesting…' : 'Suggest accruals (AI)'}
                </Button>
                {adjustments.length > 0 && (
                  <Button size="sm" variant="outline" onClick={handleExplainAdjustments} disabled={explainLoading}>
                    {explainLoading ? 'Explaining…' : 'Explain adjustments'}
                  </Button>
                )}
              </div>
            )}
            {showManualForm && !isClosed && (
              <Card className="border-border">
                <CardHeader className="py-3">
                  <CardTitle className="text-base">Manual adjustment</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <label className="text-sm font-medium text-foreground">Description</label>
                    <Input
                      placeholder="e.g. Accrue legal expense"
                      value={manualDescription}
                      onChange={(e) => setManualDescription(e.target.value)}
                      className="mt-1"
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">Debits</label>
                        <Button type="button" size="sm" variant="ghost" onClick={addManualDebitLine}>
                          Add line
                        </Button>
                      </div>
                      <div className="space-y-2 mt-1">
                        {manualDebits.map((line, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <Input
                              placeholder="Account"
                              value={line.account}
                              onChange={(e) => updateManualDebit(i, 'account', e.target.value)}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              placeholder="Amount"
                              value={line.amount}
                              onChange={(e) => updateManualDebit(i, 'amount', e.target.value)}
                              className="w-28"
                            />
                            <Button type="button" size="sm" variant="ghost" onClick={() => removeManualDebit(i)} disabled={manualDebits.length <= 1}>
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center justify-between">
                        <label className="text-sm font-medium text-foreground">Credits</label>
                        <Button type="button" size="sm" variant="ghost" onClick={addManualCreditLine}>
                          Add line
                        </Button>
                      </div>
                      <div className="space-y-2 mt-1">
                        {manualCredits.map((line, i) => (
                          <div key={i} className="flex gap-2 items-center">
                            <Input
                              placeholder="Account"
                              value={line.account}
                              onChange={(e) => updateManualCredit(i, 'account', e.target.value)}
                              className="flex-1"
                            />
                            <Input
                              type="number"
                              min={0}
                              step={0.01}
                              placeholder="Amount"
                              value={line.amount}
                              onChange={(e) => updateManualCredit(i, 'amount', e.target.value)}
                              className="w-28"
                            />
                            <Button type="button" size="sm" variant="ghost" onClick={() => removeManualCredit(i)} disabled={manualCredits.length <= 1}>
                              Remove
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                  {manualFormError && <p className="text-sm text-destructive">{manualFormError}</p>}
                  <div className="flex gap-2">
                    <Button size="sm" onClick={handleCreateManualAdjustment} disabled={manualSubmitting}>
                      {manualSubmitting ? 'Creating…' : 'Create adjustment'}
                    </Button>
                    <Button size="sm" variant="outline" onClick={resetManualForm} disabled={manualSubmitting}>
                      Cancel
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
            {jeTextError && <p className="text-sm text-destructive">{jeTextError}</p>}
            {jeSuggestions.length > 0 && (
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">Suggested JEs from text</p>
                <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-0.5">
                  {jeSuggestions.map((s, i) => (
                    <li key={i}>{s.description ?? '—'}</li>
                  ))}
                </ul>
                <Button size="sm" variant="default" onClick={handleAddJeSuggestionsToQueue}>Add to queue</Button>
              </div>
            )}
            {accrualError && <p className="text-sm text-destructive">{accrualError}</p>}
            {accrualSuggestions.length > 0 && (
              <div className="rounded-md border border-border p-3 space-y-2">
                <p className="text-sm font-medium text-foreground">Suggested accruals (AI)</p>
                <ul className="list-disc pl-4 text-sm text-muted-foreground space-y-0.5">
                  {accrualSuggestions.map((s, i) => (
                    <li key={i}>{s.description ?? '—'} {s.amount != null ? `(${formatAmount(s.amount)})` : ''}</li>
                  ))}
                </ul>
                <Button size="sm" variant="default" onClick={handleAddAccrualsToQueue}>Add to queue</Button>
              </div>
            )}
            {explainError && <p className="text-sm text-destructive">{explainError}</p>}
            {explainNarrative && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Explanation</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground whitespace-pre-wrap">{explainNarrative}</p>
                </CardContent>
              </Card>
            )}
            {adjustments.length > 0 && (
              <p className="text-sm text-muted-foreground">
                <span className="font-medium text-foreground">{adjustmentCounts.pending}</span> pending
                {' · '}
                <span className="font-medium text-foreground">{adjustmentCounts.posted}</span> posted
                {' · '}
                <span className="font-medium text-foreground">{adjustmentCounts.rejected}</span> rejected
              </p>
            )}
            {adjustments.length > 0 && (
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Show:</span>
                <button
                  type="button"
                  onClick={() => setAdjustmentFilter('pending')}
                  className={`rounded px-2 py-1 text-sm ${adjustmentFilter === 'pending' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  Pending
                </button>
                <button
                  type="button"
                  onClick={() => setAdjustmentFilter('all')}
                  className={`rounded px-2 py-1 text-sm ${adjustmentFilter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground hover:bg-muted/80'}`}
                >
                  All
                </button>
              </div>
            )}
            {adjustmentError && <p className="text-sm text-destructive">{adjustmentError}</p>}
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Description</TableHead>
                    <TableHead>Dr · Cr</TableHead>
                    <TableHead>Status</TableHead>
                    {!isClosed && <TableHead className="w-40 text-right">Actions</TableHead>}
                    <TableHead className="w-24"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredAdjustments.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={isClosed ? 4 : 5} className="text-sm text-muted-foreground">
                        {adjustmentFilter === 'pending' ? 'No pending adjustments' : 'No adjustments'}
                      </TableCell>
                    </TableRow>
                  ) : (
                    filteredAdjustments.map((a) => {
                      const totalDr = (a.debits ?? []).reduce((s, d) => s + (d.amount ?? 0), 0);
                      const totalCr = (a.credits ?? []).reduce((s, c) => s + (c.amount ?? 0), 0);
                      const drCr = (a.debits?.length ?? 0) + (a.credits?.length ?? 0) > 0 ? `Dr ${formatAmount(totalDr)} · Cr ${formatAmount(totalCr)}` : '—';
                      const isUpdating = updatingAdjustmentId === a.id;
                      const canAct = a.status !== 'posted' && a.status !== 'rejected';
                      return (
                        <React.Fragment key={a.id}>
                          <TableRow
                            className={`cursor-pointer ${expandedAdjustmentId === a.id ? 'bg-muted/30' : ''}`}
                            onClick={() => setExpandedAdjustmentId((id) => (id === a.id ? null : a.id))}
                          >
                            <TableCell className="font-medium">{a.description ?? '—'}</TableCell>
                            <TableCell className="text-sm text-muted-foreground">{drCr}</TableCell>
                            <TableCell>
                              <Badge variant={a.status === 'posted' ? 'success' : a.status === 'rejected' ? 'destructive' : 'secondary'}>
                                {a.status ?? 'pending'}
                              </Badge>
                            </TableCell>
                            {!isClosed && (
                              <TableCell className="text-right">
                                {canAct && (
                                  <div className="flex justify-end gap-1">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={isUpdating}
                                      onClick={(e) => { e.stopPropagation(); handleUpdateAdjustmentStatus(a.id, 'rejected'); }}
                                    >
                                      Reject
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={isUpdating}
                                      onClick={(e) => { e.stopPropagation(); handleUpdateAdjustmentStatus(a.id, 'approved'); }}
                                    >
                                      Approve
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="default"
                                      disabled={isUpdating}
                                      onClick={(e) => { e.stopPropagation(); handleUpdateAdjustmentStatus(a.id, 'posted'); }}
                                    >
                                      {isUpdating ? '…' : 'Post'}
                                    </Button>
                                  </div>
                                )}
                              </TableCell>
                            )}
                            <TableCell className="text-sm text-muted-foreground">
                              {((a.debits?.length ?? 0) + (a.credits?.length ?? 0)) > 0 ? (
                                expandedAdjustmentId === a.id ? 'Hide lines' : 'Show lines'
                              ) : (
                                '—'
                              )}
                            </TableCell>
                          </TableRow>
                          {approvalErrorByAdjustmentId[a.id] && (
                            <TableRow>
                              <TableCell colSpan={isClosed ? 4 : 5} className="bg-muted/20 p-3 text-sm">
                                <p className="text-muted-foreground mb-2">
                                  {approvalErrorByAdjustmentId[a.id].message.includes('Submitted for approval')
                                    ? approvalErrorByAdjustmentId[a.id].message
                                    : 'This adjustment requires approval. Submit for approval first, or approve via the approval request.'}
                                </p>
                                <div className="flex flex-wrap items-center gap-2">
                                  {!approvalErrorByAdjustmentId[a.id].message.includes('Submitted for approval') && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={submittingForApprovalId === a.id}
                                      onClick={(e) => { e.stopPropagation(); handleSubmitForApproval(a.id); }}
                                    >
                                      {submittingForApprovalId === a.id ? '…' : 'Submit for approval'}
                                    </Button>
                                  )}
                                  {approvalErrorByAdjustmentId[a.id].approvalRequestId && (
                                    <Link
                                      href={`/approvals?request=${encodeURIComponent(approvalErrorByAdjustmentId[a.id].approvalRequestId!)}`}
                                      className="text-primary hover:underline text-sm"
                                      onClick={(e) => e.stopPropagation()}
                                    >
                                      View approval request
                                    </Link>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                          {expandedAdjustmentId === a.id && ((a.debits?.length ?? 0) + (a.credits?.length ?? 0)) > 0 && (
                            <TableRow>
                              <TableCell colSpan={isClosed ? 4 : 5} className="bg-muted/20 p-4">
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <p className="font-medium text-foreground mb-1">Debits</p>
                                    <ul className="list-none space-y-0.5 text-muted-foreground">
                                      {(a.debits ?? []).map((d, i) => (
                                        <li key={i}>{d.account}: {formatAmount(d.amount)}</li>
                                      ))}
                                      {(a.debits?.length ?? 0) === 0 && <li>—</li>}
                                  </ul>
                                </div>
                                <div>
                                  <p className="font-medium text-foreground mb-1">Credits</p>
                                  <ul className="list-none space-y-0.5 text-muted-foreground">
                                    {(a.credits ?? []).map((c, i) => (
                                      <li key={i}>{c.account}: {formatAmount(c.amount)}</li>
                                    ))}
                                    {(a.credits?.length ?? 0) === 0 && <li>—</li>}
                                  </ul>
                                </div>
                                </div>
                              </TableCell>
                            </TableRow>
                          )}
                        </React.Fragment>
                    );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </TabsContent>
          <TabsContent value="adjusted" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Unadjusted TB +{' '}
              <button
                type="button"
                onClick={() => setActiveTab('adjustments')}
                className="font-medium text-primary hover:underline"
              >
                {postedAdjustmentsCount} adjustment{postedAdjustmentsCount !== 1 ? 's' : ''}
              </button>
            </p>
            {adjustedTB?.entries?.length ? (
              <div className="rounded-md border border-border">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Account</TableHead>
                      <TableHead className="text-right">Debit</TableHead>
                      <TableHead className="text-right">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {adjustedTB.entries.map((e, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{e.accountName}</TableCell>
                        <TableCell className="text-right">{formatAmount(e.debit)}</TableCell>
                        <TableCell className="text-right">{formatAmount(e.credit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No adjusted trial balance. Add unadjusted TB first; adjusted = unadjusted + posted adjustments.</p>
            )}
          </TabsContent>
          <TabsContent value="closing" className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Suggested closing entry: close revenue and expense to Retained Earnings. Add as adjustment to post with other close adjustments.
            </p>
            {closingEntry ? (
              <>
                <p className="text-sm font-medium text-foreground">{closingEntry.description}</p>
                <div className="rounded-md border border-border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Account</TableHead>
                        <TableHead className="text-right">Debit</TableHead>
                        <TableHead className="text-right">Credit</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {closingEntry.debits.map((d, i) => (
                        <TableRow key={`d-${i}`}>
                          <TableCell className="font-medium">{d.account}</TableCell>
                          <TableCell className="text-right">{formatAmount(d.amount)}</TableCell>
                          <TableCell className="text-right">—</TableCell>
                        </TableRow>
                      ))}
                      {closingEntry.credits.map((c, i) => (
                        <TableRow key={`c-${i}`}>
                          <TableCell className="font-medium">{c.account}</TableCell>
                          <TableCell className="text-right">—</TableCell>
                          <TableCell className="text-right">{formatAmount(c.amount)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
                {!isClosed && (
                  <Button size="sm" variant="default" onClick={handleAddClosingEntryAsAdjustment} disabled={closingEntryAdding}>
                    {closingEntryAdding ? 'Adding…' : 'Add as adjustment'}
                  </Button>
                )}
              </>
            ) : (
              <p className="text-sm text-muted-foreground">No closing entry for this period. Ensure adjusted TB has revenue or expense accounts.</p>
            )}
          </TabsContent>
          <TabsContent value="statements" className="space-y-4">
            {statements?.balanceSheet || statements?.profitAndLoss ? (
              <div className="space-y-4">
                {statements.balanceSheet && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">Balance Sheet</h3>
                    <div className="rounded-md border border-border">
                      <Table>
                        <TableBody>
                          {(statements.balanceSheet as { assets?: { label: string; amount: number }[] }).assets?.map((line, i) => (
                            <TableRow key={i}>
                              <TableCell className="font-medium">{line.label}</TableCell>
                              <TableCell className="text-right">{formatAmount(line.amount)}</TableCell>
                            </TableRow>
                          ))}
                          <TableRow className="bg-muted/30">
                            <TableCell className="font-medium">Total assets</TableCell>
                            <TableCell className="text-right">{formatAmount((statements.balanceSheet as { totalAssets?: number }).totalAssets ?? 0)}</TableCell>
                          </TableRow>
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                {statements.profitAndLoss && (
                  <div>
                    <h3 className="text-sm font-medium text-foreground mb-2">Profit &amp; Loss</h3>
                    <p className="text-sm text-muted-foreground">
                      Net income: {formatAmount((statements.profitAndLoss as { netIncome?: number }).netIncome ?? 0)}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No statements for this period. Statements are built from adjusted TB.</p>
            )}
          </TabsContent>
          <TabsContent value="close" className="space-y-4">
            {isClosed ? (
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm">
                <p className="font-medium text-foreground">This period is closed.</p>
                <p className="mt-1 text-muted-foreground">Closed at {lock?.lockedAt} by {lock?.lockedBy}</p>
              </div>
            ) : lockConfirmOpen ? (
              <div className="rounded-md border border-border bg-muted/30 p-4 text-sm space-y-3">
                <p className="font-medium text-foreground">Lock {periodLabel}?</p>
                <p className="text-muted-foreground">You won&apos;t be able to add or change adjustments after closing.</p>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setLockConfirmOpen(false)} disabled={lockLoading}>
                    Cancel
                  </Button>
                  <Button
                    onClick={async () => {
                      await handleClosePeriod();
                      setLockConfirmOpen(false);
                    }}
                    disabled={lockLoading}
                  >
                    {lockLoading ? 'Closing…' : 'Close period'}
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <p className="text-sm text-muted-foreground">Closing this period will allow valuation and reporting for this period.</p>
                <Button onClick={() => setLockConfirmOpen(true)} disabled={lockLoading}>
                  Close period
                </Button>
              </>
            )}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
