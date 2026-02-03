'use client';

import * as React from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import {
  getCFONarrative,
  runPointedQuestion,
  type CFOFinancialSnapshot,
  type CFOKPIs,
  type ScenarioKPIs,
} from '@/lib/api';
import { cn } from '@/lib/utils';
import { Check } from 'lucide-react';
import { ExecutiveNarrative } from '@/components/executive_narrative';

/** Default snapshot for demo when no data is loaded */
const DEFAULT_SNAPSHOT: CFOFinancialSnapshot = {
  revenue: 4_500_000,
  costOfGoodsSold: 1_350_000,
  operatingExpenses: 2_250_000,
  operatingIncome: 900_000,
  netIncome: 675_000,
  totalAssets: 8_000_000,
  totalLiabilities: 3_000_000,
  totalEquity: 5_000_000,
  cash: 1_200_000,
  currentAssets: 2_500_000,
  currentLiabilities: 1_200_000,
  inventory: 400_000,
  accountsReceivable: 600_000,
  accountsPayable: 350_000,
  priorRevenue: 4_100_000,
  priorNetIncome: 580_000,
  periodLabel: 'Q4 FY25',
};

interface MarginChartPoint {
  scenario: string;
  grossMargin: number;
  operatingMargin: number;
  netMargin: number;
}

export function CFODashboard({
  snapshot: snapshotProp,
  scenarioKpis,
  className,
}: {
  snapshot?: CFOFinancialSnapshot | null;
  /** When set (Strategic Sandbox), overrides Burn Rate, Runway, Break-even in cards and chart */
  scenarioKpis?: ScenarioKPIs | null;
  className?: string;
}) {
  const snapshot = snapshotProp ?? DEFAULT_SNAPSHOT;
  const [narrative, setNarrative] = React.useState<{
    periodLabel: string;
    overview: string;
    sections: { title: string; content: string }[];
    highlights: string[];
  } | null>(null);
  const [kpis, setKpis] = React.useState<CFOKPIs | null>(null);
  const [loading, setLoading] = React.useState(false);
  const [pointedQuestion, setPointedQuestion] = React.useState('');
  const [sensitivityResult, setSensitivityResult] = React.useState<{
    narrative: string;
    chartData: MarginChartPoint[];
    interpretedVariable: string;
    interpretedShock: string;
  } | null>(null);
  const [pointedLoading, setPointedLoading] = React.useState(false);

  // Fetch MD&A narrative + KPIs when snapshot is available
  React.useEffect(() => {
    let cancelled = false;
    setLoading(true);
    getCFONarrative(snapshot)
      .then(({ narrative: n, kpis: k }) => {
        if (!cancelled) {
          setNarrative(n);
          setKpis(k);
        }
      })
      .catch(() => {
        if (!cancelled) setNarrative(null);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [
    snapshot.revenue,
    snapshot.netIncome,
    snapshot.cash,
    snapshot.periodLabel,
    snapshot.priorRevenue,
  ]);

  const handlePointedQuestion = React.useCallback(() => {
    const q = pointedQuestion.trim();
    if (!q) return;
    setPointedLoading(true);
    setSensitivityResult(null);
    runPointedQuestion(q, snapshot)
      .then((res) => {
        setSensitivityResult({
          narrative: res.narrative,
          chartData: res.chartData,
          interpretedVariable: res.interpretedVariable,
          interpretedShock: res.interpretedShock,
        });
      })
      .catch(() => setSensitivityResult(null))
      .finally(() => setPointedLoading(false));
  }, [pointedQuestion, snapshot]);

  const runQuestionFromText = React.useCallback(
    (text: string) => {
      const q = text.trim();
      if (!q) return;
      setPointedQuestion(q);
      setPointedLoading(true);
      setSensitivityResult(null);
      runPointedQuestion(q, snapshot)
        .then((res) => {
          setSensitivityResult({
            narrative: res.narrative,
            chartData: res.chartData,
            interpretedVariable: res.interpretedVariable,
            interpretedShock: res.interpretedShock,
          });
        })
        .catch(() => setSensitivityResult(null))
        .finally(() => setPointedLoading(false));
    },
    [snapshot]
  );

  const marginChartData = sensitivityResult?.chartData ?? (kpis ? [
    { scenario: 'Current', grossMargin: kpis.grossMarginPercent, operatingMargin: kpis.operatingMarginPercent, netMargin: kpis.netMarginPercent },
  ] : []);

  const effectiveKpis = scenarioKpis ?? kpis;

  /** Trust badge: 12px Verified (Audit Green checkmark) next to KPIs */
  const VerifiedBadge = () => (
    <span className="inline-flex items-center gap-0.5 text-[12px] font-medium text-audit-green ml-1" title="Supervisor verified">
      <Check className="h-3 w-3 shrink-0" aria-hidden />
      Verified
    </span>
  );

  const runwayBurnData = effectiveKpis
    ? [
        { name: 'Burn Rate ($/mo)', value: effectiveKpis.burnRate, fill: effectiveKpis.burnRate > 0 ? 'hsl(var(--destructive))' : 'hsl(var(--muted-foreground))' },
        { name: 'Runway (months)', value: effectiveKpis.runwayMonths >= 999 ? 24 : Math.min(24, effectiveKpis.runwayMonths), fill: 'hsl(var(--primary))' },
      ]
    : [];

  return (
    <div className={cn('space-y-6', className)}>
      <div>
        <h2 className="text-lg font-semibold tracking-tight">CFO Dashboard — Management Discussion &amp; Analysis</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Strategic narrative, KPIs (Burn Rate, Runway, Rule of 40, Working Capital), and Pointed Questions (sensitivity)
        </p>
      </div>

      {loading && !narrative && (
        <p className="text-sm text-muted-foreground">Loading MD&A narrative and KPIs…</p>
      )}

      {narrative && (
        <ExecutiveNarrative narrative={narrative} kpis={kpis} snapshot={snapshot} />
      )}

      {narrative && (
        <Card className="rounded-md border border-border shadow-calm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Strategic Narrative (MD&A) — {narrative.periodLabel}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-sm leading-relaxed">{narrative.overview}</p>
            {narrative.highlights.length > 0 && (
              <ul className="text-sm list-disc list-inside text-muted-foreground">
                {narrative.highlights.map((h, i) => (
                  <li key={i}>{h}</li>
                ))}
              </ul>
            )}
            <ScrollArea className="h-[180px] rounded-md border p-3">
              {narrative.sections.map((s, i) => (
                <div key={i} className="mb-3">
                  <h4 className="text-sm font-medium">{s.title}</h4>
                  <p className="text-sm text-muted-foreground mt-1">{s.content}</p>
                </div>
              ))}
            </ScrollArea>
          </CardContent>
        </Card>
      )}

      {kpis && (
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3">
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center flex-wrap">
                Burn Rate{scenarioKpis ? ' (scenario)' : ''}
                <VerifiedBadge />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-3">
              <p className="text-xl font-semibold font-currency">
                {effectiveKpis?.burnRate != null && effectiveKpis.burnRate > 0 ? `$${(effectiveKpis.burnRate / 1000).toFixed(0)}k/mo` : '—'}
              </p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center flex-wrap">
                Runway{scenarioKpis ? ' (scenario)' : ''}
                <VerifiedBadge />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-3">
              <p className="text-xl font-semibold font-currency">
                {effectiveKpis?.runwayMonths == null || (effectiveKpis?.runwayMonths ?? 0) >= 999 || (effectiveKpis?.burnRate ?? 0) <= 0 ? 'N/A' : `${(effectiveKpis?.runwayMonths ?? 0).toFixed(1)} mo`}
              </p>
            </CardContent>
          </Card>
          {(effectiveKpis?.breakEvenRevenue != null && effectiveKpis.breakEvenRevenue > 0) && (
            <Card>
              <CardHeader className="pb-1 pt-3 px-3">
                <CardTitle className="text-xs font-medium text-muted-foreground flex items-center flex-wrap">
                  Break-even{scenarioKpis ? ' (scenario)' : ''}
                  <VerifiedBadge />
                </CardTitle>
              </CardHeader>
              <CardContent className="pb-3 px-3">
                <p className="text-xl font-semibold font-currency">
                  ${((effectiveKpis?.breakEvenRevenue ?? 0) / 1_000_000).toFixed(2)}M
                </p>
                <p className="text-xs text-muted-foreground">Annual revenue</p>
              </CardContent>
            </Card>
          )}
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center flex-wrap">
                Rule of 40 (SaaS)
                <VerifiedBadge />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-3">
              <p className="text-xl font-semibold font-currency">{kpis.ruleOf40.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">Growth + Margin</p>
            </CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-1 pt-3 px-3">
              <CardTitle className="text-xs font-medium text-muted-foreground flex items-center flex-wrap">
                Working Capital Cycle
                <VerifiedBadge />
              </CardTitle>
            </CardHeader>
            <CardContent className="pb-3 px-3">
              <p className="text-xl font-semibold font-currency">{kpis.workingCapitalCycleDays.toFixed(0)} days</p>
              <p className="text-xs text-muted-foreground">DSO {kpis.daysSalesOutstanding.toFixed(0)} + DIO {kpis.daysInventoryOutstanding.toFixed(0)} − DPO {kpis.daysPayablesOutstanding.toFixed(0)}</p>
            </CardContent>
          </Card>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {kpis && runwayBurnData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Burn Rate &amp; Runway</CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={runwayBurnData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} tickFormatter={(v) => (v >= 1000 ? `${v / 1000}k` : String(v))} />
                  <Tooltip formatter={(v: number) => [v >= 1000 ? `${(v / 1000).toFixed(1)}k` : v.toFixed(1), '']} />
                  <Bar dataKey="value" name="Value" radius={[4, 4, 0, 0]}>
                    {runwayBurnData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
        {marginChartData.length > 0 && (
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">
                {sensitivityResult ? 'Margins — Base vs Sensitivity' : 'Margins'}
              </CardTitle>
            </CardHeader>
            <CardContent className="h-[200px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={marginChartData}
                  margin={{ top: 8, right: 8, left: 0, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
                  <XAxis dataKey="scenario" tick={{ fontSize: 11 }} />
                  <YAxis domain={[0, 100]} tick={{ fontSize: 11 }} tickFormatter={(v) => `${v}%`} />
                  <Tooltip formatter={(v: number) => [`${v.toFixed(1)}%`, '']} />
                  <Legend />
                  <Bar dataKey="grossMargin" name="Gross Margin %" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="operatingMargin" name="Operating Margin %" fill="hsl(var(--muted-foreground))" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="netMargin" name="Net Margin %" fill="hsl(var(--accent-foreground))" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </CardContent>
          </Card>
        )}
      </div>

      <Card className="rounded-md border border-border shadow-calm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Pointed questions — sensitivity</CardTitle>
          <p className="text-sm text-muted-foreground font-normal">
            e.g. &quot;What happens to our margins if COGS increases by 15%?&quot; — runs sensitivity and updates dashboard visuals in real-time.
          </p>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            <Input
              placeholder="What happens to our margins if COGS increases by 15%?"
              value={pointedQuestion}
              onChange={(e) => setPointedQuestion(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handlePointedQuestion()}
              className="flex-1"
            />
            <Button onClick={handlePointedQuestion} disabled={pointedLoading}>
              {pointedLoading ? 'Running…' : 'Run'}
            </Button>
          </div>
          {sensitivityResult && (
            <div className="rounded-md border bg-muted/30 p-3 text-sm">
              <p className="font-medium">
                {sensitivityResult.interpretedVariable} {sensitivityResult.interpretedShock}
              </p>
              <p className="text-muted-foreground mt-1">{sensitivityResult.narrative}</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
