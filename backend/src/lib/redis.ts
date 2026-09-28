/**
 * Shared ioredis singleton.
 *
 * Importing this module from multiple files always returns the same Redis
 * instance, which means the process can cleanly call `redis.quit()` once
 * on shutdown instead of tracking every per-module connection.
 */
import Redis from "ioredis";

declare global {
  // eslint-disable-next-line no-var
  var __redis: Redis | undefined;
}

export const redis: Redis =
  globalThis.__redis ??
  new Redis(process.env.REDIS_URL ?? "redis://localhost:6379", {
    // Disable automatic reconnect so the process can exit cleanly.
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  });

if (process.env.NODE_ENV !== "production") {
  globalThis.__redis = redis;
}
