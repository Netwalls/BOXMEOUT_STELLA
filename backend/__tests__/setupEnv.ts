// Default environment for every Jest worker. Values here are placeholders:
// tests that need real infrastructure must mock it, not connect to it.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://boxmeout:boxmeout@localhost:5432/boxmeout_test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? "testnet";
