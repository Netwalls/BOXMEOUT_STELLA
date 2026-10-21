import type { Request, Response, NextFunction } from "express";

/**
 * Binds the body's `createdBy` to the wallet that signed the challenge.
 *
 * Must run after walletAuthMiddleware, which sets `req.walletAddress`.
 * Responds 401 when no authenticated wallet is present and 403 when the body
 * names a different address, so a caller cannot create markets on behalf of
 * someone else.
 */
export function enforceCreatorBinding(req: Request, res: Response, next: NextFunction): void {
  const walletAddress = (req as Request & { walletAddress?: string }).walletAddress;
  if (!walletAddress) {
    res.status(401).json({ error: "Wallet signature required", code: "WALLET_AUTH_REQUIRED" });
    return;
  }

  const createdBy = (req.body as { createdBy?: unknown } | undefined)?.createdBy;
  if (createdBy !== walletAddress) {
    res.status(403).json({
      error: "createdBy must match the authenticated wallet",
      code: "CREATOR_MISMATCH",
    });
    return;
  }

  next();
}
