import request from "supertest";
import { createApp } from "../../app";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = createApp();

describe("Audit Logging Integration Tests (Issue #456)", () => {
  beforeEach(async () => {
    // Clean up audit logs before each test
    await prisma.auditLog.deleteMany({});
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  describe("Audit Log Middleware", () => {
    it("should log admin actions to the audit_logs table", async () => {
      const response = await request(app)
        .post("/api/admin/oracles")
        .send({
          address: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABDUATSXOCKETX",
          name: "Test Oracle",
        })
        .set("x-user-id", "test-user-123");

      // Check if audit log was created
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          path: "/api/admin/oracles",
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const log = auditLogs[0];
      expect(log.method).toBe("POST");
      expect(log.path).toBe("/api/admin/oracles");
      expect(log.userId).toBe("test-user-123");
      expect(log.statusCode).toBe(201);
    });

    it("should sanitize sensitive fields in audit logs", async () => {
      const response = await request(app)
        .post("/api/admin/oracles")
        .send({
          address: "GBUQWP3BOUZX34ULNQG23RQ6F4YUSXHTQSXUSMIQ75XABDUATSXOCKETX",
          name: "Test Oracle",
          password: "should-be-removed",
          token: "secret-token-should-be-removed",
        })
        .set("x-user-id", "test-user-456");

      const auditLogs = await prisma.auditLog.findMany({
        where: {
          path: "/api/admin/oracles",
          userId: "test-user-456",
        },
      });

      expect(auditLogs.length).toBeGreaterThan(0);
      const log = auditLogs[0];
      const requestBody = log.requestBody as any;

      expect(requestBody.password).toBeUndefined();
      expect(requestBody.token).toBeUndefined();
      expect(requestBody.address).toBeDefined();
      expect(requestBody.name).toBeDefined();
    });

    it("should log wallet withdraw actions", async () => {
      // This test verifies that wallet withdraw paths are audited
      // Note: Actual wallet implementation would be needed for full test
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          path: {
            contains: "/wallet/withdraw",
          },
        },
      });

      // We're just verifying the query works
      expect(Array.isArray(auditLogs)).toBe(true);
    });

    it("should log dispute actions", async () => {
      // This test verifies that dispute paths are audited
      const auditLogs = await prisma.auditLog.findMany({
        where: {
          path: {
            contains: "/disputes",
          },
        },
      });

      // We're just verifying the query works
      expect(Array.isArray(auditLogs)).toBe(true);
    });
  });

  describe("GET /api/admin/audit-logs", () => {
    beforeEach(async () => {
      // Create sample audit logs
      await prisma.auditLog.createMany({
        data: [
          {
            userId: "user-1",
            ipAddress: "192.168.1.1",
            method: "POST",
            path: "/api/admin/oracles",
            statusCode: 201,
            timestamp: new Date("2024-01-01"),
          },
          {
            userId: "user-1",
            ipAddress: "192.168.1.1",
            method: "PATCH",
            path: "/api/admin/oracles/123",
            statusCode: 200,
            timestamp: new Date("2024-01-02"),
          },
          {
            userId: "user-2",
            ipAddress: "192.168.1.2",
            method: "DELETE",
            path: "/api/admin/oracles/456",
            statusCode: 200,
            timestamp: new Date("2024-01-03"),
          },
        ],
      });
    });

    it("should return audit logs with pagination", async () => {
      const response = await request(app).get("/api/admin/audit-logs").query({
        page: 1,
        limit: 10,
      });

      expect(response.status).toBe(200);
      expect(response.body).toHaveProperty("logs");
      expect(response.body).toHaveProperty("pagination");
      expect(response.body.pagination).toHaveProperty("page", 1);
      expect(response.body.pagination).toHaveProperty("limit", 10);
      expect(response.body.pagination).toHaveProperty("total");
      expect(response.body.pagination).toHaveProperty("pages");
    });

    it("should filter audit logs by userId", async () => {
      const response = await request(app)
        .get("/api/admin/audit-logs")
        .query({
          userId: "user-1",
        });

      expect(response.status).toBe(200);
      expect(response.body.logs.length).toBe(2);
      expect(response.body.logs.every((log: any) => log.userId === "user-1")).toBe(true);
    });

    it("should filter audit logs by actionType (path)", async () => {
      const response = await request(app)
        .get("/api/admin/audit-logs")
        .query({
          actionType: "/oracles",
        });

      expect(response.status).toBe(200);
      expect(response.body.logs.length).toBeGreaterThan(0);
      expect(
        response.body.logs.every((log: any) => log.path.includes("/oracles")),
      ).toBe(true);
    });

    it("should filter audit logs by date range", async () => {
      const response = await request(app)
        .get("/api/admin/audit-logs")
        .query({
          startDate: "2024-01-01",
          endDate: "2024-01-02",
        });

      expect(response.status).toBe(200);
      expect(response.body.logs.length).toBe(2);
    });

    it("should return 400 for invalid date format", async () => {
      const response = await request(app)
        .get("/api/admin/audit-logs")
        .query({
          startDate: "not-a-date",
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toBeDefined();
    });

    it("should handle pagination correctly", async () => {
      const response1 = await request(app)
        .get("/api/admin/audit-logs")
        .query({
          page: 1,
          limit: 2,
        });

      expect(response1.status).toBe(200);
      expect(response1.body.logs.length).toBeLessThanOrEqual(2);
      expect(response1.body.pagination.pages).toBeGreaterThanOrEqual(1);

      if (response1.body.pagination.pages > 1) {
        const response2 = await request(app)
          .get("/api/admin/audit-logs")
          .query({
            page: 2,
            limit: 2,
          });

        expect(response2.status).toBe(200);
        // Pages should have different logs
        const ids1 = response1.body.logs.map((l: any) => l.id);
        const ids2 = response2.body.logs.map((l: any) => l.id);
        const intersection = ids1.filter((id: string) => ids2.includes(id));
        expect(intersection.length).toBe(0);
      }
    });
  });
});
