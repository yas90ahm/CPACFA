'use client';

import { useParams } from 'next/navigation';
import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslate, useRemeasure, useFxTranslationConfig, useSaveFxTranslationConfig } from '@/lib/queries/fx-translation';
import { DataTable } from '@/components/shared/DataTable';
import type { TranslationResult, RemeasurementResult, TranslationLine, TranslationResultLine } from '@/lib/types/fx-translation';
import { Globe, ArrowRightLeft, Check, Loader2, X } from 'lucide-react';
import { useAuth } from '@/lib/auth';
import { isReadOnly as isRoleReadOnly } from '@/lib/permissions';

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

  const fmtNum = (n: number) => n.toLocaleString(undefined, { minimumFractionDigits: 2 });

  if (configLoading) return <div className="text-text-secondary">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold flex items-center gap-2">
          <Globe className="w-5 h-5" /> FX Translation
        </h1>
        <span className="text-xs text-text-secondary flex items-center gap-1">
          {saveConfig.isPending && <><Loader2 className="w-3 h-3 animate-spin" /> Saving...</>}
          {saveConfig.isSuccess && !saveConfig.isPending && <><Check className="w-3 h-3 text-green-600" /> Saved</>}
        </span>
      </div>

      <div className="flex gap-2">
        <button onClick={() => setTab('translate')} className={`px-3 py-1.5 text-sm rounded-md ${tab === 'translate' ? 'bg-accent text-white' : 'border hover:bg-hover'}`}>
          Current-Rate Translation
        </button>
        <button onClick={() => setTab('remeasure')} className={`px-3 py-1.5 text-sm rounded-md ${tab === 'remeasure' ? 'bg-accent text-white' : 'border hover:bg-hover'}`}>
          Temporal Remeasurement
        </button>
      </div>

      <div className="p-4 border rounded-lg bg-surface space-y-4">
        <h3 className="font-medium">FX Rates</h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div>
            <label className="block text-xs text-text-secondary mb-1">Source Currency</label>
            <input value={sourceCurrency} onChange={(e) => setSourceCurrency(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Reporting Currency</label>
            <input value={reportingCurrency} onChange={(e) => setReportingCurrency(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Closing Rate</label>
            <input type="number" step="0.0001" value={closingRate} onChange={(e) => setClosingRate(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Average Rate</label>
            <input type="number" step="0.0001" value={averageRate} onChange={(e) => setAverageRate(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1">Historic Rate</label>
            <input type="number" step="0.0001" value={historicRate} onChange={(e) => setHistoricRate(e.target.value)} className="border rounded px-2 py-1.5 text-sm w-full" />
          </div>
        </div>
      </div>

      <div className="p-4 border rounded-lg bg-surface space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium">Balance Lines</h3>
          {!readOnly && <button onClick={addLine} className="text-sm text-accent hover:underline">+ Add Line</button>}
        </div>
        {lines.map((line, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <div className="grid grid-cols-4 gap-2 flex-1">
              <input placeholder="Label" value={line.label} onChange={(e) => updateLine(idx, 'label', e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
              <input type="number" placeholder="Amount" value={line.amount || ''} onChange={(e) => updateLine(idx, 'amount', Number(e.target.value))} className="border rounded px-2 py-1.5 text-sm" />
              <input placeholder="Currency" value={line.currency} onChange={(e) => updateLine(idx, 'currency', e.target.value)} className="border rounded px-2 py-1.5 text-sm" />
              <select value={line.balanceType ?? 'monetary'} onChange={(e) => updateLine(idx, 'balanceType', e.target.value)} className="border rounded px-2 py-1.5 text-sm">
                <option value="monetary">Monetary</option>
                <option value="nonmonetary">Non-monetary</option>
                <option value="equity">Equity</option>
                <option value="income">Income</option>
                <option value="expense">Expense</option>
              </select>
            </div>
            {!readOnly && lines.length > 1 && (
              <button type="button" onClick={() => setLines(lines.filter((_, i) => i !== idx))} className="text-text-tertiary hover:text-red-600 shrink-0" title="Remove line">
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
          className="flex items-center gap-1 px-4 py-2 bg-accent text-white rounded-md hover:bg-accent/90 disabled:opacity-50"
        >
          <ArrowRightLeft className="w-4 h-4" /> {tab === 'translate' ? 'Translate' : 'Remeasure'}
        </button>
      )}

      {tab === 'translate' && translationResult && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-4">
            <div className="p-4 border rounded-lg bg-surface">
              <div className="text-sm text-text-secondary">Total Translated</div>
              <div className="text-lg font-semibold">{fmtNum(translationResult.totalTranslated)}</div>
            </div>
            <div className="p-4 border rounded-lg bg-surface">
              <div className="text-sm text-text-secondary">CTA (Equity)</div>
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
          <div className="p-4 border rounded-lg bg-surface">
            <div className="text-sm text-text-secondary">Remeasurement Gain/Loss</div>
            <div className={`text-lg font-semibold ${remeasurementResult.remeasurementGainLoss >= 0 ? 'text-green-600' : 'text-red-600'}`}>
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
