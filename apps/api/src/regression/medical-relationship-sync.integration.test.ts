import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { and, eq, isNull } from 'drizzle-orm';
import {
  getDbClient, closeDatabaseConnection, users, events, resources, persons,
  medicalEncounters, resourceRelationships, auditEvents,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import { DatabaseService } from '../modules/database/database.service.js';
import { ResourceService } from '../modules/resources/resource.service.js';
import { MedicalService } from '../modules/medical/medical.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { ActivityService } from '../modules/resources/activity.service.js';
import { SearchIndexerService } from '../modules/search/search-indexer.service.js';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';
import { requireVerifiedIsolatedDatabase } from './isolated-postgres-harness.js';

const url = requireVerifiedIsolatedDatabase();
test('medical patient reassignment reconciles Relations atomically and preserves history', {
  skip: !url && 'Requires explicitly isolated local PostgreSQL',
}, async (t) => {
  const db = getDbClient({ url: url!, max: 5 });
  const database = {client: db} as DatabaseService;
  const audit = new AuditService(database);
  const indexer = new SearchIndexerService(database, {} as never);
  const activity = new ActivityService(database, {} as never, {} as never);
  const registry = new ResourceService(database, audit, activity, indexer);
  const service = new MedicalService(
    database, registry,
    {async assertCanAccessResource() {}} as never,
    {} as never, audit, activity, indexer, {} as never,
  );
  const eventA=generateId(),eventB=generateId();
  const personA=generateId(),personB=generateId(),foreignPerson=generateId(),encounterId=generateId();
  const staffId=generateId(),originalLink=generateId(),unrelatedLink=generateId();
  const staff = {
    id:staffId,email:`${staffId}@example.test`,status:'ACTIVE',displayName:'Medical operator',
  } as AuthenticatedUser;

  const activeLinks=()=>db.select()
    .from(resourceRelationships)
    .where(and(
      eq(resourceRelationships.eventId,eventA),
      eq(resourceRelationships.targetResourceId,encounterId),
      eq(resourceRelationships.relationshipType,'PATIENT_RECORD'),
      isNull(resourceRelationships.removedAt),
    ));

  try {
    await db.insert(users).values([staff]);
    await db.insert(events).values([
      {id:eventA,slug:eventA,name:'Medical linking A'},
      {id:eventB,slug:eventB,name:'Medical linking B'},
    ]);
    await db.insert(resources).values([
      {id:personA,eventId:eventA,resourceType:'person'},
      {id:personB,eventId:eventA,resourceType:'person'},
      {id:foreignPerson,eventId:eventB,resourceType:'person'},
      {id:encounterId,eventId:eventA,resourceType:'medical_encounter'},
    ]);
    await db.insert(persons).values([
      {id:personA,displayName:'Patient A'},
      {id:personB,displayName:'Patient B'},
      {id:foreignPerson,displayName:'Foreign patient'},
    ]);
    await db.insert(medicalEncounters).values({
      id:encounterId,eventId:eventA,medicalNumber:'MED-'+encounterId.slice(0,8),
      personId:personA,
    });
    await db.insert(resourceRelationships).values([
      {id:originalLink,eventId:eventA,sourceResourceId:personA,targetResourceId:encounterId,relationshipType:'PATIENT_RECORD'},
      {id:unrelatedLink,eventId:eventA,sourceResourceId:personA,targetResourceId:encounterId,relationshipType:'RELATED_TO'},
    ]);

    await t.test('explicit unchanged patient update does not duplicate the graph link', async () => {
      const detail = await service.updateEncounter(encounterId,{personId:personA,chiefComplaint:'Initial assessment'},staff);
      assert.equal(detail.personId,personA);
      const links=await activeLinks();
      assert.equal(links.length,1);
      assert.equal(links[0]?.id,originalLink);
    });

    await t.test('a relationship creation failure rolls back patient field and old soft-link changes', async () => {
      const original = registry.createRelationship.bind(registry);
      registry.createRelationship = async () => {throw new Error('Simulated relational persistence failure');};
      try {
        await assert.rejects(service.updateEncounter(encounterId,{personId:personB},staff),/Simulated relational persistence failure/);
      } finally {
        registry.createRelationship = original;
      }
      const [record] = await db.select().from(medicalEncounters).where(eq(medicalEncounters.id,encounterId));
      assert.equal(record?.personId,personA);
      const links = await activeLinks();
      assert.equal(links.length,1);
      assert.equal(links[0]?.id,originalLink);
    });

    await t.test('patient reassignment soft-removes only the old patient link and creates a new audited link', async () => {
      const detail=await service.updateEncounter(encounterId,{personId:personB},staff);
      assert.equal(detail.personId,personB);
      const active=await activeLinks();
      assert.deepEqual(active.map(x=>x.sourceResourceId),[personB]);
      const [original]=await db.select().from(resourceRelationships).where(eq(resourceRelationships.id,originalLink));
      assert.ok(original?.removedAt, 'old patient relationship is retained with removedAt');
      const [unrelated]=await db.select().from(resourceRelationships).where(eq(resourceRelationships.id,unrelatedLink));
      assert.equal(unrelated?.removedAt,null);
      const records=await db.select({action:auditEvents.action}).from(auditEvents)
        .where(eq(auditEvents.eventId,eventA));
      assert.ok(records.some(x=>x.action==='relationship.removed'));
      assert.ok(records.some(x=>x.action==='relationship.created'));
      assert.ok(records.some(x=>x.action==='medical.encounter.updated'));
    });

    await t.test('clearing patient removes the active link but keeps all historical data', async () => {
      const detail=await service.updateEncounter(encounterId,{personId:null},staff);
      assert.equal(detail.personId,null);
      assert.equal((await activeLinks()).length,0);
      assert.ok((await db.select().from(resourceRelationships).where(eq(resourceRelationships.id,originalLink)))[0]?.removedAt);
    });

    await t.test('foreign patient rejects without mutating the current link or field', async () => {
      await assert.rejects(service.updateEncounter(encounterId,{personId:foreignPerson},staff),BadRequestException);
      assert.equal((await activeLinks()).length,0);
      assert.equal((await db.select().from(medicalEncounters).where(eq(medicalEncounters.id,encounterId)))[0]?.personId,null);
    });

    await t.test('explicit unchanged patient repairs missing legacy active link exactly once', async () => {
      await db.update(medicalEncounters).set({personId:personA}).where(eq(medicalEncounters.id,encounterId));
      await service.updateEncounter(encounterId,{personId:personA},staff);
      await service.updateEncounter(encounterId,{personId:personA},staff);
      assert.deepEqual((await activeLinks()).map(x=>x.sourceResourceId),[personA]);
    });
  } finally {
    await closeDatabaseConnection();
  }
});
