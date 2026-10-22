import { Client as TypesenseClient } from 'typesense';
import { loadConfig } from '@cyris/config';
import { GLOBAL_SEARCH_COLLECTION, cyrisGlobalCollectionSchema } from '@cyris/db';

async function main(): Promise<void> {
  console.log('================================================================');
  console.log('  CYRIS v2 — Global Search Setup');
  console.log('================================================================\n');

  const config = loadConfig();

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

  console.log(`Connecting to Typesense at ${config.TYPESENSE_HOST}:${config.TYPESENSE_PORT}...`);
  const health = await client.health.retrieve();
  if (!health.ok) {
    console.error('Error: Typesense cluster reported unhealthy status.');
    process.exit(1);
  }
  console.log('Typesense connection healthy.\n');

  try {
    const existing = await client.collections(GLOBAL_SEARCH_COLLECTION).retrieve();
    console.log(`[OK] Typesense collection '${GLOBAL_SEARCH_COLLECTION}' already exists.`);
    console.log(`     Fields: ${existing.fields?.length || 0}, Documents: ${existing.num_documents || 0}`);
  } catch {
    console.log(`Creating global search collection '${GLOBAL_SEARCH_COLLECTION}'...`);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const created = await client.collections().create(cyrisGlobalCollectionSchema as any);
    console.log(`[OK] Collection '${created.name}' created successfully with ${created.fields?.length || 0} fields.`);
  }

  console.log('\n[Success] Global search schema is validated and active.');
  process.exit(0);
}

main().catch((err) => {
  console.error('\n[Error] Search setup failed:', err.message || err);
  process.exit(1);
});
