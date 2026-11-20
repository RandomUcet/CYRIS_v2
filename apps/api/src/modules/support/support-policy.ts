export function supportVisibility(canManage:boolean, actorId:string, requesterId:string):boolean {
  return canManage||actorId===requesterId;
}
export function nextSupportReply(status:string,canManage:boolean,actorId:string,requesterId:string):{authorKind:'EXCON'|'PARTICIPANT',status:'ANSWERED'|'OPEN'}|null {
  if(status==='RESOLVED'||!supportVisibility(canManage,actorId,requesterId))return null;
  return canManage&&actorId!==requesterId?{authorKind:'EXCON',status:'ANSWERED'}:{authorKind:'PARTICIPANT',status:'OPEN'};
}
