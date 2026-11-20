import { Keypair, StrKey } from "@stellar/stellar-sdk";

// Default environment for every Jest worker. Values here are placeholders:
// tests that need real infrastructure must mock it, not connect to it.
// Every required key in src/config.schema.ts must be set here, because
// src/config.ts validates the environment when it is first imported (B-125).
// Stellar identifiers are generated at runtime so they pass StrKey checks
// without committing key-shaped strings to the repository.
process.env.NODE_ENV = process.env.NODE_ENV ?? "test";
process.env.DATABASE_URL =
  process.env.DATABASE_URL ?? "postgresql://boxmeout:boxmeout@localhost:5432/boxmeout_test";
process.env.REDIS_URL = process.env.REDIS_URL ?? "redis://localhost:6379";
process.env.STELLAR_NETWORK = process.env.STELLAR_NETWORK ?? "testnet";
process.env.STELLAR_RPC_URL = process.env.STELLAR_RPC_URL ?? "https://soroban-testnet.stellar.org";
process.env.STELLAR_HORIZON_URL =
  process.env.STELLAR_HORIZON_URL ?? "https://horizon-testnet.stellar.org";
process.env.BOXREC_API_URL = process.env.BOXREC_API_URL ?? "https://api.boxrec.test";
process.env.ADMIN_API_KEY = process.env.ADMIN_API_KEY ?? "test-admin-api-key";
process.env.ORACLE_API_KEY = process.env.ORACLE_API_KEY ?? "test-oracle-api-key";
process.env.MARKET_FACTORY_CONTRACT_ID =
  process.env.MARKET_FACTORY_CONTRACT_ID ?? StrKey.encodeContract(Buffer.alloc(32, 1));
process.env.TREASURY_CONTRACT_ID =
  process.env.TREASURY_CONTRACT_ID ?? StrKey.encodeContract(Buffer.alloc(32, 2));
process.env.ADMIN_SECRET_KEY = process.env.ADMIN_SECRET_KEY ?? Keypair.random().secret();
