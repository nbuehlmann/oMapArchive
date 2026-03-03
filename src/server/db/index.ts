import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'
import { env } from '@/env'
import * as schema from './schema'

// Reuse the pool across hot reloads in development
const globalForDb = globalThis as unknown as { dbPool: Pool | undefined }

const pool =
  globalForDb.dbPool ??
  new Pool({
    connectionString: env.DATABASE_URL,
    // Require TLS for all connections in production (see SECURITY.md §8)
    ssl: env.NODE_ENV === 'production' ? { rejectUnauthorized: true } : false,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
  })

if (env.NODE_ENV !== 'production') globalForDb.dbPool = pool

export const db = drizzle(pool, { schema })

export type Database = typeof db
