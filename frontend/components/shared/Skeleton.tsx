import { cn } from '@/lib/utils';

export function Skeleton({ className, style }: { className?: string; style?: React.CSSProperties }) {
  return <div className={cn('animate-pulse rounded bg-elevated', className)} style={style} />;
}

export function CardSkeleton() {
  return (
    <div className="bg-surface border border-border rounded-card p-5 space-y-3">
      <Skeleton className="h-3 w-32" />
      <Skeleton className="h-6 w-20" />
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="bg-surface border border-border rounded-card overflow-hidden">
      <div className="border-b border-border px-4 py-3 flex gap-6">
        {[120, 200, 80, 100].map((w, i) => (
          <Skeleton key={i} className="h-3" style={{ width: `${w}px` }} />
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b border-border-light px-4 py-3 flex gap-6">
          {[120, 200, 80, 100].map((w, j) => (
            <Skeleton key={j} className="h-3" style={{ width: `${w}px` }} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function PageSkeleton() {
  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-32" />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <CardSkeleton />
        <CardSkeleton />
        <CardSkeleton />
      </div>
      <TableSkeleton />
    </div>
  );
}
