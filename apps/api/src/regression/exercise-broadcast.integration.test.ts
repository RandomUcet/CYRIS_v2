import 'reflect-metadata';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { eq, and } from 'drizzle-orm';
import { getDbClient, closeDatabaseConnection, events, users, eventMemberships,
  membershipUnitAssignments, organizationalUnits, notifications, userPreferences } from '@cyris/db';
import { generateId } from '@cyris/shared';
import { ExerciseBroadcastRequestSchema } from '@cyris/contracts';
import { ExerciseBroadcastService } from '../modules/notifications/exercise-broadcast.service.js';
import { AuditService } from '../modules/audit/audit.service.js';
import { requireVerifiedIsolatedDatabase, skipWithoutVerifiedDatabase } from './isolated-postgres-harness.js';

skipWithoutVerifiedDatabase('organizer broadcasts have event isolation, safe audience targeting, mandatory alerts, receipts and idempotency', async () => {
  const db = getDbClient({ url: requireVerifiedIsolatedDatabase()! });
  const database = { client: db } as any;
  const audit = new AuditService(database);
  const eventA=generateId(), eventB=generateId(), unitA=generateId(), unitB=generateId();
  const operator=generateId(), alpha=generateId(), beta=generateId(), disabled=generateId(), outsider=generateId();
  const actor = {id:operator,status:'ACTIVE'} as any;
  const authz = { assertAuthorized: async ({user}:{user:{id:string}}) => {
    if(user.id !== operator) throw new ForbiddenException('Only an organizer may broadcast');
  } };
  const service = new ExerciseBroadcastService(database, authz as any, audit);
  const fixtureUsers = [operator,alpha,beta,disabled,outsider];
  try {
    await db.insert(users).values(fixtureUsers.map((id,i) => ({
      id, email: id + '@exercise.example.test', displayName:'Broadcast fixture '+i,
      status: id===disabled?'DISABLED':'ACTIVE',
    })));
    await db.insert(events).values([{id:eventA,slug:eventA,name:'Broadcast A',status:'ACTIVE'},
      {id:eventB,slug:eventB,name:'Broadcast B',status:'ACTIVE'}]);
    await db.insert(organizationalUnits).values([
      {id:unitA,eventId:eventA,slug:'alpha',name:'Alpha'},
      {id:unitB,eventId:eventB,slug:'beta',name:'Beta'},
    ]);
    const assignments = [
      {id:generateId(),eventId:eventA,userId:operator,status:'ACTIVE'},
      {id:generateId(),eventId:eventA,userId:alpha,status:'ACTIVE'},
      {id:generateId(),eventId:eventA,userId:beta,status:'ACTIVE'},
      {id:generateId(),eventId:eventA,userId:disabled,status:'ACTIVE'},
      {id:generateId(),eventId:eventB,userId:outsider,status:'ACTIVE'},
    ];
    await db.insert(eventMemberships).values(assignments);
    await db.insert(membershipUnitAssignments).values([
      {id:generateId(),membershipId:assignments[1]!.id,unitId:unitA},
      {id:generateId(),membershipId:assignments[2]!.id,unitId:unitA},
      {id:generateId(),membershipId:assignments[3]!.id,unitId:unitA},
      {id:generateId(),membershipId:assignments[4]!.id,unitId:unitB},
    ]);
    await db.insert(userPreferences).values({userId:beta,notificationChannels:{inApp:false,email:false}});
    assert.equal((await service.preview(eventA,actor,{kind:'INFO',audience:'ALL'})).eligible,2);
    assert.equal((await service.preview(eventA,actor,{kind:'URGENT',audience:'ALL'})).eligible,3);
    assert.equal((await service.preview(eventA,actor,{kind:'INFO',audience:'UNIT',unitId:unitA})).eligible,1);
    await assert.rejects(service.preview(eventA,{id:alpha} as any,{kind:'INFO',audience:'ALL'}),ForbiddenException);
    await assert.rejects(service.preview(eventA,actor,{kind:'INFO',audience:'UNIT',unitId:unitB}),/does not belong/);

    const nonce=generateId();
    const input = ExerciseBroadcastRequestSchema.parse({nonce,audience:'ALL',kind:'INFO',title:'Change to timetable',message:'Briefing at 11:30 in room B.'});
    const first = await service.send(eventA,actor,input,'TEST_REQ_123456');
    assert.deepEqual(first,{nonce,delivered:2,repeated:false});
    assert.deepEqual(await service.send(eventA,actor,input,'TEST_REQ_123456'),{nonce,delivered:2,repeated:true});
    await assert.rejects(service.send(eventA,actor,{...input,message:'Different message'},'TEST_REQ_123456'),/already used/);
    const sent = await db.select().from(notifications).where(eq(notifications.sourceEventId,'exercise.broadcast:'+nonce));
    assert.equal(sent.length,2);
    assert.deepEqual(sent.map(r=>r.userId).sort(),[operator,alpha].sort());
    assert(sent.every(r=>r.actionUrl==='/events/'+eventA+'/overview'));

    const urgentNonce=generateId();
    const urgent=ExerciseBroadcastRequestSchema.parse({nonce:urgentNonce,audience:'ALL',kind:'URGENT',title:'Emergency notice',message:'All teams report to EXCON.'});
    assert.equal((await service.send(eventA,actor,urgent)).delivered,3);
    const one=await db.select().from(notifications).where(and(eq(notifications.sourceEventId,'exercise.broadcast:'+urgentNonce),eq(notifications.userId,beta)));
    assert.equal(one.length,1);
    assert.equal(one[0]!.severity,'URGENT');
    await db.update(notifications).set({readAt:new Date()}).where(eq(notifications.id,one[0]!.id));
    const history=await service.history(eventA,actor);
    const urgentHistory=history.find(h=>h.nonce===urgentNonce);
    assert.equal(urgentHistory?.delivered,3);
    assert.equal(urgentHistory?.read,1);

    const teamNotice=ExerciseBroadcastRequestSchema.parse({nonce:generateId(),audience:'UNIT',unitId:unitA,kind:'INSTRUCTION',title:'Team Alpha instruction',message:'Report the latest situation to command.'});
    assert.equal((await service.send(eventA,actor,teamNotice)).delivered,1);
    await assert.rejects(service.send(eventA,actor,ExerciseBroadcastRequestSchema.parse({...teamNotice,audience:'UNIT',nonce:generateId(),unitId:unitB})),/does not belong/);
    const foreign=await db.select().from(notifications).where(eq(notifications.userId,outsider));
    assert.equal(foreign.length,0);

    const broken=new ExerciseBroadcastService(database,authz as any,{
      record:async()=>{throw new Error('audit outage');},
    } as any);
    const brokenNonce=generateId();
    await assert.rejects(broken.send(eventA,actor,{...input,nonce:brokenNonce}),/audit outage/);
    assert.equal((await db.select().from(notifications).where(eq(notifications.sourceEventId,'exercise.broadcast:'+brokenNonce))).length,0);

    await db.update(events).set({status:'ARCHIVED'}).where(eq(events.id,eventA));
    await assert.rejects(service.send(eventA,actor,{...input,nonce:generateId()}),/closed or archived/);
  } finally {
    // Dedicated CI database; keys are randomly assigned and tests are sequential.
    await closeDatabaseConnection();
  }
});
