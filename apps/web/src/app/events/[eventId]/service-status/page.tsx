'use client';
import Link from 'next/link';
import {useParams} from 'next/navigation';
import {Activity,CalendarClock,History,RefreshCw,ShieldAlert} from 'lucide-react';
import {AppShell} from '@/components/layout/AppShell';
import {LoadingState,ErrorState} from '@/components/common/StateViews';
import {usePreferences} from '@/contexts/PreferencesContext';
import {useAuth} from '@/contexts/AuthContext';
import {useServiceStatus} from '@/hooks/useServiceStatus';
import type {ServiceStatusItem} from '@cyris/contracts';

export default function ServiceStatusPage(){
  const {eventId}=useParams<{eventId:string}>();
  const {locale,t,formatTime,formatDate}=usePreferences();
  const {hasPermission,isPlatformAdmin}=useAuth();
  const {data,error,refresh}=useServiceStatus(eventId);
  const cs=locale==='cs',tr=(cz:string,en:string)=>cs?cz:en;
  const canManage=isPlatformAdmin||hasPermission('scenario.manage',eventId);
  const canRecover=isPlatformAdmin||hasPermission('task.read',eventId);
  function renderItems(items:ServiceStatusItem[],empty:string){
    return items.length?<div className="service-rows">{items.map((item,i)=><article className="service-row" key={item.service+'-'+item.revision+'-'+i}>
      <div><strong>{tr('Úkolový modul','Task module')}</strong><small>{item.startsAt?formatDate(item.startsAt)+' · '+formatTime(item.startsAt):'—'}{item.expiresAt?' → '+formatDate(item.expiresAt)+' · '+formatTime(item.expiresAt):''}</small>{item.reason&&<p>{item.reason}</p>}</div>
      <span className="member-tag">{t('serviceStatus.state.'+item.state.toLowerCase())}</span>
      <span>{t('serviceStatus.impact.'+item.impact.toLowerCase())}</span>
    </article>)}</div>:<p className="service-empty">{empty}</p>;
  }
  return <AppShell title={tr('Stav služeb','Service status')} breadcrumbs={[{label:'Exercise support'},{label:'Service status'}]} actions={<button className="btn btn-secondary" onClick={refresh}><RefreshCw size={15}/>{tr('Obnovit','Refresh')}</button>}>
    <div className="service-page">
      <div className="service-intro"><Activity size={22}/><div><h2>{tr('Provozní stav cvičení','Exercise operational status')}</h2><p>{tr('Tento přehled zobrazuje pouze simulovaná omezení ve cvičení. Nejde o monitoring skutečné dostupnosti serverů ani o úroveň DEFCON.','This page reports simulated exercise restrictions, not infrastructure health or DEFCON readiness.')}</p></div></div>
      {error&&<ErrorState message={error} onRetry={refresh}/>}
      {!data&&!error&&<LoadingState/>}
      {data&&<>
      <section className="service-current">
        <div><small>{data.scope==='EVENT'?tr('Nejzávažnější omezení ve cvičení','Worst restriction across exercise'):tr('Vliv na vaše pracovní prostředí','Impact on your workspace')}</small><h2>{tr('Úkolový modul','Task module')}</h2>
        <span className={'service-pill '+(error?'unknown':data.current.activeCount?'restricted':'normal')}>{error?tr('Poslední známý stav','Last known status'):t('serviceStatus.impact.'+data.current.impact.toLowerCase())}</span>
        <p>{error?tr('Aktuální stav nelze ověřit.','Unable to verify current status.'):data.current.activeCount?tr('Platné simulované omezení.','An exercise restriction is active.'):tr('Žádná aktivní simulovaná omezení.','No active simulated restrictions.')}</p></div>
        <div className="service-count"><strong>{data.current.activeCount}</strong><span>{tr('Aktivní','Active')}</span></div>
        <div className="service-count"><strong>{data.current.plannedCount}</strong><span>{tr('Plánované','Scheduled')}</span></div>
      </section>
      <p className="workspace-subtitle">{tr('Poslední načtení: ','Last update: ')}{formatDate(data.generatedAt)} · {formatTime(data.generatedAt)} · {tr('obnova každých 15 s','refresh every 15 s')}</p>
      <section className="service-section"><h2><ShieldAlert size={17}/>{tr('Aktivní omezení','Active restrictions')}</h2>{renderItems(data.items.filter(x=>x.state==='ACTIVE'),tr('Žádná aktivní omezení.','No active restrictions.'))}
      {data.current.activeCount>0&&canRecover&&<Link className="btn btn-secondary" href={`/events/${eventId}/tasks/disruption`}>{tr('Obnova práce a podklady','Recovery workspace')}</Link>}
      {canManage&&<Link className="btn btn-secondary" href={`/events/${eventId}/command`}>{tr('Řízení omezení cvičení','Manage exercise restrictions')}</Link>}</section>
      <section className="service-section"><h2><CalendarClock size={17}/>{tr('Plánované odstávky','Planned restrictions')}</h2>{renderItems(data.items.filter(x=>x.state==='PLANNED'),tr('Žádná plánovaná omezení.','No scheduled restrictions.'))}</section>
      <section className="service-section"><h2><History size={17}/>{tr('Historie','History')}</h2>{renderItems(data.items.filter(x=>x.state==='RESTORED'||x.state==='EXPIRED'),tr('Historie je prázdná.','No previous restrictions.'))}</section>
      </>}
    </div>
  </AppShell>;
}
