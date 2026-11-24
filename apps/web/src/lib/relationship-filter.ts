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
const normalize=(value:string)=>value.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
function searchableIdentity(raw: unknown): string {
  if (!raw || typeof raw !== 'object') return '';
  const identity = raw as Identity;
  return [identity.title, identity.label, identity.identifier, identity.type]
    .filter((value): value is string => typeof value === 'string').join(' ');
}
export function filterRelationships<T extends RelationshipFilterRecord>(
  records: readonly T[], relationType: string, search: string,
): T[] {
  const terms = normalize(search).split(/\s+/).filter(Boolean);
  return records.filter(row => {
    if (relationType !== 'ALL' && row.relationshipType !== relationType) return false;
    if (!terms.length) return true;
    const haystack = [
      row.id, row.relationshipType, row.sourceResourceId, row.targetResourceId,
      row.sourceId, row.targetId,
      searchableIdentity(row.source), searchableIdentity(row.target),
    ].filter((part): part is string => typeof part === 'string').join(' ');
    const normalized=normalize(haystack);
    return terms.every(term=>normalized.includes(term));
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

export function relationshipEndpoint(row:RelationshipFilterRecord,side:'source'|'target') {
  const id=side==='source'?(row.sourceResourceId||row.sourceId):(row.targetResourceId||row.targetId);
  if(!id)return null;
  const raw=row[side];
  const identity=raw&&typeof raw==='object'?raw as Identity:{};
  const text=(value:unknown)=>typeof value==='string'?value:'';
  const identifier=text(identity.identifier);
  const title=text(identity.title)||text(identity.label)||identifier||id.slice(0,8);
  return {id,title,identifier,type:text(identity.type)||'resource'};
}

/** Traverse only edges already authorized and loaded for the exercise.
 * Treat edges as undirected for discovery; preserve direction in the result. */
export function relationshipNeighborhood<T extends RelationshipFilterRecord>(rows:readonly T[],focus:string,hops:1|2):T[] {
  if(!focus)return [...rows];
  const adjacency=new Map<string,Array<{index:number;other:string}>>();
  const add=(id:string,other:string,index:number)=>{
    const list=adjacency.get(id)??[];
    list.push({index,other});adjacency.set(id,list);
  };
  rows.forEach((row,index)=>{
    const a=row.sourceResourceId||row.sourceId,b=row.targetResourceId||row.targetId;
    if(a&&b){add(a,b,index);add(b,a,index);}
  });
  const included=new Set<number>(),seen=new Set([focus]);
  let frontier=[focus];
  for(let step=0;step<hops;step++){
    const next:string[]=[];
    for(const id of frontier)for(const edge of adjacency.get(id)??[]){
      included.add(edge.index);
      if(!seen.has(edge.other)){seen.add(edge.other);next.push(edge.other);}
    }
    frontier=next;
  }
  return rows.filter((_,index)=>included.has(index));
}
export function relationshipGraphAllowed(rows:readonly RelationshipFilterRecord[]):boolean {
  return rows.length<=300 && relatedNodeCount(rows)<=200;
}
