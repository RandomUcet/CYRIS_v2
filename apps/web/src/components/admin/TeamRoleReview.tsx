'use client';
import {useEffect,useState} from 'react';
import {apiClient} from '@/lib/api-client';
import type {TeamRoleReviewItem} from '@cyris/contracts';
export function TeamRoleReview({eventId,cs,onApplied}:{eventId:string;cs:boolean;onApplied:()=>void}){
 const tr=(cz:string,en:string)=>cs?cz:en;
 const [selected,setSelected]=useState<Record<string,string[]>>({}),[notice,setNotice]=useState(''),[assigning,setAssigning]=useState('');
 const [rows,setRows]=useState<TeamRoleReviewItem[]>([]),[loading,setLoading]=useState(true),[saving,setSaving]=useState(false),[error,setError]=useState(''),[revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;setRows([]);setSelected({});setError('');setLoading(true);
  void apiClient.getTeamRoleReview(eventId).then(r=>{if(!active)return;if(r.ok&&r.data)setRows(r.data);else setError(r.error||'HTTP');}).catch(e=>{if(active)setError(String(e));}).finally(()=>{if(active)setLoading(false);});
  return()=>{active=false;};
 },[eventId,revision]);
 async function initialize(){if(saving)return;setSaving(true);setError('');try{
   const r=await apiClient.initializeTeamTemplates(eventId);if(!r.ok)throw Error(r.error||'HTTP');setRevision(v=>v+1);onApplied();
 }catch(e){setError(e instanceof Error?e.message:String(e));}finally{setSaving(false);}}
 async function assign(row:TeamRoleReviewItem){
   const key=row.unitId+':'+row.roleSlug,ids=selected[key]??[];
   if(assigning||saving||loading||!row.primary||!row.rolePresent||row.missing.length||row.additional.length||!ids.length)return;
   setAssigning(key);setError('');setNotice('');
   try{
     const r=await apiClient.assignTeamOperatorProfile(eventId,{unitId:row.unitId,roleSlug:row.roleSlug,membershipIds:ids});
     if(!r.ok||!r.data)throw Error(r.error||'HTTP');
     setNotice(tr('Přiřazeno','Assigned')+': '+r.data.created+' · '+tr('Již přiřazeno','Already assigned')+': '+r.data.alreadyAssigned);
     setRevision(v=>v+1);onApplied();
   }catch(e){setError(e instanceof Error?e.message:String(e));}
   finally{setAssigning('');}
 }
 return <section className="card" style={{padding:16,display:'grid',gap:12}}>
   <div style={{display:'flex',gap:12,justifyContent:'space-between',flexWrap:'wrap',alignItems:'center'}}>
     <h2 style={{fontSize:16}}>{tr('Kontrola týmových profilů','Team role profile review')}</h2>
     <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
       <button className="btn btn-secondary" disabled={loading||saving||!!assigning} onClick={()=>setRevision(v=>v+1)}>{tr('Obnovit','Refresh')}</button>
       <button className="btn btn-primary" disabled={loading||saving||!!assigning||!!error||!rows.some(r=>!r.rolePresent)} onClick={initialize}>{saving?tr('Doplňuji…','Adding…'):tr('Doplnit chybějící šablony','Add missing templates')}</button>
     </div>
   </div>
   <p style={{fontSize:13,color:'var(--text-secondary)'}}>{tr('Porovnání šablon rolí a jejich přímého přiřazení k týmu. Nevypovídá o přístupu ke konkrétnímu záznamu. Doplňování vytvoří pouze chybějící role a týmy, nepřiděluje oprávnění uživatelům ani nemění vlastní role. Vedoucí role je volitelná. Standardní operátorský profil můžete přiřadit výslovně vybraným členům; stávající role zůstanou zachovány.','Compares role templates and direct unit assignments, not record-level access. Adding templates creates missing roles and teams only; it does not assign users or change custom roles. Lead roles are optional. Assign an exact standard operator profile to explicitly selected members; current roles stay intact.')}</p>
   {notice&&<p role="status">{notice}</p>}
   {loading?<p role="status">{tr('Načítám…','Loading…')}</p>:error?<p role="alert">{error}</p>:!rows.length?<p>{tr('Žádný standardní tým v tomto cvičení.','No canonical team in this exercise.')}</p>:
    <div style={{overflowX:'auto'}}><table style={{width:'100%',minWidth:660,textAlign:'left',fontSize:13,borderCollapse:'collapse'}}>
     <thead><tr>{[tr('Tým a profil','Team and profile'),tr('Šablona','Template'),tr('Přímé přiřazení v týmu','Unit-bound assignments'),tr('Odchylky oprávnění','Grant differences')].map(t=><th key={t} style={{padding:8}}>{t}</th>)}</tr></thead>
     <tbody>{rows.map(row=><tr key={row.unitId+':'+row.roleSlug} style={{borderTop:'1px solid var(--border-default)'}}>
       <td style={{padding:8}}><strong>{row.unitName}</strong><div>{row.roleName}</div></td>
       <td style={{padding:8}}>{row.rolePresent?tr('Existuje','Present'):tr('Chybí','Missing')}</td>
       <td style={{padding:8}}>{row.unitBoundCount} / {row.memberCount}
         {row.primary&&row.rolePresent&&!row.missing.length&&!row.additional.length&&row.eligibleMembers.length>0&&<details style={{marginTop:8}}>
           <summary>{tr('Přiřadit standardní profil','Assign standard profile')}</summary>
           <fieldset disabled={!!assigning||saving} style={{border:0,padding:0,margin:'8px 0',display:'grid',gap:6,maxHeight:210,overflow:'auto'}}>
             <legend>{tr('Vyberte členy (max. 100)','Select members (max 100)')}</legend>
             {row.eligibleMembers.map(m=>{
               const key=row.unitId+':'+row.roleSlug,ids=selected[key]??[],checked=ids.includes(m.membershipId);
               return <label key={m.membershipId} style={{display:'flex',gap:6,alignItems:'center'}}>
                 <input type="checkbox" checked={checked} disabled={!checked&&ids.length>=100} onChange={e=>{const value=e.target.checked;setSelected(old=>{const before=old[key]??[];return {...old,[key]:value?[...before,m.membershipId]:before.filter(id=>id!==m.membershipId)};});}}/>{m.displayName}
               </label>;
             })}
           </fieldset>
           <button type="button" className="btn btn-primary" disabled={!!assigning||saving||!(selected[row.unitId+':'+row.roleSlug]?.length)} onClick={()=>void assign(row)}>
             {tr('Přiřadit vybraným','Assign to selected')} ({selected[row.unitId+':'+row.roleSlug]?.length??0})
           </button>
         </details>}
       </td>
       <td style={{padding:8}}>{row.missing.length||row.additional.length?<details><summary>{tr('Chybí','Missing')} {row.missing.length} · {tr('Navíc','Additional')} {row.additional.length}</summary>
         {row.missing.map(g=><div key={'missing:'+g}>− {g}</div>)}{row.additional.map(g=><div key={'extra:'+g}>+ {g}</div>)}
       </details>:tr('Shoda šablony','Template matches')}</td>
     </tr>)}</tbody>
    </table></div>}
 </section>;
}
