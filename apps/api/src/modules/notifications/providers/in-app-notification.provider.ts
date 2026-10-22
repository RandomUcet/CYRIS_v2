import { Injectable, Logger } from '@nestjs/common';
import { eq } from 'drizzle-orm';
import { DatabaseService } from '../../database/database.service.js';
import { notifications } from '@cyris/db';
import type { NotificationItem } from '@cyris/contracts';
import type { INotificationProvider, NotificationContext } from './notification-provider.interface.js';

@Injectable()
export class InAppNotificationProvider implements INotificationProvider {
  readonly channel = 'IN_APP' as const;
  private readonly logger = new Logger(InAppNotificationProvider.name);

  constructor(private readonly databaseService: DatabaseService) {}

  async deliver(notification: NotificationItem, _context?: NotificationContext): Promise<boolean> {
    const db = this.databaseService.client;
    try {
      await db
        .insert(notifications)
        .values({
          id: notification.id,
          userId: notification.userId,
          eventId: notification.eventId ?? null,
          type: notification.type,
          severity: notification.severity,
          templateKey: notification.templateKey,
          templateParams: notification.templateParams,
          resourceId: notification.resourceId ?? null,
          actionUrl: notification.actionUrl ?? null,
          sourceEventId: notification.sourceEventId ?? null,
          readAt: notification.readAt ? new Date(notification.readAt) : null,
          dismissedAt: notification.dismissedAt ? new Date(notification.dismissedAt) : null,
          createdAt: new Date(notification.createdAt),
        })
        .onConflictDoNothing();

      return true;
    } catch (err) {
      this.logger.error(`Failed to persist in-app notification: ${(err as Error).message}`);
      return false;
    }
  }
}
