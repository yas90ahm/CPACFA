'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';
import type { CFOKPIs, CFOFinancialSnapshot } from '@/lib/api';

/** MD&A bullet set per dashboard / period */
export interface MDABullets {
  whatHappened: string;
  whyHappened: string;
  recommendedAction: string;
}

/** Narrative shape from getCFONarrative */
export interface MDANarrative {
  periodLabel: string;
  overview: string;
  sections: { title: string; content: string }[];
  highlights: string[];
}

/** Derive 3 MD&A bullets from narrative when not provided by backend */
function deriveBullets(narrative: MDANarrative): MDABullets {
  const whatHappened =
    narrative.overview ||
    (narrative.highlights.length > 0 ? narrative.highlights[0] : 'No summary available.');
  const whyHappened =
    narrative.sections.length > 0
      ? narrative.sections[0].content
      : narrative.highlights.length > 1
        ? narrative.highlights[1]
        : 'Context not available.';
  const recommendedAction =
    narrative.highlights.length > 0
      ? narrative.highlights[narrative.highlights.length - 1]
      : narrative.sections.length > 1
        ? narrative.sections[narrative.sections.length - 1].content
        : 'Review full MD&A for recommendations.';
  return { whatHappened, whyHappened, recommendedAction };
}

/** CFA-style liquidity risk from current ratio (currentAssets/currentLiabilities) */
function liquidityRiskLevel(currentRatio: number): 'Low' | 'Medium' | 'High' {
  if (currentRatio >= 1.5) return 'Low';
  if (currentRatio >= 1) return 'Medium';
  return 'High';
}

/** CFA-style profitability strength from net margin % */
function profitabilityStrength(netMarginPercent: number): 'Weak' | 'Moderate' | 'Strong' {
  if (netMarginPercent >= 15) return 'Strong';
  if (netMarginPercent >= 5) return 'Moderate';
  return 'Weak';
}

/** Small horizontal gauge: label, level, color */
function SentimentGauge({
  label,
  level,
  variant,
}: {
  label: string;
  level: string;
  variant: 'risk' | 'strength';
}) {
  const riskColors: Record<string, string> = {
    High: 'bg-red-500',
    Medium: 'bg-amber-500',
    Low: 'bg-emerald-500',
  };
  const strengthColors: Record<string, string> = {
    Weak: 'bg-red-500',
    Moderate: 'bg-amber-500',
    Strong: 'bg-emerald-500',
  };
  const colors = variant === 'risk' ? riskColors : strengthColors;
  const width =
    variant === 'risk'
      ? level === 'High'
        ? 90
        : level === 'Medium'
          ? 50
          : 20
      : level === 'Strong'
        ? 90
        : level === 'Moderate'
          ? 50
          : 20;
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-medium text-muted-foreground w-28 shrink-0">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-muted overflow-hidden">
        <div
          className={cn('h-full rounded-full transition-all', colors[level] ?? 'bg-muted-foreground')}
          style={{ width: `${width}%` }}
        />
      </div>
      <span className="text-xs font-medium w-16 shrink-0">{level}</span>
    </div>
  );
}

export function ExecutiveNarrative({
  narrative,
  kpis,
  snapshot,
  bullets: bulletsProp,
  className,
}: {
  narrative: MDANarrative | null;
  kpis: CFOKPIs | null;
  snapshot?: CFOFinancialSnapshot | null;
  bullets?: MDABullets[];
  className?: string;
}) {
  const bulletsList = React.useMemo(() => {
    if (bulletsProp && bulletsProp.length > 0) return bulletsProp;
    if (narrative) return [deriveBullets(narrative)];
    return [];
  }, [narrative, bulletsProp]);

  const liquidityRisk = React.useMemo(() => {
    if (!snapshot?.currentAssets || !snapshot?.currentLiabilities || snapshot.currentLiabilities === 0)
      return null;
    const currentRatio = snapshot.currentAssets / snapshot.currentLiabilities;
    return liquidityRiskLevel(currentRatio);
  }, [snapshot?.currentAssets, snapshot?.currentLiabilities]);

  const profitability = kpis ? profitabilityStrength(kpis.netMarginPercent) : null;

  return (
    <Card className={cn(className)}>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Management Discussion &amp; Analysis</CardTitle>
        {narrative && (
          <p className="text-xs text-muted-foreground font-normal">{narrative.periodLabel}</p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        {bulletsList.length > 0 && (
          <div className="space-y-3">
            {bulletsList.map((b, i) => (
              <div key={i} className="space-y-2 text-sm">
                <p>
                  <span className="font-medium text-foreground">What Happened: </span>
                  <span className="text-muted-foreground">{b.whatHappened}</span>
                </p>
                <p>
                  <span className="font-medium text-foreground">Why it Happened: </span>
                  <span className="text-muted-foreground">{b.whyHappened}</span>
                </p>
                <p>
                  <span className="font-medium text-foreground">Recommended Action: </span>
                  <span className="text-muted-foreground">{b.recommendedAction}</span>
                </p>
              </div>
            ))}
          </div>
        )}

        {(liquidityRisk !== null || profitability !== null) && kpis && (
          <div className="space-y-2 pt-2 border-t">
            <p className="text-xs font-medium text-muted-foreground mb-2">Sentiment (CFA level)</p>
            <div className="space-y-2">
              {liquidityRisk !== null && (
                <SentimentGauge
                  label="Liquidity Risk"
                  level={liquidityRisk}
                  variant="risk"
                />
              )}
              {profitability !== null && (
                <SentimentGauge
                  label="Profitability Strength"
                  level={profitability}
                  variant="strength"
                />
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
