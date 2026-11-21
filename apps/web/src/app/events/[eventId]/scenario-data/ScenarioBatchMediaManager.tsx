'use client';

import {useEffect,useState} from 'react';
import Link from 'next/link';
import type {ScenarioBatchMediaList,ScenarioDataBatchResponse} from '@cyris/contracts';
import {useAuth} from '@/contexts/AuthContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import {apiClient} from '@/lib/api-client';
import styles from './ScenarioBatchMediaManager.module.css';

type Kind=ScenarioBatchMediaList['kind'];
const kinds:Kind[]=['persons','organisations','locations','vehicles','devices','weapons'];
const names:Record<Kind,readonly [string,string]>={
  persons:['Osoby','Persons'],organisations:['Organizace','Organisations'],
  locations:['Místa','Locations'],vehicles:['Vozidla','Vehicles'],
  devices:['Zařízení','Devices'],weapons:['Rekvizity / zbraně','Props / weapons'],
};
const allowed=new Set(['image/jpeg','image/png','image/webp','image/gif']);
const maxBytes=5*1024*1024;
function asBase64(file:File):Promise<string>{
  return new Promise((resolve,reject)=>{
    const reader=new FileReader();
    reader.onerror=()=>reject(new Error('Cannot read image'));
    reader.onload=()=>{
      const result=reader.result;
      if(typeof result!=='string'||!result.startsWith('data:')||!result.includes(',')){
        reject(new Error('Invalid image data')); return;
      }
      resolve(result.slice(result.indexOf(',')+1));
    };
    reader.readAsDataURL(file);
  });
}

export function ScenarioBatchMediaManager({eventId,batch}:{eventId:string;batch:ScenarioDataBatchResponse}){
  const {hasPermission,isPlatformAdmin,viewAs}=useAuth();
  const {locale}=usePreferences();
  const cs=locale==='cs',tr=(cz:string,en:string)=>cs?cz:en;
  const canUpload=!viewAs&&(isPlatformAdmin||hasPermission('registry.update',eventId));
  const canRead=isPlatformAdmin||hasPermission('registry.read',eventId);
  const [kind,setKind]=useState<Kind>('persons');
  const [page,setPage]=useState(1);
  const [loaded,setLoaded]=useState<ScenarioBatchMediaList|null>(null);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState('');
  const [notice,setNotice]=useState('');
  const [pending,setPending]=useState<string|null>(null);
  const [revision,setRevision]=useState(0);
  const [imageVersion,setImageVersion]=useState(0);
  useEffect(()=>{setPage(1);},[eventId,batch.id,kind]);
  useEffect(()=>{
    let live=true;
    setLoaded(null);setLoading(true);setError('');setNotice('');
    void apiClient.getScenarioBatchRecords(eventId,batch.id,kind,page).then(response=>{
      if(!live)return;
      if(response.ok&&response.data)setLoaded(response.data);
      else setError(response.error||'Unable to load records');
    }).catch(cause=>{if(live)setError(cause instanceof Error?cause.message:String(cause))})
      .finally(()=>{if(live)setLoading(false)});
    return ()=>{live=false};
  },[eventId,batch.id,kind,page,revision]);

  async function upload(resourceId:string,file:File){
    if(!canUpload||pending)return;
    setError('');setNotice('');
    if(!allowed.has(file.type)){
      setError(tr('Povoleny jsou pouze obrázky JPEG, PNG, WebP a GIF.','Only JPEG, PNG, WebP and GIF images are supported.'));return;
    }
    if(file.size===0||file.size>maxBytes){
      setError(tr('Obrázek musí mít maximálně 5 MB.','Image must be 5 MB or smaller.'));return;
    }
    setPending(resourceId);
    try{
      const data=await asBase64(file);
      const result=await apiClient.uploadRegistryPrimaryMedia(eventId,resourceId,{filename:file.name,mimeType:file.type,data});
      if(!result.ok)throw new Error(result.error||'Upload rejected');
      setLoaded(current=>current?{...current,records:current.records.map(row=>row.id===resourceId?{...row,hasImage:true}:row)}:current);
      setImageVersion(n=>n+1);
      setNotice(tr('Obrázek byl uložen k záznamu.','Image saved to record.'));
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setPending(null)}
  }
  async function remove(resourceId:string){
    if(!canUpload||pending)return;
    if(!window.confirm(tr('Opravdu odstranit fotografii tohoto záznamu?','Remove this record image?')))return;
    setPending(resourceId);setError('');setNotice('');
    try{
      const result=await apiClient.removeRegistryPrimaryMedia(eventId,resourceId);
      if(!result.ok)throw new Error(result.error||'Removal rejected');
      setLoaded(current=>current?{...current,records:current.records.map(row=>row.id===resourceId?{...row,hasImage:false}:row)}:current);
      setNotice(tr('Obrázek byl odstraněn.','Image removed.'));
    }catch(cause){setError(cause instanceof Error?cause.message:String(cause))}
    finally{setPending(null)}
  }

  return <section className={styles.manager} aria-label={tr('Obrázky vygenerovaných záznamů','Generated record images')}>
    <header className={styles.header}>
      <div><h3>{tr('Obrázky k údajům scénáře','Images for scenario records')}</h3>
        <p>{batch.identifier} · {tr('Po zveřejnění můžete jednotlivým záznamům přiřadit vlastní obrázky. Jsou uloženy u záznamů v registru, nikoliv jako součást modelového promptu.','Assign images to individual published records. Files are stored with registry records, not sent to the AI prompt.')}</p>
      </div>
      <button type="button" onClick={()=>setRevision(v=>v+1)} disabled={loading||Boolean(pending)}>{tr('Obnovit','Refresh')}</button>
    </header>
    {!canUpload&&<p className={styles.notice} role="status">{tr('K nahrání obrázků potřebujete oprávnění upravovat registr.','Registry edit permission is required to upload images.')}</p>}
    <label className={styles.selector}>{tr('Typ záznamu','Record type')}
      <select value={kind} onChange={e=>setKind(e.target.value as Kind)}>{kinds.map(value=>
        <option key={value} value={value}>{names[value][cs?0:1]}</option>)}</select>
    </label>
    {error&&<p className={styles.error} role="alert">{error}</p>}
    {notice&&<p className={styles.notice} role="status">{notice}</p>}
    {loading?<p>{tr('Načítám záznamy…','Loading records…')}</p>:loaded&&<>
      {loaded.records.length===0?<p>{tr('Tato dávka neobsahuje záznamy vybraného typu.','This batch has no records of the selected type.')}</p>:
      <div className={styles.records}>{loaded.records.map(record=><article className={styles.record} key={record.id}>
        <div className={styles.thumbnail}>
          {record.hasImage&&canRead?<img src={apiClient.getRegistryPrimaryMediaUrl(eventId,record.id)+'?v='+imageVersion} alt={record.label} loading="lazy"/>:<span aria-hidden="true">▧</span>}
        </div>
        <div className={styles.recordText}><strong>{record.label}</strong>
          <small>{record.identifier??record.id.slice(0,8)}</small>
          <Link href={`/events/${eventId}/registry/${kind}/${record.id}`}>{tr('Otevřít v registru','Open in registry')}</Link>
        </div>
        <div className={styles.actions}>
          <span>{record.hasImage?tr('Obrázek připojen','Image attached'):tr('Bez obrázku','No image')}</span>
          {canUpload&&<label className={styles.fileButton}>{pending===record.id?'…':record.hasImage?tr('Nahradit','Replace'):tr('Nahrát obrázek','Upload image')}
            <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" disabled={Boolean(pending)}
              onChange={e=>{const file=e.currentTarget.files?.[0];e.currentTarget.value='';if(file)void upload(record.id,file);}}/></label>}
          {canUpload&&record.hasImage&&<button type="button" disabled={Boolean(pending)} onClick={()=>void remove(record.id)}>{tr('Odstranit','Remove')}</button>}
        </div>
      </article>)}</div>}
      <nav className={styles.pagination} aria-label={tr('Stránkování záznamů','Record pagination')}>
        <button type="button" disabled={page<=1||loading||Boolean(pending)} onClick={()=>setPage(v=>Math.max(1,v-1))}>{tr('Předchozí','Previous')}</button>
        <span>{tr('Strana','Page')} {page}</span>
        <button type="button" disabled={!loaded.hasMore||loading||Boolean(pending)} onClick={()=>setPage(v=>v+1)}>{tr('Další','Next')}</button>
      </nav>
    </>}
  </section>;
}
