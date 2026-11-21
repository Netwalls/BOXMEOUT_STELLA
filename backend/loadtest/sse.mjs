// SSE fan-out load check (#1585, B-149).
//
// Opens SSE_CONNECTIONS concurrent streams to /api/markets/:id/stream, holds
// each for HOLD_MS, then aborts. Exits non-zero when fewer than MIN_SUCCESS
// (default 0.99) of connections return HTTP 200 with text/event-stream, or when
// any stream errors while held.
//
// Uses only the Node 20 runtime (global fetch); no k6 extension required.
//
//   BASE_URL=http://localhost:3001 SSE_CONNECTIONS=200 HOLD_MS=60000 \
//     node backend/loadtest/sse.mjs

const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
const CONNECTIONS = Number(process.env.SSE_CONNECTIONS || 100);
const HOLD_MS = Number(process.env.HOLD_MS || 60000);
const MIN_SUCCESS = Number(process.env.MIN_SUCCESS || 0.99);
const MARKET_COUNT = Number(process.env.SEED_MARKETS || 20);

// Matches marketId() in backend/scripts/seed-loadtest.ts.
function randomMarketId() {
  return `loadtest-market-${1 + Math.floor(Math.random() * MARKET_COUNT)}`;
}

async function openStream() {
  const url = `${BASE_URL}/api/markets/${randomMarketId()}/stream`;
  const controller = new AbortController();
  const holdTimer = setTimeout(() => controller.abort(), HOLD_MS);
  try {
    const res = await fetch(url, {
      headers: { Accept: "text/event-stream" },
      signal: controller.signal,
    });
    const isStream = (res.headers.get("content-type") || "").includes("text/event-stream");
    if (res.status !== 200 || !isStream) {
      res.body?.cancel().catch(() => {});
      return { connected: false, errored: false };
    }
    // Drain the stream until the hold timer aborts it. Abort is the expected end.
    const reader = res.body.getReader();
    for (;;) {
      const { done } = await reader.read();
      if (done) return { connected: true, errored: false };
    }
  } catch (err) {
    // An abort at HOLD_MS is the normal end of a held stream, not an error.
    if (err?.name === "AbortError") return { connected: true, errored: false };
    return { connected: false, errored: true, message: String(err?.message || err) };
  } finally {
    clearTimeout(holdTimer);
  }
}

async function main() {
  const started = Date.now();
  const results = await Promise.all(Array.from({ length: CONNECTIONS }, openStream));
  const connected = results.filter((r) => r.connected).length;
  const errored = results.filter((r) => r.errored).length;
  const rate = connected / CONNECTIONS;
  const summary = {
    connections: CONNECTIONS,
    connected,
    failed: CONNECTIONS - connected,
    erroredWhileHeld: errored,
    successRate: Number(rate.toFixed(4)),
    minSuccess: MIN_SUCCESS,
    elapsedMs: Date.now() - started,
  };
  console.log(JSON.stringify(summary, null, 2));
  if (rate < MIN_SUCCESS) {
    console.error(`SSE success rate ${rate} is below ${MIN_SUCCESS}`);
    process.exit(1);
  }
}

main();
