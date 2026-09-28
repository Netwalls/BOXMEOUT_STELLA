import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import { httpLogger } from "./logger";
import { config } from "./config";
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

  // B-58: trust proxy so req.ip reflects the real client behind a load balancer
  app.set("trust proxy", config.trustProxy);

  app.set("json replacer", (_key: string, value: unknown) =>
    typeof value === "bigint" ? value.toString() : value
  );

  // B-56: CORS — allow only the origins listed in CORS_ORIGINS env var.
  // credentials: true lets the browser send cookies / Authorization headers.
  app.use(
    cors({
      origin: config.CORS_ORIGINS,
      credentials: true,
    })
  );

  // B-59: attach / echo X-Request-Id before any logging or routing
  app.use(requestIdMiddleware);

  // B-57: cap JSON body size to mitigate oversized-payload abuse
  app.use(express.json({ limit: "100kb" }));
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

  // #1220: Mount auth routes so clients can obtain wallet-auth challenges.
  app.use("/api/auth", authRoutes);

  // #1221: Mount oracle routes (X-Oracle-Key auth on submit, X-Admin-Key on results).
  app.use("/api/oracle", oracleRoutes);

  // #1249: Mount leaderboard routes (rank bettors by realised profit / win rate).
  app.use("/api/leaderboard", leaderboardRoutes);

  // B-37: Swagger UI — dev mode only (Issue #1095)
  if (process.env.NODE_ENV !== "production") {
    app.use("/docs", docsRoutes);
  }

  app.use(errorHandlerMiddleware);

  return app;
}
