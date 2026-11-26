import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,randomUUID} from 'node:crypto';
import {mkdtemp,rm,readFile,writeFile,chmod,symlink,realpath} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {persistRecoveryManifest,loadRecoveryManifest,type RecoveryContext} from './retention-recovery-manifest.js';

test('encrypted manifest survives reopening, rejects tampering, wrong context, key and overwrite',async()=>{
  const root=await mkdtemp(join(await realpath(tmpdir()),'cyris-retention-'));
  const secret=randomBytes(32),context:RecoveryContext={installationId:randomUUID(),operationId:randomUUID(),eventId:randomUUID(),
    profile:'remove',sourceBucket:'source',recoveryBucket:'backup',planDigest:'a'.repeat(64)};
  const key='documents/'+context.eventId+'/private-document';
  const objects=[{key,sha256:'b'.repeat(64),size:5,etag:'"etag"',backupKey:'retention/'+context.operationId+'/0',contentType:'text/plain'}];
  const file=join(root,context.operationId+'.manifest.enc');
  try{
    assert.deepEqual(await persistRecoveryManifest(root,context,[key],objects,secret),{context,keys:[key],objects});
    const stored=await readFile(file);
    assert.ok(!stored.includes(Buffer.from('private-document')));
    assert.deepEqual(await loadRecoveryManifest(root,context,secret),{context,keys:[key],objects});
    await assert.rejects(persistRecoveryManifest(root,context,[key],objects,secret),/EEXIST/);
    await assert.rejects(loadRecoveryManifest(root,{...context,eventId:randomUUID()},secret),/context mismatch/);
    await assert.rejects(loadRecoveryManifest(root,{...context,profile:'reset'},secret),/context mismatch/);
    await assert.rejects(loadRecoveryManifest(root,{...context,planDigest:'c'.repeat(64)},secret),/context mismatch/);
    await assert.rejects(loadRecoveryManifest(root,context,randomBytes(32)),/authentication failed/);
    const envelope=JSON.parse(stored.toString('utf8'));
    envelope.tag=(envelope.tag[0]==='0'?'1':'0')+envelope.tag.slice(1);
    await writeFile(file,JSON.stringify(envelope));
    await assert.rejects(loadRecoveryManifest(root,context,secret),/authentication failed/);
    await writeFile(file,stored);await chmod(file,0o644);
    await assert.rejects(loadRecoveryManifest(root,context,secret),/Invalid recovery manifest file/);
    await chmod(file,0o600);
    const other={...context,operationId:randomUUID()};
    await symlink(file,join(root,other.operationId+'.manifest.enc'));
    await assert.rejects(loadRecoveryManifest(root,other,secret),/ELOOP/);
    await chmod(root,0o755);
    await assert.rejects(loadRecoveryManifest(root,context,secret),/private/);
  }finally{await chmod(root,0o700);await rm(root,{recursive:true,force:true});}
});
