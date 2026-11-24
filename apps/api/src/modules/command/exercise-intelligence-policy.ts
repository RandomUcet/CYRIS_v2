import {ExerciseAdviceDraftSchema,type ExerciseSignal,type ExconDashboardResponse} from '@cyris/contracts';
export function exerciseSignals(snapshot:ExconDashboardResponse):ExerciseSignal[]{
 return [
 {id:'failed-broadcasts',level:'HIGH',label:'Failed scheduled broadcasts',labelCs:'Neúspěšné plánované zprávy',count:snapshot.broadcasts.failed,source:'broadcasts.failed',href:'/broadcast'},
 {id:'urgent-unread',level:'HIGH',label:'Unread urgent deliveries',labelCs:'Nepřečtená urgentní doručení',count:snapshot.participation.urgentUnread,source:'participation.urgentUnread',href:'/broadcast'},
 {id:'blocked-injects',level:'MEDIUM',label:'Injects awaiting conditions',labelCs:'Vstupy čekající na podmínky',count:snapshot.injects.blocked,source:'injects.blocked',href:'/scenario/control'},
 {id:'ready-injects',level:'MEDIUM',label:'Ready scenario injects',labelCs:'Připravené scénářové vstupy',count:snapshot.injects.ready,source:'injects.ready',href:'/scenario/control'},
 {id:'unacknowledged-briefings',level:'MEDIUM',label:'Unacknowledged briefing receipts',labelCs:'Nepotvrzená doručení briefingů',count:Math.max(0,snapshot.participation.briefingReceipts-snapshot.participation.briefingsAcknowledged),source:'participation.briefingReceipts - briefingsAcknowledged',href:'/scenario/control'},
 ] satisfies ExerciseSignal[];
}
export function validateExerciseDraft(text:string,signals:readonly ExerciseSignal[],allowPhasePlan=false){
 const raw=text.trim().replace(/^\x60\x60\x60(?:json)?\s*/i,'').replace(/\s*\x60\x60\x60$/,'');
 if(raw.length>30000)throw Error('Oversized draft');
 const draft=ExerciseAdviceDraftSchema.parse(JSON.parse(raw));
 const ids=new Set(signals.map(s=>s.id));
 if(draft.actions.some(a=>a.signalIds.some(id=>!ids.has(id))))throw Error('Unknown signal reference');
 if(draft.actions.some(a=>a.phasePlan&&(!allowPhasePlan||a.module!=='SCENARIO')))throw Error('Phase plans require architect scenario actions and a saved blueprint');
 if(draft.actions.filter(a=>a.phasePlan).length>1)throw Error('Only one phase plan per draft');
 return draft;
}
