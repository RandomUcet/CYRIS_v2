import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import {
  events, eventMemberships, resources, courtCases, medicalEncounters, operationalTasks,
  supportRequests, auditEvents, courtRequests, activityEvents,
} from '@cyris/db';
import { Permissions } from '@cyris/shared';
import type { EventAfterActionReport, EventPurgePreview } from '@cyris/contracts';
import { mergeActivityDays, previewResourceSelection } from './event-report-utils.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { DatabaseService } from '../database/database.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';

function grouped(rows: readonly { key: string; count: number }[]): Record<string, number> {
  return Object.fromEntries(rows.map(row => [row.key, Number(row.count)]));
}
@Injectable()
export class EventAfterActionService {
  constructor(private readonly database: DatabaseService, private readonly authz: AuthorizationService) {}
  private get db() { return this.database.client; }
  private async getForAdmin(eventId: string, actor: AuthenticatedUser) {
    await this.authz.assertAuthorized({ user: actor, permission: Permissions.PLATFORM_MANAGE });
    const [event] = await this.db.select().from(events).where(eq(events.id, eventId)).limit(1);
    if (!event) throw new NotFoundException('Exercise not found');
    return event;
  }
  async report(eventId: string, actor: AuthenticatedUser): Promise<EventAfterActionReport> {
    const event = await this.getForAdmin(eventId, actor);
    // All time buckets are UTC; never infer a device timezone from request headers.
    const utcAuditDay = sql<string>`to_char(${auditEvents.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    const utcOperationsDay = sql<string>`to_char(${activityEvents.occurredAt} AT TIME ZONE 'UTC', 'YYYY-MM-DD')`;
    const [membership, resourceTypes, caseStatuses, medicalStatuses, taskStatuses,
      supportStatuses, requestStatuses, auditCategories, auditOutcomeRows,
      auditDailyRows, operationalDailyRows, operatorRows] = await Promise.all([
      this.db.select({ count: sql<number>`count(*)::integer` }).from(eventMemberships)
        .where(eq(eventMemberships.eventId,eventId)),
      this.db.select({ key: resources.resourceType, count: sql<number>`count(*)::integer` }).from(resources)
        .where(eq(resources.eventId,eventId)).groupBy(resources.resourceType),
      this.db.select({ key: courtCases.status, count: sql<number>`count(*)::integer` }).from(courtCases)
        .where(eq(courtCases.eventId,eventId)).groupBy(courtCases.status),
      this.db.select({ key: medicalEncounters.status, count: sql<number>`count(*)::integer` }).from(medicalEncounters)
        .where(eq(medicalEncounters.eventId,eventId)).groupBy(medicalEncounters.status),
      this.db.select({ key: operationalTasks.status, count: sql<number>`count(*)::integer` }).from(operationalTasks)
        .where(eq(operationalTasks.eventId,eventId)).groupBy(operationalTasks.status),
      this.db.select({ key: supportRequests.status, count: sql<number>`count(*)::integer` }).from(supportRequests)
        .where(eq(supportRequests.eventId,eventId)).groupBy(supportRequests.status),
      this.db.select({ key: courtRequests.status, count: sql<number>`count(*)::integer` }).from(courtRequests)
        .where(eq(courtRequests.eventId,eventId)).groupBy(courtRequests.status),
      this.db.select({ key: auditEvents.category, count: sql<number>`count(*)::integer` }).from(auditEvents)
        .where(eq(auditEvents.eventId,eventId)).groupBy(auditEvents.category),
      this.db.select({ key: auditEvents.outcome, count: sql<number>`count(*)::integer` }).from(auditEvents)
        .where(eq(auditEvents.eventId,eventId)).groupBy(auditEvents.outcome),
      this.db.select({
        day: utcAuditDay,
        auditEvents: sql<number>`count(*)::integer`,
        denied: sql<number>`count(*) FILTER (WHERE ${auditEvents.outcome} = 'DENIED')::integer`,
        failures: sql<number>`count(*) FILTER (WHERE ${auditEvents.outcome} = 'FAILURE')::integer`,
      }).from(auditEvents).where(eq(auditEvents.eventId,eventId)).groupBy(utcAuditDay),
      this.db.select({
        day: utcOperationsDay, operationalEvents: sql<number>`count(*)::integer`,
      }).from(activityEvents).where(eq(activityEvents.eventId,eventId)).groupBy(utcOperationsDay),
      this.db.select({ activeAuditOperators: sql<number>`count(DISTINCT ${auditEvents.actorUserId})::integer` })
        .from(auditEvents).where(eq(auditEvents.eventId,eventId)),
    ]);
    const categories = grouped(auditCategories);
    return {
      eventId, eventName: event.name, status: event.status, generatedAt: new Date().toISOString(),
      startsAt: event.startsAt?.toISOString() ?? null, endsAt: event.endsAt?.toISOString() ?? null,
      membershipCount: Number(membership[0]?.count ?? 0),
      resources: grouped(resourceTypes), courtStatus: grouped(caseStatuses),
      medicalStatus: grouped(medicalStatuses), taskStatus: grouped(taskStatuses),
      supportStatus: grouped(supportStatuses), legalRequests: grouped(requestStatuses),
      auditCategories: categories,
      auditEvents: Object.values(categories).reduce((sum, value) => sum + value, 0),
      auditOutcomes: grouped(auditOutcomeRows),
      activeAuditOperators: Number(operatorRows[0]?.activeAuditOperators ?? 0),
      operationalEvents: operationalDailyRows.reduce((sum,row)=>sum + Number(row.operationalEvents),0),
      dailyActivity: mergeActivityDays(
        auditDailyRows.map(row=>({
          day:row.day, auditEvents:Number(row.auditEvents),
          denied:Number(row.denied), failures:Number(row.failures),
        })),
        operationalDailyRows.map(row=>({
          day:row.day, operationalEvents:Number(row.operationalEvents),
        })),
      ),
    };
  }
  async purgePreview(eventId: string, actor: AuthenticatedUser, selectedResourceTypes?: string[]): Promise<EventPurgePreview> {
    const report = await this.report(eventId, actor);
    const current = await this.getForAdmin(eventId, actor);
    let selection: ReturnType<typeof previewResourceSelection>;
    try {
      selection = previewResourceSelection(report.resources, selectedResourceTypes);
    } catch {
      throw new BadRequestException('Requested resource category does not exist in this event');
    }
    // Event-wide relational inventory, distinct from selected resource counts.
    // Candidate counts are preliminary; the host plan checks all FK dependencies again.
    const [inventory]=await this.db.select({
      relationships:sql<number>`(select count(*)::integer from resource_relationships where event_id=${eventId}::uuid)`,
      assignments:sql<number>`(select count(*)::integer from resource_assignments where event_id=${eventId}::uuid)`,
      grants:sql<number>`(select count(*)::integer from resource_access_control a join resources r on r.id=a.resource_id where r.event_id=${eventId}::uuid)`,
      notifications:sql<number>`(select count(*)::integer from notifications where event_id=${eventId}::uuid)`,
      units:sql<number>`(select count(*)::integer from organizational_units where event_id=${eventId}::uuid)`,
      roles:sql<number>`(select count(*)::integer from roles where event_id=${eventId}::uuid)`,
      notificationHistory:sql<number>`(select count(*)::integer from notifications where event_id=${eventId}::uuid and (read_at is not null or dismissed_at is not null))`,
      terminalManualTasks:sql<number>`(select count(*)::integer from resources r join operational_tasks t on t.id=r.id
        where r.event_id=${eventId}::uuid and t.event_id=r.event_id and r.resource_type='operational_task'
        and t.status in ('COMPLETED','CANCELLED') and t.source_type='MANUAL' and t.source_resource_id is null
        and not exists(select 1 from resource_relationships x where x.source_resource_id=r.id or x.target_resource_id=r.id)
        and not exists(select 1 from operational_tasks x where x.source_resource_id=r.id))`,
    }).from(events).where(eq(events.id,eventId));
    return {
      eventId, eventName: report.eventName, status: report.status,
      generatedAt: new Date().toISOString(), executable: false,
      retention:{
        eventSlug:current.slug,execution:'HOST_ONLY',
        notificationHistory:Number(inventory?.notificationHistory??0),
        terminalManualTasks:Number(inventory?.terminalManualTasks??0),
        inventory:{
          resources:Object.values(report.resources).reduce((sum,n)=>sum+n,0),
          relationships:Number(inventory?.relationships??0),assignments:Number(inventory?.assignments??0),
          accessGrants:Number(inventory?.grants??0),notifications:Number(inventory?.notifications??0),
          activity:report.operationalEvents,audit:report.auditEvents,memberships:report.membershipCount,
          units:Number(inventory?.units??0),roles:Number(inventory?.roles??0),
        },
      },
      profiles: {
        exerciseDataOnly: {
          description: 'Simulation records only: never implicitly delete users, event membership, role assignments or audit trail.',
          counts: selection.directlyCounted,
        },
        wholeEvent: {
          description: 'All event-linked records, assignments, files and object store references. Must use verified encrypted backup and staged inventory.',
          counts: { ...report.resources, eventMemberships: report.membershipCount, auditEvents: report.auditEvents },
        },
      },
      selection: {
        resourceTypes: selection.resourceTypes, matchingResources: selection.matchingResources,
        unselectedResources: selection.unselectedResources,
        inventoryCoverage: 'DATABASE_RESOURCES_ONLY',
      },
      blockers: [
        'Inventory includes directly counted database resources only; it is NOT a verified dependency graph or an executable deletion plan.',
        ...(current.status === 'ACTIVE' ? ['Active exercises must be closed and archived before any cleanup.'] : []),
        'An authenticated, verified off-host encrypted backup is required before irreversible cleanup.',
        'Object storage and external integration artifacts must be inventoried and removed safely.',
        'Retention and export of immutable audit evidence require an explicit policy.',
        'Complete event deletion and arbitrary resource deletion remain disabled; bounded host cleanup has a separate dependency and recovery preflight.',
      ],
    };
  }
}
