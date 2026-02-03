'use client';

import * as React from 'react';
import Link from 'next/link';
import { getAuditTodos } from '@/lib/apiAuth';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';

type TodoItem = { id?: string; title?: string; description?: string; status?: string; urgency?: string };

export default function AuditTodosPage() {
  const [todos, setTodos] = React.useState<TodoItem[]>([]);
  const [count, setCount] = React.useState(0);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const out = await getAuditTodos({ limit: 100 });
        if (!cancelled) {
          setTodos(Array.isArray(out.todos) ? (out.todos as TodoItem[]) : []);
          setCount(out.count ?? 0);
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Failed to load to-dos');
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => { cancelled = true; };
  }, []);

  return (
    <div className="space-y-6">
      <nav className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/dashboard" className="hover:text-foreground">Overview</Link>
        <span>/</span>
        <span className="font-medium text-foreground">To-dos</span>
      </nav>
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">To-dos</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Actionable items from data gaps
        </p>
      </div>
      {loading && <p className="text-sm text-muted-foreground">Loading…</p>}
      {error && (
        <Card className="border-destructive/50">
          <CardContent className="pt-6">
            <p className="text-sm text-destructive">{error}</p>
          </CardContent>
        </Card>
      )}
      {!loading && !error && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">To-dos ({count})</CardTitle>
          </CardHeader>
          <CardContent>
            {todos.length === 0 ? (
              <p className="text-sm text-muted-foreground">No to-dos.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Urgency</TableHead>
                    <TableHead className="max-w-[300px]">Description</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {todos.map((t, i) => (
                    <TableRow key={t.id ?? `todo-${i}`}>
                      <TableCell className="font-medium">{t.title ?? '—'}</TableCell>
                      <TableCell>
                        <Badge variant={t.status === 'done' ? 'success' : 'muted'}>{t.status ?? 'open'}</Badge>
                      </TableCell>
                      <TableCell>{t.urgency ?? '—'}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                        {t.description ?? '—'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}
      <Button asChild variant="outline">
        <Link href="/dashboard">Back to Overview</Link>
      </Button>
    </div>
  );
}
