// Database connection and Prisma client singleton
import { PrismaClient } from '@prisma/client';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

// Use test database URL if in test environment
const databaseUrl = process.env.NODE_ENV === 'test' 
  ? (process.env.DATABASE_URL_TEST || process.env.DATABASE_URL)
  : process.env.DATABASE_URL;

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
    datasources: {
      db: {
        url: databaseUrl,
      },
    },
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}

// Graceful shutdown
export async function disconnectDatabase() {
  await prisma.$disconnect();
}

// Health check
export async function checkDatabaseConnection(): Promise<boolean> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return true;
  } catch (error) {
    console.error('Database connection failed:', error);
    return false;
  }
}
