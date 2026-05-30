import { redis } from '../config/redis';
import { logger } from '../utils/logger';

export { redis };

export async function cacheGet<T>(key: string): Promise<T | null> {
  try {
    const data = await redis.get(key);
    return data ? (JSON.parse(data) as T) : null;
  } catch (err) {
    logger.warn({ err, key }, 'cacheGet: Redis unavailable, bypassing cache');
    return null;
  }
}

export async function cacheSet(key: string, value: unknown, ttl_seconds: number): Promise<void> {
  try {
    await redis.set(key, JSON.stringify(value), 'EX', ttl_seconds);
  } catch (err) {
    logger.warn({ err, key }, 'cacheSet: Redis unavailable, bypassing cache');
  }
}

export async function cacheDelete(key: string): Promise<void> {
  try {
    await redis.del(key);
  } catch (err) {
    logger.warn({ err, key }, 'cacheDelete: Redis unavailable, bypassing cache');
  }
}

export async function cacheDeletePattern(pattern: string): Promise<void> {
  try {
    const keys: string[] = [];
    let cursor = '0';
    do {
      const [nextCursor, batch] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
      cursor = nextCursor;
      keys.push(...batch);
    } while (cursor !== '0');

    if (keys.length > 0) await redis.del(...keys);
  } catch (err) {
    logger.warn({ err, pattern }, 'cacheDeletePattern: Redis unavailable, bypassing cache');
  }
}
