import { Request, Response, NextFunction } from "express";
import { BetSide } from "@prisma/client";
import { logger } from "../../logger";
import { z } from "zod";
import * as betService from "../../services/bet.service";

// Stellar public keys start with G and are 56 characters long
const stellarAddressRegex = /^G[A-Z0-9]{55}$/;

const betsByAddressQuerySchema = z.object({
  status: z.enum(["pending", "won", "lost", "claimed"]).optional(),
  marketId: z.string().optional(),
});

/**
 * GET /api/bets/:address
 */
export async function getBetsByAddressHandler(req: Request, res: Response): Promise<void> {
  const { address } = req.params;

  if (!stellarAddressRegex.test(address)) {
    res.status(400).json({ error: "Invalid Stellar address", code: "INVALID_ADDRESS" });
    return;
  }

  const parsed = betsByAddressQuerySchema.safeParse(req.query);
  if (!parsed.success) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: parsed.error.flatten(),
    });
    return;
  }

  const bets = await betService.getBetsByAddress(address, parsed.data);
  res.status(200).json(bets);
}

/**
 * GET /api/bets/:address/portfolio (issue #907)
 * Returns portfolio summary (total staked, winnings, ROI) for an address.
 * Returns zero-value summary (never 404) for unknown addresses.
 */
export async function getPortfolioHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { address } = req.params;

    // Basic Stellar public key validation (G..., 56 chars, base32)
    if (typeof address !== "string" || !address.startsWith("G") || address.length !== 56) {
      res.status(400).json({ error: "Invalid Stellar address format", code: "VALIDATION_ERROR" });
      return;
    }

    const portfolio = await betService.getPortfolioSummary(address);
    res.status(200).json(portfolio);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/bets/payout-estimate
 */
export async function getPayoutEstimateHandler(req: Request, res: Response): Promise<void> {
  const { market_id, side, amount } = req.query as Record<string, string>;

  if (!market_id || !side || !amount) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: { required: ["market_id", "side", "amount"] },
    });
    return;
  }

  if (!["FighterA", "FighterB"].includes(side)) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: { side: "must be FighterA or FighterB" },
    });
    return;
  }

  const parsedAmount = parseInt(amount, 10);
  if (isNaN(parsedAmount) || parsedAmount <= 0) {
    res.status(400).json({
      error: "Validation failed",
      code: "VALIDATION_ERROR",
      details: { amount: "must be a positive integer" },
    });
    return;
  }

  try {
    const estimatedPayout = await betService.calculatePotentialPayout(
      market_id,
      side as BetSide,
      BigInt(parsedAmount)
    );
    res.json({ data: { estimatedPayout: estimatedPayout.toString() } });
  } catch (err) {
    logger.error({ err }, "getPayoutEstimateHandler failed");
    res.status(500).json({ error: "Internal server error" });
  }
}
