/**
 * B-115 / #1413: exports the contracts' emitted events as base64 XDR.
 *
 * Source: contracts/shared/test_snapshots/events/tests/*.json (the Soroban
 * test snapshots, written as ScVal JSON).
 * Output: backend/fixtures/events/<test name>.json, one file per snapshot,
 * each holding the base64 `ContractEvent` XDR the network would deliver.
 *
 * Usage:
 *   npx ts-node scripts/export-event-fixtures.ts          # write fixtures
 *   npx ts-node scripts/export-event-fixtures.ts --check  # exit 1 if stale
 *
 * CI runs --check so a contract event shape change without regenerated
 * fixtures fails the build.
 */
import * as fs from "fs";
import * as path from "path";
import {
  Address,
  nativeToScVal,
  StrKey,
  xdr,
} from "@stellar/stellar-sdk";

const REPO_ROOT = path.resolve(__dirname, "..", "..");
export const SNAPSHOT_DIR = path.join(REPO_ROOT, "contracts/shared/test_snapshots/events/tests");
export const FIXTURE_DIR = path.join(REPO_ROOT, "backend/fixtures/events");

type ScValJson =
  | { symbol: string }
  | { string: string }
  | { u32: number }
  | { u64: string }
  | { i128: string }
  | { bool: boolean }
  | { bytes: string }
  | { address: string }
  | { vec: ScValJson[] }
  | { map: Array<{ key: ScValJson; val: ScValJson }> };

interface SnapshotEvent {
  event: {
    contract_id: string;
    body: { v0: { topics: ScValJson[]; data: ScValJson } };
  };
  failed_call: boolean;
}

interface Snapshot {
  events: SnapshotEvent[];
}

export interface EventFixture {
  name: string;
  events: Array<{ contractId: string; xdr: string }>;
}

/** Converts one ScVal-JSON value into the stellar-sdk ScVal it encodes. */
export function scValFromJson(value: ScValJson): xdr.ScVal {
  if ("symbol" in value) return xdr.ScVal.scvSymbol(value.symbol);
  if ("string" in value) return xdr.ScVal.scvString(value.string);
  if ("bool" in value) return xdr.ScVal.scvBool(value.bool);
  if ("u32" in value) return nativeToScVal(value.u32, { type: "u32" });
  if ("u64" in value) return nativeToScVal(BigInt(value.u64), { type: "u64" });
  if ("i128" in value) return nativeToScVal(BigInt(value.i128), { type: "i128" });
  if ("bytes" in value) return xdr.ScVal.scvBytes(Buffer.from(value.bytes, "hex"));
  if ("address" in value) return new Address(value.address).toScVal();
  if ("vec" in value) return xdr.ScVal.scvVec(value.vec.map(scValFromJson));
  if ("map" in value) {
    return xdr.ScVal.scvMap(
      value.map.map(
        (entry) => new xdr.ScMapEntry({ key: scValFromJson(entry.key), val: scValFromJson(entry.val) }),
      ),
    );
  }
  throw new Error(`Unsupported ScVal in snapshot: ${JSON.stringify(value)}`);
}

/** Encodes one snapshot event as a base64 `ContractEvent` XDR. */
export function encodeContractEvent(event: SnapshotEvent["event"]): string {
  const v0 = event.body.v0;
  const contractEvent = new xdr.ContractEvent({
    ext: new xdr.ExtensionPoint(0),
    contractId: StrKey.decodeContract(event.contract_id),
    type: xdr.ContractEventType.contract(),
    body: new xdr.ContractEventBody(
      0,
      new xdr.ContractEventV0({
        topics: v0.topics.map(scValFromJson),
        data: scValFromJson(v0.data),
      }),
    ),
  });
  return contractEvent.toXDR("base64");
}

/** Builds the fixture for every snapshot file, keyed by test name. */
export function buildFixtures(snapshotDir: string = SNAPSHOT_DIR): EventFixture[] {
  return fs
    .readdirSync(snapshotDir)
    .filter((f) => f.endsWith(".json"))
    .sort()
    .map((file) => {
      const snapshot = JSON.parse(fs.readFileSync(path.join(snapshotDir, file), "utf8")) as Snapshot;
      const events = snapshot.events
        .filter((e) => !e.failed_call)
        .map((e) => ({ contractId: e.event.contract_id, xdr: encodeContractEvent(e.event) }));
      return { name: file.replace(/\.\d+\.json$/, ""), events };
    });
}

function serialize(fixture: EventFixture): string {
  return `${JSON.stringify(fixture, null, 2)}\n`;
}

function main(): void {
  const check = process.argv.includes("--check");
  const fixtures = buildFixtures();

  if (check) {
    const stale: string[] = [];
    for (const fixture of fixtures) {
      const target = path.join(FIXTURE_DIR, `${fixture.name}.json`);
      const committed = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
      if (committed !== serialize(fixture)) stale.push(fixture.name);
    }
    if (stale.length > 0) {
      console.error(
        `Event fixtures are out of date for: ${stale.join(", ")}.\n` +
          "Run `npx ts-node scripts/export-event-fixtures.ts` in backend/ and commit the result.",
      );
      process.exit(1);
    }
    console.log(`Event fixtures are up to date (${fixtures.length} files).`);
    return;
  }

  fs.mkdirSync(FIXTURE_DIR, { recursive: true });
  for (const fixture of fixtures) {
    fs.writeFileSync(path.join(FIXTURE_DIR, `${fixture.name}.json`), serialize(fixture));
  }
  console.log(`Wrote ${fixtures.length} event fixtures to ${FIXTURE_DIR}`);
}

if (require.main === module) {
  main();
}
