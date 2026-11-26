import { isServiceModule, type ServiceModule } from '@cyris/contracts';
import type { ServiceOperation } from './disruption-policy.js';

type ModuleCheck = { module: ServiceModule; operation: ServiceOperation };

/** Match registered Fastify routes, never raw paths, query parameters or a caller-supplied event. */
export function serviceRouteChecks(route: string, method: string): ModuleCheck[] {
  const path = route.replace(/\/$/, '');
  const operation: ServiceOperation = method === 'GET' || method === 'HEAD' ? 'read' : 'write';
  if (path === '/cases/:caseId/timeline') return [{ module: 'cases', operation }, { module: 'timeline', operation }];
  if (path === '/resources/:resourceId/timeline') return [{ module: 'timeline', operation }];
  if (path === '/resources/:resourceId/relationships' || path === '/resources/:sourceResourceId/relationships') {
    return [{ module: 'relationships', operation }];
  }
  const segments = path.split('/');
  if (segments[1] !== 'events' || segments[2] !== ':eventId') return [];
  const module = segments[3];
  if (!module) return [];
  if (module === 'tasks' && segments[4] === 'my-work') return []; // Mixed task/lab queue filters each source.
  if (module === 'command') {
    if (segments[4] === 'sitrep') return [{ module, operation }, { module: 'documents', operation: 'write' }];
    if (segments[4] === 'operational-picture') return [{ module, operation }];
    return []; // Readiness, DEFCON and physical display selection are always reachable.
  }
  if (module === 'support' && segments[4] === 'assist') return [{ module: 'intelligence', operation: 'write' }];
  if (module === 'scenario-data') {
    if (segments[4] === 'preview') return [{ module: 'scenario', operation: 'read' }];
    const checks: ModuleCheck[] = [{ module: 'scenario', operation }];
    if (operation === 'write') checks.push({ module: 'registry', operation });
    return checks;
  }
  if (module === 'intelligence') {
    const checks: ModuleCheck[] = [{ module, operation }];
    if (segments[4] === 'summarize-case') checks.push({ module: 'cases', operation: 'read' });
    if (segments[4] === 'explain-timeline' || segments[4] === 'catch-me-up') checks.push({ module: 'timeline', operation: 'read' });
    return checks;
  }
  if (module === 'activity') return [{ module: 'timeline', operation }];
  if (module === 'legal-requests') return [{ module: 'court', operation }];
  if (module === 'indicators') return [{ module: 'forensics', operation }];
  if (module === 'resources' && segments.includes('relationships')) return [{ module: 'relationships', operation }];
  return isServiceModule(module) ? [{ module, operation }] : [];
}
