'use client';

import * as React from 'react';
import { Shield, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { getAuditLog, type AuditLogEntry } from '@/lib/audit-log';
import { cn } from '@/lib/utils';

interface AuditLogPanelProps {
  className?: string;
  maxEntries?: number;
}

export function AuditLogPanel({ className, maxEntries = 50 }: AuditLogPanelProps) {
  const [entries, setEntries] = React.useState<AuditLogEntry[]>([]);
  const [expanded, setExpanded] = React.useState(false);

  React.useEffect(() => {
    setEntries(getAuditLog(maxEntries));
  }, [maxEntries, expanded]);

  const toggle = () => setExpanded((e) => !e);

  return (
    <Card className={cn('overflow-hidden rounded-md border border-border shadow-calm', className)}>
      <CardHeader
        className="py-4 cursor-pointer select-none flex flex-row items-center justify-between hover:bg-muted/30 transition-colors rounded-t-xl"
        onClick={toggle}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary">
            <Shield className="h-4 w-4" />
          </div>
          <CardTitle className="text-base font-semibold">Audit trail</CardTitle>
        </div>
        {expanded ? (
          <ChevronUp className="h-4 w-4 text-muted-foreground" />
        ) : (
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        )}
      </CardHeader>
      {expanded && (
        <CardContent className="pt-0">
          <p className="text-xs text-muted-foreground mb-2">
            Every interaction is logged with timestamp, user ID, and AI Reasoning Path.
          </p>
          <ScrollArea className="h-[220px] rounded-md border">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-2 font-medium">Timestamp</th>
                  <th className="text-left p-2 font-medium">User ID</th>
                  <th className="text-left p-2 font-medium">Action</th>
                  <th className="text-left p-2 font-medium max-w-[200px]">Reasoning Path</th>
                </tr>
              </thead>
              <tbody>
                {entries.length === 0 ? (
                  <tr>
                    <td colSpan={4} className="p-4 text-center text-muted-foreground">
                      No audit entries yet. Interact with the bot to see logs.
                    </td>
                  </tr>
                ) : (
                  entries.map((e) => (
                    <tr key={e.id} className="border-b hover:bg-muted/30">
                      <td className="p-2 font-mono text-muted-foreground">
                        {new Date(e.timestamp).toLocaleString()}
                      </td>
                      <td className="p-2 font-mono">{e.userId}</td>
                      <td className="p-2">{e.action}</td>
                      <td className="p-2 max-w-[200px] truncate" title={e.reasoningPath}>
                        {e.reasoningPath ?? '—'}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </ScrollArea>
        </CardContent>
      )}
    </Card>
  );
}
