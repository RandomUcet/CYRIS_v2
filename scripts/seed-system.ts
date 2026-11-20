import { closeDatabaseConnection, getDbClient } from '@cyris/db';
import { bootstrapSystem, readBootstrapOptions } from './system-bootstrap.js';

/** Explicit, additive bootstrap. This command never resets operational data. */
async function main(): Promise<void> {
  const db = getDbClient(); // Loads the existing environment before reading seed options.
  const result = await bootstrapSystem(db, readBootstrapOptions(process.env));
  console.log('[CYRIS] System catalog initialized without changing existing records.');
  if (result.eventId) {
    console.log(`[CYRIS] Exercise ${result.eventId}: added ${result.rolesCreated} roles and ${result.unitsCreated} teams.`);
  } else {
    console.log('[CYRIS] No exercise selected. No exercises, users or operational records were created.');
  }
  console.log('[CYRIS] Administrator accounts are created explicitly with pnpm admin:create.');
}

main().catch((error) => {
  console.error('[CYRIS] Bootstrap failed:', error instanceof Error ? error.message : 'Unknown error');
  process.exitCode = 1;
}).finally(closeDatabaseConnection);
