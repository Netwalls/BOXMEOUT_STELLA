import { PrismaClient } from "@prisma/client";
import { config } from "./config";
import { logger } from "./logger";
import { withTimeout } from "./lib/timeout";
import { timeQuery, type QueryTimingDeps } from "./lib/query-timing";
import { dbQueryDuration } from "./metrics";

// Singleton guard: in development, ts-node-dev hot-reloads modules which would
// create a new PrismaClient on every reload, exhausting the connection pool.
// Storing the instance on globalThis ensures only one client exists per process.

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

/**
 * B-100: Prisma logs are routed through pino in event mode instead of Prisma's
 * own stdout logger, which prints query parameters (wallet addresses, request
 * fields) verbatim. Only the SQL template, duration and error target are logged.
 */
function createPrismaClient(): PrismaClient {
  const client = new PrismaClient({
    log: [
      { emit: "event", level: "query" },
      { emit: "event", level: "warn" },
      { emit: "event", level: "error" },
    ],
  });

  client.$on("query", (e) => {
    logger.debug({ query: e.query, durationMs: e.duration }, "prisma query");
  });
  client.$on("warn", (e) => {
    logger.warn({ target: e.target }, "prisma warning");
  });
  client.$on("error", (e) => {
    logger.error({ target: e.target }, "prisma error");
  });

  // B-102: every query gets an upper bound so a stuck database call cannot hold
  // a request open indefinitely. The query itself keeps running in the engine;
  // only the caller stops waiting for it.
  // B-140: every query is timed; slow ones are logged with model and action only.
  const timing: QueryTimingDeps = {
    slowMs: config.SLOW_QUERY_MS,
    observe: (labels, seconds) => dbQueryDuration.observe(labels, seconds),
    warn: (fields, message) => logger.warn(fields, message),
  };

  const timed = client.$extends({
    query: {
      $allOperations({ model, operation, args, query }) {
        return timeQuery(
          { model, action: operation },
          () =>
            withTimeout(
              query(args),
              config.DB_QUERY_TIMEOUT_MS,
              `prisma ${model ?? "raw"}.${operation}`,
            ),
          timing,
        );
      },
    },
  });

  // The extended client exposes the same API; the cast keeps existing
  // `PrismaClient` type annotations (including transaction clients) valid.
  return timed as unknown as PrismaClient;
}

export const db: PrismaClient = globalThis.__prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalThis.__prisma = db;
}
