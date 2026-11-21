// Mirrors backend/scripts/seed-loadtest.ts. Keep the two in sync: the k6
// scripts address seeded rows by these derived ids and addresses.

export const BASE_URL = __ENV.BASE_URL || "http://localhost:3001";
export const MARKET_COUNT = Number(__ENV.SEED_MARKETS || 20);
export const BETTOR_COUNT = Number(__ENV.SEED_BETTORS || 50);

export function marketId(i) {
  return `loadtest-market-${i}`;
}

export function bettorAddress(i) {
  return "G" + String(i).padStart(55, "0");
}

export function randomMarketId() {
  return marketId(1 + Math.floor(Math.random() * MARKET_COUNT));
}

export function randomBettorAddress() {
  return bettorAddress(1 + Math.floor(Math.random() * BETTOR_COUNT));
}
