'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import {
  useLeases,
  useCreateLease,
  useGenerateSchedule,
  useProposeLeaseEntries,
  useLeaseDisclosure,
} from '@/lib/queries/leases';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import type { Lease, PeriodEntry } from '@/lib/types/leases';
import { Plus, Play, ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { apiFetch } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const TYPE_LABEL: Record<string, string> = { finance: 'Finance', operating: 'Operating' };
const STATUS_LABEL: Record<string, string> = { active: 'Active', expired: 'Expired', terminated: 'Terminated', modified: 'Modified' };
const ENTRY_LABEL: Record<string, string> = { interest: 'Interest', amortization: 'Amortization', operating_expense: 'Operating Expense' };

export default function LeasesPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const queryClient = useQueryClient();

  const { data, isLoading } = useLeases(sessionId);
  const leases = data?.leases ?? [];
  const periodEntries = data?.periodEntries ?? [];

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [entityId, setEntityId] = useState('');
  const [expandedLease, setExpandedLease] = useState<string | null>(null);
  const [scheduleData, setScheduleData] = useState<Record<string, Record<string, unknown>[]>>({});

  const [form, setForm] = useState({
    leaseName: '', leaseType: 'operating', commencementDate: '',
    termMonths: '', monthlyPayment: '', ibrAnnual: '',
  });

  const createLease = useCreateLease(entityId);
  const proposeEntries = useProposeLeaseEntries(sessionId);

  // Get first entity from leases, or use manually entered
  const disclosureEntityId = leases[0]?.entityId ?? entityId;
  const { data: disclosure } = useLeaseDisclosure(sessionId, disclosureEntityId || undefined);

  const handleCreate = () => {
    if (!entityId) return;
    createLease.mutate({
      ...form,
      termMonths: Number(form.termMonths),
    }, {
      onSuccess: () => {
        setShowCreateForm(false);
        setForm({ leaseName: '', leaseType: 'operating', commencementDate: '', termMonths: '', monthlyPayment: '', ibrAnnual: '' });
        queryClient.invalidateQueries({ queryKey: ['leases', sessionId] });
      },
    });
  };

  const handleGenerateSchedule = async (leaseId: string) => {
    try {
      const res = await apiFetch<{ schedule: Record<string, unknown>[] }>(
        `/api/close/leases/${leaseId}/generate-schedule`,
        { method: 'POST', body: {} }
      );
      setScheduleData((prev) => ({ ...prev, [leaseId]: res.schedule ?? [] }));
      setExpandedLease(leaseId);
    } catch {
      // handled by UI
    }
  };

  const toggleExpand = (leaseId: string) => {
    if (expandedLease === leaseId) {
      setExpandedLease(null);
    } else {
      if (!scheduleData[leaseId]) {
        handleGenerateSchedule(leaseId);
      } else {
        setExpandedLease(leaseId);
      }
    }
  };

  const handleProposeEntries = () => {
    if (!disclosureEntityId) return;
    proposeEntries.mutate({ entityId: disclosureEntityId });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>
          Lease Accounting (ASC 842)
        </h1>
        {!readOnly && (
          <div className="flex gap-2">
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-md"
              style={{ background: 'var(--interactive-primary)' }}
            >
              <Plus className="w-4 h-4" /> New Lease
            </button>
            <button
              onClick={handleProposeEntries}
              disabled={proposeEntries.isPending || leases.length === 0}
              className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md disabled:opacity-50"
              style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-primary)' }}
            >
              <Play className="w-4 h-4" /> Propose Entries
            </button>
          </div>
        )}
      </div>

      {/* Disclosure Summary */}
      {disclosure && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Leases</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{disclosure.totalLeaseCount}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>{disclosure.financeLeaseCount} finance / {disclosure.operatingLeaseCount} operating</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Finance Lease Expense</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(disclosure.financeLeaseExpense.total)}</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>Int: {fmtMoney(disclosure.financeLeaseExpense.interest)} / Amort: {fmtMoney(disclosure.financeLeaseExpense.amortization)}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Operating Lease Expense</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{fmtMoney(disclosure.operatingLeaseExpense)}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Avg Remaining Term</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{disclosure.weightedAverageRemainingTerm} mo</div>
            <div className="text-xs" style={{ color: 'var(--text-secondary)' }}>WADR: {(Number(disclosure.weightedAverageDiscountRate) * 100).toFixed(2)}%</div>
          </div>
        </div>
      )}

      {/* Create Lease Form */}
      {!readOnly && showCreateForm && (
        <div className="p-4 rounded-lg space-y-3" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>New Lease</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input placeholder="Entity ID" value={entityId} onChange={(e) => setEntityId(e.target.value)} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Lease Name" value={form.leaseName} onChange={(e) => setForm({ ...form, leaseName: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <select value={form.leaseType} onChange={(e) => setForm({ ...form, leaseType: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}>
              <option value="operating">Operating</option>
              <option value="finance">Finance</option>
            </select>
            <input type="date" placeholder="Commencement" value={form.commencementDate} onChange={(e) => setForm({ ...form, commencementDate: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Term (months)" type="number" value={form.termMonths} onChange={(e) => setForm({ ...form, termMonths: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Monthly Payment" type="number" step="0.01" value={form.monthlyPayment} onChange={(e) => setForm({ ...form, monthlyPayment: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="IBR Annual (e.g. 0.05)" type="number" step="0.001" value={form.ibrAnnual} onChange={(e) => setForm({ ...form, ibrAnnual: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreate} disabled={createLease.isPending} className="px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>Create</button>
            <button onClick={() => setShowCreateForm(false)} className="px-3 py-1.5 text-sm rounded-md" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      )}

      {/* Lease Register */}
      <div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Lease Register</h2>
        <DataTable<Lease>
          rows={leases}
          getRowId={(r) => r.id}
          loading={isLoading}
          columns={[
            { id: 'expand', header: '', cell: (r) => (
              <button onClick={() => toggleExpand(r.id)} className="p-1" style={{ color: 'var(--text-secondary)' }}>
                {expandedLease === r.id ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              </button>
            )},
            { id: 'leaseName', header: 'Lease', cell: (r) => r.leaseName },
            { id: 'leaseType', header: 'Type', cell: (r) => TYPE_LABEL[r.leaseType] ?? r.leaseType },
            { id: 'commencementDate', header: 'Start', cell: (r) => r.commencementDate?.slice(0, 10) },
            { id: 'termMonths', header: 'Term', cell: (r) => `${r.termMonths} mo` },
            { id: 'monthlyPayment', header: 'Monthly', cell: (r) => <MoneyCell value={r.monthlyPayment} /> },
            { id: 'ibrAnnual', header: 'IBR', cell: (r) => `${(Number(r.ibrAnnual) * 100).toFixed(2)}%` },
            { id: 'rouAssetInitial', header: 'ROU Asset', cell: (r) => <MoneyCell value={r.rouAssetInitial} /> },
            { id: 'leaseLiabilityInitial', header: 'Liability', cell: (r) => <MoneyCell value={r.leaseLiabilityInitial} /> },
            { id: 'status', header: 'Status', cell: (r) => STATUS_LABEL[r.status] ?? r.status },
          ]}
        />

        {/* Expanded Payment Schedule */}
        {expandedLease && scheduleData[expandedLease] && (
          <div className="mt-2 ml-8 p-3 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)' }}>
            <h3 className="text-sm font-medium mb-2" style={{ color: 'var(--text-primary)' }}>Payment Schedule</h3>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr style={{ color: 'var(--text-secondary)' }}>
                    <th className="text-left px-2 py-1">#</th>
                    <th className="text-left px-2 py-1">Date</th>
                    <th className="text-right px-2 py-1">Payment</th>
                    <th className="text-right px-2 py-1">Interest</th>
                    <th className="text-right px-2 py-1">Principal</th>
                    <th className="text-right px-2 py-1">Beg. Liability</th>
                    <th className="text-right px-2 py-1">End. Liability</th>
                  </tr>
                </thead>
                <tbody>
                  {scheduleData[expandedLease]!.map((row, i) => (
                    <tr key={i} style={{ color: 'var(--text-primary)', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--border-default)' }}>
                      <td className="px-2 py-1">{row.periodNumber as number}</td>
                      <td className="px-2 py-1">{String(row.paymentDate).slice(0, 10)}</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(row.paymentAmount as string)}</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(row.interestAmount as string)}</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(row.principalAmount as string)}</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(row.beginningLiability as string)}</td>
                      <td className="px-2 py-1 text-right">{fmtMoney(row.endingLiability as string)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* Period Entries */}
      {periodEntries.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Period Entries</h2>
          <DataTable<PeriodEntry>
            rows={periodEntries}
            getRowId={(r) => r.id}
            columns={[
              { id: 'leaseId', header: 'Lease', cell: (r) => {
                const lease = leases.find((l) => l.id === r.leaseId);
                return lease?.leaseName ?? r.leaseId.slice(0, 8);
              }},
              { id: 'entryType', header: 'Type', cell: (r) => ENTRY_LABEL[r.entryType] ?? r.entryType },
              { id: 'amount', header: 'Amount', cell: (r) => <MoneyCell value={r.amount} /> },
              { id: 'journalEntryId', header: 'JE', cell: (r) => r.journalEntryId ? r.journalEntryId.slice(0, 8) : '\u2014' },
              { id: 'createdAt', header: 'Created', cell: (r) => r.createdAt?.slice(0, 10) },
            ]}
          />
        </div>
      )}

      {/* Maturity Analysis */}
      {disclosure && disclosure.maturityAnalysis.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Maturity Analysis</h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr style={{ color: 'var(--text-secondary)' }}>
                  <th className="text-left px-3 py-2">Year</th>
                  <th className="text-right px-3 py-2">Total Payments</th>
                </tr>
              </thead>
              <tbody>
                {disclosure.maturityAnalysis.map((row) => (
                  <tr key={row.year} style={{ color: 'var(--text-primary)', borderTopWidth: '1px', borderTopStyle: 'solid', borderTopColor: 'var(--border-default)' }}>
                    <td className="px-3 py-2">{row.year}</td>
                    <td className="px-3 py-2 text-right">{fmtMoney(row.totalPayments)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {leases.length === 0 && !isLoading && (
        <div className="p-8 text-center rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>
            No leases recorded. Add a lease to begin ASC 842 accounting.
          </div>
        </div>
      )}
    </div>
  );
}
