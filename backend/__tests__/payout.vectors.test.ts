/**
 * #1584: the backend and the contracts agree on payouts.
 *
 * Both sides load `contracts/shared/test_vectors/payout.json`. The Rust test in
 * `contracts/shared/src/payout.rs` asserts the same file, so changing either
 * side without updating the vectors fails CI.
 *
 * Vector pools are settlement-time totals that include the bettor's stake. For
 * the quote check, the pools before the bet are derived by removing the stake.
 */
import fs from "fs";
import path from "path";
import * as betService from "../src/services/bet.service";
import * as db from "../src/db";
import { computePayout } from "../src/lib/payout";

jest.mock("../src/db", () => ({
  db: {
    market: { findUnique: jest.fn() },
  },
}));

const mockDb = db as unknown as { db: { market: { findUnique: jest.Mock } } };

interface Vector {
  name: string;
  side: "FighterA" | "FighterB";
  total_pool: string;
  winning_pool: string;
  stake: string;
  fee_bp: number;
  expected_payout: string;
  expected_fee: string;
}

const VECTORS_PATH = path.resolve(__dirname, "../../contracts/shared/test_vectors/payout.json");
const vectors: Vector[] = JSON.parse(fs.readFileSync(VECTORS_PATH, "utf8")).cases;

/** Markets store no per-market fee yet, so the quote always uses 2%. */
const QUOTE_FEE_BP = 200;

describe("settlement payout vectors (#1584)", () => {
  it("loads the shared vector set", () => {
    expect(vectors.length).toBeGreaterThanOrEqual(10);
  });

  describe("computePayout matches the contract for every vector", () => {
    it.each(vectors.map((v) => [v.name, v] as const))("%s", (_name, v) => {
      const result = computePayout({
        stake: BigInt(v.stake),
        totalPool: BigInt(v.total_pool),
        winningPool: BigInt(v.winning_pool),
        feeBp: BigInt(v.fee_bp),
      });
      expect(result.payout.toString()).toBe(v.expected_payout);
      expect(result.fee.toString()).toBe(v.expected_fee);
    });
  });

  describe("calculatePotentialPayout quotes the same settlement", () => {
    const quotable = vectors.filter((v) => BigInt(v.stake) > 0n && v.fee_bp === QUOTE_FEE_BP);

    beforeEach(() => {
      jest.clearAllMocks();
    });

    it.each(quotable.map((v) => [v.name, v] as const))("%s", async (_name, v) => {
      const stake = BigInt(v.stake);
      const total = BigInt(v.total_pool);
      const winning = BigInt(v.winning_pool);
      const otherSide = total - winning;

      // Pools as they stand before this bet is placed.
      const sidePre = winning - stake;
      mockDb.db.market.findUnique.mockResolvedValue({
        id: "market-vector",
        poolA: v.side === "FighterA" ? sidePre : otherSide,
        poolB: v.side === "FighterB" ? sidePre : otherSide,
        totalPool: total - stake,
      });

      const quote = await betService.calculatePotentialPayout("market-vector", v.side, stake);

      expect(quote.toString()).toBe(v.expected_payout);
    });
  });

  it("returns zero for a zero-winner pool through the quote path's arithmetic", () => {
    const zero = vectors.find((v) => v.name === "zero_winner_pool");
    expect(zero).toBeDefined();
    expect(computePayout({ stake: 0n, totalPool: 1_000_000n, winningPool: 0n, feeBp: 200n }).payout).toBe(0n);
  });
});
