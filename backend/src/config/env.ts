import { z } from 'zod';
import { logger } from '../utils/logger';

const envSchema = z.object({
  DATABASE_URL: z.string().url('DATABASE_URL must be a valid URL'),
  REDIS_URL: z.string().url('REDIS_URL must be a valid URL'),
  STELLAR_RPC_URL: z.string().url('STELLAR_RPC_URL must be a valid URL'),
  ORACLE_KEYPAIR: z.string().min(1, 'ORACLE_KEYPAIR is required'),
  ADMIN_JWT_SECRET: z.string().min(1, 'ADMIN_JWT_SECRET is required'),
  FACTORY_CONTRACT_ADDRESS: z.string().min(1, 'FACTORY_CONTRACT_ADDRESS is required'),
  PORT: z.coerce.number().int().positive().default(3000),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  JWT_SECRET: z.string().min(1).default('change-me-in-production'),
  STELLAR_NETWORK: z.string().default('testnet'),
  HORIZON_URL: z.string().url().optional(),
  ORACLE_PUBLIC_KEY: z.string().optional(),
  ADMIN_PUBLIC_KEY: z.string().optional(),
  ORACLE_API_KEY: z.string().optional(),
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),
  GENESIS_LEDGER: z.coerce.number().int().positive().default(100000),
  POLL_INTERVAL_MS: z.coerce.number().int().positive().default(5000),
  BOXING_API_URL: z.string().url().optional(),
});

export type Env = z.infer<typeof envSchema>;

let validatedEnv: Env | null = null;

export function validateEnv(): Env {
  if (validatedEnv) return validatedEnv;

  const result = envSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues.map(issue => {
      const path = issue.path.join('.');
      return `${path}: ${issue.message}`;
    });
    logger.error('Environment validation failed:');
    errors.forEach(err => logger.error(`  - ${err}`));
    process.exit(1);
  }

  validatedEnv = result.data;
  logger.info('Environment variables validated successfully');
  return validatedEnv;
}

export function getEnv(): Env {
  if (!validatedEnv) {
    throw new Error('Environment not validated. Call validateEnv() first.');
  }
  return validatedEnv;
}
