import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

// ---------------------------------------------------------------------------
// Transporter — configure via env vars.
// For production use SMTP_HOST/PORT/USER/PASS.
// Falls back to Ethereal (catch-all test account) when env vars are absent.
// ---------------------------------------------------------------------------
function createTransporter() {
  const host = process.env.SMTP_HOST;
  const port = parseInt(process.env.SMTP_PORT ?? '587', 10);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (host && user && pass) {
    return nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user, pass },
    });
  }

  // Development fallback — logs preview URL to console
  logger.warn('SMTP env vars not set; using nodemailer stub transport (emails will not be delivered)');
  return nodemailer.createTransport({ jsonTransport: true });
}

const transporter = createTransporter();

const APP_NAME = process.env.APP_NAME ?? 'BoxMeOut';
const APP_BASE_URL = process.env.APP_BASE_URL ?? 'http://localhost:3001';
const FROM_ADDRESS = process.env.SMTP_FROM ?? `no-reply@boxmeout.app`;

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Send a password-reset email containing a signed JWT link.
 * Failures are caught and logged — never thrown — so the caller cannot
 * distinguish "email sent" from "email failed" (prevents enumeration).
 */
export async function sendPasswordResetEmail(
  toEmail: string,
  resetToken: string,
): Promise<void> {
  const resetUrl = `${APP_BASE_URL}/auth/reset-password?token=${resetToken}`;

  const html = `
    <p>Hi,</p>
    <p>We received a request to reset your <strong>${APP_NAME}</strong> password.</p>
    <p>
      <a href="${resetUrl}" style="
        display:inline-block;
        padding:10px 20px;
        background:#4f46e5;
        color:#fff;
        border-radius:4px;
        text-decoration:none;
      ">Reset my password</a>
    </p>
    <p><strong>⚠ This link expires in 15 minutes.</strong></p>
    <p>If you did not request a password reset, you can safely ignore this email.</p>
    <p>— The ${APP_NAME} team</p>
  `;

  const text = [
    `Reset your ${APP_NAME} password`,
    '',
    `Visit the link below to reset your password (expires in 15 minutes):`,
    resetUrl,
    '',
    'If you did not request a password reset, ignore this email.',
  ].join('\n');

  try {
    const info = await transporter.sendMail({
      from: `"${APP_NAME}" <${FROM_ADDRESS}>`,
      to: toEmail,
      subject: `Reset your ${APP_NAME} password`,
      text,
      html,
    });

    // In dev the jsonTransport serialises the message — log it for inspection
    if (process.env.NODE_ENV !== 'production') {
      logger.info({ msg: 'Password reset email (dev)', messageId: info.messageId });
    }
  } catch (err) {
    // Log but swallow — callers must not learn whether delivery succeeded
    logger.error({ msg: 'Failed to send password reset email', error: err });
  }
}
