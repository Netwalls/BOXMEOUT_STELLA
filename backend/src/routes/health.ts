import { Router, Request, Response } from 'express';
import { checkDatabaseConnection, prisma } from '../database/prisma.js';
import {
  getRedisStatus,
  isRedisHealthy,
  getRedisClient,
} from '../config/redis.js';

const router = Router();

/**
 * Check PostgreSQL connectivity with detailed metrics
 */
async function checkPostgresHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  connected: boolean;
  responseTime?: number;
  error?: string;
}> {
  const startTime = Date.now();
  try {
    await prisma.$queryRaw`SELECT 1`;
    const responseTime = Date.now() - startTime;
    return {
      status: 'healthy',
      connected: true,
      responseTime,
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Redis connectivity with detailed metrics
 */
async function checkRedisHealth(): Promise<{
  status: 'healthy' | 'unhealthy';
  connected: boolean;
  responseTime?: number;
  error?: string;
}> {
  const startTime = Date.now();
  try {
    const client = getRedisClient();
    const pong = await client.ping();
    const responseTime = Date.now() - startTime;

    if (pong === 'PONG') {
      return {
        status: 'healthy',
        connected: true,
        responseTime,
      };
    }

    return {
      status: 'unhealthy',
      connected: false,
      error: 'Invalid ping response',
    };
  } catch (error) {
    return {
      status: 'unhealthy',
      connected: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check Soroban RPC reachability
 */
async function checkSorobanHealth(): Promise<{
  status: 'healthy' | 'unhealthy' | 'not_configured';
  reachable: boolean;
  responseTime?: number;
  error?: string;
  endpoint?: string;
}> {
  const rpcUrl = process.env.STELLAR_SOROBAN_RPC_URL;

  if (!rpcUrl) {
    return {
      status: 'not_configured',
      reachable: false,
      error: 'STELLAR_SOROBAN_RPC_URL not configured',
    };
  }

  const startTime = Date.now();
  try {
    const response = await fetch(rpcUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'getHealth',
        params: {},
      }),
      signal: AbortSignal.timeout(5000), // 5 second timeout
    });

    const responseTime = Date.now() - startTime;

    if (response.ok) {
      const data = (await response.json()) as {
        result?: { status?: string };
      };
      return {
        status: data.result?.status === 'healthy' ? 'healthy' : 'unhealthy',
        reachable: true,
        responseTime,
        endpoint: rpcUrl,
      };
    }

    return {
      status: 'unhealthy',
      reachable: false,
      responseTime,
      error: `HTTP ${response.status}: ${response.statusText}`,
      endpoint: rpcUrl,
    };
  } catch (error) {
    const responseTime = Date.now() - startTime;
    return {
      status: 'unhealthy',
      reachable: false,
      responseTime,
      error: error instanceof Error ? error.message : 'Unknown error',
      endpoint: rpcUrl,
    };
  }
}

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

/**
 * Deep health check - Comprehensive dependency check
 * Checks PostgreSQL, Redis, and Soroban RPC with detailed metrics
 */
router.get('/health/deep', async (_req: Request, res: Response) => {
  const timestamp = new Date().toISOString();

  // Run all health checks in parallel
  const [postgresHealth, redisHealth, sorobanHealth] = await Promise.all([
    checkPostgresHealth(),
    checkRedisHealth(),
    checkSorobanHealth(),
  ]);

  // Determine overall status
  const allHealthy =
    postgresHealth.status === 'healthy' &&
    redisHealth.status === 'healthy' &&
    (sorobanHealth.status === 'healthy' ||
      sorobanHealth.status === 'not_configured');

  const statusCode = allHealthy ? 200 : 503;
  const overallStatus = allHealthy ? 'healthy' : 'degraded';

  res.status(statusCode).json({
    status: overallStatus,
    timestamp,
    uptime: process.uptime(),
    service: 'boxmeout-backend',
    components: {
      postgresql: {
        status: postgresHealth.status,
        connected: postgresHealth.connected,
        responseTime: postgresHealth.responseTime,
        error: postgresHealth.error,
      },
      redis: {
        status: redisHealth.status,
        connected: redisHealth.connected,
        responseTime: redisHealth.responseTime,
        error: redisHealth.error,
      },
      soroban_rpc: {
        status: sorobanHealth.status,
        reachable: sorobanHealth.reachable,
        responseTime: sorobanHealth.responseTime,
        endpoint: sorobanHealth.endpoint,
        error: sorobanHealth.error,
      },
    },
  });
});

export default router;
