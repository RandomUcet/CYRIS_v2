import 'reflect-metadata';
import assert from 'node:assert/strict';
import test from 'node:test';
import { and, eq, inArray, sql } from 'drizzle-orm';
import { ForbiddenException, NotFoundException, BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import {
  getDbClient, closeDatabaseConnection, users, events, eventMemberships,
  organizationalUnits, membershipUnitAssignments, roles, roleAssignments, rolePermissions,
  unitCapabilities, resources, evidence, operationalTasks, auditEvents, outboxEvents, notifications as notificationRows,
} from '@cyris/db';
import { generateId, Permissions, type PermissionKey } from '@cyris/shared';
import { MyWorkQuerySchema, CreateOperationalTaskRequestSchema } from '@cyris/contracts';
import { DatabaseService } from '../modules/database/database.service.js';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { ResourceAccessService } from '../modules/resources/resource-access.service.js';
import { ResourceService } from '../modules/resources/resource.service.js';
import { IdentifierAllocatorService } from '../modules/resources/identifier-allocator.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { ActivityService } from '../modules/resources/activity.service.js';
import { SearchIndexerService } from '../modules/search/search-indexer.service.js';
import { NotificationsService } from '../modules/notifications/notifications.service.js';
import { TasksService } from '../modules/tasks/tasks.service.js';
import { TasksController } from '../modules/tasks/tasks.controller.js';
import { ForensicsService } from '../modules/forensics/forensics.service.js';
import { ForensicsController } from '../modules/forensics/forensics.controller.js';
import { LaboratoryService } from '../modules/laboratory/laboratory.service.js';
import { DisruptionsService } from '../modules/disruptions/disruptions.service.js';
import type { AuthenticatedUser } from '../modules/auth/session.service.js';
import { requireVerifiedIsolatedDatabase } from './isolated-postgres-harness.js';

const databaseUrl = requireVerifiedIsolatedDatabase();

test('operational permissions and workflows against real isolated PostgreSQL', {
  skip: databaseUrl ? false : 'Requires an explicitly isolated local CYRIS_TEST_DATABASE_URL',
}, async (t) => {
  const db = getDbClient({ url: databaseUrl!, max: 10 });
  const database = { client: db } as DatabaseService;
  const auth = new AuthorizationService(database);
  const access = new ResourceAccessService(database, auth);
  const audit = new AuditService(database);
  const indexer = new SearchIndexerService(database, {} as never);
  // Notifications are kept local; the assertion checks the resource is visible
  // outside its creation transaction (the previous implementation deadlocked on its FK).
  let notifications = 0;
  const notificationService = {
    async emit(input: { resourceId: string }) {
      const [visible] = await db.select({ id: resources.id }).from(resources).where(eq(resources.id, input.resourceId));
      assert.ok(visible, 'notification must be dispatched after resource commit');
      notifications += 1;
      return null;
    },
  } as unknown as NotificationsService;
  const activity = {
    async recordActivity(input: Parameters<ActivityService['recordActivity']>[0], tx = db) {
      // Use the production write implementation without exercising unrelated feed policy.
      return ActivityService.prototype.recordActivity.call({ databaseService: { client: tx } }, input, tx);
    },
  } as unknown as ActivityService;
  const resource = new ResourceService(database, audit, activity, indexer);
  const allocator = new IdentifierAllocatorService(database);
  const disruptions = new DisruptionsService(database, auth, audit);
  const tasks = new TasksService(database, resource, access, allocator, audit, activity, indexer, notificationService, auth, disruptions);
  const controller = new TasksController(tasks);
  const forensics=new ForensicsService(database,audit,activity,resource,access,allocator,auth);
  const forensicController=new ForensicsController(forensics);
  const lab = new LaboratoryService(database, resource, access, allocator, audit, activity, indexer, notificationService, auth);

  const eventA = generateId();
  const eventB = generateId();
  const unitA = generateId();
  const unitB = generateId();
  const foreignUnit = generateId();
  const evidenceId = generateId();
  const fixtureUsers: AuthenticatedUser[] = ['organizer', 'worker', 'second-worker', 'leader', 'requester', 'outsider', 'inactive', 'disabled']
    .map((name) => ({ id: generateId(), email: `${name}-${generateId()}@example.invalid`, displayName: name, status: name === 'disabled' ? 'DISABLED' : 'ACTIVE' }));
  const [organizer, worker, secondWorker, leader, requester, outsider, inactive, disabled] = fixtureUsers as [AuthenticatedUser, AuthenticatedUser, AuthenticatedUser, AuthenticatedUser, AuthenticatedUser, AuthenticatedUser, AuthenticatedUser, AuthenticatedUser];
  const memberships = new Map<string, string>();
  const addRole = async (name: string, user: AuthenticatedUser, permissions: Array<[PermissionKey, string]>, unitId?: string) => {
    const id = generateId();
    await db.insert(roles).values({ id, eventId: eventA, name, slug: name });
    await db.insert(rolePermissions).values(permissions.map(([permissionKey, scope]) => ({ roleId: id, permissionKey, scope })));
    await db.insert(roleAssignments).values({ roleId: id, membershipId: memberships.get(user.id)!, unitId });
  };
  try {
    await db.insert(events).values([
      { id: eventA, name: 'Authorization regression A', slug: `auth-a-${eventA}` },
      { id: eventB, name: 'Authorization regression B', slug: `auth-b-${eventB}` },
    ]);
    await db.insert(users).values(fixtureUsers);
    await db.insert(organizationalUnits).values([
      { id: unitA, eventId: eventA, name: 'Laboratory A', slug: 'lab-a' },
      { id: unitB, eventId: eventA, name: 'Laboratory B', slug: 'lab-b' },
      { id: foreignUnit, eventId: eventB, name: 'Other exercise laboratory', slug: 'lab-other' },
    ]);
    await db.insert(unitCapabilities).values([{ unitId: unitA, capabilityKey: 'chemical_analysis' }, { unitId: unitB, capabilityKey: 'chemical_analysis' }]);
    for (const user of fixtureUsers.filter((u) => u !== outsider)) {
      const id = generateId(); memberships.set(user.id, id);
      await db.insert(eventMemberships).values({ id, eventId: eventA, userId: user.id, status: user === inactive ? 'INACTIVE' : 'ACTIVE' });
      if (user !== organizer) await db.insert(membershipUnitAssignments).values({ membershipId: id, unitId: unitA });
    }
    await db.insert(membershipUnitAssignments).values({ membershipId: memberships.get(leader.id)!, unitId: unitB });
    const assigned: Array<[PermissionKey, string]> = [
      [Permissions.LAB_READ, 'ASSIGNED'], [Permissions.LAB_ACCEPT, 'ASSIGNED'],
      [Permissions.LAB_WORK, 'ASSIGNED'], [Permissions.LAB_COMPLETE, 'ASSIGNED'],
      [Permissions.TASK_READ, 'ASSIGNED'], [Permissions.TASK_ACKNOWLEDGE, 'ASSIGNED'],
      [Permissions.TASK_WORK, 'ASSIGNED'], [Permissions.TASK_COMPLETE, 'ASSIGNED'],
    ];
    for (const user of [worker, secondWorker, inactive, disabled]) await addRole(`worker-${user.id}`, user, assigned);
    await addRole('laboratory-leader', leader, [
      [Permissions.LAB_READ, 'UNIT'], [Permissions.LAB_REQUEST, 'UNIT'], [Permissions.LAB_REASSIGN, 'UNIT'], [Permissions.EVIDENCE_READ, 'EVENT'],
    ], unitA);
    await addRole('laboratory-requester', requester, [[Permissions.LAB_REQUEST, 'EVENT'], [Permissions.LAB_READ, 'OWN'], [Permissions.EVIDENCE_READ, 'EVENT']]);
    await addRole('exercise-control', organizer, [
      Permissions.TASK_CREATE, Permissions.TASK_ASSIGN, Permissions.TASK_READ, Permissions.TASK_UPDATE,
      Permissions.TASK_ACKNOWLEDGE, Permissions.TASK_WORK, Permissions.TASK_COMPLETE, Permissions.TASK_CANCEL,
      Permissions.SCENARIO_MANAGE, Permissions.SCENARIO_OVERRIDE, Permissions.LAB_READ, Permissions.LAB_REQUEST,
      Permissions.LAB_REASSIGN, Permissions.LAB_CORRECT, Permissions.LAB_ACCEPT, Permissions.LAB_WORK,
      Permissions.LAB_COMPLETE, Permissions.LAB_APPROVE, Permissions.EVIDENCE_READ,
    ].map((permission) => [permission, 'EVENT']));
    await db.insert(resources).values({ id: evidenceId, eventId: eventA, resourceType: 'evidence', visibility: 'EVENT', ownerUserId: requester.id });
    await db.insert(evidence).values({ id: evidenceId, evidenceNumber: 'EV-TEST', title: 'Fixture sample', evidenceType: 'sample', currentHolderId: requester.id });

    await t.test('forensic request and indicator creation require permission, event routes are scoped',async()=>{
      await db.insert(unitCapabilities).values({unitId:unitA,capabilityKey:'digital_forensics'});
      const forensicWorkerPermissions:Array<[PermissionKey,string]>=[Permissions.FORENSICS_READ,Permissions.FORENSICS_ACCEPT,Permissions.FORENSICS_WORK,Permissions.FORENSICS_COMPLETE].map(p=>[p,'ASSIGNED']);
      for(const u of [worker,secondWorker,disabled,inactive])await addRole('forensics-'+u.id,u,forensicWorkerPermissions,unitA);
      await addRole('forensic-approver',organizer,[[Permissions.FORENSICS_READ,'EVENT'],[Permissions.FORENSICS_APPROVE,'EVENT']]);
      const request={purpose:'Fixture review',analysisType:'FILE_ANALYSIS',priority:'MEDIUM',visibility:'EVENT',evidenceIds:[evidenceId] } as const;
      const dto={...request,evidenceIds:[...request.evidenceIds]};
      await assert.rejects(forensics.createAnalysis(eventA,dto,outsider),ForbiddenException);
      await assert.rejects(forensics.createAnalysis(eventA,dto,requester),ForbiddenException);
      await assert.rejects(forensics.createIndicator(eventA,{indicatorType:'OTHER',value:'fixture',verificationState:'UNVERIFIED'},requester),ForbiddenException);
      const [role]=await db.select({id:roles.id}).from(roles).where(and(eq(roles.eventId,eventA),eq(roles.slug,'laboratory-requester')));
      await db.insert(rolePermissions).values({roleId:role!.id,permissionKey:Permissions.FORENSICS_REQUEST,scope:'EVENT'});
      try{
        await assert.rejects(forensics.createAnalysis(eventB,dto,requester),ForbiddenException);
        await assert.rejects(forensics.createAnalysis(eventA,{...dto,deviceIds:[evidenceId]},requester),BadRequestException);
        const created=await forensics.createAnalysis(eventA,dto,requester);
        assert.equal(created.requestedByUserId,requester.id);
        assert.equal(created.status,'REQUESTED');
        await assert.rejects(forensicController.getAnalysisDetail(eventB,created.id,requester),NotFoundException);
        await assert.rejects(forensicController.updateStatus(eventB,created.id,{status:'APPROVED'},requester),NotFoundException);
        await assert.rejects(forensics.updateStatus(created.id,{status:'APPROVED'},requester),ForbiddenException);
        assert.equal(created.assignedUnitId,unitA);assert.ok([worker.id,secondWorker.id].includes(created.assignedToUserId!));
        const examiner=created.assignedToUserId===worker.id?worker:secondWorker;
        await assert.rejects(forensics.updateStatus(created.id,{status:'APPROVED'},organizer),BadRequestException);
        await forensics.updateStatus(created.id,{status:'ACCEPTED'},examiner);
        await forensics.updateStatus(created.id,{status:'IN_PROGRESS'},examiner);
        await assert.rejects(forensics.updateStatus(created.id,{status:'COMPLETED'},examiner),BadRequestException);
        await forensics.saveReport(created.id,{methodology:'Fixture method',findings:'Fixture findings',conclusion:'Fixture conclusion'},examiner);
        await forensics.updateStatus(created.id,{status:'COMPLETED'},examiner);
        assert.equal((await forensics.getAnalysisDetail(created.id,requester)).conclusion,null);
        await forensics.updateStatus(created.id,{status:'APPROVED'},organizer);
        const approved=await forensics.getAnalysisDetail(created.id,requester);
        assert.equal(approved.reportAvailable,true);assert.equal(approved.conclusion,'Fixture conclusion');
        await assert.rejects(forensics.saveReport(created.id,{conclusion:'Changed'},examiner),BadRequestException);
        await assert.rejects(forensics.createFinding(created.id,{findingType:'ARTIFACT',title:'Late',description:'Late',confidence:'CONFIRMED'},examiner),BadRequestException);
        const inbox=new NotificationsService(database,{} as never,{} as never,{} as never,auth);
        const receipts=(await inbox.getNotifications(requester.id,eventA)).newItems.filter(x=>x.resourceId===created.id&&x.templateKey==='forensics.request.status');
        assert.deepEqual(receipts.map(x=>x.templateParams.status).sort(),['ACCEPTED','APPROVED','COMPLETED','IN_PROGRESS','REQUESTED']);
      }finally{await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId,role!.id),eq(rolePermissions.permissionKey,Permissions.FORENSICS_REQUEST)));}
    });
    await t.test('task creation denies an outsider and a member without TASK_CREATE before writes', async () => {
      const dto = CreateOperationalTaskRequestSchema.parse({ title: 'Unauthorized task' });
      await assert.rejects(tasks.createTask(eventA, dto, outsider), ForbiddenException);
      await assert.rejects(tasks.createTask(eventA, dto, worker), ForbiddenException);
      assert.equal((await db.select().from(operationalTasks).where(eq(operationalTasks.eventId, eventA))).length, 0);
    });
    await t.test('task assignees must be active, in the event and in the selected unit', async () => {
      for (const target of [outsider, inactive, disabled]) {
        await assert.rejects(tasks.createTask(eventA, CreateOperationalTaskRequestSchema.parse({ title: 'Invalid target', assignedUnitId: unitA, assignedUserId: target.id }), organizer), BadRequestException);
      }
      await assert.rejects(tasks.createTask(eventA, CreateOperationalTaskRequestSchema.parse({ title: 'Wrong unit', assignedUnitId: unitB, assignedUserId: worker.id }), organizer), BadRequestException);
      await assert.rejects(tasks.createTask(eventA, CreateOperationalTaskRequestSchema.parse({ title: 'Wrong event owner', owningUnitId: foreignUnit }), organizer), BadRequestException);
    });
    let taskId = '';
    await t.test('authorized task creation commits before notification and preserves assignee access', async () => {
      const row = await tasks.createTask(eventA, CreateOperationalTaskRequestSchema.parse({ title: 'Assigned task', assignedUnitId: unitA, assignedUserId: worker.id }), organizer);
      taskId = row.id;
      assert.equal(notifications, 1);
      const detail = await tasks.getTaskDetail(taskId, worker, eventA);
      assert.equal(detail.id, taskId);
      assert.deepEqual(detail.availableActions.sort(), ['acknowledge', 'block', 'complete', 'start']);
      assert.ok((await tasks.getTaskDetail(taskId, organizer, eventA)).availableActions.includes('assign'));
    });
    await t.test('all controller mutations reject a task addressed through another event', async () => {
      const calls = [
        () => controller.updateTask(eventB, taskId, { title: 'Wrong-event edit' }, organizer),
        () => controller.assignTask(eventB, taskId, {}, organizer),
        () => controller.acknowledgeTask(eventB, taskId, {}, organizer),
        () => controller.startTask(eventB, taskId, {}, organizer),
        () => controller.blockTask(eventB, taskId, { reason: 'Wrong event' }, organizer),
        () => controller.completeTask(eventB, taskId, {}, organizer),
        () => controller.cancelTask(eventB, taskId, { reason: 'Wrong event' }, organizer),
        () => controller.reopenTask(eventB, taskId, { reason: 'Wrong event' }, organizer),
      ];
      for (const call of calls) await assert.rejects(call(), NotFoundException);
      const [row] = await db.select().from(operationalTasks).where(eq(operationalTasks.id, taskId));
      assert.equal(row?.status, 'OPEN'); assert.equal(row?.title, 'Assigned task');
    });
    await t.test('explicit UNIT role stays within its bound unit despite membership in another unit', async () => {
      assert.equal(await auth.authorize({ user: leader, permission: Permissions.LAB_REASSIGN, context: { eventId: eventA, unitId: unitA } }), true);
      assert.equal(await auth.authorize({ user: leader, permission: Permissions.LAB_REASSIGN, context: { eventId: eventA, unitId: unitB } }), false);
    });
    await t.test('ASSIGNED lab workers are eligible without granting access to unassigned resources', async () => {
      const capability = { permission: Permissions.LAB_WORK, eventId: eventA, unitId: unitA, resourceScopes: ['ASSIGNED'] as const, requireUnitMembership: true };
      assert.equal(await auth.hasEventCapability({ user: worker, ...capability }), true);
      assert.equal(await auth.authorize({ user: worker, permission: Permissions.LAB_WORK, context: { eventId: eventA, unitId: unitA } }), false);
      assert.equal(await auth.hasEventCapability({ user: outsider, ...capability }), false);
      assert.equal(await auth.hasEventCapability({ user: inactive, ...capability }), false);
      assert.equal(await auth.hasEventCapability({ user: { ...disabled, status: 'ACTIVE' }, ...capability }), false);
      assert.equal(await auth.hasEventCapability({ user: worker, ...capability, unitId: unitB }), false);
      assert.equal(await auth.hasEventCapability({ user: worker, ...capability, eventId: eventB }), false);
      const permissions=[Permissions.LAB_WORK,Permissions.TASK_READ,Permissions.LAB_REASSIGN,Permissions.MEDICAL_READ] as const;
      for(const subject of [worker,leader,outsider,inactive,{...disabled,status:'ACTIVE' as const}]){
        const batch=await auth.eventCapabilities({...capability,user:subject,permissions});
        for(const permission of permissions)assert.equal(batch.has(permission),await auth.hasEventCapability({...capability,user:subject,permission}));
      }
      const granted=await auth.eventCapabilities({...capability,user:worker,permissions});
      assert.ok(granted.has(Permissions.LAB_WORK));
      assert.equal(granted.has(Permissions.LAB_REASSIGN),false);
      assert.equal((await auth.eventCapabilities({...capability,user:worker,permissions,eventId:eventB})).size,0);
      assert.equal((await auth.eventCapabilities({...capability,user:worker,permissions:[]})).size,0);
    });
    let labId = '';
    await t.test('concurrent lab requests assign real eligible workers with balanced workload', async () => {
      const created = await Promise.all(Array.from({ length: 4 }, () => lab.createAnalysis(eventA, { analysisType: 'chemical', evidenceIds: [evidenceId], requestedFromUnitId: unitA, visibility: 'EVENT' }, requester)));
      labId = created[0]!.id;
      assert.equal(new Set(created.map((r) => r.analysisNumber)).size, 4);
      assert.equal(created.filter((r) => r.assignedToUserId === worker.id).length, 2);
      assert.equal(created.filter((r) => r.assignedToUserId === secondWorker.id).length, 2);
      for (const row of created) assert.equal((await lab.getAnalysis(eventA, row.id, row.assignedToUserId === worker.id ? worker : secondWorker)).id, row.id);
    });
    await t.test('lab leader can request and reassign to ordinary workers in the bound unit', async () => {
      const requested = await lab.createAnalysis(eventA, { analysisType: 'chemical', evidenceIds: [evidenceId], requestedFromUnitId: unitA, visibility: 'EVENT' }, leader);
      const row = await lab.reassignAnalysis(eventA, requested.id, { assignedToUserId: worker.id, assignedUnitId: unitA, reason: 'Balance work' }, leader);
      assert.equal(row.assignedToUserId, worker.id);
      await assert.rejects(lab.reassignAnalysis(eventA, requested.id, { assignedUnitId: unitB, assignedToUserId: null, reason: 'Move outside scope' }, leader), ForbiddenException);
    });
    await t.test('My Work returns only assigned items and rejects broader or foreign-event queues', async () => {
      const personal = await tasks.listMyWork(eventA, MyWorkQuerySchema.parse({ view: 'personal' }), worker);
      assert.ok(personal.items.some((item) => item.id === taskId));
      assert.ok(personal.items.some((item) => item.kind === 'LAB_ANALYSIS'));
      assert.ok(personal.items.every((item) => item.assignedToUserId === worker.id));
      assert.deepEqual(personal.availableViews, ['personal']);
      assert.deepEqual(personal.availableUnits, []);
      const leaderWork = await tasks.listMyWork(eventA, MyWorkQuerySchema.parse({}), leader);
      assert.deepEqual(leaderWork.availableViews, ['personal', 'unit']);
      assert.deepEqual(leaderWork.availableUnits.map((unit) => unit.id), [unitA]);
      await assert.rejects(tasks.listMyWork(eventA, MyWorkQuerySchema.parse({ view: 'event' }), worker), ForbiddenException);
      await assert.rejects(tasks.listMyWork(eventA, MyWorkQuerySchema.parse({ view: 'unit', unitId: unitA }), worker), ForbiddenException);
      await assert.rejects(tasks.listMyWork(eventB, MyWorkQuerySchema.parse({}), worker), ForbiddenException);
      await assert.rejects(tasks.listMyWork(eventA, MyWorkQuerySchema.parse({}), outsider), ForbiddenException);
    });
    await t.test('evidence requester receives status and approved laboratory result without a worker role',async()=>{
      const row=await lab.createAnalysis(eventA,{analysisType:'Fingerprint comparison',evidenceIds:[evidenceId],requestedFromUnitId:unitA,visibility:'EVENT'},requester);
      const analyst=row.assignedToUserId===worker.id?worker:secondWorker;
      const [requesterRole]=await db.select({id:roles.id}).from(roles).where(and(eq(roles.eventId,eventA),eq(roles.slug,'laboratory-requester')));
      await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId,requesterRole!.id),eq(rolePermissions.permissionKey,Permissions.LAB_READ)));
      try{
        const assigned=await lab.getAnalysisDetail(eventA,row.id,analyst);
        assert.equal(assigned.evidenceItems.find(x=>x.id===evidenceId)?.canOpen,false);
        assert.equal(await access.canAccessResource(analyst,evidenceId,Permissions.EVIDENCE_READ),false);
        assert.deepEqual(assigned.evidenceIds,[]);
        const initial=await lab.getAnalysisDetail(eventA,row.id,requester);
        assert.equal(initial.status,'REQUESTED');assert.equal(initial.reportAvailable,false);
        assert.ok(Object.values(initial.actions).every(v=>!v));
        await assert.rejects(lab.updateAnalysis(eventA,row.id,{status:'ACCEPTED'},requester),ForbiddenException);
        await lab.updateAnalysis(eventA,row.id,{status:'ACCEPTED'},analyst);
        await lab.updateAnalysis(eventA,row.id,{status:'IN_PROGRESS'},analyst);
        await assert.rejects(lab.updateAnalysis(eventA,row.id,{status:'COMPLETED'},analyst),BadRequestException);
        await lab.updateAnalysis(eventA,row.id,{method:'Comparison',findings:'Fixture intermediate findings',conclusion:'Fixture final conclusion',status:'COMPLETED'},analyst);
        const pending=await lab.getAnalysisDetail(eventA,row.id,requester);
        assert.equal(pending.status,'COMPLETED');assert.equal(pending.findings,null);assert.equal(pending.conclusion,null);
        assert.equal((await lab.listAnalyses(eventA,requester,evidenceId)).find(x=>x.id===row.id)?.reportAvailable,false);
        await lab.updateAnalysis(eventA,row.id,{status:'APPROVED'},organizer);
        const result=await lab.getAnalysisDetail(eventA,row.id,requester);
        assert.equal(result.reportAvailable,true);assert.equal(result.conclusion,'Fixture final conclusion');
        assert.equal(result.findings,'Fixture intermediate findings');assert.equal(result.requesterName,requester.displayName);
        assert.deepEqual(result.evidenceIds,[evidenceId]);
        await assert.rejects(lab.updateAnalysis(eventA,row.id,{findings:'Unauthorized revision'},analyst),BadRequestException);
        await assert.rejects(lab.getAnalysisDetail(eventA,row.id,outsider),ForbiddenException);
        await assert.rejects(lab.getAnalysisDetail(eventB,row.id,requester),NotFoundException);
        const inbox=new NotificationsService(database,{} as never,{} as never,{} as never,auth);
        const receipts=(await inbox.getNotifications(requester.id,eventA)).newItems.filter(x=>x.resourceId===row.id&&x.templateKey==='lab.request.status');
        assert.deepEqual(receipts.map(x=>x.templateParams.status).sort(),['ACCEPTED','APPROVED','COMPLETED','IN_PROGRESS','REQUESTED']);
        assert.ok(receipts.every(x=>!JSON.stringify(x.templateParams).includes('Fixture')));
        await db.delete(rolePermissions).where(and(eq(rolePermissions.roleId,requesterRole!.id),eq(rolePermissions.permissionKey,Permissions.LAB_REQUEST)));
        assert.equal((await inbox.getNotifications(requester.id,eventA)).newItems.filter(x=>x.resourceId===row.id).length,0);
        await assert.rejects(lab.getAnalysisDetail(eventA,row.id,requester),ForbiddenException);
      }finally{
        await db.insert(rolePermissions).values([{roleId:requesterRole!.id,permissionKey:Permissions.LAB_READ,scope:'OWN'},{roleId:requesterRole!.id,permissionKey:Permissions.LAB_REQUEST,scope:'EVENT'}]).onConflictDoNothing();
      }
    });
    await t.test('task retries preserve progress and concurrent completion records one audit transition', async () => {
      const row = await tasks.createTask(eventA, CreateOperationalTaskRequestSchema.parse({ title: 'Transition regression', assignedUnitId: unitA, assignedUserId: worker.id }), organizer);
      await tasks.startTask(row.id, {}, worker, eventA);
      assert.equal((await tasks.acknowledgeTask(row.id, {}, worker, eventA)).status, 'IN_PROGRESS');
      const results = await Promise.all([
        tasks.completeTask(row.id, { completionNote: 'First completion' }, worker, eventA),
        tasks.completeTask(row.id, { completionNote: 'Retried completion' }, worker, eventA),
      ]);
      assert.ok(results.every((result) => result.status === 'COMPLETED' && result.availableActions.length === 0));
      const completed = await db.select().from(auditEvents).where(and(eq(auditEvents.resourceId, row.id), eq(auditEvents.action, 'task.completed')));
      assert.equal(completed.length, 1);
      await assert.rejects(tasks.cancelTask(row.id, { reason: 'Already done' }, organizer, eventA), BadRequestException);
      await tasks.reopenTask(row.id, { reason: 'Review required', newStatus: 'OPEN' }, organizer, eventA);
      await tasks.cancelTask(row.id, { reason: 'Superseded' }, organizer, eventA);
      await assert.rejects(tasks.completeTask(row.id, {}, worker, eventA), BadRequestException);
      assert.equal((await tasks.getTaskDetail(row.id, organizer, eventA)).status, 'CANCELLED');
    });
    await t.test('audit failure rolls back a task state transition', async () => {
      const row = await tasks.createTask(eventA, CreateOperationalTaskRequestSchema.parse({ title: 'Atomic rollback', assignedUnitId: unitA, assignedUserId: worker.id }), organizer);
      const failedAudit = { async record() { throw new Error('Injected audit persistence failure'); } } as unknown as AuditService;
      const failing = new TasksService(database, resource, access, allocator, failedAudit, activity, indexer, notificationService, auth, disruptions);
      await assert.rejects(failing.startTask(row.id, {}, worker, eventA), /Injected audit persistence failure/);
      assert.equal((await tasks.getTaskDetail(row.id, organizer, eventA)).status, 'OPEN');
      const audits = await db.select().from(auditEvents).where(and(eq(auditEvents.resourceId, row.id), eq(auditEvents.action, 'task.started')));
      assert.equal(audits.length, 0);
    });
    await t.test('only platform administrators can schedule, inspect and restore recipient-specific module restrictions', async () => {
      const admin: AuthenticatedUser = { ...organizer, id: generateId(), email: `admin-${eventA}@example.invalid` };
      const roleId = generateId();
      await db.insert(users).values(admin);
      await db.insert(eventMemberships).values({ eventId: eventA, userId: admin.id, status: 'ACTIVE' });
      await db.insert(roles).values({ id: roleId, name: 'Availability administrator', slug: `admin-${roleId}` });
      await db.insert(rolePermissions).values({ roleId, permissionKey: Permissions.PLATFORM_MANAGE, scope: 'PLATFORM' });
      await db.insert(roleAssignments).values({ roleId, userId: admin.id });
      const reason = 'Private availability control note';
      const now = Date.now();
      const rule = { targetType: 'UNIT', targetId: unitA, module: 'tasks', mode: 'READ_ONLY', reason } as const;
      await assert.rejects(disruptions.start(eventA, rule, organizer), ForbiddenException);
      await assert.rejects(disruptions.listOperator(eventA, organizer), ForbiddenException);
      await assert.rejects(disruptions.start(eventA, { ...rule, targetId: foreignUnit }, admin), NotFoundException);

      const disruption = await disruptions.start(eventA, rule, admin);
      const planned = await disruptions.start(eventA, {
        ...rule, module: 'lab', mode: 'UNAVAILABLE', startsAt: new Date(now + 3600000).toISOString(),
      }, admin);
      await disruptions.start(eventA, {
        ...rule, module: 'lab', startsAt: new Date(now - 7200000).toISOString(), expiresAt: new Date(now - 3600000).toISOString(),
      }, admin);
      await disruptions.start(eventA, { ...rule, module: 'court' }, admin); // Worker cannot access court.
      await disruptions.start(eventA, { ...rule, module: 'lab', targetType: 'USER', targetId: secondWorker.id }, admin);
      assert.equal((await disruptions.getParticipantStatus(eventA, worker)).active, true);
      assert.deepEqual((await disruptions.getServiceStatus(eventA, worker)).items, [{ service: 'tasks', impact: 'READ_ONLY' }]);
      assert.deepEqual((await disruptions.getServiceStatus(eventA, secondWorker)).items, [
        { service: 'lab', impact: 'READ_ONLY' }, { service: 'tasks', impact: 'READ_ONLY' },
      ]);
      assert.deepEqual((await tasks.getTaskDetail(taskId, worker, eventA)).availableActions, []);
      await assert.rejects(tasks.startTask(taskId, {}, worker, eventA), ForbiddenException);
      await assert.rejects(disruptions.getParticipantStatus(eventA, outsider), ForbiddenException);
      await assert.rejects(disruptions.getServiceStatus(eventB, worker), ForbiddenException);
      await assert.rejects(disruptions.restore(eventA, planned.id, { expectedRevision: 1, reason }, organizer), ForbiddenException);
      assert.ok((await disruptions.restore(eventA, planned.id, { expectedRevision: 1, reason }, admin)).restoredAt);

      const outage = await disruptions.start(eventA, {
        ...rule, targetId: null, targetType: 'EVENT', mode: 'UNAVAILABLE',
      }, admin);
      assert.deepEqual((await disruptions.getServiceStatus(eventA, worker)).items, [{ service: 'tasks', impact: 'UNAVAILABLE' }]);
      assert.deepEqual((await disruptions.getServiceStatus(eventA, admin)).items, []);
      const unavailable = (error: unknown) => error instanceof ServiceUnavailableException &&
        !/simulat|disrupt|private|exercise/i.test(JSON.stringify(error.getResponse()));
      await assert.rejects(disruptions.assertModuleAccess(eventA, organizer, 'tasks', 'read'), unavailable);
      await assert.rejects(disruptions.assertModuleAccess(eventA, worker, 'tasks', 'write'), unavailable);
      await disruptions.assertModuleAccess(eventA, admin, 'tasks', 'write');
      assert.ok((await disruptions.listOperator(eventA, admin)).some(item => item.reason === reason));
      const [auditEvent] = await db.select().from(auditEvents).where(and(eq(auditEvents.action, 'exercise.disruption.started'), eq(auditEvents.resourceId, outage.id)));
      assert.equal((await audit.getById(auditEvent!.id, true))?.actorUserId, admin.id);
      assert.equal(await audit.getById(auditEvent!.id), null);
      assert.equal((await audit.list({ eventId: eventA, action: 'exercise.disruption.started', page: 1, limit: 5 })).total, 0);
      const inbox=new NotificationsService(database,{} as never,{} as never,{} as never,auth);
      const hiddenId=generateId(),visibleId=generateId(),otherId=generateId(),globalId=generateId();
      await db.insert(notificationRows).values([
        {id:hiddenId,userId:worker.id,eventId:eventA,type:'TASK_ASSIGNED',templateKey:'task.assigned'},
        {id:visibleId,userId:worker.id,eventId:eventA,type:'BROADCAST',templateKey:'exercise.broadcast'},
        {id:otherId,userId:worker.id,eventId:eventB,type:'BROADCAST',templateKey:'exercise.broadcast'},
        {id:globalId,userId:worker.id,type:'BROADCAST',templateKey:'exercise.broadcast'},
      ]);
      const visibleInbox=await inbox.getNotifications(worker.id,eventA);
      assert.deepEqual(visibleInbox.newItems.map(row=>row.id),[visibleId]);
      await assert.rejects(inbox.markRead(hiddenId,worker.id),NotFoundException);
      await assert.rejects(inbox.dismiss(hiddenId,worker.id),NotFoundException);
      assert.equal((await inbox.markAllRead(worker.id,eventA)).updatedCount,1);
      assert.equal((await inbox.markAllRead(worker.id)).updatedCount,2);
      assert.equal((await inbox.markAllRead(worker.id)).updatedCount,0);
      await disruptions.restore(eventA, outage.id, { expectedRevision: 1, reason }, admin);
      const restoredInbox=await inbox.getNotifications(worker.id,eventA);
      assert.deepEqual(restoredInbox.newItems.map(row=>row.id),[hiddenId]);
      assert.equal((await inbox.markAllRead(worker.id,eventA)).updatedCount,1);
      await assert.rejects(disruptions.restore(eventA, outage.id, { expectedRevision: 1, reason }, admin), ConflictException);
      assert.deepEqual((await disruptions.getServiceStatus(eventA, worker)).items, [{ service: 'tasks', impact: 'READ_ONLY' }]);

      const objective = await disruptions.createRecoveryObjective(eventA, { disruptionId: disruption.id, title: 'Restore tasks', instructions: 'Validate service', audienceType: 'UNIT', audienceId: unitA }, admin);
      const published = await disruptions.publishRecoveryObjective(eventA, objective.id, objective.revision, admin);
      await assert.rejects(disruptions.listRecoveryObjectives(eventA, organizer), ForbiddenException);
      await assert.rejects(disruptions.submitRecoveryReport(eventA, objective.id, { body: 'Service validation complete' }, worker), ForbiddenException);
      assert.equal((await disruptions.submitRecoveryReport(eventA, objective.id, { body: 'Service validation complete' }, admin)).authorUserId, admin.id);
      const approved = await disruptions.reviewRecoveryObjective(eventA, objective.id, { expectedRevision: published.revision, decision: 'APPROVE' }, admin);
      await disruptions.restoreFromRecoveryObjective(eventA, objective.id, { expectedRevision: approved.revision, reason }, admin);
      assert.deepEqual((await disruptions.getServiceStatus(eventA, worker)).items, []);
    });
  } finally {
    // Audit is append-only. These uniquely named fixtures belong to the verified
    // disposable database and are removed when its harness drops that database.
    // Never disable audit triggers or leave the connection pool open on failure.
    await closeDatabaseConnection();
  }
});
