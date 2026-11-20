import type { ViewAsContext } from '@cyris/contracts';

// sessionStorage keeps the inspection in this tab; no target credentials exist.
export const VIEW_AS_STORAGE_KEY = 'cyris_view_as';
export const VIEW_AS_INVALID_EVENT = 'cyris:view-as-invalid';

export function readViewAs(): ViewAsContext | null {
  if (typeof window === 'undefined') return null;
  const raw = window.sessionStorage.getItem(VIEW_AS_STORAGE_KEY);
  if (!raw) return null;
  const context = JSON.parse(raw) as ViewAsContext;
  if (!context.id || !context.eventId || context.readOnly !== true) throw new Error('Invalid preview context');
  return context;
}

export function saveViewAs(context: ViewAsContext): void {
  window.sessionStorage.setItem(VIEW_AS_STORAGE_KEY, JSON.stringify(context));
}

export function clearViewAs(): void {
  window.sessionStorage.removeItem(VIEW_AS_STORAGE_KEY);
}
