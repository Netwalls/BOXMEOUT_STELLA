import express from "express";
import cors from "cors";
import { httpLogger } from "./logger";
import { config } from "./config";
import { auditLogMiddleware } from "./api/middleware/audit-log.middleware";
import { errorHandlerMiddleware } from "./api/middleware/errorHandler.middleware";
import { notFoundMiddleware } from "./api/middleware/notFound.middleware";
import { requestIdMiddleware } from "./api/middleware/requestId.middleware";
import { securityHeadersMiddleware } from "./api/middleware/securityHeaders.middleware";
import { createCompressionMiddleware } from "./api/middleware/compression.middleware";
import { metricsRouter, httpRequestDuration } from "./metrics";
import marketRoutes from "./api/routes/market.routes";
import betRoutes from "./api/routes/bet.routes";
import usersRoutes from "./api/routes/users.routes";
import adminRoutes from "./api/routes/admin.routes";
import authRoutes from "./api/routes/auth.routes";
import oracleRoutes from "./api/routes/oracle.routes";
import healthRoutes from "./api/routes/health.routes";
import docsRoutes from "./api/routes/docs.routes";
import { maintenanceMiddleware } from "./api/middleware/maintenance.middleware";

/** B-141 (#1577): canonical versioned prefix for every resource router. */
export const API_VERSION_PREFIX = "/api/v1";

/**
 * B-141 (#1577): date after which the unversioned /api alias stops being served.
 * Advertised on every legacy response so clients can see the deadline.
 * Override with the API_SUNSET_DATE env var (HTTP-date format).
 */
const API_SUNSET_DATE =
  process.env.API_SUNSET_DATE ?? "Tue, 01 Jun 2027 00:00:00 GMT";

/**
 * B-141 (#1577): resource routers, mounted under a version prefix.
 * Built per mount so the two mounts do not share router state.
 */
function buildApiRouter(): express.Router {
  const api = express.Router();

  api.use("/markets", marketRoutes);
  api.use("/bets", betRoutes);
  api.use("/users", usersRoutes);
  api.use("/admin", adminRoutes);

  // #1220: auth routes so clients can obtain wallet-auth challenges.
  api.use("/auth", authRoutes);

  // #1221: oracle routes (X-Oracle-Key auth on submit, X-Admin-Key on results).
  api.use("/oracle", oracleRoutes);

  return api;
}

/**
 * B-141 (#1577): marks a response served from the unversioned /api alias.
 * Sets RFC 8594 Sunset plus a successor-version Link pointing at /api/v1 so
 * clients can discover the replacement path without reading the docs.
 */
function legacyApiDeprecationMiddleware(
  req: express.Request,
  res: express.Response,
  next: express.NextFunction
): void {
  res.setHeader("Deprecation", "true");
  res.setHeader("Sunset", API_SUNSET_DATE);
  res.setHeader(
    "Link",
    `<${API_VERSION_PREFIX}${req.path}>; rel="successor-version"`
  );
  next();
}

export function createApp(): express.Application {
  const app = express();

  // B-58: trust proxy so req.ip reflects the real client behind a load balancer
  app.set("trust proxy", config.TRUST_PROXY);

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

  // B-86: security headers before any route handler
  app.use(securityHeadersMiddleware);

  // B-124 (#1560): gzip JSON responses; SSE is excluded inside the middleware
  app.use(createCompressionMiddleware(config.COMPRESSION_ENABLED));

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

  // B-160: read-only maintenance mode. Non-GET requests get 503 while it is on.
  app.use(maintenanceMiddleware());

  app.use("/", healthRoutes);

  // B-141 (#1577): every resource router lives behind one versioned prefix.
  // Mounted twice: at /api/v1 (canonical) and at /api (deprecated alias), so a
  // breaking response-shape change can ship under a new version instead of
  // breaking every deployed frontend at once.
  app.use(API_VERSION_PREFIX, buildApiRouter());
  app.use("/api", legacyApiDeprecationMiddleware, buildApiRouter());

  // B-37: Swagger UI — dev mode only (Issue #1095)
  if (process.env.NODE_ENV !== "production") {
    app.use("/docs", docsRoutes);
  }

  // B-93: unmatched requests get a JSON 404 instead of Express's HTML default
  app.use(notFoundMiddleware);

  app.use(errorHandlerMiddleware);

  return app;
}
