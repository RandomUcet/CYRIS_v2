import 'reflect-metadata';
import assert from 'node:assert/strict';
import { ForbiddenException } from '@nestjs/common';
import { and, eq } from 'drizzle-orm';
import {
  getDbClient,closeDatabaseConnection,events,users,eventMemberships,organizationalUnits,
  roles,rolePermissions,roleAssignments,scenarioPhases,scenarioInjects,
  exerciseBroadcastPlans,notifications,scenarioInjectReleases,scenarioBriefingReceipts,
  commandDefconStates,operationalHolds,scenarioClocks,
} from '@cyris/db';
import { generateId,Permissions } from '@cyris/shared';
import { ExconDashboardResponseSchema } from '@cyris/contracts';
import { AuthorizationService } from '../modules/authorization/authorization.service.js';
import { ExconDashboardService } from '../modules/command/excon-dashboard.service.js';
import { requireVerifiedIsolatedDatabase,skipWithoutVerifiedDatabase } from './isolated-postgres-harness.js';

skipWithoutVerifiedDatabase('EXCON dashboard is event-scoped, permission-checked and grounded in real counts',async()=>{
  const db=getDbClient({url:requireVerifiedIsolatedDatabase()!});
  const provider={client:db} as any;
  const service=new ExconDashboardService(provider,new AuthorizationService(provider));
  const eventA=generateId(),eventB=generateId();
  const organizer=generateId(),participant=generateId(),inactive=generateId(),disabled=generateId(),outsider=generateId();
  const aUnit=generateId(),aArchived=generateId(),bUnit=generateId();
  const actor=(id:string,status='ACTIVE')=>({id,status} as any);
  try{
    await db.insert(users).values([organizer,participant,inactive,disabled,outsider].map((id,i)=>({
      id,email:id+'@example.test',displayName:'Dashboard fixture '+i,
      status:id===disabled?'DISABLED':'ACTIVE',
    })));
    await db.insert(events).values([
      {id:eventA,name:'EXCON Alpha',slug:eventA,status:'ACTIVE',defaultTimezone:'Europe/Prague'},
      {id:eventB,name:'Foreign Exercise',slug:eventB,status:'ACTIVE'},
    ]);
    const membershipRows=[
      {id:generateId(),eventId:eventA,userId:organizer,status:'ACTIVE'},
      {id:generateId(),eventId:eventA,userId:participant,status:'ACTIVE'},
      {id:generateId(),eventId:eventA,userId:inactive,status:'INACTIVE'},
      {id:generateId(),eventId:eventA,userId:disabled,status:'ACTIVE'},
      {id:generateId(),eventId:eventB,userId:outsider,status:'ACTIVE'},
    ];
    await db.insert(eventMemberships).values(membershipRows);
    const roleA=generateId(),roleB=generateId();
    await db.insert(roles).values([
      {id:roleA,eventId:eventA,name:'EXCON Alpha',slug:'excon-a'},
      {id:roleB,eventId:eventB,name:'EXCON Beta',slug:'excon-b'},
    ]);
    await db.insert(rolePermissions).values([
      {roleId:roleA,permissionKey:Permissions.SCENARIO_MANAGE,scope:'EVENT'},
      {roleId:roleB,permissionKey:Permissions.SCENARIO_MANAGE,scope:'EVENT'},
    ]);
    await db.insert(roleAssignments).values([
      {roleId:roleA,membershipId:membershipRows[0]!.id},
      {roleId:roleB,membershipId:membershipRows[4]!.id},
    ]);
    await db.insert(organizationalUnits).values([
      {id:aUnit,eventId:eventA,name:'Blue SOC',slug:'blue-soc'},
      {id:aArchived,eventId:eventA,name:'Archived group',slug:'archive',archivedAt:new Date()},
      {id:bUnit,eventId:eventB,name:'Foreign group',slug:'foreign'},
    ]);
    await db.insert(commandDefconStates).values([
      {eventId:eventA,level:3,reason:'EXCON private note'},
      {eventId:eventB,level:1,reason:'OTHER EVENT PRIVATE'},
    ]);
    const phaseA=generateId();
    const scenarioTime=new Date('2047-05-01T12:00:00Z');
    await db.insert(scenarioClocks).values([
      {eventId:eventA,mode:'SCENARIO_TIME',scenarioBaseTime:scenarioTime,realBaseTime:new Date(),pausedAt:new Date(),pausedScenarioTime:scenarioTime},
      {eventId:eventB,mode:'SCENARIO_TIME',scenarioBaseTime:new Date('2099-01-01T00:00:00Z'),realBaseTime:new Date()},
    ]);
    await db.insert(scenarioPhases).values([
      {id:phaseA,eventId:eventA,code:'PH-02',title:'Escalation',sequence:2,status:'ACTIVE'},
      {eventId:eventA,code:'PH-01',title:'Opening',sequence:1,status:'COMPLETED'},
      {eventId:eventB,code:'SECRET-PHASE',title:'Other event phase',status:'ACTIVE'},
    ]);
    const injectRows=['READY','BLOCKED','SCHEDULED','RELEASED','DRAFT'].map((status,i)=>({
      id:generateId(),eventId:eventA,injectNumber:'INJ-'+i,
      title:'Alpha inject '+i,controllerSummary:'Private EXCON description '+i,
      status,phaseId:phaseA,scheduledAt:status==='SCHEDULED'?new Date(Date.now()+3600000):null,
    }));
    await db.insert(scenarioInjects).values([...injectRows,
      {eventId:eventB,injectNumber:'SECRET',title:'DO NOT LEAK',controllerSummary:'FOREIGN PRIVATE',status:'READY'},
    ]);
    const releaseId=generateId();
    await db.insert(scenarioInjectReleases).values({
      id:releaseId,eventId:eventA,injectId:injectRows[3]!.id,participantTitle:'Simulated alert',
      audienceSnapshot:{kind:'EVENT'},actionsSnapshot:[],
    });
    await db.insert(scenarioBriefingReceipts).values([
      {releaseId,userId:organizer,readAt:new Date(),acknowledgedAt:new Date()},
      {releaseId,userId:participant},
    ]);
    const planned=new Date(Date.now()+25*60_000);
    await db.insert(exerciseBroadcastPlans).values([
      {id:generateId(),eventId:eventA,createdByUserId:organizer,kind:'INFO',audience:'ALL',title:'Alpha draft',message:'Draft not yet sent',status:'DRAFT'},
      {id:generateId(),eventId:eventA,createdByUserId:organizer,kind:'UPDATE',audience:'UNIT',unitId:aUnit,title:'Alpha planned',message:'Send to Blue SOC',status:'SCHEDULED',scheduledAt:planned},
      {id:generateId(),eventId:eventA,createdByUserId:organizer,kind:'URGENT',audience:'ALL',title:'Failed alert',message:'No recipients at run time',status:'FAILED',failureCode:'NO_RECIPIENTS'},
      {id:generateId(),eventId:eventA,createdByUserId:organizer,kind:'INFO',audience:'ALL',title:'Sent notice',message:'Delivered',status:'SENT',sentAt:new Date(),deliveredCount:2},
      {id:generateId(),eventId:eventB,createdByUserId:outsider,kind:'INFO',audience:'ALL',title:'FOREIGN NOTICE',message:'FOREIGN CONTENT',status:'SCHEDULED',scheduledAt:planned},
    ]);
    await db.insert(notifications).values([
      {userId:organizer,eventId:eventA,type:'EXERCISE_URGENT',severity:'URGENT',templateKey:'exercise.broadcast',
        templateParams:{title:'Alpha important',kind:'URGENT'},sourceEventId:'exercise.broadcast:'+generateId(),readAt:new Date()},
      {userId:participant,eventId:eventA,type:'EXERCISE_URGENT',severity:'URGENT',templateKey:'exercise.broadcast',
        templateParams:{title:'Alpha important',kind:'URGENT'},sourceEventId:'exercise.broadcast:'+generateId()},
      {userId:outsider,eventId:eventB,type:'EXERCISE_URGENT',severity:'URGENT',templateKey:'exercise.broadcast',
        templateParams:{title:'FOREIGN NOTICE',kind:'URGENT'},sourceEventId:'exercise.broadcast:'+generateId()},
    ]);
    await db.insert(operationalHolds).values([
      {eventId:eventA,targetType:'EVENT',module:'scenario',reason:'EXCON hold',startsAt:new Date(Date.now()-60000),createdByUserId:organizer},
      {eventId:eventA,targetType:'EVENT',module:'ALL',reason:'Expired',startsAt:new Date(Date.now()-100000),expiresAt:new Date(Date.now()-50000),createdByUserId:organizer},
      {eventId:eventB,targetType:'EVENT',module:'ALL',reason:'Foreign hold',startsAt:new Date(Date.now()-60000),createdByUserId:outsider},
    ]);
    await assert.rejects(service.overview(eventA,actor(participant)),ForbiddenException);
    await assert.rejects(service.overview(eventA,actor(outsider)),ForbiddenException);
    await assert.rejects(service.overview(eventA,actor(organizer,'DISABLED')),ForbiddenException);
    const dashboard=ExconDashboardResponseSchema.parse(await service.overview(eventA,actor(organizer)));
    assert.equal(dashboard.event.name,'EXCON Alpha');
    assert.equal(dashboard.event.status,'ACTIVE');
    assert.equal(dashboard.event.timezone,'Europe/Prague');
    assert.equal(dashboard.defcon.level,3);
    assert.equal(dashboard.activePhase?.title,'Escalation');
    assert.deepEqual(dashboard.phases,{total:2,completed:1});
    assert.deepEqual(dashboard.scenarioClock,{mode:'SCENARIO_TIME',scenarioTime:scenarioTime.toISOString(),paused:true,speedMultiplier:1});
    assert.deepEqual(dashboard.phaseTimeline.map(p=>p.code),['PH-01','PH-02']);
    assert.equal(dashboard.phaseTimeline[1]?.status,'ACTIVE');
    assert.deepEqual(dashboard.injects,{total:5,ready:1,blocked:1,scheduled:1,released:1,draft:1});
    assert.equal(dashboard.upcomingInjects.length,3);
    assert.equal(dashboard.upcomingInjects[0]?.status,'READY');
    assert.deepEqual(dashboard.broadcasts,{draft:1,scheduled:1,failed:1,sent:1});
    assert.equal(dashboard.upcomingBroadcasts.length,1);
    assert.equal(dashboard.upcomingBroadcasts[0]?.unitName,'Blue SOC');
    assert.equal(dashboard.participation.activeUsers,2);
    assert.equal(dashboard.participation.activeTeams,1);
    assert.equal(dashboard.participation.briefingReceipts,2);
    assert.equal(dashboard.participation.briefingsRead,1);
    assert.equal(dashboard.participation.briefingsAcknowledged,1);
    assert.equal(dashboard.participation.broadcastReceipts,2);
    assert.equal(dashboard.participation.broadcastsRead,1);
    assert.equal(dashboard.participation.urgentUnread,1);
    assert.equal(dashboard.holds.active,1);
    assert.deepEqual(dashboard.holds.modules,['scenario']);
    assert.equal(dashboard.recentBroadcasts.length,2);
    const dumped=JSON.stringify(dashboard);
    for(const forbidden of ['DO NOT LEAK','FOREIGN NOTICE','FOREIGN CONTENT','OTHER EVENT PRIVATE','SECRET-PHASE']){
      assert.equal(dumped.includes(forbidden),false,forbidden);
    }
    await db.delete(scenarioClocks).where(eq(scenarioClocks.eventId,eventA));
    const fallback=await service.overview(eventA,actor(organizer));
    assert.equal(fallback.scenarioClock.mode,'REAL_TIME');
    assert.equal(fallback.scenarioClock.scenarioTime,fallback.asOf);
    assert.equal(fallback.scenarioClock.paused,false);
    // Revoking the organizer role or event membership must immediately revoke dashboard access.
    await db.update(eventMemberships).set({status:'INACTIVE'}).where(eq(eventMemberships.id,membershipRows[0]!.id));
    await assert.rejects(service.overview(eventA,actor(organizer)),ForbiddenException);
  }finally{
    await closeDatabaseConnection();
  }
});
