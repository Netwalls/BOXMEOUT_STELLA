import express from "express";
import { httpLogger } from "./logger";
import { auditLogMiddleware } from "./api/middleware/audit-log.middleware";
import marketRoutes from "./api/routes/market.routes";
import betRoutes from "./api/routes/bet.routes";
import adminRoutes from "./api/routes/admin.routes";
import healthRoutes from "./api/routes/health.routes";

export function createApp(): express.Application {
  const app = express();

  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );

  app.use(express.json());
  app.use(httpLogger);

  // Register audit logging middleware (Issue #456)
  app.use(auditLogMiddleware);

  app.use("/", healthRoutes);
  app.use("/api/markets", marketRoutes);
  app.use("/api/bets", betRoutes);
  app.use("/api/admin", adminRoutes);

  return app;
}
