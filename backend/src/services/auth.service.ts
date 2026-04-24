import jwt from 'jsonwebtoken';
import { encrypt, decrypt } from './crypto.service';
import { generateSecret, generateQRCode, verifyToken } from './totp.service';
import { AppError } from '../utils/AppError';

const JWT_SECRET = process.env.JWT_SECRET ?? 'dev-jwt-secret-change-me';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN ?? '15m';
const REFRESH_EXPIRES_IN = process.env.REFRESH_EXPIRES_IN ?? '7d';
const TEMP_TOKEN_EXPIRES_IN = '5m';

// ---------------------------------------------------------------------------
// In-memory user store — replace with DB queries in production
// ---------------------------------------------------------------------------
interface UserRecord {
  id: string;
  email: string;
  passwordHash: string;
  twoFactorSecret?: string;   // AES-GCM encrypted base32 secret
  twoFactorEnabled: boolean;
}

const users = new Map<string, UserRecord>();

// ---------------------------------------------------------------------------
// JWT helpers
// ---------------------------------------------------------------------------
function signAccess(userId: string): string {
  return jwt.sign({ sub: userId, type: 'access' }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as jwt.SignOptions);
}

function signRefresh(userId: string): string {
  return jwt.sign({ sub: userId, type: 'refresh' }, JWT_SECRET, { expiresIn: REFRESH_EXPIRES_IN } as jwt.SignOptions);
}

function signTemp(userId: string): string {
  return jwt.sign({ sub: userId, type: 'temp_2fa' }, JWT_SECRET, { expiresIn: TEMP_TOKEN_EXPIRES_IN } as jwt.SignOptions);
}

function verifyJwt(token: string, expectedType: string): jwt.JwtPayload {
  const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
  if (payload.type !== expectedType) throw new AppError(401, 'Invalid token type');
  return payload;
}

// ---------------------------------------------------------------------------
// Auth service
// ---------------------------------------------------------------------------

/** Stub login — replace with real password check against DB */
export async function login(
  email: string,
  _password: string,
): Promise<{ accessToken: string; refreshToken: string } | { requires2FA: true; tempToken: string }> {
  const user = [...users.values()].find((u) => u.email === email);
  if (!user) throw new AppError(401, 'Invalid credentials');

  // TODO: verify bcrypt hash against _password

  if (user.twoFactorEnabled) {
    return { requires2FA: true, tempToken: signTemp(user.id) };
  }

  return { accessToken: signAccess(user.id), refreshToken: signRefresh(user.id) };
}

/** Step 1: generate secret + QR code; does NOT enable 2FA yet */
export async function setup2FA(
  userId: string,
): Promise<{ qrCode: string; secret: string }> {
  const user = users.get(userId);
  if (!user) throw new AppError(404, 'User not found');
  if (user.twoFactorEnabled) throw new AppError(400, '2FA already enabled');

  const { secret, otpauthUrl } = generateSecret(user.email);
  // Store encrypted pending secret (not yet enabled)
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

  return { accessToken: signAccess(userId), refreshToken: signRefresh(userId) };
}

/** Expose users map for testing only */
export { users };
