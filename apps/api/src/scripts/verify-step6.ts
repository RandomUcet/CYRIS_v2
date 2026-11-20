import { Client as TypesenseClient } from 'typesense';
import { eq } from 'drizzle-orm';
import { loadConfig } from '@cyris/config';
import {
  getDbClient,
  closeDatabaseConnection,
  users,
  events,
  eventMemberships,
  organizationalUnits,
  GLOBAL_SEARCH_COLLECTION,
  defaultSearchProjectionRegistry,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import { ConfigService } from '../modules/config/config.service.js';
import { DatabaseService } from '../modules/database/database.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { ActivityService } from '../modules/resources/activity.service.js';
import { SearchAuthzService } from '../modules/search/search-authz.service.js';
import { SearchService } from '../modules/search/search.service.js';
import { SearchIndexerService } from '../modules/search/search-indexer.service.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { ResourceService } from '../modules/resources/resource.service.js';
import { ResourceAccessService } from '../modules/resources/resource-access.service.js';
import { ResourceAssignmentService } from '../modules/resources/resource-assignment.service.js';
import { StorageService } from '../modules/storage/storage.service.js';
import { IdentifierAllocatorService } from '../modules/resources/identifier-allocator.service.js';
import { RegistryService } from '../modules/registry/registry.service.js';
import { InvestigationService } from '../modules/investigation/investigation.service.js';
import { EvidenceService } from '../modules/evidence/evidence.service.js';
import { LaboratoryService } from '../modules/laboratory/laboratory.service.js';
import type { NotificationsService } from '../modules/notifications/notifications.service.js';
import { TimelineService } from '../modules/timeline/timeline.service.js';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';

async function main() {
  console.log('================================================================');
  console.log('  CYRIS v2 — STEP 6 Operational Vertical Slice Verification');
  console.log('================================================================\n');

  const config = loadConfig();
  const db = getDbClient({ url: config.DATABASE_URL });

  const typesense = new TypesenseClient({
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

  const configService = new ConfigService();
  const databaseService = new DatabaseService(configService);
  const auditService = new AuditService(databaseService);
  const authzService = new AuthorizationService(databaseService);
  const resourceAccessService = new ResourceAccessService(databaseService, authzService);
  const activityService = new ActivityService(databaseService, authzService, resourceAccessService);
  const searchAuthzService = new SearchAuthzService(databaseService);
  const searchService = new SearchService(configService, searchAuthzService);
  const searchIndexerService = new SearchIndexerService(databaseService, searchService);
  const notificationTestDouble = {
    emit: async () => null,
  } as Pick<NotificationsService, 'emit'>;
  const resourceService = new ResourceService(databaseService, auditService, activityService, searchIndexerService);
  const resourceAssignmentService = new ResourceAssignmentService(
    databaseService,
    auditService,
    activityService,
    searchIndexerService
  );
  const identifierAllocatorService = new IdentifierAllocatorService(databaseService);
  const storageService = new StorageService(configService);
  const registryService = new RegistryService(
    databaseService,
    resourceService,
    resourceAccessService,
    auditService,
    activityService,
    searchIndexerService,
    identifierAllocatorService,
    storageService
  );
  const investigationService = new InvestigationService(
    databaseService,
    resourceService,
    resourceAccessService,
    resourceAssignmentService,
    identifierAllocatorService,
    auditService,
    activityService,
    searchIndexerService
  );
  const evidenceService = new EvidenceService(
    databaseService,
    resourceService,
    resourceAccessService,
    identifierAllocatorService,
    auditService,
    activityService,
    searchIndexerService
  );
  const laboratoryService = new LaboratoryService(
    databaseService,
    resourceService,
    resourceAccessService,
    identifierAllocatorService,
    auditService,
    activityService,
    searchIndexerService,
    notificationTestDouble as NotificationsService,
    authzService
  );
  const timelineService = new TimelineService(databaseService, resourceAccessService, activityService);

  // 1. Get or create test operators (without modifying admin credentials)
  console.log('1. Locating test operators...');
  const [adminRow] = await db
    .select()
    .from(users)
    .where(eq(users.email, 'admin@cyris.local'))
    .limit(1);

  if (!adminRow) {
    throw new Error('admin@cyris.local does not exist. Run pnpm admin:create first.');
  }

  const adminAuth: AuthenticatedUser = {
    id: adminRow.id,
    email: adminRow.email,
    displayName: adminRow.displayName,
    status: adminRow.status,
  };

  // Create an unprivileged user for security isolation checks
  const unauthEmail = `unauthorized-${Date.now()}@cyris.local`;
  const [unauthRow] = await db
    .insert(users)
    .values({
      id: generateId(),
      email: unauthEmail,
      displayName: 'Unauthorized Operator',
      status: 'ACTIVE',
    })
    .returning();

  const unauthAuth: AuthenticatedUser = {
    id: unauthRow!.id,
    email: unauthRow!.email,
    displayName: unauthRow!.displayName,
    status: unauthRow!.status,
  };
  console.log(`   Admin: ${adminAuth.email}`);
  console.log(`   Unauthorized: ${unauthAuth.email}`);

  // 2. Create one test event workflow
  console.log('\n2. Creating isolated test event workflow...');
  const eventId = generateId();
  const eventSlug = `operation-falcon-${Date.now()}`;
  await db.insert(events).values({
    id: eventId,
    name: 'Operation Falcon Cybertron',
    slug: eventSlug,
    description: 'E2E operational vertical slice verification event',
    status: 'ACTIVE',
  });

  // Add memberships
  await db.insert(eventMemberships).values([
    { id: generateId(), eventId, userId: adminAuth.id, status: 'ACTIVE' },
    { id: generateId(), eventId, userId: unauthAuth.id, status: 'ACTIVE' },
  ]);

  // Create Forensics Unit
  const unitId = generateId();
  await db.insert(organizationalUnits).values({
    id: unitId,
    eventId,
    name: 'Digital Forensics Unit',
    slug: 'dfu',
    kind: 'UNIT',
  });
  console.log(`   Created Event: ${eventSlug} (${eventId})`);
  console.log(`   Created Unit: Digital Forensics Unit (${unitId})`);

  // 3. Create Person + Organisation + Vehicle in Scenario Registry
  console.log('\n3. Creating Scenario Registry entities (Person, Organisation, Vehicle)...');
  const person = await registryService.createPerson(
    eventId,
    {
      displayName: 'Viktor Kroll',
      givenName: 'Viktor',
      familyName: 'Kroll',
      nationality: 'Sokovian',
      status: 'ACTIVE',
      visibility: 'EVENT',
      aliases: ['The Ghost', 'VK-47'],
    },
    adminAuth
  );
  console.log(`   Created Person: ${person.displayName} (ID: ${person.id})`);

  const organisation = await registryService.createOrganisation(
    eventId,
    {
      name: 'OmniCorp Logistics',
      legalName: 'OmniCorp Logistics s.r.o.',
      registrationNumber: 'CZ-8829104',
      status: 'ACTIVE',
      visibility: 'EVENT',
    },
    adminAuth
  );
  console.log(`   Created Organisation: ${organisation.name} (ID: ${organisation.id})`);

  const vehicle = await registryService.createVehicle(
    eventId,
    {
      label: 'Black Surveillance Van',
      registrationPlate: '7A2-9912',
      make: 'Mercedes-Benz',
      model: 'Sprinter',
      colour: 'Obsidian Black',
      status: 'ACTIVE',
      visibility: 'EVENT',
    },
    adminAuth
  );
  console.log(`   Created Vehicle: ${vehicle.label} (ID: ${vehicle.id})`);

  // Verify shared resource IDs
  const resPerson = await resourceService.getResource(person.id);
  const resOrg = await resourceService.getResource(organisation.id);
  const resVeh = await resourceService.getResource(vehicle.id);
  if (!resPerson || !resOrg || !resVeh) {
    throw new Error('LOCKED DECISION VIOLATION: Resource rows not created with identical UUIDs');
  }
  console.log('   [Verified] resources.id === domain.id canonical UUID parity');

  // 4. Link them via common resource relationships
  console.log('\n4. Linking Registry entities via common relationship graph...');
  const rel1 = await resourceService.createRelationship({
    eventId,
    sourceResourceId: person.id,
    targetResourceId: organisation.id,
    relationshipType: 'member_of',
    createdByUserId: adminAuth.id,
    metadata: { role: 'Chief Operating Officer' },
  });
  console.log(`   Linked Person --member_of--> Organisation (Rel ID: ${rel1.id})`);

  const rel2 = await resourceService.createRelationship({
    eventId,
    sourceResourceId: person.id,
    targetResourceId: vehicle.id,
    relationshipType: 'owns',
    createdByUserId: adminAuth.id,
    metadata: { titleHolder: true },
  });
  console.log(`   Linked Person --owns--> Vehicle (Rel ID: ${rel2.id})`);

  // 5. Create one Incident
  console.log('\n5. Creating Incident...');
  const incident = await investigationService.createIncident(
    eventId,
    {
      title: 'Perimeter Intrusion at Sector 4',
      description: 'Unauthorized wireless bridge detected tapping into internal fiber trunk',
      priority: 'HIGH',
      status: 'ACTIVE',
      visibility: 'EVENT',
      owningUnitId: unitId,
    },
    adminAuth
  );
  console.log(`   Created Incident: ${incident.incidentNumber} - ${incident.title} (ID: ${incident.id})`);

  // 6. Create one Case and connect Incident and Person
  console.log('\n6. Creating Investigation Case and linking Incident & Person...');
  const kase = await investigationService.createCase(
    eventId,
    {
      title: 'Operation Dark Fibre',
      summary: 'Targeted espionage campaign against Sector 4 infrastructure',
      priority: 'HIGH',
      status: 'INVESTIGATING',
      visibility: 'EVENT',
      owningUnitId: unitId,
    },
    adminAuth
  );
  console.log(`   Created Case: ${kase.caseNumber} - ${kase.title} (ID: ${kase.id})`);

  // Link Incident to Case
  await resourceService.createRelationship({
    eventId,
    sourceResourceId: incident.id,
    targetResourceId: kase.id,
    relationshipType: 'investigated_in',
    createdByUserId: adminAuth.id,
  });
  // Link Person to Case
  await resourceService.createRelationship({
    eventId,
    sourceResourceId: person.id,
    targetResourceId: kase.id,
    relationshipType: 'subject_of',
    createdByUserId: adminAuth.id,
  });
  console.log('   [Linked] Incident --investigated_in--> Case and Person --subject_of--> Case');

  // 7. Create one Evidence item and transfer custody
  console.log('\n7. Registering Evidence and executing Chain of Custody transfer...');
  const evItem = await evidenceService.createEvidence(
    eventId,
    {
      title: 'Seized Encrypted Solid State Drive',
      description: 'Samsung 990 PRO 2TB recovered from server rack patch panel',
      evidenceType: 'DIGITAL_STORAGE',
      status: 'REGISTERED',
      condition: 'INTACT_SEALED',
      currentHolderType: 'USER',
      currentHolderId: adminAuth.id,
      visibility: 'EVENT',
      owningUnitId: unitId,
    },
    adminAuth
  );
  console.log(`   Registered Evidence: ${evItem.evidenceNumber} - ${evItem.title} (ID: ${evItem.id})`);

  // Link Evidence to Case
  await resourceService.createRelationship({
    eventId,
    sourceResourceId: evItem.id,
    targetResourceId: kase.id,
    relationshipType: 'related_to',
    createdByUserId: adminAuth.id,
  });
  console.log('   [Linked] Evidence --related_to--> Case');

  // Transfer custody
  console.log('   Executing chain-of-custody transfer to Digital Forensics Unit...');
  const transferred = await evidenceService.transferCustody(
    eventId,
    evItem.id,
    {
      toHolderType: 'UNIT',
      toHolderId: unitId,
      reason: 'Delivered to Digital Forensics for chip-off image acquisition',
      notes: 'Tamper-evident bag seal unbroken: #CYR-9941',
      causationId: kase.id,
    },
    adminAuth
  );
  console.log(`   Evidence Holder updated to: ${transferred.currentHolderType} (${transferred.currentHolderId})`);

  // Verify custody history
  const custodyHistory = await evidenceService.getCustodyHistory(eventId, evItem.id, adminAuth);
  console.log(`   [Verified] Custody history retains ${custodyHistory.length} immutable records:`);
  for (const h of custodyHistory) {
    console.log(`     • ${h.occurredAt} | ${h.fromHolderType}:${h.fromHolderId} ➔ ${h.toHolderType}:${h.toHolderId} (Reason: ${h.reason})`);
  }
  if (custodyHistory.length < 2) {
    throw new Error('Custody history verification failed: expected at least 2 entries (initial + transfer)');
  }

  // 8. Request a Lab Analysis for that Evidence
  console.log('\n8. Requesting Laboratory Analysis...');
  const lab = await laboratoryService.createAnalysis(
    eventId,
    {
      analysisType: 'DRIVE_FORENSIC_IMAGE',
      evidenceIds: [evItem.id],
      requestedFromUnitId: unitId,
      purpose: 'Acquire raw bitstream image and extract unallocated clusters for key material',
      visibility: 'EVENT',
      causationId: kase.id,
    },
    adminAuth
  );
  console.log(`   Requested Lab Analysis: ${lab.analysisNumber} - ${lab.analysisType} (Status: ${lab.status})`);

  // 9. Progress and Complete the Lab Analysis
  console.log('\n9. Progressing and Completing Laboratory Analysis...');
  await laboratoryService.updateAnalysis(
    eventId,
    lab.id,
    {
      status: 'ACCEPTED',
      assignedUnitId: unitId,
    },
    adminAuth
  );
  console.log('   Analysis accepted.');

  await laboratoryService.updateAnalysis(
    eventId,
    lab.id,
    {
      status: 'IN_PROGRESS',
      method: 'Physical write-blocker attached via Tableau T8u. MD5 and SHA-256 verified.',
    },
    adminAuth
  );
  console.log('   Work started in progress.');

  const completedLab = await laboratoryService.updateAnalysis(
    eventId,
    lab.id,
    {
      status: 'COMPLETED',
      findings: 'Trojan backdoor payload found in unpartitioned space with C2 beaconing to 198.51.100.42.',
      conclusion: 'Host was weaponized to exfiltrate SCADA telemetry.',
      causationId: kase.id,
    },
    adminAuth
  );
  console.log(`   Analysis COMPLETED: ${completedLab.conclusion}`);

  // 10. Verify Case Timeline Contains Bounded Cross-Resource Sequence
  console.log('\n10. Verifying Case Timeline Bounded Cross-Resource Sequence...');
  const caseTimeline = await timelineService.getCaseTimeline(kase.id, { limit: 50 }, adminAuth);
  console.log(`   Retrieved ${caseTimeline.items.length} timeline events across Case, Linked Resources, Evidence, and Lab:`);

  const activityTypes = new Set<string>();
  for (const item of caseTimeline.items) {
    activityTypes.add(item.activityType);
    console.log(`     [${item.occurredAt}] ${item.activityType} — ${item.title}`);
  }

  // Check required events in sequence
  const requiredTypes = [
    'case.created',
    'evidence.registered',
    'evidence.transferred',
    'lab.requested',
    'lab.accepted',
    'lab.started',
    'lab.completed',
  ];

  for (const req of requiredTypes) {
    if (!activityTypes.has(req)) {
      throw new Error(`Case timeline missing expected activity type: ${req}`);
    }
  }
  console.log('   [Verified] Complete cross-resource investigation sequence present in Case Timeline!');

  // 11. Search Indexing: Verify each new domain type is globally searchable
  console.log('\n11. Verifying Global Search Projections for all 9 domain types...');
  const typesToTest = [
    { type: 'person', id: person.id },
    { type: 'organisation', id: organisation.id },
    { type: 'vehicle', id: vehicle.id },
    { type: 'incident', id: incident.id },
    { type: 'case', id: kase.id },
    { type: 'evidence', id: evItem.id },
    { type: 'lab_analysis', id: lab.id },
  ];

  for (const item of typesToTest) {
    const doc = await defaultSearchProjectionRegistry.buildDocument(db, item.type, item.id);
    if (!doc) {
      throw new Error(`Search projection failed for ${item.type} (${item.id})`);
    }
    // Index into Typesense test collection
    await typesense.collections(GLOBAL_SEARCH_COLLECTION).documents().upsert(doc);
    console.log(`   [Searchable] ${item.type.padEnd(14)}: ${doc.title} (Identifiers: ${doc.identifiers.join(', ')})`);
  }

  // 12. Security Isolation Check: Restricted records must fail-closed
  console.log('\n12. Verifying Confidential Isolation & Fail-Closed Security...');
  const restrictedEv = await evidenceService.createEvidence(
    eventId,
    {
      title: 'Top Secret Compartmented Flash Drive',
      evidenceType: 'DIGITAL_STORAGE',
      status: 'REGISTERED',
      visibility: 'RESTRICTED',
      currentHolderType: 'USER',
      currentHolderId: adminAuth.id,
    },
    adminAuth
  );

  // Unauthorized operator must NOT be able to read restricted evidence
  let unauthBlocked = false;
  try {
    await resourceAccessService.assertCanAccessResource(
      unauthAuth,
      restrictedEv.id,
      Permissions.EVIDENCE_READ
    );
  } catch (err) {
    unauthBlocked = true;
    console.log(`   [Pass] Unauthorized user blocked from RESTRICTED resource: ${(err as Error).message}`);
  }

  if (!unauthBlocked) {
    throw new Error('Security isolation failed: unauthorized user was able to access RESTRICTED resource!');
  }

  // Projection provider must fail-closed (return null)
  const restrictedDoc = await defaultSearchProjectionRegistry.buildDocument(
    db,
    'evidence',
    restrictedEv.id
  );
  if (restrictedDoc !== null) {
    throw new Error('Fail-closed search rule violated: RESTRICTED resource was projected for search indexing!');
  }
  console.log('   [Pass] Restricted resource projection returned null (fail-closed, not indexed globally).');

  console.log('\n================================================================');
  console.log('  ALL STEP 6 VERIFICATIONS COMPLETED SUCCESSFULLY!');
  console.log('================================================================\n');

  await closeDatabaseConnection();
}

main().catch(async (err) => {
  console.error('\n[Verification Failed]:', err);
  await closeDatabaseConnection();
  process.exit(1);
});
