export type GenerationJob = {
 state:'QUEUED'|'RUNNING'|'PAUSED'|'FAILED'|'COMPLETED'|'INTERRUPTED';
 actorId:string;attempts:number;availableAt:number;updatedAt:number;
 token?:string;leaseUntil?:number;pauseRequested?:boolean;error?:string;
};
export function isLive(job?:GenerationJob){return job?.state==='QUEUED'||job?.state==='RUNNING';}
export function queuedGeneration(actorId:string,now:number):GenerationJob{
 return {state:'QUEUED',actorId,attempts:0,availableAt:now,updatedAt:now};
}
export function finishGenerationPage(job:GenerationJob,complete:boolean,now:number):GenerationJob{
 return {...queuedGeneration(job.actorId,now),state:complete?'COMPLETED':job.pauseRequested?'PAUSED':'QUEUED'};
}
export function failGenerationPage(job:GenerationJob,code:string,now:number):GenerationJob{
 const retry=code==='CAPACITY'&&job.attempts<3&&!job.pauseRequested;
 return {state:job.pauseRequested?'PAUSED':retry?'QUEUED':'FAILED',actorId:job.actorId,attempts:job.attempts,availableAt:now+(retry?job.attempts*30000:0),updatedAt:now,error:code};
}
export function expireGeneration(job:GenerationJob,now:number):GenerationJob{
 return {state:'INTERRUPTED',actorId:job.actorId,attempts:job.attempts,availableAt:now,updatedAt:now,error:'LEASE_EXPIRED'};
}
export function generationView(job:GenerationJob){
 return {state:job.state,attempts:job.attempts,updatedAt:new Date(job.updatedAt).toISOString(),pauseRequested:!!job.pauseRequested,error:job.error};
}
