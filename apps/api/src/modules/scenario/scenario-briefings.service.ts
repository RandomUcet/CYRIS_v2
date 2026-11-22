import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, or, sql } from 'drizzle-orm';
import {
  scenarioDeliveries, scenarioInjectReleases, scenarioInjects, scenarioBriefingReceipts,
  eventMemberships, membershipUnitAssignments, resources, activityEvents,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type { ParticipantBriefing, ParticipantBriefingsListResponse } from '@cyris/contracts';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';

@Injectable()
export class ScenarioBriefingsService {
  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly resourceAccessService: ResourceAccessService,
    private readonly authorizationService: AuthorizationService,
  ) {}
  private get db() { return this.databaseService.client; }

  private async audienceFilter(eventId: string, user: AuthenticatedUser) {
    // The permissions guard admits platform administrators without an event membership.
    // Apply the same policy here; otherwise their Briefings page always fails with 403.
    if (await this.authorizationService.authorize({ user, permission: Permissions.PLATFORM_MANAGE })) {
      return undefined;
    }
    const [membership] = await this.db.select({ id: eventMemberships.id }).from(eventMemberships)
      .where(and(eq(eventMemberships.eventId, eventId), eq(eventMemberships.userId, user.id), eq(eventMemberships.status, 'ACTIVE'))).limit(1);
    if (!membership) throw new ForbiddenException('Active participation in this exercise is required');
    const assignments = await this.db.select({ unitId: membershipUnitAssignments.unitId }).from(membershipUnitAssignments)
      .where(eq(membershipUnitAssignments.membershipId, membership.id));
    return or(
      eq(scenarioDeliveries.recipientUserId, user.id),
      and(isNull(scenarioDeliveries.recipientUserId), isNull(scenarioDeliveries.targetUnitId)),
      assignments.length ? and(isNull(scenarioDeliveries.recipientUserId), inArray(scenarioDeliveries.targetUnitId, assignments.map(a => a.unitId))) : undefined,
    );
  }

  async getBriefingsForUser(eventId: string, user: AuthenticatedUser): Promise<ParticipantBriefingsListResponse> {
    const audience = await this.audienceFilter(eventId, user);
    const rows = await this.db.select({ delivery: scenarioDeliveries, release: scenarioInjectReleases,
      injectNumber: scenarioInjects.injectNumber, requiresAck: scenarioInjects.requiresAcknowledgement,
      receipt: scenarioBriefingReceipts,
    }).from(scenarioDeliveries)
      .innerJoin(scenarioInjectReleases, eq(scenarioInjectReleases.id, scenarioDeliveries.releaseId))
      .innerJoin(scenarioInjects, eq(scenarioInjects.id, scenarioDeliveries.injectId))
      .leftJoin(scenarioBriefingReceipts, and(eq(scenarioBriefingReceipts.releaseId, scenarioDeliveries.releaseId), eq(scenarioBriefingReceipts.userId, user.id)))
      .where(and(eq(scenarioDeliveries.eventId, eventId), eq(scenarioInjectReleases.eventId, eventId), eq(scenarioInjects.eventId, eventId), audience))
      .orderBy(desc(scenarioDeliveries.deliveredAt));
    // Prefer localized direct deliveries over overlapping legacy broadcasts.
    rows.sort((a, b) => b.delivery.deliveredAt.getTime() - a.delivery.deliveredAt.getTime() || Number(Boolean(b.delivery.recipientUserId)) - Number(Boolean(a.delivery.recipientUserId)));
    const seen = new Set<string>();
    const newBriefings: ParticipantBriefing[] = [];
    const earlierBriefings: ParticipantBriefing[] = [];
    for (const row of rows) {
      if (seen.has(row.release.id)) continue;
      seen.add(row.release.id);
      const disclosedResources: ParticipantBriefing['disclosedResources'] = [];
      const actions = Array.isArray(row.release.actionsSnapshot) ? row.release.actionsSnapshot as Array<{ resourceId?: string }> : [];
      for (const action of actions) {
        if (!action.resourceId) continue;
        const [resource] = await this.db.select({ id: resources.id, resourceType: resources.resourceType }).from(resources)
          .where(and(eq(resources.id, action.resourceId), eq(resources.eventId, eventId))).limit(1);
        if (resource && await this.resourceAccessService.canAccessResource(user, resource.id, Permissions.REGISTRY_READ)) {
          disclosedResources.push({ resourceId: resource.id, resourceType: resource.resourceType });
        }
      }
      const item: ParticipantBriefing = {
        deliveryId: row.delivery.id, eventId, injectNumber: row.injectNumber,
        title: row.delivery.participantTitle ?? row.release.participantTitle,
        content: row.delivery.participantContent ?? row.release.participantContent,
        locale: row.delivery.locale, deliveredAt: row.delivery.deliveredAt.toISOString(),
        readAt: row.receipt?.readAt?.toISOString() ?? null,
        acknowledgedAt: row.receipt?.acknowledgedAt?.toISOString() ?? null,
        requiresAcknowledgement: row.requiresAck, disclosedResources,
      };
      (item.readAt ? earlierBriefings : newBriefings).push(item);
    }
    return { unreadCount: newBriefings.length,
      pendingAcknowledgementCount: [...newBriefings, ...earlierBriefings].filter(b => b.requiresAcknowledgement && !b.acknowledgedAt).length,
      newBriefings, earlierBriefings };
  }

  private async visibleDelivery(eventId: string, deliveryId: string, user: AuthenticatedUser) {
    const audience = await this.audienceFilter(eventId, user);
    const [delivery] = await this.db.select({ id: scenarioDeliveries.id, releaseId: scenarioDeliveries.releaseId, injectNumber: scenarioInjects.injectNumber })
      .from(scenarioDeliveries).innerJoin(scenarioInjects, eq(scenarioInjects.id, scenarioDeliveries.injectId))
      .where(and(eq(scenarioDeliveries.id, deliveryId), eq(scenarioDeliveries.eventId, eventId), eq(scenarioInjects.eventId, eventId), audience)).limit(1);
    if (!delivery) throw new NotFoundException('Briefing delivery is not available to this participant');
    return delivery;
  }

  async markAsRead(eventId: string, deliveryId: string, user: AuthenticatedUser): Promise<void> {
    const delivery = await this.visibleDelivery(eventId, deliveryId, user);
    const now = new Date();
    await this.db.insert(scenarioBriefingReceipts).values({ id: generateId(), releaseId: delivery.releaseId, userId: user.id, readAt: now })
      .onConflictDoUpdate({ target: [scenarioBriefingReceipts.releaseId, scenarioBriefingReceipts.userId],
        set: { readAt: sql`COALESCE(${scenarioBriefingReceipts.readAt}, ${now.toISOString()}::timestamptz)` } });
  }

  async acknowledgeBriefing(eventId: string, deliveryId: string, user: AuthenticatedUser): Promise<void> {
    const delivery = await this.visibleDelivery(eventId, deliveryId, user);
    const now = new Date();
    await this.db.transaction(async tx => {
      const changed = await tx.insert(scenarioBriefingReceipts).values({ id: generateId(), releaseId: delivery.releaseId, userId: user.id, readAt: now, acknowledgedAt: now })
        .onConflictDoUpdate({ target: [scenarioBriefingReceipts.releaseId, scenarioBriefingReceipts.userId],
          set: { readAt: sql`COALESCE(${scenarioBriefingReceipts.readAt}, ${now.toISOString()}::timestamptz)`, acknowledgedAt: now },
          setWhere: isNull(scenarioBriefingReceipts.acknowledgedAt) }).returning({ id: scenarioBriefingReceipts.id });
      if (!changed.length) return;
      await this.auditService.record({ action: 'briefing.acknowledged', category: 'scenario', eventId,
        resourceType: 'briefing_delivery', resourceId: deliveryId, actorUserId: user.id,
        metadata: { injectNumber: delivery.injectNumber }, txClient: tx });
      await tx.insert(activityEvents).values({ eventId, activityType: 'briefing.acknowledged',
        title: `Briefing Acknowledged: ${delivery.injectNumber}`, actorUserId: user.id, visibility: 'SCENARIO', occurredAt: now });
    });
  }
}
