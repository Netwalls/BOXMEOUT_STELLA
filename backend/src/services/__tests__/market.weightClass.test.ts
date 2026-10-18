import { db } from "../../db";
import { getAllMarkets } from "../market.service";
import { redis } from "../../lib/redis";

// #1394: the weight-class filter matches either fighter's JSON. Each run uses a
// weight class value nobody else has, so the rows and cache keys are its own.
const runId = Date.now().toString(36);
const weightClass = `WC-${runId}`;
const idPrefix = `wc-${runId}-`;

function marketRow(id: string, fighterA: object, fighterB: object) {
  return {
    id,
    contractAddress: `C${id.replace(/[^A-Za-z0-9]/g, "").toUpperCase()}`,
    fighterA,
    fighterB,
    scheduledAt: new Date("2030-01-01T00:00:00Z"),
    bettingEndsAt: new Date("2030-01-01T00:00:00Z"),
    createdAt: new Date("2029-01-01T00:00:00Z"),
    createdBy: "GCREATORWEIGHTCLASSTEST",
    oracleAddress: "GORACLEWEIGHTCLASSTEST",
  };
}

beforeAll(async () => {
  await db.market.createMany({
    data: [
      marketRow(`${idPrefix}a`, { name: "Alpha", weightClass }, { name: "Bravo", weightClass: "Other" }),
      marketRow(`${idPrefix}b`, { name: "Charlie", weightClass: "Other" }, { name: "Delta", weightClass }),
      marketRow(`${idPrefix}c`, { name: "Echo", weightClass: "Other" }, { name: "Foxtrot", weightClass: "Other" }),
    ],
  });
});

afterAll(async () => {
  await db.market.deleteMany({ where: { id: { startsWith: idPrefix } } });
  await db.$disconnect();
  await redis.quit();
});

describe("getAllMarkets weightClass filter (#1394)", () => {
  it("returns markets where either fighter has the weight class", async () => {
    const markets = await getAllMarkets({ weightClass }, { page: 1, pageSize: 20 });

    expect(markets.map((m) => m.id).sort()).toEqual([`${idPrefix}a`, `${idPrefix}b`]);
  });

  it("returns nothing for a weight class no fighter has", async () => {
    const markets = await getAllMarkets({ weightClass: `none-${runId}` }, { page: 1, pageSize: 20 });

    expect(markets).toEqual([]);
  });
});
