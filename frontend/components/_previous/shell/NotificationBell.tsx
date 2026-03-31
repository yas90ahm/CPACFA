'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Bell, PenLine, Award, CheckCircle2, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useNotifications, useUnreadCount, useMarkAsRead, useMarkAllAsRead } from '@/lib/queries/notifications';

function timeAgo(dateStr: string): string {
  const ms = Date.now() - new Date(dateStr).getTime();
  const m = Math.floor(ms / 60_000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function notificationIcon(eventType?: string) {
  switch (eventType) {
    case 'adjusting_entry_approved':
    case 'adjusting_entry_rejected':
      return <PenLine className="w-4 h-4 shrink-0" />;
    case 'close_submitted_for_review':
    case 'review_complete':
      return <Award className="w-4 h-4 shrink-0" />;
    case 'period_certified':
    case 'period_recertified':
      return <CheckCircle2 className="w-4 h-4 shrink-0" />;
    case 'close_overdue':
      return <AlertTriangle className="w-4 h-4 shrink-0" />;
    default:
      return <Bell className="w-4 h-4 shrink-0" />;
  }
}

export function NotificationBell() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const { data: count = 0 } = useUnreadCount();
  const { data: notifications = [] } = useNotifications();
  const markRead = useMarkAsRead();
  const markAllRead = useMarkAllAsRead();

  // Close dropdown on outside click
  useEffect(() => {
    function handler(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    if (open) document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [open]);

  function handleClick(n: { id: string; read: boolean; data: Record<string, unknown> | null }) {
    if (!n.read) markRead.mutate(n.id);
    const sessionId = n.data?.closeSessionId as string | undefined;
    if (sessionId) router.push(`/close/${sessionId}/dashboard`);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="p-2 rounded-input hover:text-primary hover:bg-hover relative"
        style={{ color: 'var(--text-secondary)' }}
        aria-label="Notifications"
      >
        <Bell className="w-5 h-5" />
        {count > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] flex items-center justify-center rounded-full text-white text-xs font-bold px-1"
            style={{ background: 'var(--status-error)' }}
          >
            {count > 99 ? '99+' : count}
          </span>
        )}
      </button>

      {open && (
        <div
          className="absolute right-0 top-full mt-2 w-96 max-h-[480px] rounded-card shadow-lg overflow-hidden z-50"
          style={{ background: 'var(--bg-surface)', border: '1px solid var(--border-default)' }}
        >
          <div
            className="flex items-center justify-between px-4 py-3"
            style={{ borderBottom: '1px solid var(--border-default)' }}
          >
            <span className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>Notifications</span>
            {count > 0 && (
              <button
                type="button"
                onClick={() => markAllRead.mutate()}
                className="text-xs hover:underline"
                style={{ color: 'var(--interactive-primary)' }}
              >
                Mark All Read
              </button>
            )}
          </div>
          <div className="overflow-y-auto max-h-[400px]">
            {notifications.length === 0 ? (
              <div className="px-4 py-8 text-center text-sm" style={{ color: 'var(--text-secondary)' }}>
                No notifications
              </div>
            ) : (
              notifications.map((n) => (
                <button
                  key={n.id}
                  type="button"
                  onClick={() => handleClick(n)}
                  className={cn(
                    'w-full text-left px-4 py-3 hover:bg-hover transition-colors',
                  )}
                  style={{
                    borderBottom: '1px solid var(--border-subtle)',
                    ...(!n.read ? { background: 'var(--ai-bg)' } : {}),
                  }}
                >
                  <div className="flex items-start gap-2">
                    {!n.read && (
                      <span
                        className="mt-1.5 w-2 h-2 rounded-full shrink-0"
                        style={{ background: 'var(--interactive-primary)' }}
                      />
                    )}
                    <span className="mt-0.5 shrink-0" style={{ color: 'var(--text-secondary)' }}>
                      {notificationIcon(n.eventType)}
                    </span>
                    <div className={cn('min-w-0 flex-1', n.read && 'ml-4')}>
                      <p
                        className={cn('text-sm', !n.read && 'font-medium')}
                        style={{ color: !n.read ? 'var(--text-primary)' : 'var(--text-secondary)' }}
                      >
                        {n.title}
                      </p>
                      <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-secondary)' }}>{n.body}</p>
                      <p className="text-xs mt-1" style={{ color: 'var(--text-tertiary)' }}>{timeAgo(n.createdAt)}</p>
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
