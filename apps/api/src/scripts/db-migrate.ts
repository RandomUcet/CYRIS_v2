import { migrate } from 'drizzle-orm/postgres-js/migrator';
import { getDbClient, closeDatabaseConnection } from '@cyris/db';
import { resolve, dirname } from 'node:path';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));

function findMigrationsFolder(): string {
  const candidates = [
    process.env.CYRIS_MIGRATIONS_DIR,
    resolve(__dirname, '../../../../packages/db/migrations'),
    resolve(__dirname, '../../../packages/db/migrations'),
    resolve(__dirname, '../packages/db/migrations'),
    resolve(__dirname, './migrations'),
    resolve(process.cwd(), 'packages/db/migrations'),
    resolve(process.cwd(), 'migrations'),
  ];
  for (const candidate of candidates) {
    if (candidate && existsSync(candidate) && existsSync(resolve(candidate, 'meta/_journal.json'))) {
      return candidate;
    }
  }
  throw new Error('CYRIS migrations folder with meta/_journal.json could not be located.');
}

async function runMigrate(): Promise<void> {
  const db = getDbClient({ max: 1 });
  const migrationsFolder = findMigrationsFolder();
  console.log(`[CYRIS Migration] Applying database migrations from: ${migrationsFolder}`);
  await migrate(db, { migrationsFolder });
  console.log('[CYRIS Migration] All migrations applied successfully.');
  await closeDatabaseConnection();
}

runMigrate().catch(async (err) => {
  console.error('[CYRIS Migration] Migration execution failed:', err);
  await closeDatabaseConnection().catch(() => {});
  process.exit(1);
});
