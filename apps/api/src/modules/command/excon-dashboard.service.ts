import { Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, count, desc, eq, gt, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import {
  events, commandDefconStates, scenarioPhases, scenarioInjects,
  exerciseBroadcastPlans, organizationalUnits, eventMemberships, users,
  scenarioBriefingReceipts, scenarioInjectReleases, notifications, operationalHolds, scenarioClocks, calculateScenarioTime,
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import type { AuthenticatedUser } from '../auth/session.service.js';
import type { ExconDashboardResponse } from '@cyris/contracts';

type StatusRow = {status:string; n:number};
/** Safely convert zero-or-more grouped database rows into an explicit counter. */
export function statusCounter(rows:StatusRow[],status:string):number {
  return rows.find(row=>row.status===status)?.n??0;
}

@Injectable()
export class ExconDashboardService {
  constructor(private readonly database:DatabaseService,private readonly authz:AuthorizationService) {}

  async overview(eventId:string,actor:AuthenticatedUser):Promise<ExconDashboardResponse> {
    // Explicit organizer permission is essential: scenario drafts and future
    // inject titles must never leak to ordinary participants.
    await this.authz.assertAuthorized({
      user:actor,permission:Permissions.SCENARIO_MANAGE,context:{eventId},
    });
    const db=this.database.client;
    const now=new Date();
    const [event]=await db.select({
      id:events.id,name:events.name,status:events.status,timezone:events.defaultTimezone,
    }).from(events).where(eq(events.id,eventId)).limit(1);
    if(!event)throw new NotFoundException('Exercise not found');

    const liveHold=and(eq(operationalHolds.eventId,eventId),
      eq(operationalHolds.targetType,'EVENT'),isNull(operationalHolds.restoredAt),
      lte(operationalHolds.startsAt,now),
      or(isNull(operationalHolds.expiresAt),gt(operationalHolds.expiresAt,now)));
    const [
      defconRows, phaseRows, injectRows, planRows, nextInjectRows,
      nextPlanRows, memberRows, teamRows, briefingRows, messageRows,
      recentMessageRows, holdRows, clockRows,
    ]=await Promise.all([
      db.select({level:commandDefconStates.level,updatedAt:commandDefconStates.updatedAt})
        .from(commandDefconStates).where(eq(commandDefconStates.eventId,eventId)).limit(1),
      db.select({id:scenarioPhases.id,code:scenarioPhases.code,title:scenarioPhases.title,status:scenarioPhases.status,sequence:scenarioPhases.sequence,plannedStartAt:scenarioPhases.plannedStartAt,plannedEndAt:scenarioPhases.plannedEndAt})
        .from(scenarioPhases).where(eq(scenarioPhases.eventId,eventId)).orderBy(asc(scenarioPhases.sequence),asc(scenarioPhases.id)),
      db.select({status:scenarioInjects.status,n:count()})
        .from(scenarioInjects).where(eq(scenarioInjects.eventId,eventId)).groupBy(scenarioInjects.status),
      db.select({status:exerciseBroadcastPlans.status,n:count()})
        .from(exerciseBroadcastPlans).where(eq(exerciseBroadcastPlans.eventId,eventId)).groupBy(exerciseBroadcastPlans.status),
      db.select({id:scenarioInjects.id,number:scenarioInjects.injectNumber,title:scenarioInjects.title,
        status:scenarioInjects.status,priority:scenarioInjects.priority,scheduledAt:scenarioInjects.scheduledAt})
        .from(scenarioInjects).where(and(eq(scenarioInjects.eventId,eventId),
          inArray(scenarioInjects.status,['READY','SCHEDULED','BLOCKED'])))
        .orderBy(sql`CASE WHEN ${scenarioInjects.status}='READY' THEN 0 WHEN ${scenarioInjects.status}='SCHEDULED' THEN 1 ELSE 2 END`,
          asc(scenarioInjects.scheduledAt),asc(scenarioInjects.injectNumber)).limit(8),
      db.select({id:exerciseBroadcastPlans.id,title:exerciseBroadcastPlans.title,kind:exerciseBroadcastPlans.kind,
        scheduledAt:exerciseBroadcastPlans.scheduledAt,audience:exerciseBroadcastPlans.audience,
        unitName:organizationalUnits.name})
        .from(exerciseBroadcastPlans)
        .leftJoin(organizationalUnits,eq(organizationalUnits.id,exerciseBroadcastPlans.unitId))
        .where(and(eq(exerciseBroadcastPlans.eventId,eventId),eq(exerciseBroadcastPlans.status,'SCHEDULED')))
        .orderBy(asc(exerciseBroadcastPlans.scheduledAt)).limit(8),
      db.select({n:count()}).from(eventMemberships)
        .innerJoin(users,eq(users.id,eventMemberships.userId))
        .where(and(eq(eventMemberships.eventId,eventId),eq(eventMemberships.status,'ACTIVE'),eq(users.status,'ACTIVE'))),
      db.select({n:count()}).from(organizationalUnits)
        .where(and(eq(organizationalUnits.eventId,eventId),isNull(organizationalUnits.archivedAt))),
      db.select({
        total:count(),
        read:sql<number>`count(${scenarioBriefingReceipts.readAt})::int`,
        acknowledged:sql<number>`count(${scenarioBriefingReceipts.acknowledgedAt})::int`,
      }).from(scenarioBriefingReceipts)
        .innerJoin(scenarioInjectReleases,eq(scenarioInjectReleases.id,scenarioBriefingReceipts.releaseId))
        .where(eq(scenarioInjectReleases.eventId,eventId)),
      db.select({
        total:count(),read:sql<number>`count(${notifications.readAt})::int`,
        urgentUnread:sql<number>`count(*) FILTER (WHERE ${notifications.severity}='URGENT' AND ${notifications.readAt} IS NULL)::int`,
      }).from(notifications).where(and(eq(notifications.eventId,eventId),
        eq(notifications.templateKey,'exercise.broadcast'))),
      db.select({
        id:notifications.sourceEventId,
        title:sql<string>`max(${notifications.templateParams}->>'title')`,
        kind:sql<string>`max(${notifications.templateParams}->>'kind')`,
        delivered:count(),
        read:sql<number>`count(${notifications.readAt})::int`,
        sentAt:sql<Date>`max(${notifications.createdAt})`,
      }).from(notifications).where(and(eq(notifications.eventId,eventId),
        eq(notifications.templateKey,'exercise.broadcast')))
        .groupBy(notifications.sourceEventId)
        .orderBy(desc(sql`max(${notifications.createdAt})`)).limit(6),
      db.select({id:operationalHolds.id,module:operationalHolds.module})
        .from(operationalHolds).where(liveHold),
      db.select().from(scenarioClocks).where(eq(scenarioClocks.eventId,eventId)).limit(1),
    ]);

    const clock=clockRows[0];
    const activePhase=phaseRows.find(row=>row.status==='ACTIVE')??null;
    const injectN=(status:string)=>statusCounter(injectRows,status);
    const planN=(status:string)=>statusCounter(planRows,status);
    return {
      asOf:now.toISOString(),event,
      defcon:{level:defconRows[0]?.level??null,updatedAt:defconRows[0]?.updatedAt?.toISOString()??null},
      activePhase:activePhase&&{id:activePhase.id,code:activePhase.code,title:activePhase.title},
      phases:{total:phaseRows.length,completed:phaseRows.filter(row=>row.status==='COMPLETED').length},
      scenarioClock:{mode:clock?.mode??'REAL_TIME',scenarioTime:calculateScenarioTime(clock,now).toISOString(),paused:Boolean(clock?.pausedAt||clock?.pausedScenarioTime),speedMultiplier:clock?.speedMultiplier??1},
      phaseTimeline:phaseRows.map(row=>({...row,plannedStartAt:row.plannedStartAt?.toISOString()??null,plannedEndAt:row.plannedEndAt?.toISOString()??null})),
      injects:{
        total:injectRows.reduce((n,row)=>n+row.n,0),ready:injectN('READY'),
        blocked:injectN('BLOCKED'),scheduled:injectN('SCHEDULED'),
        released:injectN('RELEASED'),draft:injectN('DRAFT'),
      },
      upcomingInjects:nextInjectRows.map(item=>({...item,scheduledAt:item.scheduledAt?.toISOString()??null})),
      broadcasts:{draft:planN('DRAFT'),scheduled:planN('SCHEDULED'),failed:planN('FAILED'),sent:planN('SENT')},
      upcomingBroadcasts:nextPlanRows.map(item=>({
        ...item,scheduledAt:item.scheduledAt!.toISOString(),
      })),
      recentBroadcasts:recentMessageRows.map(item=>({
        id:item.id??'',title:item.title,kind:item.kind,
        delivered:item.delivered,read:item.read,
        sentAt:new Date(item.sentAt).toISOString(),
      })),
      participation:{
        activeUsers:memberRows[0]?.n??0,activeTeams:teamRows[0]?.n??0,
        briefingReceipts:briefingRows[0]?.total??0,
        briefingsRead:briefingRows[0]?.read??0,briefingsAcknowledged:briefingRows[0]?.acknowledged??0,
        broadcastReceipts:messageRows[0]?.total??0,
        broadcastsRead:messageRows[0]?.read??0,urgentUnread:messageRows[0]?.urgentUnread??0,
      },
      holds:{active:holdRows.length,modules:[...new Set(holdRows.map(row=>row.module))].sort()},
    };
  }
}
