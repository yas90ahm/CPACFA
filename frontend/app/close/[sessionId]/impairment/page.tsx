'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useCGUs, useCreateCGU, useImpairmentTests, useEvaluateImpairment, useImpairmentSummary } from '@/lib/queries/impairment';
import { DataTable } from '@/components/shared/DataTable';
import { MoneyCell } from '@/components/shared/MoneyCell';
import { fmtMoney } from '@/lib/money';
import type { CashGeneratingUnit, ImpairmentTest } from '@/lib/types/impairment';
import { Plus, Play } from 'lucide-react';
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
        <h1 className="text-xl font-semibold">Impairment Testing</h1>
        <div className="flex gap-2">
          <button onClick={() => setShowCGUForm(!showCGUForm)} className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-md hover:bg-hover">
            <Plus className="w-4 h-4" /> Add CGU
          </button>
          <button onClick={() => setShowTestForm(!showTestForm)} className="flex items-center gap-1 px-3 py-1.5 text-sm bg-accent text-white rounded-md hover:bg-accent/90">
            <Plus className="w-4 h-4" /> New Test
          </button>
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">Total Impairment Loss</div>
            <div className="text-lg font-semibold text-red-600">{fmtMoney(summary.totalImpairmentLoss)}</div>
          </div>
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">Tests Performed</div>
            <div className="text-lg font-semibold">{summary.testCount}</div>
          </div>
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">CGUs Tested</div>
            <div className="text-lg font-semibold">{summary.byCGU.length}</div>
          </div>
        </div>
      )}

      {showCGUForm && (
        <div className="p-4 border rounded-lg bg-surface space-y-3">
          <h3 className="font-medium">New Cash Generating Unit</h3>
          <div className="grid grid-cols-2 gap-3">
            <input placeholder="CGU Name" value={cguForm.cguName} onChange={(e) => setCguForm({ ...cguForm, cguName: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Description" value={cguForm.description} onChange={(e) => setCguForm({ ...cguForm, description: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateCGU} disabled={createCGU.isPending} className="px-3 py-1.5 text-sm bg-accent text-white rounded-md disabled:opacity-50">Create</button>
            <button onClick={() => setShowCGUForm(false)} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
          </div>
        </div>
      )}

      {showTestForm && (
        <div className="p-4 border rounded-lg bg-surface space-y-3">
          <h3 className="font-medium">New Impairment Test</h3>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <input type="date" value={testForm.testDate} onChange={(e) => setTestForm({ ...testForm, testDate: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <select value={testForm.assetType} onChange={(e) => setTestForm({ ...testForm, assetType: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              <option value="goodwill">Goodwill</option>
              <option value="intangible">Intangible</option>
              <option value="ppe">PP&E</option>
              <option value="investment">Investment</option>
            </select>
            <select value={testForm.cguId} onChange={(e) => setTestForm({ ...testForm, cguId: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              <option value="">No CGU</option>
              {(cgus ?? []).map((c) => <option key={c.id} value={c.id}>{c.cguName}</option>)}
            </select>
            <select value={testForm.method} onChange={(e) => setTestForm({ ...testForm, method: e.target.value })} className="border rounded px-2 py-1.5 text-sm">
              <option value="value_in_use">Value in Use</option>
              <option value="fair_value_less_costs">FV Less Costs</option>
            </select>
            <input placeholder="Carrying Amount" type="number" value={testForm.carryingAmount} onChange={(e) => setTestForm({ ...testForm, carryingAmount: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Recoverable Amount" type="number" value={testForm.recoverableAmount} onChange={(e) => setTestForm({ ...testForm, recoverableAmount: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateTest} disabled={createTest.isPending} className="px-3 py-1.5 text-sm bg-accent text-white rounded-md disabled:opacity-50">Create</button>
            <button onClick={() => setShowTestForm(false)} className="px-3 py-1.5 text-sm border rounded-md">Cancel</button>
          </div>
        </div>
      )}

      <div>
        <h2 className="text-lg font-semibold mb-2">CGUs</h2>
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
        <h2 className="text-lg font-semibold mb-2">Impairment Tests</h2>
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
              <button onClick={() => evaluateImpairment.mutate(r.id)} className="text-accent hover:underline text-xs">
                <Play className="w-3 h-3 inline mr-1" />Evaluate
              </button>
            )},
          ]}
        />
      </div>
    </div>
  );
}
