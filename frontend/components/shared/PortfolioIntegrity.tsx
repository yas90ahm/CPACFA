'use client';

import { useMemo } from 'react';
import { cn } from '@/lib/utils';
import {
  Shield,
  AlertTriangle,
  CheckCircle2,
  TrendingUp,
  TrendingDown,
  Phone,
} from 'lucide-react';
import { usePortfolioIntegrityReport, type EntityIntegrityReport, type IntegrityComponent } from '@/lib/queries/portfolio';

function getScoreColor(score: number): { text: string; bg: string; border: string } {
  if (score >= 90) return { text: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' };
  if (score >= 70) return { text: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20' };
  return { text: 'text-red-400', bg: 'bg-red-500/10', border: 'border-red-500/20' };
}

function ScoreGauge({ score, size = 'md' }: { score: number; size?: 'sm' | 'md' | 'lg' }) {
  const dims = size === 'lg' ? { r: 40, w: 96, stroke: 6, text: 'text-3xl' } : size === 'md' ? { r: 28, w: 68, stroke: 4, text: 'text-xl' } : { r: 18, w: 44, stroke: 3, text: 'text-sm' };
  const circumference = 2 * Math.PI * dims.r;
  const offset = circumference - (score / 100) * circumference;
  const color = getScoreColor(score);

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: dims.w, height: dims.w }}>
      <svg className="transform -rotate-90" width={dims.w} height={dims.w}>
        <circle cx={dims.w / 2} cy={dims.w / 2} r={dims.r} strokeWidth={dims.stroke} stroke="#1e2235" fill="none" />
        <circle
          cx={dims.w / 2} cy={dims.w / 2} r={dims.r}
          strokeWidth={dims.stroke}
          stroke={score >= 90 ? '#34D399' : score >= 70 ? '#FBBF24' : '#F87171'}
          fill="none"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className="transition-all duration-1000"
        />
      </svg>
      <span className={cn('absolute font-semibold tabular-nums', dims.text, color.text)}>{score}</span>
    </div>
  );
}

function TrendLine({ values, height = 24 }: { values: number[]; height?: number }) {
  if (values.length < 2) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = values.length * 16;

  const points = values.map((v, i) => {
    const x = (i / (values.length - 1)) * (w - 4) + 2;
    const y = height - ((v - min) / range) * (height - 4) - 2;
    return `${x},${y}`;
  }).join(' ');

  const lastVal = values[values.length - 1];
  const color = getScoreColor(lastVal);

  return (
    <svg width={w} height={height} className="shrink-0">
      <polyline
        points={points}
        fill="none"
        stroke={lastVal >= 90 ? '#34D399' : lastVal >= 70 ? '#FBBF24' : '#F87171'}
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ComponentBar({ component }: { component: IntegrityComponent }) {
  const color = getScoreColor(component.score);
  return (
    <div className="flex items-center gap-3">
      <span className="text-[10px] text-gray-500 w-32 shrink-0 truncate">{component.label}</span>
      <div className="flex-1 h-1.5 bg-[#1e2235] rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-700"
          style={{
            width: `${component.score}%`,
            background: component.score >= 90 ? '#34D399' : component.score >= 70 ? '#FBBF24' : '#F87171',
          }}
        />
      </div>
      <span className={cn('text-[10px] font-mono tabular-nums w-8 text-right', color.text)}>{component.score}</span>
      <span className="text-[9px] text-gray-700 w-6 text-right">{Math.round(component.weight * 100)}%</span>
    </div>
  );
}

function EntityIntegrityCard({ entity, onClick }: { entity: EntityIntegrityReport; onClick?: () => void }) {
  const color = getScoreColor(entity.overallScore);
  const isAlert = entity.overallScore < 70;

  return (
    <div
      className={cn(
        'bg-[#141829] border rounded-xl p-4 transition-colors',
        isAlert ? 'border-red-500/30' : 'border-[#262C48]',
        onClick && 'cursor-pointer hover:border-[#7C5CFC]/30'
      )}
      onClick={onClick}
    >
      <div className="flex items-center gap-4">
        <ScoreGauge score={entity.overallScore} size="sm" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <p className="text-sm font-medium text-white truncate">{entity.entityName}</p>
            {isAlert && <AlertTriangle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
          </div>
          {entity.issues && entity.issues.length > 0 && (
            <p className="text-[10px] text-gray-500 mt-0.5 truncate">{entity.issues[0]}</p>
          )}
        </div>
        {entity.trend && entity.trend.length > 1 && (
          <TrendLine values={entity.trend} />
        )}
      </div>
    </div>
  );
}

export function PortfolioIntegritySection() {
  const { data: report, isLoading } = usePortfolioIntegrityReport();

  // Fallback: compute integrity from available data when backend isn't available
  const integrityData = useMemo(() => {
    if (report) return report;
    // Return null to show loading/empty state
    return null;
  }, [report]);

  if (isLoading) {
    return (
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-6 animate-pulse">
        <div className="h-6 w-48 bg-[#1e2235] rounded mb-4" />
        <div className="h-24 bg-[#1e2235] rounded" />
      </div>
    );
  }

  if (!integrityData) return null;

  const alertEntities = integrityData.entities.filter((e) => e.overallScore < 70);
  const overallColor = getScoreColor(integrityData.overallScore);

  return (
    <section className="space-y-4">
      <h2 className="text-lg font-display text-primary flex items-center gap-2">
        <Shield className="w-5 h-5 text-[#7C5CFC]" />
        Portfolio Integrity Score
      </h2>

      {/* Overall score + components */}
      <div className="bg-[#141829] border border-[#262C48] rounded-xl p-6">
        <div className="flex items-start gap-8">
          <div className="flex flex-col items-center">
            <ScoreGauge score={integrityData.overallScore} size="lg" />
            <p className={cn('text-xs font-semibold mt-2', overallColor.text)}>
              {integrityData.overallScore >= 90 ? 'Excellent' : integrityData.overallScore >= 70 ? 'Good' : 'Needs Attention'}
            </p>
            {integrityData.trend && integrityData.trend.length > 1 && (
              <div className="mt-3">
                <TrendLine values={integrityData.trend} height={32} />
                <p className="text-[9px] text-gray-600 text-center mt-1">6-month trend</p>
              </div>
            )}
          </div>
          <div className="flex-1 space-y-2">
            <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-3">Score Components</p>
            {integrityData.aggregateComponents.map((comp) => (
              <ComponentBar key={comp.label} component={comp} />
            ))}
          </div>
        </div>
      </div>

      {/* Pick up the phone alert */}
      {alertEntities.length > 0 && (
        <div className="bg-red-500/5 border border-red-500/20 rounded-xl p-5">
          <div className="flex items-start gap-3">
            <Phone className="w-5 h-5 text-red-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-semibold text-red-400">
                {alertEntities.length} entit{alertEntities.length === 1 ? 'y' : 'ies'} below integrity threshold
              </p>
              <p className="text-xs text-gray-400 mt-1">
                These entities have integrity scores below 70 and require immediate attention.
              </p>
              <div className="mt-3 space-y-2">
                {alertEntities.map((e) => (
                  <div key={e.entityId} className="flex items-center gap-3 px-3 py-2 rounded-lg bg-red-500/5">
                    <ScoreGauge score={e.overallScore} size="sm" />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs text-white font-medium">{e.entityName}</p>
                      {e.issues && e.issues.length > 0 && (
                        <p className="text-[10px] text-gray-500 truncate">{e.issues.join(' · ')}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Entity integrity cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {integrityData.entities.map((entity) => (
          <EntityIntegrityCard key={entity.entityId} entity={entity} />
        ))}
      </div>
    </section>
  );
}
