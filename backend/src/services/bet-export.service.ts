/**
 * B-138: streaming CSV export of a wallet's bet history.
 *
 * Rows are read in keyset batches ordered by (placedAt desc, id desc) and
 * written out as they arrive, so the full history is never held in memory.
 */

import type { PrismaClient } from "@prisma/client";

export const EXPORT_BATCH_SIZE = 500;

export const EXPORT_COLUMNS = [
  "bet_id",
  "market_id",
  "side",
  "amount_stroops",
  "amount_xlm",
  "placed_at",
  "claimed",
  "payout_stroops",
  "payout_xlm",
  "tx_hash",
] as const;

/** Characters that make a spreadsheet treat a cell as a formula. */
const FORMULA_PREFIX = /^[=+\-@]/;

/**
 * Escapes one CSV cell. Values that a spreadsheet could execute as a formula
 * (leading =, +, -, @) get a single quote prefix; the cell is then quoted if
 * it contains a comma, quote or line break.
 */
export function csvCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value);
  if (FORMULA_PREFIX.test(text)) text = `'${text}`;
  if (/[",\r\n]/.test(text)) text = `"${text.replace(/"/g, '""')}"`;
  return text;
}

/** Formats an integer stroop amount as XLM with exactly 7 decimals. */
export function stroopsToXlm(stroops: bigint | null | undefined): string {
  if (stroops === null || stroops === undefined) return "";
  const negative = stroops < 0n;
  const abs = negative ? -stroops : stroops;
  const whole = abs / 10_000_000n;
  const frac = (abs % 10_000_000n).toString().padStart(7, "0");
  return `${negative ? "-" : ""}${whole}.${frac}`;
}

export interface ExportRange {
  from?: Date;
  to?: Date;
}

export interface ExportBet {
  id: string;
  marketId: string;
  side: string;
  amount: bigint;
  placedAt: Date;
  claimed: boolean;
  payout: bigint | null;
  txHash: string | null;
}

export function betToCsvRow(bet: ExportBet): string {
  return [
    bet.id,
    bet.marketId,
    bet.side,
    bet.amount.toString(),
    stroopsToXlm(bet.amount),
    bet.placedAt.toISOString(),
    bet.claimed,
    bet.payout === null ? "" : bet.payout.toString(),
    stroopsToXlm(bet.payout),
    bet.txHash ?? "",
  ]
    .map(csvCell)
    .join(",");
}

/**
 * Streams the CSV for one bettor. `write` receives the header first, then one
 * chunk per database batch. Returns the number of data rows written.
 */
export async function streamBetCsv(
  client: Pick<PrismaClient, "bet">,
  bettor: string,
  range: ExportRange,
  write: (chunk: string) => Promise<void> | void,
  batchSize: number = EXPORT_BATCH_SIZE,
): Promise<number> {
  await write(`${EXPORT_COLUMNS.join(",")}\r\n`);

  const placedAt: { gte?: Date; lte?: Date } = {};
  if (range.from) placedAt.gte = range.from;
  if (range.to) placedAt.lte = range.to;
  const baseWhere = {
    bettor,
    ...(Object.keys(placedAt).length > 0 ? { placedAt } : {}),
  };

  let cursor: { placedAt: Date; id: string } | null = null;
  let total = 0;

  for (;;) {
    const keyset = cursor
      ? {
          OR: [
            { placedAt: { lt: cursor.placedAt } },
            { placedAt: cursor.placedAt, id: { lt: cursor.id } },
          ],
        }
      : {};

    const rows: ExportBet[] = await client.bet.findMany({
      where: { ...baseWhere, ...keyset },
      orderBy: [{ placedAt: "desc" }, { id: "desc" }],
      take: batchSize,
    });

    if (rows.length === 0) break;

    await write(rows.map((row) => `${betToCsvRow(row)}\r\n`).join(""));
    total += rows.length;

    if (rows.length < batchSize) break;
    const last = rows[rows.length - 1];
    cursor = { placedAt: last.placedAt, id: last.id };
  }

  return total;
}
