'use client';

import {useEffect,useMemo,useState} from 'react';
import {KeyRound,RefreshCw,Search,Shield,ShieldOff} from 'lucide-react';
import type {RoleResponse} from '@cyris/contracts';
import {AppShell} from '@/components/layout/AppShell';
import {useEvent} from '@/contexts/EventContext';
import {usePreferences} from '@/contexts/PreferencesContext';
import {apiClient} from '@/lib/api-client';
import {EmptyState,ErrorState,LoadingState} from '@/components/common/StateViews';
import {rolePermissionKeys,roleScopes} from '@/lib/role-catalog';
import styles from './roles.module.css';

export default function AdminRolesPage(){
  const {currentEvent,events,selectEvent,loadingEvents}=useEvent();
  const {locale}=usePreferences();
  const cs=locale==='cs',tr=(cz:string,en:string)=>cs?cz:en;
  const [roles,setRoles]=useState<RoleResponse[]>([]);
  const [loadedEvent,setLoadedEvent]=useState('');
  const [loading,setLoading]=useState(false);
  const [error,setError]=useState('');
  const [query,setQuery]=useState('');
  const [revision,setRevision]=useState(0);

  useEffect(()=>{
    let alive=true;
    setRoles([]);setLoadedEvent('');setError('');
    if(!currentEvent?.id){setLoading(false);return;}
    const eventId=currentEvent.id;
    setLoading(true);
    void apiClient.getRoles(eventId).then(result=>{
      if(!alive)return;
      if(!result.ok||!Array.isArray(result.data)){
        setError(result.error||'Unable to retrieve roles');return;
      }
      setRoles(result.data as RoleResponse[]);
      setLoadedEvent(eventId);
    }).catch(err=>{if(alive)setError(err instanceof Error?err.message:String(err))})
      .finally(()=>{if(alive)setLoading(false)});
    return ()=>{alive=false};
  },[currentEvent?.id,revision]);

  const records=loadedEvent===currentEvent?.id?roles:[];
  const matching=useMemo(()=>{
    const text=query.trim().toLocaleLowerCase();
    if(!text)return records;
    return records.filter(r=>[r.name,r.slug,r.description??'',...rolePermissionKeys(r.permissions),...roleScopes(r.permissions)]
      .some(part=>part.toLocaleLowerCase().includes(text)));
  },[records,query]);

  return <AppShell title={tr('Role a oprávnění','Roles and permissions')}
    breadcrumbs={[{label:tr('Administrace','Administration'),href:'/admin'},{label:tr('Role a oprávnění','Roles and permissions')}]}>
    <div className={styles.page}>
      <header className={styles.header}>
        <div className={styles.heading}>
          <KeyRound size={23} aria-hidden="true"/>
          <div>
            <h1>{tr('Role a oprávnění','Roles and permissions')}</h1>
            <p>{tr('Zobrazuje skutečně přidělená oprávnění a jejich rozsahy ve vybraném cvičení. Žádné oprávnění se nepředpokládá.','Shows actual permission grants and scopes in the selected exercise. No grant is inferred.')}</p>
          </div>
        </div>
        <div className={styles.toolbar}>
          <label>{tr('Cvičení','Exercise')}
            <select value={currentEvent?.id??''} onChange={e=>selectEvent(e.target.value)} disabled={loadingEvents||!events.length}>
              <option value="" disabled>{tr('Vyberte cvičení','Select an exercise')}</option>
              {events.map(event=><option value={event.id} key={event.id}>{event.name}</option>)}
            </select>
          </label>
          <button type="button" className="btn btn-secondary" disabled={!currentEvent?.id||loading}
            onClick={()=>setRevision(v=>v+1)}><RefreshCw size={15}/>{tr('Obnovit','Refresh')}</button>
        </div>
      </header>
      {currentEvent?.id&&<div className={styles.summary}>
        <div><span>{tr('Role','Roles')}</span><strong>{records.length}</strong></div>
        <div><span>{tr('Celkem přidělených oprávnění v katalogu','Catalog permission entries')}</span>
          <strong>{records.reduce((sum,r)=>sum+(r.permissions?.length??0),0)}</strong></div>
        <label><Search size={15} aria-hidden="true"/>
          <input value={query} maxLength={120} onChange={e=>setQuery(e.target.value)}
            placeholder={tr('Hledat roli, rozsah nebo oprávnění…','Search role, scope or permission…')}
            aria-label={tr('Hledat role','Search roles')}/>
        </label>
      </div>}
      {loadingEvents||loading?<LoadingState message={tr('Načítám katalog rolí…','Loading role catalog…')}/>:
        !currentEvent?<EmptyState icon={<Shield size={25}/>}
          title={tr('Vyberte cvičení','Select an exercise')}
          description={tr('Každé cvičení má vlastní role. Vyberte ho nahoře.','Each exercise has its own roles. Choose one above.')}/>:
        error?<ErrorState message={error} onRetry={()=>setRevision(v=>v+1)}/>:
        records.length===0?<EmptyState icon={<ShieldOff size={25}/>}
          title={tr('Žádné role','No roles registered')}
          description={tr('Pro toto cvičení dosud nebyly vytvořeny žádné role.','No roles have been created for this exercise.')}/>:
        matching.length===0?<EmptyState icon={<Search size={25}/>}
          title={tr('Žádná shoda','No matching roles')}
          description={tr('Změňte vyhledávaný výraz.','Try another search term.')}/>:
        <section className={styles.tableWrap} aria-label={tr('Katalog rolí','Role catalog')}>
          <table>
            <thead><tr>
              <th>{tr('Kód role','Role code')}</th>
              <th>{tr('Název a popis','Name and description')}</th>
              <th>{tr('Rozsah oprávnění','Permission scope')}</th>
              <th>{tr('Přidělená oprávnění','Granted permissions')}</th>
            </tr></thead>
            <tbody>{matching.map(role=>{
              const scopes=roleScopes(role.permissions);
              const permissions=rolePermissionKeys(role.permissions);
              return <tr key={role.id}>
                <td><code>{role.slug}</code></td>
                <td><strong>{role.name}</strong>{role.description&&<p>{role.description}</p>}</td>
                <td><div className={styles.scopes}>
                  {scopes.length?scopes.map(scope=><span className={styles.scope} key={scope}>{scope}</span>):
                    <span className={styles.emptyScope}>{tr('Bez přidělených oprávnění','No granted permissions')}</span>}
                </div></td>
                <td>{permissions.length===0?
                  <span className={styles.emptyScope}>{tr('Žádná oprávnění','No permissions')}</span>:
                  <details className={styles.details}>
                    <summary>{permissions.length} {tr('oprávnění','permissions')}</summary>
                    <ul>{role.permissions.map((grant,index)=><li key={grant.permissionKey+':'+grant.scope+':'+index}>
                      <code>{grant.permissionKey}</code><span>{grant.scope}</span>
                    </li>)}</ul>
                  </details>}
                </td>
              </tr>;
            })}</tbody>
          </table>
          <footer>{tr('Zobrazené role','Displayed roles')}: {matching.length} / {records.length}</footer>
        </section>}
    </div>
  </AppShell>;
}
