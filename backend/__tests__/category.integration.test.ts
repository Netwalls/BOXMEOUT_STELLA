/**
 * Integration test for #1387: the Category model and Market.categoryId must
 * exist in the migrated test database and behave as the schema declares.
 * Runs against the real database that globalSetup migrates from scratch.
 */

import { db } from "../src/db";

const MARKET_ID = "market-category-it";

describe("Category persistence (migrated database)", () => {
  afterAll(async () => {
    await db.market.deleteMany({ where: { id: MARKET_ID } });
    await db.category.deleteMany({ where: { slug: { startsWith: "it-" } } });
    await db.$disconnect();
  });

  it("creates, reads, updates and soft-deletes a category", async () => {
    const created = await db.category.create({
      data: { name: "Heavyweight", slug: "it-heavyweight" },
    });
    expect(created.id).toBeDefined();
    expect(created.deletedAt).toBeNull();

    const found = await db.category.findUnique({ where: { slug: "it-heavyweight" } });
    expect(found?.name).toBe("Heavyweight");

    const updated = await db.category.update({
      where: { id: created.id },
      data: { name: "Heavyweight Division" },
    });
    expect(updated.name).toBe("Heavyweight Division");

    const deleted = await db.category.update({
      where: { id: created.id },
      data: { deletedAt: new Date() },
    });
    expect(deleted.deletedAt).toBeInstanceOf(Date);
  });

  it("enforces a unique slug", async () => {
    await db.category.upsert({
      where: { slug: "it-unique" },
      create: { name: "Unique", slug: "it-unique" },
      update: {},
    });

    await expect(
      db.category.create({ data: { name: "Duplicate", slug: "it-unique" } })
    ).rejects.toThrow();
  });

  it("links a market to a category through Market.categoryId", async () => {
    const category = await db.category.create({
      data: { name: "Lightweight", slug: "it-lightweight" },
    });

    await db.market.create({
      data: {
        id: MARKET_ID,
        contractAddress: "CMARKETCATEGORYIT",
        fighterA: { name: "A" },
        fighterB: { name: "B" },
        scheduledAt: new Date("2030-01-01T00:00:00Z"),
        bettingEndsAt: new Date("2029-12-31T00:00:00Z"),
        createdAt: new Date(),
        createdBy: "GCREATORCATEGORYIT",
        oracleAddress: "GORACLECATEGORYIT",
        categoryId: category.id,
      },
    });

    const market = await db.market.findUnique({
      where: { id: MARKET_ID },
      include: { category: true },
    });
    expect(market?.categoryId).toBe(category.id);
    expect(market?.category?.slug).toBe("it-lightweight");
  });
});
