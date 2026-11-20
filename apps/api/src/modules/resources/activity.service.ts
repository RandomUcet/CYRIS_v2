import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { eq, and, desc, or, sql, gte, lte, inArray, getTableColumns, type SQL } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { activityEvents, ActivityVisibility, type ActivityVisibilityValue, resources, resourceAccessControl, resourceAssignments, eventMemberships, membershipUnitAssignments, organizationalUnits } from '@cyris/db';
import { generateId, Permissions, type PermissionKey } from '@cyris/shared';
import type { ActivityEventItem, TimelineResponse, TimelineQueryFilters } from '@cyris/contracts';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { ResourceAccessService } from './resource-access.service.js';
import { canReadActivity, type ActivityReader, type ActivityResource } from './activity-visibility.js';

export interface RecordActivityParams {
  eventId: string;
  resourceId?: string | null;
  activityType: string;
  actorUserId?: string | null;
  title: string;
  summary?: string | null;
  reason?: string | null;
  source?: string | null;
  causationId?: string | null;
  requestId?: string | null;
  relatedResourceIds?: string[] | null;
  metadata?: Record<string, unknown>;
  visibility?: ActivityVisibilityValue;
}

export interface ActivityFeedFilter extends TimelineQueryFilters {
  eventId: string;
  resourceId?: string;
  limit?: number;
  offset?: number;
  relatedToResourceId?: string;
  resourceIds?: string[];
  causationId?: string;
}

import { serviceModuleForAction } from '../disruptions/module-resources.js';
import { requestModuleImpacts } from '../disruptions/request-impacts.js';

@Injectable()
export class ActivityService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly authzService: AuthorizationService,
    private readonly resourceAccessService: ResourceAccessService,
  ) {}

  /**
   * Records an operational activity event for event timelines.
   * Can run either standalone or inside a caller's transaction.
   */
  async recordActivity(
    params: RecordActivityParams,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    txClient?: any
  ): Promise<ActivityEventItem> {
    const db = txClient || this.databaseService.client;

    const [created] = await db
      .insert(activityEvents)
      .values({
        id: generateId(),
        eventId: params.eventId,
        resourceId: params.resourceId ?? null,
        activityType: params.activityType,
        actorUserId: params.actorUserId ?? null,
        title: params.title,
        summary: params.summary ?? null,
        reason: params.reason ?? null,
        source: params.source ?? null,
        causationId: params.causationId ?? null,
        requestId: params.requestId ?? null,
        relatedResourceIds: params.relatedResourceIds ?? null,
        metadata: params.metadata ?? null,
        visibility: params.visibility ?? ActivityVisibility.EVENT,
      })
      .returning();

    return {
      id: created!.id,
      eventId: created!.eventId,
      resourceId: created!.resourceId,
      activityType: created!.activityType,
      actorUserId: created!.actorUserId,
      occurredAt: created!.occurredAt.toISOString(),
      title: created!.title,
      summary: created!.summary,
      reason: created!.reason,
      source: created!.source,
      causationId: created!.causationId,
      requestId: created!.requestId,
      relatedResourceIds: (created!.relatedResourceIds as string[]) || null,
      metadata: (created!.metadata as Record<string, unknown>) || null,
      visibility: created!.visibility as ActivityVisibilityValue,
    };
  }

  /** Resolves current membership and permissions once per request, never globally. */
  async createAccessReader(eventId: string, user: AuthenticatedUser): Promise<(row: typeof activityEvents.$inferSelect) => Promise<boolean>> {
    if (!user || user.status !== 'ACTIVE') throw new ForbiddenException('Timeline access denied');
    const platformAdmin = await this.authzService.authorize({ user, permission: Permissions.PLATFORM_MANAGE });
    const eventTimeline = await this.authzService.authorize({ user, permission: Permissions.TIMELINE_READ, context: { eventId } });
    if (!platformAdmin && !eventTimeline && !(await this.authzService.hasEventCapability({
      user, permission: Permissions.TIMELINE_READ, eventId, resourceScopes: ['OWN', 'ASSIGNED'],
    }))) throw new ForbiddenException('Timeline access denied');

    const db = this.databaseService.client;
    const units = await db.select({ id: membershipUnitAssignments.unitId })
      .from(membershipUnitAssignments)
      .innerJoin(eventMemberships, eq(eventMemberships.id, membershipUnitAssignments.membershipId))
      .innerJoin(organizationalUnits, eq(organizationalUnits.id, membershipUnitAssignments.unitId))
      .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, user.id),
        eq(eventMemberships.status, 'ACTIVE'), eq(organizationalUnits.eventId, eventId)));
    const unitIds = units.map((unit) => unit.id);
    const permissionCache = new Map<PermissionKey, Promise<boolean>>();
    const resourceCache = new Map<string, Promise<ActivityResource | null>>();
    const resourceAccessCache = new Map<string, Promise<boolean>>();
    const hasEventPermission = (permission: PermissionKey) => {
      if (!permissionCache.has(permission)) permissionCache.set(permission,
        this.authzService.authorize({ user, permission, context: { eventId } }));
      return permissionCache.get(permission)!;
    };
    const reader: ActivityReader = {
      eventId, userId: user.id, unitIds, platformAdmin, eventTimeline,
      scenarioReader: platformAdmin || await hasEventPermission(Permissions.SCENARIO_READ)
        || await hasEventPermission(Permissions.SCENARIO_SECRET_READ),
      hasEventPermission,
      canReadResource: (id, permission) => {
        const key = `${id}:${permission}`;
        if (!resourceAccessCache.has(key)) resourceAccessCache.set(key,
          this.resourceAccessService.canAccessResource(user, id, permission));
        return resourceAccessCache.get(key)!;
      },
      resource: (id) => {
        if (!resourceCache.has(id)) resourceCache.set(id, (async () => {
          const [resource] = await db.select().from(resources)
            .where(and(eq(resources.id, id), eq(resources.eventId, eventId))).limit(1);
          if (!resource) return null;
          const [grants, assignments] = await Promise.all([
            db.select().from(resourceAccessControl).where(eq(resourceAccessControl.resourceId, id)),
            db.select().from(resourceAssignments).where(and(eq(resourceAssignments.resourceId, id), eq(resourceAssignments.eventId, eventId))),
          ]);
          const explicitlyGranted = grants.some((grant) =>
            (grant.principalType === 'USER' && grant.principalId === user.id) ||
            (grant.principalType === 'UNIT' && unitIds.includes(grant.principalId))) ||
            assignments.some((assignment) => assignment.userId ? assignment.userId === user.id : Boolean(assignment.unitId && unitIds.includes(assignment.unitId)));
          return { ...resource, explicitlyGranted };
        })());
        return resourceCache.get(id)!;
      },
    };
    const impacts = platformAdmin ? new Map() : await requestModuleImpacts(db, eventId, user);
    return async (row) => {
      const module = serviceModuleForAction(row.activityType);
      if (impacts.get('timeline') === 'UNAVAILABLE' || (module && impacts.get(module) === 'UNAVAILABLE')) return false;
      return canReadActivity(row, reader);
    };
  }

  async getActivityFeed(filter: ActivityFeedFilter, user: AuthenticatedUser): Promise<ActivityEventItem[]> {
    return (await this.getTimeline(filter, user)).items;
  }

  /** Shared bounded keyset scan. Filtering occurs before a row can enter any DTO. */
  async getTimeline(filter: ActivityFeedFilter, user: AuthenticatedUser): Promise<TimelineResponse> {
    const canRead = await this.createAccessReader(filter.eventId, user);
    const limit = this.boundedInteger(filter.limit, 50, 1, 100);
    let skip = this.boundedInteger(filter.offset, 0, 0, 10000);
    const conditions: SQL[] = [eq(activityEvents.eventId, filter.eventId)];
    if (filter.resourceId) conditions.push(eq(activityEvents.resourceId, filter.resourceId));
    if (filter.relatedToResourceId) conditions.push(or(
      eq(activityEvents.resourceId, filter.relatedToResourceId),
      sql`${activityEvents.relatedResourceIds} @> ${JSON.stringify([filter.relatedToResourceId])}::jsonb`,
    )!);
    if (filter.resourceIds || filter.causationId) {
      const alternatives: SQL[] = [];
      if (filter.resourceIds?.length) alternatives.push(inArray(activityEvents.resourceId, filter.resourceIds));
      if (filter.causationId) alternatives.push(eq(activityEvents.causationId, filter.causationId));
      if (!alternatives.length) return { items: [], total: 0, nextCursor: null };
      conditions.push(or(...alternatives)!);
    }
    if (filter.type) conditions.push(eq(activityEvents.activityType, filter.type));
    if (filter.from) conditions.push(gte(activityEvents.occurredAt, this.date(filter.from)));
    if (filter.to) conditions.push(lte(activityEvents.occurredAt, this.date(filter.to)));
    if (filter.resourceType) conditions.push(sql`exists (select 1 from ${resources} where ${resources.id} = ${activityEvents.resourceId} and ${resources.eventId} = ${filter.eventId} and ${resources.resourceType} = ${filter.resourceType})`);
    if (filter.unitId) conditions.push(sql`exists (select 1 from ${resources} where ${resources.id} = ${activityEvents.resourceId} and ${resources.eventId} = ${filter.eventId} and ${resources.owningUnitId} = ${filter.unitId})`);

    let cursor = filter.cursor ? this.parseCursor(filter.cursor) : null;
    const items: ActivityEventItem[] = [];
    let scanned = 0;
    const batchSize = 100;
    while (scanned < 2000) {
      const pageConditions = [...conditions];
      if (cursor) pageConditions.push(cursor.id
        ? or(sql`${activityEvents.occurredAt} < ${cursor.at}`, and(sql`${activityEvents.occurredAt} = ${cursor.at}`, sql`${activityEvents.id} < ${cursor.id}`))!
        : sql`${activityEvents.occurredAt} < ${cursor.at}`);
      const rows = await this.databaseService.client.select({
        ...getTableColumns(activityEvents),
        cursorAt: sql<string>`to_char(${activityEvents.occurredAt} at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')`,
      }).from(activityEvents)
        .where(and(...pageConditions)).orderBy(desc(activityEvents.occurredAt), desc(activityEvents.id)).limit(batchSize);
      for (const row of rows) {
        scanned++;
        const previousCursor = cursor;
        cursor = { at: row.cursorAt, id: row.id };
        if (!(await canRead(row))) continue;
        if (skip > 0) { skip--; continue; }
        // Look ahead one permitted row, without dropping it from the next page.
        if (items.length === limit) return { items, total: items.length, nextCursor: this.encodeCursor(previousCursor!) };
        items.push(this.mapActivityRow(row));
      }
      if (rows.length < batchSize) return { items, total: items.length, nextCursor: null };
    }
    return { items, total: items.length, nextCursor: cursor ? this.encodeCursor(cursor) : null };
  }

  private boundedInteger(value: number | undefined, fallback: number, min: number, max: number): number {
    if (value === undefined) return fallback;
    if (!Number.isSafeInteger(value) || value < min || value > max) throw new BadRequestException('Invalid activity pagination');
    return value;
  }

  private date(value: string): Date {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new BadRequestException('Invalid timeline date');
    return date;
  }

  private parseCursor(value: string): { at: string; id?: string } {
    const [at, id, extra] = value.split('|');
    if (extra || (id && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id))) throw new BadRequestException('Invalid timeline cursor');
    this.date(at!);
    return { at: at!, id };
  }

  private encodeCursor(cursor: { at: string; id?: string }): string {
    return `${cursor.at}${cursor.id ? `|${cursor.id}` : ''}`;
  }

  private mapActivityRow(row: typeof activityEvents.$inferSelect): ActivityEventItem {
    return {
      id: row.id, eventId: row.eventId, resourceId: row.resourceId,
      activityType: row.activityType, actorUserId: row.actorUserId,
      occurredAt: row.occurredAt.toISOString(), title: row.title,
      summary: row.summary, reason: row.reason, source: row.source,
      causationId: row.causationId, requestId: row.requestId,
      relatedResourceIds: row.relatedResourceIds,
      metadata: row.metadata as Record<string, unknown> | null,
      visibility: row.visibility as ActivityVisibilityValue,
    };
  }
}
