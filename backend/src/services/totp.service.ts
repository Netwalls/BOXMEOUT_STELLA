import * as OTPAuth from 'otpauth';
import * as QRCode from 'qrcode';

export function generateSecret(accountName: string): { secret: string; otpauthUrl: string } {
  const totp = new OTPAuth.TOTP({
    issuer: 'BOXMEOUT',
    label: accountName,
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: new OTPAuth.Secret(),
  });
  return { secret: totp.secret.base32, otpauthUrl: totp.toString() };
}

export async function generateQRCode(otpauthUrl: string): Promise<string> {
  return QRCode.toDataURL(otpauthUrl);
}

export function verifyToken(secret: string, token: string): boolean {
  const totp = new OTPAuth.TOTP({
    algorithm: 'SHA1',
    digits: 6,
    period: 30,
    secret: OTPAuth.Secret.fromBase32(secret),
  });
  // delta null means invalid; allow ±1 window for clock skew
  return totp.validate({ token, window: 1 }) !== null;
}
