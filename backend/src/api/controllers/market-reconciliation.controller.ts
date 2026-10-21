import { Request, Response, NextFunction } from "express";
import { reconciler } from "../../jobs/market-reconciliation.job";

/**
 * POST /api/admin/markets/:id/reconcile (issue #1412)
 * Body (optional): { autoRepair?: boolean }
 *
 * Compares one market with on-chain state. Returns 200 with the drift report,
 * or 404 if the market does not exist.
 */
export async function reconcileMarketHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const marketId = String(req.params.id);
    const autoRepair = (req.body as { autoRepair?: unknown } | undefined)?.autoRepair === true;

    const report = await reconciler.reconcileMarket(marketId, { autoRepair });
    res.status(200).json(report);
  } catch (err) {
    if ((err as { code?: string }).code === "NOT_FOUND") {
      res.status(404).json({ error: (err as Error).message });
      return;
    }
    next(err);
  }
}
