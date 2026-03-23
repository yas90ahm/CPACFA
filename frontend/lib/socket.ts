'use client';

import { useEffect, useRef, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

const WS_PATH = '/ws';

function getToken(): string | null {
  if (typeof document === 'undefined') return null;
  // Try reading token from cookie (set by auth flow)
  const match = document.cookie
    .split('; ')
    .find((c) => c.startsWith('token='));
  if (match) return match.split('=')[1] ?? null;
  // Fallback: localStorage (some auth flows store it there)
  try {
    return localStorage.getItem('auth_token');
  } catch {
    return null;
  }
}

/**
 * Provides a Socket.IO connection scoped to a close session.
 *
 * Connects to the backend Socket.IO server at the /ws path,
 * authenticates via the session token, and joins the session room.
 *
 * Usage:
 * ```tsx
 * const { on, off, emit, connected } = useSessionSocket(sessionId);
 *
 * useEffect(() => {
 *   const handler = (data: any) => { ... };
 *   on('sync_complete', handler);
 *   return () => off('sync_complete', handler);
 * }, [on, off]);
 * ```
 */
export function useSessionSocket(sessionId: string | null) {
  const socketRef = useRef<Socket | null>(null);
  const connectedRef = useRef(false);

  useEffect(() => {
    if (!sessionId) return;

    const baseUrl =
      process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:3001';
    const token = getToken();

    const socket = io(baseUrl, {
      path: WS_PATH,
      auth: { token },
      withCredentials: true,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 10000,
    });

    socketRef.current = socket;

    socket.on('connect', () => {
      connectedRef.current = true;
      socket.emit('join_session', { sessionId });
    });

    socket.on('disconnect', () => {
      connectedRef.current = false;
    });

    socket.on('reconnect', () => {
      // Re-join room after reconnection
      socket.emit('join_session', { sessionId });
    });

    return () => {
      socket.emit('leave_session', { sessionId });
      socket.disconnect();
      socketRef.current = null;
      connectedRef.current = false;
    };
  }, [sessionId]);

  const on = useCallback(
    (event: string, handler: (...args: unknown[]) => void) => {
      socketRef.current?.on(event, handler);
    },
    [],
  );

  const off = useCallback(
    (event: string, handler: (...args: unknown[]) => void) => {
      socketRef.current?.off(event, handler);
    },
    [],
  );

  const emit = useCallback(
    (event: string, ...args: unknown[]) => {
      socketRef.current?.emit(event, ...args);
    },
    [],
  );

  return {
    on,
    off,
    emit,
    get connected() {
      return connectedRef.current;
    },
    get socket() {
      return socketRef.current;
    },
  };
}
