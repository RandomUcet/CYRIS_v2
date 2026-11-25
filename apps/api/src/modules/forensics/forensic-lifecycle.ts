export const forensicTransitions:Readonly<Record<string,readonly string[]>>={
 REQUESTED:['ACCEPTED','REJECTED','CANCELLED'],ACCEPTED:['IN_PROGRESS','CANCELLED'],IN_PROGRESS:['COMPLETED','CANCELLED'],COMPLETED:['APPROVED','IN_PROGRESS'],APPROVED:[],REJECTED:[],CANCELLED:[]
};
export function canEditForensicReport(status:string){return status==='ACCEPTED'||status==='IN_PROGRESS';}
export function canTransitionForensic(from:string,to:string){return Object.hasOwn(forensicTransitions,from)&&forensicTransitions[from]!.includes(to);}
