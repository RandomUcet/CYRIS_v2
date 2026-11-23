'use client';

import React, {useCallback,useEffect,useId,useRef,useState} from 'react';
import {Bell,Check,CheckCheck,ExternalLink,RefreshCw,X} from 'lucide-react';
import {useAuth} from '@/contexts/AuthContext';
import {useEvent} from '@/contexts/EventContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import {apiClient} from '@/lib/api-client';
import type {NotificationItem,NotificationListResponse} from '@cyris/contracts';
import styles from './NotificationCenter.module.css';
import {safeNotificationHref} from '@/lib/notification-navigation';

export function NotificationCenter(){
  const {t,formatTime}=usePreferences();
  const {selectedEvent}=useEvent();
  const {viewAs}=useAuth();
  const hostRef=useRef<HTMLDivElement>(null);
  const triggerRef=useRef<HTMLButtonElement>(null);
  const requestRef=useRef(0);
  const currentEventRef=useRef(selectedEvent?.id);
  currentEventRef.current=selectedEvent?.id;
  const titleId=useId();
  const panelId=useId();
  const [open,setOpen]=useState(false);
  const [data,setData]=useState<NotificationListResponse>({unreadCount:0,newItems:[],earlierItems:[]});
  const [loading,setLoading]=useState(true);
  const [loadError,setLoadError]=useState(false);
  const [actionError,setActionError]=useState(false);
  const [pending,setPending]=useState<string|null>(null);

  const reload=useCallback(async()=>{
    const eventId=selectedEvent?.id;
    const request=++requestRef.current;
    try{
      const res=await apiClient.getNotifications(eventId);
      if(request!==requestRef.current || currentEventRef.current!==eventId)return;
      if(!res.ok || !res.data)throw new Error(res.error || 'Notification retrieval failed');
      setData(res.data);
      setLoadError(false);
    }catch{
      if(request===requestRef.current && currentEventRef.current===eventId)setLoadError(true);
    }finally{
      if(request===requestRef.current && currentEventRef.current===eventId)setLoading(false);
    }
  },[selectedEvent?.id]);

  useEffect(()=>{
    setData({unreadCount:0,newItems:[],earlierItems:[]});
    setLoading(true);
    setLoadError(false);
    setActionError(false);
    setPending(null);
    void reload();
    const timer=window.setInterval(()=>{void reload();},15000);
    return()=>{requestRef.current++;window.clearInterval(timer);};
  },[reload]);

  useEffect(()=>{
    if(!open)return;
    function onPointerDown(event:PointerEvent){
      if(hostRef.current && !hostRef.current.contains(event.target as Node))setOpen(false);
    }
    function onKeyDown(event:KeyboardEvent){
      if(event.key==='Escape'){setOpen(false);triggerRef.current?.focus();}
    }
    document.addEventListener('pointerdown',onPointerDown);
    document.addEventListener('keydown',onKeyDown);
    return()=>{
      document.removeEventListener('pointerdown',onPointerDown);
      document.removeEventListener('keydown',onKeyDown);
    };
  },[open]);

  const isReadOnly=Boolean(viewAs);
  const busy=pending!==null;

  async function mutate(key:string,request:()=>Promise<{ok:boolean;error?:string}>){
    if(busy||isReadOnly)return;
    setPending(key);setActionError(false);
    try{
      const result=await request();
      if(!result.ok)throw new Error(result.error||'Notification update failed');
      await reload();
    }catch{
      setActionError(true);
    }finally{
      setPending(null);
    }
  }

  function itemTitle(item:NotificationItem):string {
    const p=item.templateParams||{};
    const ref=p.taskNumber==null?'TASK':String(p.taskNumber);
    switch(item.templateKey){
      case 'task.assigned':return t('notification.taskAssigned',{taskNumber:ref});
      case 'briefing.new':return t('notification.briefingNew');
      case 'briefing.requiresAcknowledgement':return t('notification.briefingAck');
      case 'evidence.transfer':return t('notification.evidenceTransfer');
      case 'lab.ready':return t('notification.labReady');
      case 'medical.assignment':return t('notification.medicalAssign');
      case 'court.request.created':return t('notification.courtRequestCreated');
      case 'court.request.responded':return t('notification.courtRequestResponded');
      case 'command.defcon':return 'DEFCON '+String(p.level??'?');
      case 'exercise.broadcast':return typeof p.title==='string'?p.title:t('notification.title');
      default:return item.type.replace(/_/g,' ');
    }
  }

  function renderItem(item:NotificationItem,isNew:boolean){
    const p=item.templateParams||{};
    const detail=p.title??p.description;
    const detailText=typeof detail==='string'?detail:'';
    const href=safeNotificationHref(item.actionUrl);
    return <li key={item.id} className={isNew?styles.unreadItem:styles.item}>
      <div className={styles.itemTop}>
        <div className={styles.itemMeta}>
          <span className={styles.severity} data-severity={item.severity} aria-hidden="true"/>
          <time dateTime={item.createdAt}>{formatTime(item.createdAt)}</time>
        </div>
        {!isReadOnly&&<div className={styles.itemActions}>
          {isNew&&<button type="button" aria-label={t('action.markRead')}
            title={t('action.markRead')} disabled={busy}
            onClick={()=>void mutate(item.id,()=>apiClient.markNotificationRead(item.id))}>
            <Check size={15}/></button>}
          <button type="button" aria-label={t('action.dismiss')} title={t('action.dismiss')}
            disabled={busy} onClick={()=>void mutate(item.id,()=>apiClient.dismissNotification(item.id))}>
            <X size={15}/></button>
        </div>}
      </div>
      <p className={styles.itemTitle}>{itemTitle(item)}</p>
      {detailText&&<p className={styles.itemDetail}>{detailText}</p>}
      {href&&<a href={href} className={styles.actionLink} onClick={()=>setOpen(false)}>
        {t('action.open')} <ExternalLink size={12}/>
      </a>}
    </li>;
  }

  return <div className={styles.host} ref={hostRef}>
    <button ref={triggerRef} type="button" className={styles.trigger}
      aria-label={t('notification.openCenter')} title={t('notification.openCenter')}
      aria-expanded={open} aria-haspopup="dialog" aria-controls={open?panelId:undefined}
      onClick={()=>setOpen(v=>!v)}>
      <Bell size={16} aria-hidden="true"/>
      {data.unreadCount>0&&<span className={styles.counter} aria-label={String(data.unreadCount)}>
        {data.unreadCount>99?'99+':data.unreadCount}
      </span>}
    </button>
    {open&&<section id={panelId} className={styles.panel} role="dialog" aria-modal="false" aria-labelledby={titleId}>
      <header className={styles.header}>
        <h2 id={titleId}>{t('notification.title')}</h2>
        <div className={styles.headerActions}>
          {data.unreadCount>0&&!isReadOnly&&<button type="button" className={styles.markAll}
            disabled={busy||loading} onClick={()=>void mutate('all',()=>apiClient.markAllNotificationsRead(selectedEvent?.id))}>
            <CheckCheck size={15} aria-hidden="true"/>
            <span>{t('action.markAllRead')}</span>
          </button>}
          <button type="button" className={styles.iconButton} aria-label={t('state.retry')}
            title={t('state.retry')} disabled={loading||busy} onClick={()=>void reload()}>
            <RefreshCw size={15}/>
          </button>
          <button type="button" className={styles.iconButton} aria-label={t('notification.closeCenter')}
            title={t('notification.closeCenter')} onClick={()=>{setOpen(false);triggerRef.current?.focus();}}>
            <X size={16}/>
          </button>
        </div>
      </header>
      {loadError&&<div role="alert" className={styles.error}>
        {t('notification.loadError')}
        <button type="button" onClick={()=>void reload()}>{t('state.retry')}</button>
      </div>}
      {actionError&&<div role="alert" className={styles.error}>
        {t('notification.actionError')}
        <button type="button" onClick={()=>setActionError(false)} aria-label={t('action.dismiss')}>
          <X size={14}/>
        </button>
      </div>}
      <div className={styles.body} aria-busy={loading}>
        {loading&&data.newItems.length===0&&data.earlierItems.length===0
          ?<p className={styles.empty}>{t('state.loading')}</p>
          :data.newItems.length===0&&data.earlierItems.length===0
            ?<p className={styles.empty}>{t('notification.empty')}</p>
            :<>
              {data.newItems.length>0&&<section aria-label={t('notification.new')}>
                <h3 className={styles.sectionTitle}>{t('notification.new')} ({data.newItems.length})</h3>
                <ul className={styles.list}>{data.newItems.map(item=>renderItem(item,true))}</ul>
              </section>}
              {data.earlierItems.length>0&&<section aria-label={t('notification.earlier')}>
                <h3 className={styles.sectionTitle}>{t('notification.earlier')}</h3>
                <ul className={styles.list}>{data.earlierItems.map(item=>renderItem(item,false))}</ul>
              </section>}
            </>}
      </div>
    </section>}
  </div>;
}
