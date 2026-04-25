import express from "express";
import pinoHttp from "pino-http";
import { errorMiddleware } from "./middleware/error.middleware";
import { rateLimit } from "./middleware/rate-limit.middleware";
import { AppError } from "./utils/AppError";
import { logger } from "./utils/logger";
import authRouter from "./routes/auth.routes";
import marketRouter from "./routes/market.routes";
import adminRouter from "./routes/admin.routes";

const app = express();

// Middleware
app.use(pinoHttp({ logger }));
app.use(express.json());

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
app.use("/api/admin", adminRouter);
app.post("/trading/bet", (_req, res) => res.json({ ok: true }));
app.post("/wallet/withdraw", (_req, res) => res.json({ ok: true }));

// Example route that throws AppError
app.get("/test-error", (_req, _res, next) => {
  const error = new AppError(404, "Resource not found", { resource: "user" });
  next(error);
});

// Example route with unhandled error
app.get("/test-unhandled", (_req, _res) => {
  throw new Error("Unexpected error occurred");
});

// Example route with validation error
app.post("/api/users", (req, res, next) => {
  if (!req.body.email) {
    const error = new AppError(400, "Validation error", {
      field: "email",
      reason: "Email is required",
    });
    return next(error);
  }
  res.json({ success: true });
});

// 404 handler - must be before error middleware
app.use((_req, _res, next) => {
  next(new AppError(404, "Route not found"));
});

// Error handler - must be LAST
app.use(errorMiddleware);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

export default app;
