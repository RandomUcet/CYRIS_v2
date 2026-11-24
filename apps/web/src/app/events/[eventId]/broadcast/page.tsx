'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';
import { containsUnfilledBroadcastTemplate } from '@/lib/quick-broadcast-validation';
import { broadcastComposerControls, copyBroadcastPlan, broadcastAudienceKey, filterBroadcastRows } from '@/lib/broadcast-composer';
import type { ExerciseBroadcastHistory, ExerciseBroadcastRequest, ExerciseBroadcastPlanResponse } from '@cyris/contracts';

type Kind = ExerciseBroadcastRequest['kind'];
const types: Array<{key:Kind;cs:string;en:string;hintCs:string;hintEn:string}> = [
  {key:'INFO',cs:'Oznámení',en:'Announcement',hintCs:'Provozní informace pro účastníky',hintEn:'General exercise information'},
  {key:'UPDATE',cs:'Změna situace',en:'Situation update',hintCs:'Novinky v průběhu cvičení',hintEn:'Updates during the exercise'},
  {key:'INSTRUCTION',cs:'Pokyn k akci',en:'Action instruction',hintCs:'Vyžaduje pozornost týmu',hintEn:'Requires participant attention'},
  {key:'URGENT',cs:'Urgentní upozornění',en:'Urgent notice',hintCs:'Povinné oznámení i pro uživatele s vypnutými notifikacemi',hintEn:'Mandatory in-app notice regardless of notification preferences'},
];

export default function ExerciseBroadcastPage() {
  const { eventId } = useParams<{eventId:string}>();
  return <BroadcastWorkspace key={eventId} eventId={eventId}/>;
}

function BroadcastWorkspace({eventId}:{eventId:string}) {
  const { locale } = usePreferences();
  const { viewAs } = useAuth();
  const cs = locale === 'cs';
  const tr = (cz:string,en:string) => cs?cz:en;
  const [teams,setTeams] = useState<Array<{id:string;name:string}>>([]);
  const [kind,setKind] = useState<Kind>('INFO');
  const [audience,setAudience] = useState<'ALL'|'UNIT'>('ALL');
  const [unitId,setUnitId] = useState('');
  const [title,setTitle] = useState('');
  const [message,setMessage] = useState('');
  const [audiencePreview,setAudiencePreview] = useState<{key:string;eligible:number}|null>(null);
  const audienceKey=broadcastAudienceKey(eventId,kind,audience,unitId);
  const eligible=audiencePreview?.key===audienceKey?audiencePreview.eligible:null;
  const [previewRevision,setPreviewRevision]=useState(0);
  const [audienceError,setAudienceError]=useState('');
  const [search,setSearch]=useState('');
  const [kindFilter,setKindFilter]=useState('ALL');
  const [statusFilter,setStatusFilter]=useState('ALL');
  const mutation=useRef(false);
  const [history,setHistory] = useState<ExerciseBroadcastHistory>([]);
  const [plans,setPlans] = useState<ExerciseBroadcastPlanResponse[]>([]);
  const [editing,setEditing] = useState<ExerciseBroadcastPlanResponse|null>(null);
  const [planBusy,setPlanBusy] = useState(false);
  const [scheduleAt,setScheduleAt] = useState('');
  const planNonce=useRef<string|null>(null);
  const [loading,setLoading] = useState(true);
  const [sending,setSending] = useState(false);
  const [aiBusy,setAiBusy] = useState(false);
  const [aiDraft,setAiDraft] = useState('');
  const [aiError,setAiError] = useState('');
  const inputRevision=useRef(0);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const nonce = useRef<string|null>(null);
  const readOnly = Boolean(viewAs);
  const hasPlaceholders=containsUnfilledBroadcastTemplate(title+' '+message);

  function changed(){ nonce.current=null;planNonce.current=null;setSuccess('');setAiDraft('');setAiError('');inputRevision.current++; }
  async function aiImprove() {
    if(!message.trim()||aiBusy||readOnly)return;
    const startedWith=inputRevision.current;
    setAiBusy(true);setAiDraft('');setAiError('');
    try {
      const result=await apiClient.writingAssist(eventId,{
        text:message.trim(),action:'CONCISE',
        context:'CYRIS EXCON broadcast for participants: improve clarity without adding any facts, dates or instructions; preserve uncertainty and urgency.',
      });
      if(!result.ok||!result.data)throw new Error(result.error||'AI writing assistant is unavailable');
      if(startedWith===inputRevision.current)setAiDraft(result.data.draft);
    }catch(err){if(startedWith===inputRevision.current)setAiError(err instanceof Error?err.message:'AI unavailable');}
    finally{setAiBusy(false);}
  }
  async function refresh() {
    const [units,items,saved] = await Promise.all([
      apiClient.getExerciseBroadcastTeams(eventId),
      apiClient.listExerciseBroadcasts(eventId),
      apiClient.getExerciseBroadcastPlans(eventId),
    ]);
    if (!units.ok || !units.data) throw new Error(units.error || tr('Týmy nejsou dostupné.','Teams unavailable.'));
    if (!items.ok || !items.data) throw new Error(items.error || tr('Historie není dostupná.','History unavailable.'));
    if (!saved.ok || !saved.data) throw new Error(saved.error || tr('Plánované zprávy nejsou dostupné.','Planned notices unavailable.'));
    setTeams(units.data);setHistory(items.data);setPlans(saved.data);
  }
  useEffect(()=>{
    let live=true;
    setLoading(true);setError('');setTeams([]);setHistory([]);setPlans([]);setEditing(null);setScheduleAt('');setAudience('ALL');setUnitId('');
    void Promise.all([apiClient.getExerciseBroadcastTeams(eventId),apiClient.listExerciseBroadcasts(eventId),apiClient.getExerciseBroadcastPlans(eventId)])
      .then(([u,h,p])=>{
        if(!live)return;
        if(!u.ok||!u.data||!h.ok||!h.data||!p.ok||!p.data)throw new Error(u.error||h.error||p.error||'Unable to load exercise broadcasts');
        setTeams(u.data);setHistory(h.data);setPlans(p.data);
      }).catch(e=>{if(live)setError(e instanceof Error?e.message:'Unable to load');})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[eventId]);
  useEffect(()=>{
    let live=true;setAudiencePreview(null);setAudienceError('');
    if(loading || (audience==='UNIT'&&!unitId))return ()=>{live=false;};
    void apiClient.previewExerciseBroadcastAudience(eventId, {
      audience,kind,...(audience==='UNIT'?{unitId}:{})
    }).then(r=>{
      if(!live)return;
      if(r.ok&&r.data)setAudiencePreview({key:audienceKey,eligible:r.data.eligible});
      else setAudienceError(r.error||'Audience unavailable');
    }).catch(()=>{if(live)setAudienceError(tr('Příjemce nelze ověřit.','Audience unavailable.'));});
    return ()=>{live=false;};
  },[eventId,kind,audience,unitId,loading,history.length,previewRevision]);

  async function send(ev:FormEvent) {
    ev.preventDefault();
    if(mutation.current||hasPlaceholders||!broadcastComposerControls({readOnly,loading,sending,planBusy,editingDraft:Boolean(editing),
      eligible,audience,unitId,title,message}).canSendNow)return;
    const confirmation = window.confirm(tr(
      'Odeslat '+types.find(t=>t.key===kind)?.cs+' ('+eligible+' příjemců) v rámci tohoto cvičení? Tato akce se zaznamená do auditu.',
      'Send '+kind+' to '+eligible+' participants in this exercise? This action will be audited.'
    ));
    if(!confirmation)return;
    mutation.current=true;setSending(true);setError('');setSuccess('');
    try{
      const latest=await apiClient.previewExerciseBroadcastAudience(eventId,{kind,audience,...(audience==='UNIT'?{unitId}:{})});
      if(!latest.ok||!latest.data)throw Error(latest.error||tr('Nelze ověřit příjemce.','Unable to verify recipients.'));
      if(latest.data.eligible!==eligible){
        setAudiencePreview({key:audienceKey,eligible:latest.data.eligible});
        setError(tr('Počet příjemců se změnil. Zkontrolujte jej a potvrďte odeslání znovu.','Recipient count changed. Review and confirm delivery again.'));
        return;
      }
      nonce.current ||= crypto.randomUUID();
      const common = {nonce: nonce.current,kind,title:title.trim(),message:message.trim()};
      const payload: ExerciseBroadcastRequest = audience==='UNIT'
        ? {...common,audience:'UNIT',unitId}
        : {...common,audience:'ALL'};
      const result=await apiClient.sendExerciseBroadcast(eventId,payload);
      if(!result.ok||!result.data)throw new Error(result.error||'Could not send broadcast');
      setSuccess(tr('Doručeno '+result.data.delivered+' účastníkům.','Delivered to '+result.data.delivered+' participants.')
        +(result.data.repeated?tr(' (Bez duplicit.)',' (No duplicates.)'):''));
      nonce.current=null;
      setTitle('');setMessage('');
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Send failed');}
    finally{mutation.current=false;setSending(false);}
  }

  function resetEditor() {
    setEditing(null);setTitle('');setMessage('');setKind('INFO');setAudience('ALL');setUnitId('');setScheduleAt('');
    changed();
  }
  function loadDraft(plan:ExerciseBroadcastPlanResponse) {
    if(plan.status!=='DRAFT'||mutation.current||readOnly)return;
    if((title.trim()||message.trim())&&!window.confirm(tr('Nahradit rozepsanou zprávu?','Replace the unsaved message?')))return;
    setEditing(plan);setTitle(plan.title);setMessage(plan.message);
    setKind(plan.kind);setAudience(plan.audience);setUnitId(plan.unitId??'');
    setScheduleAt('');
    changed();
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function copyPlan(plan:ExerciseBroadcastPlanResponse) {
    if(readOnly||sending||planBusy||mutation.current)return;
    if((title.trim()||message.trim())&&!window.confirm(tr('Nahradit rozepsanou zprávu?','Replace the unsaved message?')))return;
    const copied=copyBroadcastPlan(plan);
    setEditing(null);
    setTitle(copied.title);setMessage(copied.message);setKind(copied.kind);
    setAudience(copied.audience);setUnitId(copied.unitId);setScheduleAt('');
    // Always generate a fresh idempotency key on explicit user confirmation.
    changed();
    setSuccess(tr('Zpráva byla zkopírována do nového návrhu. Před odesláním ji zkontrolujte.',
      'Copied into a new message. Review before sending.'));
    window.scrollTo({top:0,behavior:'smooth'});
  }
  function localTimeToIso(value:string):string {
    const date=new Date(value);
    if(!value||!Number.isFinite(date.getTime()))throw new Error(tr('Zadejte platné datum a čas.','Enter a valid date and time.'));
    return date.toISOString();
  }
  async function savePlan(schedule:boolean) {
    if(mutation.current||(schedule&&hasPlaceholders)||!broadcastComposerControls({readOnly,loading,sending,planBusy,editingDraft:Boolean(editing),
      eligible,audience,unitId,title,message}).canSave)return;
    mutation.current=true;setPlanBusy(true);setError('');setSuccess('');
    try{
      const date=schedule?localTimeToIso(scheduleAt):null;
      const common={kind,title:title.trim(),message:message.trim()};
      const body:ExerciseBroadcastRequest=audience==='UNIT'
        ?{...common,audience:'UNIT',unitId,nonce:editing?.id??(planNonce.current ||= crypto.randomUUID())}
        :{...common,audience:'ALL',nonce:editing?.id??(planNonce.current ||= crypto.randomUUID())};
      const result=editing
        ?await apiClient.reviseExerciseBroadcastPlan(eventId,editing.id,{...body,revision:editing.revision})
        :await apiClient.createExerciseBroadcastPlan(eventId,body);
      if(!result.ok||!result.data)throw new Error(result.error||'Unable to save the draft');
      let saved=result.data;
      if(schedule&&date){
        const planned=await apiClient.scheduleExerciseBroadcastPlan(eventId,saved.id,saved.revision,date);
        if(!planned.ok||!planned.data){
          setEditing(saved);
          await refresh().catch(()=>undefined);
          throw new Error(planned.error||tr('Koncept uložen, plánování selhalo. Zkuste znovu.','Draft saved, but scheduling failed. Retry from this draft.'));
        }
        saved=planned.data;
      }
      resetEditor();
      setSuccess(schedule
        ?tr('Zpráva je naplánovaná.','Broadcast scheduled.')
        :tr('Koncept byl uložen.','Draft saved.'));
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Unable to save broadcast plan');}
    finally{mutation.current=false;setPlanBusy(false);}
  }
  async function cancelPlan(plan:ExerciseBroadcastPlanResponse) {
    if(planBusy||sending||readOnly||mutation.current)return;
    if(!window.confirm(tr('Zrušit tuto zprávu? Ještě nebyla rozeslaná.','Cancel this unsent announcement?')))return;
    mutation.current=true;setPlanBusy(true);setError('');setSuccess('');
    try {
      const result=await apiClient.cancelExerciseBroadcastPlan(eventId,plan.id,plan.revision);
      if(!result.ok||!result.data)throw new Error(result.error||'Unable to cancel');
      if(editing?.id===plan.id)resetEditor();
      setSuccess(tr('Zpráva byla zrušena.','Broadcast cancelled.'));
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Unable to cancel');}
    finally{mutation.current=false;setPlanBusy(false);}
  }
  const templates=[
    {label:tr('Zahájení etapy','Phase start'),title:tr('Zahájení nové etapy','New exercise phase'),message:tr('Právě začíná další etapa cvičení. Sledujte aktuální zadání a pokyny svého týmu.','A new exercise phase is starting. Check your assigned briefs and team instructions.')},
    {label:tr('Žádost o SITREP','Request SITREP'),title:tr('Aktualizujte SITREP','Update your SITREP'),message:tr('Vyzýváme týmy k zaslání aktuálního stručného přehledu situace. Uveďte potvrzené skutečnosti a otevřené problémy.','Teams: please submit a short situation update listing confirmed facts and unresolved issues.')},
    {label:tr('Organizační upozornění','Operations notice'),title:tr('Důležitá informace EXCON','Important EXCON notice'),message:tr('Zkontrolujte aktuální organizační informace zveřejněné v CYRISu.','Please review the latest organizational information in CYRIS.')},
  ];
  const visiblePlans=filterBroadcastRows(plans,search,kindFilter,statusFilter);
  const visibleHistory=filterBroadcastRows(history,search,kindFilter);
  const type = types.find(t=>t.key===kind)!;
  const controls=broadcastComposerControls({
    readOnly,loading,sending,planBusy,editingDraft:Boolean(editing),
    eligible,audience,unitId,title,message,
  });
  return <AppShell breadcrumbs={[
    {label:tr('Řízení cvičení','Exercise control'),href:'/events/'+eventId+'/command'},
    {label:tr('Komunikační centrum','Broadcast center')}
  ]}>
    <main className="broadcast-optimized mx-auto max-w-5xl space-y-6 p-5 md:p-8">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><h1 className="text-2xl font-bold text-slate-100">{tr('Komunikační centrum cvičení','Exercise broadcast center')}</h1>
          <p className="mt-2 text-sm text-slate-400">{tr(
            'Odesílejte zprávy všem účastníkům nebo vybranému týmu. Každé doručení a přečtení je dohledatelné.',
            'Send notices to all participants or one team, then track delivery and read receipts.'
          )}</p></div>
        <Link href={'/events/'+eventId+'/command'} className="rounded border border-slate-600 px-3 py-2 text-sm text-slate-200 hover:bg-slate-800">{tr('Zpět na velení','Back to command')}</Link>
      </div>
      {readOnly&&<p role="status" className="rounded border border-amber-700 bg-amber-950/40 p-3 text-sm text-amber-200">{tr('Režim náhledu účastníka je pouze pro čtení.','Participant preview is read-only.')}</p>}
      {error&&<p role="alert" className="rounded border border-red-700 bg-red-950/50 p-3 text-sm text-red-200">{error}</p>}
      {success&&<p role="status" className="rounded border border-green-700 bg-green-950/40 p-3 text-sm text-green-200">{success}</p>}
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="mb-4 text-lg font-semibold text-slate-100">{tr('Nová zpráva','New message')}</h2>
        <form onSubmit={e=>void send(e)} className="space-y-4">
          <fieldset disabled={loading||sending||planBusy||readOnly} className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs text-slate-400">{tr('Připravené šablony:','Quick templates:')}</span>
              {templates.map(item=><button key={item.label} type="button"
                onClick={()=>{if((title.trim()||message.trim())&&!window.confirm(tr('Nahradit rozepsanou zprávu?','Replace the unsaved message?')))return;setTitle(item.title);setMessage(item.message);changed();}}
                className="rounded border border-slate-600 bg-slate-800 px-2 py-1 text-xs text-slate-200 hover:bg-slate-700">{item.label}</button>)}
            </div>
            {editing&&<div className="flex flex-wrap items-center justify-between gap-2 rounded border border-blue-800 bg-blue-950/50 p-2 text-sm text-blue-100">
              {tr('Upravujete uložený koncept: ','Editing saved draft: ')}{editing.title}
              <span className="text-xs">{tr('Pro okamžité odeslání vytvořte novou kopii.',
                'To send now, create a new copy.')}</span>
              <button type="button" onClick={resetEditor} className="rounded border border-blue-600 px-2 py-1">{tr('Nová zpráva','New message')}</button>
            </div>}
            <label className="block text-sm font-semibold text-slate-200">{tr('Typ zprávy','Message type')}
              <select className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100" value={kind} onChange={e=>{setKind(e.target.value as Kind);changed();}}>
                {types.map(t=><option key={t.key} value={t.key}>{cs?t.cs:t.en}</option>)}
              </select>
            </label>
            <p className="text-xs text-slate-400">{cs?type.hintCs:type.hintEn}</p>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="block text-sm font-semibold text-slate-200">{tr('Příjemci','Recipients')}
                <select className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100" value={audience} onChange={e=>{setAudience(e.target.value as 'ALL'|'UNIT');setUnitId('');changed();}}>
                  <option value="ALL">{tr('Všichni aktivní účastníci cvičení','All active exercise participants')}</option>
                  <option value="UNIT">{tr('Vybraný tým','One selected team')}</option>
                </select>
              </label>
              {audience==='UNIT'&&<label className="block text-sm font-semibold text-slate-200">{tr('Tým','Team')}
                <select required className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100" value={unitId} onChange={e=>{setUnitId(e.target.value);changed();}}>
                  <option value="">{tr('Vyberte tým','Select a team')}</option>
                  {teams.map(team=><option key={team.id} value={team.id}>{team.name}</option>)}
                </select>
              </label>}
            </div>
            <p role="status" className="text-sm text-slate-300">{eligible===null
              ?tr('Počet příjemců se načítá nebo není dostupný.','Recipient count loading or unavailable.')
              :tr('Příjemců podle aktuálních oprávnění a preferencí: ','Eligible recipients: ')+eligible}</p>
            {audienceError&&<p role="alert" className="text-sm text-amber-300">{audienceError} <button type="button" onClick={()=>setPreviewRevision(v=>v+1)}>{tr('Zkusit znovu','Retry')}</button></p>}
            <label className="block text-sm font-semibold text-slate-200">{tr('Nadpis','Title')}
              <input required minLength={3} maxLength={120} value={title} onChange={e=>{setTitle(e.target.value);changed();}}
                className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100" placeholder={tr('Např. Změna času briefingu','E.g. Briefing time changed')}/>
            </label>
            <label className="block text-sm font-semibold text-slate-200">{tr('Zpráva','Message')}
              <textarea required minLength={3} maxLength={900} rows={5} value={message} onChange={e=>{setMessage(e.target.value);changed();}}
                className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100" placeholder={tr('Konkrétní pokyn nebo informace pro účastníky…','Instructions or relevant information for participants…')}/>
            </label>
            <p className="text-xs text-slate-400">{title.length}/120 · {message.length}/900</p>
            {hasPlaceholders&&<p role="status" className="text-sm text-amber-300">{tr('Doplňte všechny údaje v šabloně. Koncept lze uložit, ale nelze jej odeslat ani naplánovat.','Complete all template placeholders before sending or scheduling. You can still save a draft.')}</p>}
            <div className="rounded border border-slate-700 bg-slate-950 p-3">
              <button type="button" disabled={aiBusy||sending||readOnly||!message.trim()}
                onClick={()=>void aiImprove()}
                className="rounded border border-slate-600 px-3 py-2 text-sm text-blue-200 hover:bg-slate-800 disabled:opacity-40">
                {aiBusy?tr('AI připravuje návrh…','AI is drafting…'):tr('✨ Zkrátit a zpřehlednit text pomocí AI','✨ Improve clarity with AI')}
              </button>
              <p className="mt-1 text-xs text-slate-400">{tr(
                'AI pouze navrhne úpravu. Původní text zůstane, dokud nový výslovně neschválíte. Nic se automaticky neposílá.',
                'AI only suggests an edit. Your original text stays until you explicitly apply it. Nothing gets sent automatically.'
              )}</p>
              {aiError&&<p role="alert" className="mt-2 text-xs text-red-300">{aiError}</p>}
              {aiDraft&&<div className="mt-3 space-y-2">
                <strong className="text-sm text-slate-200">{tr('Návrh AI – ke kontrole','AI draft – review before use')}</strong>
                <p className="whitespace-pre-wrap text-sm text-slate-300">{aiDraft}</p>
                <button type="button" disabled={aiDraft.length>900} onClick={()=>{setMessage(aiDraft);changed();}}
                  className="rounded bg-slate-700 px-3 py-1 text-sm text-white hover:bg-slate-600 disabled:opacity-40">
                  {tr('Použít tento návrh','Apply this draft')}
                </button>
                {aiDraft.length>900&&<p className="text-xs text-amber-300">{tr('Návrh je příliš dlouhý; nejprve jej ručně zkraťte.','Draft exceeds 900 characters; shorten it manually first.')}</p>}
              </div>}
            </div>
            <p className="text-xs text-slate-400">{tr(
              'Zprávy se doručují do centra notifikací v CYRISu; neposílají se e-mailem. Urgentní zprávy jsou povinné i při vypnutých běžných oznámeních.',
              'Messages appear in the CYRIS notification center; no email is sent. Urgent notices bypass regular in-app opt-outs.'
            )}</p>
            <div className="flex flex-wrap items-end gap-3 border-t border-slate-700 pt-4">
              <button type="button" disabled={!controls.canSave}
                onClick={()=>void savePlan(false)} className="rounded border border-slate-500 px-3 py-2 text-sm font-semibold text-slate-100 hover:bg-slate-800 disabled:opacity-40">
                {planBusy?tr('Ukládám…','Saving…'):editing?tr('Uložit změny konceptu','Save draft changes'):tr('Uložit koncept','Save draft')}
              </button>
              <label className="text-sm text-slate-300">{tr('Naplánovat na (místní čas)','Schedule for (local time)')}
                <input type="datetime-local" value={scheduleAt} onChange={e=>setScheduleAt(e.target.value)}
                  className="mt-1 block rounded border border-slate-600 bg-slate-950 p-2 text-slate-100"/>
              </label>
              <button type="button" disabled={!controls.canSave||!scheduleAt||hasPlaceholders}
                onClick={()=>{if(window.confirm(tr('Naplánovat automatické rozeslání?','Schedule automatic delivery?')))void savePlan(true);}}
                className="rounded border border-sky-600 bg-sky-950 px-3 py-2 text-sm font-semibold text-sky-100 hover:bg-sky-900 disabled:opacity-40">
                {tr('Naplánovat zprávu','Schedule broadcast')}
              </button>
            </div>
            <button type="submit" disabled={!controls.canSendNow||hasPlaceholders}
              className="rounded bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
              {sending?tr('Odesílám…','Sending…'):tr('Odeslat oznámení','Send notification')}
            </button>
            {editing&&<p className="text-xs text-amber-700" role="note">{tr(
              'Uložený koncept nelze omylem rozeslat z režimu úprav. Uložte ho, nebo vytvořte novou kopii tlačítkem níže.',
              'A saved draft cannot be sent accidentally while editing. Save it, or create a new copy below.'
            )}</p>}
          </fieldset>
        </form>
      </section>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-4">
        <h2 className="mb-3 text-base font-semibold text-slate-100">{tr('Filtry zpráv','Message filters')}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="text-sm text-slate-300">{tr('Hledat','Search')}<input type="search" className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" value={search} onChange={e=>setSearch(e.target.value)}/></label>
          <label className="text-sm text-slate-300">{tr('Typ','Type')}<select className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" value={kindFilter} onChange={e=>setKindFilter(e.target.value)}><option value="ALL">{tr('Všechny','All')}</option>{types.map(t=><option key={t.key} value={t.key}>{cs?t.cs:t.en}</option>)}</select></label>
          <label className="text-sm text-slate-300">{tr('Stav plánů','Plan status')}<select className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}>{['ALL','DRAFT','SCHEDULED','SENT','FAILED','CANCELLED'].map(s=><option key={s} value={s}>{s==='ALL'?tr('Všechny','All'):s}</option>)}</select></label>
        </div>
        <p className="mt-2 text-xs text-slate-400">{visiblePlans.length}/{plans.length} {tr('plánů','plans')} · {visibleHistory.length}/{history.length} {tr('doručených zpráv','sent notices')}</p>
        {(search||kindFilter!=='ALL'||statusFilter!=='ALL')&&<button type="button" className="mt-2 text-sm text-sky-300" onClick={()=>{setSearch('');setKindFilter('ALL');setStatusFilter('ALL');}}>{tr('Vymazat filtry','Clear filters')}</button>}
      </section>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <h2 className="mb-2 text-lg font-semibold text-slate-100">{tr('Koncepty a naplánované zprávy','Drafts and scheduled broadcasts')}</h2>
        <p className="mb-4 text-xs text-slate-400">{tr(
          'Čas se zadává v místním časovém pásmu prohlížeče. Automatické doručení proběhne jen při aktivním cvičení a bez provozní blokace; při přípravě nebo pozastavení čeká.',
          'Enter your local browser time. Automatic delivery requires an active exercise without an operational hold; it waits while preparing or on hold.'
        )}</p>
        {visiblePlans.length===0?<p className="text-sm text-slate-400">{plans.length?tr('Žádný plán neodpovídá filtrům.','No plans match the filters.'):tr('Zatím žádné koncepty ani plánované zprávy.','No drafts or schedules yet.')}</p>
          :<div className="space-y-3">{visiblePlans.map(plan=><article key={plan.id} className="rounded border border-slate-700 bg-slate-950 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-slate-100">{plan.title}</strong>
              <span className="text-xs text-sky-200">{({DRAFT:tr('Koncept','Draft'),SCHEDULED:tr('Naplánováno','Scheduled'),SENT:tr('Odesláno','Sent'),FAILED:tr('Neodesláno','Failed'),CANCELLED:tr('Zrušeno','Cancelled')})[plan.status]}</span>
            </div>
            <p className="mt-1 text-xs text-slate-400">{plan.kind} · {plan.audience==='ALL'?tr('Všichni','All'):teams.find(t=>t.id===plan.unitId)?.name||tr('Tým','Team')}
              {plan.scheduledAt?' · '+new Date(plan.scheduledAt).toLocaleString(cs?'cs-CZ':'en-GB'):''}
              {plan.status==='SENT'?' · '+tr('Doručeno: ','Delivered: ')+plan.deliveredCount:''}
              {plan.failureCode?' · '+tr('Problém: ','Issue: ')+plan.failureCode:''}
            </p>
            <p className="my-2 whitespace-pre-wrap text-sm text-slate-300">{plan.message}</p>
            <div className="flex flex-wrap gap-2">
              <button type="button" disabled={planBusy||sending||readOnly}
                onClick={()=>copyPlan(plan)} className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">
                {tr('Použít jako novou zprávu','Reuse as new message')}
              </button>
              {plan.status==='DRAFT'&&<button type="button" disabled={planBusy||sending||readOnly}
                onClick={()=>loadDraft(plan)} className="rounded border border-slate-600 px-3 py-1 text-xs text-slate-200 hover:bg-slate-800">{tr('Otevřít v editoru','Edit draft')}</button>}
              {(plan.status==='DRAFT'||plan.status==='SCHEDULED')&&<button type="button" disabled={planBusy||sending||readOnly}
                onClick={()=>void cancelPlan(plan)} className="rounded border border-red-800 px-3 py-1 text-xs text-red-200 hover:bg-red-950">{tr('Zrušit','Cancel')}</button>}
            </div>
          </article>)}</div>}
      </section>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">{tr('Historie a přečtení','Delivery history and reads')}</h2>
          <button type="button" disabled={loading} onClick={()=>void refresh().catch(e=>setError(e instanceof Error?e.message:'Refresh failed'))}
            className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800">{tr('Obnovit','Refresh')}</button>
        </div>
        {loading?<p className="text-sm text-slate-400">{tr('Načítám…','Loading…')}</p>
          :visibleHistory.length===0?<p className="text-sm text-slate-400">{history.length?tr('Žádná zpráva neodpovídá filtrům.','No notices match the filters.'):tr('Zatím nebyla rozeslána žádná zpráva.','No broadcasts yet.')}</p>
          :<div className="space-y-3">{visibleHistory.map(h=><article key={h.nonce} className="rounded border border-slate-700 bg-slate-950 p-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <strong className="text-sm text-slate-100">{h.title}</strong>
              <time className="text-xs text-slate-400" dateTime={h.sentAt}>{new Date(h.sentAt).toLocaleString(cs?'cs-CZ':'en-GB')}</time>
            </div>
            <p className="mt-1 text-xs text-slate-400">{h.kind} · {h.audience==='ALL'?tr('Všichni','All'):teams.find(t=>t.id===h.unitId)?.name||tr('Tým','Team')}</p>
            <p className="mt-1 text-sm text-slate-200">{tr('Doručeno: ','Delivered: ')}{h.delivered} · {tr('Přečteno: ','Read: ')}{h.read}</p>
          </article>)}</div>}
      </section>
    </main>
  </AppShell>;
}
