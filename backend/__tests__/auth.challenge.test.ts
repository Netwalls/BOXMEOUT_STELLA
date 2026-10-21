/**
 * Wallet auth challenge endpoint and one-time challenge consumption (#1220, B-48).
 *
 * Uses supertest against the real Express app (no DB) so the challenge store
 * runs in its in-memory fallback (NODE_ENV=test).
 */

import request from "supertest";
import { createApp } from "../src/app";

// ─── Shared mocks ────────────────────────────────────────────────────────────

jest.mock("../src/services/oracle.service", () => ({
  submitFightResult: jest.fn().mockResolvedValue({ id: 1, market_id: "m1", outcome: "fighter_a" }),
  getAllOracles: jest.fn().mockResolvedValue([]),
  createOracle: jest.fn().mockResolvedValue({ id: "o1", address: "G".repeat(56), name: "Test" }),
  updateOracle: jest.fn().mockResolvedValue({ id: "o1", address: "G".repeat(56), name: "Updated" }),
  deleteOracle: jest.fn().mockResolvedValue({ id: "o1", active: false }),
  confirmFightResult: jest.fn().mockResolvedValue(undefined),
  listOracleResults: jest.fn().mockResolvedValue([]),
}));

jest.mock("../src/services/market.service", () => ({
  getPendingResolutions: jest.fn().mockResolvedValue([]),
  resolveMarket: jest.fn().mockResolvedValue({ status: "ok" }),
}));

jest.mock("../src/services/audit.service", () => ({
  getAuditLogs: jest.fn().mockResolvedValue({ logs: [], pagination: { page: 1, limit: 10, total: 0, pages: 0 } }),
}));

jest.mock("../src/api/middleware/audit-log.middleware", () => ({
  auditLogMiddleware: (_req: any, _res: any, next: any) => next(),
}));

jest.mock("../src/logger", () => ({
  httpLogger: (_req: any, _res: any, next: any) => next(),
  logger: { error: jest.fn(), info: jest.fn(), warn: jest.fn() },
}));

// ─── Test setup ──────────────────────────────────────────────────────────────

const VALID_STELLAR = "GAAZI4TCR3TY5OJHCTJC2A4QSY6CJWJH5IAJTGKIN2ER7LBNVKOCCWN";
const validMarketBody = {
  id: "market-test-1",
  contractAddress: "CAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
  fighterA: { name: "Fighter A", record: "20-0" },
  fighterB: { name: "Fighter B", record: "18-2" },
  scheduledAt: "2027-01-01T20:00:00Z",
  bettingEndsAt: "2027-01-01T18:00:00Z",
  createdBy: "GABC",
  oracleAddress: "GORACLE",
};

let app: ReturnType<typeof createApp>;

beforeAll(() => {
  process.env.ADMIN_API_KEY = "test-admin-key-1219";
  process.env.ORACLE_API_KEY = "test-oracle-key-1221";
  app = createApp();
});

// ─── #1220: GET /api/auth/challenge ─────────────────────────────────────────

describe("#1220 — GET /api/auth/challenge", () => {
  it("returns 200 with challenge and expiresAt for a valid Stellar address", async () => {
    const res = await request(app)
      .get("/api/auth/challenge")
      .query({ address: VALID_STELLAR });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("challenge");
    expect(res.body).toHaveProperty("expiresAt");
    expect(typeof res.body.challenge).toBe("string");
    expect(typeof res.body.expiresAt).toBe("number");
    expect(res.body.challenge).toContain(VALID_STELLAR);
  });

  it("returns 400 for an invalid Stellar address", async () => {
    const res = await request(app)
      .get("/api/auth/challenge")
      .query({ address: "not-a-stellar-address" });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_ADDRESS" });
  });

  it("returns 400 when address query param is omitted", async () => {
    const res = await request(app).get("/api/auth/challenge");
    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ code: "INVALID_ADDRESS" });
  });
});

// ─── B-48: Challenge endpoint returns challenge string ────────────────────────

describe("B-48: GET /api/auth/challenge", () => {
  const validStellarAddress = `G${"A".repeat(55)}`;

  it("returns 400 for an invalid Stellar address", async () => {
    const res = await request(app).get(
      "/api/auth/challenge?address=INVALID"
    );
    expect(res.status).toBe(400);
    expect(res.body.code).toBe("INVALID_ADDRESS");
  });

  it("returns 200 with a challenge and expiresAt for a valid address", async () => {
    const res = await request(app).get(
      `/api/auth/challenge?address=${validStellarAddress}`
    );
    expect(res.status).toBe(200);
    expect(res.body.challenge).toMatch(/^BOXMEOUT-AUTH:/);
    expect(typeof res.body.expiresAt).toBe("number");
    expect(res.body.expiresAt).toBeGreaterThan(Date.now());
  });

  it("challenge is consumed (one-time use) — second POST returns CHALLENGE_EXPIRED", async () => {
    // Obtain a challenge
    await request(app).get(
      `/api/auth/challenge?address=${validStellarAddress}`
    );

    // First POST attempt — challenge exists but signature is invalid → INVALID_SIGNATURE
    const res1 = await request(app)
      .post("/api/markets")
      .set("x-wallet-address", validStellarAddress)
      .set("x-wallet-signature", "YWJj")
      .send(validMarketBody);

    expect(res1.status).toBe(401);
    expect(res1.body.code).toBe("INVALID_SIGNATURE");

    // Second POST attempt — challenge was consumed → CHALLENGE_EXPIRED
    const res2 = await request(app)
      .post("/api/markets")
      .set("x-wallet-address", validStellarAddress)
      .set("x-wallet-signature", "YWJj")
      .send(validMarketBody);

    expect(res2.status).toBe(401);
    expect(res2.body.code).toBe("CHALLENGE_EXPIRED");
  });
});
