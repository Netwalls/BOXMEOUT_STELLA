import jwt from 'jsonwebtoken';
import bcrypt from 'bcrypt';
import { encrypt, decrypt } from './crypto.service';
import { generateSecret, generateQRCode, verifyToken } from './totp.service';
import { sendPasswordResetEmail } from './email.service';
import { redis } from './cache.service';
import { AppError } from '../utils/AppError';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN ?? '7d';
const TEMP_TOKEN_EXPIRES_IN = '5m';
const RESET_TOKEN_EXPIRES_IN = '15m';
const BCRYPT_ROUNDS = 12;

// ---------------------------------------------------------------------------
// In-memory user store — replace with DB queries in production
// ---------------------------------------------------------------------------
interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  twoFactorSecret?: string;   // AES-GCM encrypted base32 secret
  twoFactorEnabled: boolean;
  /**
   * Monotonically increasing version number.
   * Stored inside every issued access/refresh token.
   * Incrementing it instantly invalidates all previously issued tokens.
   */
  sessionVersion: number;
  /**
   * SHA-256 hash of the most recently issued password-reset JWT.
   * Cleared on use so the token can only be consumed once.
   */
  resetTokenHash?: string;
}

export const users = new Map<string, UserRecord>();

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
function signAccess(userId: string, sessionVersion: number): string {
  return jwt.sign(
    { sub: userId, type: 'access', sv: sessionVersion },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions,
  );
}

function signRefresh(userId: string, sessionVersion: number): string {
  return jwt.sign(
    { sub: userId, type: 'refresh', sv: sessionVersion },
    JWT_SECRET,
    { expiresIn: REFRESH_EXPIRES_IN } as jwt.SignOptions,
  );
}

function signTemp(userId: string): string {
  return jwt.sign({ sub: userId, type: 'temp_2fa' }, JWT_SECRET, {
    expiresIn: TEMP_TOKEN_EXPIRES_IN,
  } as jwt.SignOptions);
}

function signReset(userId: string): string {
  return jwt.sign({ sub: userId, type: 'password_reset' }, JWT_SECRET, {
    expiresIn: RESET_TOKEN_EXPIRES_IN,
  } as jwt.SignOptions);
}

function verifyJwt(token: string, expectedType: string): jwt.JwtPayload {
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  if (payload.type !== expectedType) throw new AppError(401, 'Invalid token type');
  return payload;
}

/** SHA-256 hex digest of a string — used to fingerprint reset tokens */
async function sha256(input: string): Promise<string> {
  const { createHash } = await import('crypto');
  return createHash('sha256').update(input).digest('hex');
}

// ---------------------------------------------------------------------------
// Session invalidation via Redis
// ---------------------------------------------------------------------------

/**
 * Key pattern: `session:blocked:<userId>:<sessionVersion>`
 * We store a tombstone in Redis so that even tokens still within their JWT
 * expiry window are rejected after a password reset.
 *
 * In production you would query this in your auth middleware on every request.
 */
async function blockOldSessions(userId: string, oldVersion: number): Promise<void> {
  // Block every version up to and including the old one.
  // TTL matches the longest-lived token (refresh = 7 days).
  const SEVEN_DAYS = 7 * 24 * 60 * 60;
  for (let v = 0; v <= oldVersion; v++) {
    await redis.set(`session:blocked:${userId}:${v}`, '1', 'EX', SEVEN_DAYS);
  }
}

/**
 * Returns true when the session version carried in a token has been revoked.
 * Call this in your auth middleware after verifying the JWT signature.
 */
export async function isSessionRevoked(userId: string, sessionVersion: number): Promise<boolean> {
  const key = `session:blocked:${userId}:${sessionVersion}`;
  const val = await redis.get(key);
  return val !== null;
}

// ---------------------------------------------------------------------------
// Auth service
// ---------------------------------------------------------------------------

/** Stub login — replace with real password check against DB */
export async function login(
  email: string,
  password: string,
): Promise<{ accessToken: string; refreshToken: string } | { requires2FA: true; tempToken: string }> {
  const user = [...users.values()].find((u) => u.email === email);
  if (!user) throw new AppError(401, 'Invalid credentials');

  const passwordValid = await bcrypt.compare(password, user.passwordHash);
  if (!passwordValid) throw new AppError(401, 'Invalid credentials');

  if (user.twoFactorEnabled) {
    return { requires2FA: true, tempToken: signTemp(user.id) };
  }

  return {
    accessToken: signAccess(user.id, user.sessionVersion),
    refreshToken: signRefresh(user.id, user.sessionVersion),
  };
}

// ---------------------------------------------------------------------------
// Password reset flow
// ---------------------------------------------------------------------------

/**
 * POST /auth/forgot-password
 *
 * Always returns the same response regardless of whether the email exists
 * to prevent user enumeration attacks.
 */
export async function forgotPassword(email: string): Promise<void> {
  const user = [...users.values()].find((u) => u.email === email);

  // No user → do nothing but don't reveal that fact to the caller
  if (!user) return;

  const resetToken = signReset(user.id);
  const tokenHash = await sha256(resetToken);

  // Store hash so we can verify single-use on consumption
  user.resetTokenHash = tokenHash;
  users.set(user.id, user);

  // Fire-and-forget — failures are swallowed inside sendPasswordResetEmail
  await sendPasswordResetEmail(user.email, resetToken);
}

/**
 * POST /auth/reset-password
 *
 * Validates the reset token, hashes the new password, updates the user
 * record, and invalidates all existing sessions.
 */
export async function resetPassword(token: string, newPassword: string): Promise<void> {
  // 1. Verify JWT signature and expiry
  let payload: jwt.JwtPayload;
  try {
    payload = verifyJwt(token, 'password_reset');
  } catch {
    throw new AppError(400, 'Invalid or expired reset token');
  }

  const userId = payload.sub as string;
  const user = users.get(userId);
  if (!user) throw new AppError(400, 'Invalid or expired reset token');

  // 2. Verify single-use: token hash must match what we stored
  if (!user.resetTokenHash) {
    throw new AppError(400, 'Reset token has already been used');
  }

  const incomingHash = await sha256(token);
  if (incomingHash !== user.resetTokenHash) {
    throw new AppError(400, 'Invalid or expired reset token');
  }

  // 3. Consume the token immediately (single-use enforcement)
  user.resetTokenHash = undefined;

  // 4. Hash the new password
  const passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
  user.passwordHash = passwordHash;

  // 5. Invalidate all existing sessions by bumping the session version
  const oldVersion = user.sessionVersion;
  user.sessionVersion = oldVersion + 1;

  users.set(user.id, user);

  // 6. Write tombstones to Redis so in-flight tokens are rejected immediately
  await blockOldSessions(userId, oldVersion);
}

// ---------------------------------------------------------------------------
// 2FA service
// ---------------------------------------------------------------------------

/** Step 1: generate secret + QR code; does NOT enable 2FA yet */
export async function setup2FA(
  userId: string,
): Promise<{ qrCode: string; secret: string }> {
  const user = users.get(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (user.twoFactorEnabled) throw new AppError(400, '2FA already enabled');

  const { secret, otpauthUrl } = generateSecret(user.email);
  user.twoFactorSecret = encrypt(secret);
  users.set(userId, user);

  const qrCode = await generateQRCode(otpauthUrl);
  return { qrCode, secret };
}

/** Step 2: confirm OTP to activate 2FA */
export async function enable2FA(userId: string, otp: string): Promise<void> {
  const user = users.get(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (user.twoFactorEnabled) throw new AppError(400, '2FA already enabled');
  if (!user.twoFactorSecret) throw new AppError(400, 'Run /auth/2fa/setup first');

  const secret = decrypt(user.twoFactorSecret);
  if (!verifyToken(secret, otp)) throw new AppError(401, 'Invalid or expired OTP');

  user.twoFactorEnabled = true;
  users.set(userId, user);
}

/** Disable 2FA — requires current OTP */
export async function disable2FA(userId: string, otp: string): Promise<void> {
  const user = users.get(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (!user.twoFactorEnabled) throw new AppError(400, '2FA is not enabled');

  const secret = decrypt(user.twoFactorSecret!);
  if (!verifyToken(secret, otp)) throw new AppError(401, 'Invalid or expired OTP');

  user.twoFactorEnabled = false;
  user.twoFactorSecret = undefined;
  users.set(userId, user);
}

/** Second-step login: verify OTP from temp token, issue final JWT pair */
export async function verify2FA(
  tempToken: string,
  otp: string,
): Promise<{ accessToken: string; refreshToken: string }> {
  const payload = verifyJwt(tempToken, 'temp_2fa');
  const userId = payload.sub as string;

  const user = users.get(userId);
  if (!user || !user.twoFactorEnabled || !user.twoFactorSecret) {
    throw new AppError(401, 'Invalid session');
  }

  const secret = decrypt(user.twoFactorSecret);
  if (!verifyToken(secret, otp)) throw new AppError(401, 'Invalid or expired OTP');

  return {
    accessToken: signAccess(userId, user.sessionVersion),
    refreshToken: signRefresh(userId, user.sessionVersion),
  };
}
