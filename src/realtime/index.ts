/**
 * Real-time collaboration engine using Socket.IO.
 *
 * Controllers working on the same close session see each other's changes live.
 * Events are emitted from services (cascade, state machine, JE lifecycle)
 * and broadcast to all clients subscribed to that session.
 *
 * Architecture:
 * - Clients join a room named `session:<closeSessionId>`
 * - Server emits typed events to the room
 * - JWT auth on connection (same token as REST API)
 * - No client→server data flow (read-only push)
 */

import { Server as IOServer } from 'socket.io';
import type { Server as HTTPServer } from 'http';

let io: IOServer | null = null;

export type RealtimeEventType =
  | 'cascade_complete'
  | 'session_advanced'
  | 'session_certified'
  | 'session_locked'
  | 'recon_completed'
  | 'recon_approved'
  | 'je_posted'
  | 'je_reversed'
  | 'mapping_accepted'
  | 'statements_generated'
  | 'statements_stale'
  | 'variance_explained'
  | 'issue_created'
  | 'issue_resolved'
  | 'gl_uploaded'
  | 'readiness_changed';

export interface RealtimeEvent {
  type: RealtimeEventType;
  sessionId: string;
  tenantId: string;
  triggeredBy: string;
  data: Record<string, unknown>;
  timestamp: string;
}

/**
 * Initialize Socket.IO on the HTTP server.
 * Call once during server startup.
 */
export function initRealtime(httpServer: HTTPServer, corsOrigins: string[]): IOServer {
  io = new IOServer(httpServer, {
    cors: {
      origin: corsOrigins.length > 0
        ? corsOrigins
        : ['http://localhost:3000', 'http://localhost:3002'],
      credentials: true,
    },
    path: '/ws',
    transports: ['websocket', 'polling'],
  });

  io.on('connection', (socket) => {
    const token = socket.handshake.auth?.token as string | undefined;
    const sessionId = socket.handshake.query?.sessionId as string | undefined;

    if (!token) {
      socket.disconnect(true);
      return;
    }

    // Validate JWT (lightweight — just decode, don't hit DB)
    let payload: { tenantId?: string; userId?: string } | null = null;
    try {
      const jwt = require('jsonwebtoken');
      const secret = process.env.JWT_SECRET ?? 'dev-jwt-secret';
      payload = jwt.verify(token, secret) as { tenantId?: string; userId?: string };
    } catch {
      socket.disconnect(true);
      return;
    }

    if (!payload?.tenantId) {
      socket.disconnect(true);
      return;
    }

    // Join session room if specified
    if (sessionId) {
      const room = `session:${payload.tenantId}:${sessionId}`;
      socket.join(room);
    }

    // Allow clients to switch sessions
    socket.on('join_session', (newSessionId: string) => {
      if (typeof newSessionId === 'string' && newSessionId.length > 0) {
        const room = `session:${payload!.tenantId}:${newSessionId}`;
        socket.join(room);
      }
    });

    socket.on('leave_session', (oldSessionId: string) => {
      if (typeof oldSessionId === 'string') {
        socket.leave(`session:${payload!.tenantId}:${oldSessionId}`);
      }
    });
  });

  return io;
}

/**
 * Emit a real-time event to all clients subscribed to a session.
 * Safe to call even if Socket.IO is not initialized (no-op).
 */
export function emitSessionEvent(event: RealtimeEvent): void {
  if (!io) return;
  const room = `session:${event.tenantId}:${event.sessionId}`;
  io.to(room).emit('close_event', event);
}

/**
 * Get the Socket.IO server instance (for testing or advanced use).
 */
export function getIO(): IOServer | null {
  return io;
}
