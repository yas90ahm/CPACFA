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
  LineChart,
  Line,
} from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { cn } from '@/lib/utils';

export interface DebtToEquityPoint {
  period: string;
  debtToEquity: number;
  totalDebt?: number;
  totalEquity?: number;
}

export interface RevenueGrowthPoint {
  period: string;
  revenue: number;
  growthPercent?: number;
}

interface FinancialChartsProps {
  debtToEquityData?: DebtToEquityPoint[];
  revenueGrowthData?: RevenueGrowthPoint[];
  className?: string;
}

const defaultDebtToEquity: DebtToEquityPoint[] = [
  { period: 'FY-3', debtToEquity: 0.8, totalDebt: 800, totalEquity: 1000 },
  { period: 'FY-2', debtToEquity: 0.95, totalDebt: 950, totalEquity: 1000 },
  { period: 'FY-1', debtToEquity: 1.1, totalDebt: 1100, totalEquity: 1000 },
  { period: 'FY0', debtToEquity: 1.05, totalDebt: 1050, totalEquity: 1000 },
];

const defaultRevenueGrowth: RevenueGrowthPoint[] = [
  { period: 'FY-3', revenue: 3200, growthPercent: 0 },
  { period: 'FY-2', revenue: 3600, growthPercent: 12.5 },
  { period: 'FY-1', revenue: 4100, growthPercent: 13.9 },
  { period: 'FY0', revenue: 4500, growthPercent: 9.8 },
];

export function FinancialCharts({
  debtToEquityData = defaultDebtToEquity,
  revenueGrowthData = defaultRevenueGrowth,
  className,
}: FinancialChartsProps) {
  return (
    <div className={cn('grid grid-cols-1 md:grid-cols-2 gap-6', className)}>
      <Card className="rounded-md border border-border shadow-calm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Debt-to-Equity Trend</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={debtToEquityData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `${v}x`} />
              <Tooltip
                formatter={(value: number) => [`${value.toFixed(2)}x`, 'Debt/Equity']}
                contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))' }}
              />
              <Bar dataKey="debtToEquity" fill="hsl(var(--primary))" name="Debt / Equity" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>

      <Card className="rounded-md border border-border shadow-calm">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Revenue Growth Trend</CardTitle>
        </CardHeader>
        <CardContent className="h-[260px]">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={revenueGrowthData} margin={{ top: 8, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="period" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => `$${v / 1000}k`} />
              <Tooltip
                formatter={(value: number, name: string) =>
                  name === 'revenue' ? [`$${(value / 1000).toFixed(1)}k`, 'Revenue'] : [value, 'Growth %']
                }
                contentStyle={{ borderRadius: 'var(--radius)', border: '1px solid hsl(var(--border))' }}
              />
              <Legend />
              <Line
                type="monotone"
                dataKey="revenue"
                stroke="hsl(var(--primary))"
                strokeWidth={2}
                name="Revenue"
                dot={{ r: 4 }}
              />
              <Line
                type="monotone"
                dataKey="growthPercent"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={2}
                name="YoY Growth %"
                dot={{ r: 4 }}
              />
            </LineChart>
          </ResponsiveContainer>
        </CardContent>
      </Card>
    </div>
  );
}
