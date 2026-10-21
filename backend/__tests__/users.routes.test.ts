/**
 * Consolidated /api/users router (B-45).
 */

import request from "supertest";
import express from "express";
import marketRoutes from "../src/api/routes/market.routes";
import usersRoutes from "../src/api/routes/users.routes";
import authRoutes from "../src/api/routes/auth.routes";
import adminRoutes from "../src/api/routes/admin.routes";
import * as userService from "../src/services/user.service";

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock("../src/services/market.service");
jest.mock("../src/services/user.service");
jest.mock("../src/logger", () => ({
  logger: { info: jest.fn(), error: jest.fn(), warn: jest.fn(), debug: jest.fn() },
  httpLogger: (_req: unknown, _res: unknown, next: () => void) => next(),
}));

const mockedUserService = jest.mocked(userService);

// ─── Test app factory ─────────────────────────────────────────────────────────

function createTestApp() {
  const app = express();
  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );
  app.use(express.json());
  app.use("/api/markets", marketRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/auth", authRoutes);
  app.use("/api/admin", adminRoutes);
  return app;
}

// ─── B-45: Consolidated /api/users router ─────────────────────────────────────

describe("B-45: GET /api/users/:address", () => {
  const app = createTestApp();

  it("returns 200 with user profile when found", async () => {
    mockedUserService.getUserByAddress = jest.fn().mockResolvedValue({
      address: "GTEST",
      displayName: "Test User",
      avatarUrl: null,
    }) as jest.MockedFunction<typeof userService.getUserByAddress>;

    const res = await request(app).get("/api/users/GTEST");

    expect(res.status).toBe(200);
    expect(res.body.user.address).toBe("GTEST");
  });

  it("returns 404 when user is not found", async () => {
    mockedUserService.getUserByAddress = jest.fn().mockResolvedValue(null) as jest.MockedFunction<typeof userService.getUserByAddress>;

    const res = await request(app).get("/api/users/GNOTFOUND");

    expect(res.status).toBe(404);
    expect(res.body.code).toBe("NOT_FOUND");
  });
});

describe("B-45: GET /api/users/:address/bets", () => {
  it("route is reachable (was dead code before consolidation)", async () => {
    const app = createTestApp();

    // getUserBetsHandler is in bet.controller — it's now mounted on usersRoutes.
    // With no DB it will fail, but the route should be found (not 404).
    const res = await request(app).get("/api/users/GTEST/bets");
    // Any response that isn't a routing 404 proves the route is mounted.
    expect(res.status).not.toBe(404);
  });
});

describe("B-45: GET /api/users/:address/positions", () => {
  it("route is reachable", async () => {
    const app = createTestApp();
    const res = await request(app).get("/api/users/GTEST/positions");
    expect(res.status).not.toBe(404);
  });
});
