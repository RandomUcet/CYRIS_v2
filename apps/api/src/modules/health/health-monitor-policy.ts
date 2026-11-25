export const HEALTH_KEYS=['postgres','redis','typesense','storage'] as const;
export type HealthKey=typeof HEALTH_KEYS[number];
export type HealthSamples=Partial<Record<HealthKey,number>>;
export function sampleHealth(previous:HealthSamples,states:Partial<Record<HealthKey,string>>){
 const samples:HealthSamples={},alerts:HealthKey[]=[];
 for(const key of HEALTH_KEYS){
  const n=states[key]==='down'?Math.min(2,(previous[key]??0)+1):0;
  samples[key]=n;if(n===2)alerts.push(key);
 }
 return {samples,alerts};
}
export function healthAlertKey(key:HealthKey,now:number){return 'platform-health:'+key+':'+Math.floor(now/(6*60*60*1000));}
