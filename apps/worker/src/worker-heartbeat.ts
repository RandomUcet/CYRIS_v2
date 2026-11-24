import {writeFileSync,renameSync,unlinkSync} from 'node:fs';
export const WORKER_HEALTH_PATH='/tmp/cyris-worker-health.json';
export class WorkerHeartbeat{
 private lastScenario=0;
 constructor(private readonly path=WORKER_HEALTH_PATH,private readonly now=()=>Date.now()){}
 start(){this.lastScenario=this.now();this.publish();}
 scenarioSettled(){this.lastScenario=this.now();}
 publish(){
  const temp=this.path+'.tmp';
  writeFileSync(temp,JSON.stringify({pid:process.pid,heartbeatAt:this.now(),scenarioSettledAt:this.lastScenario}),{mode:0o600});
  renameSync(temp,this.path);
 }
 clear(){for(const path of [this.path,this.path+'.tmp'])try{unlinkSync(path);}catch(e){if((e as NodeJS.ErrnoException).code!=='ENOENT')throw e;}}
}
