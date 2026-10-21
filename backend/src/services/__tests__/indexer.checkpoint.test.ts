/**
 * B-112 / #1410: the indexer cursor may only advance past a getEvents page that
 * was not truncated by its limit.
 */
import { checkpointLedgerForPage } from "../indexer.checkpoint";

const LIMIT = 100;

describe("checkpointLedgerForPage", () => {
  it("advances to latestLedger after a short page on a quiet chain", () => {
    expect(
      checkpointLedgerForPage({ latestLedger: 2000, eventCount: 0 }, LIMIT, 1000)
    ).toBe(2000);
  });

  it("advances after a short page that contained events", () => {
    expect(
      checkpointLedgerForPage({ latestLedger: 2000, eventCount: 3 }, LIMIT, 1000)
    ).toBe(2000);
  });

  it("does not advance past a full page, which may hold more events", () => {
    expect(
      checkpointLedgerForPage({ latestLedger: 2000, eventCount: LIMIT }, LIMIT, 1000)
    ).toBeNull();
  });

  it("does not move backwards or stand still when the head is not ahead", () => {
    expect(
      checkpointLedgerForPage({ latestLedger: 1000, eventCount: 0 }, LIMIT, 1000)
    ).toBeNull();
    expect(
      checkpointLedgerForPage({ latestLedger: 900, eventCount: 0 }, LIMIT, 1000)
    ).toBeNull();
  });
});
