import {sql,defaultSearchProjectionRegistry,type CyrisDatabase} from '@cyris/db';
import type {S3Client} from '@aws-sdk/client-s3';
import type {Redis} from 'ioredis';
import type {Client as TypesenseClient} from 'typesense';
import {loadRecoveryManifest,type RecoveryContext} from './retention-recovery-manifest.js';
import {resumeStagedRemoval} from './retention-object-recovery.js';
import {readRetentionCommit} from './retention-commit-witness.js';
import {inspectRetentionRedis,removeRetentionRedisCache} from './retention-redis.js';
import {reconcileRetentionSearch,validateRetentionSearchProjection} from './retention-search.js';

/** Internal rehearsal only; caller must hold writer isolation and independently
 * verify backups, manifest ownership and installation identity. This function
 * deliberately has no production route. Never retry the relational deletion
 * based on an external service failure. Reopen the authenticated manifest
 * and read the committed DB witness instead. */
export async function finishCommittedRetention(input:{
  db:CyrisDatabase;redis:Redis;search:TypesenseClient;source:S3Client;recovery:S3Client;
  root:string;context:RecoveryContext;key:Uint8Array;
}){
  const {db,redis,search,source,recovery,root,context,key}=input;
  const manifest=await loadRecoveryManifest(root,context,key);
  const projections=await db.transaction(async tx=>{
    if(!await readRetentionCommit(tx,context))throw Error('Relational commit not proven');
    const [event]=await tx.execute<{status:string}>(sql`SELECT status FROM events WHERE id=${context.eventId}::uuid`);
    if(context.profile==='reset'&&event?.status!=='ARCHIVED')throw Error('Reset exercise is not archived');
    if(context.profile==='remove'&&event)throw Error('Removed exercise still exists');
    if(context.profile==='remove'){
      const [receipt]=await tx.execute<{id:string}>(sql`SELECT event_id AS id FROM removed_exercise_receipts WHERE event_id=${context.eventId}::uuid`);
      if(!receipt)throw Error('Removed exercise receipt missing');
    }
    const docs=await defaultSearchProjectionRegistry.listAllDocuments(tx,context.eventId);
    validateRetentionSearchProjection(context.eventId,context.profile,docs);
    return docs;
  });
  const redisPlan=await inspectRetentionRedis(redis,context.eventId);
  if(redisPlan.counts.unknown||redisPlan.counts.unreviewedQueue||redisPlan.aiWork)throw Error('Unreconciled Redis work');
  const objects=await resumeStagedRemoval(source,recovery,context.sourceBucket,context.recoveryBucket,context.operationId,manifest.keys,manifest.objects);
  const cache=await removeRetentionRedisCache(redis,context.eventId,redisPlan.digest);
  const index=await reconcileRetentionSearch(search,context.eventId,context.profile,projections);
  return {objects,cache,index};
}
