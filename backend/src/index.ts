// Validate environment variables before starting (throws on missing vars)
import { config } from "./config";
import { createApp } from "./app";
import { logger } from "./logger";
import { db } from "./db";
import { redis } from "./lib/redis";
import {
  startResolutionService,
  stopResolutionService,
} from "./services/resolution.service";

// ─── Boot ─────────────────────────────────────────────────────────────────────

const PORT = config.PORT;

const app = createApp();

const server = app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
  startResolutionService();
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

/**
 * Configurable forced-exit timeout (ms).
 * If the shutdown sequence hasn't finished by this deadline the process
 * exits with code 1 so it is never left dangling.
 * Override via SHUTDOWN_TIMEOUT_MS env var.
 */
const SHUTDOWN_TIMEOUT_MS = parseInt(
  process.env.SHUTDOWN_TIMEOUT_MS ?? "10000",
  10
);

let shutdownInProgress = false;

async function shutdown(signal: string): Promise<void> {
  // Deduplicate: ignore a second signal while already shutting down.
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  logger.info({ signal }, "Shutdown signal received — closing gracefully");

  // Arm a forced-exit timer so the process cannot hang forever.
  const forceExitTimer = setTimeout(() => {
    logger.error(
      `Graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS} ms — forcing exit`
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    // 1. Stop accepting new HTTP connections.
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    );
    logger.info("HTTP server closed");

    // 2. Stop the resolution cron job.
    stopResolutionService();
    logger.info("Resolution service stopped");

    // 3. Close Prisma connection pool.
    await db.$disconnect();
    logger.info("Prisma disconnected");

    // 4. Close the shared Redis connection.
    await redis.quit();
    logger.info("Redis connection closed");

    clearTimeout(forceExitTimer);
    logger.info("Graceful shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during graceful shutdown");
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

// B-55: Deduplicated signal handlers — both call the same `shutdown` routine.
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
