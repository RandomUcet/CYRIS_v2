import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { eq, and, sql } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { AuditService } from '../audit/audit.service.js';
import {
  scenarioInjects,
  scenarioInjectTargets,
  scenarioInjectActions,
  scenarioInjectReleases,
  scenarioDeliveries,
  scenarioInjectTranslations,
  resources,
  resourceAccessControl,
  activityEvents,
  outboxEvents,
  ActivityVisibility,
  incidents,
} from '@cyris/db';
import { generateId } from '@cyris/shared';
import { PreferencesService } from '../preferences/preferences.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import { ResourceService } from '../resources/resource.service.js';
import { IdentifierAllocatorService } from '../resources/identifier-allocator.service.js';

export interface ReleaseExecutionResult {
  alreadyReleased: boolean;
  releaseId: string;
  injectNumber: string;
  releasedAt: string;
  deliveriesCount: number;
  disclosedResourcesCount: number;
  createdIncidentNumber?: string;
}

@Injectable()
export class ScenarioReleaseService {
  private readonly logger = new Logger(ScenarioReleaseService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly auditService: AuditService,
    private readonly preferencesService: PreferencesService,
    private readonly notificationsService: NotificationsService,
    private readonly resourceService: ResourceService,
    private readonly identifierAllocator: IdentifierAllocatorService
  ) {}

  private get db() {
    return this.databaseService.client;
  }

  /**
   * Atomic, idempotent release transaction for scenario injects.
   * Protects against concurrent release requests, retries, and double releases.
   */
  async executeRelease(
    eventId: string,
    injectId: string,
    releaseType: 'MANUAL' | 'AUTO' | 'OVERRIDE' = 'MANUAL',
    userId?: string,
    overrideReason?: string
  ): Promise<ReleaseExecutionResult> {
    if (releaseType === 'OVERRIDE') {
      if (!overrideReason || overrideReason.trim().length < 5) {
        throw new BadRequestException('Mandatory override reason required (minimum 5 characters)');
      }
    }

    return await this.db.transaction(async (tx) => {
      // 1. Lock inject row FOR UPDATE
      const [inject] = await tx
        .select()
        .from(scenarioInjects)
        .where(and(eq(scenarioInjects.eventId, eventId), eq(scenarioInjects.id, injectId)))
        .for('update');

      if (!inject) {
        throw new NotFoundException(`Scenario inject '${injectId}' not found in event '${eventId}'`);
      }

      // 2. Idempotency Check: If already RELEASED, safely return existing release snapshot
      if (inject.status === 'RELEASED') {
        const [existingRelease] = await tx
          .select()
          .from(scenarioInjectReleases)
          .where(eq(scenarioInjectReleases.injectId, injectId))
          .orderBy(scenarioInjectReleases.releasedAt)
          .limit(1);

        const existingDeliveries = await tx
          .select({ id: scenarioDeliveries.id })
          .from(scenarioDeliveries)
          .where(eq(scenarioDeliveries.injectId, injectId));

        this.logger.log(`Inject ${inject.injectNumber} already released. Returning existing release snapshot.`);

        return {
          alreadyReleased: true,
          releaseId: existingRelease?.id ?? inject.id,
          injectNumber: inject.injectNumber,
          releasedAt: existingRelease?.releasedAt?.toISOString() ?? inject.releasedAt?.toISOString() ?? new Date().toISOString(),
          deliveriesCount: existingDeliveries.length,
          disclosedResourcesCount: 0,
        };
      }

      // 3. Status and Condition Pre-check
      if (releaseType !== 'OVERRIDE') {
        if (inject.status === 'CANCELLED') {
          throw new BadRequestException(`Cannot release CANCELLED inject ${inject.injectNumber}`);
        }
        if (inject.status === 'BLOCKED') {
          throw new BadRequestException(
            `Inject ${inject.injectNumber} is BLOCKED by prerequisites or conditions. Use override-release to force delivery.`
          );
        }
      }

      const releaseId = generateId();
      const now = new Date();

      // 4. Fetch Targets & Actions to create snapshot
      const targets = await tx
        .select()
        .from(scenarioInjectTargets)
        .where(eq(scenarioInjectTargets.injectId, injectId));

      const actions = await tx
        .select()
        .from(scenarioInjectActions)
        .where(eq(scenarioInjectActions.injectId, injectId));

      // 5. Create Immutable Release Snapshot
      await tx.insert(scenarioInjectReleases).values({
        id: releaseId,
        eventId,
        injectId,
        releaseType,
        overrideReason: overrideReason ?? null,
        participantTitle: inject.participantTitle ?? inject.title,
        participantContent: inject.participantContent ?? null,
        audienceSnapshot: targets.map((t) => ({
          targetType: t.targetType,
          targetUnitId: t.targetUnitId,
          targetUserId: t.targetUserId,
        })),
        actionsSnapshot: actions.map((a) => ({
          actionType: a.actionType,
          resourceId: a.resourceId,
          targetType: a.targetType,
          targetUnitId: a.targetUnitId,
          targetUserId: a.targetUserId,
          newVisibility: a.newVisibility,
          parameters: a.parameters,
        })),
        releasedByUserId: userId ?? null,
        releasedAt: now,
      });

      // 6. Fetch available translations for this inject
      const translations = await tx
        .select()
        .from(scenarioInjectTranslations)
        .where(eq(scenarioInjectTranslations.injectId, injectId));

      const translationByLocale = new Map(translations.map((t) => [t.locale.toLowerCase(), t]));
      const eventDefaultLocale = await this.preferencesService.resolveEffectiveLocale(undefined, eventId);

      // Create Participant Briefing Deliveries
      let deliveriesCount = 0;
      const notificationsToEmit: Array<{
        userId: string;
        title: string;
        isMandatory: boolean;
      }> = [];

      if (targets.length === 0) {
        // Default target is whole event
        const matched = translationByLocale.get(eventDefaultLocale.toLowerCase());
        const delivLocale = matched ? matched.locale : 'en';
        const delivTitle = matched ? matched.participantTitle : (inject.participantTitle ?? inject.title);
        const delivContent = matched ? matched.participantContent : (inject.participantContent ?? null);

        await tx.insert(scenarioDeliveries).values({
          id: generateId(),
          eventId,
          releaseId,
          injectId,
          recipientUserId: null,
          targetUnitId: null,
          locale: delivLocale,
          participantTitle: delivTitle,
          participantContent: delivContent,
          deliveredAt: now,
        });
        deliveriesCount++;
      } else {
        for (const target of targets) {
          if (target.targetType === 'EVENT') {
            const matched = translationByLocale.get(eventDefaultLocale.toLowerCase());
            const delivLocale = matched ? matched.locale : 'en';
            const delivTitle = matched ? matched.participantTitle : (inject.participantTitle ?? inject.title);
            const delivContent = matched ? matched.participantContent : (inject.participantContent ?? null);

            await tx.insert(scenarioDeliveries).values({
              id: generateId(),
              eventId,
              releaseId,
              injectId,
              recipientUserId: null,
              targetUnitId: null,
              locale: delivLocale,
              participantTitle: delivTitle,
              participantContent: delivContent,
              deliveredAt: now,
            });
            deliveriesCount++;
          } else if (target.targetType === 'UNIT' && target.targetUnitId) {
            const matched = translationByLocale.get(eventDefaultLocale.toLowerCase());
            const delivLocale = matched ? matched.locale : 'en';
            const delivTitle = matched ? matched.participantTitle : (inject.participantTitle ?? inject.title);
            const delivContent = matched ? matched.participantContent : (inject.participantContent ?? null);

            await tx.insert(scenarioDeliveries).values({
              id: generateId(),
              eventId,
              releaseId,
              injectId,
              recipientUserId: null,
              targetUnitId: target.targetUnitId,
              locale: delivLocale,
              participantTitle: delivTitle,
              participantContent: delivContent,
              deliveredAt: now,
            });
            deliveriesCount++;
          } else if (target.targetType === 'USER' && target.targetUserId) {
            const userLocale = await this.preferencesService.resolveEffectiveLocale(target.targetUserId, eventId);
            const matched = translationByLocale.get(userLocale.toLowerCase());
            const delivLocale = matched ? matched.locale : 'en';
            const delivTitle = matched ? matched.participantTitle : (inject.participantTitle ?? inject.title);
            const delivContent = matched ? matched.participantContent : (inject.participantContent ?? null);

            await tx.insert(scenarioDeliveries).values({
              id: generateId(),
              eventId,
              releaseId,
              injectId,
              recipientUserId: target.targetUserId,
              targetUnitId: null,
              locale: delivLocale,
              participantTitle: delivTitle,
              participantContent: delivContent,
              deliveredAt: now,
            });
            deliveriesCount++;

            notificationsToEmit.push({
              userId: target.targetUserId,
              title: delivTitle,
              isMandatory: inject.requiresAcknowledgement,
            });
          }
        }
      }

      // 7. Execute Controlled Resource Disclosure Actions
      let disclosedCount = 0;
      let createdIncidentNumber: string | undefined;
      for (const action of actions) {
        if (action.actionType === 'CREATE_INCIDENT') {
          const params = (action.parameters ?? {}) as Record<string, unknown>;
          const incidentId = generateId();
          createdIncidentNumber = await this.identifierAllocator.allocate(eventId, 'INC', 'INC', tx);
          await this.resourceService.registerResource(eventId, 'incident', {
            id: incidentId,
            visibility: 'EVENT',
            ownerUserId: userId ?? undefined,
            txClient: tx,
          });
          await tx.insert(incidents).values({
            id: incidentId,
            incidentNumber: createdIncidentNumber,
            title: typeof params.title === 'string' && params.title.trim() ? params.title.trim() : inject.title,
            description: typeof params.description === 'string' ? params.description : inject.controllerSummary,
            status: 'NEW',
            priority: ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'].includes(String(params.priority))
              ? String(params.priority)
              : 'MEDIUM',
            occurredAt: inject.scheduledAt ?? now,
            detectedAt: now,
          });
          await this.auditService.record({
            action: 'incident.created',
            category: 'incident',
            eventId,
            resourceType: 'incident',
            resourceId: incidentId,
            actorUserId: userId,
            metadata: { incidentNumber: createdIncidentNumber, sourceInject: inject.injectNumber },
          });
          await tx.insert(activityEvents).values({
            id: generateId(),
            eventId,
            resourceId: incidentId,
            activityType: 'incident.created',
            title: `Created incident ${createdIncidentNumber}: ${inject.title}`,
            summary: inject.controllerSummary,
            actorUserId: userId ?? null,
            visibility: ActivityVisibility.EVENT,
            occurredAt: now,
          });
          continue;
        }
        if (!action.resourceId) continue;

        if (action.actionType === 'GRANT_RESOURCE_ACCESS') {
          // Grant access to target Unit or User
          const principalType = action.targetType === 'USER' ? 'USER' : 'UNIT';
          const principalId = action.targetType === 'USER' ? action.targetUserId : action.targetUnitId;

          if (principalId) {
            await tx
              .insert(resourceAccessControl)
              .values({
                id: generateId(),
                resourceId: action.resourceId,
                principalType,
                principalId,
                grantedByUserId: userId ?? null,
                grantedAt: now,
              })
              .onConflictDoNothing();

            disclosedCount++;

            await this.auditService.record({
              action: 'scenario.resource.disclosed',
              category: 'scenario',
              eventId,
              resourceType: 'resource',
              resourceId: action.resourceId,
              actorUserId: userId,
              metadata: {
                injectNumber: inject.injectNumber,
                principalType,
                principalId,
                actionType: action.actionType,
              },
            });
          }
        } else if (action.actionType === 'CHANGE_RESOURCE_VISIBILITY' && action.newVisibility) {
          await tx
            .update(resources)
            .set({
              visibility: action.newVisibility,
              updatedAt: now,
            })
            .where(eq(resources.id, action.resourceId));

          disclosedCount++;

          await this.auditService.record({
            action: 'scenario.resource.visibility_changed',
            category: 'scenario',
            eventId,
            resourceType: 'resource',
            resourceId: action.resourceId,
            actorUserId: userId,
            metadata: {
              injectNumber: inject.injectNumber,
              newVisibility: action.newVisibility,
            },
          });
        }
      }

      // 8. Update Scenario Inject to RELEASED
      await tx
        .update(scenarioInjects)
        .set({
          status: 'RELEASED',
          releasedAt: now,
          releasedByUserId: userId ?? null,
          updatedAt: now,
        })
        .where(eq(scenarioInjects.id, injectId));

      // 9. Record Audit Log
      await this.auditService.record({
        action: releaseType === 'OVERRIDE' ? 'scenario.inject.overridden' : 'scenario.inject.released',
        category: 'scenario',
        eventId,
        resourceType: 'scenario_inject',
        resourceId: injectId,
        actorUserId: userId,
        metadata: {
          injectNumber: inject.injectNumber,
          releaseType,
          overrideReason: overrideReason ?? null,
          deliveriesCount,
          disclosedResourcesCount: disclosedCount,
        },
      });

      // 10. Record Scenario Timeline Activity (Controller only)
      await tx.insert(activityEvents).values({
        id: generateId(),
        eventId,
        activityType:
          releaseType === 'OVERRIDE'
            ? 'scenario.inject.overridden'
            : releaseType === 'AUTO'
            ? 'scenario.inject.auto_released'
            : 'scenario.inject.released',
        title: `Inject Released: ${inject.injectNumber} — ${inject.title}`,
        summary:
          releaseType === 'OVERRIDE'
            ? `Manual override release: ${overrideReason}`
            : `Released via ${releaseType.toLowerCase()} policy`,
        reason: overrideReason ?? undefined,
        actorUserId: userId ?? null,
        visibility: ActivityVisibility.SCENARIO,
        occurredAt: now,
      });

      // 11. Record Participant Timeline Activity (if participant-facing content released)
      if (inject.participantTitle) {
        await tx.insert(activityEvents).values({
          id: generateId(),
          eventId,
          activityType: 'briefing.delivered',
          title: inject.participantTitle,
          summary: inject.participantContent?.substring(0, 180) ?? 'New operational briefing released',
          actorUserId: userId ?? null,
          visibility: ActivityVisibility.EVENT,
          occurredAt: now,
        });
      }

      // 12. Transactional Outbox Event for downstream processing
      await tx.insert(outboxEvents).values({
        id: generateId(),
        eventType: 'scenario.inject.released',
        payload: {
          eventId,
          injectId,
          injectNumber: inject.injectNumber,
          releaseType,
          releasedAt: now.toISOString(),
        },
      });

      // 13. Dispatch operational notifications to recipients
      for (const notif of notificationsToEmit) {
        await this.notificationsService.emit({
          userId: notif.userId,
          eventId,
          type: notif.isMandatory ? 'BRIEFING_ACK_REQUIRED' : 'BRIEFING_NEW',
          severity: notif.isMandatory ? 'ACTION' : 'INFO',
          templateKey: notif.isMandatory ? 'briefing.requiresAcknowledgement' : 'briefing.new',
          templateParams: {
            injectNumber: inject.injectNumber,
            title: notif.title,
          },
          actionUrl: `/events/${eventId}/briefings`,
          sourceEventId: `briefing-delivery-${releaseId}-${notif.userId}`,
          isMandatory: notif.isMandatory,
        });
      }

      return {
        alreadyReleased: false,
        releaseId,
        injectNumber: inject.injectNumber,
        releasedAt: now.toISOString(),
        deliveriesCount,
        disclosedResourcesCount: disclosedCount,
        createdIncidentNumber,
      };
    });
  }
}
