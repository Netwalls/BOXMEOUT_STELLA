import { Router, Request, Response } from 'express';
import { checkDatabaseConnection } from '../database/prisma.js';
import { getRedisStatus, isRedisHealthy } from '../config/redis.js';

const router = Router();

/**
 * Basic health check - Liveness probe
 * Returns 200 if the service is running
 */
router.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    service: 'boxmeout-backend',
  });
});

/**
 * Readiness check - Readiness probe
 * Checks if dependencies (DB, Redis) are available
 */
router.get('/ready', async (_req: Request, res: Response) => {
  const isDbConnected = await checkDatabaseConnection();
  const isRedisConnected = await isRedisHealthy();
  const redisStatus = getRedisStatus();

  const isReady = isDbConnected && isRedisConnected;

  if (isReady) {
    res.status(200).json({
      status: 'ready',
      timestamp: new Date().toISOString(),
      services: {
        database: { connected: true },
        redis: redisStatus,
      },
    });
  } else {
    res.status(503).json({
      status: 'not_ready',
      timestamp: new Date().toISOString(),
      services: {
        database: { connected: isDbConnected },
        redis: { ...redisStatus, connected: isRedisConnected },
      },
    });
  }
});

export default router;
