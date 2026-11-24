import type { CourtRequestItem } from '@cyris/contracts';
type RequestRow=Pick<CourtRequestItem,'status'|'dueAt'|'createdAt'|'kind'|'subject'|'details'|'response'|'requestedFromUnitId'>;
export const requestPending=(row:Pick<RequestRow,'status'>)=>row.status==='OPEN'||row.status==='IN_PROGRESS';
export function requestOverdue(row:Pick<RequestRow,'status'|'dueAt'>,now:number):boolean {
  return requestPending(row)&&row.dueAt!==null&&Number.isFinite(Date.parse(row.dueAt))&&Date.parse(row.dueAt)<now;
}
const normalize=(s:string)=>s.normalize('NFD').replace(/\p{M}/gu,'').toLowerCase().trim();
export function legalRequestQueue<T extends RequestRow>(rows:readonly T[],filter:{status:string;kind:string;query:string;deadline:string},now:number):T[]{
  const terms=normalize(filter.query).split(/\s+/).filter(Boolean);
  return rows.filter(row=>
    (filter.status==='ALL'||(filter.status==='PENDING'?requestPending(row):row.status===filter.status))&&
    (filter.kind==='ALL'||row.kind===filter.kind)&&
    (filter.deadline!=='OVERDUE'||requestOverdue(row,now))&&
    terms.every(term=>normalize([row.subject,row.details,row.kind,row.response??''].join(' ')).includes(term))
  ).sort((a,b)=>{
    const urgency=Number(requestOverdue(b,now))-Number(requestOverdue(a,now));
    if(urgency)return urgency;
    const pending=Number(requestPending(b))-Number(requestPending(a));
    if(pending)return pending;
    if(requestPending(a)&&requestPending(b)){
      const deadline=(x:T)=>x.dueAt&&Number.isFinite(Date.parse(x.dueAt))?Date.parse(x.dueAt):Infinity;
      if(deadline(a)!==deadline(b))return deadline(a)<deadline(b)?-1:1;
    }
    return Date.parse(b.createdAt)-Date.parse(a.createdAt);
  });
}
export function legalRequestCounts(rows:readonly RequestRow[],now:number){
  return {total:rows.length,pending:rows.filter(requestPending).length,overdue:rows.filter(row=>requestOverdue(row,now)).length,fulfilled:rows.filter(row=>row.status==='FULFILLED').length};
}
