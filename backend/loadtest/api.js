// k6 scenario: REST read paths (#1585, B-149).
//
// Mix: market list, market detail, bets by address, and search. Thresholds
// fail the run (non-zero exit) when p95 latency or the error rate is exceeded.
//
//   k6 run -e BASE_URL=http://localhost:3001 backend/loadtest/api.js
//
// Tune with VUS, DURATION, P95_MS (default 500) and ERROR_RATE (default 0.01).

import http from "k6/http";
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import {
  BASE_URL,
  randomBettorAddress,
  randomMarketId,
} from "./lib/seed.js";

const P95_MS = Number(__ENV.P95_MS || 500);
const ERROR_RATE = Number(__ENV.ERROR_RATE || 0.01);
const rateLimited = new Counter("search_rate_limited");

export const options = {
  scenarios: {
    browse: {
      executor: "constant-vus",
      vus: Number(__ENV.VUS || 20),
      duration: __ENV.DURATION || "5m",
    },
  },
  thresholds: {
    http_req_failed: [`rate<${ERROR_RATE}`],
    "http_req_duration{endpoint:markets_list}": [`p(95)<${P95_MS}`],
    "http_req_duration{endpoint:market_detail}": [`p(95)<${P95_MS}`],
    "http_req_duration{endpoint:bets_by_address}": [`p(95)<${P95_MS}`],
    "http_req_duration{endpoint:search}": [`p(95)<${P95_MS}`],
  },
};

const SEARCH_TERMS = ["loadtest", "bout", "fighter"];

export default function () {
  const list = http.get(`${BASE_URL}/api/markets?limit=20`, {
    tags: { endpoint: "markets_list" },
  });
  check(list, { "markets list 200": (r) => r.status === 200 });

  const detail = http.get(`${BASE_URL}/api/markets/${randomMarketId()}`, {
    tags: { endpoint: "market_detail" },
  });
  check(detail, { "market detail 200": (r) => r.status === 200 });

  const bets = http.get(
    `${BASE_URL}/api/users/${randomBettorAddress()}/bets?limit=20`,
    { tags: { endpoint: "bets_by_address" } }
  );
  check(bets, { "bets by address 200": (r) => r.status === 200 });

  // The search endpoint is rate limited per client (429). Count those rather
  // than failing the run, so the latency threshold still measures real searches.
  const term = SEARCH_TERMS[Math.floor(Math.random() * SEARCH_TERMS.length)];
  const search = http.get(`${BASE_URL}/api/markets/search?q=${term}&limit=20`, {
    tags: { endpoint: "search" },
    responseCallback: http.expectedStatuses(200, 429),
  });
  if (search.status === 429) rateLimited.add(1);
  check(search, { "search 200 or 429": (r) => r.status === 200 || r.status === 429 });

  sleep(1);
}
