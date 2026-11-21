import { Keypair, StrKey } from "@stellar/stellar-sdk";
import {
  buildCreateMarketSchema,
  DEFAULT_MAX_SCHEDULE_HORIZON_DAYS,
  readMaxScheduleHorizonDays,
} from "../market.schema";

// #1587 B-151: time ordering, betting-in-the-future, and scheduledAt horizon.

const DAY = 24 * 60 * 60 * 1000;
const NOW = new Date("2026-11-19T12:00:00.000Z");
const creator = Keypair.random().publicKey();
const oracle = Keypair.random().publicKey();
const contract = StrKey.encodeContract(Buffer.alloc(32, 9));

const schema = buildCreateMarketSchema({ maxHorizonDays: 365, now: () => NOW });

function body(scheduled: number, bettingEnds: number) {
  return {
    id: "market-t",
    contractAddress: contract,
    fighterA: { name: "A" },
    fighterB: { name: "B" },
    scheduledAt: new Date(scheduled).toISOString(),
    bettingEndsAt: new Date(bettingEnds).toISOString(),
    createdBy: creator,
    oracleAddress: oracle,
  };
}

const T = NOW.getTime();

/** Returns the issue paths and messages a body produces, or [] when valid. */
function issues(input: ReturnType<typeof body>, s = schema) {
  const result = s.safeParse(input);
  return result.success ? [] : result.error.issues.map((i) => ({ path: i.path.join("."), message: i.message }));
}

describe("bettingEndsAt must be earlier than scheduledAt", () => {
  it("rejects bettingEndsAt after scheduledAt and names bettingEndsAt", () => {
    expect(issues(body(T + 10 * DAY, T + 11 * DAY))).toContainEqual({
      path: "bettingEndsAt",
      message: "bettingEndsAt must be earlier than scheduledAt",
    });
  });

  it("rejects bettingEndsAt equal to scheduledAt (boundary)", () => {
    expect(issues(body(T + 10 * DAY, T + 10 * DAY))).toContainEqual(
      expect.objectContaining({ path: "bettingEndsAt", message: "bettingEndsAt must be earlier than scheduledAt" })
    );
  });

  it("accepts bettingEndsAt one millisecond before scheduledAt (boundary)", () => {
    expect(issues(body(T + 10 * DAY, T + 10 * DAY - 1))).toEqual([]);
  });
});

describe("bettingEndsAt must be in the future", () => {
  it("rejects bettingEndsAt in the past", () => {
    expect(issues(body(T + 10 * DAY, T - DAY))).toContainEqual({
      path: "bettingEndsAt",
      message: "bettingEndsAt must be in the future",
    });
  });

  it("rejects bettingEndsAt exactly at now (boundary)", () => {
    expect(issues(body(T + 10 * DAY, T))).toContainEqual(
      expect.objectContaining({ path: "bettingEndsAt", message: "bettingEndsAt must be in the future" })
    );
  });

  it("accepts bettingEndsAt one millisecond after now (boundary)", () => {
    expect(issues(body(T + 10 * DAY, T + 1))).toEqual([]);
  });

  it("reports both past and ordering problems when both occur", () => {
    const messages = issues(body(T - 2 * DAY, T - DAY)).map((i) => i.message);
    expect(messages).toContain("bettingEndsAt must be in the future");
  });
});

describe("scheduledAt horizon", () => {
  it("accepts scheduledAt exactly at the horizon (boundary)", () => {
    expect(issues(body(T + 365 * DAY, T + 364 * DAY))).toEqual([]);
  });

  it("rejects scheduledAt one millisecond past the horizon and names scheduledAt", () => {
    expect(issues(body(T + 365 * DAY + 1, T + 364 * DAY))).toContainEqual({
      path: "scheduledAt",
      message: "scheduledAt must be within 365 days of now",
    });
  });

  it("uses the configured horizon", () => {
    const short = buildCreateMarketSchema({ maxHorizonDays: 30, now: () => NOW });
    expect(issues(body(T + 30 * DAY, T + 29 * DAY), short)).toEqual([]);
    expect(issues(body(T + 31 * DAY, T + 29 * DAY), short)).toContainEqual(
      expect.objectContaining({ path: "scheduledAt", message: "scheduledAt must be within 30 days of now" })
    );
  });

  it("does not limit a scheduledAt that is merely near now", () => {
    expect(issues(body(T + DAY, T + DAY / 2))).toEqual([]);
  });
});

describe("readMaxScheduleHorizonDays", () => {
  it("defaults to 365 days when unset or blank", () => {
    expect(readMaxScheduleHorizonDays({})).toBe(DEFAULT_MAX_SCHEDULE_HORIZON_DAYS);
    expect(readMaxScheduleHorizonDays({ MARKET_MAX_SCHEDULE_HORIZON_DAYS: "  " })).toBe(365);
  });

  it("parses a positive integer", () => {
    expect(readMaxScheduleHorizonDays({ MARKET_MAX_SCHEDULE_HORIZON_DAYS: "90" })).toBe(90);
  });

  it.each(["0", "-3", "1.5", "abc"])("rejects %p", (value) => {
    expect(() => readMaxScheduleHorizonDays({ MARKET_MAX_SCHEDULE_HORIZON_DAYS: value })).toThrow(
      /MARKET_MAX_SCHEDULE_HORIZON_DAYS/
    );
  });
});
