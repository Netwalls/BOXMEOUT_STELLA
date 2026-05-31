import express from "express";
import pinoHttp from "pino-http";
import { validateEnv } from "./config/env";
import { setupSwagger } from "./config/swagger";
import { errorMiddleware } from "./middleware/error.middleware";
import { initSentry, applySentryRequestHandler } from "./middleware/sentry.middleware";
import { rateLimit } from "./middleware/rate-limit.middleware";
import { requestLogging } from "./middleware/request-logging.middleware";
import { AppError } from "./utils/AppError";
import { logger } from "./utils/logger";
import authRouter from "./routes/auth.routes";
import marketRouter from "./routes/market.routes";
import adminRouter from "./routes/admin.routes";
import { getPortfolio, getPlatformStats } from "./api/controllers/MarketController";
import claimsRouter from "./routes/bet.routes";
import { startAutoResolutionCron, startAutoLockCron } from "./cron/autoResolution.cron";
import { initActivityFeed } from "./websocket/realtime";

// Validate environment variables on startup
const env = validateEnv();

// Initialise Sentry before any other code (captures unhandled rejections/exceptions)
initSentry(env.SENTRY_DSN, env.NODE_ENV);

const app = express();

// Middleware
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(requestLogging);

// Setup Swagger/OpenAPI documentation
if (env.NODE_ENV === 'development' || env.ENABLE_SWAGGER) {
  setupSwagger(app);
}

// Routes
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Rate-limited route groups
app.use("/auth", rateLimit({ windowMs: 60_000, max: 10, keyBy: "ip" }));
app.use("/api", rateLimit({ windowMs: 60_000, max: 60, keyBy: "ip" })); // Public endpoints
app.use("/api/oracle", rateLimit({ windowMs: 60_000, max: 10, keyBy: "ip" })); // Oracle endpoint stricter
app.use("/api/admin", rateLimit({ windowMs: 60_000, max: 20, keyBy: "ip" })); // Admin endpoints
app.use("/trading", rateLimit({ windowMs: 60_000, max: 60, keyBy: "userId" }));
app.use(
  "/wallet/withdraw",
  rateLimit({ windowMs: 60_000, max: 5, keyBy: "userId" }),
);

app.use("/auth", authRouter);
app.use("/api/markets", marketRouter);
app.use("/api/claims", claimsRouter);
app.get("/api/stats", getPlatformStats);
app.get("/api/portfolio/:address", getPortfolio);
app.use("/api/bets", claimsRouter);
app.use("/api/admin", adminRouter);
app.post("/trading/bet", (_req, res) => res.json({ ok: true }));
app.post("/wallet/withdraw", (_req, res) => res.json({ ok: true }));

// Example route that throws AppError
app.get("/test-error", (_req, _res, next) => {
  const error = AppError.notFound("Resource not found", undefined, { resource: "user" });
  next(error);
});

// Example route with unhandled error
app.get("/test-unhandled", (_req, _res) => {
  throw new Error("Unexpected error occurred");
});

// Example route with validation error
app.post("/api/users", (req, res, next) => {
  if (!req.body.email) {
    const error = AppError.badRequest("Validation error", undefined, {
      field: "email",
      reason: "Email is required",
    });
    return next(error);
  }
  res.json({ success: true });
});

// 404 handler - must be before error middleware
app.use((_req, _res, next) => {
  next(AppError.notFound("Route not found"));
});

// Sentry error handler - must be before errorMiddleware
applySentryRequestHandler(app);

// Error handler - must be LAST
app.use(errorMiddleware);

const PORT = env.PORT;
const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  if (env.NODE_ENV === 'development' || env.ENABLE_SWAGGER) {
    logger.info(`Swagger UI available at http://localhost:${PORT}/docs`);
  }
  startAutoResolutionCron();
  startAutoLockCron();
});

initActivityFeed(server);

export default app;
