// Default environment for every Jest worker. Values here are placeholders:
// tests that need real infrastructure must mock it, not connect to it.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://boxmeout:boxmeout@localhost:5432/boxmeout_test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.JWT_SECRET =
  process.env.JWT_SECRET ?? "test-only-jwt-secret-not-for-production-0123456789";
process.env.STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? "testnet";
// Required by src/config.ts so modules that import it load under test.
// Placeholders only: nothing in the suite connects to these endpoints.
process.env.STELLAR_RPC_URL = process.env.STELLAR_RPC_URL ?? "https://rpc.test.invalid";
process.env.STELLAR_HORIZON_URL = process.env.STELLAR_HORIZON_URL ?? "https://horizon.test.invalid";
process.env.MARKET_FACTORY_CONTRACT_ID = process.env.MARKET_FACTORY_CONTRACT_ID ?? "CTESTFACTORY";
process.env.TREASURY_CONTRACT_ID = process.env.TREASURY_CONTRACT_ID ?? "CTESTTREASURY";
process.env.ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY ?? "STESTSECRET";
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "test-admin-key";
process.env.ORACLE_API_KEY = process.env.ORACLE_API_KEY ?? "test-oracle-key";
