import {GLOBAL_SEARCH_COLLECTION} from '@cyris/db';
import type {SearchDocument} from '@cyris/contracts';
import {Client as TypesenseClient} from 'typesense';
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const keep=new Set(['event','unit','role']);
const MAX=20000;
type Profile='reset'|'remove';
export function validateRetentionSearchProjection(eventId:string,profile:Profile,docs:readonly SearchDocument[]){
  if(!uuid.test(eventId)||!['reset','remove'].includes(profile)||docs.length>MAX)throw Error('Invalid search retention scope');
  if(profile==='remove'&&docs.length)throw Error('Removed exercise must have no projections');
  const ids=new Set<string>();
  for(const d of docs){
    if(d.eventId!==eventId||!keep.has(d.resourceType)||!uuid.test(d.canonicalId)
      ||d.id!==d.resourceType+':'+d.canonicalId||ids.has(d.id)
      ||(d.resourceType==='event'&&d.canonicalId!==eventId))throw Error('Invalid retained search projection');
    ids.add(d.id);
  }
  if(profile==='reset'&&!ids.has('event:'+eventId))throw Error('Reset requires the retained exercise projection');
  return [...ids].sort();
}
async function snapshot(client:TypesenseClient,eventId:string){
  const ids:string[]=[];
  let expected:number|undefined;
  for(let page=1;page<=Math.ceil(MAX/250)+1;page++){
    const res=await client.collections(GLOBAL_SEARCH_COLLECTION).documents<{id:string;eventId:string}>().search({
      q:'*',query_by:'title',filter_by:'eventId:='+eventId,include_fields:'id,eventId',per_page:250,page
    });
    if(expected===undefined)expected=res.found;
    if(expected!==res.found||expected>MAX)throw Error('Incomplete search inventory');
    for(const hit of res.hits??[]){
      if(hit.document.eventId!==eventId||typeof hit.document.id!=='string')throw Error('Unexpected search scope');
      ids.push(hit.document.id);
    }
    if(ids.length>=expected)break;
    if(!(res.hits??[]).length)throw Error('Incomplete search inventory');
  }
  if(ids.length!==expected||new Set(ids).size!==ids.length)throw Error('Incomplete search inventory');
  return ids.sort();
}
/** Rebuild only the selected exercise from post-commit PostgreSQL projections.
 * Caller must prove DB commit, hold exclusive writer isolation, and supply
 * authoritative retained projections. Safe to retry after partial index failure;
 * never invoke on a live writer or use this as proof of relational deletion.
 * No production endpoint. */
export async function reconcileRetentionSearch(client:TypesenseClient,eventId:string,profile:Profile,docs:readonly SearchDocument[]){
  const expected=validateRetentionSearchProjection(eventId,profile,docs);
  const before=await snapshot(client,eventId);
  // Event filter is exact and UUID-validated. Never drop the whole collection.
  const result=await client.collections(GLOBAL_SEARCH_COLLECTION).documents().delete({filter_by:'eventId:='+eventId});
  if(result.num_deleted!==before.length)throw Error('Search removal count changed');
  if((await snapshot(client,eventId)).length!==0)throw Error('Search cleanup incomplete');
  for(const doc of docs)await client.collections(GLOBAL_SEARCH_COLLECTION).documents().upsert(doc);
  const after=await snapshot(client,eventId);
  if(JSON.stringify(after)!==JSON.stringify(expected))throw Error('Search reconciliation incomplete');
  return {removed:before.length,rebuilt:after.length};
}
