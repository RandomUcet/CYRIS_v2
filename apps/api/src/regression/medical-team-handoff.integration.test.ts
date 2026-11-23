import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { eq, and } from 'drizzle-orm';
import { ForbiddenException } from '@nestjs/common';
import {
  getDbClient, closeDatabaseConnection, users, events, eventMemberships,
  membershipUnitAssignments, organizationalUnits, unitCapabilities,
  roles, rolePermissions, roleAssignments, resources, medicalEncounters, locations,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import { UnitCapabilityKeys } from '@cyris/contracts';
import { DatabaseService } from '../modules/database/database.service.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { ResourceAccessService } from '../modules/resources/resource-access.service.js';
import { ResourceService } from '../modules/resources/resource.service.js';
import { MedicalService } from '../modules/medical/medical.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { ActivityService } from '../modules/resources/activity.service.js';
import { SearchIndexerService } from '../modules/search/search-indexer.service.js';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';
import { requireVerifiedIsolatedDatabase } from './isolated-postgres-harness.js';

const url = requireVerifiedIsolatedDatabase();
test('medical team routing and patient handoff keep ACL ownership in sync', {
  skip: !url && 'Requires explicitly isolated local PostgreSQL',
}, async (t) => {
  const db = getDbClient({url:url!,max:6});
  const database = {client:db} as DatabaseService;
  const authz = new AuthorizationService(database);
  const access = new ResourceAccessService(database,authz);
  const audit = new AuditService(database);
  const indexer = new SearchIndexerService(database,{} as never);
  const activity = new ActivityService(database,authz,access);
  const registry = new ResourceService(database,audit,activity,indexer);
  const medical = new MedicalService(database,registry,access,
    {allocate:async ()=>'MED-'+generateId()} as never,
    audit,activity,indexer,authz);
  const eventA=generateId(),eventB=generateId();
  const medA=generateId(),medB=generateId(),medExtra=generateId(),otherEventUnit=generateId();
  const locationId=generateId(),actorId=generateId(),recipientId=generateId();
  const actor={id:actorId,status:'ACTIVE',email:`${actorId}@example.test`,displayName:'Medical A'} as AuthenticatedUser;
  const recipient={id:recipientId,status:'ACTIVE',email:`${recipientId}@example.test`,displayName:'Medical B'} as AuthenticatedUser;
  const membershipA=generateId(),membershipB=generateId(),roleA=generateId(),roleB=generateId();

  const lookup = async (id:string) => {
    const [record] = await db.select({assignedUnitId:medicalEncounters.assignedUnitId,assignedUserId:medicalEncounters.assignedUserId,
      status:medicalEncounters.status,locationId:medicalEncounters.locationId}).from(medicalEncounters)
      .where(eq(medicalEncounters.id,id));
    const [resource] = await db.select({owningUnitId:resources.owningUnitId,ownerUserId:resources.ownerUserId})
      .from(resources).where(eq(resources.id,id));
    return {record,resource};
  };

  try {
    await db.insert(users).values([actor,recipient]);
    await db.insert(events).values([{id:eventA,slug:eventA,name:'Medical team A and B'},{
      id:eventB,slug:eventB,name:'Unrelated medical event'}]);
    await db.insert(organizationalUnits).values([
      {id:medA,eventId:eventA,name:'Medical team A',slug:'medical-a'},
      {id:medB,eventId:eventA,name:'Medical team B',slug:'medical-b'},
      {id:medExtra,eventId:eventA,name:'Medical third team',slug:'medical-extra'},
      {id:otherEventUnit,eventId:eventB,name:'Foreign medical',slug:'medical-foreign'},
    ]);
    await db.insert(unitCapabilities).values([medA,medB,medExtra,otherEventUnit].map(unitId=>({
      unitId,capabilityKey:UnitCapabilityKeys.MEDICAL_OPERATIONS,
    })));
    await db.insert(eventMemberships).values([
      {id:membershipA,eventId:eventA,userId:actorId,status:'ACTIVE'},
      {id:membershipB,eventId:eventA,userId:recipientId,status:'ACTIVE'},
    ]);
    await db.insert(membershipUnitAssignments).values([
      {membershipId:membershipA,unitId:medA},
      {membershipId:membershipB,unitId:medB},
    ]);
    await db.insert(roles).values([
      {id:roleA,eventId:eventA,name:'Medical A operator',slug:'med-role-a'},
      {id:roleB,eventId:eventA,name:'Medical B reader',slug:'med-role-b'},
    ]);
    await db.insert(rolePermissions).values([
      ...[Permissions.MEDICAL_READ,Permissions.MEDICAL_CREATE,Permissions.MEDICAL_UPDATE,Permissions.MEDICAL_TRANSFER]
        .map(permissionKey=>({roleId:roleA,permissionKey,scope:'UNIT' as const})),
      {roleId:roleB,permissionKey:Permissions.MEDICAL_READ,scope:'UNIT' as const},
    ]);
    await db.insert(roleAssignments).values([
      {roleId:roleA,membershipId:membershipA,unitId:medA},
      {roleId:roleB,membershipId:membershipB,unitId:medB},
    ]);
    await db.insert(resources).values({id:locationId,eventId:eventA,resourceType:'location'});
    await db.insert(locations).values({id:locationId,name:'Field clinic'});

    await t.test('a single active medical membership is auto-selected without user team input', async () => {
      assert.equal(await medical.resolveIntakeUnit(eventA,actorId),medA);
      assert.equal(await medical.resolveIntakeUnit(eventB,actorId),null);
      const record=await medical.createEncounter(eventA,{triageCategory:'MINOR',visibility:'UNIT',chiefComplaint:'Fictional casualty'},actor);
      const state=await lookup(record.id);
      assert.equal(state.record?.assignedUnitId,medA);
      assert.equal(state.resource?.owningUnitId,medA);
      assert.equal(await access.canAccessResource(actor,record.id,Permissions.MEDICAL_READ),true);
      assert.equal(await access.canAccessResource(recipient,record.id,Permissions.MEDICAL_READ),false);

      // A plain update to another team's restricted medical record requires
      // handoff permissions, not just edit rights.
      const reassigned=await medical.updateEncounter(record.id,{assignedUnitId:medB},actor);
      assert.equal(reassigned.assignedUnitId,medB);
      const updated=await lookup(record.id);
      assert.equal(updated.record?.assignedUnitId,medB);
      assert.equal(updated.resource?.owningUnitId,medB);
      assert.equal(updated.resource?.ownerUserId,null);
      assert.equal(await access.canAccessResource(actor,record.id,Permissions.MEDICAL_READ),false);
      assert.equal(await access.canAccessResource(recipient,record.id,Permissions.MEDICAL_READ),true);
      await assert.rejects(medical.getEncounterDetail(record.id,actor),ForbiddenException);
      assert.equal((await medical.getEncounterDetail(record.id,recipient)).assignedUnitId,medB);
    });

    await t.test('ambiguous multiple medical memberships do not auto-disclose to a random team', async () => {
      await db.insert(membershipUnitAssignments).values({membershipId:membershipA,unitId:medExtra});
      assert.equal(await medical.resolveIntakeUnit(eventA,actorId),null);
      await db.delete(membershipUnitAssignments).where(and(
        eq(membershipUnitAssignments.membershipId,membershipA),
        eq(membershipUnitAssignments.unitId,medExtra),
      ));
    });

    await t.test('failed handoff rolls back both domain and access-control ownership', async () => {
      const created=await medical.createEncounter(eventA,{triageCategory:'MINOR',visibility:'UNIT'},actor);
      const original=await lookup(created.id);
      const originalEmit=indexer.emitSearchUpsert.bind(indexer);
      indexer.emitSearchUpsert=async()=>{throw new Error('Simulated search outbox failure');};
      try {
        await assert.rejects(medical.transferEncounter(created.id,{
          targetLocationId:locationId,receivingUnitId:medB,disposition:'Clinic B',
        },actor),/Simulated search outbox failure/);
      } finally { indexer.emitSearchUpsert=originalEmit; }
      const after=await lookup(created.id);
      assert.equal(after.record?.assignedUnitId,original.record?.assignedUnitId);
      assert.equal(after.resource?.owningUnitId,original.resource?.owningUnitId);
      assert.equal(after.resource?.ownerUserId,original.resource?.ownerUserId);
      assert.equal(after.record?.status,'RECEIVED');
      assert.equal(after.record?.locationId,null);

      const success=await medical.transferEncounter(created.id,{
        targetLocationId:locationId,receivingUnitId:medB,disposition:'Clinic B',
      },actor);
      assert.equal(success.status,'TRANSFERRED');
      assert.equal(success.assignedUnitId,medB);
      const transferred=await lookup(created.id);
      assert.equal(transferred.resource?.owningUnitId,medB);
      assert.equal(transferred.resource?.ownerUserId,null);
      assert.equal(transferred.record?.status,'TRANSFERRED');
      assert.equal(await access.canAccessResource(actor,created.id,Permissions.MEDICAL_READ),false);
      assert.equal(await access.canAccessResource(recipient,created.id,Permissions.MEDICAL_READ),true);
    });
  } finally {
    await closeDatabaseConnection();
  }
});
