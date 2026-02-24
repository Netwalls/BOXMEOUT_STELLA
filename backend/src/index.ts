import express, { Request, Response, NextFunction } from 'express';
import { config } from 'dotenv';

// Load environment variables
config();

// Import routes
import authRoutes from './routes/auth.routes.js';
import marketRoutes from './routes/markets.routes.js';
import oracleRoutes from './routes/oracle.js';
import predictionRoutes from './routes/predictions.js';
import tradingRoutes from './routes/trading.js';
import treasuryRoutes from './routes/treasury.routes.js';
import referralsRoutes from './routes/referrals.routes.js';
import leaderboardRoutes from './routes/leaderboard.routes.js';

// Import Redis initialization
import {
  initializeRedis,
  closeRedisConnection,
  getRedisStatus,
} from './config/redis.js';

// Import ALL middleware
import {
  securityHeaders,
  corsMiddleware,
  xssProtection,
  frameGuard,
  noCache,
} from './middleware/security.middleware.js';

import { requestIdMiddleware } from './middleware/requestId.middleware.js';
import { requestLogger } from './middleware/logging.middleware.js';
import { metricsMiddleware } from './middleware/metrics.middleware.js';
import { logger } from './utils/logger.js';
import {
  errorHandler,
  notFoundHandler,
} from './middleware/error.middleware.js';
import {
  authRateLimiter,
  challengeRateLimiter,
  apiRateLimiter,
  refreshRateLimiter,
  sensitiveOperationRateLimiter,
} from './middleware/rateLimit.middleware.js';

// Import Swagger setup
import { setupSwagger } from './config/swagger.js';

// Import Cron initialization
import { cronService } from './services/cron.service.js';

// Initialize Express app
const app: express.Express = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// =============================================================================
// MIDDLEWARE STACK - UPDATED WITH NEW MIDDLEWARE
// =============================================================================

// Security headers (using new helmet configuration)
app.use(securityHeaders);

// CORS configuration (using new middleware)
app.use(corsMiddleware);

// Additional security headers
app.use(xssProtection);
app.use(frameGuard);
app.use(noCache);

// Request parsing with limits
app.use(express.json({ limit: '10mb' })); // Increased for blockchain operations
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Request ID and structured request logging (requestId + userId in logs)
app.use(requestIdMiddleware);
app.use(requestLogger);

// Metrics tracking middleware
app.use(metricsMiddleware);

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Health Routes
import healthRoutes from './routes/health.js';
app.use('/api', healthRoutes);

// Metrics Routes (before rate limiting)
import metricsRoutes from './routes/metrics.routes.js';
app.use('/metrics', metricsRoutes);

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Basic health check
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Service is healthy
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 *                 version:
 *                   type: string
 *                   example: 1.0.0
 */
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
  });
});

/**
 * @swagger
 * /health/detailed:
 *   get:
 *     summary: Detailed health check with service status
 *     tags: [Health]
 *     responses:
 *       200:
 *         description: Detailed health status
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 status:
 *                   type: string
 *                   example: healthy
 *                 timestamp:
 *                   type: string
 *                   format: date-time
 *                 environment:
 *                   type: string
 *                   example: development
 *                 services:
 *                   type: object
 *                   properties:
 *                     redis:
 *                       type: object
 *                       properties:
 *                         connected:
 *                           type: boolean
 *                         status:
 *                           type: string
 */
app.get('/health/detailed', async (req, res) => {
  const redisStatus = getRedisStatus();

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    version: process.env.npm_package_version || '1.0.0',
    services: {
      redis: redisStatus,
      // Add database status check here when prisma is connected
    },
  });
});

// =============================================================================
// API DOCUMENTATION (SWAGGER)
// =============================================================================

// Setup Swagger documentation
setupSwagger(app);

// =============================================================================
// API ROUTES
// =============================================================================

// Apply general rate limiter to all API routes
app.use('/api', apiRateLimiter);

// Authentication routes with specific rate limiting
app.use('/api/auth', authRateLimiter, authRoutes);

// Market routes
app.use('/api/markets', marketRoutes);
app.use('/api/markets', oracleRoutes);

// Prediction routes (commit-reveal flow)
app.use('/api/markets', predictionRoutes);

// Trading routes (buy/sell shares, odds)
app.use('/api/markets', tradingRoutes);
// Treasury routes
app.use('/api/treasury', treasuryRoutes);

// Referral routes
app.use('/api/referrals', referralsRoutes);

// Leaderboard routes
app.use('/api/leaderboard', leaderboardRoutes);

// =============================================================================
// ERROR HANDLING - UPDATED WITH NEW ERROR HANDLER
// =============================================================================

// Use the new 404 handler
app.use(notFoundHandler);

// Use the new global error handler
app.use(errorHandler);

// =============================================================================
// SERVER STARTUP
// =============================================================================

async function startServer(): Promise<void> {
  try {
    // Initialize Redis connection
    logger.info('Connecting to Redis');
    await initializeRedis();

    // TODO: Initialize Prisma/Database connection
    // await prisma.$connect();
    // logger.info('Database connected');

    // Initialize Cron Service
    await cronService.initialize();

    // Start HTTP server
    app.listen(PORT, () => {
      logger.info('BoxMeOut Stella Backend API started', {
        environment: NODE_ENV,
        port: PORT,
        api: `http://localhost:${PORT}`,
        docs: `http://localhost:${PORT}/api-docs`,
        health: `http://localhost:${PORT}/health`,
      });
    });
  } catch (error) {
    logger.error('Failed to start server', { error });
    process.exit(1);
  }
}

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

async function gracefulShutdown(signal: string): Promise<void> {
  logger.info(`${signal} received. Shutting down gracefully`);

  try {
    // Close Redis connection
    await closeRedisConnection();

    // TODO: Close database connection
    // await prisma.$disconnect();

    logger.info('Cleanup completed. Exiting.');
    process.exit(0);
  } catch (error) {
    logger.error('Error during shutdown', { error });
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught Exception', { error });
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled Rejection', { promise, reason });
});

// Start the server if runs directly
import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export { startServer };
export default app;
