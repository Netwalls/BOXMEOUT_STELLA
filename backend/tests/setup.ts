import { config } from 'dotenv';
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';
import { beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { Keypair } from '@stellar/stellar-sdk';
import { logger } from '../src/utils/logger.js';

// Load environment variables before anything else
config();

// Set test environment
process.env.NODE_ENV = 'test';

// Set default env vars for testing if not present
process.env.JWT_ACCESS_SECRET =
  process.env.JWT_ACCESS_SECRET ||
  'test-secret-access-token-minimum-32-characters-required';
process.env.JWT_REFRESH_SECRET =
  process.env.JWT_REFRESH_SECRET ||
  'test-secret-refresh-token-minimum-32-characters-required';
process.env.DATABASE_URL =
  process.env.DATABASE_URL ||
  'postgresql://postgres:password@localhost:5432/boxmeout_test';
process.env.REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
process.env.ENCRYPTION_KEY =
  process.env.ENCRYPTION_KEY || 'test-encryption-key-32-chars!!';

// Stellar test configuration
process.env.ADMIN_WALLET_SECRET =
  'SDJ7L4H6O7H7HH7HH7HH7HH7HH7HH7HH7HH7HH7HH7HH7HH7HH7HH';
process.env.STELLAR_SOROBAN_RPC_URL = 'https://soroban-testnet.stellar.org';
process.env.STELLAR_NETWORK = 'testnet';
process.env.FACTORY_CONTRACT_ADDRESS =
  'CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';
process.env.AMM_CONTRACT_ADDRESS =
  'CAXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX';

// Mock console methods to keep test output clean for middleware tests
beforeEach(() => {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

// Database setup (only for integration tests that actually need it)
let prisma: PrismaClient | null = null;

// Only setup database if we're running integration tests
beforeAll(async () => {
  // Check if we should skip database setup (for unit tests)
  const isUnitTest = process.env.VITEST_TEST_FILE?.includes('middleware');

  if (isUnitTest) {
    logger.info('Skipping database setup for middleware unit tests');
    return;
  }

  // Only setup database for integration tests
  const hasDatabaseUrl =
    process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;

  if (hasDatabaseUrl && !process.env.SKIP_DB_SETUP) {
    logger.info('Setting up test database for integration tests');

    prisma = new PrismaClient({
      datasources: {
        db: {
          url: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
        },
      },
    });

    try {
      execSync('npx prisma migrate deploy', {
        env: {
          ...process.env,
          DATABASE_URL:
            process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
        },
        stdio: 'pipe',
      });
    } catch (error: any) {
      logger.warn('Database migrations may already be applied', {
        message: error.message,
      });
    }

    if (prisma) {
      await cleanDatabase(prisma);
    }
  }
});

async function cleanDatabase(client: PrismaClient) {
  try {
    // Delete all data in reverse order of dependencies
    await client.trade.deleteMany();
    await client.prediction.deleteMany();
    await client.share.deleteMany();
    await client.dispute.deleteMany();
    await client.market.deleteMany();
    await client.achievement.deleteMany();
    await client.leaderboard.deleteMany();
    await client.referral.deleteMany();
    await client.refreshToken.deleteMany();
    await client.transaction.deleteMany();
    await client.distribution.deleteMany();
    await client.auditLog.deleteMany();
    await client.user.deleteMany();
  } catch (error) {
    logger.warn('Failed to clean database', { error });
  }
}

// Disconnect after all tests
afterAll(async () => {
  // Restore console mocks
  vi.restoreAllMocks();

  // Only disconnect if we actually connected to database
  if (prisma) {
    await prisma.$disconnect();
  }
});

// Only export prisma if it was created
export { prisma };
