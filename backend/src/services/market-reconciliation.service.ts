import client from "prom-client";
import { MarketStatus, Outcome } from "@prisma/client";
import { logger } from "../logger";

/**
 * B-114 / #1412: compares database market state with on-chain state and
 * reports (optionally repairs) drift.
 *
 * Store and chain access are injected so the matching rules can be tested
 * without a database or Soroban RPC. See market-reconciliation.job.ts for the
 * production wiring.
 */

export interface DbMarket {
  id: string;
  contractAddress: string;
  status: MarketStatus;
  outcome: Outcome | null;
  poolA: bigint;
  poolB: bigint;
  totalPool: bigint;
  scheduledAt: Date;
}

export interface OnChainMarket {
  status: MarketStatus;
  outcome: Outcome | null;
  poolA: bigint;
  poolB: bigint;
  totalPool: bigint;
}

export type DriftField = "status" | "outcome" | "poolA" | "poolB" | "totalPool";

export interface DriftEntry {
  field: DriftField;
  db: string | null;
  chain: string | null;
}

export interface ReconcileOptions {
  autoRepair?: boolean;
}

export interface ReconcileReport {
  marketId: string;
  drift: DriftEntry[];
  repaired: boolean;
}

export interface SweepOptions extends ReconcileOptions {
  sampleSize?: number;
  lookbackDays?: number;
  now?: Date;
}

export interface SweepReport {
  checked: number;
  drifted: number;
  failed: number;
  reports: ReconcileReport[];
}

export interface ReconcilerDeps {
  loadMarket(marketId: string): Promise<DbMarket | null>;
  /** Open markets plus any market scheduled on or after `since`, newest first. */
  sampleMarkets(args: { since: Date; take: number }): Promise<DbMarket[]>;
  repairMarket(marketId: string, data: Partial<OnChainMarket>): Promise<void>;
  readOnChain(contractAddress: string): Promise<OnChainMarket>;
}

const MARKET_STATUSES: readonly string[] = ["Open", "Locked", "Resolved", "Cancelled", "Disputed"];
const OUTCOMES: readonly string[] = ["FighterA", "FighterB", "Draw", "NoContest"];
const DEFAULT_SAMPLE_SIZE = 50;
const DEFAULT_LOOKBACK_DAYS = 30;

const driftCounter = (() => {
  const name = "market_reconciliation_drift_total";
  const existing = client.register.getSingleMetric(name);
  if (existing) return existing as client.Counter<"field">;
  return new client.Counter({
    name,
    help: "Market fields where the database disagreed with on-chain state",
    labelNames: ["field"],
  });
})();

/** Soroban enums arrive as a unit-variant vector, a `{ name }`/`{ tag }` object or a string. */
function enumVariant(value: unknown): string | undefined {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  if (value && typeof value === "object") {
    const v = value as Record<string, unknown>;
    if (typeof v.name === "string") return v.name;
    if (typeof v.tag === "string") return v.tag;
  }
  return undefined;
}

function toBigInt(value: unknown, field: string): bigint {
  if (typeof value === "bigint") return value;
  if (typeof value === "number" && Number.isInteger(value)) return BigInt(value);
  if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
  throw new Error(`On-chain ${field} is not an integer`);
}

/**
 * Maps the decoded `get_market_info()` struct onto the fields we reconcile.
 * An `Undetermined` outcome is stored as null, matching the database.
 * @throws {Error} If the status or a pool value is not in the expected shape.
 */
export function parseOnChainMarket(raw: Record<string, unknown>): OnChainMarket {
  const status = enumVariant(raw.status);
  if (!status || !MARKET_STATUSES.includes(status)) {
    throw new Error(`Unknown on-chain market status: ${String(status)}`);
  }

  const outcomeName = enumVariant(raw.outcome);
  const outcome = outcomeName && OUTCOMES.includes(outcomeName) ? (outcomeName as Outcome) : null;

  return {
    status: status as MarketStatus,
    outcome,
    poolA: toBigInt(raw.pool_a, "pool_a"),
    poolB: toBigInt(raw.pool_b, "pool_b"),
    totalPool: toBigInt(raw.total_pool, "total_pool"),
  };
}

/** Pure comparison of one database row with its on-chain counterpart. */
export function detectDrift(db: DbMarket, chain: OnChainMarket): DriftEntry[] {
  const fields: Array<[DriftField, unknown, unknown]> = [
    ["status", db.status, chain.status],
    ["outcome", db.outcome, chain.outcome],
    ["poolA", db.poolA, chain.poolA],
    ["poolB", db.poolB, chain.poolB],
    ["totalPool", db.totalPool, chain.totalPool],
  ];

  return fields
    .filter(([, dbValue, chainValue]) => String(dbValue ?? null) !== String(chainValue ?? null))
    .map(([field, dbValue, chainValue]) => ({
      field,
      db: dbValue == null ? null : String(dbValue),
      chain: chainValue == null ? null : String(chainValue),
    }));
}

export function createReconciler(deps: ReconcilerDeps) {
  async function reconcileMarket(
    marketId: string,
    options: ReconcileOptions = {},
  ): Promise<ReconcileReport> {
    const market = await deps.loadMarket(marketId);
    if (!market) {
      throw Object.assign(new Error(`Market not found: ${marketId}`), { code: "NOT_FOUND" });
    }

    const chain = await deps.readOnChain(market.contractAddress);
    const drift = detectDrift(market, chain);

    for (const entry of drift) {
      driftCounter.inc({ field: entry.field });
    }

    if (drift.length === 0) {
      return { marketId, drift, repaired: false };
    }

    logger.warn({ marketId, drift, autoRepair: !!options.autoRepair }, "market drift detected");

    if (!options.autoRepair) {
      return { marketId, drift, repaired: false };
    }

    const drifted = new Set(drift.map((d) => d.field));
    const repair: Partial<OnChainMarket> = {};
    if (drifted.has("status")) repair.status = chain.status;
    if (drifted.has("outcome")) repair.outcome = chain.outcome;
    if (drifted.has("poolA")) repair.poolA = chain.poolA;
    if (drifted.has("poolB")) repair.poolB = chain.poolB;
    if (drifted.has("totalPool")) repair.totalPool = chain.totalPool;

    await deps.repairMarket(marketId, repair);
    logger.info({ marketId, fields: [...drifted] }, "market repaired from on-chain state");
    return { marketId, drift, repaired: true };
  }

  async function runSweep(options: SweepOptions = {}): Promise<SweepReport> {
    const sampleSize = options.sampleSize ?? DEFAULT_SAMPLE_SIZE;
    const lookbackDays = options.lookbackDays ?? DEFAULT_LOOKBACK_DAYS;
    const now = options.now ?? new Date();
    const since = new Date(now.getTime() - lookbackDays * 24 * 60 * 60 * 1000);

    const candidates = await deps.sampleMarkets({ since, take: sampleSize });
    const report: SweepReport = { checked: 0, drifted: 0, failed: 0, reports: [] };

    for (const market of candidates) {
      try {
        const result = await reconcileMarket(market.id, options);
        report.checked += 1;
        if (result.drift.length > 0) {
          report.drifted += 1;
          report.reports.push(result);
        }
      } catch (err) {
        // One bad market or RPC error must not stop the rest of the sweep.
        report.failed += 1;
        logger.error(
          { marketId: market.id, err: (err as Error).message },
          "market reconciliation failed",
        );
      }
    }

    logger.info(
      { checked: report.checked, drifted: report.drifted, failed: report.failed },
      "market reconciliation sweep finished",
    );
    return report;
  }

  return { reconcileMarket, runSweep };
}
