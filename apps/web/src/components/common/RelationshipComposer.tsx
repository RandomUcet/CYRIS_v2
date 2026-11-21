'use client';
import {useEffect,useState,type FormEvent} from 'react';
import {Plus,Link2,Search,ArrowRight} from 'lucide-react';
import type {SearchResultItem} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
import {useAuth} from '@/contexts/AuthContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import styles from './RelationshipComposer.module.css';

const types=[
  ['RELATED_TO','Souvisí s','Related to'],
  ['EMPLOYED_BY','Je zaměstnán u','Employed by'],
  ['OWNS','Vlastní','Owns'],
  ['LOCATED_AT','Nachází se na','Located at'],
  ['COMMUNICATED_WITH','Komunikoval s','Communicated with'],
  ['ASSOCIATED_WITH','Je spojen s','Associated with'],
] as const;

function SearchPicker({eventId,cs,label,value,onChange}:{
  eventId:string;cs:boolean;label:string;value:SearchResultItem|null;
  onChange:(item:SearchResultItem|null)=>void;
}){
  const [query,setQuery]=useState('');
  const [items,setItems]=useState<SearchResultItem[]>([]);
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  useEffect(()=>{setQuery('');setItems([]);setError('');onChange(null);},[eventId]);
  useEffect(()=>{
    // Never offer stale results from a previous search term.
    setItems([]);
    if(value||query.trim().length<2){setPending(false);return;}
    let active=true;const timer=window.setTimeout(()=>{
      setPending(true);
      void apiClient.searchRegistryRecords(eventId,query.trim()).then(result=>{
        if(!active)return;
        if(result.ok&&result.data){
          // Registry responses contain only records readable in this exercise.
          setItems(result.data.filter(r=>r.eventId===eventId).map(record=>({
            id:record.entityType+':'+record.id, canonicalId:record.id,
            title:record.label, subtitle:record.identifier??undefined,
            type:record.entityType,eventId,highlights:[],tags:[],
          })));
          setError('');
        }else {setItems([]);setError(result.error||'Search unavailable');}
      }).catch(e=>{if(active){setItems([]);setError(String(e));}})
        .finally(()=>{if(active)setPending(false)});
    },270);
    return ()=>{active=false;window.clearTimeout(timer);};
  },[query,eventId,value?.canonicalId]);
  return <div className={styles.picker}>
    <label>{label}<div className={styles.search}>
      <Search size={15} aria-hidden="true"/>
      <input value={value?value.title:query}
        onChange={event=>{if(value)onChange(null);setQuery(event.target.value);}}
        aria-label={label}
        placeholder={cs?'Zadejte alespoň 2 znaky…':'Enter at least 2 characters…'}
        maxLength={80}/>
    </div></label>
    {value?<div className={styles.chosen}>
      <span><strong>{value.title}</strong><small>{value.type} · {value.subtitle||value.canonicalId.slice(0,8)}</small></span>
      <button type="button" onClick={()=>{onChange(null);setQuery('');}}>{cs?'Změnit':'Change'}</button>
    </div>:<>
      {pending&&<small role="status">{cs?'Hledám…':'Searching…'}</small>}
      {error&&<small role="alert" className={styles.error}>{error}</small>}
      {query.trim().length>=2&&!pending&&items.length===0&&!error&&<small>{cs?'Žádné odpovídající záznamy':'No matching records'}</small>}
      {items.length>0&&<div className={styles.suggestions} role="listbox" aria-label={label}>
        {items.map(item=><button type="button" role="option" aria-selected={false} key={item.id} onClick={()=>{onChange(item);setQuery(item.title);setItems([]);}}>
          <span>{item.title}</span><small>{item.type} · {item.subtitle||item.canonicalId.slice(0,8)}</small>
        </button>)}
      </div>}
    </>}
  </div>;
}
export function RelationshipComposer({eventId,onCreated}:{eventId:string;onCreated:()=>void}){
  const {isPlatformAdmin,hasPermission,viewAs}=useAuth();
  const {locale}=usePreferences();
  const cs=locale==='cs',tr=(cz:string,en:string)=>cs?cz:en;
  const [open,setOpen]=useState(false);
  const [source,setSource]=useState<SearchResultItem|null>(null);
  const [target,setTarget]=useState<SearchResultItem|null>(null);
  const [type,setType]=useState('RELATED_TO');
  const [pending,setPending]=useState(false);
  const [error,setError]=useState('');
  const [message,setMessage]=useState('');
  useEffect(()=>{setOpen(false);setSource(null);setTarget(null);setType('RELATED_TO');setError('');setMessage('');},[eventId]);
  const canCreate=!viewAs&&(isPlatformAdmin||hasPermission('registry.relationship.manage',eventId));
  async function submit(e:FormEvent){
    e.preventDefault();
    if(!canCreate||!source||!target||source.canonicalId===target.canonicalId||pending)return;
    setPending(true);setError('');setMessage('');
    try{
      const result=await apiClient.createRelationship(source.canonicalId,{
        targetResourceId:target.canonicalId,relationshipType:type,
      });
      if(!result.ok)throw new Error(result.error||'Unable to create link');
      setOpen(false);setSource(null);setTarget(null);setType('RELATED_TO');
      setMessage(tr('Vazba byla vytvořena.','Relationship created.'));
      onCreated();
    }catch(e){setError(e instanceof Error?e.message:String(e))}
    finally{setPending(false)}
  }
  if(!canCreate)return null;
  return <section className={styles.composer}>
    <div className={styles.head}>
      <div><strong><Link2 size={16}/>{tr('Propojení záznamů','Connect records')}</strong>
        <p>{tr('Vytvářejte vazby mezi záznamy, ke kterým máte právo přístupu.','Create relationships between records that you are authorized to access.')}</p>
      </div>
      <button type="button" className="btn btn-secondary" onClick={()=>{setOpen(v=>!v);setError('');}} aria-expanded={open}>
        <Plus size={14}/>{open?tr('Zavřít','Close'):tr('Nová vazba','New relationship')}
      </button>
    </div>
    {message&&<p role="status" className={styles.message}>{message}</p>}
    {open&&<form onSubmit={e=>void submit(e)} className={styles.form}>
      <div className={styles.row}>
        <SearchPicker eventId={eventId} cs={cs} label={tr('Zdrojový záznam','Source record')} value={source} onChange={setSource}/>
        <ArrowRight size={20} className={styles.arrow} aria-hidden="true"/>
        <SearchPicker eventId={eventId} cs={cs} label={tr('Cílový záznam','Target record')} value={target} onChange={setTarget}/>
      </div>
      <label className={styles.type}>{tr('Typ vazby','Relationship type')}
        <select value={type} onChange={e=>setType(e.target.value)}>
          {types.map(([value,cz,en])=><option key={value} value={value}>{cs?cz:en}</option>)}
        </select>
      </label>
      {source&&target&&source.canonicalId===target.canonicalId&&<p role="alert" className={styles.error}>{tr('Záznam nelze propojit se sebou samým.','A record cannot be linked to itself.')}</p>}
      {error&&<p role="alert" className={styles.error}>{error}</p>}
      <div className={styles.actions}>
        <button type="button" className="btn btn-ghost" disabled={pending} onClick={()=>setOpen(false)}>{tr('Zrušit','Cancel')}</button>
        <button type="submit" className="btn btn-primary" disabled={pending||!source||!target||source.canonicalId===target.canonicalId}>{pending?tr('Vytvářím…','Creating…'):tr('Vytvořit vazbu','Create relationship')}</button>
      </div>
    </form>}
  </section>;
}
