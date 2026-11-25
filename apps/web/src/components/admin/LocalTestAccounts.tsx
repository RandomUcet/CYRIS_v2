'use client';
import {useEffect,useRef,useState} from 'react';
import type {LocalTestAccount,LocalTestAccountCreated} from '@cyris/contracts';
import {apiClient} from '@/lib/api-client';
import {usePreferences} from '@/contexts/PreferencesContext';
type Choice={id:string;name:string};
export function LocalTestAccounts({eventId,eventName,onChanged}:{eventId:string;eventName:string;onChanged:()=>void}){
 const {locale}=usePreferences(),cs=locale==='cs',tr=(c:string,e:string)=>cs?c:e;
 const [rows,setRows]=useState<LocalTestAccount[]>([]),[roles,setRoles]=useState<Choice[]>([]),[units,setUnits]=useState<Choice[]>([]);
 const [name,setName]=useState(''),[roleId,setRoleId]=useState(''),[unitId,setUnitId]=useState(''),[hours,setHours]=useState(24);
 const [created,setCreated]=useState<LocalTestAccountCreated|null>(null),[busy,setBusy]=useState(false),[loading,setLoading]=useState(true),[error,setError]=useState(''),[reload,setReload]=useState(0);
 const alive=useRef(true),lock=useRef(false);
 useEffect(()=>{alive.current=true;return()=>{alive.current=false;};},[]);
 useEffect(()=>{
  const controller=new AbortController();setLoading(true);setError('');
  void (async()=>{try{
   const [r,u,a]=await Promise.all([apiClient.getRoles(eventId,controller.signal),apiClient.getUnits(eventId),apiClient.listLocalTestAccounts(eventId,controller.signal)]);
   if(controller.signal.aborted)return;
   if(!r.ok||!u.ok||!a.ok||!r.data||!u.data||!a.data)throw Error('Unable to load test accounts');
   setRoles(r.data.filter(v=>v.eventId===eventId).map(v=>({id:v.id,name:v.name})));
   setUnits(u.data.filter(v=>!v.archivedAt).map(v=>({id:v.id,name:v.name})));setRows(a.data);
  }catch{if(!controller.signal.aborted){setRows([]);setRoles([]);setUnits([]);setCreated(null);setError(tr('Testovací účty nejsou dostupné.','Test accounts unavailable.'));}}finally{if(!controller.signal.aborted)setLoading(false);}})();
  return()=>controller.abort();
 },[eventId,reload,cs]);
 async function create(){if(lock.current||loading||!name.trim()||!roleId||!unitId||created)return;lock.current=true;setBusy(true);setError('');
  try{const r=await apiClient.createLocalTestAccount(eventId,{displayName:name,roleId,unitId,validHours:hours});if(!alive.current)return;if(r.ok&&r.data){setCreated(r.data);setName('');setReload(v=>v+1);onChanged();}else setError(r.error||tr('Účet se nepodařilo vytvořit.','Account creation failed.'));}
  catch{if(alive.current)setError(tr('Účet se nepodařilo vytvořit.','Account creation failed.'));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 async function disable(row:LocalTestAccount){if(lock.current||!window.confirm(tr('Zablokovat testovací účet?','Disable test account?')+' '+row.displayName))return;lock.current=true;setBusy(true);setError('');
  try{const r=await apiClient.disableLocalTestAccount(eventId,row.id);if(!alive.current)return;if(r.ok){if(created?.id===row.id)setCreated(null);setReload(v=>v+1);onChanged();}else setError(r.error||tr('Zablokování selhalo.','Disable failed.'));}
  catch{if(alive.current)setError(tr('Zablokování selhalo.','Disable failed.'));}finally{lock.current=false;if(alive.current)setBusy(false);}
 }
 return <section className="preview-access"><h2>{tr('Individuální testovací účty','Individual test accounts')}</h2><p>{eventName} · {tr('Lokální přihlášení, samostatné heslo a časově omezený přístup. Vybraná role určuje skutečná oprávnění.','Local login, individual password and expiring access. Selected role determines actual permissions.')}</p>
 {error&&<p role="alert">{error}</p>}
 {created?<div role="status"><strong>{tr('Přihlašovací údaje – zobrazí se pouze nyní','Credentials – shown only now')}</strong><p>{created.email}</p><p><code style={{overflowWrap:'anywhere'}}>{created.password}</code></p><p>{tr('Platnost do','Expires at')}: {new Date(created.expiresAt).toLocaleString()}</p><button type="button" onClick={()=>setCreated(null)}>{tr('Údaje předány, skrýt','Credentials saved, hide')}</button></div>:<form onSubmit={e=>{e.preventDefault();void create();}} style={{display:'grid',gap:10,maxWidth:640}}>
 <label>{tr('Jméno testera','Tester name')}<input required minLength={3} maxLength={100} value={name} disabled={busy||loading} onChange={e=>setName(e.target.value)}/></label>
 <label>{tr('Role v cvičení','Exercise role')}<select required value={roleId} disabled={busy||loading} onChange={e=>setRoleId(e.target.value)}><option value="">—</option>{roles.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
 <label>{tr('Tým','Team')}<select required value={unitId} disabled={busy||loading} onChange={e=>setUnitId(e.target.value)}><option value="">—</option>{units.map(r=><option key={r.id} value={r.id}>{r.name}</option>)}</select></label>
 <label>{tr('Platnost (hodiny)','Lifetime (hours)')}<input required type="number" min={1} max={168} value={hours} disabled={busy||loading} onChange={e=>setHours(Number(e.target.value))}/></label>
 <button className="btn btn-primary" type="submit" disabled={busy||loading||!roleId||!unitId||name.trim().length<3}>{tr('Vytvořit lokální účet','Create local account')}</button>
 </form>}
 <h3>{tr('Vytvořené účty','Created accounts')}</h3>
 {loading?<p role="status">{tr('Načítám…','Loading…')}</p>:!rows.length?<p>{tr('Žádné testovací účty.','No test accounts.')}</p>:<ul style={{listStyle:'none',padding:0}}>{rows.map(row=><li key={row.id} style={{padding:'10px 0',borderBottom:'1px solid var(--border-subtle)'}}><strong>{row.displayName}</strong><div style={{overflowWrap:'anywhere'}}>{row.email} · {row.status} · {new Date(row.expiresAt).toLocaleString()}</div>{row.status==='ACTIVE'&&<button type="button" className="btn btn-secondary" disabled={busy} onClick={()=>void disable(row)}>{tr('Zablokovat','Disable')}</button>}</li>)}</ul>}
 </section>;
}
