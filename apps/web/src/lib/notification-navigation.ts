/**
 * Notification templates are remotely supplied data; only open local application
 * routes and never route to external protocols, protocol-relative URLs or slashes.
 */
export function safeNotificationHref(value:string|null|undefined):string|null {
  if(!value || !value.startsWith('/') || value.startsWith('//') ||
    value.includes('\\') || /[\u0000-\u001f\u007f]/.test(value)) return null;
  return value;
}

import type { NotificationItem } from '@cyris/contracts';

export type NotificationView = 'ALL' | 'UNREAD' | 'ATTENTION';

/** Broadcast title is rendered separately: show the actual instructions as detail. */
export function notificationDetail(item: Pick<NotificationItem, 'templateKey' | 'templateParams'>): string {
  const params = item.templateParams ?? {};
  const value = item.templateKey === 'exercise.broadcast'
    ? params.description
    : (params.title ?? params.description);
  return typeof value === 'string' ? value : '';
}

/** Filters only the authenticated, event-scoped notifications returned by the API. */
export function selectNotificationItems<T extends NotificationItem>(
  items: readonly T[], view: NotificationView, query: string, title: (item: T) => string,
): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return items.filter(item => {
    if (view === 'UNREAD' && item.readAt) return false;
    if (view === 'ATTENTION' && item.severity !== 'ACTION' && item.severity !== 'URGENT') return false;
    if (!needle) return true;
    return [title(item), notificationDetail(item), item.type].join(' ').toLocaleLowerCase().includes(needle);
  });
}
