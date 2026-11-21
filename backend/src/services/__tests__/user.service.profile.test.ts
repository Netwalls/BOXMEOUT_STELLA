/**
 * B-121 (#1557): profile fields persist on the User model, not AdminLog.
 */
import { getUserByAddress, updateUser } from "../user.service";
import { db } from "../../db";

jest.mock("../../db", () => ({
  db: {
    user: { findUnique: jest.fn(), upsert: jest.fn() },
    bet: { findFirst: jest.fn() },
    adminLog: { create: jest.fn() },
  },
}));

const mockDb = db as unknown as {
  user: { findUnique: jest.Mock; upsert: jest.Mock };
  bet: { findFirst: jest.Mock };
  adminLog: { create: jest.Mock };
};

const ADDR = "GABC";
const created = new Date("2026-01-01T00:00:00Z");
const updated = new Date("2026-02-01T00:00:00Z");

describe("getUserByAddress", () => {
  it("returns the profile from the User row even when the address has no bets", async () => {
    mockDb.user.findUnique.mockResolvedValue({
      address: ADDR,
      displayName: "Ali",
      avatarUrl: "https://cdn.example/a.png",
      createdAt: created,
      updatedAt: updated,
    });

    const profile = await getUserByAddress(ADDR);

    expect(profile).toEqual({
      address: ADDR,
      displayName: "Ali",
      avatarUrl: "https://cdn.example/a.png",
      createdAt: created,
      updatedAt: updated,
    });
    expect(mockDb.bet.findFirst).not.toHaveBeenCalled();
  });

  it("returns null for an unknown address with no bets", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.bet.findFirst.mockResolvedValue(null);

    await expect(getUserByAddress(ADDR)).resolves.toBeNull();
  });

  it("falls back to a bet-derived profile without display fields when no User row exists", async () => {
    mockDb.user.findUnique.mockResolvedValue(null);
    mockDb.bet.findFirst.mockResolvedValue({ placedAt: created });

    const profile = await getUserByAddress(ADDR);

    expect(profile?.address).toBe(ADDR);
    expect(profile?.createdAt).toEqual(created);
    expect(profile?.displayName).toBeUndefined();
    expect(profile?.avatarUrl).toBeUndefined();
  });
});

describe("updateUser", () => {
  it("upserts the User row with the provided fields", async () => {
    mockDb.user.upsert.mockResolvedValue({
      address: ADDR,
      displayName: "Ali",
      avatarUrl: null,
      createdAt: created,
      updatedAt: updated,
    });

    const result = await updateUser(ADDR, { displayName: "Ali" });

    expect(mockDb.user.upsert).toHaveBeenCalledWith({
      where: { address: ADDR },
      create: { address: ADDR, displayName: "Ali" },
      update: { displayName: "Ali" },
    });
    expect(result.displayName).toBe("Ali");
  });

  it("does not write profile data to AdminLog", async () => {
    mockDb.user.upsert.mockResolvedValue({
      address: ADDR,
      displayName: null,
      avatarUrl: "https://cdn.example/a.png",
      createdAt: created,
      updatedAt: updated,
    });

    await updateUser(ADDR, { avatarUrl: "https://cdn.example/a.png" });

    expect(mockDb.adminLog.create).not.toHaveBeenCalled();
  });

  it("only touches fields that were supplied", async () => {
    mockDb.user.upsert.mockResolvedValue({
      address: ADDR,
      displayName: null,
      avatarUrl: null,
      createdAt: created,
      updatedAt: updated,
    });

    await updateUser(ADDR, { avatarUrl: "https://cdn.example/b.png" });

    expect(mockDb.user.upsert).toHaveBeenCalledWith({
      where: { address: ADDR },
      create: { address: ADDR, avatarUrl: "https://cdn.example/b.png" },
      update: { avatarUrl: "https://cdn.example/b.png" },
    });
  });
});
