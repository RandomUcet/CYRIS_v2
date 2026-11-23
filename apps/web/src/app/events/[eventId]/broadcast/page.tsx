'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { useAuth } from '@/contexts/AuthContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { apiClient } from '@/lib/api-client';
import type { ExerciseBroadcastHistory, ExerciseBroadcastRequest } from '@cyris/contracts';

type Kind = ExerciseBroadcastRequest['kind'];
const types: Array<{key:Kind;cs:string;en:string;hintCs:string;hintEn:string}> = [
  {key:'INFO',cs:'Oznámení',en:'Announcement',hintCs:'Provozní informace pro účastníky',hintEn:'General exercise information'},
  {key:'UPDATE',cs:'Změna situace',en:'Situation update',hintCs:'Novinky v průběhu cvičení',hintEn:'Updates during the exercise'},
  {key:'INSTRUCTION',cs:'Pokyn k akci',en:'Action instruction',hintCs:'Vyžaduje pozornost týmu',hintEn:'Requires participant attention'},
  {key:'URGENT',cs:'Urgentní upozornění',en:'Urgent notice',hintCs:'Povinné oznámení i pro uživatele s vypnutými notifikacemi',hintEn:'Mandatory in-app notice regardless of notification preferences'},
];

export default function ExerciseBroadcastPage() {
  const { eventId } = useParams<{eventId:string}>();
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
  const [eligible,setEligible] = useState<number|null>(null);
  const [history,setHistory] = useState<ExerciseBroadcastHistory>([]);
  const [loading,setLoading] = useState(true);
  const [sending,setSending] = useState(false);
  const [error,setError] = useState('');
  const [success,setSuccess] = useState('');
  const nonce = useRef<string|null>(null);
  const readOnly = Boolean(viewAs);

  function changed(){ nonce.current=null;setSuccess(''); }
  async function refresh() {
    const [units,items] = await Promise.all([
      apiClient.getExerciseBroadcastTeams(eventId),
      apiClient.listExerciseBroadcasts(eventId),
    ]);
    if (!units.ok || !units.data) throw new Error(units.error || tr('Týmy nejsou dostupné.','Teams unavailable.'));
    if (!items.ok || !items.data) throw new Error(items.error || tr('Historie není dostupná.','History unavailable.'));
    setTeams(units.data);setHistory(items.data);
  }
  useEffect(()=>{
    let live=true;
    setLoading(true);setError('');setTeams([]);setHistory([]);setAudience('ALL');setUnitId('');
    void Promise.all([apiClient.getExerciseBroadcastTeams(eventId),apiClient.listExerciseBroadcasts(eventId)])
      .then(([u,h])=>{
        if(!live)return;
        if(!u.ok||!u.data||!h.ok||!h.data)throw new Error(u.error||h.error||'Unable to load exercise broadcasts');
        setTeams(u.data);setHistory(h.data);
      }).catch(e=>{if(live)setError(e instanceof Error?e.message:'Unable to load');})
      .finally(()=>{if(live)setLoading(false);});
    return ()=>{live=false;};
  },[eventId]);
  useEffect(()=>{
    let live=true;setEligible(null);
    if(loading || (audience==='UNIT'&&!unitId))return ()=>{live=false;};
    void apiClient.previewExerciseBroadcastAudience(eventId, {
      audience,kind,...(audience==='UNIT'?{unitId}:{})
    }).then(r=>{
      if(!live)return;
      if(r.ok&&r.data)setEligible(r.data.eligible);
      else setEligible(null);
    }).catch(()=>{if(live)setEligible(null);});
    return ()=>{live=false;};
  },[eventId,kind,audience,unitId,loading,history.length]);

  async function send(ev:FormEvent) {
    ev.preventDefault();
    if(sending||readOnly||eligible===null||eligible===0||!title.trim()||!message.trim())return;
    const confirmation = window.confirm(tr(
      'Odeslat '+types.find(t=>t.key===kind)?.cs+' ('+eligible+' příjemců) v rámci tohoto cvičení? Tato akce se zaznamená do auditu.',
      'Send '+kind+' to '+eligible+' participants in this exercise? This action will be audited.'
    ));
    if(!confirmation)return;
    setSending(true);setError('');setSuccess('');
    try{
      nonce.current ||= crypto.randomUUID();
      const payload: ExerciseBroadcastRequest = {
        nonce: nonce.current,kind,audience,
        ...(audience==='UNIT'?{unitId}:{}),
        title:title.trim(),message:message.trim(),
      };
      const result=await apiClient.sendExerciseBroadcast(eventId,payload);
      if(!result.ok||!result.data)throw new Error(result.error||'Could not send broadcast');
      setSuccess(tr('Doručeno '+result.data.delivered+' účastníkům.','Delivered to '+result.data.delivered+' participants.')
        +(result.data.repeated?tr(' (Bez duplicit.)',' (No duplicates.)'):''));
      nonce.current=null;
      setTitle('');setMessage('');
      await refresh();
    }catch(e){setError(e instanceof Error?e.message:'Send failed');}
    finally{setSending(false);}
  }
  const type = types.find(t=>t.key===kind)!;
  return <AppShell breadcrumbs={[
    {label:tr('Řízení cvičení','Exercise control'),href:'/events/'+eventId+'/command'},
    {label:tr('Komunikační centrum','Broadcast center')}
  ]}>
    <main className="mx-auto max-w-5xl space-y-6 p-5 md:p-8">
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
          <fieldset disabled={loading||sending||readOnly} className="space-y-4">
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
            <label className="block text-sm font-semibold text-slate-200">{tr('Nadpis','Title')}
              <input required minLength={3} maxLength={120} value={title} onChange={e=>{setTitle(e.target.value);changed();}}
                className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100" placeholder={tr('Např. Změna času briefingu','E.g. Briefing time changed')}/>
            </label>
            <label className="block text-sm font-semibold text-slate-200">{tr('Zpráva','Message')}
              <textarea required minLength={3} maxLength={900} rows={5} value={message} onChange={e=>{setMessage(e.target.value);changed();}}
                className="mt-1 w-full rounded border border-slate-600 bg-slate-950 p-2 text-slate-100" placeholder={tr('Konkrétní pokyn nebo informace pro účastníky…','Instructions or relevant information for participants…')}/>
            </label>
            <p className="text-xs text-slate-400">{tr(
              'Zprávy se doručují do centra notifikací v CYRISu; neposílají se e-mailem. Urgentní zprávy jsou povinné i při vypnutých běžných oznámeních.',
              'Messages appear in the CYRIS notification center; no email is sent. Urgent notices bypass regular in-app opt-outs.'
            )}</p>
            <button type="submit" disabled={sending||loading||readOnly||eligible===null||eligible===0||!title.trim()||!message.trim()}
              className="rounded bg-blue-600 px-5 py-2 font-semibold text-white hover:bg-blue-500 disabled:cursor-not-allowed disabled:opacity-40">
              {sending?tr('Odesílám…','Sending…'):tr('Odeslat oznámení','Send notification')}
            </button>
          </fieldset>
        </form>
      </section>
      <section className="rounded-xl border border-slate-700 bg-slate-900 p-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-lg font-semibold text-slate-100">{tr('Historie a přečtení','Delivery history and reads')}</h2>
          <button type="button" disabled={loading} onClick={()=>void refresh().catch(e=>setError(e instanceof Error?e.message:'Refresh failed'))}
            className="rounded border border-slate-600 px-3 py-1 text-sm text-slate-200 hover:bg-slate-800">{tr('Obnovit','Refresh')}</button>
        </div>
        {loading?<p className="text-sm text-slate-400">{tr('Načítám…','Loading…')}</p>
          :history.length===0?<p className="text-sm text-slate-400">{tr('Zatím nebyla rozeslána žádná zpráva.','No broadcasts yet.')}</p>
          :<div className="space-y-3">{history.map(h=><article key={h.nonce} className="rounded border border-slate-700 bg-slate-950 p-3">
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
