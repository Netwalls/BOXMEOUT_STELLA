import * as OTPAuth from 'otpauth';
import { generateSecret, generateQRCode, verifyToken } from '../../src/services/totp.service';

describe('totp.service', () => {
  let secret: string;
  let otpauthUrl: string;

  beforeEach(() => {
    ({ secret, otpauthUrl } = generateSecret('test@example.com'));
  });

  describe('generateSecret', () => {
    it('returns a base32 secret and otpauth URL', () => {
      expect(secret).toMatch(/^[A-Z2-7]+=*$/);
      expect(otpauthUrl).toMatch(/^otpauth:\/\/totp\//);
      expect(otpauthUrl).toContain('BOXMEOUT');
    });
  });

  describe('generateQRCode', () => {
    it('returns a data URL', async () => {
      const qr = await generateQRCode(otpauthUrl);
      expect(qr).toMatch(/^data:image\/png;base64,/);
    });
  });

  describe('verifyToken', () => {
    it('accepts a valid current OTP', () => {
      const totp = new OTPAuth.TOTP({
        algorithm: 'SHA1',
        digits: 6,
        period: 30,
        secret: OTPAuth.Secret.fromBase32(secret),
      });
      const validOtp = totp.generate();
      expect(verifyToken(secret, validOtp)).toBe(true);
    });

    it('rejects a wrong OTP', () => {
      expect(verifyToken(secret, '000000')).toBe(false);
    });

    it('rejects an OTP with wrong length', () => {
      expect(verifyToken(secret, '12345')).toBe(false);
    });

    it('rejects an empty string', () => {
      expect(verifyToken(secret, '')).toBe(false);
    });
  });
});
