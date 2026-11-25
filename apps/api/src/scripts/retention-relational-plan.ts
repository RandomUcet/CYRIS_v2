import {sql,type CyrisDatabase} from '@cyris/db';
type Tx=Parameters<Parameters<CyrisDatabase['transaction']>[0]>[0];
type Action='KEEP'|'DELETE'|'DETACH_AUDIT';
type Rule={parent?:string;column:string};
const ownership:Record<string,Rule>=Object.create(null);
const roots='event_memberships organizational_units roles audit_events activity_events identifier_counters resource_assignments resource_relationships resources ai_runs scenario_deliveries scenario_inject_actions scenario_inject_conditions scenario_inject_dependencies scenario_inject_releases scenario_inject_targets scenario_injects scenario_phases documents forensic_analyses technical_indicators court_cases operational_tasks medical_encounters evaluation_objectives evaluation_observations notifications scenario_data_batches scenario_clocks command_defcon_states exercise_disruptions recovery_objectives recovery_reports recovery_artifacts support_requests jsoc_synthetic_logs exercise_operation_holds scenario_draft_media court_requests exercise_broadcast_plans exercise_blueprints exercise_advice legal_library exercise_jobs exercise_observations'.split(' ');
for(const t of roots)ownership[t]={column:'event_id'};
ownership.events={column:'id'};
const children='membership_unit_assignments:event_memberships:membership_id unit_capabilities:organizational_units:unit_id role_permissions:roles:role_id role_assignments:roles:role_id resource_access_control:resources:resource_id registry_media:resources:resource_id persons:resources:id organisations:resources:id locations:resources:id vehicles:resources:id devices:resources:id weapons:resources:id licences:resources:id incidents:resources:id cases:resources:id evidence:resources:id lab_analyses:resources:id evidence_custody_transfers:evidence:evidence_id lab_analysis_evidence:lab_analyses:analysis_id scenario_inject_translations:scenario_injects:inject_id scenario_briefing_receipts:scenario_inject_releases:release_id document_versions:documents:document_id forensic_acquisitions:forensic_analyses:analysis_id forensic_analysis_devices:forensic_analyses:analysis_id forensic_analysis_evidence:forensic_analyses:analysis_id forensic_findings:forensic_analyses:analysis_id charges:court_cases:court_case_id court_case_parties:court_cases:court_case_id court_decisions:court_cases:court_case_id court_exhibits:court_cases:court_case_id court_filings:court_cases:court_case_id court_hearings:court_cases:court_case_id medical_interventions:medical_encounters:encounter_id medical_observations:medical_encounters:encounter_id evaluation_criteria:evaluation_objectives:objective_id court_request_updates:court_requests:request_id support_messages:support_requests:request_id'.split(' ');
for(const value of children){const [t,parent,column]=value.split(':');ownership[t!]={parent:parent!,column:column!};}
const globalTables=new Set('users user_identities user_preferences preview_team_accounts integrations integration_secrets outbox_events removed_exercise_receipts'.split(' '));
const keep=new Set('events event_memberships organizational_units membership_unit_assignments unit_capabilities roles role_permissions role_assignments identifier_counters audit_events'.split(' '));
const ident=(s:string)=>'"'+s.replaceAll('"','""')+'"';
const relation=(s:string,t:string)=>ident(s)+'.'+ident(t);
const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function retentionAction(table:string,profile:'reset'|'remove'):Action{
  if(!ownership[table])throw new Error('Unclassified table');
  if(table==='audit_events')return 'KEEP';
  return profile==='reset'&&keep.has(table)?'KEEP':'DELETE';
}
function owned(table:string,alias:string,eventId:string,depth=0):string{
  if(!uuid.test(eventId))throw new Error('Invalid event ID');
  const rule=ownership[table];if(!rule)throw new Error('Unclassified table');
  if(!rule.parent)return alias+'.'+ident(rule.column)+" = '"+eventId+"'::uuid";
  const p='owner_'+depth;
  return 'EXISTS(SELECT 1 FROM '+relation('public',rule.parent)+' '+p+' WHERE '+p+'.id='+alias+'.'+ident(rule.column)+' AND '+owned(rule.parent,p,eventId,depth+1)+')';
}
/** Fixed ownership predicate for internal relational rehearsal; never accept an arbitrary alias or table name. */
export function retentionOwnershipPredicate(table:string,eventId:string):string{
  return owned(table,'r',eventId);
}
export function childFirstRetentionOrder(tables:readonly string[],edges:readonly {child:string;parent:string}[]):string[]{
  const remaining=new Set(tables),order:string[]=[];
  if(remaining.size!==tables.length)throw new Error('Duplicate deletion table');
  while(remaining.size){
    const ready=[...remaining].filter(t=>!edges.some(e=>e.parent===t&&e.child!==t&&remaining.has(e.child))).sort();
    if(!ready.length)throw new Error('Unsupported cyclic table dependencies');
    for(const t of ready){remaining.delete(t);order.push(t);}
  }
  return order;
}
type Table={name:string;kind:string;columns:string[]};
type Edge={name:string;cs:string;ct:string;ps:string;pt:string;cc:string[];pc:string[]};
export async function inspectRelationalRetention(tx:Tx,eventId:string){
  if(!uuid.test(eventId))throw new Error('Invalid event ID');
  const catalog=await tx.execute<Table>(sql`SELECT c.relname AS name,c.relkind AS kind,
    ARRAY(SELECT a.attname::text FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attnum>0 AND NOT a.attisdropped) AS columns
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='public' AND c.relkind IN ('r','p') ORDER BY c.relname`);
  const actual=new Map(catalog.map(t=>[t.name,t]));
  const unknownTables=catalog.filter(t=>!ownership[t.name]&&!globalTables.has(t.name)).map(t=>t.name);
  const missingTables=Object.keys(ownership).filter(t=>!actual.has(t)).sort();
  const unsupportedTables=Object.entries(ownership).filter(([name,rule])=>{
    const t=actual.get(name);return t&&(t.kind!=='r'||!t.columns.includes(rule.column)||(rule.parent&&!actual.get(rule.parent)?.columns.includes('id')));
  }).map(([name])=>name).sort();
  const usable=new Set(Object.keys(ownership).filter(t=>actual.has(t)&&!unsupportedTables.includes(t)));
  for(let i=0;i<Object.keys(ownership).length;i++)for(const t of usable){const p=ownership[t]!.parent;if(p&&!usable.has(p))usable.delete(t);}
  const tables:{table:string;count:number;reset:Action;remove:Action}[]=[];
  for(const table of [...usable].sort()){
    const [row]=await tx.execute<{count:number}>(sql.raw('SELECT count(*)::integer AS count FROM '+relation('public',table)+' r WHERE '+owned(table,'r',eventId)));
    tables.push({table,count:Number(row?.count??0),reset:retentionAction(table,'reset'),remove:retentionAction(table,'remove')});
  }
  const edges=await tx.execute<Edge>(sql`SELECT c.conname AS name,cn.nspname AS cs,ct.relname AS ct,pn.nspname AS ps,pt.relname AS pt,
    ARRAY(SELECT a.attname::text FROM unnest(c.conkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.conrelid AND a.attnum=k.n ORDER BY k.o) AS cc,
    ARRAY(SELECT a.attname::text FROM unnest(c.confkey) WITH ORDINALITY k(n,o) JOIN pg_attribute a ON a.attrelid=c.confrelid AND a.attnum=k.n ORDER BY k.o) AS pc
    FROM pg_constraint c JOIN pg_class ct ON ct.oid=c.conrelid JOIN pg_namespace cn ON cn.oid=ct.relnamespace
    JOIN pg_class pt ON pt.oid=c.confrelid JOIN pg_namespace pn ON pn.oid=pt.relnamespace
    WHERE c.contype='f' AND (cn.nspname='public' OR pn.nspname='public') ORDER BY cn.nspname,ct.relname,c.conname`);
  const conflicts:{child:string;parent:string;constraint:string;count:number}[]=[];
  let checkedForeignKeys=0;
  for(const e of edges){
    const c=e.cs==='public'&&usable.has(e.ct),p=e.ps==='public'&&usable.has(e.pt);
    if(!c&&!p||c&&!p&&e.ps==='public'&&globalTables.has(e.pt))continue;
    const join=e.cc.map((x,i)=>'c.'+ident(x)+'=p.'+ident(e.pc[i]!)).join(' AND ');
    if(!join||e.cc.length!==e.pc.length)throw new Error('Invalid FK catalog');
    const cm=c?'('+owned(e.ct,'c',eventId)+') IS TRUE':'FALSE',pm=p?'('+owned(e.pt,'p',eventId)+') IS TRUE':'FALSE';
    const [row]=await tx.execute<{count:number}>(sql.raw('SELECT count(*)::integer AS count FROM '+relation(e.cs,e.ct)+' c JOIN '+relation(e.ps,e.pt)+' p ON '+join+' WHERE ('+cm+') <> ('+pm+')'));
    checkedForeignKeys++;const count=Number(row?.count??0);
    if(count)conflicts.push({child:e.cs+'.'+e.ct,parent:e.ps+'.'+e.pt,constraint:e.name,count});
  }
  if(usable.has('operational_tasks')&&usable.has('resources')){
    const [row]=await tx.execute<{count:number}>(sql.raw('SELECT count(*)::integer AS count FROM public.operational_tasks c JOIN public.resources p ON c.source_resource_id=p.id WHERE (('+owned('operational_tasks','c',eventId)+') IS TRUE) <> (('+owned('resources','p',eventId)+') IS TRUE)'));
    if(row?.count)conflicts.push({child:'public.operational_tasks',parent:'public.resources',constraint:'source_resource_id (legacy)',count:Number(row.count)});
  }
  const total=(p:'reset'|'remove')=>tables.reduce((n,t)=>n+(t[p]==='DELETE'?t.count:0),0);
  return {mode:'READ_ONLY' as const,tables,unknownTables,missingTables,unsupportedTables,checkedForeignKeys,conflicts,
    resetRows:total('reset'),removeRows:total('remove'),auditRows:tables.find(t=>t.table==='audit_events')?.count??0,
    executable:false as const,unresolved:['JSON_AND_EXTERNAL_REFERENCES','RECOVERY_AND_EXECUTION_GATE']};
}
