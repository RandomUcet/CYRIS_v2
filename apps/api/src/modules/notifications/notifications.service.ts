import { Injectable, Logger, NotFoundException, ForbiddenException } from '@nestjs/common';
import { eq, and, isNull, desc } from 'drizzle-orm';
import { DatabaseService } from '../database/database.service.js';
import { PreferencesService } from '../preferences/preferences.service.js';
import { InAppNotificationProvider } from './providers/in-app-notification.provider.js';
import { EmailNotificationProvider } from './providers/email-notification.provider.js';
import { notifications, users } from '@cyris/db';
import { generateId, Permissions } from '@cyris/shared';
import { AuthorizationService } from '../authorization/authorization.service.js';
import { readModuleImpacts } from '../disruptions/read-module-impacts.js';
import { serviceModuleForAction } from '../disruptions/module-resources.js';
import type {
  CreateNotificationInput,
  NotificationItem,
  NotificationListResponse,
  NotificationSeverityValue,
} from '@cyris/contracts';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(
    private readonly databaseService: DatabaseService,
    private readonly preferencesService: PreferencesService,
    private readonly inAppProvider: InAppNotificationProvider,
    private readonly emailProvider: EmailNotificationProvider,
    private readonly authorization: AuthorizationService
  ) {}

  /**
   * Emits an operational notification with deduplication, preferences evaluation,
   * and multi-provider dispatch (in-app, email).
   */
  async emit(input: CreateNotificationInput): Promise<NotificationItem | null> {
    const db = this.databaseService.client;

    // 1. Deduplication check if sourceEventId provided
    if (input.sourceEventId) {
      const [existing] = await db
        .select()
        .from(notifications)
        .where(
          and(
            eq(notifications.sourceEventId, input.sourceEventId),
            eq(notifications.userId, input.userId),
            eq(notifications.type, input.type)
          )
        )
        .limit(1);

      if (existing) {
        this.logger.debug(
          `Duplicate notification suppressed: sourceEventId=${input.sourceEventId}, user=${input.userId}, type=${input.type}`
        );
        return this.mapToItem(existing);
      }
    }

    // 2. Fetch recipient user details & preferences
    const [recipient] = await db
      .select({ email: users.email })
      .from(users)
      .where(eq(users.id, input.userId))
      .limit(1);

    if (!recipient) {
      this.logger.warn(`Notification emission skipped: recipient user ${input.userId} not found`);
      return null;
    }

    const preferences = await this.preferencesService.getUserPreferences(input.userId);

    // 3. Evaluate channels and category filters
    const isMandatory = input.isMandatory ?? false;
    const canDeliverInApp = isMandatory || preferences.notificationChannels.inApp !== false;
    const canDeliverEmail = preferences.notificationChannels.email !== false;

    const notificationItem: NotificationItem = {
      id: generateId(),
      userId: input.userId,
      eventId: input.eventId ?? null,
      type: input.type,
      severity: (input.severity ?? 'INFO') as NotificationSeverityValue,
      templateKey: input.templateKey,
      templateParams: input.templateParams ?? {},
      resourceId: input.resourceId ?? null,
      actionUrl: input.actionUrl ?? null,
      sourceEventId: input.sourceEventId ?? null,
      readAt: null,
      dismissedAt: null,
      createdAt: new Date().toISOString(),
    };

    // 4. In-App delivery
    if (canDeliverInApp) {
      await this.inAppProvider.deliver(notificationItem, {
        userEmail: recipient.email,
        userLocale: preferences.locale,
        isMandatory,
      });
    }

    // Save the in-app row so it reappears after restoration. Do not mail details
    // to a recipient while the originating module is unavailable to them.
    if (canDeliverEmail && await this.canShowModule(input.eventId, input.templateKey, input.userId)) {
      this.emailProvider
        .deliver(notificationItem, {
          userEmail: recipient.email,
          userLocale: preferences.locale,
          isMandatory,
        })
        .catch((err) => {
          this.logger.warn(`Email provider background delivery failed: ${err.message}`);
        });
    }

    return notificationItem;
  }

  /**
   * Retrieves active notifications for user, grouped into new and earlier items.
   */
  async getNotifications(userId: string, eventId?: string): Promise<NotificationListResponse> {
    const db = this.databaseService.client;

    const conditions = [
      eq(notifications.userId, userId),
      isNull(notifications.dismissedAt),
    ];

    if (eventId) {
      conditions.push(eq(notifications.eventId, eventId));
    }

    const rows = await db
      .select()
      .from(notifications)
      .where(and(...conditions))
      .orderBy(desc(notifications.createdAt))
      .limit(100);

    const newItems: NotificationItem[] = [];
    const earlierItems: NotificationItem[] = [];

    const visibility = new Map<string, Promise<boolean>>();
    for (const row of rows) {
      const module = serviceModuleForAction(row.templateKey);
      if (row.eventId && module) {
        const key = row.eventId + '/' + module;
        if (!visibility.has(key)) visibility.set(key, this.canShowModule(row.eventId, row.templateKey, userId));
        if (!await visibility.get(key)) continue;
      }
      const item = this.mapToItem(row);
      if (!row.readAt) {
        newItems.push(item);
      } else {
        earlierItems.push(item);
      }
    }

    return {
      unreadCount: newItems.length,
      newItems,
      earlierItems,
    };
  }

  /**
   * Marks a notification as read or unread.
   * CRITICAL: Modifying notification read status MUST NEVER mutate domain entities.
   */
  async markRead(notificationId: string, userId: string, read: boolean = true): Promise<NotificationItem> {
    const db = this.databaseService.client;
    const [existing] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Cannot modify notifications of other users');
    }

    if (!await this.canShowModule(existing.eventId, existing.templateKey, userId)) {
      throw new NotFoundException('Notification not found');
    }

    const [updated] = await db
      .update(notifications)
      .set({
        readAt: read ? new Date() : null,
      })
      .where(eq(notifications.id, notificationId))
      .returning();

    return this.mapToItem(updated);
  }

  /**
   * Marks all unread notifications for a user as read.
   */
  async markAllRead(userId: string, eventId?: string): Promise<{ updatedCount: number }> {
    const db = this.databaseService.client;
    const conditions = [
      eq(notifications.userId, userId),
      isNull(notifications.readAt),
      isNull(notifications.dismissedAt),
    ];

    if (eventId) {
      conditions.push(eq(notifications.eventId, eventId));
    }

    const res = await db
      .update(notifications)
      .set({
        readAt: new Date(),
      })
      .where(and(...conditions))
      .returning({ id: notifications.id });

    return { updatedCount: res.length };
  }

  /**
   * Dismisses a notification from the user's notification center.
   */
  async dismiss(notificationId: string, userId: string): Promise<void> {
    const db = this.databaseService.client;
    const [existing] = await db
      .select()
      .from(notifications)
      .where(eq(notifications.id, notificationId))
      .limit(1);

    if (!existing) {
      throw new NotFoundException('Notification not found');
    }

    if (existing.userId !== userId) {
      throw new ForbiddenException('Cannot dismiss notifications of other users');
    }

    await db
      .update(notifications)
      .set({
        dismissedAt: new Date(),
      })
      .where(eq(notifications.id, notificationId));
  }

  private async canShowModule(eventId: string | null | undefined, templateKey: string, userId: string): Promise<boolean> {
    const module = serviceModuleForAction(templateKey);
    if (!eventId || !module) return true;
    const db = this.databaseService.client;
    if ((await readModuleImpacts(db, eventId, userId)).get(module) !== 'UNAVAILABLE') return true;
    const [user] = await db.select({ id: users.id, email: users.email, displayName: users.displayName, status: users.status })
      .from(users).where(eq(users.id, userId)).limit(1);
    return Boolean(user && await this.authorization.authorize({ user, permission: Permissions.PLATFORM_MANAGE }));
  }

  private mapToItem(row: typeof notifications.$inferSelect): NotificationItem {
    return {
      id: row.id,
      userId: row.userId,
      eventId: row.eventId,
      type: row.type,
      severity: row.severity as NotificationSeverityValue,
      templateKey: row.templateKey,
      templateParams: (row.templateParams as Record<string, any>) ?? {},
      resourceId: row.resourceId,
      actionUrl: row.actionUrl,
      sourceEventId: row.sourceEventId,
      readAt: row.readAt ? row.readAt.toISOString() : null,
      dismissedAt: row.dismissedAt ? row.dismissedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString(),
    };
  }
}
