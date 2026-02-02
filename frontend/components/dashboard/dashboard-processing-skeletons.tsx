'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Skeleton placeholders shown during 'processing' — where CFO Summary Ribbon,
 * Insights (charts), and Sensitivity will appear after Supervisor verification.
 */
export function DashboardProcessingSkeletons({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {/* CFO ribbon + chart area */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] gap-6 items-start">
        <Card className="overflow-hidden shadow-calm border border-border rounded-md">
          <CardHeader className="py-5 px-5 border-b border-border/50">
            <Skeleton className="h-5 w-56 rounded-md" />
            <Skeleton className="h-4 w-full max-w-sm mt-2 rounded" />
          </CardHeader>
          <CardContent className="p-4 space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[1, 2, 3, 4].map((i) => (
                <Skeleton key={i} className="h-16 rounded-md" />
              ))}
            </div>
            <Skeleton className="h-[200px] w-full rounded-md" />
          </CardContent>
        </Card>
        <Card className="overflow-hidden shadow-calm border border-border rounded-md">
          <CardHeader className="py-5 px-5 border-b border-border/50">
            <Skeleton className="h-5 w-40 rounded-md" />
          </CardHeader>
          <CardContent className="p-4 space-y-3">
            {[1, 2, 3, 4, 5].map((i) => (
              <Skeleton key={i} className="h-10 rounded" />
            ))}
          </CardContent>
        </Card>
      </div>
      {/* Insights / charts row */}
      <Card className="overflow-hidden shadow-calm border border-border rounded-md">
        <CardHeader className="py-5 px-5 border-b border-border/50">
          <Skeleton className="h-5 w-48 rounded-md" />
          <Skeleton className="h-4 w-64 mt-2 rounded" />
        </CardHeader>
        <CardContent className="p-4">
          <Skeleton className="h-[240px] w-full rounded-md" />
        </CardContent>
      </Card>
    </div>
  );
}
