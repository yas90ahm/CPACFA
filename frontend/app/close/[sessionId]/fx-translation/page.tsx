'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslate, useRemeasure, useFxTranslationConfig, useSaveFxTranslationConfig } from '@/lib/queries/fx-translation';
import { DataTable } from '@/components/shared/DataTable';
import type { TranslationResult, RemeasurementResult, TranslationLine, TranslationResultLine } from '@/lib/types/fx-translation';
import { Globe, ArrowRightLeft, Check, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';
import { fmtMoney } from '@/lib/money';

export default function FxTranslationPage() {
  const params = useParams();
  const sessionId = params.sessionId as string;

  const translate = useTranslate();
  const remeasure = useRemeasure();
  const { data: configData, isLoading: configLoading } = useFxTranslationConfig(sessionId);
  const saveConfig = useSaveFxTranslationConfig(sessionId);

  const { user } = useAuth();
  const readOnly = isRoleReadOnly(user?.role ?? 'controller');

  const [tab, setTab] = useState<'translate' | 'remeasure'>('translate');
  const [reportingCurrency, setReportingCurrency] = useState('USD');
  const [closingRate, setClosingRate] = useState('');
  const [averageRate, setAverageRate] = useState('');
  const [historicRate, setHistoricRate] = useState('');
  const [sourceCurrency, setSourceCurrency] = useState('EUR');
  const [translationResult, setTranslationResult] = useState<TranslationResult | null>(null);
  const [remeasurementResult, setRemeasurementResult] = useState<RemeasurementResult | null>(null);
  const [loaded, setLoaded] = useState(false);

  const [lines, setLines] = useState<TranslationLine[]>([
    { label: '', amount: 0, currency: 'EUR', balanceType: 'monetary' },
  ]);

  // Load saved config on mount
  useEffect(() => {
    if (configData?.config && !loaded) {
      const c = configData.config;
      setTab((c.mode === 'remeasure' ? 'remeasure' : 'translate') as 'translate' | 'remeasure');
      setSourceCurrency(c.sourceCurrency ?? 'EUR');
      setReportingCurrency(c.reportingCurrency ?? 'USD');
      setClosingRate(c.closingRate ?? '');
      setAverageRate(c.averageRate ?? '');
      setHistoricRate(c.historicalRate ?? '');
      if (c.balanceLines && c.balanceLines.length > 0) setLines(c.balanceLines);
      setLoaded(true);
    } else if (configData && !configData.config && !loaded) {
      setLoaded(true);
    }
  }, [configData, loaded]);

  // Debounced auto-save
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const doSave = useCallback(() => {
    saveConfig.mutate({
      mode: tab,
      sourceCurrency,
      reportingCurrency,
      closingRate: closingRate || null,
      averageRate: averageRate || null,
      historicalRate: historicRate || null,
      balanceLines: lines,
    });
  }, [tab, sourceCurrency, reportingCurrency, closingRate, averageRate, historicRate, lines, saveConfig]);

  useEffect(() => {
    if (!loaded) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(doSave, 800);
    return () => { if (saveTimerRef.current) clearTimeout(saveTimerRef.current); };
  }, [tab, sourceCurrency, reportingCurrency, closingRate, averageRate, historicRate, lines, loaded, doSave]);

  const addLine = () => {
    setLines([...lines, { label: '', amount: 0, currency: sourceCurrency, balanceType: 'monetary' }]);
  };

  const updateLine = (idx: number, field: keyof TranslationLine, value: unknown) => {
    const updated = [...lines];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (updated[idx] as any)[field] = value;
    setLines(updated);
  };

  const buildFxRates = () => ({
    closing: closingRate ? { [sourceCurrency]: Number(closingRate) } : undefined,
    average: averageRate ? { [sourceCurrency]: Number(averageRate) } : undefined,
    historic: historicRate ? { [sourceCurrency]: Number(historicRate) } : undefined,
  });

  const handleTranslate = () => {
    translate.mutate({
      lines,
      reportingCurrency,
      fxRates: buildFxRates(),
    }, {
      onSuccess: (data) => setTranslationResult(data.result),
    });
  };

  const handleRemeasure = () => {
    remeasure.mutate({
      lines,
      functionalCurrency: reportingCurrency,
      fxRates: buildFxRates(),
    }, {
      onSuccess: (data) => setRemeasurementResult(data.result),
    });
  };

  const fmtNum = (n: number) => fmtMoney(n, { dash: false });

  if (configLoading) return <div style={{ color: 'var(--text-secondary)' }}>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Globe className="w-5 h-5" /> FX Translation
        </h1>
        <span className="text-xs flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
          {saveConfig.isPending && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
          {saveConfig.isSuccess && !saveConfig.isPending && <><Check className="w-3 h-3" style={{ color: 'var(--status-success)' }} /> Saved</>}
        </span>
      </div>

      <div className="flex gap-2">
        <button
          onClick={() => setTab('translate')}
          className={`px-3 py-1.5 text-sm rounded-md ${tab === 'translate' ? 'text-white' : 'hover:bg-hover'}`}
          style={tab === 'translate' ? { background: 'var(--interactive-primary)' } : { borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          Current-Rate Translation
        </button>
        <button
          onClick={() => setTab('remeasure')}
          className={`px-3 py-1.5 text-sm rounded-md ${tab === 'remeasure' ? 'text-white' : 'hover:bg-hover'}`}
          style={tab === 'remeasure' ? { background: 'var(--interactive-primary)' } : { borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid' }}
        >
          Temporal Remeasurement
        </button>
      </div>

      <div className="p-4 rounded-lg space-y-4" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
        <h3 className="font-medium">FX Rates</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Source Currency</label>
            <input value={sourceCurrency} onChange={(e) => setSourceCurrency(e.target.value)} className="rounded px-2 py-1.5 text-sm w-full" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Reporting Currency</label>
            <input value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value)} className="rounded px-2 py-1.5 text-sm w-full" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Closing Rate</label>
            <input type="number" step="0.0001" value={closingRate} onChange={(e) => setClosingRate(e.target.value)} className="rounded px-2 py-1.5 text-sm w-full" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Average Rate</label>
            <input type="number" step="0.0001" value={averageRate} onChange={(e) => setAverageRate(e.target.value)} className="rounded px-2 py-1.5 text-sm w-full" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
          </div>
          <div>
            <label className="block text-xs mb-1" style={{ color: 'var(--text-secondary)' }}>Historic Rate</label>
            <input type="number" step="0.0001" value={historicRate} onChange={(e) => setHistoricRate(e.target.value)} className="rounded px-2 py-1.5 text-sm w-full" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
          </div>
        </div>
      </div>

      <div className="p-4 rounded-lg space-y-3" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Balance Lines</h3>
          {!readOnly && <button onClick={addLine} className="text-sm hover:underline" style={{ color: 'var(--interactive-primary)' }}>+ Add Line</button>}
        </div>
        {lines.map((line, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="grid grid-cols-4 gap-2 flex-1">
              <input placeholder="Label" value={line.label} onChange={(e) => updateLine(idx, 'label', e.target.value)} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
              <input type="number" placeholder="Amount" value={line.amount || ''} onChange={(e) => updateLine(idx, 'amount', Number(e.target.value))} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
              <input placeholder="Currency" value={line.currency} onChange={(e) => updateLine(idx, 'currency', e.target.value)} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }} />
              <select value={line.balanceType ?? 'monetary'} onChange={(e) => updateLine(idx, 'balanceType', e.target.value)} className="rounded px-2 py-1.5 text-sm" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface-sunken)' }}>
                <option value="monetary">Monetary</option>
                <option value="nonmonetary">Non-monetary</option>
                <option value="equity">Equity</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            {!readOnly && lines.length > 1 && (
              <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="shrink-0" style={{ color: 'var(--text-tertiary)' }} title="Remove line">
                <X className="w-4 h-4" />
              </button>
            )}
          </div>
        ))}
      </div>

      {!readOnly && (
        <button
          onClick={tab === 'translate' ? handleTranslate : handleRemeasure}
          disabled={translate.isPending || remeasure.isPending}
          className="flex items-center gap-1 px-4 py-2 text-white rounded-md disabled:opacity-50"
          style={{ background: 'var(--interactive-primary)' }}
        >
          <ArrowRightLeft className="w-4 h-4" /> {tab === 'translate' ? 'Translate' : 'Remeasure'}
        </button>
      )}

      {tab === 'translate' && translationResult && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 rounded-lg" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Total Translated</div>
              <div className="text-lg font-semibold">{fmtNum(translationResult.totalTranslated)}</div>
            </div>
            <div className="p-4 rounded-lg" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
              <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>CTA (Equity)</div>
              <div className="text-lg font-semibold">{fmtNum(translationResult.cta)}</div>
            </div>
          </div>
          <DataTable<TranslationResultLine>
            rows={translationResult.lines}
            getRowId={(r) => r.label}
            columns={[
              { id: 'label', header: 'Account', cell: (r) => r.label },
              { id: 'originalAmount', header: 'Original', cell: (r) => fmtNum(r.originalAmount) },
              { id: 'currency', header: 'Currency', cell: (r) => r.currency },
              { id: 'rateType', header: 'Rate Type', cell: (r) => r.rateType },
              { id: 'translatedAmount', header: 'Translated', cell: (r) => fmtNum(r.translatedAmount) },
            ]}
          />
        </div>
      )}

      {tab === 'remeasure' && remeasurementResult && (
        <div className="space-y-3">
          <div className="p-4 rounded-lg" style={{ borderColor: 'var(--border-default)', borderWidth: '1px', borderStyle: 'solid', background: 'var(--bg-surface)' }}>
            <div className="text-sm" style={{ color: 'var(--text-secondary)' }}>Remeasurement Gain/Loss</div>
            <div
              className="text-lg font-semibold"
              style={{ color: remeasurementResult.remeasurementGainLoss >= 0 ? 'var(--status-success)' : 'var(--status-error)' }}
            >
              {fmtNum(remeasurementResult.remeasurementGainLoss)}
            </div>
          </div>
          <DataTable<TranslationResultLine>
            rows={remeasurementResult.lines}
            getRowId={(r) => r.label}
            columns={[
              { id: 'label', header: 'Account', cell: (r) => r.label },
              { id: 'originalAmount', header: 'Original', cell: (r) => fmtNum(r.originalAmount) },
              { id: 'currency', header: 'Currency', cell: (r) => r.currency },
              { id: 'rateType', header: 'Rate Type', cell: (r) => r.rateType },
              { id: 'translatedAmount', header: 'Translated', cell: (r) => fmtNum(r.translatedAmount) },
            ]}
          />
        </div>
      )}
    </div>
  );
}
