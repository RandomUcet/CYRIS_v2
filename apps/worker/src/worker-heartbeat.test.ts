import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,readFileSync,rmSync,existsSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WorkerHeartbeat} from './worker-heartbeat.js';
test('heartbeat records actual worker process and settled scheduler time separately',()=>{
 const dir=mkdtempSync(join(tmpdir(),'cyris-heartbeat-')),path=join(dir,'health.json');
 let now=1000;const heartbeat=new WorkerHeartbeat(path,()=>now);
 try{heartbeat.start();now=6000;heartbeat.publish();assert.deepEqual(JSON.parse(readFileSync(path,'utf8')),{pid:process.pid,heartbeatAt:6000,scenarioSettledAt:1000});
 now=7000;heartbeat.scenarioSettled();now=9000;heartbeat.publish();assert.equal(JSON.parse(readFileSync(path,'utf8')).scenarioSettledAt,7000);
 heartbeat.clear();assert.equal(existsSync(path),false);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
