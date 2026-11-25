import { isServiceModule, type ServiceModule } from '@cyris/contracts';

export function serviceModuleForPath(pathname: string): ServiceModule | null {
  const [, section, eventId, module, page] = pathname.split('/');
  if (section !== 'events' || !eventId || !module) return null;
  if (module === 'legal-requests') return 'court';
  if (module === 'scenario-data') return 'scenario';
  if (!isServiceModule(module)) return null;
  if (module === 'command' && ['wallboard', 'readiness', 'defcon', 'team-displays'].includes(page ?? '')) return null;
  if (module === 'tasks' && page === 'disruption') return null;
  return module;
}
