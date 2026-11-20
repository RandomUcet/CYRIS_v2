/**
 * Explicit read-only preview boundary. Unknown routes are denied by default.
 * Each permitted endpoint still applies the selected participant's own access checks.
 */
const eventReads = new Set([
  '', '/workspace', '/units', '/tasks', '/tasks/my-work', '/tasks/:taskId',
  '/command/team-displays', '/command/readiness', '/command/defcon', '/command/operational-picture',
  '/disruptions/status', '/disruptions/service-status', '/disruptions/recovery-objectives',
  '/timeline', '/support', '/documents', '/briefings', '/incidents', '/cases', '/evidence',
  '/evaluation/objectives', '/evaluation/observations', '/evaluation/after-action',
  '/medical', '/medical/operational-summary', '/lab', '/lab/units',
  '/forensics', '/indicators', '/court', '/registry/persons', '/registry/organisations',
  '/registry/locations', '/registry/vehicles', '/registry/devices', '/registry/weapons',
]);
export function isPreviewReadAllowed(method: string, route: string, eventId: string | undefined, selectedEvent: string): boolean {
  if (method !== 'GET') return false;
  const path = route.replace(/\/$/, '');
  if (path === '/auth/me' || path === '/events') return true;
  const prefix = '/events/:eventId';
  return eventId === selectedEvent && path.startsWith(prefix) && eventReads.has(path.slice(prefix.length));
}
