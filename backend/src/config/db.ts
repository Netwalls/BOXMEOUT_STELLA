import { Pool } from 'pg';

const DATABASE_URL = process.env.DATABASE_URL ?? 'postgresql://boxmeout:boxmeout@localhost:5432/boxmeout';

export const pool = new Pool({ connectionString: DATABASE_URL });
