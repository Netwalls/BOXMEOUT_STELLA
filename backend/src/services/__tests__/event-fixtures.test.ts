/**
 * B-115 / #1413 — golden contract event fixtures.
 *
 * Each fixture is a base64 ContractEvent XDR generated from the contracts'
 * test snapshots. These tests decode the XDR the way the indexer receives it
 * and check the event shape, so drift in topics or data fields fails here.
 */
import * as fs from "fs";
import * as path from "path";
import { scValToNative, StrKey, xdr } from "@stellar/stellar-sdk";

const FIXTURE_DIR = path.resolve(__dirname, "../../../fixtures/events");

interface Fixture {
  name: string;
  events: Array<{ contractId: string; xdr: string }>;
}

const fixtures: Fixture[] = fs
  .readdirSync(FIXTURE_DIR)
  .filter((f) => f.endsWith(".json"))
  .sort()
  .map((f) => JSON.parse(fs.readFileSync(path.join(FIXTURE_DIR, f), "utf8")) as Fixture);

function decode(base64: string) {
  const event = xdr.ContractEvent.fromXDR(base64, "base64");
  const v0 = event.body().v0();
  return {
    event,
    topics: v0.topics().map((t) => scValToNative(t)),
    data: scValToNative(v0.data()),
  };
}

describe("golden contract event fixtures", () => {
  it("contains one fixture per contract test snapshot", () => {
    expect(fixtures.length).toBeGreaterThanOrEqual(17);
  });

  it.each(fixtures.map((f) => [f.name, f] as const))("%s decodes and re-encodes byte-for-byte", (_name, fixture) => {
    expect(fixture.events.length).toBeGreaterThan(0);
    for (const entry of fixture.events) {
      const { event } = decode(entry.xdr);
      expect(event.toXDR("base64")).toBe(entry.xdr);
    }
  });

  it.each(fixtures.map((f) => [f.name, f] as const))("%s comes from the contract it names", (_name, fixture) => {
    for (const entry of fixture.events) {
      const { event } = decode(entry.xdr);
      const contractId = event.contractId();
      expect(contractId).not.toBeNull();
      expect(StrKey.encodeContract(contractId!)).toBe(entry.contractId);
    }
  });

  it.each(fixtures.map((f) => [f.name, f] as const))(
    "%s has a symbol topic matching its test name",
    (name, fixture) => {
      const expected = name.replace(/^test_emit_/, "");
      for (const entry of fixture.events) {
        const { topics } = decode(entry.xdr);
        expect(topics[0]).toBe(expected);
      }
    },
  );
});

describe("bet_placed event shape (the indexer's contract with the contract)", () => {
  const fixture = fixtures.find((f) => f.name === "test_emit_bet_placed");

  it("is present", () => {
    expect(fixture).toBeDefined();
  });

  it("carries market_id in the topic and the bet fields in the data map", () => {
    const { topics, data } = decode(fixture!.events[0].xdr);

    expect(topics).toEqual(["bet_placed", BigInt(4)]);
    expect(Object.keys(data as Record<string, unknown>).sort()).toEqual([
      "amount",
      "bet_id",
      "bettor",
      "claimed",
      "market_id",
      "placed_at",
      "side",
    ]);
    expect(data).toMatchObject({
      amount: BigInt(5000000),
      claimed: false,
      market_id: BigInt(4),
      placed_at: BigInt(1000000),
      side: 0,
    });
  });
});
