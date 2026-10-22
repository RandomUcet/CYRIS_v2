import { migrate } from 'drizzle-orm/postgres-js/migrator';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { loadConfig } from '@cyris/config';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function runMigrate(): Promise<void> {
  const config = loadConfig();
  const sql = postgres(config.DATABASE_URL, { max: 1 });
  const db = drizzle(sql);

  console.log('[CYRIS Migration] Applying database migrations from migrations folder...');
  const migrationsFolder = resolve(__dirname, '../migrations');
  await migrate(db, { migrationsFolder });
  console.log('[CYRIS Migration] Migrations applied successfully.');

  await sql.end();
}

runMigrate().catch((err) => {
  console.error('[CYRIS Migration] Migration execution failed:', err);
  process.exit(1);
});
