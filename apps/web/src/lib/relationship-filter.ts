/** Search/filters apply only to relationship records already visible to this user. */
export interface RelationshipFilterRecord {
  id?: string;
  relationshipType?: string;
  sourceId?: string;
  targetId?: string;
  sourceResourceId?: string;
  targetResourceId?: string;
  source?: unknown;
  target?: unknown;
}
type Identity = { title?: unknown; label?: unknown; identifier?: unknown; type?: unknown };
function searchableIdentity(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const identity = raw as Identity;
  return [identity.title, identity.label, identity.identifier, identity.type]
    .filter((value): value is string => typeof value === 'string').join(' ');
}
export function filterRelationships<T extends RelationshipFilterRecord>(
  records: readonly T[], relationType: string, search: string,
): T[] {
  const q = search.trim().toLocaleLowerCase();
  return records.filter(row => {
    if (relationType !== 'ALL' && row.relationshipType !== relationType) return false;
    if (!q) return true;
    const haystack = [
      row.id, row.relationshipType, row.sourceResourceId, row.targetResourceId,
      row.sourceId, row.targetId,
      searchableIdentity(row.source), searchableIdentity(row.target),
    ].filter((part): part is string => typeof part === 'string').join(' ').toLocaleLowerCase();
    return haystack.includes(q);
  });
}
export function relatedNodeCount(records: readonly RelationshipFilterRecord[]): number {
  const ids = new Set<string>();
  for (const row of records) {
    const source = row.sourceResourceId || row.sourceId;
    const target = row.targetResourceId || row.targetId;
    if (source) ids.add(source);
    if (target) ids.add(target);
  }
  return ids.size;
}
