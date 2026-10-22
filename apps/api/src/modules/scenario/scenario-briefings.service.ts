import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  Logger,
} from '@nestjs/common';
import { eq, and, or, inArray, desc, isNull } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ResourceAccessService } from '../resources/resource-access.service.js';
import type { AuthenticatedUser } from '../auth/session.service.js';
import {
  scenarioDeliveries,
  scenarioInjectReleases,
  scenarioInjects,
  eventMemberships,
  membershipUnitAssignments,
  resources,
  activityEvents,
  ActivityVisibility,
  MembershipStatus,
} from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import type {
  ParticipantBriefing,
  ParticipantBriefingsListResponse,
} from '@cyris/contracts';

@Injectable()
export class ScenarioBriefingsService {
  private readonly logger = new Logger(ScenarioBriefingsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly resourceAccessService: ResourceAccessService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Resolves briefings visible to the authenticated participant in this event.
   * Physically omits ALL controller-only metadata (notes, conditions, triggers, etc.).
   */
  async getBriefingsForUser(
    eventId: string,
    user: AuthenticatedUser
  ): Promise<ParticipantBriefingsListResponse> {
    // 1. Resolve User's active unit memberships in this event
    const [membership] = await this.db
      .select({ id: eventMemberships.id })
      .from(eventMemberships)
      .where(
        and(
          eq(eventMemberships.eventId, eventId),
          eq(eventMemberships.userId, user.id),
          eq(eventMemberships.status, MembershipStatus.ACTIVE)
        )
      )
      .limit(1);

    const userUnitIds: string[] = [];
    if (membership) {
      const units = await this.db
        .select({ unitId: membershipUnitAssignments.unitId })
        .from(membershipUnitAssignments)
        .where(eq(membershipUnitAssignments.membershipId, membership.id));
      for (const u of units) {
        userUnitIds.push(u.unitId);
      }
    }

    // 2. Build Audience Filter (Direct user, User's unit, or Whole Event)
    const audienceFilters = [
      eq(scenarioDeliveries.recipientUserId, user.id),
      and(isNull(scenarioDeliveries.recipientUserId), isNull(scenarioDeliveries.targetUnitId)),
    ];
    if (userUnitIds.length > 0) {
      audienceFilters.push(inArray(scenarioDeliveries.targetUnitId, userUnitIds));
    }

    const rows = await this.db
      .select({
        delivery: scenarioDeliveries,
        release: scenarioInjectReleases,
        injectNumber: scenarioInjects.injectNumber,
        requiresAck: scenarioInjects.requiresAcknowledgement,
      })
      .from(scenarioDeliveries)
      .innerJoin(scenarioInjectReleases, eq(scenarioDeliveries.releaseId, scenarioInjectReleases.id))
      .innerJoin(scenarioInjects, eq(scenarioDeliveries.injectId, scenarioInjects.id))
      .where(and(eq(scenarioDeliveries.eventId, eventId), or(...audienceFilters)))
      .orderBy(desc(scenarioDeliveries.deliveredAt));

    const newBriefings: ParticipantBriefing[] = [];
    const earlierBriefings: ParticipantBriefing[] = [];

    // Deduplicate by releaseId in case user is targeted both individually and by unit
    const seenReleaseIds = new Set<string>();

    for (const row of rows) {
      if (seenReleaseIds.has(row.release.id)) {
        continue;
      }
      seenReleaseIds.add(row.release.id);

      // Disclosed resources resolution
      const actionsSnapshot = Array.isArray(row.release.actionsSnapshot)
        ? (row.release.actionsSnapshot as any[])
        : [];

      const disclosedResources: ParticipantBriefing['disclosedResources'] = [];
      for (const act of actionsSnapshot) {
        if (act.resourceId) {
          // Check if current user is allowed to access this resource
          const canRead = await this.resourceAccessService.canAccessResource(
            user,
            act.resourceId,
            Permissions.REGISTRY_READ
          );

          if (canRead) {
            const [resRow] = await this.db
              .select({ id: resources.id, resourceType: resources.resourceType })
              .from(resources)
              .where(eq(resources.id, act.resourceId))
              .limit(1);

            disclosedResources.push({
              resourceId: act.resourceId,
              resourceType: resRow?.resourceType ?? 'resource',
              identifier: undefined,
              title: undefined,
            });
          }
        }
      }

      const item: ParticipantBriefing = {
        deliveryId: row.delivery.id,
        eventId: row.delivery.eventId,
        injectNumber: row.injectNumber,
        title: row.delivery.participantTitle || row.release.participantTitle,
        content: row.delivery.participantContent || row.release.participantContent,
        locale: row.delivery.locale ?? 'en',
        deliveredAt: row.delivery.deliveredAt.toISOString(),
        readAt: row.delivery.readAt ? row.delivery.readAt.toISOString() : null,
        acknowledgedAt: row.delivery.acknowledgedAt ? row.delivery.acknowledgedAt.toISOString() : null,
        requiresAcknowledgement: row.requiresAck,
        disclosedResources,
      };

      if (!row.delivery.readAt) {
        newBriefings.push(item);
      } else {
        earlierBriefings.push(item);
      }
    }

    const unreadCount = newBriefings.length;
    const pendingAcknowledgementCount = [...newBriefings, ...earlierBriefings].filter(
      (b) => b.requiresAcknowledgement && !b.acknowledgedAt
    ).length;

    return {
      unreadCount,
      pendingAcknowledgementCount,
      newBriefings,
      earlierBriefings,
    };
  }

  async markAsRead(eventId: string, deliveryId: string, user: AuthenticatedUser): Promise<void> {
    const [delivery] = await this.db
      .select()
      .from(scenarioDeliveries)
      .where(and(eq(scenarioDeliveries.eventId, eventId), eq(scenarioDeliveries.id, deliveryId)))
      .limit(1);

    if (!delivery) {
      throw new NotFoundException(`Delivery '${deliveryId}' not found`);
    }

    if (!delivery.readAt) {
      await this.db
        .update(scenarioDeliveries)
        .set({ readAt: new Date() })
        .where(eq(scenarioDeliveries.id, deliveryId));
    }
  }

  async acknowledgeBriefing(eventId: string, deliveryId: string, user: AuthenticatedUser): Promise<void> {
    const [delivery] = await this.db
      .select({
        id: scenarioDeliveries.id,
        injectId: scenarioDeliveries.injectId,
        readAt: scenarioDeliveries.readAt,
        acknowledgedAt: scenarioDeliveries.acknowledgedAt,
        injectNumber: scenarioInjects.injectNumber,
      })
      .from(scenarioDeliveries)
      .innerJoin(scenarioInjects, eq(scenarioDeliveries.injectId, scenarioInjects.id))
      .where(and(eq(scenarioDeliveries.eventId, eventId), eq(scenarioDeliveries.id, deliveryId)))
      .limit(1);

    if (!delivery) {
      throw new NotFoundException(`Delivery '${deliveryId}' not found`);
    }

    const now = new Date();
    await this.db
      .update(scenarioDeliveries)
      .set({
        acknowledgedAt: now,
        readAt: delivery.readAt ?? now,
      })
      .where(eq(scenarioDeliveries.id, deliveryId));

    await this.auditService.record({
      action: 'briefing.acknowledged',
      category: 'scenario',
      eventId,
      resourceType: 'briefing_delivery',
      resourceId: deliveryId,
      actorUserId: user.id,
      metadata: { injectNumber: delivery.injectNumber },
    });

    await this.db.insert(activityEvents).values({
      id: generateId(),
      eventId,
      activityType: 'briefing.acknowledged',
      title: `Briefing Acknowledged: ${delivery.injectNumber}`,
      summary: `Acknowledged by ${user.displayName}`,
      actorUserId: user.id,
      visibility: ActivityVisibility.SCENARIO,
      occurredAt: now,
    });
  }
}
