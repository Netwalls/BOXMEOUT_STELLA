import express from "express";
import pinoHttp from "pino-http";
import { validateEnv } from "./config/env";
import { setupSwagger } from "./config/swagger";
import { errorMiddleware } from "./middleware/error.middleware";
import { rateLimit } from "./middleware/rate-limit.middleware";
import { requestLogging } from "./middleware/request-logging.middleware";
import { AppError } from "./utils/AppError";
import { logger } from "./utils/logger";
import authRouter from "./routes/auth.routes";
import marketRouter from "./routes/market.routes";
import adminRouter from "./routes/admin.routes";
import claimsRouter from "./routes/bet.routes";
import oracleRouter from "./routes/oracle.routes";
import usersRouter from "./routes/users.routes";
import disputesRouter from "./routes/disputes.routes";
import tradingRouter from "./routes/trading.routes";
import walletRouter from "./routes/wallet.routes";
import predictionsRouter from "./routes/predictions.routes";
import leaderboardRouter from "./routes/leaderboard.routes";
import notificationsRouter from "./routes/notifications.routes";
import referralsRouter from "./routes/referrals.routes";
import achievementsRouter from "./routes/achievements.routes";
import { getPortfolio, getPlatformStats } from "./api/controllers/MarketController";
import { startAutoResolutionCron, startAutoLockCron } from "./cron/autoResolution.cron";

// Validate environment variables on startup
const env = validateEnv();

const app = express();

// Middleware
app.use(pinoHttp({ logger }));
app.use(express.json());
app.use(requestLogging);

// Setup Swagger/OpenAPI documentation
setupSwagger(app);

// Health check
app.get("/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Rate limiters
app.use("/auth", rateLimit({ windowMs: 60_000, max: 10, keyBy: "ip" }));
app.use("/api", rateLimit({ windowMs: 60_000, max: 60, keyBy: "ip" }));
app.use("/api/oracle", rateLimit({ windowMs: 60_000, max: 10, keyBy: "ip" }));
app.use("/api/admin", rateLimit({ windowMs: 60_000, max: 20, keyBy: "ip" }));
app.use("/trading", rateLimit({ windowMs: 60_000, max: 60, keyBy: "userId" }));
app.use("/wallet/withdraw", rateLimit({ windowMs: 60_000, max: 5, keyBy: "userId" }));

// Routes
app.use("/auth", authRouter);
app.use("/api/markets", marketRouter);
app.use("/api/claims", claimsRouter);
app.use("/api/bets", claimsRouter);
app.use("/api/oracle", oracleRouter);
app.use("/api/admin", adminRouter);
app.use("/api/users", usersRouter);
app.use("/api/disputes", disputesRouter);
app.use("/trading", tradingRouter);
app.use("/wallet", walletRouter);
app.use("/api/predictions", predictionsRouter);
app.use("/api/leaderboard", leaderboardRouter);
app.use("/api/notifications", notificationsRouter);
app.use("/api/referrals", referralsRouter);
app.use("/api/achievements", achievementsRouter);

app.get("/api/stats", getPlatformStats);
app.get("/api/portfolio/:address", getPortfolio);

// 404 handler
app.use((_req, _res, next) => {
  next(AppError.notFound("Route not found"));
});

// Error handler — must be last
app.use(errorMiddleware);

const PORT = env.PORT;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  const swaggerEnabled = env.NODE_ENV === "development" || env.ENABLE_SWAGGER;
  if (swaggerEnabled) {
    logger.info(`Swagger UI: http://localhost:${PORT}/docs`);
    logger.info(`OpenAPI JSON: http://localhost:${PORT}/docs/openapi.json`);
  }
  startAutoResolutionCron();
  startAutoLockCron();
});

export default app;
