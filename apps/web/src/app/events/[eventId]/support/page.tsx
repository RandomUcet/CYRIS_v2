'use client';
import {useState,useEffect,useRef} from 'react';
import {useParams} from 'next/navigation';
import Link from 'next/link';
import {MessageCircle,Plus,RefreshCw,Send,CheckCircle2,LifeBuoy} from 'lucide-react';
import {AppShell} from '@/components/layout/AppShell';
import {LoadingState,ErrorState} from '@/components/common/StateViews';
import {usePreferences} from '@/contexts/PreferencesContext';
import {useAuth} from '@/contexts/AuthContext';
import {apiClient} from '@/lib/api-client';
import type {SupportInbox,SupportThread,CreateSupportRequest} from '@cyris/contracts';

export default function SupportPage(){
  const {eventId}=useParams<{eventId:string}>();
  const {locale,formatDate,formatTime}=usePreferences();
  const {currentUser}=useAuth();
  const readonly=Boolean(currentUser?.viewAs);
  const cs=locale==='cs',tr=(cz:string,en:string)=>cs?cz:en;
  const [data,setData]=useState<SupportInbox|null>(null);
  const [loadedEvent,setLoadedEvent]=useState('');
  const [error,setError]=useState('');
  const [selected,setSelected]=useState<string|null>(null);
  const [showCreate,setShowCreate]=useState(false);
  const [category,setCategory]=useState<CreateSupportRequest['category']>('NAVIGATION');
  const [subject,setSubject]=useState('');
  const [body,setBody]=useState('');
  const [reply,setReply]=useState('');
  const [busy,setBusy]=useState(false);
  const [actionError,setActionError]=useState('');
  const [filter,setFilter]=useState<'ALL'|'OPEN'|'ANSWERED'|'RESOLVED'>('ALL');
  const [version,setVersion]=useState(0);
  const request=useRef(0);
  useEffect(()=>{
    let active=true,running=false;
    setData(null);setLoadedEvent('');setSelected(null);setShowCreate(false);setReply('');setError('');
    async function load(){
      if(!active||running)return;running=true;
      const seq=++request.current;
      try{const r=await apiClient.listSupport(eventId);if(active&&seq===request.current){if(r.ok&&r.data){setData(r.data);setLoadedEvent(eventId);setError('');}else setError(r.error||'Unable to load support');}}
      catch(e){if(active)setError(String(e));}finally{running=false;}
    }
    void load();const timer=window.setInterval(load,12000);
    return ()=>{active=false;window.clearInterval(timer);};
  },[eventId]);
  useEffect(()=>{
    if(!version)return;
    let active=true;const seq=++request.current;
    void apiClient.listSupport(eventId).then(r=>{if(active&&seq===request.current){if(r.ok&&r.data){setData(r.data);setLoadedEvent(eventId);setError('');}else setError(r.error||'Unable to load support');}}).catch(e=>{if(active)setError(String(e));});
    return ()=>{active=false;};
  },[version,eventId]);
  const inbox=loadedEvent===eventId?data:null;
  const threads=inbox?.threads??[];
  const thread=threads.find(t=>t.id===selected)??null;
  const labels={NAVIGATION:tr('Orientace v systému','Navigation'),TASK:tr('Úkol nebo zadání','Task instructions'),TECHNICAL:tr('Technický problém','Technical problem'),OTHER:tr('Ostatní','Other')};
  const statuses={OPEN:tr('Čeká na odpověď','Open'),ANSWERED:tr('Zodpovězeno','Answered'),RESOLVED:tr('Vyřešeno','Resolved')};
  function choose(id:string){setSelected(id);setShowCreate(false);setReply('');setActionError('');}
  async function create(e:React.FormEvent){
    e.preventDefault();if(readonly||busy)return;
    setBusy(true);setActionError('');
    const r=await apiClient.createSupport(eventId,{category,subject,body});
    if(r.ok&&r.data){setSelected(r.data.id);setShowCreate(false);setSubject('');setBody('');setVersion(v=>v+1);}
    else setActionError(r.error||'Unable to send request');
    setBusy(false);
  }
  async function send(e:React.FormEvent){
    e.preventDefault();if(!thread||readonly||busy)return;
    setBusy(true);setActionError('');
    const r=await apiClient.replySupport(eventId,thread.id,{body:reply,expectedRevision:thread.revision});
    if(r.ok){setReply('');setVersion(v=>v+1);}
    else{setActionError(r.error||'Unable to send reply');setVersion(v=>v+1);}
    setBusy(false);
  }
  async function resolve(t:SupportThread){
    if(busy||readonly)return;
    setBusy(true);setActionError('');
    const r=await apiClient.resolveSupport(eventId,t.id,t.revision);
    if(!r.ok)setActionError(r.error||'Unable to resolve request');
    setVersion(v=>v+1);setBusy(false);
  }
  return <AppShell title={tr('Pomoc a podpora','Help & support')} breadcrumbs={[{label:'Exercise support'},{label:'Help & support'}]} actions={<button className="btn btn-secondary" onClick={()=>setVersion(v=>v+1)}><RefreshCw size={15}/>{tr('Obnovit','Refresh')}</button>}>
    <div className="helpdesk">
      <header className="service-intro"><LifeBuoy size={23}/><div><h2>{inbox?.canManage?tr('Centrum podpory EXCON','EXCON helpdesk'):tr('Potřebujete pomoc?','Need assistance?')}</h2><p>{tr('Zeptejte se na používání systému, nejasnosti v zadání nebo technické problémy. Vaši konverzaci vidíte vy a oprávnění organizátoři. Nevkládejte hesla ani jiné přístupové údaje.','Ask about navigation, unclear instructions or technical issues. Your conversation is visible to you and authorized exercise staff. Do not enter passwords or credentials.')}</p><Link href={`/events/${eventId}/service-status`}>{tr('Zkontrolovat stav služeb','Check service status')}</Link></div></header>
      {error&&<ErrorState message={error} onRetry={()=>setVersion(v=>v+1)}/>}
      {!inbox&&!error&&<LoadingState/>}
      {inbox&&<div className="helpdesk-layout">
        <aside className="helpdesk-inbox">
          <div className="helpdesk-inbox-header"><strong>{inbox.canManage?tr('Žádosti ve cvičení','Exercise requests'):tr('Moje žádosti','My requests')}</strong>{!readonly&&<button className="btn btn-primary" onClick={()=>{setShowCreate(true);setSelected(null);setActionError('');}}><Plus size={15}/>{tr('Nová','New')}</button>}</div>
          <div className="helpdesk-filters">{(['ALL','OPEN','ANSWERED','RESOLVED'] as const).map(f=><button key={f} aria-pressed={filter===f} onClick={()=>setFilter(f)}>{f==='ALL'?tr('Vše','All'):statuses[f]}</button>)}</div>
          <div className="helpdesk-threads">{threads.filter(t=>filter==='ALL'||t.status===filter).map(t=><button key={t.id} className={'helpdesk-thread '+(selected===t.id?'selected':'')} onClick={()=>choose(t.id)}><strong>{t.subject}</strong><small>{inbox.canManage?t.requesterName+' · ':''}{labels[t.category]}</small><span className={'support-status '+t.status.toLowerCase()}>{statuses[t.status]}</span></button>)}
            {!threads.some(t=>filter==='ALL'||t.status===filter)&&<p className="service-empty">{tr('Žádné žádosti v tomto pohledu.','No requests in this view.')}</p>}</div>
        </aside>
        <section className="helpdesk-conversation">
          {showCreate&&!readonly?<form className="helpdesk-form" onSubmit={create}>
            <h2>{tr('Nová žádost o pomoc','New help request')}</h2>
            <label>{tr('Kategorie','Category')}<select value={category} onChange={e=>setCategory(e.target.value as CreateSupportRequest['category'])}>{Object.entries(labels).map(([key,value])=><option key={key} value={key}>{value}</option>)}</select></label>
            <label>{tr('Předmět','Subject')}<input required minLength={3} maxLength={160} value={subject} onChange={e=>setSubject(e.target.value)}/></label>
            <label>{tr('S čím potřebujete pomoci?','How can we help?')}<textarea required maxLength={4000} rows={6} value={body} onChange={e=>setBody(e.target.value)} placeholder={tr('Co jste zkoušeli a kde jste se zastavili?','What did you try and where are you stuck?')}/></label>
            {actionError&&<p role="alert" className="error-text">{actionError}</p>}
            <div className="preview-dialog-actions"><button type="button" disabled={busy} onClick={()=>setShowCreate(false)}>{tr('Zrušit','Cancel')}</button><button type="submit" className="btn btn-primary" disabled={busy||subject.trim().length<3||!body.trim()}><Send size={15}/>{tr('Odeslat žádost','Send request')}</button></div>
          </form>:thread?<><header className="helpdesk-conversation-header"><div><h2>{thread.subject}</h2><small>{labels[thread.category]} · {thread.requesterName}</small></div><span className={'support-status '+thread.status.toLowerCase()}>{statuses[thread.status]}</span></header>
            <div className="helpdesk-messages">{thread.messages.map(m=><div key={m.id} className={'helpdesk-message '+(m.authorKind==='EXCON'?'excon':'participant')}><div><strong>{m.authorKind==='EXCON'?'EXCON':thread.requesterName}</strong><small>{formatDate(m.createdAt)} · {formatTime(m.createdAt)}</small></div><p>{m.body}</p></div>)}</div>
            {actionError&&<p role="alert" className="error-text">{actionError}</p>}
            {thread.status!=='RESOLVED'&&!readonly&&<form className="helpdesk-reply" onSubmit={send}>
              <label>{inbox.canManage?tr('Odpověď nebo nápověda','Response or guidance'):tr('Doplnění žádosti','Follow-up')}<textarea required rows={3} maxLength={4000} value={reply} onChange={e=>setReply(e.target.value)}/></label>
              {inbox.canManage&&<p className="workspace-subtitle">{tr('Poskytujte postup nebo vhodnou nápovědu, ne automaticky celé řešení.','Provide guidance or next steps rather than automatically revealing the solution.')}</p>}
              <div className="preview-dialog-actions"><button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void resolve(thread)}><CheckCircle2 size={15}/>{tr('Označit jako vyřešené','Resolve')}</button><button className="btn btn-primary" disabled={busy||!reply.trim()}><Send size={15}/>{tr('Odeslat','Send')}</button></div>
            </form>}
            {readonly&&<p className="service-empty">{tr('Náhled pouze pro čtení.','Read-only preview.')}</p>}
            </>:<div className="helpdesk-empty"><MessageCircle size={36}/><h2>{tr('Vyberte žádost','Select a request')}</h2><p>{tr('Otevřete existující konverzaci nebo vytvořte novou žádost.','Open a conversation or create a new request.')}</p></div>}
        </section>
      </div>}
    </div>
  </AppShell>;
}
