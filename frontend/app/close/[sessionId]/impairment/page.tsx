'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCGUs, useCreateCGU, useImpairmentTests, useEvaluateImpairment, useImpairmentSummary } from '@/lib/queries/impairment';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import type { CashGeneratingUnit, ImpairmentTest } from '@/lib/types/impairment';
import { Plus, Play } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { apiFetch } from '@/lib/api';
import { useMutation, useQueryClient } from '@tanstack/react-query';

const METHOD_LABEL: Record<string, string> = { value_in_use: 'Value in Use', fair_value_less_costs: 'FV Less Costs', value_in_use_and_fair_value_less_costs: 'Both' };

export default function ImpairmentPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;
  const queryClient = useQueryClient();

  const { data: cgus } = useCGUs(sessionId);
  const { data: tests, isLoading } = useImpairmentTests(sessionId);
  const { data: summary } = useImpairmentSummary(sessionId);
  const createCGU = useCreateCGU(sessionId);
  const evaluateImpairment = useEvaluateImpairment(sessionId);

  const createTest = useMutation({
    mutationFn: (body: Record<string, unknown>) =>
      apiFetch(`/api/close/sessions/${sessionId}/impairment/tests`, { method: 'POST', body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['impairment-tests', sessionId] });
    },
  });

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [showCGUForm, setShowCGUForm] = useState(false);
  const [showTestForm, setShowTestForm] = useState(false);
  const [cguForm, setCguForm] = useState({ cguName: '', description: '' });
  const [testForm, setTestForm] = useState({
    testDate: '', assetType: 'goodwill', cguId: '', carryingAmount: '', recoverableAmount: '', method: 'value_in_use', assetDescription: '',
  });

  const handleCreateCGU = () => {
    createCGU.mutate(cguForm, {
      onSuccess: () => { setShowCGUForm(false); setCguForm({ cguName: '', description: '' }); },
    });
  };

  const handleCreateTest = () => {
    createTest.mutate({
      ...testForm,
      carryingAmount: Number(testForm.carryingAmount),
      recoverableAmount: Number(testForm.recoverableAmount),
      cguId: testForm.cguId || undefined,
    }, {
      onSuccess: () => { setShowTestForm(false); setTestForm({ testDate: '', assetType: 'goodwill', cguId: '', carryingAmount: '', recoverableAmount: '', method: 'value_in_use', assetDescription: '' }); },
    });
  };

  const cguMap = new Map((cgus ?? []).map((c) => [c.id, c.cguName]));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-display" style={{ color: 'var(--text-primary)' }}>Impairment Testing</h1>
        {!readOnly && (
          <div className="flex gap-2">
            <button onClick={() => setShowCGUForm(!showCGUForm)} className="flex items-center gap-1 px-3 py-1.5 text-sm rounded-md hover:bg-hover" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)' }}>
              <Plus className="w-4 h-4" /> Add CGU
            </button>
            <button onClick={() => setShowTestForm(!showTestForm)} className="flex items-center gap-1 px-3 py-1.5 text-sm text-white rounded-md hover:bg-accent/90" style={{ background: 'var(--interactive-primary)' }}>
              <Plus className="w-4 h-4" /> New Test
            </button>
          </div>
        )}
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Impairment Loss</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--status-error)' }}>{fmtMoney(summary.totalImpairmentLoss)}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Tests Performed</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.testCount}</div>
          </div>
          <div className="p-4 rounded-lg" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>CGUs Tested</div>
            <div className="text-lg font-semibold" style={{ color: 'var(--text-primary)' }}>{summary.byCGU.length}</div>
          </div>
        </div>
      )}

      {!readOnly && showCGUForm && (
        <div className="p-4 rounded-lg space-y-3" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>New Cash Generating Unit</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="CGU Name" value={cguForm.cguName} onChange={(e) => setCguForm({ ...cguForm, cguName: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Description" value={cguForm.description} onChange={(e) => setCguForm({ ...cguForm, description: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateCGU} disabled={createCGU.isPending} className="px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>Create</button>
            <button onClick={() => setShowCGUForm(false)} className="px-3 py-1.5 text-sm rounded-md" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      )}

      {!readOnly && showTestForm && (
        <div className="p-4 rounded-lg space-y-3" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium" style={{ color: 'var(--text-primary)' }}>New Impairment Test</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input type="date" value={testForm.testDate} onChange={(e) => setTestForm({ ...testForm, testDate: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <select value={testForm.assetType} onChange={(e) => setTestForm({ ...testForm, assetType: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}>
              <option value="goodwill">Goodwill</option>
              <option value="intangible">Intangible</option>
              <option value="ppe">PP&E</option>
              <option value="investment">Investment</option>
            </select>
            <select value={testForm.cguId} onChange={(e) => setTestForm({ ...testForm, cguId: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}>
              <option value="">No CGU</option>
              {(cgus ?? []).map((c) => <option key={c.id} value={c.id}>{c.cguName}</option>)}
            </select>
            <select value={testForm.method} onChange={(e) => setTestForm({ ...testForm, method: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }}>
              <option value="value_in_use">Value in Use</option>
              <option value="fair_value_less_costs">FV Less Costs</option>
            </select>
            <input placeholder="Carrying Amount" type="number" value={testForm.carryingAmount} onChange={(e) => setTestForm({ ...testForm, carryingAmount: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
            <input placeholder="Recoverable Amount" type="number" value={testForm.recoverableAmount} onChange={(e) => setTestForm({ ...testForm, recoverableAmount: e.target.value })} className="rounded-md px-2 py-1.5 text-sm" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', background: 'var(--bg-surface-sunken)', color: 'var(--text-primary)' }} />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateTest} disabled={createTest.isPending} className="px-3 py-1.5 text-sm text-white rounded-md disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>Create</button>
            <button onClick={() => setShowTestForm(false)} className="px-3 py-1.5 text-sm rounded-md" style={{ borderWidth: '1px', borderStyle: 'solid', borderColor: 'var(--border-default)', color: 'var(--text-secondary)' }}>Cancel</button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>CGUs</h2>
        <DataTable<CashGeneratingUnit>
          rows={cgus ?? []}
          getRowId={(r) => r.id}
          columns={[
            { id: 'cguName', header: 'Name', cell: (r) => r.cguName },
            { id: 'description', header: 'Description', cell: (r) => r.description ?? '\u2014' },
            { id: 'allocationBasis', header: 'Basis', cell: (r) => r.allocationBasis ?? '\u2014' },
          ]}
        />
      </div>

      <div>
        <h2 className="text-lg font-semibold mb-2" style={{ color: 'var(--text-primary)' }}>Impairment Tests</h2>
        <DataTable<ImpairmentTest>
          rows={tests ?? []}
          getRowId={(r) => r.id}
          loading={isLoading}
          columns={[
            { id: 'testDate', header: 'Date', cell: (r) => r.testDate?.slice(0, 10) },
            { id: 'cguId', header: 'CGU', cell: (r) => cguMap.get(r.cguId ?? '') ?? '\u2014' },
            { id: 'assetType', header: 'Asset Type', cell: (r) => r.assetType },
            { id: 'carryingAmount', header: 'Carrying', cell: (r) => <MoneyCell value={r.carryingAmount} /> },
            { id: 'recoverableAmount', header: 'Recoverable', cell: (r) => <MoneyCell value={r.recoverableAmount} /> },
            { id: 'impairmentLoss', header: 'Loss', cell: (r) => r.impairmentLoss ? <MoneyCell value={r.impairmentLoss} /> : '\u2014' },
            { id: 'method', header: 'Method', cell: (r) => METHOD_LABEL[r.method] ?? r.method },
            { id: 'evaluate', header: '', cell: (r) => (
              !readOnly ? <button onClick={() => evaluateImpairment.mutate(r.id)} className="hover:underline text-xs" style={{ color: 'var(--interactive-primary)' }}>
                <Play className="w-3 h-3 inline mr-1" />Evaluate
              </button> : null
            )},
          ]}
        />
      </div>
    </div>
  );
}
