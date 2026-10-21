/**
 * Integration test — GET /api/oracle/results
 * Issue #1227 B-49
 *
 * Uses supertest + a mocked Prisma singleton so no real DB is needed.
 */

import request from "supertest";
import { createApp } from "../../app";

// ── Mock the singleton db ─────────────────────────────────────────────────────
const mockCount = jest.fn();
const mockFindMany = jest.fn();

jest.mock("../../db", () => ({
  db: {
    oracleResult: {
      count: (...args: unknown[]) => mockCount(...args),
      findMany: (...args: unknown[]) => mockFindMany(...args),
    },
  },
}));

const app = createApp();

// ── Fixtures ──────────────────────────────────────────────────────────────────
const makeResult = (overrides: Record<string, unknown> = {}) => ({
  id: "uuid-1",
  marketId: "market-1",
  reportedBy: "oracle",
  outcome: "FighterA",
  source: "BoxRec",
  reportedAt: new Date("2026-01-01T12:00:00Z"),
  confirmed: false,
  ...overrides,
});

// ─────────────────────────────────────────────────────────────────────────────

describe("GET /api/oracle/results (#1227 B-49)", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it("returns 200 with paginated results", async () => {
    const rows = [makeResult(), makeResult({ id: "uuid-2", marketId: "market-2" })];
    mockCount.mockResolvedValue(2);
    mockFindMany.mockResolvedValue(rows);

    const res = await request(app).get("/api/oracle/results");

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.pagination).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 2,
      totalPages: 1,
    });
  });

  it("filters by marketId", async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([makeResult()]);

    const res = await request(app).get("/api/oracle/results?marketId=market-1");

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ marketId: "market-1" }),
      }),
    );
  });

  it("filters by confirmed=true", async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([makeResult({ confirmed: true })]);

    const res = await request(app).get("/api/oracle/results?confirmed=true");

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ confirmed: true }),
      }),
    );
  });

  it("filters by confirmed=false", async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([makeResult()]);

    const res = await request(app).get("/api/oracle/results?confirmed=false");

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ confirmed: false }),
      }),
    );
  });

  it("respects custom page and pageSize", async () => {
    mockCount.mockResolvedValue(50);
    mockFindMany.mockResolvedValue([]);

    const res = await request(app).get("/api/oracle/results?page=3&pageSize=10");

    expect(res.status).toBe(200);
    expect(res.body.pagination).toMatchObject({
      page: 3,
      pageSize: 10,
      total: 50,
      totalPages: 5,
    });
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ skip: 20, take: 10 }),
    );
  });

  it("caps pageSize at 100", async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    await request(app).get("/api/oracle/results?pageSize=9999");

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 100 }),
    );
  });

  it("returns empty data array when no results exist", async () => {
    mockCount.mockResolvedValue(0);
    mockFindMany.mockResolvedValue([]);

    const res = await request(app).get("/api/oracle/results");

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual([]);
    expect(res.body.pagination.total).toBe(0);
    expect(res.body.pagination.totalPages).toBe(0);
  });

  it("combines marketId and confirmed filters", async () => {
    mockCount.mockResolvedValue(1);
    mockFindMany.mockResolvedValue([makeResult({ confirmed: true })]);

    const res = await request(app).get(
      "/api/oracle/results?marketId=market-42&confirmed=true",
    );

    expect(res.status).toBe(200);
    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { marketId: "market-42", confirmed: true },
      }),
    );
  });
});
