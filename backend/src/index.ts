// backend/src/index.ts - Main Backend Entry Point
// BoxMeOut Stella - Prediction Market Backend API Server

import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config } from 'dotenv';

// Load environment variables
config();

// Import routes
import authRoutes from './routes/auth.routes.js';
import marketRoutes from './routes/markets.routes.js';
import predictionRoutes from './routes/predictions.js';

// Import Redis initialization
import { initializeRedis, closeRedisConnection, getRedisStatus } from './config/redis.js';

// Import middleware
import { apiRateLimiter } from './middleware/rateLimit.middleware.js';

// Initialize Express app
const app = express();
const PORT = process.env.PORT || 3000;
const NODE_ENV = process.env.NODE_ENV || 'development';

// =============================================================================
// MIDDLEWARE STACK
// =============================================================================

// Security headers
app.use(helmet());

// CORS configuration
app.use(
  cors({
    origin: process.env.FRONTEND_URL || 'http://localhost:5173',
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  })
);

// Body parsing
app.use(express.json({ limit: '10kb' })); // Limit body size for security
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

// Trust proxy (for rate limiting behind reverse proxy)
app.set('trust proxy', 1);

// =============================================================================
// HEALTH CHECK ENDPOINTS
// =============================================================================

/**
 * Basic health check
 */
app.get('/health', (_req: Request, res: Response) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
  });
});

/**
 * Detailed health check with service status
 */
app.get('/health/detailed', async (_req: Request, res: Response) => {
  const redisStatus = getRedisStatus();

  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    environment: NODE_ENV,
    services: {
      redis: redisStatus,
      // Add database status check here when prisma is connected
    },
  });
});

// =============================================================================
// API ROUTES
// =============================================================================

// Apply general rate limiter to all API routes
app.use('/api', apiRateLimiter);

// Authentication routes
app.use('/api/auth', authRoutes);

// Market routes
app.use('/api/markets', marketRoutes);

// Prediction routes (commit-reveal flow)
app.use('/api/markets', predictionRoutes);

// TODO: Add other routes as they are implemented
// app.use('/api/users', userRoutes);
// app.use('/api/leaderboard', leaderboardRoutes);

// =============================================================================
// ERROR HANDLING
// =============================================================================

/**
 * 404 handler for unknown routes
 */
app.use((_req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: {
      code: 'NOT_FOUND',
      message: 'Endpoint not found',
    },
  });
});

/**
 * Global error handler
 */
app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error('Unhandled error:', err);

  res.status(500).json({
    success: false,
    error: {
      code: 'INTERNAL_ERROR',
      message: NODE_ENV === 'production' ? 'An unexpected error occurred' : err.message,
    },
  });
});

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
║   Environment: ${NODE_ENV.padEnd(44)}║
║   Port: ${String(PORT).padEnd(52)}║
║   Health: http://localhost:${PORT}/health                       ║
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

