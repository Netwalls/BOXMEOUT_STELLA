import Redis from 'ioredis';
import { logger } from '../utils/logger.js';

// Environment configuration
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_PASSWORD = process.env.REDIS_PASSWORD;

// Singleton Redis client instance
let redisClient: Redis | null = null;

/**
 * Get the Redis client singleton
 * Creates a new connection if one doesn't exist
 */
export function getRedisClient(): Redis {
  if (!redisClient) {
    redisClient = new Redis(REDIS_URL, {
      password: REDIS_PASSWORD || undefined,
      maxRetriesPerRequest: 3,
      retryStrategy: (times) => {
        if (times > 3) {
          logger.error('Redis connection failed after 3 retries');
          return null; // Stop retrying
        }
        // Exponential backoff: 100ms, 200ms, 400ms
        return Math.min(times * 100, 2000);
      },
      lazyConnect: true,
      enableReadyCheck: true,
      connectTimeout: 10000,
    });

    // Connection event handlers
    redisClient.on('error', (err) => {
      logger.error('Redis connection error', { message: err.message });
    });

    redisClient.on('connect', () => {
      logger.info('Redis connecting');
    });

    redisClient.on('ready', () => {
      logger.info('Redis connected and ready');
    });

    redisClient.on('close', () => {
      logger.info('Redis connection closed');
    });

    redisClient.on('reconnecting', (delay: number) => {
      logger.info('Redis reconnecting', { delayMs: delay });
    });
  }

  return redisClient;
}

/**
 * Initialize Redis connection
 * Call this on application startup
 */
export async function initializeRedis(): Promise<void> {
  const client = getRedisClient();

  // Check if already connected
  if (client.status === 'ready' || client.status === 'connecting') {
    logger.info('Redis already connected/connecting');
    return;
  }

  try {
    logger.info('Connecting to Redis');
    await client.connect();

    // Test the connection
    const pong = await client.ping();
    if (pong !== 'PONG') {
      throw new Error('Redis ping failed');
    }
    logger.info('Redis connected successfully');
  } catch (error) {
    logger.error('Failed to connect to Redis', { error });
    throw error;
  }
}

/**
 * Close the Redis connection gracefully
 * Call this on application shutdown
 */
export async function closeRedisConnection(): Promise<void> {
  if (redisClient) {
    await redisClient.quit();
    redisClient = null;
    logger.info('Redis connection closed gracefully');
  }
}

/**
 * Check if Redis is connected and responsive
 */
export async function isRedisHealthy(): Promise<boolean> {
  if (!redisClient) {
    return false;
  }

  try {
    const pong = await redisClient.ping();
    return pong === 'PONG';
  } catch {
    return false;
  }
}

/**
 * Get Redis connection status info
 */
export function getRedisStatus(): {
  connected: boolean;
  status: string;
} {
  if (!redisClient) {
    return { connected: false, status: 'not_initialized' };
  }

  return {
    connected: redisClient.status === 'ready',
    status: redisClient.status,
  };
}

export default getRedisClient;
