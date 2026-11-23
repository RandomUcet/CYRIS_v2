import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { BadRequestException } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import {
  getDbClient, closeDatabaseConnection, users, events, eventMemberships,
  organizationalUnits, resources, persons, locations, incidents, medicalEncounters,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';
import { DatabaseService } from '../modules/database/database.service.js';
import { ResourceService } from '../modules/resources/resource.service.js';
import { MedicalService } from '../modules/medical/medical.service.js';
import { requireVerifiedIsolatedDatabase } from './isolated-postgres-harness.js';

const url = requireVerifiedIsolatedDatabase();
test('medical linked references cannot cross exercise boundaries (isolated PostgreSQL)', {
  skip: !url && 'Requires explicitly verified isolated local PostgreSQL',
}, async (t) => {
  const db = getDbClient({ url: url!, max: 5 });
  const database = { client: db } as DatabaseService;
  const registry = new ResourceService(database, {} as never, {} as never, {} as never);
  const service = new MedicalService(
    database, registry,
    { async assertCanAccessResource() {} } as never,
    { allocate() { throw new Error('Identifier must not be allocated for an invalid reference'); } } as never,
    {} as never, {} as never, {} as never,
    { async authorize() { return true; } } as never,
  );
  const eventA=generateId(), eventB=generateId();
  const personA=generateId(), personB=generateId(), locA=generateId(), locB=generateId();
  const incidentA=generateId(), incidentB=generateId();
  const teamA=generateId(), teamB=generateId(), retiredTeam=generateId();
  const activeId=generateId(), foreignId=generateId(), inactiveId=generateId();
  const encounterId=generateId();
  const authUser = { id: activeId, email: `${activeId}@example.test`, status: 'ACTIVE', displayName: 'Medical fixture operator' } as AuthenticatedUser;
  try {
    await db.insert(users).values([
      authUser,
      { id: foreignId, email: `${foreignId}@example.test`, status: 'ACTIVE', displayName: 'Foreign member' },
      { id: inactiveId, email: `${inactiveId}@example.test`, status: 'ACTIVE', displayName: 'Inactive member' },
    ]);
    await db.insert(events).values([
      {id:eventA,name:'Medical integrity A',slug:eventA},
      {id:eventB,name:'Medical integrity B',slug:eventB},
    ]);
    await db.insert(eventMemberships).values([
      {eventId:eventA,userId:activeId,status:'ACTIVE'},
      {eventId:eventB,userId:foreignId,status:'ACTIVE'},
      {eventId:eventA,userId:inactiveId,status:'INACTIVE'},
    ]);
    await db.insert(organizationalUnits).values([
      {id:teamA,eventId:eventA,name:'Medical A',slug:'med-a'},
      {id:teamB,eventId:eventB,name:'Medical B',slug:'med-b'},
      {id:retiredTeam,eventId:eventA,name:'Archived medical',slug:'med-archived',archivedAt:new Date()},
    ]);
    await db.insert(resources).values([
      {id:personA,eventId:eventA,resourceType:'person'},
      {id:personB,eventId:eventB,resourceType:'person'},
      {id:locA,eventId:eventA,resourceType:'location'},
      {id:locB,eventId:eventB,resourceType:'location'},
      {id:incidentA,eventId:eventA,resourceType:'incident'},
      {id:incidentB,eventId:eventB,resourceType:'incident'},
      {id:encounterId,eventId:eventA,resourceType:'medical_encounter'},
    ]);
    await db.insert(persons).values([
      {id:personA,displayName:'Patient A'},
      {id:personB,displayName:'Patient B'},
    ]);
    await db.insert(locations).values([
      {id:locA,name:'Treatment A'},
      {id:locB,name:'Treatment B'},
    ]);
    await db.insert(incidents).values([
      {id:incidentA,incidentNumber:'MED-A-'+incidentA.slice(0,8),title:'Incident A'},
      {id:incidentB,incidentNumber:'MED-B-'+incidentB.slice(0,8),title:'Incident B'},
    ]);
    await db.insert(medicalEncounters).values({
      id:encounterId, eventId:eventA, medicalNumber:'MED-'+encounterId.slice(0,8), status:'RECEIVED',
    });

    await t.test('valid references to the same exercise and active members are allowed', async () => {
      await service.assertReferencesInEvent(eventA, {
        personId:personA,incidentId:incidentA,locationId:locA,
        assignedUnitId:teamA,assignedUserId:activeId,
        targetLocationId:locA,receivingUnitId:teamA,
      });
      await service.assertReferencesInEvent(eventA, {
        personId:null,locationId:null,assignedUserId:null,assignedUnitId:null,
      });
    });

    await t.test('foreign, wrong-type, archived and inactive references are rejected by field', async () => {
      const invalid = [
        [{personId:personB}, 'personId'],
        [{personId:locA}, 'personId'],
        [{incidentId:incidentB}, 'incidentId'],
        [{locationId:locB}, 'locationId'],
        [{targetLocationId:locB}, 'targetLocationId'],
        [{assignedUnitId:teamB}, 'assignedUnitId'],
        [{assignedUnitId:retiredTeam}, 'assignedUnitId'],
        [{receivingUnitId:teamB}, 'receivingUnitId'],
        [{assignedUserId:foreignId}, 'assignedUserId'],
        [{assignedUserId:inactiveId}, 'assignedUserId'],
      ] as const;
      for (const [values,field] of invalid) {
        await assert.rejects(
          service.assertReferencesInEvent(eventA,values),
          (error: unknown) => error instanceof BadRequestException && error.message.includes(field),
          `Expected invalid ${field} to be rejected`,
        );
      }
    });

    await t.test('invalid patient on creation is rejected before allocating a medical number', async () => {
      await assert.rejects(
        service.createEncounter(eventA,{
          personId:personB,triageCategory:'UNKNOWN',visibility:'UNIT',
        },authUser),
        BadRequestException,
      );
    });

    await t.test('invalid links on update and handoff do not modify an existing encounter', async () => {
      await assert.rejects(service.updateEncounter(encounterId,{personId:personB},authUser),BadRequestException);
      await assert.rejects(service.transferEncounter(encounterId,{
        targetLocationId:locB,disposition:'Foreign handoff',
      },authUser),BadRequestException);
      await assert.rejects(service.transferEncounter(encounterId,{
        targetLocationId:locA,receivingUnitId:teamB,disposition:'Foreign team',
      },authUser),BadRequestException);
      const [row] = await db.select().from(medicalEncounters).where(eq(medicalEncounters.id,encounterId));
      assert.equal(row?.status,'RECEIVED');
      assert.equal(row?.personId,null);
      assert.equal(row?.transferredAt,null);
    });
  } finally {
    await closeDatabaseConnection();
  }
});
