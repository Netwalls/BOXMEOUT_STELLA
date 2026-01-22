// Test setup and teardown
import { PrismaClient } from '@prisma/client';
import { execSync } from 'child_process';

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
    },
  },
});

let isSetup = false;

// Run migrations before tests (once)
beforeAll(async () => {
  if (!isSetup) {
    console.log('🔧 Setting up test database...');
    
    // Deploy migrations to test database
    try {
      execSync('npx prisma migrate deploy', {
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL_TEST || process.env.DATABASE_URL,
        },
        stdio: 'pipe',
      });
    } catch (error) {
      // Migrations may already be applied
    }
    
    isSetup = true;
  }
  
  // Clean database before each test file
  await cleanDatabase();
});

async function cleanDatabase() {
  // Delete all data in reverse order of dependencies (sequentially to respect foreign keys)
  await prisma.trade.deleteMany();
  await prisma.prediction.deleteMany();
  await prisma.share.deleteMany();
  await prisma.dispute.deleteMany();
  await prisma.market.deleteMany();
  await prisma.achievement.deleteMany();
  await prisma.leaderboard.deleteMany();
  await prisma.referral.deleteMany();
  await prisma.refreshToken.deleteMany();
  await prisma.transaction.deleteMany();
  await prisma.auditLog.deleteMany();
  await prisma.user.deleteMany();
}

// Disconnect after all tests
afterAll(async () => {
  await prisma.$disconnect();
});

export { prisma };
