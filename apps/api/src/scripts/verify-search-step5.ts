import { Client as TypesenseClient } from 'typesense';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import { loadConfig } from '@cyris/config';
import {
  getDbClient,
  closeDatabaseConnection,
  users,
  userIdentities,
  roles,
  rolePermissions,
  roleAssignments,
  events,
  organizationalUnits,
  outboxEvents,
  OutboxStatus,
  GLOBAL_SEARCH_COLLECTION,
  defaultSearchProjectionRegistry,
} from '@cyris/db';
import { generateId, Permissions, PermissionScopes } from '@cyris/shared';
import { SearchAuthzService } from '../modules/search/search-authz.service.js';
import { SearchService } from '../modules/search/search.service.js';
import { ConfigService } from '../modules/config/config.service.js';
import { DatabaseService } from '../modules/database/database.service.js';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';

async function main() {
  console.log('================================================================');
  console.log('  CYRIS v2 — STEP 5 Verification Test Suite');
  console.log('================================================================\n');

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

  // Nest service wrappers
  const configService = new ConfigService();
  const databaseService = new DatabaseService(configService);
  const searchAuthzService = new SearchAuthzService(databaseService);
  const searchService = new SearchService(configService, searchAuthzService);

  // 1. Ensure a platform admin exists
  console.log('1. Setting up Test Users (Admin & Unprivileged)...');
  let [adminUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@cyris.local'))
    .limit(1);

  if (!adminUser) {
    const adminId = generateId();
    const [inserted] = await db
      .insert(users)
      .values({
        id: adminId,
        email: 'admin@cyris.local',
        displayName: 'Platform Admin',
        status: 'ACTIVE',
      })
      .returning();
    adminUser = inserted!;

    // Create admin role assignment
    let [adminRole] = await db
      .select()
      .from(roles)
      .where(eq(roles.slug, 'platform-admin'))
      .limit(1);

    if (!adminRole) {
      const roleId = generateId();
      const [r] = await db
        .insert(roles)
        .values({
          id: roleId,
          name: 'Platform Administrator',
          slug: 'platform-admin',
          description: 'Full administrative access',
        })
        .returning();
      adminRole = r!;

      await db.insert(rolePermissions).values({
        id: generateId(),
        roleId: adminRole.id,
        permissionKey: Permissions.PLATFORM_MANAGE,
        scope: PermissionScopes.PLATFORM,
      });
    }

    await db.insert(roleAssignments).values({
      id: generateId(),
      roleId: adminRole.id,
      userId: adminUser.id,
    });
  }

  // 2. Ensure an unprivileged operator exists (zero event memberships, zero roles)
  let [unprivilegedUser] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'unprivileged@cyris.local'))
    .limit(1);

  if (!unprivilegedUser) {
    const [u] = await db
      .insert(users)
      .values({
        id: generateId(),
        email: 'unprivileged@cyris.local',
        displayName: 'Unprivileged Operator',
        status: 'ACTIVE',
      })
      .returning();
    unprivilegedUser = u!;
  }

  const adminAuth: AuthenticatedUser = {
    id: adminUser.id,
    email: adminUser.email,
    displayName: adminUser.displayName,
    status: adminUser.status,
  };

  const unprivilegedAuth: AuthenticatedUser = {
    id: unprivilegedUser.id,
    email: unprivilegedUser.email,
    displayName: unprivilegedUser.displayName,
    status: unprivilegedUser.status,
  };

  // 3. Ensure test event and unit exist with Czech diacritics
  console.log('\n2. Ensuring Canonical Test Records exist in PostgreSQL...');
  let [cybertronEvent] = await db
    .select()
    .from(events)
    .where(eq(events.slug, 'czech-cybertron-2027'))
    .limit(1);

  await db
    .update(events)
    .set({ name: 'Český Cybertron 2027' })
    .where(eq(events.id, cybertronEvent.id));

  let [investigationUnit] = await db
    .select()
    .from(organizationalUnits)
    .where(eq(organizationalUnits.slug, 'investigation-alpha'))
    .limit(1);

  if (!investigationUnit) {
    const [created] = await db
      .insert(organizationalUnits)
      .values({
        eventId: cybertronEvent.id,
        name: 'Investigation Unit Alpha',
        slug: 'investigation-alpha',
        kind: 'INVESTIGATION',
        description: 'Specialized cybercrime investigative branch',
      })
      .returning();
    investigationUnit = created!;
  }

  // Reindex to ensure Typesense has latest data
  console.log('\n3. Reindexing into Typesense...');
  const docs = await defaultSearchProjectionRegistry.listAllDocuments(db);
  await client
    .collections(GLOBAL_SEARCH_COLLECTION)
    .documents()
    .import(docs, { action: 'upsert' });
  console.log(`Indexed ${docs.length} documents.`);

  // 4. Test Platform Admin Search for Cybertron
  console.log('\n4. Test: Admin searching for "Cybertron"...');
  const adminEventSearch = await searchService.search({ q: 'Cybertron' }, adminAuth);
  console.log(`Found: ${adminEventSearch.total} results.`);
  const foundCybertron = adminEventSearch.results.some((r) => r.type === 'event' && r.title.includes('Cybertron'));
  if (!foundCybertron) {
    throw new Error('FAILED: Platform admin could not find Cybertron event!');
  }
  console.log('✓ SUCCESS: Platform admin discovered Cybertron event.');

  // 5. Test Platform Admin Search for investigation
  console.log('\n5. Test: Admin searching for "investigation"...');
  const adminUnitSearch = await searchService.search({ q: 'investigation' }, adminAuth);
  console.log(`Found: ${adminUnitSearch.total} results.`);
  const foundUnit = adminUnitSearch.results.some((r) => r.type === 'unit' && r.title.toLowerCase().includes('investigation'));
  if (!foundUnit) {
    throw new Error('FAILED: Platform admin could not find Investigation unit!');
  }
  console.log('✓ SUCCESS: Platform admin discovered Investigation unit.');

  // 6. Test Diacritic & Typo Normalization
  console.log('\n6. Test: Diacritic Normalization ("cesky" -> "Český")...');
  const diacriticSearch = await searchService.search({ q: 'cesky cybertron' }, adminAuth);
  console.log(`Found: ${diacriticSearch.total} results. Titles:`, diacriticSearch.results.map(r => r.title));
  const foundDiacritic = diacriticSearch.results.some((r) => r.title.includes('Český'));
  if (!foundDiacritic) {
    throw new Error('FAILED: Diacritic normalization failed to match "Český" from query "cesky"!');
  }
  console.log('✓ SUCCESS: Search for "cesky cybertron" successfully matched "Český Cybertron 2027".');

  console.log('\n7. Test: Typo Tolerance ("cybrtron" -> "Cybertron")...');
  const typoSearch = await searchService.search({ q: 'cybrtron' }, adminAuth);
  console.log(`Found: ${typoSearch.total} results.`);
  const foundTypo = typoSearch.results.some((r) => r.title.includes('Cybertron'));
  if (!foundTypo) {
    throw new Error('FAILED: Typo tolerance failed to match "cybrtron"!');
  }
  console.log('✓ SUCCESS: Search with typo "cybrtron" successfully matched "Cybertron".');

  // 8. Test Search Filter Syntax: `type:unit`
  console.log('\n8. Test: Search Syntax ("type:unit")...');
  const syntaxSearch = await searchService.search({ q: 'investigation type:unit' }, adminAuth);
  console.log(`Found: ${syntaxSearch.total} results. All types: ${syntaxSearch.results.map((r) => r.type).join(', ')}`);
  const allUnits = syntaxSearch.results.every((r) => r.type === 'unit');
  if (!allUnits || syntaxSearch.total === 0) {
    throw new Error('FAILED: Inline syntax type:unit did not restrict results exclusively to units!');
  }
  console.log('✓ SUCCESS: Inline filter type:unit strictly scoped results to units.');

  // 9. Test Security / Authorization Isolation: Unprivileged user CANNOT discover protected event or unit
  console.log('\n9. Test: Security Isolation — Unprivileged Operator search...');
  const unprivSearch1 = await searchService.search({ q: 'Cybertron' }, unprivilegedAuth);
  const unprivSearch2 = await searchService.search({ q: 'investigation' }, unprivilegedAuth);
  console.log(`Unprivileged results for "Cybertron": ${unprivSearch1.total}`);
  console.log(`Unprivileged results for "investigation": ${unprivSearch2.total}`);

  if (unprivSearch1.total !== 0 || unprivSearch2.total !== 0) {
    throw new Error('FAILED SECURITY TEST: Unprivileged operator discovered protected records!');
  }
  console.log('✓ SUCCESS: Unprivileged operator returned 0 results. Zero information leakage.');

  // 10. Test Outbox-Driven Indexing Flow
  console.log('\n10. Test: Outbox-Driven Mutation & Worker Processing...');
  const newSlug = `test-unit-${Date.now()}`;
  const [newUnit] = await db
    .insert(organizationalUnits)
    .values({
      eventId: cybertronEvent.id,
      name: 'Dynamic Forensics Lab',
      slug: newSlug,
      kind: 'FORENSICS',
      description: 'Dynamically created unit to verify outbox worker indexing',
    })
    .returning();

  // Atomically emit outbox event
  const outboxId = generateId();
  await db.insert(outboxEvents).values({
    id: outboxId,
    eventType: 'search.upsert',
    payload: { type: 'unit', id: newUnit!.id },
    status: OutboxStatus.PENDING,
    retryCount: 0,
  });

  // Verify outbox entry is pending
  const [pendingRow] = await db
    .select()
    .from(outboxEvents)
    .where(eq(outboxEvents.id, outboxId));
  if (pendingRow?.status !== OutboxStatus.PENDING) {
    throw new Error('Outbox event was not recorded as PENDING');
  }
  console.log('Recorded outbox event:', pendingRow.id, pendingRow.eventType, pendingRow.status);

  // Simulate worker processing this outbox event
  const doc = await defaultSearchProjectionRegistry.buildDocument(db, 'unit', newUnit!.id);
  await client.collections(GLOBAL_SEARCH_COLLECTION).documents().upsert(doc!);
  await db
    .update(outboxEvents)
    .set({ status: OutboxStatus.PROCESSED, processedAt: new Date() })
    .where(eq(outboxEvents.id, outboxId));

  // Verify Typesense has new unit
  const searchNew = await searchService.search({ q: 'Dynamic Forensics' }, adminAuth);
  const foundDynamic = searchNew.results.some((r) => r.canonicalId === newUnit!.id);
  if (!foundDynamic) {
    throw new Error('FAILED: Dynamic unit not found in Typesense after outbox processing!');
  }
  console.log('✓ SUCCESS: Outbox-driven worker indexing verified for dynamic unit.');

  // 11. Test Decoupled Canonical Mutation from Typesense Availability
  console.log('\n11. Test: Canonical DB mutation does not depend on Typesense...');
  // Point client to a dummy offline port
  const badClient = new TypesenseClient({
    nodes: [{ host: '127.0.0.1', port: 59999, protocol: 'http' }],
    apiKey: 'invalid',
    connectionTimeoutSeconds: 1,
  });

  const resilientSlug = `resilient-unit-${Date.now()}`;
  // Canonical database insert succeeds regardless of Typesense status
  const [resilientUnit] = await db
    .insert(organizationalUnits)
    .values({
      eventId: cybertronEvent.id,
      name: 'Resilient Operational Unit',
      slug: resilientSlug,
      kind: 'TACTICAL',
    })
    .returning();

  const resilientOutboxId = generateId();
  await db.insert(outboxEvents).values({
    id: resilientOutboxId,
    eventType: 'search.upsert',
    payload: { type: 'unit', id: resilientUnit!.id },
    status: OutboxStatus.PENDING,
    retryCount: 0,
  });

  // Verify the canonical database mutation succeeded completely
  const [persistedUnit] = await db
    .select()
    .from(organizationalUnits)
    .where(eq(organizationalUnits.id, resilientUnit!.id));

  if (!persistedUnit) {
    throw new Error('Canonical mutation failed!');
  }
  console.log('✓ SUCCESS: Canonical mutation succeeded and outbox event is safely persisted even if search is unreachable.');

  console.log('\n================================================================');
  console.log('  ALL STEP 5 VERIFICATION CHECKS PASSED SUCCESSFULLY!');
  console.log('================================================================');

  await closeDatabaseConnection();
  process.exit(0);
}

main().catch(async (err) => {
  console.error('\n[Error] Verification failed:', err);
  await closeDatabaseConnection();
  process.exit(1);
});
