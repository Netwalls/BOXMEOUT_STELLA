import { Request, Response, NextFunction } from "express";
import { Keypair } from "@stellar/stellar-sdk";

/**
 * End-user wallet authentication middleware.
 *
 * Scheme: Stellar keypair signature over a timestamped message.
 *
 * The client must provide:
 *   x-wallet-signature  — base64-encoded Ed25519 signature
 *   x-wallet-message    — the exact string that was signed
 *                         (must contain a 13-digit epoch ms timestamp for replay protection)
 *
 * The address being authenticated is taken from `req.params.address`.
 *
 * Used on routes where the caller must prove ownership of their own wallet
 * (e.g. PUT /api/users/:address).  For admin/oracle routes that use a
 * whitelisted address and a server-issued challenge, see walletAuth.middleware.ts.
 */
export function requireWalletAuth(req: Request, res: Response, next: NextFunction): void {
  const address = req.params.address;
  const signature = req.headers["x-wallet-signature"] as string | undefined;
  const message = req.headers["x-wallet-message"] as string | undefined;

  if (!address || !signature || !message) {
    res.status(401).json({
      error: "Missing wallet authentication headers",
      code: "UNAUTHORIZED",
    });
    return;
  }

  // Replay protection: message must contain a 13-digit epoch timestamp
  const timestampMatch = message.match(/\d{13}/);
  if (!timestampMatch) {
    res.status(400).json({
      error: "Message must contain a 13-digit epoch timestamp",
      code: "INVALID_MESSAGE",
    });
    return;
  }

  const timestamp = parseInt(timestampMatch[0], 10);
  const fiveMinutes = 5 * 60 * 1000;
  if (Date.now() - timestamp > fiveMinutes) {
    res.status(401).json({
      error: "Signature expired",
      code: "SIGNATURE_EXPIRED",
    });
    return;
  }

  try {
    const keypair = Keypair.fromPublicKey(address);
    const isValid = keypair.verify(
      Buffer.from(message),
      Buffer.from(signature, "base64")
    );

    if (!isValid) {
      res.status(403).json({ error: "Invalid signature", code: "FORBIDDEN" });
      return;
    }

    next();
  } catch {
    res.status(400).json({
      error: "Invalid wallet address or signature format",
      code: "INVALID_WALLET_ADDRESS",
    });
  }
}
