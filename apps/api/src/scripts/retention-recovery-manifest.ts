import {createCipheriv,createDecipheriv,randomBytes,randomUUID} from 'node:crypto';
import {constants} from 'node:fs';
import {open,link,unlink,lstat,realpath} from 'node:fs/promises';
import {isAbsolute,join,resolve} from 'node:path';
import {validateRecoveryManifest,type RecoveryObject} from './retention-object-recovery.js';

export type RecoveryContext={installationId:string;operationId:string;eventId:string;profile:'reset'|'remove';
  sourceBucket:string;recoveryBucket:string;planDigest:string};
type ManifestPayload={context:RecoveryContext;keys:string[];objects:RecoveryObject[]};
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const hex=/^[0-9a-f]{64}$/;
const MAX_FILE=8*1024*1024;
const AAD=Buffer.from('CYRIS retention manifest v1','utf8');
function validateContext(c:RecoveryContext){
  if(!c||![c.installationId,c.operationId,c.eventId].every(v=>typeof v==='string'&&uuid.test(v))
    ||!['reset','remove'].includes(c.profile)||!hex.test(c.planDigest)
    ||typeof c.sourceBucket!=='string'||typeof c.recoveryBucket!=='string'
    ||!c.sourceBucket||!c.recoveryBucket||c.sourceBucket===c.recoveryBucket
    ||c.sourceBucket.length>255||c.recoveryBucket.length>255)throw Error('Invalid recovery context');
}
function canonicalContext(c:RecoveryContext):RecoveryContext{
  validateContext(c);
  return {installationId:c.installationId,operationId:c.operationId,eventId:c.eventId,profile:c.profile,
    sourceBucket:c.sourceBucket,recoveryBucket:c.recoveryBucket,planDigest:c.planDigest};
}
function validatePayload(p:ManifestPayload){
  if(!p||!Array.isArray(p.keys)||!Array.isArray(p.objects)||p.keys.some(k=>typeof k!=='string'||!k||Buffer.byteLength(k)>1024))throw Error('Invalid recovery payload');
  validateContext(p.context);
  for(const m of p.objects){
    if(!m||typeof m.key!=='string'||typeof m.backupKey!=='string'||typeof m.sha256!=='string'
      ||typeof m.etag!=='string'||m.etag.length>1024||typeof m.size!=='number'
      ||(m.contentType!==undefined&&(typeof m.contentType!=='string'||m.contentType.length>1024)))throw Error('Invalid recovery object');
  }
  validateRecoveryManifest(p.context.operationId,p.keys,p.objects);
}
function validateKey(key:Uint8Array){if(key.byteLength!==32)throw Error('Recovery key must be 32 bytes');}
function seal(payload:ManifestPayload,key:Uint8Array){
  validateKey(key);validatePayload(payload);
  const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);
  cipher.setAAD(AAD);
  const body=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  return Buffer.from(JSON.stringify({version:1,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),body:body.toString('base64')}),'utf8');
}
function unseal(bytes:Buffer,key:Uint8Array,expected:RecoveryContext):ManifestPayload{
  validateKey(key);validateContext(expected);
  if(bytes.length>MAX_FILE)throw Error('Recovery manifest exceeds file limit');
  let p:ManifestPayload;
  try{
    const envelope=JSON.parse(bytes.toString('utf8')) as {version:number;iv:string;tag:string;body:string};
    if(envelope.version!==1||typeof envelope.iv!=='string'||!/^[0-9a-f]{24}$/.test(envelope.iv)
      ||typeof envelope.tag!=='string'||!/^[0-9a-f]{32}$/.test(envelope.tag)||typeof envelope.body!=='string')throw Error('Invalid envelope');
    const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'hex'));
    decipher.setAAD(AAD);decipher.setAuthTag(Buffer.from(envelope.tag,'hex'));
    p=JSON.parse(Buffer.concat([decipher.update(Buffer.from(envelope.body,'base64')),decipher.final()]).toString('utf8')) as ManifestPayload;
    validatePayload(p);
  }catch{throw Error('Recovery manifest authentication failed');}
  if(JSON.stringify(canonicalContext(p.context))!==JSON.stringify(canonicalContext(expected)))throw Error('Recovery manifest context mismatch');
  return p;
}
/** Caller supplies a pre-provisioned private directory on independent recovery
 * media. This helper checks local permissions and symlinks, not independence of
 * the filesystem or custody of the external encryption key. */
async function privateDirectory(root:string){
  if(!isAbsolute(root)||resolve(root)!==root)throw Error('Recovery directory must be an absolute canonical path');
  const stat=await lstat(root);
  if(!stat.isDirectory()||stat.isSymbolicLink()||(stat.mode&0o077)!==0||await realpath(root)!==root
    ||(typeof process.getuid==='function'&&stat.uid!==process.getuid()))throw Error('Recovery directory must be private and owned by the operator');
  return root;
}
const filename=(root:string,context:RecoveryContext)=>join(root,context.operationId+'.manifest.enc');

/** Write once, private, fsync file, publish without overwrite, fsync directory.
 * No production endpoint. The recovery key must be held independently. */
export async function persistRecoveryManifest(root:string,context:RecoveryContext,keys:readonly string[],objects:readonly RecoveryObject[],key:Uint8Array){
  root=await privateDirectory(root);
  const payload={context:canonicalContext(context),keys:[...keys],objects:[...objects]};
  const bytes=seal(payload,key);
  if(bytes.length>MAX_FILE)throw Error('Recovery manifest exceeds file limit');
  const target=filename(root,context),temp=join(root,'.'+randomUUID()+'.tmp');
  const file=await open(temp,constants.O_CREAT|constants.O_EXCL|constants.O_WRONLY|constants.O_NOFOLLOW,0o600);
  try{await file.writeFile(bytes);await file.sync();}finally{await file.close();}
  try{
    // Hard-link atomically without overwriting an existing operation manifest.
    await link(temp,target);
    const directory=await open(root,constants.O_RDONLY|constants.O_DIRECTORY|constants.O_NOFOLLOW);
    try{await directory.sync();}finally{await directory.close();}
  }finally{await unlink(temp);}
  // Reopen and authenticate the published file before returning.
  return loadRecoveryManifest(root,context,key);
}
export async function loadRecoveryManifest(root:string,expected:RecoveryContext,key:Uint8Array){
  root=await privateDirectory(root);validateContext(expected);
  const file=await open(filename(root,expected),constants.O_RDONLY|constants.O_NOFOLLOW|constants.O_NONBLOCK);
  try{
    const stat=await file.stat();
    if(!stat.isFile()||(stat.mode&0o077)!==0||stat.size>MAX_FILE||(typeof process.getuid==='function'&&stat.uid!==process.getuid()))throw Error('Invalid recovery manifest file');
    // Bounded read even if an external process changes the file size.
    const bytes=Buffer.alloc(MAX_FILE+1);
    let offset=0;
    while(offset<bytes.length){
      const {bytesRead}=await file.read(bytes,offset,bytes.length-offset,null);
      if(bytesRead===0)break;
      offset+=bytesRead;
    }
    return unseal(bytes.subarray(0,offset),key,expected);
  }finally{await file.close();}
}
