// Test backend for Playwright. The market detail page fetches on the server, so
// browser-level route mocking can't reach it; this serves both server and client.
import { createServer } from "node:http";

const PORT = Number(process.env.PORT ?? 3001);

// Must match E2E_ADDRESS in e2e/fixtures.ts
const E2E_ADDRESS = "GE2ETESTAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWXYZ";

const fighter = (name, record) => ({ name, record, nationality: "USA", weightClass: "Lightweight" });

const markets = {
  "e2e-open": {
    id: "e2e-open",
    contractAddress: "CE2EOPEN",
    fighterA: fighter("Maya Chen", "19-1"),
    fighterB: fighter("Rico Alvarez", "20-2"),
    scheduledAt: new Date(Date.now() + 2 * 86_400_000).toISOString(),
    bettingEndsAt: new Date(Date.now() + 86_400_000).toISOString(),
    status: "Open",
    outcome: null,
    poolA: "600000000",
    poolB: "400000000",
    totalPool: "1000000000",
    oracleAddress: "GORACLE",
    createdBy: "GCREATOR",
  },
  "e2e-resolved": {
    id: "e2e-resolved",
    contractAddress: "CE2ERESOLVED",
    fighterA: fighter("Jon Park", "15-3"),
    fighterB: fighter("Luis Ortega", "12-4"),
    scheduledAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    bettingEndsAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    status: "Resolved",
    outcome: "FighterA",
    poolA: "500000000",
    poolB: "500000000",
    totalPool: "1000000000",
    oracleAddress: "GORACLE",
    createdBy: "GCREATOR",
  },
  "e2e-cancelled": {
    id: "e2e-cancelled",
    contractAddress: "CE2ECANCELLED",
    fighterA: fighter("Ana Costa", "11-2"),
    fighterB: fighter("Ben Hart", "10-3"),
    scheduledAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
    bettingEndsAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    status: "Cancelled",
    outcome: null,
    poolA: "300000000",
    poolB: "200000000",
    totalPool: "500000000",
    oracleAddress: "GORACLE",
    createdBy: "GCREATOR",
  },
  // Resolved an hour ago, so it is inside the 24-hour dispute window
  "e2e-disputable": {
    id: "e2e-disputable",
    contractAddress: "CE2EDISPUTABLE",
    fighterA: fighter("Ivy Brooks", "17-0"),
    fighterB: fighter("Dan Kowal", "16-1"),
    scheduledAt: new Date(Date.now() - 60 * 60_000).toISOString(),
    bettingEndsAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
    status: "Resolved",
    outcome: "FighterB",
    poolA: "400000000",
    poolB: "600000000",
    totalPool: "1000000000",
    oracleAddress: "GORACLE",
    createdBy: "GCREATOR",
  },
};

// Markets waiting for an admin to pick an outcome
const pendingResolutions = [
  {
    marketId: "e2e-pending",
    contractAddress: "CE2EPENDING",
    fighterA: fighter("Sam Reyes", "14-2"),
    fighterB: fighter("Tom Okafor", "13-3"),
    scheduledAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    status: "Locked",
  },
];

const bets = [
  {
    id: "e2e-bet-winning",
    marketId: "e2e-resolved",
    bettor: E2E_ADDRESS,
    side: "FighterA",
    amount: "100000000",
    placedAt: new Date(Date.now() - 4 * 86_400_000).toISOString(),
    claimed: false,
    payout: null,
  },
  {
    id: "e2e-bet-refund",
    marketId: "e2e-cancelled",
    bettor: E2E_ADDRESS,
    side: "FighterA",
    amount: "50000000",
    placedAt: new Date(Date.now() - 6 * 86_400_000).toISOString(),
    claimed: false,
    payout: null,
  },
  {
    id: "e2e-bet-dispute",
    marketId: "e2e-disputable",
    bettor: E2E_ADDRESS,
    side: "FighterA",
    amount: "100000000",
    placedAt: new Date(Date.now() - 3 * 86_400_000).toISOString(),
    claimed: false,
    payout: null,
  },
];

function stats(market) {
  const total = Number(market.totalPool) || 1;
  return {
    totalBets: bets.filter((b) => b.marketId === market.id).length,
    uniqueBettors: 1,
    poolA: market.poolA,
    poolB: market.poolB,
    totalVolume: market.totalPool,
    impliedOddsA: Math.round((Number(market.poolA) / total) * 100),
    impliedOddsB: Math.round((Number(market.poolB) / total) * 100),
  };
}

function oddsHistory(market) {
  return [
    { timestamp: new Date(Date.now() - 3_600_000).toISOString(), poolA: "0", poolB: "0", oddsA: 50, oddsB: 50 },
    { timestamp: new Date().toISOString(), poolA: market.poolA, poolB: market.poolB, oddsA: 60, oddsB: 40 },
  ];
}

function route(pathname) {
  let m;
  if (pathname === "/api/markets") return Object.values(markets);
  if (pathname === "/api/admin/markets/pending") return pendingResolutions;
  if (pathname === "/api/admin/oracles") return [];
  if (/^\/api\/admin\/markets\/[^/]+\/resolve$/.test(pathname)) return { success: true };
  if ((m = pathname.match(/^\/api\/markets\/([^/]+)$/))) return markets[m[1]];
  if ((m = pathname.match(/^\/api\/markets\/([^/]+)\/bets$/))) return bets.filter((b) => b.marketId === m[1]);
  if ((m = pathname.match(/^\/api\/markets\/([^/]+)\/stats$/))) return markets[m[1]] && stats(markets[m[1]]);
  if ((m = pathname.match(/^\/api\/markets\/([^/]+)\/odds-history$/)))
    return markets[m[1]] && oddsHistory(markets[m[1]]);
  if (pathname === "/api/bets/payout-estimate") return { estimate: "0" };
  if (/^\/api\/bets\/[^/]+\/portfolio$/.test(pathname))
    return {
      totalStaked: "100000000",
      totalWinnings: "0",
      pendingClaims: "200000000",
      activeBets: 0,
      completedBets: 1,
      roi: 0,
    };
  if ((m = pathname.match(/^\/api\/bets\/([^/]+)$/))) return bets.filter((b) => b.bettor === m[1]);
  if (/^\/api\/users\/[^/]+\/positions$/.test(pathname)) return [];
  return undefined;
}

createServer((req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");

  if (req.method === "OPTIONS") {
    res.writeHead(204).end();
    return;
  }

  const { pathname } = new URL(req.url ?? "/", `http://localhost:${PORT}`);
  const body = route(pathname);

  if (body === undefined) {
    res.writeHead(404, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "Not found" }));
    return;
  }

  res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify(body));
}).listen(PORT, () => {
  console.log(`E2E mock API listening on http://localhost:${PORT}`);
});
