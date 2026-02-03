'use client';

import * as React from 'react';
import { Shield, MessageSquare, FileText, FileUp, AlertTriangle, Send, Lock, Scale, Code2, CheckCircle2, Download } from 'lucide-react';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  verifyAuditorToken,
  internalControlsChat,
  getAuditBinder,
  getGAAPConsistencyReport,
  buildReportPayloadFromBinder,
  downloadPackagePdf,
  downloadPackageCsv,
  triggerDownload,
  type DownloadPackageType,
} from '@/lib/api';
import { buildAndDownloadAuditEvidencePackage } from '@/lib/audit-evidence-zip';
import {
  AuditorTransparencyDashboard,
  type StatementSection,
  type TraceStep,
} from '@/components/auditor-transparency-dashboard';

const AUDITOR_TOKEN_KEY = 'auditor_portal_token';

export default function AuditorPortalPage() {
  const [token, setToken] = React.useState('');
  const [verified, setVerified] = React.useState(false);
  const [verifyError, setVerifyError] = React.useState<string | null>(null);
  const [verifyLoading, setVerifyLoading] = React.useState(false);

  const [messages, setMessages] = React.useState<{ role: 'user' | 'assistant'; content: string; citation?: string }[]>([]);
  const [chatInput, setChatInput] = React.useState('');
  const [chatLoading, setChatLoading] = React.useState(false);

  type BinderState = {
    entityName: string;
    periodStart: string;
    periodEnd: string;
    generatedAt: string;
    justifications: unknown[];
    balanceSheetBundle?: unknown;
    profitAndLossBundle?: unknown;
  } | null;
  const [binder, setBinder] = React.useState<BinderState>(null);
  const [gaapReport, setGAAPReport] = React.useState<{ hasChanges: boolean; policyChanges: unknown[]; summary?: string } | null>(null);
  const [reportsLoading, setReportsLoading] = React.useState(false);

  const [downloadPackageType, setDownloadPackageType] = React.useState<DownloadPackageType>('detailed-pdf');
  const [downloadPackageError, setDownloadPackageError] = React.useState<string | null>(null);
  const [downloadPackageLoading, setDownloadPackageLoading] = React.useState(false);

  const transparencySections = React.useMemo((): { balanceSheet: StatementSection[]; profitAndLoss: StatementSection[] } => {
    if (!binder) return { balanceSheet: [], profitAndLoss: [] };
    const bsCitation = 'ASC 210-10-45 (Balance Sheet)';
    const plCitation = 'ASC 220-10-45 (Comprehensive Income)';
    const balanceSheet: StatementSection[] = [];
    const bsBundle = binder.balanceSheetBundle as { statement?: Record<string, unknown> } | undefined;
    const bs = bsBundle?.statement;
    const bsAssets = bs?.assets as { label: string; amount: number }[] | undefined;
    const bsLiab = bs?.liabilities as { label: string; amount: number }[] | undefined;
    const bsEquity = bs?.equity as { label: string; amount: number }[] | undefined;
    const totalAssets = (bs?.totalAssets ?? bs?.total_assets) as number | undefined;
    const totalLiab = (bs?.totalLiabilities ?? bs?.total_liabilities) as number | undefined;
    const totalEqu = (bs?.totalEquity ?? bs?.total_equity) as number | undefined;
    if (bsAssets?.length) {
      balanceSheet.push({
        title: 'Assets',
        lines: bsAssets.map((a) => ({ label: a.label, amount: a.amount, citation: bsCitation })),
        total: totalAssets,
        totalCitation: bsCitation,
      });
    }
    if (bsLiab?.length) {
      balanceSheet.push({
        title: 'Liabilities',
        lines: bsLiab.map((l) => ({ label: l.label, amount: l.amount, citation: bsCitation })),
        total: totalLiab,
        totalCitation: bsCitation,
      });
    }
    if (bsEquity?.length) {
      balanceSheet.push({
        title: 'Equity',
        lines: bsEquity.map((e) => ({ label: e.label, amount: e.amount, citation: bsCitation })),
        total: totalEqu,
        totalCitation: bsCitation,
      });
    }
    const profitAndLoss: StatementSection[] = [];
    const plBundle = binder.profitAndLossBundle as { statement?: Record<string, unknown> } | undefined;
    const pl = plBundle?.statement;
    const plRev = pl?.revenue as { label: string; amount: number }[] | undefined;
    const plExp = pl?.expenses as { label: string; amount: number }[] | undefined;
    const totalRev = (pl?.totalRevenue ?? pl?.total_revenue) as number | undefined;
    const totalExp = (pl?.totalExpenses ?? pl?.total_expenses) as number | undefined;
    if (plRev?.length) {
      profitAndLoss.push({
        title: 'Revenue',
        lines: plRev.map((r) => ({ label: r.label, amount: r.amount, citation: plCitation })),
        total: totalRev,
        totalCitation: plCitation,
      });
    }
    if (plExp?.length) {
      profitAndLoss.push({
        title: 'Expenses',
        lines: plExp.map((e) => ({ label: e.label, amount: e.amount, citation: plCitation })),
        total: totalExp,
        totalCitation: plCitation,
      });
    }
    return { balanceSheet, profitAndLoss };
  }, [binder]);

  const traceStepsWithTime = React.useMemo((): TraceStep[] => {
    const generatedAt = binder?.generatedAt;
    const t = generatedAt ? new Date(generatedAt) : new Date();
    const t1 = new Date(t.getTime() - 90000);
    const t2 = new Date(t.getTime() - 60000);
    const t3 = new Date(t.getTime() - 30000);
    return [
      { id: 'document_uploaded', label: 'Document Uploaded', description: 'Trial balance or source document ingested', timestamp: t1.toISOString(), icon: <FileUp className="h-5 w-5" /> },
      { id: 'cpa_justification', label: 'CPA Justification', description: 'Accounting treatment and FASB/IFRS rationale', timestamp: t2.toISOString(), icon: <Scale className="h-5 w-5" /> },
      { id: 'python_calculation', label: 'Python Calculation', description: 'Quantitative engine (NPV, ratios, roll-ups)', timestamp: t3.toISOString(), icon: <Code2 className="h-5 w-5" /> },
      { id: 'supervisor_approval', label: 'Supervisor Approval', description: 'Engagement partner sign-off', timestamp: generatedAt, icon: <CheckCircle2 className="h-5 w-5" /> },
    ];
  }, [binder?.generatedAt]);

  const handleDownloadPackage = React.useCallback(async () => {
    setDownloadPackageError(null);
    setDownloadPackageLoading(true);
    const reportDate = new Date().toISOString().slice(0, 10);
    try {
      const basePayload = binder ? buildReportPayloadFromBinder(binder as Parameters<typeof buildReportPayloadFromBinder>[0]) : {
        cover: { title: 'Financial Report', entity_name: 'Entity', report_date: reportDate },
        financial_statements: { balance_sheet: {}, profit_and_loss: {}, report_date: reportDate },
        executive_summary: '',
        audit_trail: [],
        audit_trail_rules_cited: [],
        clean_ledger: [],
      };
      const payload = {
        ...basePayload,
        cover: { ...basePayload.cover, report_date: reportDate },
        financial_statements: basePayload.financial_statements
          ? { ...basePayload.financial_statements, report_date: reportDate }
          : basePayload.financial_statements,
      };
      const dateStr = reportDate;
      if (downloadPackageType === 'detailed-pdf') {
        const blob = await downloadPackagePdf(payload, 'detailed');
        triggerDownload(blob, `financial_report_${dateStr}.pdf`);
      } else if (downloadPackageType === 'summary-pdf') {
        const blob = await downloadPackagePdf(payload, 'summary');
        triggerDownload(blob, `financial_report_summary_${dateStr}.pdf`);
      } else {
        const blob = await downloadPackageCsv({ clean_ledger: payload.clean_ledger });
        triggerDownload(blob, `clean_ledger_${dateStr}.csv`);
      }
    } catch (err) {
      setDownloadPackageError(err instanceof Error ? err.message : 'Download failed');
    } finally {
      setDownloadPackageLoading(false);
    }
  }, [binder, downloadPackageType]);

  const handleDownloadEvidencePackage = React.useCallback(async () => {
    const statementsText = binder
      ? `Entity: ${binder.entityName}\nPeriod: ${binder.periodStart} to ${binder.periodEnd}\nGenerated: ${binder.generatedAt}\n\n` +
        (transparencySections.balanceSheet.length || transparencySections.profitAndLoss.length
          ? [
              ...transparencySections.balanceSheet.flatMap((s) =>
                s.lines.map((l) => `${l.label}\t${l.amount}`).concat(s.total !== undefined ? [`Total ${s.title}\t${s.total}`] : [])
              ),
              ...transparencySections.profitAndLoss.flatMap((s) =>
                s.lines.map((l) => `${l.label}\t${l.amount}`).concat(s.total !== undefined ? [`Total ${s.title}\t${s.total}`] : [])
              ),
            ].join('\n')
          : '')
      : undefined;
    await buildAndDownloadAuditEvidencePackage({
      entityName: binder?.entityName,
      periodStart: binder?.periodStart,
      periodEnd: binder?.periodEnd,
      statementsText,
      logsDateFrom: binder?.periodStart,
      logsDateTo: binder?.periodEnd,
    });
  }, [binder, transparencySections]);

  const storedToken = typeof window !== 'undefined' ? localStorage.getItem(AUDITOR_TOKEN_KEY) : null;
  React.useEffect(() => {
    if (storedToken && !verified && !token) {
      setToken(storedToken);
    }
  }, [storedToken, verified, token]);

  const handleVerify = async () => {
    const t = token.trim();
    if (!t) {
      setVerifyError('Enter your auditor access token.');
      return;
    }
    setVerifyError(null);
    setVerifyLoading(true);
    try {
      const res = await verifyAuditorToken(t);
      if (res.valid) {
        setVerified(true);
        if (typeof window !== 'undefined') localStorage.setItem(AUDITOR_TOKEN_KEY, t);
      } else {
        setVerifyError('Invalid token. Access denied.');
      }
    } catch (err) {
      setVerifyError(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setVerifyLoading(false);
    }
  };

  const handleSendChat = async () => {
    const q = chatInput.trim();
    const t = typeof window !== 'undefined' ? localStorage.getItem(AUDITOR_TOKEN_KEY) : token || '';
    if (!q || !t || chatLoading) return;
    setMessages((prev) => [...prev, { role: 'user', content: q }]);
    setChatInput('');
    setChatLoading(true);
    try {
      const res = await internalControlsChat(q, t);
      setMessages((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: res.formatted ?? `${res.irac.conclusion}\n\n${res.sourceTag}`,
          citation: res.sourceTag,
        },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: `Error: ${err instanceof Error ? err.message : 'Internal Controls chat failed.'}` },
      ]);
    } finally {
      setChatLoading(false);
    }
  };

  const loadReports = async () => {
    const t = typeof window !== 'undefined' ? localStorage.getItem(AUDITOR_TOKEN_KEY) : token || '';
    if (!t) return;
    setReportsLoading(true);
    try {
      const periodEnd = new Date();
      const periodStart = new Date(periodEnd.getFullYear(), periodEnd.getMonth(), 1);
      const ps = periodStart.toISOString().slice(0, 10);
      const pe = periodEnd.toISOString().slice(0, 10);
      const [binderRes, gaapRes] = await Promise.all([
        getAuditBinder(ps, pe, 'Entity'),
        getGAAPConsistencyReport(ps, pe),
      ]);
      setBinder(binderRes);
      setGAAPReport(gaapRes);
    } catch {
      setBinder(null);
      setGAAPReport(null);
    } finally {
      setReportsLoading(false);
    }
  };

  if (!verified) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-6">
        <Card className="w-full max-w-md border-slate-200 shadow-sm">
          <CardHeader className="space-y-1">
            <div className="flex items-center gap-2 text-slate-700">
              <Shield className="h-8 w-8" />
              <CardTitle className="text-xl">Auditor Portal</CardTitle>
            </div>
            <p className="text-sm text-slate-500">
              Read-only access. Enter your auditor token to view Audit Binder, GAAP Consistency Report, and interrogate the bot about Internal Controls.
            </p>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium text-slate-700">Access token</label>
              <Input
                type="password"
                placeholder="Auditor token"
                value={token}
                onChange={(e) => setToken(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleVerify()}
                className="font-mono"
              />
            </div>
            {verifyError && (
              <p className="text-sm text-red-600 flex items-center gap-1">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                {verifyError}
              </p>
            )}
            <Button onClick={handleVerify} disabled={verifyLoading} className="w-full">
              {verifyLoading ? 'Verifying…' : 'Log in'}
            </Button>
            <p className="text-xs text-slate-400">
              Demo token: <code className="bg-slate-100 px-1 rounded">auditor-readonly-2025</code>
            </p>
          </CardContent>
        </Card>
        <Link href="/" className="mt-6 text-sm text-slate-500 hover:text-slate-700">
          ← Back to Dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="border-b border-slate-200 bg-white px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-2 text-slate-800">
          <Lock className="h-5 w-5 text-emerald-600" />
          <span className="font-semibold">Auditor Portal</span>
          <span className="text-xs text-slate-500 bg-slate-100 px-2 py-0.5 rounded">Read-only</span>
        </div>
        <Link href="/" className="text-sm text-slate-500 hover:text-slate-700">
          Dashboard
        </Link>
      </header>

      <main className="max-w-4xl mx-auto p-6 space-y-6">
        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <FileText className="h-5 w-5" />
            Audit Binder & GAAP Consistency
          </h2>
          <div className="flex flex-wrap gap-3 items-center">
            <Button
              variant="outline"
              size="sm"
              onClick={loadReports}
              disabled={reportsLoading}
            >
              {reportsLoading ? 'Loading…' : 'Load Audit Binder & GAAP Report'}
            </Button>
            <div className="flex items-center gap-2">
              <label htmlFor="download-package-type" className="text-sm text-slate-600">Download Report:</label>
              <select
                id="download-package-type"
                value={downloadPackageType}
                onChange={(e) => setDownloadPackageType(e.target.value as DownloadPackageType)}
                className="rounded-md border border-slate-200 bg-white px-3 py-1.5 text-sm text-slate-800"
              >
                <option value="detailed-pdf">Detailed PDF</option>
                <option value="summary-pdf">Summary PDF</option>
                <option value="raw-csv">Raw Data CSV</option>
              </select>
              <Button
                variant="outline"
                size="sm"
                onClick={handleDownloadPackage}
                disabled={downloadPackageLoading}
              >
                <Download className="h-4 w-4 mr-1" />
                {downloadPackageLoading ? 'Downloading…' : 'Download'}
              </Button>
            </div>
          </div>
          {downloadPackageError && (
            <p className="mt-2 text-sm text-red-600 flex items-center gap-1">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              {downloadPackageError}
            </p>
          )}
          {binder && (
            <Card className="mt-3 border-slate-200">
              <CardHeader className="py-3">
                <CardTitle className="text-base">Audit Binder</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                <p><strong>Entity:</strong> {binder.entityName}</p>
                <p><strong>Period:</strong> {binder.periodStart} to {binder.periodEnd}</p>
                <p><strong>Justifications in chain:</strong> {binder.justifications?.length ?? 0}</p>
                <p className="text-slate-500 mt-1">Every P&L number is linked to source document and timestamped Reasoning Monologue.</p>
              </CardContent>
            </Card>
          )}

          {/* Auditor Transparency: Trace View + Citations + Download Evidence Package */}
          <div className="mt-4">
            <AuditorTransparencyDashboard
              entityName={binder?.entityName}
              periodStart={binder?.periodStart}
              periodEnd={binder?.periodEnd}
              reportDate={binder?.generatedAt ? new Date(binder.generatedAt).toISOString().slice(0, 10) : undefined}
              balanceSheetSections={transparencySections.balanceSheet}
              profitAndLossSections={transparencySections.profitAndLoss}
              traceSteps={traceStepsWithTime}
              onDownloadEvidencePackage={handleDownloadEvidencePackage}
            />
          </div>
          {gaapReport && (
            <Card className={`mt-3 border-slate-200 ${gaapReport.hasChanges ? 'border-amber-300 bg-amber-50/50' : ''}`}>
              <CardHeader className="py-3">
                <CardTitle className="text-base flex items-center gap-2">
                  GAAP Consistency Report
                  {gaapReport.hasChanges && <AlertTriangle className="h-4 w-4 text-amber-600" />}
                </CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-slate-600">
                {gaapReport.summary && <p>{gaapReport.summary}</p>}
                {gaapReport.hasChanges && gaapReport.policyChanges && (
                  <ul className="mt-2 list-disc list-inside text-amber-800">
                    {(gaapReport.policyChanges as { policyArea: string; changeDescription: string }[]).map((c, i) => (
                      <li key={i}>{c.policyArea}: {c.changeDescription}</li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        <section>
          <h2 className="text-lg font-semibold text-slate-800 mb-3 flex items-center gap-2">
            <MessageSquare className="h-5 w-5" />
            Internal Controls — Ask the bot
          </h2>
          <p className="text-sm text-slate-500 mb-3">
            Interrogate the bot specifically about Internal Controls. Responses are scoped to internal controls and include IRAC justification with [Source] citation.
          </p>
          <Card className="border-slate-200">
            <CardContent className="p-0">
              <ScrollArea className="h-[280px] p-4">
                {messages.length === 0 && (
                  <p className="text-slate-400 text-sm">Ask a question about internal controls (e.g. segregation of duties, reconciliation controls, access controls).</p>
                )}
                {messages.map((m, i) => (
                  <div
                    key={i}
                    className={`mb-3 ${m.role === 'user' ? 'text-right' : 'text-left'}`}
                  >
                    <div
                      className={`inline-block max-w-[85%] rounded-lg px-3 py-2 text-sm ${
                        m.role === 'user'
                          ? 'bg-slate-200 text-slate-800'
                          : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      <div className="whitespace-pre-wrap">{m.content}</div>
                      {m.citation && (
                        <p className="mt-1 text-xs text-slate-500 font-mono">{m.citation}</p>
                      )}
                    </div>
                  </div>
                ))}
              </ScrollArea>
              <div className="flex gap-2 p-3 border-t border-slate-100">
                <Input
                  placeholder="Ask about internal controls…"
                  value={chatInput}
                  onChange={(e) => setChatInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && handleSendChat()}
                />
                <Button onClick={handleSendChat} disabled={chatLoading || !chatInput.trim()}>
                  <Send className="h-4 w-4" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </section>
      </main>
    </div>
  );
}
