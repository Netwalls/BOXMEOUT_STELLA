import express, { Request, Response, NextFunction } from 'express';
import { config } from 'dotenv';

// Load environment variables
config();

// Import routes
import authRoutes from './routes/auth.routes.js';
import marketRoutes from './routes/markets.routes.js';
import oracleRoutes from './routes/oracle.js';
import predictionRoutes from './routes/predictions.js';
import treasuryRoutes from './routes/treasury.routes.js';

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

import { requestLogger } from './middleware/logging.middleware.js';
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

// Initialize Express app
const app = express();
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

// Request logging
app.use(requestLogger);

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// Health Routes
import healthRoutes from './routes/health.js';
app.use('/api', healthRoutes);

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
// Metrics
import client from 'prom-client';
// Collect default metrics
const collectDefaultMetrics = client.collectDefaultMetrics;
collectDefaultMetrics({ register: client.register });

app.get('/metrics', async (_req: Request, res: Response) => {
  try {
    res.set('Content-Type', client.register.contentType);
    const metrics = await client.register.metrics();
    res.end(metrics);
  } catch (error) {
    res.status(500).end(error);
  }
});

// Authentication routes
app.use('/api/auth', authRoutes);

// Market routes
app.use('/api/markets', marketRoutes);
app.use('/api/markets', oracleRoutes);

// Prediction routes (commit-reveal flow)
app.use('/api/markets', predictionRoutes);

// Treasury routes
app.use('/api/treasury', treasuryRoutes);

// TODO: Add other routes as they are implemented
// app.use('/api/users', userRoutes);
// app.use('/api/leaderboard', leaderboardRoutes);

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
    console.log('🔌 Connecting to Redis...');
    await initializeRedis();

    // TODO: Initialize Prisma/Database connection
    // await prisma.$connect();
    // console.log('🗄️  Database connected');

    // Start HTTP server
    app.listen(PORT, () => {
      console.log(`
╔════════════════════════════════════════════════════════════════╗
║                                                                ║
║   🥊 BoxMeOut Stella Backend API                               ║
║                                                                ║
║   Environment: ${NODE_ENV.padEnd(32)} ║
║   Port: ${PORT.toString().padEnd(39)} ║
║   API: http://localhost:${PORT.toString().padEnd(36)} ║
║   Docs: http://localhost:${PORT}/api-docs${' '.padEnd(23)} ║
║   Health: http://localhost:${PORT}/health${' '.padEnd(22)} ║
║                                                                ║
╚════════════════════════════════════════════════════════════════╝
      `);
    });
  } catch (error) {
    console.error('❌ Failed to start server:', error);
    process.exit(1);
  }
}

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

async function gracefulShutdown(signal: string): Promise<void> {
  console.log(`\n🛑 ${signal} received. Shutting down gracefully...`);

  try {
    // Close Redis connection
    await closeRedisConnection();

    // TODO: Close database connection
    // await prisma.$disconnect();

    console.log('✅ Cleanup completed. Exiting.');
    process.exit(0);
  } catch (error) {
    console.error('❌ Error during shutdown:', error);
    process.exit(1);
  }
}

// Handle shutdown signals
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('❌ Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
});

// Start the server if runs directly
import { fileURLToPath } from 'url';

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  startServer();
}

export { startServer };
export default app;
