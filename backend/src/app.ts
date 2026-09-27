import express, { Request, Response, NextFunction } from "express";
import { httpLogger } from "./logger";
import { auditLogMiddleware } from "./api/middleware/audit-log.middleware";
import { errorHandlerMiddleware } from "./api/middleware/errorHandler.middleware";
import { requestIdMiddleware } from "./api/middleware/requestId.middleware";
import { metricsRouter, httpRequestDuration } from "./metrics";
import marketRoutes from "./api/routes/market.routes";
import betRoutes from "./api/routes/bet.routes";
import usersRoutes from "./api/routes/users.routes";
import adminRoutes from "./api/routes/admin.routes";
import authRoutes from "./api/routes/auth.routes";
import oracleRoutes from "./api/routes/oracle.routes";
import healthRoutes from "./api/routes/health.routes";
import docsRoutes from "./api/routes/docs.routes";

export function createApp(): express.Application {
  const app = express();

  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );

  // B-59: attach / echo X-Request-Id before any logging or routing
  app.use(requestIdMiddleware);

  app.use(express.json());
  app.use(httpLogger);

  // B-61: Prometheus HTTP histogram — record every request after it completes
  app.use((req: express.Request, res: express.Response, next: express.NextFunction) => {
    const start = Date.now();
    res.on("finish", () => {
      const duration = (Date.now() - start) / 1000;
      httpRequestDuration
        .labels(req.method, req.route?.path ?? req.path, String(res.statusCode))
        .observe(duration);
    });
    next();
  });

  // Register audit logging middleware (Issue #456)
  app.use(auditLogMiddleware);

  // B-61: /metrics endpoint (Prometheus scrape target)
  app.use("/", metricsRouter);

  app.use("/", healthRoutes);
  app.use("/api/markets", marketRoutes);
  app.use("/api/bets", betRoutes);
  app.use("/api/users", usersRoutes);
  app.use("/api/admin", adminRoutes);
  app.use("/api/oracle", oracleRoutes);

  // #1220: Mount auth routes so clients can obtain wallet-auth challenges.
  app.use("/api/auth", authRoutes);

  // #1221: Mount oracle routes (protected by Bearer ORACLE_API_KEY in controller).
  app.use("/api/oracle", oracleRoutes);

  // B-37: Swagger UI — dev mode only (Issue #1095)
  if (process.env.NODE_ENV !== "production") {
    app.use("/docs", docsRoutes);
  }

  app.use(errorHandlerMiddleware);

  return app;
}
