/**
 * Only known exercise-scoped entity routes are linked from the graph.
 * Unknown nodes remain inspectable, but do not receive a misleading link.
 */
export type RelationshipRecordLocator = {id:string;type:string;route?:string};
const routes:Record<string,string>={
  case:'cases',incident:'incidents',evidence:'evidence',lab_analysis:'lab',
  person:'registry/persons',organisation:'registry/organisations',
  organization:'registry/organisations',vehicle:'registry/vehicles',
  device:'registry/devices',location:'registry/locations',weapon:'registry/weapons',
};
export function relationshipRecordHref(eventId:string, node:RelationshipRecordLocator):string|null {
  if(!eventId||!node.id)return null;
  const base=`/events/${encodeURIComponent(eventId)}/`;
  // Do not trust arbitrary external or cross-exercise routes returned as metadata.
  if(node.route && node.route.startsWith(base) && !node.route.includes('..') &&
    !node.route.includes('\\') && !node.route.includes('//')) return node.route;
  const type=node.type.toLowerCase().trim().replace(/[\s-]+/g,'_').replace(/^registry_/,'');
  const path=routes[type];
  return path ? base+path+'/'+encodeURIComponent(node.id) : null;
}
