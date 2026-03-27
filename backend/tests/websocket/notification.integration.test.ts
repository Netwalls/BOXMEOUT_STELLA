// backend/tests/websocket/notification.integration.test.ts
// Integration test: connect → auth → trigger notification → message received.
//
// Uses a real in-process Socket.IO server + socket.io-client so the full
// auth middleware, user-socket map, and notification push path are exercised.

import { createServer } from 'http';
import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import { io as ioc, type Socket as ClientSocket } from 'socket.io-client';
import type { Server as SocketIOServer } from 'socket.io';

// ---------------------------------------------------------------------------
// Hoist mocks before any module import
// ---------------------------------------------------------------------------
const { mockVerifyAccessToken } = vi.hoisted(() => ({
  mockVerifyAccessToken: vi.fn(),
}));

// Mock JWT verification so we don't need real tokens
vi.mock('../../src/utils/jwt.js', () => ({
  verifyAccessToken: mockVerifyAccessToken,
}));

// Mock Prisma to prevent DB connections during teardown
vi.mock('../../src/database/prisma.js', () => ({
  prisma: {
    $disconnect: vi.fn(),
    trade: { deleteMany: vi.fn() },
    prediction: { deleteMany: vi.fn() },
    share: { deleteMany: vi.fn() },
    dispute: { deleteMany: vi.fn() },
    market: { deleteMany: vi.fn() },
    achievement: { deleteMany: vi.fn() },
    leaderboard: { deleteMany: vi.fn() },
    referral: { deleteMany: vi.fn() },
    refreshToken: { deleteMany: vi.fn() },
    transaction: { deleteMany: vi.fn() },
    distribution: { deleteMany: vi.fn() },
    auditLog: { deleteMany: vi.fn() },
    user: { deleteMany: vi.fn() },
  },
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------
import {
  initializeSocketIO,
  pushNotificationToUser,
  getSocketIdsForUser,
} from '../../src/websocket/realtime.js';
import { UserTier } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const TEST_USER = {
  userId: 'user-integration-1',
  publicKey: 'GTEST...',
  tier: UserTier.BEGINNER,
  type: 'access' as const,
};

/** Wait for a socket event with a timeout. */
function waitForEvent<T = unknown>(
  socket: ClientSocket,
  event: string,
  timeoutMs = 3000
): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(
      () => reject(new Error(`Timeout waiting for event: ${event}`)),
      timeoutMs
    );
    socket.once(event, (data: T) => {
      clearTimeout(timer);
      resolve(data);
    });
  });
}

/** Connect a client and wait for the 'connected' confirmation. */
function connectClient(port: number, token: string): Promise<ClientSocket> {
  return new Promise((resolve, reject) => {
    const client = ioc(`http://localhost:${port}`, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });

    client.once('connected', () => resolve(client));
    client.once('connect_error', (err) => reject(err));

    setTimeout(() => reject(new Error('Connection timeout')), 3000);
  });
}

// ---------------------------------------------------------------------------
// Test suite
// ---------------------------------------------------------------------------

describe('WebSocket notification integration', () => {
  let httpServer: ReturnType<typeof createServer>;
  let io: SocketIOServer;
  let port: number;
  let client: ClientSocket;

  beforeAll(async () => {
    // Configure mock JWT to accept our test token
    mockVerifyAccessToken.mockReturnValue(TEST_USER);

    // Spin up a real HTTP + Socket.IO server on a random port
    httpServer = createServer();
    io = initializeSocketIO(httpServer, '*');

    await new Promise<void>((resolve) => {
      httpServer.listen(0, '127.0.0.1', () => {
        const addr = httpServer.address() as { port: number };
        port = addr.port;
        resolve();
      });
    });

    // Connect the test client
    client = await connectClient(port, 'valid-token');
  });

  afterAll(async () => {
    client?.disconnect();
    io?.close();
    await new Promise<void>((resolve) => httpServer.close(() => resolve()));
  });

  // -------------------------------------------------------------------------

  it('authenticates via handshake token and receives connected event', () => {
    expect(client.connected).toBe(true);
  });

  it('registers the socket in the user-socket map on connection', () => {
    const socketIds = getSocketIdsForUser(TEST_USER.userId);
    expect(socketIds.length).toBeGreaterThan(0);
  });

  it('receives notification pushed via pushNotificationToUser', async () => {
    const notificationPayload = {
      id: 'notif-1',
      type: 'SYSTEM',
      title: 'Test notification',
      message: 'Hello from the server',
      isRead: false,
      createdAt: new Date().toISOString(),
    };

    const received = waitForEvent<typeof notificationPayload>(
      client,
      'notification'
    );

    // Push directly via the user-socket map — this is the path
    // notification.service.ts uses
    pushNotificationToUser(io, TEST_USER.userId, notificationPayload);

    const msg = await received;
    expect(msg.id).toBe('notif-1');
    expect(msg.title).toBe('Test notification');
    expect(msg.type).toBe('SYSTEM');
  });

  it('removes socket from map on disconnect', async () => {
    const socketIdsBefore = getSocketIdsForUser(TEST_USER.userId);
    expect(socketIdsBefore.length).toBeGreaterThan(0);

    await new Promise<void>((resolve) => {
      client.once('disconnect', () => resolve());
      client.disconnect();
    });

    // Allow the server-side disconnect event to propagate
    await new Promise((r) => setTimeout(r, 150));

    const socketIdsAfter = getSocketIdsForUser(TEST_USER.userId);
    expect(socketIdsAfter.length).toBe(0);
  });
});
