/** Only larger groups need disclosure; never hide the active route. */
export function navigationSectionMode(count:number,rail:boolean,active:boolean,manuallyClosed?:boolean):'direct'|'heading'|'open'|'closed'{
 if(rail||count<=1)return 'direct';
 if(count<=4)return 'heading';
 return manuallyClosed&&!active?'closed':'open';
}
