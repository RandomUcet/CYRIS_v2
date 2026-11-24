import type {ExconDashboardResponse} from '@cyris/contracts';
type Snapshot=Pick<ExconDashboardResponse,'holds'|'broadcasts'|'participation'|'injects'>;
export function exconAttention(snapshot:Snapshot){
 return [
 {key:'holds',count:snapshot.holds.active,cs:'Provozní blokace cvičení',en:'Exercise operational holds',route:'/command'},
 {key:'failed',count:snapshot.broadcasts.failed,cs:'Neúspěšné plánované zprávy',en:'Failed scheduled broadcasts',route:'/broadcast'},
 {key:'urgent',count:snapshot.participation.urgentUnread,cs:'Nepřečtená urgentní doručení',en:'Unread urgent deliveries',route:'/broadcast'},
 {key:'ready',count:snapshot.injects.ready,cs:'Vstupy připravené k vydání',en:'Injects ready for release',route:'/scenario/control'},
 {key:'blocked',count:snapshot.injects.blocked,cs:'Vstupy čekající na podmínky',en:'Injects awaiting conditions',route:'/scenario/control'},
 ].filter(item=>item.count>0);
}
export function snapshotFreshness(asOf:string|undefined,now:number,automatic:boolean,failed:boolean):'fresh'|'stale'|'paused'{
 const timestamp=Date.parse(asOf??'');
 if(failed||!Number.isFinite(timestamp)||now-timestamp>60000||timestamp-now>60000)return 'stale';
 return automatic?'fresh':'paused';
}
