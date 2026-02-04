'use client';

import * as React from 'react';

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';

export interface ReasoningLogEntry {
  stepType: 'thought' | 'tool';
  timestamp: string;
  thought?: string;
  toolName?: string;
  toolInput?: Record<string, unknown>;
  toolResult?: string | Record<string, unknown>;
  rawDataSeen?: unknown;
  ruleApplied?: string;
  verificationResult?: { passed: boolean; checks: string[] };
}

interface TraceResponse {
  reasoningLogs: ReasoningLogEntry[];
  stagingItems?: unknown[];
}

/** Highlight GAAP/IFRS citations (e.g. ASC 842, IFRS 16) in blue. */
function highlightCitations(text: string): React.ReactNode {
  if (!text || typeof text !== 'string') return text;
  const pattern = /(ASC\s*\d+(?:-\d+-\d+)?|IFRS\s*\d+(?:\.\d+)?|IAS\s*\d+(?:\.\d+)?|GAAP\s*(?:ASC\s*)?\d*)/gi;
  const parts: React.ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  const re = new RegExp(pattern.source, 'gi');
  while ((m = re.exec(text)) !== null) {
    if (m.index > lastIndex) {
      parts.push(text.slice(lastIndex, m.index));
    }
    parts.push(
      <span key={m.index} style={{ color: '#2563eb', fontWeight: 600 }}>
        {m[0]}
      </span>
    );
    lastIndex = re.lastIndex;
  }
  if (lastIndex < text.length) parts.push(text.slice(lastIndex));
  return parts.length > 0 ? <>{parts}</> : text;
}

export function DiagnosticThoughtStream({
  sessionId,
  tenantId,
}: {
  sessionId: string | null;
  tenantId?: string;
}) {
  const [logs, setLogs] = React.useState<ReasoningLogEntry[]>([]);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!sessionId) return;
    let cancelled = false;
    const traceUrl = `${API_BASE}/api/supervisor/session/${encodeURIComponent(sessionId)}/trace${tenantId ? `?tenantId=${encodeURIComponent(tenantId)}` : ''}`;

    const poll = async () => {
      try {
        const res = await fetch(traceUrl, {
          headers: { Accept: 'application/json' },
        });
        if (cancelled) return;
        if (!res.ok) {
          setError(res.status === 400 ? 'Session/tenant context required' : `Trace failed: ${res.status}`);
          return;
        }
        const data = (await res.json()) as TraceResponse;
        setLogs(data.reasoningLogs ?? []);
        setError(null);
      } catch (e) {
        if (!cancelled) setError(e instanceof Error ? e.message : 'Failed to fetch trace');
      }
    };

    poll();
    const interval = setInterval(poll, 2000);
    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, tenantId]);

  if (!sessionId) {
    return (
      <div style={{ padding: 12, color: '#64748b' }}>
        No session. Upload a file and run Full Audit to start the reasoning stream.
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ padding: 12, color: '#b91c1c' }}>
        {error}
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ fontSize: 12, color: '#64748b', marginBottom: 4 }}>
        Polling /api/supervisor/session/{sessionId}/trace every 2s · {logs.length} step(s)
      </div>
      {logs.length === 0 && (
        <div style={{ padding: 12, color: '#64748b' }}>No reasoning steps yet. Run Full Audit to populate.</div>
      )}
      {logs.map((entry, i) => (
        <div
          key={i}
          style={{
            border: '1px solid #e2e8f0',
            borderRadius: 6,
            padding: 12,
            backgroundColor: entry.stepType === 'tool' ? '#f8fafc' : '#fff',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
            <span
              style={{
                fontSize: 11,
                fontWeight: 600,
                textTransform: 'uppercase',
                color: entry.stepType === 'thought' ? '#0f766e' : '#7c3aed',
              }}
            >
              {entry.stepType === 'thought' ? 'Thought' : 'Action'}
            </span>
            {entry.toolName && (
              <span style={{ fontSize: 12, color: '#475569' }}>{entry.toolName}</span>
            )}
            <span style={{ fontSize: 11, color: '#94a3b8', marginLeft: 'auto' }}>
              {entry.timestamp ? new Date(entry.timestamp).toLocaleTimeString() : '—'}
            </span>
          </div>
          <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
            {entry.stepType === 'thought' && entry.thought != null
              ? highlightCitations(String(entry.thought))
              : entry.stepType === 'tool' && (entry.toolResult != null || entry.toolName)
                ? (
                    <>
                      {entry.toolName && <strong>{entry.toolName}</strong>}
                      {entry.toolResult != null && (
                        <span>
                          {' — '}
                          {typeof entry.toolResult === 'string'
                            ? highlightCitations(entry.toolResult)
                            : JSON.stringify(entry.toolResult)}
                        </span>
                      )}
                    </>
                  )
                : '—'}
          </div>
          {entry.ruleApplied && (
            <div style={{ marginTop: 6, fontSize: 11, color: '#64748b' }}>
              Rule: {highlightCitations(entry.ruleApplied)}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
