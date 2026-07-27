import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";

const globalForDb = globalThis as typeof globalThis & {
  __arenaNextJsPostgresqlPool?: Pool;
};

// Lazily create the pool. We intentionally do NOT throw at module load when
// DATABASE_URL is missing, so that `next build` (which imports every route to
// collect page data) succeeds even on hosts without a database configured.
// Any actual query will fail gracefully and be caught by the caller.
export const pool =
  globalForDb.__arenaNextJsPostgresqlPool ??
  new Pool({
    connectionString: process.env.DATABASE_URL,
  });

if (process.env.NODE_ENV !== "production") {
  globalForDb.__arenaNextJsPostgresqlPool = pool;
}

export const db = drizzle(pool);
