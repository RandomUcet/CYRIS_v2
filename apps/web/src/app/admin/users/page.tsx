'use client';
import React, { useEffect,useState } from 'react';
import {AppShell} from '@/components/layout/AppShell';
import {DataTable,Column} from '@/components/common/DataTable';
import {LoadingState,EmptyState,ErrorState} from '@/components/common/StateViews';
import {apiClient} from '@/lib/api-client';
import {useEvent} from '@/contexts/EventContext';
import {useAuth} from '@/contexts/AuthContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import {Eye,RefreshCw,Search,Shield,Users} from 'lucide-react';

interface Assignment {id:string;name:string;slug:string}
interface Member {id:string;eventId:string;userId:string;status:string;joinedAt:string;user:{id:string;displayName:string;email:string;status:string};roles:Assignment[];units:Assignment[];platformRoles:Assignment[]}
export default function AdminUsersPage(){
  const {currentEvent,events,selectEvent}=useEvent();
  const {currentUser,isPlatformAdmin}=useAuth();
  const {locale,formatDate}=usePreferences();
  const cs=locale==='cs';
  const tr=(cz:string,en:string)=>cs?cz:en;
  const [members,setMembers]=useState<Member[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [refresh,setRefresh]=useState(0);
  const [target,setTarget]=useState<Member|null>(null);
  const [reason,setReason]=useState('');
  const [busy,setBusy]=useState(false);
  const [previewError,setPreviewError]=useState('');
  useEffect(()=>{
    let active=true;
    setMembers([]);setTarget(null);setError('');
    if(!currentEvent?.id){setLoading(false);return ()=>{active=false;};}
    setLoading(true);
    apiClient.getMemberships(currentEvent.id).then(res=>{
      if(!active)return;
      if(res.ok&&res.data)setMembers(res.data);
      else setError(res.error||'Cannot load memberships');
      setLoading(false);
    }).catch(e=>{if(active){setError(String(e));setLoading(false);}});
    return ()=>{active=false;};
  },[currentEvent?.id,refresh]);
  useEffect(()=>{if(!currentEvent&&events.length)selectEvent(events[0]!.id);},[events,currentEvent,selectEvent]);
  const filtered=members.filter(m=>[m.user.displayName,m.user.email,...(m.roles??[]).map(x=>x.name),...(m.units??[]).map(x=>x.name)].join(' ').toLowerCase().includes(query.toLowerCase()));
  const columns:Column<Member>[]=[
    {header:tr('Uživatel','User'),accessor:m=><div><strong>{m.user.displayName}</strong><small className="member-secondary">{m.user.email}</small></div>},
    {header:tr('Jednotky','Units'),accessor:m=><div>{(m.units??[]).map(x=><span className="member-tag" key={x.id}>{x.name}</span>)}{!m.units?.length&&'—'}</div>},
    {header:tr('Role cvičení','Event roles'),accessor:m=><div>{(m.roles??[]).map(x=><span className="member-tag" key={x.id}>{x.name}</span>)}{!m.roles?.length&&tr('Bez role','No role')}</div>},
    {header:tr('Role platformy','Platform roles'),accessor:m=><div>{(m.platformRoles??[]).map(x=><span className="member-tag platform" key={x.id}>{x.name}</span>)}{!m.platformRoles?.length&&'—'}</div>},
    {header:tr('Stav','Status'),accessor:m=><span className={'member-state '+(m.status==='ACTIVE'&&m.user.status==='ACTIVE'?'active':'')}>{m.status==='ACTIVE'&&m.user.status==='ACTIVE'?tr('Aktivní','Active'):tr('Neaktivní','Inactive')}</span>},
    {header:tr('Členem od','Joined'),accessor:m=>formatDate(m.joinedAt)},
  ];
  if(isPlatformAdmin)columns.push({header:tr('Náhled','Preview'),accessor:m=>m.status==='ACTIVE'&&m.user.status==='ACTIVE'&&m.userId!==currentUser?.user.id&&!m.platformRoles?.length?<button type="button" className="btn btn-secondary" onClick={()=>{setTarget(m);setReason('');setPreviewError('');}}><Eye size={14}/>{tr('Zobrazit jako','View As')}</button>:'—'});
  async function startPreview(e:React.FormEvent){
    e.preventDefault();if(!target||busy)return;
    setBusy(true);setPreviewError('');
    const res=await apiClient.startViewAs({eventId:target.eventId,userId:target.userId,reason:reason.trim()});
    if(res.ok&&res.data){
      localStorage.setItem('cyris_selected_event',res.data.eventId);
      window.location.replace('/events/'+res.data.eventId+'/my-work');
    }else{setPreviewError(res.error||'Preview failed');setBusy(false);}
  }
  return <AppShell title={tr('Uživatelé a přístupy','Users & access')} breadcrumbs={[{label:'Administration'},{label:'Users & Access'}]}>
    <section className="admin-members workspace-pad">
      <p className="workspace-subtitle">{tr('Skutečné členství, jednotky a přiřazené role vybraného cvičení.','Actual memberships, units and role assignments for the selected exercise.')}</p>
      <div className="member-toolbar">
        <label>{tr('Cvičení','Exercise')}<select value={currentEvent?.id??''} onChange={e=>selectEvent(e.target.value)}>{!currentEvent&&<option value="">{tr('Vyberte cvičení','Select exercise')}</option>}{events.map(e=><option key={e.id} value={e.id}>{e.name}</option>)}</select></label>
        <label>{tr('Hledat','Search')}<div className="member-search"><Search size={15}/><input value={query} onChange={e=>setQuery(e.target.value)} placeholder={tr('Jméno, e-mail, jednotka…','Name, email, unit…')}/></div></label>
        <button onClick={()=>setRefresh(x=>x+1)} className="btn btn-secondary"><RefreshCw size={15}/>{tr('Obnovit','Refresh')}</button>
      </div>
      {loading?<LoadingState/>:error?<ErrorState message={error} onRetry={()=>setRefresh(x=>x+1)}/>:!filtered.length?<EmptyState title={tr('Žádní uživatelé','No matching users')} description={tr('Vyberte cvičení nebo změňte vyhledávání.','Select an exercise or change the search.')}/>:<DataTable columns={columns} data={filtered} keyExtractor={m=>m.id}/>}
    </section>
    {target&&<div className="preview-dialog-backdrop" onClick={()=>{if(!busy)setTarget(null);}}><form className="preview-dialog" role="dialog" aria-modal="true" aria-labelledby="preview-title" onSubmit={startPreview} onClick={e=>e.stopPropagation()}>
       <Shield size={23}/><h2 id="preview-title">{tr('Náhled účastníka','Participant preview')}</h2>
       <strong>{target.user.displayName}</strong><p>{tr('Po dobu 15 minut použijete oprávnění tohoto účastníka v jediném cvičení. Změny a exporty jsou zakázané. Začátek a ukončení se zaznamenají do auditu.','For 15 minutes you will use this participant’s permissions in one exercise. Changes and exports are blocked. Start and exit are audited.')}</p>
       <label>{tr('Důvod náhledu','Reason for preview')}<textarea required minLength={3} maxLength={500} rows={3} value={reason} onChange={e=>setReason(e.target.value)}/></label>
       {previewError&&<p role="alert" className="error-text">{previewError}</p>}
       <div className="preview-dialog-actions"><button type="button" disabled={busy} onClick={()=>setTarget(null)}>{tr('Zrušit','Cancel')}</button><button type="submit" disabled={busy||reason.trim().length<3} className="btn btn-primary"><Eye size={16}/>{busy?'…':tr('Spustit náhled','Start preview')}</button></div>
    </form></div>}
  </AppShell>;
}
