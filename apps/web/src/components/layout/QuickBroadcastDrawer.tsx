'use client';

import { useEffect, useRef, useState, type FormEvent } from 'react';
import Link from 'next/link';
import { createPortal } from 'react-dom';
import { AlertTriangle, ArrowLeft, BellRing, CheckCircle2, FileText, Send, Sparkles, X } from 'lucide-react';
import type { ExerciseBroadcastRequest } from '@cyris/contracts';
import { useAuth } from '@/contexts/AuthContext';
import { useEvent } from '@/contexts/EventContext';
import { usePreferences } from '@/contexts/PreferencesContext';
import { useDialogAccessibility } from '@/hooks/useDialogAccessibility';
import { apiClient } from '@/lib/api-client';
import { broadcastComposerControls } from '@/lib/broadcast-composer';
import { containsUnfilledBroadcastTemplate } from '@/lib/quick-broadcast-validation';
import { quickBroadcastTemplates, type QuickBroadcastTemplate } from '@/lib/quick-broadcast-templates';
import styles from './QuickBroadcastDrawer.module.css';

type Kind = ExerciseBroadcastRequest['kind'];
type Step = 'EDIT'|'REVIEW'|'DONE';
const kinds:Kind[] = ['INFO','UPDATE','INSTRUCTION','URGENT'];

export function QuickBroadcastDrawer({open,onClose}:{open:boolean;onClose:()=>void}) {
  const {locale}=usePreferences();
  const tr=(cs:string,en:string)=>locale==='cs'?cs:en;
  const {hasPermission,viewAs}=useAuth();
  const {events,selectedEvent}=useEvent();
  const allowedEvents=events.filter(event=>!['CLOSED','ARCHIVED'].includes(event.status) &&
    hasPermission('scenario.manage',event.id));
  const [eventId,setEventId]=useState('');
  const [kind,setKind]=useState<Kind>('INFO');
  const [audience,setAudience]=useState<'ALL'|'UNIT'>('ALL');
  const [unitId,setUnitId]=useState('');
  const [teams,setTeams]=useState<Array<{id:string;name:string}>>([]);
  const [teamScope,setTeamScope]=useState('');
  const [teamsError,setTeamsError]=useState('');
  const [title,setTitle]=useState('');
  const [message,setMessage]=useState('');
  const [step,setStep]=useState<Step>('EDIT');
  const [preview,setPreview]=useState<{key:string;eligible:number}|null>(null);
  const [previewError,setPreviewError]=useState('');
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const [success,setSuccess]=useState('');
  const [aiBusy,setAiBusy]=useState(false);
  const [suggestion,setSuggestion]=useState('');
  const [aiError,setAiError]=useState('');
  const revision=useRef(0);
  const sending=useRef(false);
  const sendNonce=useRef<string|null>(null);
  const draftNonce=useRef<string|null>(null);

  // Human-approved message starters; the first four remain immediately visible.
  const templates=quickBroadcastTemplates(locale);
  const event=allowedEvents.find(item=>item.id===eventId);
  const scopeKey=[eventId,kind,audience,unitId].join('|');
  const eligible=preview?.key===scopeKey?preview.eligible:null;
  const ready=broadcastComposerControls({
    readOnly:Boolean(viewAs)||!Boolean(event),loading:false,sending:busy,
    planBusy:busy,editingDraft:false,eligible,audience,unitId,title,message,
  });
  const canSaveDraft=Boolean(event)&&ready.canSave;
  const hasPlaceholders=containsUnfilledBroadcastTemplate(title+' '+message);
  const canSendNow=Boolean(event)&&ready.canSendNow&&!hasPlaceholders;
  const kindLabels:Record<Kind,string>={
    INFO:tr('Oznámení','Announcement'),UPDATE:tr('Aktualizace situace','Situation update'),
    INSTRUCTION:tr('Pokyn k akci','Action instruction'),URGENT:tr('Naléhavá výstraha','Urgent alert'),
  };

  function reset() {
    setKind('INFO');setAudience('ALL');setUnitId('');setTitle('');setMessage('');
    setStep('EDIT');setPreview(null);setError('');setSuccess('');
    setAiError('');setSuggestion('');setAiBusy(false);
    sendNonce.current=null;draftNonce.current=null;revision.current++;
  }

  useEffect(()=>{
    if(!open)return;
    reset();
    const current=selectedEvent?.id;
    setEventId(current && allowedEvents.some(e=>e.id===current)?current:'');
    // The event picker is mandatory when the global toolbar has no active event.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[open]);

  useEffect(()=>{
    if(!open||!eventId||!event){setTeams([]);setTeamScope('');setTeamsError('');return;}
    let current=true;
    setTeams([]);setTeamScope('');setTeamsError('');
    void apiClient.getExerciseBroadcastTeams(eventId).then(result=>{
      if(!current)return;
      if(!result.ok||!result.data)throw new Error(result.error||'Unable to load teams');
      setTeams(result.data);setTeamScope(eventId);
    }).catch(err=>{if(current)setTeamsError(err instanceof Error?err.message:'Unable to load teams');});
    return ()=>{current=false;};
  },[open,eventId,Boolean(event)]);

  useEffect(()=>{
    if(!open||!event||viewAs||(audience==='UNIT'&&(!unitId||teamScope!==eventId))){
      setPreview(null);setPreviewError('');return;
    }
    let current=true;
    setPreview(null);setPreviewError('');
    void apiClient.previewExerciseBroadcastAudience(eventId,{
      kind,audience,...(audience==='UNIT'?{unitId}:{})
    }).then(result=>{
      if(!current)return;
      if(!result.ok||!result.data)throw new Error(result.error||'Unable to preview audience');
      setPreview({key:scopeKey,eligible:result.data.eligible});
    }).catch(err=>{if(current)setPreviewError(err instanceof Error?err.message:'Unable to preview audience');});
    return ()=>{current=false;};
  },[open,eventId,scopeKey,teamScope,Boolean(event),viewAs]);

  function applyTemplate(template:QuickBroadcastTemplate) {
    if(sending.current||busy)return;
    if((title.trim()||message.trim())&&!window.confirm(tr(
      'Nahradit rozepsanou zprávu šablonou? Neuložený text se ztratí.',
      'Replace the current unsaved text with this template?')))return;
    setKind(template.kind);setTitle(template.title);setMessage(template.message);
    changed();
  }

  function changed() {
    revision.current++;sendNonce.current=null;draftNonce.current=null;
    setStep('EDIT');setError('');setSuccess('');setSuggestion('');setAiError('');
  }

  function requestClose():boolean {
    if(sending.current)return false;
    if(step!=='DONE'&&(title.trim()||message.trim())&&!window.confirm(tr(
      'Zahodit rozepsanou zprávu? Pokud ji chcete zachovat, uložte koncept.',
      'Discard the unsaved message? Save a draft to keep it.')))return false;
    onClose();return true;
  }
  useDialogAccessibility(open,requestClose);

  function payload(nonce:string):ExerciseBroadcastRequest {
    const shared={nonce,kind,title:title.trim(),message:message.trim()};
    return audience==='UNIT'?{...shared,audience:'UNIT',unitId}:{...shared,audience:'ALL'};
  }

  function review(e:FormEvent) {
    e.preventDefault();
    if(!canSendNow)return;
    setError('');setStep('REVIEW');
  }

  async function sendNow() {
    if(sending.current||!canSendNow||step!=='REVIEW')return;
    sending.current=true;setBusy(true);setError('');
    try {
      // Recheck the receiving audience immediately before delivery: during an
      // exercise, people can join or leave teams after the first preview.
      const latest=await apiClient.previewExerciseBroadcastAudience(eventId,{
        kind,audience,...(audience==='UNIT'?{unitId}:{})
      });
      if(!latest.ok||!latest.data)throw new Error(latest.error||
        tr('Počet příjemců nelze ověřit. Zkuste to znovu.','Could not verify recipients. Try again.'));
      if(latest.data.eligible!==eligible){
        setPreview({key:scopeKey,eligible:latest.data.eligible});
        setError(tr('Počet příjemců se změnil. Zkontrolujte aktualizovaný počet a potvrďte odeslání znovu.',
          'Recipient count changed. Review the updated number and confirm delivery again.'));
        return;
      }
      sendNonce.current??=crypto.randomUUID();
      const result=await apiClient.sendExerciseBroadcast(eventId,payload(sendNonce.current));
      if(!result.ok||!result.data)throw new Error(result.error||tr('Zprávu nelze odeslat.','Unable to send.'));
      setSuccess(tr('Oznámení doručeno ','Delivered to ')+result.data.delivered+
        tr(' příjemcům.',' recipients.')+(result.data.repeated?tr(' Bez duplicit.',' No duplicates.'):''));
      setTitle('');setMessage('');sendNonce.current=null;
      setStep('DONE');
    } catch(err) {setError(err instanceof Error?err.message:tr('Odeslání selhalo.','Delivery failed.'));}
    finally {sending.current=false;setBusy(false);}
  }

  async function saveDraft() {
    if(sending.current||!canSaveDraft||step!=='EDIT')return;
    sending.current=true;setBusy(true);setError('');
    try{
      draftNonce.current??=crypto.randomUUID();
      const result=await apiClient.createExerciseBroadcastPlan(eventId,payload(draftNonce.current));
      if(!result.ok||!result.data)throw new Error(result.error||tr('Koncept nelze uložit.','Unable to save draft.'));
      setSuccess(tr('Koncept uložen do vybraného cvičení.','Draft saved to the selected exercise.'));
      setTitle('');setMessage('');draftNonce.current=null;setStep('DONE');
    }catch(err){setError(err instanceof Error?err.message:tr('Uložení selhalo.','Save failed.'));}
    finally{sending.current=false;setBusy(false);}
  }

  async function improveWithAI() {
    if(aiBusy||sending.current||!message.trim()||viewAs)return;
    const started=revision.current;
    setAiBusy(true);setAiError('');setSuggestion('');
    try{
      const result=await apiClient.writingAssist(eventId,{
        text:message.trim(),action:'CONCISE',
        context:'CYRIS EXCON exercise notice. Improve clarity without adding facts, times, promises or instructions; preserve uncertainty and urgency.',
      });
      if(!result.ok||!result.data)throw new Error(result.error||'AI unavailable');
      if(started===revision.current)setSuggestion(result.data.draft);
    }catch(err){if(started===revision.current)setAiError(err instanceof Error?err.message:'AI unavailable');}
    finally{setAiBusy(false);}
  }

  if(!open)return null;
  // A fixed overlay rendered inside a sticky header can be trapped by its
  // stacking context. Portal to body so the composer is usable on every page.
  return createPortal(<div className={'dialog-overlay '+styles.overlay} onMouseDown={e=>{
    if(e.target===e.currentTarget)requestClose();
  }}>
    <section className={styles.drawer} role="dialog" aria-modal="true"
      aria-labelledby="excon-quick-title" aria-describedby="excon-quick-description">
      <header className={styles.header}>
        <div><span className={styles.kicker}>EXCON · CYRIS</span>
          <h2 id="excon-quick-title"><BellRing size={19}/>{tr('Nové oznámení','New announcement')}</h2>
          <p id="excon-quick-description">{tr('Rychlé zprávy účastníkům z libovolné stránky.','Contact exercise participants without leaving this page.')}</p>
        </div>
        <button type="button" className={styles.iconButton} onClick={requestClose}
          disabled={busy} aria-label={tr('Zavřít','Close')}><X size={18}/></button>
      </header>

      <div className={styles.scroll}>
        {step==='DONE'?<div className={styles.complete} role="status">
          <CheckCircle2 size={36}/>
          <h3>{tr('Hotovo','Complete')}</h3>
          <p>{success}</p>
          <button className={styles.primary} type="button" onClick={()=>reset()}>
            {tr('Napsat další zprávu','Write another message')}</button>
          <button className={styles.secondary} type="button" onClick={requestClose}>{tr('Zavřít','Close')}</button>
        </div>:<>
          {error&&<p className={styles.error} role="alert">{error}</p>}
          {step==='EDIT'?<form className={styles.form} onSubmit={e=>review(e)}>
            <label>{tr('Cvičení','Exercise')}
              <select value={eventId} onChange={e=>{setEventId(e.target.value);setUnitId('');changed();}}
                required disabled={busy}>
                <option value="">{tr('Vyberte cvičení','Select exercise')}</option>
                {allowedEvents.map(row=><option key={row.id} value={row.id}>{row.name}</option>)}
              </select>
            </label>
            {!allowedEvents.length&&<p className={styles.warning}><AlertTriangle size={16}/>{tr(
              'Nemáte oprávnění spravovat oznámení v žádném otevřeném cvičení.',
              'You cannot manage broadcasts in any open exercise.')}</p>}
            <fieldset disabled={!event||busy||Boolean(viewAs)}>
              <div className={styles.twocol}>
                <label>{tr('Typ zprávy','Message type')}
                  <select value={kind} onChange={e=>{setKind(e.target.value as Kind);changed();}}>
                    {kinds.map(item=><option value={item} key={item}>{kindLabels[item]}</option>)}
                  </select>
                </label>
                <label>{tr('Příjemci','Recipients')}
                  <select value={audience} onChange={e=>{setAudience(e.target.value as 'ALL'|'UNIT');setUnitId('');changed();}}>
                    <option value="ALL">{tr('Všichni účastníci','All participants')}</option>
                    <option value="UNIT">{tr('Vybraný tým','Selected team')}</option>
                  </select>
                </label>
              </div>
              {audience==='UNIT'&&<label>{tr('Tým','Team')}
                <select required value={unitId} disabled={!teamScope||teamScope!==eventId||busy}
                  onChange={e=>{setUnitId(e.target.value);changed();}}>
                  <option value="">{tr('Vyberte tým','Select team')}</option>
                  {teams.map(row=><option value={row.id} key={row.id}>{row.name}</option>)}
                </select>
              </label>}
              {teamsError&&<p className={styles.error} role="alert">{teamsError}</p>}
              <p className={styles.audience} role="status">{eligible===null
                ?tr('Počet příjemců se načítá nebo není dostupný.','Audience loading or unavailable.')
                :tr('Oprávnění příjemci: ','Eligible recipients: ')+eligible}</p>
              {previewError&&<p className={styles.error} role="alert">{previewError}</p>}
              <div className={styles.templates}>
                <span>{tr('Rychlé šablony (před odesláním doplňte údaje)','Quick templates (complete details before sending)')}</span>
                <div className={styles.templateActions}>
                  {templates.slice(0,4).map(template=><button key={template.key} type="button"
                    className={styles.secondary} disabled={busy}
                    onClick={()=>applyTemplate(template)}>{template.name}</button>)}
                </div>
                <details className={styles.moreTemplates}>
                  <summary>{tr('Další provozní šablony','More operational templates')} ({templates.length-4})</summary>
                  <div className={styles.templateActions}>
                    {templates.slice(4).map(template=><button key={template.key} type="button"
                      className={styles.secondary} disabled={busy}
                      onClick={()=>applyTemplate(template)}>{template.name}</button>)}
                  </div>
                </details>
              </div>
              <label>{tr('Nadpis','Title')}
                <input type="text" minLength={3} maxLength={120} required value={title}
                  onChange={e=>{setTitle(e.target.value);changed();}}
                  placeholder={tr('Např. Změna průběhu cvičení','E.g. Exercise schedule change')}/>
              </label>
              <label>{tr('Obsah zprávy','Message')}
                <textarea required rows={6} minLength={3} maxLength={900} value={message}
                  onChange={e=>{setMessage(e.target.value);changed();}}
                  placeholder={tr('Jasný pokyn nebo provozní informace účastníkům…',
                    'Clear instructions or operational information for participants…')}/>
                <span className={styles.charCounter}>{message.length}/900</span>
              </label>
              {hasPlaceholders&&<p className={styles.warning} role="status"><AlertTriangle size={16}/>
                {tr('Před odesláním nahraďte všechny údaje označené [DOPLŇTE]. Koncept lze uložit i nedokončený.',
                  'Replace all [FILL IN] fields before sending. Incomplete templates may still be saved as drafts.')}
              </p>}
              <div className={styles.aiArea}>
                <button className={styles.secondary} type="button" disabled={!message.trim()||aiBusy||busy}
                  onClick={()=>void improveWithAI()}><Sparkles size={15}/>{aiBusy
                    ?tr('AI připravuje návrh…','AI drafting…'):tr('Zpřehlednit pomocí AI','Improve with AI')}</button>
                <small>{tr('AI jen navrhuje. Zprávu musí schválit a odeslat člověk.',
                  'AI only suggests text. A person must approve and send it.')}</small>
                {aiError&&<p className={styles.error} role="alert">{aiError}</p>}
                {suggestion&&<div className={styles.aiSuggestion}><p>{suggestion}</p>
                  <button type="button" className={styles.secondary} disabled={suggestion.length>900}
                    onClick={()=>{setMessage(suggestion);changed();}}>{tr('Použít návrh','Apply suggestion')}</button></div>}
              </div>
            </fieldset>
            <div className={styles.footer}>
              <button type="button" className={styles.secondary} disabled={!canSaveDraft}
                onClick={()=>void saveDraft()}><FileText size={15}/>{tr('Uložit koncept','Save draft')}</button>
              <button type="submit" className={styles.primary} disabled={!canSendNow}>
                <Send size={15}/>{tr('Zkontrolovat před odesláním','Review before sending')}</button>
            </div>
          </form>:<div className={styles.review}>
            <p className={styles.warning}><AlertTriangle size={17}/>{tr(
              'Odeslání se zaznamená do auditu a bude doručeno skutečným účtům účastníků v CYRISu. Zprávu již nelze vzít zpět.',
              'Delivery is audited and reaches real participant accounts in CYRIS. The notice cannot be recalled.')}</p>
            <dl>
              <dt>{tr('Cvičení','Exercise')}</dt><dd>{event?.name}</dd>
              <dt>{tr('Příjemci','Audience')}</dt><dd>{audience==='ALL'?tr('Všichni','All'):teams.find(t=>t.id===unitId)?.name||unitId}
                {' · '}{eligible??'—'} {tr('příjemců','recipients')}</dd>
              <dt>{tr('Typ','Type')}</dt><dd>{kindLabels[kind]}</dd>
              <dt>{tr('Nadpis','Title')}</dt><dd><strong>{title.trim()}</strong></dd>
              <dt>{tr('Zpráva','Message')}</dt><dd className={styles.messagePreview}>{message.trim()}</dd>
            </dl>
            <div className={styles.footer}>
              <button type="button" className={styles.secondary} disabled={busy} onClick={()=>setStep('EDIT')}>
                <ArrowLeft size={15}/>{tr('Upravit','Edit')}</button>
              <button type="button" className={styles.primary} disabled={!canSendNow}
                onClick={()=>void sendNow()}><Send size={15}/>{busy?tr('Odesílám…','Sending…')
                  :tr('Potvrdit a odeslat','Confirm and send')}</button>
            </div>
          </div>}
        </>}
      </div>
      {eventId&&<div className={styles.advanced}>
        <Link href={'/events/'+eventId+'/broadcast'} onClick={e=>{if(!requestClose())e.preventDefault();}}>
          {tr('Otevřít plné komunikační centrum (plánování, historie)','Open full broadcast center (schedule, history)')}</Link>
      </div>}
    </section>
  </div>, document.body);
}
