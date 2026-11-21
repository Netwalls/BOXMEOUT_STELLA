import type { NextFunction, Request, Response } from "express";
import { db } from "../../db";
import { streamBetCsv } from "../../services/bet-export.service";
import { fail } from "../response";

function parseDate(value: unknown): Date | null | "invalid" {
  if (value === undefined || value === "") return null;
  if (typeof value !== "string") return "invalid";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "invalid" : date;
}

/**
 * B-138: GET /api/bets/:address/export?format=csv&from=&to=
 * Streams the bet history as CSV. Must run after walletAuth + requireOwnAddress.
 */
export async function exportBetsCsvHandler(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  const format = req.query.format ?? "csv";
  if (format !== "csv") {
    fail(res, 400, "VALIDATION_ERROR", "format must be csv");
    return;
  }

  const from = parseDate(req.query.from);
  const to = parseDate(req.query.to);
  if (from === "invalid" || to === "invalid") {
    fail(res, 400, "VALIDATION_ERROR", "from and to must be ISO-8601 dates");
    return;
  }
  if (from && to && from > to) {
    fail(res, 400, "VALIDATION_ERROR", "from must be before to");
    return;
  }

  const address = req.params.address;
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="bets-${address}.csv"`);

  try {
    await streamBetCsv(db, address, { from: from ?? undefined, to: to ?? undefined }, async (chunk) => {
      if (!res.write(chunk)) {
        await new Promise<void>((resolve) => res.once("drain", () => resolve()));
      }
    });
    res.end();
  } catch (err) {
    // Headers are already sent once streaming starts; end the response instead.
    if (res.headersSent) {
      res.destroy(err as Error);
      return;
    }
    next(err);
  }
}
