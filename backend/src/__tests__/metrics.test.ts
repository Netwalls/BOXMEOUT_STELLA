/**
 * B-112 / #1410: the indexer and Soroban RPC metrics are registered with the
 * names operators alert on, and the RPC timer records calls that throw too.
 */
import {
  metricsRegistry,
  indexerLastLedger,
  indexerEventProcessSeconds,
  sorobanRpcRequestSeconds,
  observeSorobanRpc,
} from "../metrics";

describe("B-112 / #1410: indexer metrics", () => {
  beforeEach(() => {
    sorobanRpcRequestSeconds.reset();
  });

  it("registers the metric names used by the alert rules", () => {
    expect(metricsRegistry.getSingleMetric("indexer_last_ledger")).toBe(indexerLastLedger);
    expect(metricsRegistry.getSingleMetric("indexer_event_process_seconds")).toBe(
      indexerEventProcessSeconds
    );
    expect(metricsRegistry.getSingleMetric("soroban_rpc_request_seconds")).toBe(
      sorobanRpcRequestSeconds
    );
  });

  it("records one RPC sample labelled by method", async () => {
    const result = await observeSorobanRpc("getEvents", async () => "ok");

    expect(result).toBe("ok");
    const { values } = await sorobanRpcRequestSeconds.get();
    const count = values.find(
      (v) => v.metricName === "soroban_rpc_request_seconds_count" && v.labels.method === "getEvents"
    );
    expect(count?.value).toBe(1);
  });

  it("records the duration and rethrows when the RPC call fails", async () => {
    await expect(
      observeSorobanRpc("getLatestLedger", async () => {
        throw new Error("rpc down");
      })
    ).rejects.toThrow("rpc down");

    const { values } = await sorobanRpcRequestSeconds.get();
    const count = values.find(
      (v) =>
        v.metricName === "soroban_rpc_request_seconds_count" &&
        v.labels.method === "getLatestLedger"
    );
    expect(count?.value).toBe(1);
  });
});
