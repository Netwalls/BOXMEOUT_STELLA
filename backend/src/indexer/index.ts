/**
 * Indexer entry point.
 *
 * Starts the Soroban RPC event subscription loop and handles graceful shutdown
 * on SIGINT / SIGTERM so the process exits cleanly without leaving the cursor
 * or Prisma connection in an inconsistent state.
 *
 * Run as a separate process:
 *   npm run indexer        # compiled JS (production)
 *   npm run indexer:dev    # ts-node-dev with hot-reload (development)
 *
 * Environment variables required:
 *   STELLAR_RPC_URL            - Soroban RPC endpoint
 *   MARKET_FACTORY_CONTRACT_ID - MarketFactory contract address
 *   TREASURY_CONTRACT_ID       - Treasury contract address
 *   DATABASE_URL               - PostgreSQL connection string
 *   REDIS_URL                  - Redis connection URL
 */
import { startIndexer, stopIndexer } from "../services/indexer.service";
import { db } from "../db";
import { redis } from "../lib/redis";
import { logger } from "../logger";

// ─── Boot ─────────────────────────────────────────────────────────────────────

startIndexer().catch((err) => {
  logger.fatal({ err }, "Indexer crashed");
  process.exit(1);
});

// ─── Graceful shutdown ────────────────────────────────────────────────────────

/**
 * Configurable forced-exit timeout (ms).
 * Override via SHUTDOWN_TIMEOUT_MS env var.
 */
const SHUTDOWN_TIMEOUT_MS = parseInt(
  process.env.SHUTDOWN_TIMEOUT_MS ?? "10000",
  10
);

let shutdownInProgress = false;

async function shutdown(signal: string): Promise<void> {
  if (shutdownInProgress) return;
  shutdownInProgress = true;

  logger.info({ signal }, "Indexer shutdown signal received — closing gracefully");

  const forceExitTimer = setTimeout(() => {
    logger.error(
      `Indexer graceful shutdown timed out after ${SHUTDOWN_TIMEOUT_MS} ms — forcing exit`
    );
    process.exit(1);
  }, SHUTDOWN_TIMEOUT_MS).unref();

  try {
    // 1. Signal the polling loop to stop and wait for it to exit.
    await stopIndexer();
    logger.info("Indexer loop stopped");

    // 2. Close Prisma connection pool.
    await db.$disconnect();
    logger.info("Prisma disconnected");

    // 3. Close the shared Redis connection.
    await redis.quit();
    logger.info("Redis connection closed");

    clearTimeout(forceExitTimer);
    logger.info("Indexer shutdown complete");
    process.exit(0);
  } catch (err) {
    logger.error({ err }, "Error during indexer shutdown");
    clearTimeout(forceExitTimer);
    process.exit(1);
  }
}

// B-55: Deduplicated signal handlers.
process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));
