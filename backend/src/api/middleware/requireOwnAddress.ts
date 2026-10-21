import type { Request, Response, NextFunction } from "express";
import { fail } from "../response";

/**
 * Must run after walletAuthMiddleware. Rejects the request unless the wallet
 * that passed the signature check is the address in the `:address` path param,
 * so a signed-in wallet can only act on its own account.
 *
 * Returns 403 { error, code: "FORBIDDEN" } on mismatch.
 */
export function requireOwnAddress(req: Request, res: Response, next: NextFunction): void {
  const walletAddress = (req as Request & { walletAddress?: string }).walletAddress;

  if (!walletAddress || walletAddress !== req.params.address) {
    fail(res, 403, "FORBIDDEN", "Wallet does not own this address");
    return;
  }

  next();
}
