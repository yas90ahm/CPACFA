'use client';

import { useParams } from 'next/navigation';
import { useState } from 'react';
import { useBuildConsolidation } from '@/lib/queries/consolidation';
import { DataTable } from '@/components/shared/DataTable';
import type { ConsolidationEntity, EliminationRule, ConsolidationResult, ConsolidatedLine } from '@/lib/types/consolidation';
import { Plus, Play, GitMerge, CheckCircle, AlertTriangle } from 'lucide-react';

export default function ConsolidationPage() {
  const params = useParams();

  const buildConsolidation = useBuildConsolidation();

  const [entities, setEntities] = useState<ConsolidationEntity[]>([]);
  const [rules, setRules] = useState<EliminationRule[]>([]);
  const [reportingCurrency, setReportingCurrency] = useState('USD');
  const [periodLabel, setPeriodLabel] = useState('');
  const [result, setResult] = useState<ConsolidationResult | null>(null);

  const [entityForm, setEntityForm] = useState({ name: '', currency: 'USD' });
  const [ruleForm, setRuleForm] = useState<{ name: string; debitAccount: string; creditAccount: string; amountType: 'balance' | 'fixed' | 'formula'; amount: string }>({ name: '', debitAccount: '', creditAccount: '', amountType: 'balance', amount: '' });

  const addEntity = () => {
    const id = `entity-${Date.now()}`;
    setEntities([...entities, { id, name: entityForm.name, currency: entityForm.currency }]);
    setEntityForm({ name: '', currency: 'USD' });
  };

  const addRule = () => {
    const id = `rule-${Date.now()}`;
    setRules([...rules, {
      id, name: ruleForm.name, debitAccount: ruleForm.debitAccount, creditAccount: ruleForm.creditAccount,
      amountType: ruleForm.amountType, amount: ruleForm.amount ? Number(ruleForm.amount) : undefined,
    }]);
    setRuleForm({ name: '', debitAccount: '', creditAccount: '', amountType: 'balance', amount: '' });
  };

  const handleBuild = () => {
    buildConsolidation.mutate({
      entities,
      entityBalances: entities.map((e) => ({ entityId: e.id, lines: [] })),
      eliminationRules: rules,
      reportingCurrency,
      periodLabel,
    }, {
      onSuccess: (data) => setResult(data.result),
    });
  };

  const fmtNum = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

  type EliminationJE = ConsolidationResult['eliminationJournalEntries'][number];

  return (
    <div className="space-y-6">
      <h1 className="text-xl font-semibold flex items-center gap-2">
        <GitMerge className="w-5 h-5" /> Consolidation
      </h1>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 border rounded-lg bg-surface space-y-3">
          <h3 className="font-medium">Entities</h3>
          <div className="flex gap-2">
            <input placeholder="Entity Name" value={entityForm.name} onChange={(e) => setEntityForm({ ...entityForm, name: e.target.value })} className="border rounded px-2 py-1.5 text-sm flex-1" />
            <input placeholder="Currency" value={entityForm.currency} onChange={(e) => setEntityForm({ ...entityForm, currency: e.target.value })} className="border rounded px-2 py-1.5 text-sm w-20" />
            <button onClick={addEntity} disabled={!entityForm.name} className="px-3 py-1.5 text-sm border rounded-md hover:bg-hover disabled:opacity-50">
              <Plus className="w-4 h-4" />
            </button>
          </div>
          {entities.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-2 bg-hover rounded text-sm">
              <span>{e.name}</span>
              <span className="text-text-secondary">{e.currency}</span>
            </div>
          ))}
        </div>

        <div className="p-4 border rounded-lg bg-surface space-y-3">
          <h3 className="font-medium">Elimination Rules</h3>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Rule Name" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <select value={ruleForm.amountType} onChange={(e) => setRuleForm({ ...ruleForm, amountType: e.target.value as 'balance' | 'fixed' | 'formula' })} className="border rounded px-2 py-1.5 text-sm">
              <option value="balance">Balance</option>
              <option value="fixed">Fixed</option>
              <option value="formula">Formula</option>
            </select>
            <input placeholder="Debit Account" value={ruleForm.debitAccount} onChange={(e) => setRuleForm({ ...ruleForm, debitAccount: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            <input placeholder="Credit Account" value={ruleForm.creditAccount} onChange={(e) => setRuleForm({ ...ruleForm, creditAccount: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            {ruleForm.amountType === 'fixed' && (
              <input placeholder="Amount" type="number" value={ruleForm.amount} onChange={(e) => setRuleForm({ ...ruleForm, amount: e.target.value })} className="border rounded px-2 py-1.5 text-sm" />
            )}
          </div>
          <button onClick={addRule} disabled={!ruleForm.name || !ruleForm.debitAccount || !ruleForm.creditAccount} className="px-3 py-1.5 text-sm border rounded-md hover:bg-hover disabled:opacity-50">
            <Plus className="w-4 h-4 inline mr-1" /> Add Rule
          </button>
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-2 bg-hover rounded text-sm">
              <span>{r.name}</span>
              <span className="text-text-secondary">{r.debitAccount} / {r.creditAccount} ({r.amountType})</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-sm text-text-secondary mb-1">Reporting Currency</label>
          <input value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-24" />
        </div>
        <div>
          <label className="block text-sm text-text-secondary mb-1">Period Label</label>
          <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="2026-01-01..2026-01-31" className="border rounded px-2 py-1.5 text-sm w-56" />
        </div>
        <button onClick={handleBuild} disabled={buildConsolidation.isPending || entities.length === 0} className="flex items-center gap-1 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50">
          <Play className="w-4 h-4" /> {buildConsolidation.isPending ? 'Building...' : 'Run Consolidation'}
        </button>
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 border rounded-lg bg-surface">
              <div className="text-sm text-text-secondary">Balance Check</div>
              <div className="flex items-center gap-2">
                {result.balances ? <CheckCircle className="w-5 h-5 text-green-600" /> : <AlertTriangle className="w-5 h-5 text-red-600" />}
                <span className="text-lg font-semibold">{result.balances ? 'Balanced' : 'Imbalanced'}</span>
              </div>
              {result.roundingGap != null && <div className="text-sm text-text-secondary mt-1">Gap: {result.roundingGap.toFixed(2)}</div>}
            </div>
            {result.nciShareOfEquity != null && (
              <div className="p-4 border rounded-lg bg-surface">
                <div className="text-sm text-text-secondary">NCI \u2014 Equity</div>
                <div className="text-lg font-semibold">{fmtNum(result.nciShareOfEquity)}</div>
              </div>
            )}
            {result.nciShareOfNetIncome != null && (
              <div className="p-4 border rounded-lg bg-surface">
                <div className="text-sm text-text-secondary">NCI \u2014 Net Income</div>
                <div className="text-lg font-semibold">{fmtNum(result.nciShareOfNetIncome)}</div>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Consolidated Trial Balance</h2>
            <DataTable<ConsolidatedLine>
              rows={result.consolidatedLines}
              getRowId={(r) => `${r.accountName}-${r.side}`}
              columns={[
                { id: 'accountName', header: 'Account', cell: (r) => r.accountName },
                { id: 'amount', header: 'Amount', cell: (r) => fmtNum(r.amount) },
                { id: 'side', header: 'Side', cell: (r) => <span className={r.side === 'debit' ? 'text-blue-600' : 'text-green-600'}>{r.side}</span> },
                { id: 'source', header: 'Source', cell: (r) => <span className={`px-1.5 py-0.5 rounded text-xs ${r.source === 'elimination' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-600'}`}>{r.source}</span> },
              ]}
            />
          </div>

          {result.eliminationJournalEntries.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Elimination Journal Entries</h2>
              <DataTable<EliminationJE>
                rows={result.eliminationJournalEntries}
                getRowId={(r) => `${r.ruleId}-${r.debitAccount}`}
                columns={[
                  { id: 'debitAccount', header: 'Debit', cell: (r) => r.debitAccount },
                  { id: 'creditAccount', header: 'Credit', cell: (r) => r.creditAccount },
                  { id: 'amount', header: 'Amount', cell: (r) => fmtNum(r.amount) },
                  { id: 'ruleId', header: 'Rule', cell: (r) => r.ruleId },
                ]}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
