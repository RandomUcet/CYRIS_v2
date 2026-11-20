import type { CyrisDatabase } from '@cyris/db';
import type { AuthenticatedUser } from '../auth/session.service.js';
import { readModuleImpacts } from './read-module-impacts.js';

type Impacts = ReturnType<typeof readModuleImpacts>;
// The authentication guard creates a fresh principal for each HTTP request.
// Domain services called outside HTTP always read current state.
const requests = new WeakMap<AuthenticatedUser, Map<string, Impacts>>();
export function beginAvailabilityRequest(user: AuthenticatedUser): void {
  if (!requests.has(user)) requests.set(user, new Map());
}
export function requestModuleImpacts(db: Pick<CyrisDatabase, 'select'>, eventId: string, user: AuthenticatedUser): Impacts {
  const cache = requests.get(user);
  if (!cache) return readModuleImpacts(db, eventId, user.id);
  let result = cache.get(eventId);
  if (!result) {
    result = readModuleImpacts(db, eventId, user.id);
    cache.set(eventId, result);
  }
  return result;
}
