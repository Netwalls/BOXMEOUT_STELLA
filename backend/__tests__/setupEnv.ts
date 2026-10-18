/**
 * Test-only defaults for the environment variables config.ts requires at import
 * time. Values already set by CI or the developer's shell win.
 */
const defaults: Record<string, string> = {
  NODE_ENV: "test",
  DATABASE_URL: "postgresql://boxmeout:boxmeout@localhost:5432/boxmeout_test",
  REDIS_URL: "redis://localhost:6379",
  STELLAR_RPC_URL: "https://soroban-testnet.stellar.org",
  STELLAR_HORIZON_URL: "https://horizon-testnet.stellar.org",
  MARKET_FACTORY_CONTRACT_ID: "CTESTFACTORY",
  TREASURY_CONTRACT_ID: "CTESTTREASURY",
  ADMIN_SECRET_KEY: "STESTSECRET",
  ADMIN_API_KEY: "test-admin-key",
  ORACLE_API_KEY: "test-oracle-key",
};

for (const [key, value] of Object.entries(defaults)) {
  process.env[key] ??= value;
}
