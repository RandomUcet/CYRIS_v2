import { getDbClient, closeDatabaseConnection, sql } from '@cyris/db';
import { loadConfig } from '@cyris/config';
import { resolve, dirname } from 'node:path';
import { existsSync, readFileSync } from 'node:fs';
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

interface MigrationEntry {
  idx: number;
  version: string;
  when: number;
  tag: string;
}

interface Journal {
  version: string;
  dialect: string;
  entries: MigrationEntry[];
}

async function main(): Promise<void> {
  const isJson = process.argv.includes('--json');
  const config = loadConfig();
  const db = getDbClient({ max: 1 });

  try {
    const migrationsFolder = findMigrationsFolder();
    const journalPath = resolve(migrationsFolder, 'meta/_journal.json');
    const journalContent = readFileSync(journalPath, 'utf-8');
    const journal = JSON.parse(journalContent) as Journal;
    const totalAvailable = journal.entries.length;

    // Check if __drizzle_migrations table exists
    const tableCheck = await db.execute<{ exists: boolean }>(sql`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables 
        WHERE table_schema = 'drizzle' AND table_name = '__drizzle_migrations'
      ) as exists
    `);

    let appliedCount = 0;
    const hasTable = (tableCheck[0] as any)?.exists === true;

    if (hasTable) {
      const rows = await db.execute<{ id: number; hash: string; created_at: string }>(sql`
        SELECT id, hash, created_at FROM drizzle.__drizzle_migrations ORDER BY id ASC
      `);
      appliedCount = rows.length;
    }

    const pending = totalAvailable - appliedCount;
    const isUpToDate = pending === 0 && totalAvailable > 0;

    const result = {
      status: isUpToDate ? 'UP_TO_DATE' : (appliedCount === 0 ? 'UNINITIALIZED' : 'PENDING'),
      totalAvailable,
      appliedCount,
      pendingCount: pending,
      migrationsFolder,
      entries: journal.entries.map((e) => ({
        idx: e.idx,
        tag: e.tag,
        applied: e.idx < appliedCount,
      })),
    };

    await closeDatabaseConnection();

    if (isJson) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log('================================================================');
      console.log('  CYRIS Database Migration Status');
      console.log('================================================================');
      console.log(`  Database:          ${config.POSTGRES_DB}`);
      console.log(`  Total Migrations:  ${totalAvailable}`);
      console.log(`  Applied:           ${appliedCount}`);
      console.log(`  Pending:           ${pending}`);
      console.log(`  Status:            ${result.status}`);
      console.log('----------------------------------------------------------------');
      for (const e of result.entries) {
        const marker = e.applied ? '✓' : '✗';
        console.log(`  [${marker}] ${e.tag}`);
      }
      console.log('================================================================');
    }

    if (!isUpToDate) {
      process.exit(1);
    }
    process.exit(0);
  } catch (err) {
    await closeDatabaseConnection().catch(() => {});
    if (isJson) {
      console.log(JSON.stringify({ status: 'ERROR', error: (err as Error).message }));
    } else {
      console.error('[CYRIS Migration Status] Error checking migration status:', (err as Error).message);
    }
    process.exit(2);
  }
}

main();
