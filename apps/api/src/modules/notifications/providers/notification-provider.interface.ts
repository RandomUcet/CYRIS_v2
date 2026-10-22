import type { NotificationItem } from '@cyris/contracts';

export interface NotificationContext {
  userEmail?: string;
  userLocale?: string;
  isMandatory?: boolean;
}

export interface INotificationProvider {
  readonly channel: 'IN_APP' | 'EMAIL';
  deliver(notification: NotificationItem, context?: NotificationContext): Promise<boolean>;
}
