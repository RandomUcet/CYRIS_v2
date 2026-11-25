/** Stable, curated operator labels; unknown actions keep their exact code. */
const actions:Record<string,readonly [string,string]>={
 'evidence.created':['Založení důkazu','Evidence created'],
 'evidence.updated':['Úprava důkazu','Evidence updated'],
 'evidence.transferred':['Předání důkazu','Evidence transferred'],
 'incident.created':['Založení incidentu','Incident created'],
 'incident.updated':['Úprava incidentu','Incident updated'],
 'case.created':['Založení případu','Case created'],
 'case.updated':['Úprava případu','Case updated'],
 'case.closed':['Uzavření případu','Case closed'],
 'task.created':['Založení úkolu','Task created'],
 'task.assigned':['Přiřazení úkolu','Task assigned'],
 'task.updated':['Úprava úkolu','Task updated'],
 'task.completed':['Dokončení úkolu','Task completed'],
 'task.cancelled':['Zrušení úkolu','Task cancelled'],
 'task.reopened':['Znovuotevření úkolu','Task reopened'],
 'task.acknowledged':['Přijetí úkolu','Task acknowledged'],
 'task.started':['Zahájení úkolu','Task started'],
 'task.blocked':['Zablokování úkolu','Task blocked'],
 'document.created':['Založení dokumentu','Document created'],
 'document.versioned':['Nová verze dokumentu','Document version added'],
 'court.case.created':['Založení soudního případu','Court case created'],
 'court.case.status_updated':['Změna stavu soudního případu','Court case status updated'],
 'court.party.added':['Přidání strany řízení','Court party added'],
 'court.charge.added':['Přidání obvinění','Charge added'],
 'court.exhibit.submitted':['Předložení důkazu soudu','Exhibit submitted'],
 'court.hearing.scheduled':['Nařízení jednání','Hearing scheduled'],
 'court.filing.created':['Podání k soudu','Court filing created'],
 'court.decision.issued':['Vydání rozhodnutí','Court decision issued'],
 'scenario.inject.created':['Založení scénářového vstupu','Inject created'],
 'scenario.inject.prepared':['Příprava scénářového vstupu','Inject prepared'],
 'exercise.advice.reviewed':['Posouzení návrhu AI','AI proposal reviewed'],
 'exercise.advice.inject_setup':['Založení návrhu scénářových vstupů','Inject plan applied'],
 'platform.maintenance.check':['Servisní kontrola','Maintenance check'],
 'platform.maintenance.spark_probe':['Test inference Sparku','Spark inference test'],
};
export function auditActionLabel(action:string,cs:boolean){return Object.hasOwn(actions,action)?actions[action]![cs?0:1]:action;}
export function auditOutcomeLabel(outcome:string,cs:boolean){
 if(outcome==='SUCCESS')return cs?'Úspěch':'Success';
 if(outcome==='DENIED')return cs?'Zamítnuto':'Denied';
 if(outcome==='FAILURE')return cs?'Selhání':'Failure';
 return outcome;
}
