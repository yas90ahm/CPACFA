'use client';

import * as React from 'react';
import { DiagnosticThoughtStream } from './DiagnosticThoughtStream';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

type IntegrityState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'ready'; balanceSheet?: unknown; profitAndLoss?: unknown }
  | { status: 'self_healing'; imbalanceAmount?: number; message?: string; sessionId?: string | null }
  | { status: 'kill_switch'; message: string; imbalanceAmount?: number; check?: string; details?: unknown };

interface TrialBalanceEntryLike {
  accountName?: string;
  debit?: number;
  credit?: number;
  accountCode?: string;
}

export default function DiagnosticsPage() {
  const [file, setFile] = React.useState<File | null>(null);
  const [uploadStatus, setUploadStatus] = React.useState<'idle' | 'uploading' | 'ok' | 'error'>('idle');
  const [uploadError, setUploadError] = React.useState<string | null>(null);
  const [supervisorSessionId, setSupervisorSessionId] = React.useState<string | null>(null);
  const [integrity, setIntegrity] = React.useState<IntegrityState>({ status: 'idle' });

  const fileInputRef = React.useRef<HTMLInputElement>(null);

  // After self-healing window (60s), show final Red Alert if imbalance still exists. Keeps polling active until then.
  React.useEffect(() => {
    if (integrity.status !== 'self_healing') return;
    const t = setTimeout(() => {
      setIntegrity((prev) => {
        if (prev.status !== 'self_healing') return prev;
        return {
          status: 'kill_switch',
          message: prev.message ?? 'Mathematical integrity error',
          imbalanceAmount: prev.imbalanceAmount,
          check: undefined,
          details: undefined,
        };
      });
    }, 60_000);
    return () => clearTimeout(t);
  }, [integrity.status]);

  const triggerIngestThenSupervisor = React.useCallback(async (selectedFile: File) => {
    setUploadStatus('uploading');
    setUploadError(null);
    setIntegrity({ status: 'loading' });
    setSupervisorSessionId(null);

    try {
      const form = new FormData();
      form.append('file', selectedFile);
      form.append('tenantId', 'test-tenant-uuid');
      form.append('sessionId', 'lab-session-uuid');

      const ingestRes = await fetch(`${API_BASE}/api/trial-balance/ingest`, {
        method: 'POST',
        body: form,
        headers: { Accept: 'application/json' },
      });

      const ingestJson = await ingestRes.json().catch(() => ({}));

      if (ingestRes.status === 422) {
        setUploadStatus('ok');
        setUploadError(null);
        setIntegrity({
          status: 'self_healing',
          imbalanceAmount: ingestJson.imbalanceAmount,
          message: ingestJson.message ?? 'Trial balance does not balance',
          sessionId: null,
        });
        return;
      }

      if (!ingestRes.ok) {
        setUploadStatus('error');
        setUploadError(ingestJson.message ?? ingestJson.error ?? `Ingest failed: ${ingestRes.status}`);
        setIntegrity({ status: 'idle' });
        return;
      }

      const trialBalance = ingestJson.trialBalance as { entries?: TrialBalanceEntryLike[] } | undefined;
      const entries = trialBalance?.entries ?? [];
      const raw_rows = entries.map((e: TrialBalanceEntryLike) => ({
        accountName: e.accountName ?? '',
        debit: Number(e.debit) || 0,
        credit: Number(e.credit) || 0,
        accountCode: e.accountCode,
      }));

      setUploadStatus('ok');

      const chatRes = await fetch(`${API_BASE}/api/supervisor/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          message: 'Full Audit & Statement Build',
          raw_rows,
        }),
      });

      const chatJson = await chatRes.json().catch(() => ({}));

      if (chatRes.status === 422) {
        if (chatJson.sessionId) setSupervisorSessionId(chatJson.sessionId);
        setIntegrity({
          status: 'self_healing',
          imbalanceAmount: chatJson.imbalanceAmount,
          message: chatJson.message ?? 'Mathematical integrity error',
          sessionId: chatJson.sessionId ?? null,
        });
        return;
      }

      if (!chatRes.ok) {
        setIntegrity({ status: 'idle' });
        setUploadError(chatJson.message ?? chatJson.error ?? `Supervisor failed: ${chatRes.status}`);
        if (chatJson.sessionId) setSupervisorSessionId(chatJson.sessionId);
        return;
      }

      if (chatJson.sessionId) setSupervisorSessionId(chatJson.sessionId);

      const pipelineResult = chatJson.pipelineResult;
      const bs = pipelineResult?.balanceSheet ?? ingestJson.balanceSheet;
      const pl = pipelineResult?.profitAndLoss ?? ingestJson.profitAndLoss ?? pipelineResult?.profitAndLoss;

      setIntegrity({
        status: 'ready',
        balanceSheet: bs,
        profitAndLoss: pl,
      });
    } catch (e) {
      setUploadStatus('error');
      setUploadError(e instanceof Error ? e.message : 'Request failed');
      setIntegrity({ status: 'idle' });
    }
  }, []);

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) {
      setFile(f);
      setUploadError(null);
    }
  };

  const onUploadClick = () => {
    if (file) triggerIngestThenSupervisor(file);
  };

  return (
    <div style={{ maxWidth: 960, margin: '0 auto', padding: 24, fontFamily: 'system-ui, sans-serif' }}>
      <h1 style={{ fontSize: 20, fontWeight: 700, marginBottom: 8 }}>Headless Diagnostic HUD</h1>
      <p style={{ fontSize: 13, color: '#64748b', marginBottom: 24 }}>
        Lab: verify the brain — ingestion → Full Audit & Statement Build → reasoning stream &amp; integrity.
      </p>

      {/* Ingestion trigger */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>1. Ingestion trigger</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv,.xlsx,.xls"
            onChange={onFileChange}
            style={{ fontSize: 13 }}
          />
          <button
            type="button"
            onClick={onUploadClick}
            disabled={!file || uploadStatus === 'uploading'}
            style={{
              padding: '8px 16px',
              fontSize: 13,
              fontWeight: 600,
              border: '1px solid #0f766e',
              borderRadius: 6,
              backgroundColor: '#0f766e',
              color: '#fff',
              cursor: file && uploadStatus !== 'uploading' ? 'pointer' : 'not-allowed',
            }}
          >
            {uploadStatus === 'uploading' ? 'Uploading…' : 'Upload & run Full Audit'}
          </button>
        </div>
        {uploadError && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#b91c1c' }}>{uploadError}</p>
        )}
        {uploadStatus === 'ok' && (
          <p style={{ marginTop: 8, fontSize: 13, color: '#0f766e' }}>Ingest OK → Supervisor run started.</p>
        )}
      </section>

      {/* Integrity panel */}
      <section style={{ marginBottom: 24 }}>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>2. Mathematical status</h2>
        {integrity.status === 'idle' && (
          <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 6, color: '#64748b', fontSize: 13 }}>
            No run yet. Upload a file and run Full Audit.
          </div>
        )}
        {integrity.status === 'loading' && (
          <div style={{ padding: 12, border: '1px solid #e2e8f0', borderRadius: 6, color: '#64748b', fontSize: 13 }}>
            Running…
          </div>
        )}
        {integrity.status === 'self_healing' && (
          <div
            style={{
              padding: 16,
              border: '2px solid #ca8a04',
              borderRadius: 6,
              backgroundColor: '#fefce8',
              color: '#854d0e',
            }}
          >
            <strong>Self-Healing</strong>
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>
              Math imbalance of {integrity.imbalanceAmount != null ? integrity.imbalanceAmount.toLocaleString() : '—'} detected. The Agent is now attempting to re-analyze the ledger per ASC 842 and Forensic rules.
            </p>
            <p style={{ marginTop: 6, fontSize: 12, color: '#a16207' }}>
              Watch the reasoning stream below for new Thought cards. Red Alert will only appear if the imbalance persists after the agent&apos;s extra iterations (60s).
            </p>
          </div>
        )}
        {integrity.status === 'kill_switch' && (
          <div
            style={{
              padding: 16,
              border: '2px solid #b91c1c',
              borderRadius: 6,
              backgroundColor: '#fef2f2',
              color: '#991b1b',
            }}
          >
            <strong>Red alert — Kill Switch (422)</strong>
            <p style={{ margin: '8px 0 0', fontSize: 13 }}>{integrity.message}</p>
            {integrity.imbalanceAmount != null && (
              <p style={{ marginTop: 4, fontSize: 13 }}>Imbalance amount: {integrity.imbalanceAmount}</p>
            )}
            {integrity.check && (
              <p style={{ marginTop: 4, fontSize: 12 }}>Check: {integrity.check}</p>
            )}
          </div>
        )}
        {integrity.status === 'ready' && (
          <div>
            <div
              style={{
                display: 'inline-block',
                padding: '6px 12px',
                borderRadius: 6,
                backgroundColor: '#dcfce7',
                color: '#166534',
                fontWeight: 600,
                fontSize: 13,
                marginBottom: 12,
              }}
            >
              AUDIT READY
            </div>
            {(integrity.balanceSheet != null || integrity.profitAndLoss != null) && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                {integrity.balanceSheet != null && (
                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>Balance Sheet</h3>
                    <RawTable data={integrity.balanceSheet} />
                  </div>
                )}
                {integrity.profitAndLoss != null && (
                  <div>
                    <h3 style={{ fontSize: 12, fontWeight: 600, marginBottom: 6 }}>P&amp;L</h3>
                    <RawTable data={integrity.profitAndLoss} />
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </section>

      {/* Reasoning stream */}
      <section>
        <h2 style={{ fontSize: 14, fontWeight: 600, marginBottom: 8 }}>3. Reasoning stream</h2>
        <DiagnosticThoughtStream sessionId={supervisorSessionId} />
      </section>
    </div>
  );
}

function RawTable({ data }: { data: unknown }) {
  if (data == null || typeof data !== 'object') return <pre style={{ fontSize: 12 }}>{JSON.stringify(data)}</pre>;
  const obj = data as Record<string, unknown>;
  const rows: Array<{ line: string; amount: number | string }> = [];
  const line = (r: { label?: string; name?: string; amount?: number }) => r.label ?? r.name ?? '—';
  const amt = (r: { amount?: number }) => (typeof r.amount === 'number' ? r.amount : 0);

  if (Array.isArray(obj.assets)) {
    (obj.assets as Array<{ label?: string; amount?: number }>).forEach((r) => rows.push({ line: line(r), amount: amt(r) }));
  }
  if (Array.isArray(obj.liabilities)) {
    (obj.liabilities as Array<{ label?: string; amount?: number }>).forEach((r) => rows.push({ line: line(r), amount: amt(r) }));
  }
  if (Array.isArray(obj.equity)) {
    (obj.equity as Array<{ label?: string; amount?: number }>).forEach((r) => rows.push({ line: line(r), amount: amt(r) }));
  }
  if (typeof obj.totalAssets === 'number') rows.push({ line: 'Total Assets', amount: obj.totalAssets });
  if (typeof obj.totalLiabilities === 'number') rows.push({ line: 'Total Liabilities', amount: obj.totalLiabilities });
  if (typeof obj.totalEquity === 'number') rows.push({ line: 'Total Equity', amount: obj.totalEquity });

  if (Array.isArray(obj.revenue)) {
    (obj.revenue as Array<{ label?: string; amount?: number }>).forEach((r) => rows.push({ line: line(r), amount: amt(r) }));
  }
  if (Array.isArray(obj.expenses)) {
    (obj.expenses as Array<{ label?: string; amount?: number }>).forEach((r) => rows.push({ line: line(r), amount: amt(r) }));
  }
  if (typeof obj.totalRevenue === 'number') rows.push({ line: 'Total Revenue', amount: obj.totalRevenue });
  if (typeof obj.netIncome === 'number') rows.push({ line: 'Net Income', amount: obj.netIncome });

  if (rows.length === 0) return <pre style={{ fontSize: 11, overflow: 'auto' }}>{JSON.stringify(data, null, 2)}</pre>;

  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
      <thead>
        <tr style={{ borderBottom: '1px solid #e2e8f0' }}>
          <th style={{ textAlign: 'left', padding: 6 }}>Line</th>
          <th style={{ textAlign: 'right', padding: 6 }}>Amount</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
            <td style={{ padding: 6 }}>{r.line}</td>
            <td style={{ padding: 6, textAlign: 'right' }}>
              {typeof r.amount === 'number' ? r.amount.toLocaleString() : String(r.amount)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
