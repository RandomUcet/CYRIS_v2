import type {JsocLog} from '@cyris/contracts';
export function formatSimulatedLog(entry:JsocLog):string{
 return ['SIMULACE / EXERCISE ONLY — JSOC', 'Event: '+entry.eventId,'Record: '+entry.id,'Dataset: '+entry.scenario,'Observed (UTC): '+entry.observedAt,'Category: '+entry.category,'Severity: '+entry.severity,'Source: '+entry.source,'Source IP (documentation): '+(entry.sourceAddress??'—'),'Destination IP (documentation): '+(entry.destinationAddress??'—'),'Message: '+entry.message].join('\n');
}
