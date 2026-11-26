/** Read-only retention evidence. No object key or filename leaves this module's callers. */
export type ObjectReference={eventId:string;bucket:string;key:string;source:string};
export type ListedObject={bucket:string;key:string};
export const objectIdentity=(bucket:string,key:string)=>JSON.stringify([bucket,key]);
export function belongsToEventNamespace(key:string,eventId:string,resourceIds:ReadonlySet<string>){
  if(key.startsWith('documents/'+eventId+'/')||key.startsWith('scenario-drafts/'+eventId+'/'))return true;
  const match=/^registry\/([^/]+)\//.exec(key);
  return Boolean(match&&resourceIds.has(match[1]!));
}
export function classifyRetentionObjects(eventId:string,refs:readonly ObjectReference[],listed:readonly ListedObject[],
  resourceIds:ReadonlySet<string>,defaultBucket:string,auditBucket:string,verifiedPresent:ReadonlySet<string>,
  missing:ReadonlySet<string>,unverified:ReadonlySet<string>){
  const global=new Map<string,Set<string>>();
  const target=new Map<string,ObjectReference>();
  for(const ref of refs){
    const id=objectIdentity(ref.bucket,ref.key);
    const owners=global.get(id)??new Set<string>();owners.add(ref.eventId);global.set(id,owners);
    if(ref.eventId===eventId)target.set(id,ref);
  }
  const orphan=new Set<string>(),foreign=new Set<string>();
  for(const item of listed){
    if(item.bucket!==defaultBucket||!belongsToEventNamespace(item.key,eventId,resourceIds))continue;
    const id=objectIdentity(item.bucket,item.key),owners=global.get(id);
    if(!owners?.size)orphan.add(id);
    else if(!owners.has(eventId))foreign.add(id);
  }
  let shared=0,outsideNamespace=0,protectedBucket=0,present=0,absent=0,unknown=0;
  for(const [id,ref] of target){
    if((global.get(id)?.size??0)>1)shared++;
    if(ref.bucket!==defaultBucket||!belongsToEventNamespace(ref.key,eventId,resourceIds))outsideNamespace++;
    if(ref.bucket===auditBucket||ref.bucket!==defaultBucket)protectedBucket++;
    if(verifiedPresent.has(id))present++;
    else if(missing.has(id))absent++;
    else if(unverified.has(id)||!verifiedPresent.has(id))unknown++;
  }
  return {references:refs.filter(x=>x.eventId===eventId).length,uniqueObjects:target.size,sharedObjects:shared,
    outsideNamespace,protectedBucket,presentObjects:present,missingObjects:absent,unverifiedObjects:unknown,
    unreferencedNamespaceObjects:orphan.size,foreignOwnedNamespaceObjects:foreign.size};
}
