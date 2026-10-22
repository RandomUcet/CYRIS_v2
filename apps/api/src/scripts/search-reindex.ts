import { Client as TypesenseClient } from 'typesense';
import { loadConfig } from '@cyris/config';
import {
  getDbClient,
  closeDatabaseConnection,
  GLOBAL_SEARCH_COLLECTION,
  cyrisGlobalCollectionSchema,
  defaultSearchProjectionRegistry,
} from '@cyris/db';

async function main(): Promise<void> {
  console.log('================================================================');
  console.log('  CYRIS v2 — Global Search Reindex');
  console.log('================================================================\n');

  // Parse command line arguments for optional --event <eventId>
  const args = process.argv.slice(2);
  let eventFilter: string | undefined;
  const eventIdx = args.indexOf('--event');
  if (eventIdx !== -1 && args[eventIdx + 1]) {
    eventFilter = args[eventIdx + 1];
    console.log(`Scoped reindex filter: eventId = '${eventFilter}'\n`);
  }

  const config = loadConfig();
  const db = getDbClient({ url: config.DATABASE_URL });

  const client = new TypesenseClient({
    nodes: [
      {
        host: config.TYPESENSE_HOST,
        port: config.TYPESENSE_PORT,
        protocol: 'http',
      },
    ],
    apiKey: config.TYPESENSE_API_KEY,
    connectionTimeoutSeconds: 5,
  });

  // 1. Ensure collection exists
  try {
    await client.collections(GLOBAL_SEARCH_COLLECTION).retrieve();
  } catch {
    console.log(`Collection '${GLOBAL_SEARCH_COLLECTION}' does not exist. Creating...`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await client.collections().create(cyrisGlobalCollectionSchema as any);
    console.log(`Created '${GLOBAL_SEARCH_COLLECTION}'.\n`);
  }

  // 2. Collect projections from registered providers
  console.log('Collecting projections from registered search providers...');
  const docs = await defaultSearchProjectionRegistry.listAllDocuments(db, eventFilter);
  console.log(`Total projections collected: ${docs.length}\n`);

  if (docs.length === 0) {
    console.log('[Notice] No documents to index.');
    await closeDatabaseConnection();
    process.exit(0);
  }

  // 3. Batch import into Typesense
  console.log(`Importing ${docs.length} documents into Typesense '${GLOBAL_SEARCH_COLLECTION}'...`);
  const response = await client
    .collections(GLOBAL_SEARCH_COLLECTION)
    .documents()
    .import(docs, { action: 'upsert' });

  // Count results per resource type
  let successCount = 0;
  let failCount = 0;
  const typeCounts: Record<string, number> = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (response as any[]).forEach((res, index) => {
    const doc = docs[index];
    const type = doc?.resourceType || 'unknown';
    if (res.success) {
      successCount++;
      typeCounts[type] = (typeCounts[type] || 0) + 1;
    } else {
      failCount++;
      console.warn(`[Failed] Document ${doc?.id}: ${res.error}`);
    }
  });

  console.log('\n--- Reindex Summary ---');
  console.log(`Successfully indexed: ${successCount}`);
  if (failCount > 0) {
    console.log(`Failed:               ${failCount}`);
  }
  for (const [type, count] of Object.entries(typeCounts)) {
    console.log(`  - ${type}: ${count}`);
  }

  await closeDatabaseConnection();
  console.log('\n[Success] Global search reindex completed successfully.');
  process.exit(failCount > 0 ? 1 : 0);
}

main().catch(async (err) => {
  console.error('\n[Error] Search reindex failed:', err.message || err);
  await closeDatabaseConnection();
  process.exit(1);
});
