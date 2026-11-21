/**
 * B-140: slow-query logging and duration histogram.
 *
 * timeQuery is driven with an injected clock, so a "slow" query is simulated
 * without waiting. Checks the threshold, the logged fields (no parameter
 * values), the histogram labels, the error path, and that the metric is
 * registered on the shared registry.
 */
import { timeQuery, type QueryTimingDeps } from "../src/lib/query-timing";
import { metricsRegistry } from "../src/metrics";

/** Clock that returns the given readings in order (start, end, ...). */
function clock(...readings: number[]) {
  let i = 0;
  return () => readings[Math.min(i++, readings.length - 1)];
}

function deps(overrides: Partial<QueryTimingDeps> = {}) {
  const observe = jest.fn();
  const warn = jest.fn();
  const d: QueryTimingDeps = { slowMs: 200, observe, warn, ...overrides };
  return { d, observe, warn };
}

describe("B-140 — timeQuery", () => {
  test("a stubbed slow query is logged at warn with model, action and duration", async () => {
    const { d, warn } = deps({ now: clock(1000, 1350) });

    await timeQuery({ model: "Market", action: "findMany" }, async () => "rows", d);

    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      { model: "Market", action: "findMany", durationMs: 350 },
      "slow database query",
    );
  });

  test("a fast query is not logged", async () => {
    const { d, warn } = deps({ now: clock(0, 12) });

    await timeQuery({ model: "Bet", action: "findUnique" }, async () => null, d);

    expect(warn).not.toHaveBeenCalled();
  });

  test("a query exactly at the threshold is not logged (only strictly slower)", async () => {
    const { d, warn } = deps({ slowMs: 200, now: clock(0, 200) });

    await timeQuery({ model: "Bet", action: "count" }, async () => 0, d);

    expect(warn).not.toHaveBeenCalled();
  });

  test("the log never includes query arguments or parameter values", async () => {
    const { d, warn } = deps({ now: clock(0, 500) });
    const wallet = "GSECRETWALLETADDRESS";

    await timeQuery({ model: "Bet", action: "findMany" }, async () => {
      void wallet; // argument stays inside the query
      return [];
    }, d);

    const logged = JSON.stringify(warn.mock.calls);
    expect(logged).not.toContain(wallet);
    expect(Object.keys(warn.mock.calls[0][0]).sort()).toEqual(["action", "durationMs", "model"]);
  });

  test("every query is observed in the histogram with model and action labels", async () => {
    const { d, observe } = deps({ now: clock(0, 250) });

    await timeQuery({ model: "Market", action: "update" }, async () => undefined, d);

    expect(observe).toHaveBeenCalledWith({ model: "Market", action: "update" }, 0.25);
  });

  test("a query without a model (raw SQL) is labelled 'raw'", async () => {
    const { d, observe } = deps({ now: clock(0, 10) });

    await timeQuery({ model: undefined, action: "queryRaw" }, async () => [], d);

    expect(observe).toHaveBeenCalledWith({ model: "raw", action: "queryRaw" }, 0.01);
  });

  test("a failing slow query is still observed and logged, and the error propagates", async () => {
    const { d, observe, warn } = deps({ now: clock(0, 900) });
    const failure = new Error("connection reset");

    await expect(
      timeQuery({ model: "Dispute", action: "create" }, async () => {
        throw failure;
      }, d),
    ).rejects.toBe(failure);

    expect(observe).toHaveBeenCalledTimes(1);
    expect(warn).toHaveBeenCalledWith(
      { model: "Dispute", action: "create", durationMs: 900 },
      "slow database query",
    );
  });
});

describe("B-140 — histogram registration", () => {
  test("db_query_duration_seconds is registered on the shared metrics registry", async () => {
    const metric = metricsRegistry.getSingleMetric("db_query_duration_seconds");
    expect(metric).toBeDefined();
  });
});
