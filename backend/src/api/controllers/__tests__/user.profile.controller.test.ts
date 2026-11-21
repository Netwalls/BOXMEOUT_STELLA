/**
 * B-159: PUT /api/users/:address validation at the HTTP layer.
 * The service and config are mocked, so no DB or env is needed.
 */
const mockUpdateUser = jest.fn();
jest.mock("../../../services/user.service", () => ({
  updateUser: (...args: unknown[]) => mockUpdateUser(...args),
  getUserByAddress: jest.fn(),
  getUserBets: jest.fn(),
}));

jest.mock("../../../config", () => ({
  config: { AVATAR_HOST_ALLOWLIST: [] },
}));

import express from "express";
import request from "supertest";
import { updateUserHandler } from "../user.controller";

const ADDRESS = "GBRPYHIL2CI3FNQ4BXLFMNDLFJUNPU2HY3ZMFSHONUCEOASW7QC7OX2H";

function buildApp() {
  const app = express();
  app.use(express.json({ limit: "100kb" }));
  app.put("/api/users/:address", updateUserHandler);
  return app;
}

describe("updateUserHandler validation", () => {
  beforeEach(() => {
    mockUpdateUser.mockImplementation(async (address: string, data: object) => ({
      address,
      ...data,
      createdAt: new Date(0),
      updatedAt: new Date(0),
    }));
  });

  it("returns 400 VALIDATION_ERROR for a bad displayName and does not call the service", async () => {
    const res = await request(buildApp())
      .put(`/api/users/${ADDRESS}`)
      .send({ displayName: "a".repeat(40) });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(res.body.error.message).toBe("displayName must be at most 32 characters");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns 400 for a javascript: avatarUrl", async () => {
    const res = await request(buildApp())
      .put(`/api/users/${ADDRESS}`)
      .send({ avatarUrl: "javascript:alert(document.cookie)" });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("returns 400 for an unknown key", async () => {
    const res = await request(buildApp())
      .put(`/api/users/${ADDRESS}`)
      .send({ displayName: "Ali", isAdmin: true });

    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe("VALIDATION_ERROR");
    expect(mockUpdateUser).not.toHaveBeenCalled();
  });

  it("passes the normalised values to the service", async () => {
    const res = await request(buildApp())
      .put(`/api/users/${ADDRESS}`)
      .send({ displayName: "  José  ", avatarUrl: " https://images.example.com/a.png " });

    expect(res.status).toBe(200);
    expect(mockUpdateUser).toHaveBeenCalledWith(ADDRESS, {
      displayName: "José",
      avatarUrl: "https://images.example.com/a.png",
    });
  });

  it("returns 500 when the service throws", async () => {
    mockUpdateUser.mockRejectedValue(new Error("db down"));

    const res = await request(buildApp())
      .put(`/api/users/${ADDRESS}`)
      .send({ displayName: "Ali" });

    expect(res.status).toBe(500);
    expect(res.body.error.code).toBe("INTERNAL_ERROR");
  });
});
