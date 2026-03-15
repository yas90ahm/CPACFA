'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useBuildConsolidation, useConsolidationConfig, useSaveConsolidationConfig } from '@/lib/queries/consolidation';
import { DataTable } from '@/components/shared/DataTable';
import type { ConsolidationEntity, EliminationRule, ConsolidationResult, ConsolidatedLine } from '@/lib/types/consolidation';
import { Plus, Play, GitMerge, CheckCircle, AlertTriangle, Check, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { fmtMoney } from '@/lib/money';

export default function ConsolidationPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const buildConsolidation = useBuildConsolidation();
  const { data: configData, isLoading: configLoading } = useConsolidationConfig(sessionId);
  const saveConfig = useSaveConsolidationConfig(sessionId);

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [entities, setEntities] = useState<ConsolidationEntity[]>([]);
  const [rules, setRules] = useState<EliminationRule[]>([]);
  const [reportingCurrency, setReportingCurrency] = useState('USD');
  const [periodLabel, setPeriodLabel] = useState('');
  const [result, setResult] = useState<ConsolidationResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [entityForm, setEntityForm] = useState({ name: '', currency: 'USD' });
  const [ruleForm, setRuleForm] = useState<{ name: string; debitAccount: string; creditAccount: string; amountType: 'balance' | 'fixed' | 'formula'; amount: string }>({ name: '', debitAccount: '', creditAccount: '', amountType: 'balance', amount: '' });

  // Load saved config on mount
  useEffect(() => {
    if (configData?.config && !loaded) {
      setEntities(configData.config.entities ?? []);
      setRules(configData.config.eliminationRules ?? []);
      setReportingCurrency(configData.config.reportingCurrency ?? 'USD');
      setPeriodLabel(configData.config.periodLabel ?? '');
      setLoaded(true);
    } else if (configData && !configData.config && !loaded) {
      setLoaded(true);
    }
  }, [configData, loaded]);

  // Debounced auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSave = useCallback(() => {
    saveConfig.mutate({ entities, eliminationRules: rules, reportingCurrency, periodLabel });
  }, [entities, rules, reportingCurrency, periodLabel, saveConfig]);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSave, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [entities, rules, reportingCurrency, periodLabel, loaded, doSave]);

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

  const fmtNum = (n: number) => fmtMoney(n, { dash: false });

  type EliminationJE = ConsolidationResult['eliminationJournalEntries'][number];

  if (configLoading) return <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <GitMerge className="w-5 h-5" /> Consolidation
        </h1>
        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
          {saveConfig.isPending && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
          {saveConfig.isSuccess && !saveConfig.isPending && <><Check className="w-3 h-3" style={{ color: 'var(--status-success)' }} /> Saved</>}
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-4 rounded-lg space-y-3" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium">Entities</h3>
          <div className="flex gap-2">
            <input placeholder="Entity Name" value={entityForm.name} onChange={(e) => setEntityForm({ ...entityForm, name: e.target.value })} className="rounded px-2 py-1.5 text-sm flex-1" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
            <input placeholder="Currency" value={entityForm.currency} onChange={(e) => setEntityForm({ ...entityForm, currency: e.target.value })} className="rounded px-2 py-1.5 text-sm w-20" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
            {!readOnly && (
              <button onClick={addEntity} disabled={!entityForm.name} className="px-3 py-1.5 text-sm rounded-md hover:bg-hover disabled:opacity-50" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
                <Plus className="w-4 h-4" />
              </button>
            )}
          </div>
          {entities.map((e) => (
            <div key={e.id} className="flex items-center justify-between p-2 bg-hover rounded text-sm group">
              <span>{e.name}</span>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>{e.currency}</span>
                {!readOnly && (
                  <button type="button" onClick={() => setEntities(entities.filter((x) => x.id !== e.id))} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-tertiary)' }} title="Remove entity">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>

        <div className="p-4 rounded-lg space-y-3" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
          <h3 className="font-medium">Elimination Rules</h3>
          <div className="grid grid-cols-2 gap-2">
            <input placeholder="Rule Name" value={ruleForm.name} onChange={(e) => setRuleForm({ ...ruleForm, name: e.target.value })} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
            <select value={ruleForm.amountType} onChange={(e) => setRuleForm({ ...ruleForm, amountType: e.target.value as 'balance' | 'fixed' | 'formula' })} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }}>
              <option value="balance">Balance</option>
              <option value="fixed">Fixed</option>
              <option value="formula">Formula</option>
            </select>
            <input placeholder="Debit Account" value={ruleForm.debitAccount} onChange={(e) => setRuleForm({ ...ruleForm, debitAccount: e.target.value })} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
            <input placeholder="Credit Account" value={ruleForm.creditAccount} onChange={(e) => setRuleForm({ ...ruleForm, creditAccount: e.target.value })} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
            {ruleForm.amountType === 'fixed' && (
              <input placeholder="Amount" type="number" value={ruleForm.amount} onChange={(e) => setRuleForm({ ...ruleForm, amount: e.target.value })} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
            )}
          </div>
          {!readOnly && (
            <button onClick={addRule} disabled={!ruleForm.name || !ruleForm.debitAccount || !ruleForm.creditAccount} className="px-3 py-1.5 text-sm rounded-md hover:bg-hover disabled:opacity-50" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}>
              <Plus className="w-4 h-4 inline mr-1" /> Add Rule
            </button>
          )}
          {rules.map((r) => (
            <div key={r.id} className="flex items-center justify-between p-2 bg-hover rounded text-sm group">
              <span>{r.name}</span>
              <div className="flex items-center gap-2">
                <span style={{ color: 'var(--text-secondary)' }}>{r.debitAccount} / {r.creditAccount} ({r.amountType})</span>
                {!readOnly && (
                  <button type="button" onClick={() => setRules(rules.filter((x) => x.id !== r.id))} className="opacity-0 group-hover:opacity-100 transition-opacity" style={{ color: 'var(--text-tertiary)' }} title="Remove rule">
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-end gap-3">
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Reporting Currency</label>
          <input value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value)} className="rounded px-2 py-1.5 text-sm w-24" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
        </div>
        <div>
          <label className="block text-sm mb-1" style={{ color: 'var(--text-secondary)' }}>Period Label</label>
          <input value={periodLabel} onChange={(e) => setPeriodLabel(e.target.value)} placeholder="2026-01-01..2026-01-31" className="rounded px-2 py-1.5 text-sm w-56" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
        </div>
        {!readOnly && (
          <button onClick={handleBuild} disabled={buildConsolidation.isPending || entities.length === 0} className="flex items-center gap-1 px-4 py-2 text-white rounded-md disabled:opacity-50" style={{ background: 'var(--interactive-primary)' }}>
            <Play className="w-4 h-4" /> {buildConsolidation.isPending ? 'Building...' : 'Run Consolidation'}
          </button>
        )}
      </div>

      {result && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-lg" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Balance Check</div>
              <div className="flex items-center gap-2">
                {result.balances ? <CheckCircle className="w-5 h-5" style={{ color: 'var(--status-success)' }} /> : <AlertTriangle className="w-5 h-5" style={{ color: 'var(--status-error)' }} />}
                <span className="text-lg font-semibold">{result.balances ? 'Balanced' : 'Imbalanced'}</span>
              </div>
              {result.roundingGap != null && <div className="text-sm mt-1" style={{ color: 'var(--text-secondary)' }}>Gap: {result.roundingGap.toFixed(2)}</div>}
            </div>
            {result.nciShareOfEquity != null && (
              <div className="p-4 rounded-lg" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>NCI — Equity</div>
                <div className="text-lg font-semibold">{fmtNum(result.nciShareOfEquity)}</div>
              </div>
            )}
            {result.nciShareOfNetIncome != null && (
              <div className="p-4 rounded-lg" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
                <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>NCI — Net Income</div>
                <div className="text-lg font-semibold">{fmtNum(result.nciShareOfNetIncome)}</div>
              </div>
            )}
          </div>

          <div>
            <h2 className="text-lg font-semibold mb-2">Consolidated Trial Balance</h2>
            <DataTable<ConsolidatedLine>
              rows={result.consolidatedLines ?? []}
              getRowId={(r) => `${r.accountName}-${r.side}`}
              columns={[
                { id: 'accountName', header: 'Account', cell: (r) => r.accountName },
                { id: 'amount', header: 'Amount', cell: (r) => fmtNum(r.amount) },
                { id: 'side', header: 'Side', cell: (r) => <span style={{ color: r.side === 'debit' ? 'var(--status-info)' : 'var(--status-success)' }}>{r.side}</span> },
                { id: 'source', header: 'Source', cell: (r) => <span className="px-1.5 py-0.5 rounded text-xs" style={r.source === 'elimination' ? { background: 'var(--status-error-bg)', color: 'var(--status-error)' } : { background: 'var(--status-neutral-bg)', color: 'var(--text-tertiary)' }}>{r.source}</span> },
              ]}
            />
          </div>

          {(result.eliminationJournalEntries ?? []).length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-2">Elimination Journal Entries</h2>
              <DataTable<EliminationJE>
                rows={result.eliminationJournalEntries ?? []}
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
