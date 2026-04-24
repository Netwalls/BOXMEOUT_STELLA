/**
 * Integration tests — Password Reset Flow
 *
 * Covers:
 *  1. forgot-password → reset link sent (always same response)
 *  2. reset-password  → password updated successfully
 *  3. Old session token rejected after reset
 *  4. New login succeeds with new password
 *  5. Expired token rejected
 *  6. Already-used token rejected (replay attack)
 */

import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import {
  forgotPassword,
  resetPassword,
  login,
  isSessionRevoked,
  users,
} from '../../src/services/auth.service';

// ---------------------------------------------------------------------------
// Mock email service so no real SMTP calls are made
// ---------------------------------------------------------------------------
jest.mock('../../src/services/email.service', () => ({
  sendPasswordResetEmail: jest.fn().mockResolvedValue(undefined),
}));
import { sendPasswordResetEmail } from '../../src/services/email.service';

// ---------------------------------------------------------------------------
// Mock Redis so tests run without a live Redis instance
// ---------------------------------------------------------------------------
const redisStore = new Map<string, string>();
jest.mock('../../src/services/cache.service', () => ({
  redis: {
    set: jest.fn(async (key: string, value: string) => { redisStore.set(key, value); }),
    get: jest.fn(async (key: string) => redisStore.get(key) ?? null),
    incr: jest.fn(async (key: string) => {
      const v = parseInt(redisStore.get(key) ?? '0', 10) + 1;
      redisStore.set(key, String(v));
      return v;
    }),
    expire: jest.fn().mockResolvedValue(1),
    ttl: jest.fn().mockResolvedValue(60),
  },
}));

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
async function createTestUser(email: string, password: string) {
  const id = `user-${Date.now()}-${Math.random()}`;
  const passwordHash = await bcrypt.hash(password, 10);
  users.set(id, {
    id,
    email,
    passwordHash,
    twoFactorEnabled: false,
    sessionVersion: 0,
  });
  return id;
}

/** Extract the reset token that was passed to sendPasswordResetEmail */
function captureResetToken(): string {
  const mock = sendPasswordResetEmail as jest.Mock;
  const calls = mock.mock.calls;
  expect(calls.length).toBeGreaterThan(0);
  return calls[calls.length - 1][1] as string;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------
describe('Password Reset Flow', () => {
  beforeEach(() => {
    users.clear();
    redisStore.clear();
    (sendPasswordResetEmail as jest.Mock).mockClear();
  });

  // ── 1. forgot-password always returns the same response ─────────────────
  describe('forgotPassword()', () => {
    it('does not throw and sends email when user exists', async () => {
      await createTestUser('alice@example.com', 'OldPass123!');
      await expect(forgotPassword('alice@example.com')).resolves.toBeUndefined();
      expect(sendPasswordResetEmail).toHaveBeenCalledTimes(1);
      expect(sendPasswordResetEmail).toHaveBeenCalledWith(
        'alice@example.com',
        expect.any(String),
      );
    });

    it('does not throw and sends NO email when user does not exist (enumeration prevention)', async () => {
      await expect(forgotPassword('nobody@example.com')).resolves.toBeUndefined();
      expect(sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('stores a resetTokenHash on the user record', async () => {
      const id = await createTestUser('bob@example.com', 'OldPass123!');
      await forgotPassword('bob@example.com');
      const user = users.get(id)!;
      expect(user.resetTokenHash).toBeDefined();
      expect(typeof user.resetTokenHash).toBe('string');
    });

    it('issues a JWT with type=password_reset and 15-minute expiry', async () => {
      await createTestUser('carol@example.com', 'OldPass123!');
      await forgotPassword('carol@example.com');
      const token = captureResetToken();
      const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
      expect(payload.type).toBe('password_reset');
      // exp should be ~15 min from now (within a 5-second tolerance)
      const nowSec = Math.floor(Date.now() / 1000);
      expect(payload.exp).toBeGreaterThan(nowSec + 14 * 60);
      expect(payload.exp).toBeLessThanOrEqual(nowSec + 15 * 60 + 5);
    });
  });

  // ── 2. reset-password updates the password ───────────────────────────────
  describe('resetPassword()', () => {
    it('updates the password hash on success', async () => {
      const id = await createTestUser('dave@example.com', 'OldPass123!');
      await forgotPassword('dave@example.com');
      const token = captureResetToken();

      await resetPassword(token, 'NewPass456!');

      const user = users.get(id)!;
      const matches = await bcrypt.compare('NewPass456!', user.passwordHash);
      expect(matches).toBe(true);
    });

    it('clears resetTokenHash after use', async () => {
      const id = await createTestUser('eve@example.com', 'OldPass123!');
      await forgotPassword('eve@example.com');
      const token = captureResetToken();

      await resetPassword(token, 'NewPass456!');

      const user = users.get(id)!;
      expect(user.resetTokenHash).toBeUndefined();
    });

    it('increments sessionVersion on success', async () => {
      const id = await createTestUser('frank@example.com', 'OldPass123!');
      const versionBefore = users.get(id)!.sessionVersion;

      await forgotPassword('frank@example.com');
      const token = captureResetToken();
      await resetPassword(token, 'NewPass456!');

      const versionAfter = users.get(id)!.sessionVersion;
      expect(versionAfter).toBe(versionBefore + 1);
    });
  });

  // ── 3. Old session rejected after reset ──────────────────────────────────
  describe('Session invalidation', () => {
    it('marks old session version as revoked in Redis', async () => {
      const id = await createTestUser('grace@example.com', 'OldPass123!');
      const oldVersion = users.get(id)!.sessionVersion; // 0

      await forgotPassword('grace@example.com');
      const token = captureResetToken();
      await resetPassword(token, 'NewPass456!');

      const revoked = await isSessionRevoked(id, oldVersion);
      expect(revoked).toBe(true);
    });

    it('does not revoke the new session version', async () => {
      const id = await createTestUser('henry@example.com', 'OldPass123!');

      await forgotPassword('henry@example.com');
      const token = captureResetToken();
      await resetPassword(token, 'NewPass456!');

      const newVersion = users.get(id)!.sessionVersion;
      const revoked = await isSessionRevoked(id, newVersion);
      expect(revoked).toBe(false);
    });
  });

  // ── 4. New login succeeds with new password ───────────────────────────────
  describe('Login after reset', () => {
    it('allows login with the new password', async () => {
      await createTestUser('iris@example.com', 'OldPass123!');
      await forgotPassword('iris@example.com');
      const token = captureResetToken();
      await resetPassword(token, 'NewPass456!');

      const result = await login('iris@example.com', 'NewPass456!');
      expect(result).toHaveProperty('accessToken');
      expect(result).toHaveProperty('refreshToken');
    });

    it('rejects login with the old password after reset', async () => {
      await createTestUser('jack@example.com', 'OldPass123!');
      await forgotPassword('jack@example.com');
      const token = captureResetToken();
      await resetPassword(token, 'NewPass456!');

      await expect(login('jack@example.com', 'OldPass123!')).rejects.toMatchObject({
        statusCode: 401,
      });
    });
  });

  // ── 5. Expired token rejected ─────────────────────────────────────────────
  describe('Expired token', () => {
    it('rejects a token with exp in the past', async () => {
      const id = await createTestUser('kate@example.com', 'OldPass123!');

      // Manually craft an already-expired reset token
      const expiredToken = jwt.sign(
        { sub: id, type: 'password_reset' },
        JWT_SECRET,
        { expiresIn: -1 }, // expired 1 second ago
      );

      // Store its hash so the single-use check doesn't fire first
      const { createHash } = await import('crypto');
      const hash = createHash('sha256').update(expiredToken).digest('hex');
      users.get(id)!.resetTokenHash = hash;

      await expect(resetPassword(expiredToken, 'NewPass456!')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Invalid or expired reset token',
      });
    });
  });

  // ── 6. Already-used token rejected (replay attack) ───────────────────────
  describe('Single-use enforcement', () => {
    it('rejects a token that has already been consumed', async () => {
      await createTestUser('liam@example.com', 'OldPass123!');
      await forgotPassword('liam@example.com');
      const token = captureResetToken();

      // First use — should succeed
      await resetPassword(token, 'NewPass456!');

      // Second use — must be rejected
      await expect(resetPassword(token, 'AnotherPass789!')).rejects.toMatchObject({
        statusCode: 400,
      });
    });

    it('rejects a token when no resetTokenHash is stored (already consumed)', async () => {
      const id = await createTestUser('mia@example.com', 'OldPass123!');

      // Issue a valid token but do NOT store its hash (simulates post-use state)
      const token = jwt.sign(
        { sub: id, type: 'password_reset' },
        JWT_SECRET,
        { expiresIn: '15m' },
      );
      // resetTokenHash is undefined by default

      await expect(resetPassword(token, 'NewPass456!')).rejects.toMatchObject({
        statusCode: 400,
        message: 'Reset token has already been used',
      });
    });
  });
});
