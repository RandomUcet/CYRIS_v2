import postgres from 'postgres';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import { sql } from 'drizzle-orm';
import { loadConfig } from '@cyris/config';
import * as schema from './schema/index.js';

export type CyrisDatabase = PostgresJsDatabase<typeof schema>;

let clientInstance: postgres.Sql | null = null;
let dbInstance: CyrisDatabase | null = null;

export interface DatabaseClientOptions {
  url?: string;
  max?: number;
  idleTimeout?: number;
}

/**
 * Creates or retrieves the singleton PostgreSQL connection pool and Drizzle client.
 */
export function getDbClient(options?: DatabaseClientOptions): CyrisDatabase {
  if (dbInstance) {
    return dbInstance;
  }

  const config = loadConfig();
  const databaseUrl = options?.url ?? config.DATABASE_URL;

  clientInstance = postgres(databaseUrl, {
    max: options?.max ?? 20,
    idle_timeout: options?.idleTimeout ?? 20,
    connect_timeout: 10,
    prepare: false, // Recommended for serverless / pgbouncer / general pooled connections
  });

  dbInstance = drizzle(clientInstance, { schema });
  return dbInstance;
}

/**
 * Executes a simple query to verify connectivity and measure latency.
 */
export async function checkDatabaseConnection(client?: CyrisDatabase): Promise<{ ok: boolean; latencyMs: number }> {
  const db = client ?? getDbClient();
  const start = Date.now();
  await db.execute(sql`SELECT 1 as alive`);
  const latencyMs = Date.now() - start;
  return { ok: true, latencyMs };
}

/**
 * Closes the underlying postgres connection pool during application shutdown.
 */
export async function closeDatabaseConnection(): Promise<void> {
  if (clientInstance) {
    await clientInstance.end();
    clientInstance = null;
    dbInstance = null;
  }
}
