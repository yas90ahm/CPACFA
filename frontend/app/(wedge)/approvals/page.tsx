'use client';

import * as React from 'react';
import { useSearchParams } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import {
  listApprovalRequests,
  updateApprovalRequest,
  type ApprovalRequestRow,
} from '@/lib/apiAuth';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ApprovalsPage() {
  const searchParams = useSearchParams();
  const highlightRequestId = searchParams.get('request') ?? undefined;
  const { user } = useAuth();
  const [requests, setRequests] = React.useState<ApprovalRequestRow[]>([]);
  const [loading, setLoading] = React.useState(true);
  const [error, setError] = React.useState<string | null>(null);
  const [actingId, setActingId] = React.useState<string | null>(null);
  const highlightRef = React.useRef<HTMLTableRowElement | null>(null);

  const load = React.useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const list = await listApprovalRequests();
      setRequests(list);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load approval requests');
    } finally {
      setLoading(false);
    }
  }, []);

  React.useEffect(() => {
    load();
  }, [load]);

  React.useEffect(() => {
    if (highlightRequestId && highlightRef.current && !loading) {
      highlightRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }, [highlightRequestId, loading]);

  const handleApproveReject = async (requestId: string, action: 'approved' | 'rejected') => {
    setActingId(requestId);
    setError(null);
    try {
      const actor = user?.email ?? user?.id ?? 'user';
      await updateApprovalRequest(requestId, action, actor);
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">Approvals</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Review and approve or reject pending requests.
        </p>
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Approval requests</CardTitle>
          <p className="text-sm text-muted-foreground mt-1">
            {loading ? 'Loading…' : `${requests.length} request(s)`}
          </p>
        </CardHeader>
        <CardContent>
          {loading ? (
            <p className="text-sm text-muted-foreground">Loading…</p>
          ) : requests.length === 0 ? (
            <p className="text-sm text-muted-foreground">No approval requests.</p>
          ) : (
            <div className="rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Resource</TableHead>
                    <TableHead>Resource ID</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-40 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {requests.map((req) => {
                    const isHighlight = highlightRequestId && req.id === highlightRequestId;
                    const isActing = actingId === req.id;
                    const isPending = req.status === 'pending';
                    return (
                      <TableRow
                        key={req.id}
                        ref={isHighlight ? highlightRef : undefined}
                        className={isHighlight ? 'bg-primary/10 border-l-4 border-l-primary' : ''}
                      >
                        <TableCell className="font-medium">{req.resourceType}</TableCell>
                        <TableCell className="text-sm text-muted-foreground font-mono">
                          {req.resourceId}
                        </TableCell>
                        <TableCell>
                          <Badge
                            variant={
                              req.status === 'approved'
                                ? 'success'
                                : req.status === 'rejected'
                                  ? 'destructive'
                                  : 'secondary'
                            }
                          >
                            {req.status}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-right">
                          {isPending && (
                            <div className="flex justify-end gap-1">
                              <Button
                                size="sm"
                                variant="outline"
                                disabled={isActing}
                                onClick={() => handleApproveReject(req.id, 'rejected')}
                              >
                                Reject
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                disabled={isActing}
                                onClick={() => handleApproveReject(req.id, 'approved')}
                              >
                                {isActing ? '…' : 'Approve'}
                              </Button>
                            </div>
                          )}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
