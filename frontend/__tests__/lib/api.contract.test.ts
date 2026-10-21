import * as fs from "fs";
import * as path from "path";
import * as api from "@/lib/api";

// Contract between the frontend's lib/api.ts and the backend's OpenAPI spec.
// Each case runs a real api.ts function against a fake fetch, so the test checks the
// method and path the frontend actually sends, not a copy of them.

type Method = "GET" | "POST" | "PATCH" | "DELETE";

interface SpecDocument {
  paths: Record<string, Partial<Record<Lowercase<Method>, unknown>>>;
  components: { schemas: Record<string, { properties?: Record<string, unknown> }> };
}

const spec: SpecDocument = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, "../../../backend/src/api/openapi.json"), "utf-8")
);

/** Turns `{id}`, `{address}` and so on into `{}`, so parameter names do not matter. */
function normalise(route: string): string {
  return route.replace(/\{[^}]+\}/g, "{}");
}

function isDocumented(method: Method, route: string): boolean {
  return Object.entries(spec.paths).some(
    ([specRoute, operations]) =>
      normalise(specRoute) === normalise(route) && method.toLowerCase() in operations
  );
}

/**
 * Routes the frontend calls that openapi.json does not document yet. Each entry is a
 * known gap. Adding a new undocumented route fails the test until it is listed here with
 * a reason, and an entry is removed once the spec documents the route.
 */
const KNOWN_UNDOCUMENTED: Record<string, string> = {
  "GET /api/markets/{}": "single-market fetch; spec only has /api/markets/search",
  "GET /api/markets/{}/stats": "per-market stats; spec only has the platform-wide /api/stats",
  "GET /api/markets/{}/bets": "spec documents bets per user, not per market",
  "GET /api/bets/{}": "spec documents bets per user as /api/users/{address}/bets",
  "GET /api/bets/{}/portfolio": "portfolio summary is not in the spec",
  "GET /api/bets/payout-estimate": "payout estimate is not in the spec",
  "GET /api/markets/{}/odds-history": "odds history is not in the spec",
  "GET /api/leaderboard": "leaderboard is not in the spec",
  "GET /api/admin/markets/pending": "spec documents only POST /api/admin/markets/resolve",
  "POST /api/admin/markets/{}/resolve": "spec documents POST /api/admin/markets/resolve with marketId in the body",
};

interface ContractCase {
  name: string;
  method: Method;
  /** The route as the frontend builds it, with `{}` for each path parameter. */
  template: string;
  /** The exact path the call should send, query string excluded. */
  path: string;
  call: () => Promise<unknown>;
}

const CASES: ContractCase[] = [
  { name: "fetchMarkets", method: "GET", template: "/api/markets", path: "/api/markets", call: () => api.fetchMarkets() },
  { name: "fetchMarketById", method: "GET", template: "/api/markets/{}", path: "/api/markets/m1", call: () => api.fetchMarketById("m1") },
  { name: "fetchMarketStats", method: "GET", template: "/api/markets/{}/stats", path: "/api/markets/m1/stats", call: () => api.fetchMarketStats("m1") },
  { name: "fetchMarketBets", method: "GET", template: "/api/markets/{}/bets", path: "/api/markets/m1/bets", call: () => api.fetchMarketBets("m1") },
  { name: "fetchBetsByAddress", method: "GET", template: "/api/bets/{}", path: "/api/bets/GADDR", call: () => api.fetchBetsByAddress("GADDR") },
  { name: "fetchPortfolioSummary", method: "GET", template: "/api/bets/{}/portfolio", path: "/api/bets/GADDR/portfolio", call: () => api.fetchPortfolioSummary("GADDR") },
  { name: "fetchPayoutEstimate", method: "GET", template: "/api/bets/payout-estimate", path: "/api/bets/payout-estimate", call: () => api.fetchPayoutEstimate("m1", "FighterA", BigInt(1)) },
  { name: "fetchOddsHistory", method: "GET", template: "/api/markets/{}/odds-history", path: "/api/markets/m1/odds-history", call: () => api.fetchOddsHistory("m1") },
  { name: "fetchUserPositions", method: "GET", template: "/api/users/{}/positions", path: "/api/users/GADDR/positions", call: () => api.fetchUserPositions("GADDR") },
  { name: "createMarketMeta", method: "POST", template: "/api/markets", path: "/api/markets", call: () => api.createMarketMeta({} as never) },
  { name: "fetchLeaderboard", method: "GET", template: "/api/leaderboard", path: "/api/leaderboard", call: () => api.fetchLeaderboard("7d") },
  { name: "fetchPendingResolutions", method: "GET", template: "/api/admin/markets/pending", path: "/api/admin/markets/pending", call: () => api.fetchPendingResolutions("key") },
  { name: "resolveMarket", method: "POST", template: "/api/admin/markets/{}/resolve", path: "/api/admin/markets/m1/resolve", call: () => api.resolveMarket("m1", "FighterA", "key") },
  { name: "fetchOracles", method: "GET", template: "/api/admin/oracles", path: "/api/admin/oracles", call: () => api.fetchOracles("key") },
  { name: "createOracle", method: "POST", template: "/api/admin/oracles", path: "/api/admin/oracles", call: () => api.createOracle({ address: "GORACLE", name: "Oracle" }, "key") },
  { name: "updateOracle", method: "PATCH", template: "/api/admin/oracles/{}", path: "/api/admin/oracles/o1", call: () => api.updateOracle("o1", { name: "Renamed" }, "key") },
  { name: "deleteOracle", method: "DELETE", template: "/api/admin/oracles/{}", path: "/api/admin/oracles/o1", call: () => api.deleteOracle("o1", "key") },
];

describe("lib/api.ts requests", () => {
  const originalFetch = global.fetch;
  const requests: { method: string; path: string }[] = [];

  beforeEach(() => {
    requests.length = 0;
    global.fetch = jest.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      requests.push({
        method: (init?.method ?? "GET").toUpperCase(),
        path: String(input).replace(/^https?:\/\/[^/]+/, "").split("?")[0],
      });
      return { ok: true, json: async () => ({}), text: async () => "" };
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  describe.each(CASES)("$name", (contractCase) => {
    it(`sends ${contractCase.method} ${contractCase.path}`, async () => {
      // Responses are stubbed with {}, so some parsers throw after the request. That is fine here.
      await contractCase.call().catch(() => undefined);

      expect(requests).toEqual([{ method: contractCase.method, path: contractCase.path }]);
    });

    it("is documented in openapi.json, or listed as a known gap", () => {
      const key = `${contractCase.method} ${normalise(contractCase.template)}`;

      if (isDocumented(contractCase.method, contractCase.template)) {
        expect(KNOWN_UNDOCUMENTED[key]).toBeUndefined();
      } else {
        expect(KNOWN_UNDOCUMENTED[key]).toBeDefined();
      }
    });
  });

  it("removes a known gap once the spec documents it", () => {
    const documentedNow = Object.keys(KNOWN_UNDOCUMENTED).filter((key) => {
      const [method, route] = key.split(" ") as [Method, string];
      return isDocumented(method, route);
    });

    expect(documentedNow).toEqual([]);
  });
});

describe("lib/api.ts response types against openapi.json schemas", () => {
  // The fields each interface in lib/api.ts declares, which must match the spec exactly.
  const FRONTEND_TYPES: Record<string, string[]> = {
    Market: ["id", "contractAddress", "fighterA", "fighterB", "scheduledAt", "bettingEndsAt", "status", "outcome", "poolA", "poolB", "totalPool", "oracleAddress", "createdBy"],
    Bet: ["id", "marketId", "bettor", "side", "amount", "placedAt", "claimed", "payout"],
    MarketStats: ["totalBets", "uniqueBettors", "poolA", "poolB", "totalVolume", "impliedOddsA", "impliedOddsB"],
    Fighter: ["name", "record", "nationality", "weightClass"],
    Portfolio: ["totalStaked", "totalWinnings", "pendingClaims", "activeBets", "completedBets", "roi"],
    Oracle: ["id", "address", "name", "active"],
  };

  it.each(Object.entries(FRONTEND_TYPES))("%s has the same fields as the spec schema", (schemaName, fields) => {
    const schema = spec.components.schemas[schemaName];

    expect(schema).toBeDefined();
    expect(Object.keys(schema.properties ?? {}).sort()).toEqual([...fields].sort());
  });
});
