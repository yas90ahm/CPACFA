'use client';

import * as React from 'react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/**
 * Ghost loading: skeletons where P&L and Balance Sheet will appear.
 * Shadcn Skeleton components for subtle placeholder.
 */
export function GhostStatementSkeletons({ className }: { className?: string }) {
  return (
    <div className={cn('grid grid-cols-1 lg:grid-cols-2 gap-6 min-h-[320px]', className)}>
      <Card className="flex flex-col overflow-hidden shadow-calm border border-border rounded-md">
        <CardHeader className="py-5 px-5 border-b border-border/50">
          <Skeleton className="h-5 w-48 rounded-md" />
        </CardHeader>
        <CardContent className="flex-1 p-4 space-y-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton className="h-4 flex-1 max-w-[60%] rounded" />
              <Skeleton className="h-4 w-20 rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
      <Card className="flex flex-col overflow-hidden shadow-calm border border-border rounded-md">
        <CardHeader className="py-5 px-5 border-b border-border/50">
          <Skeleton className="h-5 w-40 rounded-md" />
        </CardHeader>
        <CardContent className="flex-1 p-4 space-y-3">
          {[1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex justify-between gap-4">
              <Skeleton className="h-4 flex-1 max-w-[55%] rounded" />
              <Skeleton className="h-4 w-24 rounded" />
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}
