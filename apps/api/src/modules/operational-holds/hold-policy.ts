import type { OperationalHoldRow } from '@cyris/db';
import { type ServiceModule, isServiceModule } from '@cyris/contracts';
import { serviceRouteChecks } from '../disruptions/service-routes.js';

export function holdIsActive(row: Pick<OperationalHoldRow, 'startsAt' | 'expiresAt' | 'restoredAt'>, now = new Date()): boolean {
  return row.restoredAt === null && row.startsAt <= now && (row.expiresAt === null || row.expiresAt > now);
}

export function holdTargetsUser(
  hold: Pick<OperationalHoldRow, 'targetType' | 'targetId'>,
  userId: string,
  units: ReadonlySet<string>,
): boolean {
  if (hold.targetType === 'EVENT') return true;
  if (hold.targetType === 'USER') return hold.targetId === userId;
  if (hold.targetType === 'UNIT') return Boolean(hold.targetId && units.has(hold.targetId));
  return false;
}

/**
 * Always based on Nest's registered route template, never caller-supplied paths.
 * Special support/admin hold-control endpoints remain reachable during a lock.
 */
export function operationHoldModules(route: string, method: string): { eventRoute: boolean; modules: ServiceModule[] } | null {
  if (['GET', 'HEAD', 'OPTIONS'].includes(method.toUpperCase())) return null;
  const path = route.replace(/\/+$/, '');
  const segments = path.split('/');
  const eventRoute = segments[1] === 'events' && segments[2] === ':eventId';
  const isRootResource = ['resources', 'cases'].includes(segments[1] ?? '') && Boolean(segments[2]?.startsWith(':'));
  if (!eventRoute && !isRootResource) return null;

  // Break-glass recovery and user support must never be trapped behind the pause.
  if (eventRoute && ['operational-holds', 'support', 'service-status', 'disruptions'].includes(segments[3] ?? '')) return null;
  const mapped = serviceRouteChecks(path, method).map(item => item.module);
  let extra: ServiceModule | null = null;
  const candidate = segments[3] ?? '';
  if (eventRoute && isServiceModule(candidate)) extra = candidate;
  else if (eventRoute && candidate === 'scenario-data') extra = 'scenario';
  else if (eventRoute && candidate === 'resources') extra = 'registry';
  else if (eventRoute && candidate === 'activity') extra = 'timeline';
  else if (isRootResource && segments[1] === 'cases') extra = 'cases';
  else if (isRootResource && segments[1] === 'resources') extra = 'registry';
  const modules = [...new Set([...mapped, ...(extra ? [extra] : [])])];
  return { eventRoute, modules };
}

export function shouldBlockHold(
  holds: ReadonlyArray<Pick<OperationalHoldRow, 'module' | 'targetType' | 'targetId' | 'startsAt' | 'expiresAt' | 'restoredAt'>>,
  userId: string,
  units: ReadonlySet<string>,
  modules: readonly ServiceModule[],
  now = new Date(),
): boolean {
  return holds.some(hold => holdIsActive(hold, now) && holdTargetsUser(hold, userId, units) &&
    (hold.module === 'ALL' || (isServiceModule(hold.module) && modules.includes(hold.module))));
}
