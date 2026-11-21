import { filterSnapshotsByRange, isOddsRange, isOddsRangeAvailable } from "./oddsRange";
import type { OddsSnapshot } from "./api";

const HOUR = 60 * 60 * 1000;
const NOW = Date.parse("2026-11-20T12:00:00Z");

const at = (msBefore: number): OddsSnapshot => ({
  timestamp: new Date(NOW - msBefore).toISOString(),
  poolA: "1",
  poolB: "1",
  oddsA: 50,
  oddsB: 50,
});

describe("filterSnapshotsByRange", () => {
  const snapshots = [at(30 * 24 * HOUR), at(3 * 24 * HOUR), at(12 * HOUR), at(30 * 60 * 1000)];

  it("returns every snapshot for ALL", () => {
    expect(filterSnapshotsByRange(snapshots, "ALL", NOW)).toHaveLength(4);
  });

  it("keeps only the last hour for 1H", () => {
    expect(filterSnapshotsByRange(snapshots, "1H", NOW)).toHaveLength(1);
  });

  it("keeps the last 24 hours for 24H", () => {
    expect(filterSnapshotsByRange(snapshots, "24H", NOW)).toHaveLength(2);
  });

  it("keeps the last 7 days for 7D", () => {
    expect(filterSnapshotsByRange(snapshots, "7D", NOW)).toHaveLength(3);
  });

  it("drops snapshots with unparseable timestamps from windowed ranges only", () => {
    const bad = [{ ...at(HOUR), timestamp: "not-a-date" }];
    expect(filterSnapshotsByRange(bad, "7D", NOW)).toEqual([]);
    expect(filterSnapshotsByRange(bad, "ALL", NOW)).toEqual(bad);
  });
});

describe("isOddsRangeAvailable", () => {
  it("is false for a windowed range with no points in it", () => {
    const old = [at(10 * 24 * HOUR)];
    expect(isOddsRangeAvailable(old, "24H", NOW)).toBe(false);
    expect(isOddsRangeAvailable(old, "ALL", NOW)).toBe(true);
  });

  it("is false for every range when there is no history", () => {
    expect(isOddsRangeAvailable([], "ALL", NOW)).toBe(false);
  });
});

describe("isOddsRange", () => {
  it("accepts only the known range values", () => {
    expect(isOddsRange("1H")).toBe(true);
    expect(isOddsRange("ALL")).toBe(true);
    expect(isOddsRange("1Y")).toBe(false);
    expect(isOddsRange(null)).toBe(false);
  });
});
