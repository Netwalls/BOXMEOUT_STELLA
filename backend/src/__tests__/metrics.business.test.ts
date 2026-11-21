/**
 * B-131: business metrics are readable from the registry and carry only bounded
 * label values.
 */
jest.mock("../db", () => ({
  db: {
    market: {
      groupBy: jest.fn().mockResolvedValue([
        { status: "Open", _count: { _all: 2 } },
        { status: "Locked", _count: { _all: 1 } },
      ]),
    },
  },
}));

import {
  metricsRegistry,
  recordBetPlaced,
  oracleSubmissionsTotal,
  resolutionQueueWaiting,
  setResolutionQueueForMetrics,
  sseConnections,
} from "../metrics";

async function scrape(name: string): Promise<string> {
  const metric = await metricsRegistry.getSingleMetricAsString(name);
  return metric;
}

describe("business metrics (B-131)", () => {
  beforeEach(() => {
    metricsRegistry.resetMetrics();
  });

  it("counts bets by side and sums stake volume in stroops", async () => {
    recordBetPlaced({ side: "FighterA", amount: "1500" });
    recordBetPlaced({ side: "FighterB", amount: 500 });
    recordBetPlaced({ side: "0xdeadbeef-not-a-side", amount: "oops" });

    const counts = await scrape("bets_placed_total");
    expect(counts).toContain('bets_placed_total{side="FighterA"} 1');
    expect(counts).toContain('bets_placed_total{side="FighterB"} 1');
    expect(counts).toContain('bets_placed_total{side="unknown"} 1');
    expect(counts).not.toContain("0xdeadbeef");

    const volume = await scrape("bet_volume_stroops_total");
    expect(volume).toContain("bet_volume_stroops_total 2000");
  });

  it("labels oracle submissions by result", async () => {
    oracleSubmissionsTotal.inc({ result: "accepted" });
    oracleSubmissionsTotal.inc({ result: "rejected" });
    const out = await scrape("oracle_submissions_total");
    expect(out).toContain('oracle_submissions_total{result="accepted"} 1');
    expect(out).toContain('oracle_submissions_total{result="rejected"} 1');
  });

  it("samples market status counts on scrape", async () => {
    const out = await scrape("markets_by_status");
    expect(out).toContain('markets_by_status{status="Open"} 2');
    expect(out).toContain('markets_by_status{status="Locked"} 1');
  });

  it("samples resolution queue depth from the registered queue", async () => {
    setResolutionQueueForMetrics({
      getWaitingCount: async () => 4,
      getFailedCount: async () => 0,
    } as never);
    const out = await scrape("resolution_queue_waiting");
    expect(out).toContain("resolution_queue_waiting 4");
    expect(resolutionQueueWaiting).toBeDefined();
  });

  it("tracks open SSE connections", async () => {
    sseConnections.inc();
    sseConnections.inc();
    sseConnections.dec();
    expect(await scrape("sse_connections")).toContain("sse_connections 1");
  });
});
